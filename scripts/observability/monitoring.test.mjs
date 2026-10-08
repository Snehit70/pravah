import {describe,test,expect} from 'bun:test';
import {openStore,parseExecution,executionMetric} from './store.mjs';
import {windowMetrics,windowCoverage,compareMetrics} from './report.mjs';
import {parseUsageSnapshot,storeUsageSnapshot,reconciliationReport,fetchCurrentUsage,BYTES_PER_PROVIDER_GB} from './reconcile.mjs';
const now=Date.now();
const event=(id,usage={databaseIoReadBytes:100,databaseIoWriteBytes:20}) => ({kind:'Completion',executionId:id,
  identifier:'tasks:read',timestamp:now/1000,executionTime:0.01,cachedResult:false,usageStats:usage});
const window={from:now-1000,to:now+1,function:null};
describe('monitoring completeness',() => {
  test('keeps real bytes and exposes unavailable auxiliary counts',() => {
    const store=openStore(':memory:');
    store.record(executionMetric(event('unknown'),'prod'),now);
    store.record(executionMetric(event('known',{databaseIoReadBytes:50,databaseIoWriteBytes:0,
      databaseReadDocuments:2,databaseWriteDocuments:0,databaseWriteIndexRows:0}),'prod'),now);
    const report=windowMetrics(store.db,'prod',window);
    expect(report.totals).toMatchObject({readBytes:150,writeBytes:20,readDocuments:2,unknownReadDocuments:1,
      unknownWriteDocuments:1,unknownWriteIndexRows:1});
    expect(store.db.query('SELECT readDocs,unknownReadDocs FROM hourly').get()).toEqual({readDocs:2,unknownReadDocs:1});
    store.close();
  });
  test('classifies parse failures, duplicates and excluded timestamps without inventing bytes',() => {
    const store=openStore(':memory:');
    expect(parseExecution(event('missing',{}),'prod').outcome).toBe('missing_byte_metrics');
    expect(parseExecution(event('negative',{databaseIoReadBytes:-1,databaseIoWriteBytes:0}),'prod').outcome).toBe('invalid_metric');
    expect(parseExecution({kind:'Progress'},'prod').outcome).toBe('non_completion');
    const metric=executionMetric(event('once'),'prod');
    expect(store.recordDetailed(metric,now)).toBe('accepted');
    expect(store.recordDetailed(metric,now)).toBe('duplicate');
    expect(store.recordDetailed({...metric,id:'old',timestamp:now-15*86400000},now)).toBe('expired');
    expect(store.recordDetailed({...metric,id:'future',timestamp:now+61000},now)).toBe('future_timestamp');
    store.recordOutcome('prod','invalid_json',now);
    expect(windowMetrics(store.db,'prod',window).captureOutcomes).toEqual(expect.arrayContaining([
      {outcome:'accepted',count:1},{outcome:'duplicate',count:1},{outcome:'expired',count:1},
      {outcome:'future_timestamp',count:1},{outcome:'invalid_json',count:1}]));
    expect(windowMetrics(store.db,'prod',window).totals.readBytes).toBe(100);
    store.close();
  });
  test('coverage uses all relevant sessions, clips gaps and avoids double counting overlaps',() => {
    const store=openStore(':memory:');
    for (let i=0;i<25;i++) store.db.query('INSERT INTO sessions(deployment,started,heartbeat,ended) VALUES(?,?,?,?)')
      .run('prod',i*10,i*10+8,i*10+8);
    store.db.query('INSERT INTO gaps VALUES(?,?,?,?)').run('prod',5,15,'transport');
    store.db.query('INSERT INTO gaps VALUES(?,?,?,?)').run('prod',10,12,'sleep');
    store.db.query('INSERT INTO gaps VALUES(?,?,?,?)').run('prod',1000,1100,'outside');
    const report=windowCoverage(store.db,'prod',{from:0,to:250},250);
    expect(report.sessions).toHaveLength(25);
    expect(report.possibleCaptureGaps.every(gap => gap.from>=0 && gap.to<=250)).toBe(true);
    expect(report.knownGapMs).toBe(58);
    expect(windowCoverage(store.db,'missing',{from:0,to:250},250).sessionCoverageFraction).toBe(0);
    store.close();
  });
  test('fresh active sessions cover a window after their last heartbeat',() => {
    const store=openStore(':memory:');
    store.db.query('INSERT INTO sessions(deployment,started,heartbeat) VALUES(?,?,?)').run('prod',now-60000,now-10000);
    expect(windowCoverage(store.db,'prod',{from:now-1000,to:now},now).knownGapMs).toBe(0);
    store.close();
  });
  test('hourly comparison separates invocation changes from per-miss costs and preserves release markers',() => {
    const store=openStore(':memory:');
    store.record(executionMetric(event('a'),'prod'),now);
    store.record(executionMetric({...event('b'),cachedResult:true,usageStats:{databaseIoReadBytes:0,databaseIoWriteBytes:0}},'prod'),now);
    store.markRelease('prod','a'.repeat(40),'backend 1.0',now);
    const report=windowMetrics(store.db,'prod',window);
    expect(report.hours[0]).toMatchObject({calls:2,cacheHits:1,cacheMisses:1,meanMissBytes:120});
    expect(report.releaseMarkers[0].sha).toBe('a'.repeat(40));
    const difference=compareMetrics(report,{...report,functions:[],missCosts:[]})[0];
    expect(difference).toMatchObject({beforeCalls:2,afterCalls:0,beforeMeanMissBytes:120,afterMeanMissBytes:null,percentChange:-100});
    store.close();
  });
});
describe('provider reconciliation',() => {
  const data=(seedStatus='complete') => ({seedStatus,metrics:{databaseIoGb:{unit:'GB',usage:{current_day:1,current_month:2}}}});
  test('uses UTC calendar boundaries and the provider binary GB unit',() => {
    const timestamp=Date.parse('2026-10-08T02:00:00Z');
    const rows=parseUsageSnapshot(data(),timestamp);
    expect(rows[0]).toMatchObject({fromTime:Date.parse('2026-10-08T00:00:00Z'),providerBytes:BYTES_PER_PROVIDER_GB});
    expect(rows[1].fromTime).toBe(Date.parse('2026-10-01T00:00:00Z'));
    expect(() => parseUsageSnapshot({metrics:{}},timestamp)).toThrow('Unrecognized');
  });
  test('partial provider totals never become trusted differences; retries replace the snapshot atomically',() => {
    const store=openStore(':memory:'); store.record(executionMetric(event('one'),'prod'),now);
    storeUsageSnapshot(store,'prod',data('partial'),now+1);
    expect(reconciliationReport(store.db,'prod',now+1)[0]).toMatchObject({status:'provider_incomplete',differenceBytes:null});
    storeUsageSnapshot(store,'prod',data(),now+1);
    expect(reconciliationReport(store.db,'prod',now+1)[0].differenceBytes).toBe(BYTES_PER_PROVIDER_GB-120);
    expect(store.db.query('SELECT COUNT(*) n FROM usageSnapshots').get().n).toBe(2);
    store.close();
  });
  test('uses retained hourly totals for a month beyond raw retention',() => {
    const store=openStore(':memory:');
    const timestamp=Date.parse('2026-10-30T02:00:00Z'),start=Date.parse('2026-10-01T01:00:00Z');
    store.record(executionMetric({...event('early'),timestamp:start/1000},'prod'),start);
    store.prune(timestamp);
    storeUsageSnapshot(store,'prod',data(),timestamp);
    const month=reconciliationReport(store.db,'prod',timestamp)[1];
    expect(month).toMatchObject({localBytes:120,rawRetentionCoversWindow:false});
    store.close();
  });
  test('fails closed on unavailable provider API and wrong deployment keys',async () => {
    const old=process.env.CONVEX_DEPLOY_KEY;
    try {
      process.env.CONVEX_DEPLOY_KEY='prod:wrong|test';
      await expect(fetchCurrentUsage(() => {throw Error('must not fetch');})).rejects.toThrow('canonical');
      process.env.CONVEX_DEPLOY_KEY='prod:combative-zebra-261|test';
      await expect(fetchCurrentUsage(async () => new Response('private',{status:403}))).rejects.toThrow('403');
    } finally {if(old===undefined) delete process.env.CONVEX_DEPLOY_KEY; else process.env.CONVEX_DEPLOY_KEY=old;}
  });
});

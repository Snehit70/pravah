import {describe,test,expect} from 'bun:test';
import {openStore} from './store.mjs';
import {persistLogBatch,pollLogBatch} from './capture.mjs';
import {storeUsageSnapshot,reconciliationReport,completedWindowReconciliation} from './reconcile.mjs';
const now=Date.now();
const entry=id=>({kind:'Completion',executionId:id,identifier:'tasks:test',timestamp:now/1000,executionTime:.01,
  identity:'PRIVATE',logLines:['PRIVATE'],usageStats:{databaseIoReadBytes:10,databaseIoWriteBytes:2}});

describe('durable log capture',()=>{
  test('replays all available entries rather than applying a 1000-entry slice',()=>{
    const s=openStore(':memory:');const entries=Array.from({length:1500},(_,i)=>entry(String(i)));
    expect(persistLogBatch(s,'prod',0,{entries,newCursor:100},now).accepted).toBe(1500);
    expect(s.db.query('SELECT COUNT(*) n FROM executions').get().n).toBe(1500);
    expect(s.db.query('SELECT cursor FROM logCheckpoints').get().cursor).toBe(100);
    expect(JSON.stringify(s.db.query('SELECT * FROM logBatches').all())).not.toContain('PRIVATE');s.close();
  });
  test('commits cursor and metrics atomically, preserving safe replay after a write failure',()=>{
    const s=openStore(':memory:');const record=s.recordDetailed;let calls=0;
    s.recordDetailed=(...args)=>{if(++calls===2)throw Error('disk failure');return record(...args);};
    const batch={entries:[entry('a'),entry('b')],newCursor:100};
    expect(()=>persistLogBatch(s,'prod',0,batch,now)).toThrow('disk failure');
    expect(s.db.query('SELECT COUNT(*) n FROM executions').get().n).toBe(0);
    expect(s.db.query('SELECT COUNT(*) n FROM logCheckpoints').get().n).toBe(0);
    expect(s.db.query('SELECT COUNT(*) n FROM hourly').get().n).toBe(0);
    s.recordDetailed=record;persistLogBatch(s,'prod',0,batch,now);
    expect(persistLogBatch(s,'prod',100,{...batch,newCursor:200},now+1).accepted).toBe(0);
    expect(s.db.query('SELECT SUM(read) bytes FROM hourly').get().bytes).toBe(20);s.close();
  });
  test('rejects backwards cursors and stale writers without deleting progress',()=>{
    const s=openStore(':memory:');persistLogBatch(s,'prod',0,{entries:[],newCursor:10},now);
    expect(()=>persistLogBatch(s,'prod',10,{entries:[],newCursor:9},now)).toThrow('cursor');
    expect(()=>persistLogBatch(s,'prod',0,{entries:[],newCursor:10},now)).toThrow('Stale');
    expect(s.db.query('SELECT cursor FROM logCheckpoints').get().cursor).toBe(10);s.close();
  });
  test('classifies missing metrics and preserves transport cancellation',async()=>{
    const s=openStore(':memory:');persistLogBatch(s,'prod',0,{entries:[{kind:'Completion',usageStats:{}}],newCursor:10},now);
    expect(s.db.query('SELECT outcome FROM captureOutcomes').get().outcome).toBe('missing_byte_metrics');s.close();
    const stop=new AbortController();let signal;
    const pending=pollLogBatch({url:'https://test',adminKey:'private'},0,stop.signal,async(_url,options)=>{
      signal=options.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
    });
    stop.abort();await expect(pending).rejects.toBeDefined();expect(signal.aborted).toBe(true);
  });
});

describe('reconciliation validity',()=>{
  const data=(day,month)=>({seedStatus:'complete',metrics:{databaseIoGb:{unit:'GB',usage:{current_day:day/2**30,current_month:month/2**30}}}});
  test('labels old UTC windows and stale snapshots without claiming a current difference',()=>{
    const s=openStore(':memory:'),at=Date.parse('2026-10-12T23:55:00Z');
    storeUsageSnapshot(s,'prod',data(20,100),at);
    expect(reconciliationReport(s.db,'prod',at+10*60000)[0]).toMatchObject({status:'previous_window',currentWindow:false,fresh:false,differenceBytes:null,observedDifferenceBytes:20});
    expect(reconciliationReport(s.db,'prod',at+60*60000)[1]).toMatchObject({status:'stale_snapshot',currentWindow:true,differenceBytes:null});s.close();
  });
  test('localizes completed-day discrepancies and keeps missing days as combined windows',()=>{
    const s=openStore(':memory:');
    storeUsageSnapshot(s,'prod',data(10,110),Date.parse('2026-10-08T10:00:00Z'));
    storeUsageSnapshot(s,'prod',data(20,150),Date.parse('2026-10-09T10:00:00Z'));
    storeUsageSnapshot(s,'prod',data(5,205),Date.parse('2026-10-11T10:00:00Z'));
    const rows=completedWindowReconciliation(s.db,'prod',Date.parse('2026-10-12T00:00:00Z'));
    expect(rows).toHaveLength(2);expect(rows[0].providerBytes).toBe(30);
    expect(rows[1].providerBytes).toBe(70);expect(rows[1].to-rows[1].from).toBe(2*86400000);
    storeUsageSnapshot(s,'prod',data(1,2),Date.parse('2026-11-01T10:00:00Z'));
    expect(completedWindowReconciliation(s.db,'prod',Date.parse('2026-11-01T11:00:00Z'))).toHaveLength(2);s.close();
  });
});

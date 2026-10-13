#!/usr/bin/env bun
import { openStore, defaultDatabasePath } from './store.mjs';
import { reportWindow, windowMetrics, windowCoverage, compareMetrics } from './report.mjs';
import {fetchCurrentUsage, storeUsageSnapshot, reconciliationReport, authorizeCanonicalDeployment, completedWindowReconciliation} from './reconcile.mjs';
import {pollLogBatch,persistLogBatch} from './capture.mjs';

const deployment = 'combative-zebra-261';
const store = openStore();
const command = process.argv[2] ?? 'report';
async function snapshotUsage(signal) {
  const started=Date.now();
  const data=await fetchCurrentUsage(fetch,signal);
  const timestamp=Date.now();
  if (new Date(started).toISOString().slice(0,10)!==new Date(timestamp).toISOString().slice(0,10)) throw new Error('Usage request crossed UTC midnight; retry');
  return storeUsageSnapshot(store,deployment,data,timestamp);
}

if (command === 'report' || command === 'compare') {
  const now=Date.now();
  const window = reportWindow(process.argv.slice(3),now);
  const metrics = windowMetrics(store.db, deployment, window);
  let comparison;
  if (command==='compare') {
    const previous={...window,from:window.from-(window.to-window.from),to:window.from};
    if (previous.from<now-14*86400000) throw new Error('Comparison exceeds raw retention; choose a shorter window');
    const before=windowMetrics(store.db,deployment,previous);
    comparison={previousWindow:previous,beforeTotals:before.totals,previousReleaseMarkers:before.releaseMarkers,
      previousCoverage:windowCoverage(store.db,deployment,previous,now),changes:compareMetrics(before,metrics),
      note:'Equal-duration observed windows; capture gaps and changes in activity can confound release attribution.'};
  }
  const coverage = windowCoverage(store.db,deployment,window);
  const latestSession = store.db.query('SELECT * FROM sessions WHERE deployment=? ORDER BY started DESC LIMIT 1').get(deployment);
  const newest = store.db.query('SELECT MAX(timestamp) latestEvent FROM executions WHERE deployment=?').get(deployment);
  console.log(JSON.stringify({ database: defaultDatabasePath(), deployment, window: {from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString(), function: window.function, endExclusive: true},
    invoiceComplete: false, collectorProcessFresh: Boolean(latestSession && !latestSession.ended && Date.now()-latestSession.heartbeat < 90000),
    ...newest, ...metrics, ...coverage, comparison, reconciliation: reconciliationReport(store.db,deployment),
    completedWindows: completedWindowReconciliation(store.db,deployment),
    logCheckpoint: store.db.query('SELECT cursor,lastPollAt,lastEventAt FROM logCheckpoints WHERE deployment=?').get(deployment),
    recentLogBatches: store.db.query('SELECT * FROM logBatches WHERE deployment=? ORDER BY receivedAt DESC LIMIT 10').all(deployment),
    latestReconciliationAttempt: store.db.query("SELECT timestamp,outcome FROM captureOutcomes WHERE deployment=? AND outcome IN ('reconciliation_success','reconciliation_failed') ORDER BY timestamp DESC LIMIT 1").get(deployment),
    captureOutcomeRecordingStartedAt: store.db.query('SELECT MIN(timestamp) timestamp FROM captureOutcomes WHERE deployment=?').get(deployment)?.timestamp ?? null,
    attributionNote: 'Caller describes the server invocation class, not a user, device, or reliably distinct client transport. Missing metadata is unknown. Request and parent execution IDs are retained locally; application identities and content are discarded.',
    captureNote: 'Session interruptions and machine sleep may lose events beyond provider log retention. Totals are not a monthly invoice or a function-call estimate.' }, null, 2));
  store.close();
} else if (command === 'collect') {
  let stopping = false; let session;
  const controller=new AbortController(); let failures = 0; let previousHeartbeat = Date.now();
  let pendingWriteFailures=0; let lastSnapshotAttempt=0; let snapshotInFlight;
  const attemptSnapshot = () => {
    if (snapshotInFlight || stopping || Date.now()-lastSnapshotAttempt<15*60000) return;
    lastSnapshotAttempt=Date.now();
    snapshotInFlight=snapshotUsage(controller.signal).then(() => {if(!stopping)store.recordOutcome(deployment,'reconciliation_success');})
      .catch(() => {if(!stopping)try {store.recordOutcome(deployment,'reconciliation_failed');} catch {pendingWriteFailures++;}})
      .finally(() => {snapshotInFlight=undefined;});
  };
  attemptSnapshot();
  const finishSession = () => { if (session) store.db.query('UPDATE sessions SET ended=?,heartbeat=? WHERE id=?').run(Date.now(),Date.now(),session); session = undefined; };
  const heartbeat = setInterval(() => {
    try {
      const now = Date.now();
      if (now-previousHeartbeat > 90000) store.db.query('INSERT INTO gaps VALUES(?,?,?,?)').run(deployment,previousHeartbeat,now,'heartbeat interruption or machine sleep');
      previousHeartbeat = now;
      if (session) store.db.query('UPDATE sessions SET heartbeat=? WHERE id=?').run(now,session);
      store.prune(); attemptSnapshot();
    } catch {pendingWriteFailures++; console.error('SQLite heartbeat write failed; capture health is uncertain.');}
  }, 30000);
  const stop = () => { stopping = true; controller.abort(); clearInterval(heartbeat); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  let credentials;
  let failedSince;
  const wait=ms=>new Promise(resolve=>{
    const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve();};
    const timer=setTimeout(done,ms);controller.signal.addEventListener('abort',done,{once:true});
    if(stopping)done();
  });
  while (!stopping) {
    let recording=false;
    try {
      if(!session) {
        store.db.query('UPDATE sessions SET ended=heartbeat WHERE deployment=? AND ended IS NULL').run(deployment);
        const now=Date.now();
        session=store.db.query('INSERT INTO sessions(deployment,started,heartbeat) VALUES(?,?,?)').run(deployment,now,now).lastInsertRowid;
      }
      credentials ??= await authorizeCanonicalDeployment(fetch,controller.signal);
      if(stopping)break;
      const cursor=store.db.query('SELECT cursor FROM logCheckpoints WHERE deployment=?').get(deployment)?.cursor??0;
      const batch=await pollLogBatch(credentials,cursor,controller.signal);
      if(stopping)break;
      recording=true;
      if(pendingWriteFailures){store.recordOutcome(deployment,'sqlite_write_failure',Date.now(),pendingWriteFailures);pendingWriteFailures=0;}
      persistLogBatch(store,deployment,cursor,batch);
      if(failedSince!==undefined){store.db.query('INSERT INTO gaps VALUES(?,?,?,?)').run(deployment,failedSince,Date.now(),'log transport or persistence interruption');failedSince=undefined;}
      failures=0;
      if(!batch.entries.length)await wait(1000);
    } catch (error) {
      if(stopping)break;
      failedSince ??= Date.now();
      if(recording)pendingWriteFailures++;
      else {try {store.recordOutcome(deployment,'log_stream_failure');}catch{pendingWriteFailures++;}}
      try {finishSession();}catch{pendingWriteFailures++;session=undefined;}
      credentials=undefined;
      const reason=recording?'SQLite write':error?.name==='TimeoutError'?'request timeout':
        /^Log stream unavailable \(\d{3}\)$/.test(error?.message??'')?error.message:'transport';
      console.error(`Metrics capture interrupted (${reason}); retrying from the persisted cursor.`);
      await wait(Math.min(30000,1000*2**Math.min(failures++,5)));
    }
  }
  try {finishSession();}catch{pendingWriteFailures++;}
  await snapshotInFlight;
  if (pendingWriteFailures) {try {store.recordOutcome(deployment,'sqlite_write_failure',Date.now(),pendingWriteFailures);} catch {console.error('Unpersisted SQLite failures remain.');}}
  store.close();
} else if (command === 'reconcile') {
  try {await snapshotUsage(); store.recordOutcome(deployment,'reconciliation_success'); console.log(JSON.stringify(reconciliationReport(store.db,deployment),null,2));}
  catch (error) {store.recordOutcome(deployment,'reconciliation_failed'); throw error;}
  finally {store.close();}
} else if (command === 'mark-release') {
  try {store.markRelease(deployment,process.argv[3],process.argv[4]); console.log('Release marker recorded.');} finally {store.close();}
} else { store.close(); throw new Error('Use collect, report, compare, reconcile or mark-release'); }

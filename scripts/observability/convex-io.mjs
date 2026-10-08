#!/usr/bin/env bun
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseExecution, openStore, defaultDatabasePath } from './store.mjs';
import { jsonlLines } from './jsonl.mjs';
import { reportWindow, windowMetrics, windowCoverage, compareMetrics } from './report.mjs';
import {fetchCurrentUsage, storeUsageSnapshot, reconciliationReport} from './reconcile.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const deployment = 'combative-zebra-261';
const store = openStore();
const command = process.argv[2] ?? 'report';
async function snapshotUsage() {
  const started=Date.now();
  const data=await fetchCurrentUsage();
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
    latestReconciliationAttempt: store.db.query("SELECT timestamp,outcome FROM captureOutcomes WHERE deployment=? AND outcome IN ('reconciliation_success','reconciliation_failed') ORDER BY timestamp DESC LIMIT 1").get(deployment),
    captureOutcomeRecordingStartedAt: store.db.query('SELECT MIN(timestamp) timestamp FROM captureOutcomes WHERE deployment=?').get(deployment)?.timestamp ?? null,
    attributionNote: 'Caller describes the server invocation class, not a user, device, or reliably distinct client transport. Missing metadata is unknown. Request and parent execution IDs are retained locally; application identities and content are discarded.',
    captureNote: 'Session interruptions and machine sleep may lose events beyond CLI replay history. Totals are not a monthly invoice or a function-call estimate.' }, null, 2));
  store.close();
} else if (command === 'collect') {
  let stopping = false; let child; let session; let failures = 0; let previousHeartbeat = Date.now();
  let pendingWriteFailures=0; let lastSnapshotAttempt=0; let snapshotInFlight;
  const attemptSnapshot = () => {
    if (snapshotInFlight || stopping || Date.now()-lastSnapshotAttempt<15*60000) return;
    lastSnapshotAttempt=Date.now();
    snapshotInFlight=snapshotUsage().then(() => store.recordOutcome(deployment,'reconciliation_success'))
      .catch(() => {try {store.recordOutcome(deployment,'reconciliation_failed');} catch {pendingWriteFailures++;}})
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
  const stop = () => { stopping = true; child?.kill('SIGTERM'); finishSession(); clearInterval(heartbeat); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
  while (!stopping) {
    const now = Date.now();
    // A previous hard crash leaves a stale session. End it at its last heartbeat.
    store.db.query('UPDATE sessions SET ended=heartbeat WHERE ended IS NULL').run();
    session = store.db.query('INSERT INTO sessions(deployment,started,heartbeat) VALUES(?,?,?)').run(deployment,now,now).lastInsertRowid;
    child = spawn(process.execPath, [resolve(root,'node_modules/convex/bin/main.js'),'logs','--prod','--success','--jsonl','--history','1000'], {
      cwd: root, env: { ...process.env, CONVEX_DEPLOYMENT: `prod:${deployment}` }, stdio: ['ignore','pipe','pipe'],
    });
    // Inspect only the CLI's fixed connectivity marker; discard all raw stderr.
    const errors = createInterface({ input: child.stderr, crlfDelay: Infinity });
    errors.on('line', (line) => { if (line.includes('Failed to fetch logs. Waiting')) { store.db.query('INSERT INTO gaps VALUES(?,?,?,?)').run(deployment,Date.now(),Date.now(),'CLI log transport failure'); child.kill('SIGTERM'); } });
    const completed = new Promise((resolveExit) => { child.once('error', () => resolveExit()); child.once('close', () => resolveExit()); });
    for await (const line of jsonlLines(child.stdout)) {
      if (stopping) break;
      // CLI output can include empty separator lines, which carry no event.
      if (!line.trim()) continue;
      const reject = (reason) => {store.recordOutcome(deployment,reason);};
      let event;
      try {
        if (pendingWriteFailures) {store.recordOutcome(deployment,'sqlite_write_failure',Date.now(),pendingWriteFailures); pendingWriteFailures=0;}
        try { event = JSON.parse(line); } catch { reject('invalid_json'); continue; }
        const {metric,outcome}=parseExecution(event,deployment);
        if (metric) { store.recordDetailed(metric); failures = 0; }
        else reject(outcome);
      } catch {pendingWriteFailures++; console.error('SQLite metrics write failed; event may be lost.');}
    }
    await completed; finishSession();
    if (!stopping) { console.error('Convex metrics stream disconnected; reconnecting. See report for coverage.');
      await new Promise((done) => { const cleanup = () => { process.removeListener('SIGTERM',interrupt); process.removeListener('SIGINT',interrupt); done(); }; const timer = setTimeout(cleanup, Math.min(60000,1000*2**Math.min(failures++,6))); const interrupt = () => { clearTimeout(timer); cleanup(); }; process.once('SIGTERM',interrupt); process.once('SIGINT',interrupt); });
    }
  }
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

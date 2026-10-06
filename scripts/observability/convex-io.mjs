#!/usr/bin/env bun
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { executionMetric, openStore, defaultDatabasePath } from './store.mjs';
import { jsonlLines } from './jsonl.mjs';
import { reportWindow, windowMetrics } from './report.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const deployment = 'combative-zebra-261';
const store = openStore();
const command = process.argv[2] ?? 'report';

if (command === 'report') {
  const window = reportWindow(process.argv.slice(3));
  const metrics = windowMetrics(store.db, deployment, window);
  const sessions = store.db.query('SELECT * FROM sessions WHERE deployment=? ORDER BY started DESC LIMIT 20').all(deployment);
  const newest = store.db.query('SELECT MAX(timestamp) latestEvent FROM executions WHERE deployment=?').get(deployment);
  const interruptionGaps = store.db.query('SELECT started AS "from", ended AS "to", reason FROM gaps WHERE deployment=? ORDER BY started DESC LIMIT 100').all(deployment);
  const gaps = sessions.slice(0,-1).map((current,i) => ({ from: sessions[i+1].ended ?? sessions[i+1].heartbeat, to: current.started })).filter((gap) => gap.to > gap.from);
  console.log(JSON.stringify({ database: defaultDatabasePath(), deployment, window: {from: new Date(window.from).toISOString(), to: new Date(window.to).toISOString(), function: window.function, endExclusive: true},
    invoiceComplete: false, collectorProcessFresh: Boolean(sessions[0] && !sessions[0].ended && Date.now()-sessions[0].heartbeat < 90000),
    ...newest, ...metrics, sessions, rejectedByReason: store.db.query("SELECT reason,count FROM rejections WHERE deployment=?").all(deployment), possibleCaptureGaps: [...gaps,...interruptionGaps],
    attributionNote: 'Caller describes the server invocation class, not a user, device, or reliably distinct client transport. Missing metadata is unknown. Request and parent execution IDs are retained locally; application identities and content are discarded.',
    coverageNote: 'Session interruptions and machine sleep may lose events beyond CLI replay history. Totals are not a monthly invoice or a function-call estimate.' }, null, 2));
  store.close();
} else if (command === 'collect') {
  let stopping = false; let child; let session; let failures = 0; let previousHeartbeat = Date.now();
  const finishSession = () => { if (session) store.db.query('UPDATE sessions SET ended=?,heartbeat=? WHERE id=?').run(Date.now(),Date.now(),session); session = undefined; };
  const heartbeat = setInterval(() => { const now = Date.now(); if (now-previousHeartbeat > 90000) store.db.query('INSERT INTO gaps VALUES(?,?,?,?)').run(deployment,previousHeartbeat,now,'heartbeat interruption or machine sleep'); previousHeartbeat = now; if (session) store.db.query('UPDATE sessions SET heartbeat=? WHERE id=?').run(Date.now(),session); store.prune(); }, 30000);
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
      const reject = (reason) => { store.db.query('UPDATE sessions SET rejected=rejected+1 WHERE id=?').run(session); store.db.query('INSERT INTO rejections VALUES(?,?,1) ON CONFLICT(deployment,reason) DO UPDATE SET count=count+1').run(deployment,reason); };
      let event;
      try { event = JSON.parse(line); } catch { reject('invalid JSON'); continue; }
      const metric = executionMetric(event,deployment);
      if (metric) { try { store.record(metric); failures = 0; } catch { reject('SQLite write failure'); } }
      else if (event?.kind === 'Completion') reject('missing usage metric');
    }
    await completed; finishSession();
    if (!stopping) { console.error('Convex metrics stream disconnected; reconnecting. See report for coverage.');
      await new Promise((done) => { const cleanup = () => { process.removeListener('SIGTERM',interrupt); process.removeListener('SIGINT',interrupt); done(); }; const timer = setTimeout(cleanup, Math.min(60000,1000*2**Math.min(failures++,6))); const interrupt = () => { clearTimeout(timer); cleanup(); }; process.once('SIGTERM',interrupt); process.once('SIGINT',interrupt); });
    }
  }
  store.close();
} else { store.close(); throw new Error('Use collect or report'); }

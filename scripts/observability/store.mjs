import { Database } from 'bun:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const defaultDatabasePath = () => join(process.env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'pravah/observability/convex-io.sqlite');
const DAY = 86400000;

export function executionMetric(event, deployment) {
  const usage = event?.usageStats;
  if (event?.kind !== 'Completion') return null;
  const fields = ['databaseIoReadBytes', 'databaseIoWriteBytes', 'databaseReadDocuments', 'databaseWriteDocuments', 'databaseWriteIndexRows'];
  if (!usage || fields.some((key) => !Number.isFinite(usage[key]) || usage[key] < 0) ||
    typeof event.executionId !== 'string' || typeof event.identifier !== 'string' ||
    !Number.isFinite(event.timestamp) || !Number.isFinite(event.executionTime)) return null;
  // Never retain logLines, identity, error bodies, arguments, or return values.
  return { deployment, id: event.executionId, timestamp: Math.round(event.timestamp * 1000),
    function: event.identifier, component: typeof event.componentPath === 'string' ? event.componentPath : '',
    kind: event.udfType ?? 'Unknown', cached: event.cachedResult === true ? 1 : 0,
    success: event.success === false || event.error != null ? 0 : 1, duration: Math.max(0, event.executionTime * 1000),
    read: usage.databaseIoReadBytes, write: usage.databaseIoWriteBytes,
    readDocs: usage.databaseReadDocuments, writeDocs: usage.databaseWriteDocuments,
    indexRows: usage.databaseWriteIndexRows };
}

export function openStore(path = defaultDatabasePath()) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new Database(path, { create: true });
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS executions (
      deployment TEXT, id TEXT, timestamp INTEGER, function TEXT, component TEXT, kind TEXT,
      cached INTEGER, success INTEGER, duration REAL, read INTEGER, write INTEGER,
      readDocs INTEGER, writeDocs INTEGER, indexRows INTEGER, PRIMARY KEY(deployment,id));
    CREATE INDEX IF NOT EXISTS executions_timestamp ON executions(timestamp);
    CREATE TABLE IF NOT EXISTS hourly (
      deployment TEXT, hour INTEGER, function TEXT, component TEXT, kind TEXT,
      calls INTEGER, hits INTEGER, failures INTEGER, read INTEGER, write INTEGER,
      readDocs INTEGER, writeDocs INTEGER, indexRows INTEGER,
      PRIMARY KEY(deployment,hour,function,component,kind));
    CREATE TABLE IF NOT EXISTS rejections (deployment TEXT, reason TEXT, count INTEGER, PRIMARY KEY(deployment,reason));
    CREATE TABLE IF NOT EXISTS gaps (deployment TEXT, started INTEGER, ended INTEGER, reason TEXT);
    CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY, deployment TEXT,
      started INTEGER, heartbeat INTEGER, ended INTEGER, rejected INTEGER DEFAULT 0);`);
  const insert = db.prepare('INSERT OR IGNORE INTO executions VALUES ($deployment,$id,$timestamp,$function,$component,$kind,$cached,$success,$duration,$read,$write,$readDocs,$writeDocs,$indexRows)');
  const rollup = db.prepare(`INSERT INTO hourly VALUES ($deployment,$hour,$function,$component,$kind,1,$cached,$failed,$read,$write,$readDocs,$writeDocs,$indexRows)
    ON CONFLICT(deployment,hour,function,component,kind) DO UPDATE SET
    calls=calls+1,hits=hits+excluded.hits,failures=failures+excluded.failures,
    read=read+excluded.read,write=write+excluded.write,readDocs=readDocs+excluded.readDocs,
    writeDocs=writeDocs+excluded.writeDocs,indexRows=indexRows+excluded.indexRows`);
  const record = db.transaction((metric, now) => {
    // Replays older than raw retention cannot be reliably deduplicated.
    if (!metric || metric.timestamp < now - 14 * DAY || metric.timestamp > now + 60000) return false;
    const params = Object.fromEntries(Object.entries(metric).map(([k,v]) => [`$${k}`,v]));
    const changed = insert.run(params).changes;
    if (!changed) return false;
    const { $id: _id, $timestamp: _timestamp, $success: _success, $duration: _duration, ...totals } = params;
    rollup.run({ ...totals, $hour: Math.floor(metric.timestamp / 3600000) * 3600000, $failed: 1 - metric.success });
    return true;
  });
  return { db, record: (metric, now = Date.now()) => record(metric, now),
    prune(now = Date.now()) { db.prepare('DELETE FROM executions WHERE timestamp < ?').run(now - 14*DAY); db.prepare('DELETE FROM hourly WHERE hour < ?').run(now - 365*DAY); db.prepare('DELETE FROM sessions WHERE heartbeat < ?').run(now - 365*DAY); db.prepare('DELETE FROM gaps WHERE ended < ?').run(now - 365*DAY); },
    close() { db.close(); } };
}

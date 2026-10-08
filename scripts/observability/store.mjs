import { Database } from 'bun:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export const defaultDatabasePath = () => join(process.env.XDG_STATE_HOME || join(homedir(), '.local/state'), 'pravah/observability/convex-io.sqlite');
const DAY = 86400000;
const correlationId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
// CLI labels differ from the hosted log-stream schema. Preserve the bounded
// invocation class verbatim; SyncWorker does not identify a device/transport.
const callers = new Set(['SyncWorker', 'HttpEndpoint', 'Action', 'Cron', 'Scheduler', 'Tester', 'Client',
  'websocket', 'http', 'httpEndpoint', 'cron', 'scheduler', 'action', 'tester']);

export function executionMetric(event, deployment) {
  const usage = event?.usageStats;
  if (event?.kind !== 'Completion') return null;
  const fields = ['databaseIoReadBytes', 'databaseIoWriteBytes'];
  if (!usage || fields.some((key) => !Number.isFinite(usage[key]) || usage[key] < 0) ||
    typeof event.executionId !== 'string' || typeof event.identifier !== 'string' ||
    !Number.isFinite(event.timestamp) || !Number.isFinite(event.executionTime)) return null;
  // Never retain logLines, identity, error bodies, arguments, or return values.
  return { deployment, id: event.executionId, timestamp: Math.round(event.timestamp * 1000),
    function: event.identifier, component: typeof event.componentPath === 'string' ? event.componentPath : '',
    kind: event.udfType ?? 'Unknown', cached: event.cachedResult === true ? 1 : 0,
    success: event.success === false || event.error != null ? 0 : 1, duration: Math.max(0, event.executionTime * 1000),
    read: usage.databaseIoReadBytes, write: usage.databaseIoWriteBytes,
    readDocs: optionalCount(usage.databaseReadDocuments), writeDocs: optionalCount(usage.databaseWriteDocuments),
    indexRows: optionalCount(usage.databaseWriteIndexRows),
    requestId: correlationId(event.requestId), parentExecutionId: correlationId(event.parentExecutionId),
    caller: callers.has(event.caller) ? event.caller : null };
}

const optionalCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
export function parseExecution(event, deployment) {
  if (event?.kind !== 'Completion') return {outcome: 'non_completion', metric: null};
  const metric = executionMetric(event, deployment);
  if (metric) return {outcome: 'valid', metric};
  const usage = event?.usageStats;
  return {metric: null, outcome: !usage || ['databaseIoReadBytes', 'databaseIoWriteBytes'].some(key => usage[key] == null)
    ? 'missing_byte_metrics' : 'invalid_metric'};
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
      started INTEGER, heartbeat INTEGER, ended INTEGER, rejected INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS captureOutcomes (deployment TEXT,timestamp INTEGER,outcome TEXT,count INTEGER,
      PRIMARY KEY(deployment,timestamp,outcome));
    CREATE TABLE IF NOT EXISTS releaseMarkers (deployment TEXT,timestamp INTEGER,sha TEXT,label TEXT,
      PRIMARY KEY(deployment,timestamp,sha));
    CREATE TABLE IF NOT EXISTS usageSnapshots (deployment TEXT,timestamp INTEGER,window TEXT,seedStatus TEXT,
      fromTime INTEGER,toTime INTEGER,providerBytes INTEGER,localBytes INTEGER,rawComplete INTEGER,
      PRIMARY KEY(deployment,timestamp,window));`);
  // Additive migration preserves existing capture and replay deduplication.
  const columns = new Set(db.query('PRAGMA table_info(executions)').all().map(column => column.name));
  for (const column of ['requestId', 'parentExecutionId', 'caller']) {
    if (!columns.has(column)) db.exec(`ALTER TABLE executions ADD COLUMN ${column} TEXT`);
  }
  const hourlyColumns = new Set(db.query('PRAGMA table_info(hourly)').all().map(column => column.name));
  for (const column of ['unknownReadDocs', 'unknownWriteDocs', 'unknownIndexRows']) {
    if (!hourlyColumns.has(column)) db.exec(`ALTER TABLE hourly ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0`);
  }
  const insert = db.prepare(`INSERT OR IGNORE INTO executions
    (deployment,id,timestamp,function,component,kind,cached,success,duration,read,write,readDocs,writeDocs,indexRows,requestId,parentExecutionId,caller)
    VALUES ($deployment,$id,$timestamp,$function,$component,$kind,$cached,$success,$duration,$read,$write,$readDocs,$writeDocs,$indexRows,$requestId,$parentExecutionId,$caller)`);
  const rollup = db.prepare(`INSERT INTO hourly
    (deployment,hour,function,component,kind,calls,hits,failures,read,write,readDocs,writeDocs,indexRows,unknownReadDocs,unknownWriteDocs,unknownIndexRows)
    VALUES ($deployment,$hour,$function,$component,$kind,1,$cached,$failed,$read,$write,$readDocs,$writeDocs,$indexRows,$unknownReadDocs,$unknownWriteDocs,$unknownIndexRows)
    ON CONFLICT(deployment,hour,function,component,kind) DO UPDATE SET
    calls=calls+1,hits=hits+excluded.hits,failures=failures+excluded.failures,
    read=read+excluded.read,write=write+excluded.write,readDocs=COALESCE(readDocs,0)+COALESCE(excluded.readDocs,0),
    writeDocs=COALESCE(writeDocs,0)+COALESCE(excluded.writeDocs,0),indexRows=COALESCE(indexRows,0)+COALESCE(excluded.indexRows,0),
    unknownReadDocs=unknownReadDocs+excluded.unknownReadDocs,unknownWriteDocs=unknownWriteDocs+excluded.unknownWriteDocs,
    unknownIndexRows=unknownIndexRows+excluded.unknownIndexRows`);
  const outcomeInsert = db.prepare(`INSERT INTO captureOutcomes VALUES(?,?,?,?)
    ON CONFLICT(deployment,timestamp,outcome) DO UPDATE SET count=count+excluded.count`);
  const outcomes = new Set(['accepted','duplicate','expired','future_timestamp','invalid_metric','invalid_json',
    'missing_byte_metrics','non_completion','sqlite_write_failure','reconciliation_failed','reconciliation_success']);
  function recordOutcome(deployment, outcome, now = Date.now(), count = 1) {
    if (!outcomes.has(outcome) || !Number.isSafeInteger(count) || count < 1) throw new Error('Invalid capture outcome');
    outcomeInsert.run(deployment, now, outcome, count);
  }
  const record = db.transaction((metric, now) => {
    // Replays older than raw retention cannot be reliably deduplicated.
    if (!metric) return 'invalid_metric';
    const rejected = metric.timestamp < now - 14 * DAY ? 'expired' : metric.timestamp > now + 60000 ? 'future_timestamp' : null;
    if (rejected) { recordOutcome(metric.deployment, rejected, now); return rejected; }
    const params = Object.fromEntries(Object.entries(metric).map(([k,v]) => [`$${k}`,v]));
    const changed = insert.run(params).changes;
    if (!changed) { recordOutcome(metric.deployment, 'duplicate', now); return 'duplicate'; }
    const { $id: _id, $timestamp: _timestamp, $success: _success, $duration: _duration,
      $requestId: _requestId, $parentExecutionId: _parent, $caller: _caller, ...totals } = params;
    rollup.run({ ...totals, $hour: Math.floor(metric.timestamp / 3600000) * 3600000, $failed: 1 - metric.success,
      $unknownReadDocs: metric.readDocs === null ? 1 : 0, $unknownWriteDocs: metric.writeDocs === null ? 1 : 0,
      $unknownIndexRows: metric.indexRows === null ? 1 : 0 });
    recordOutcome(metric.deployment, 'accepted', now);
    return 'accepted';
  });
  return { db, record: (metric, now = Date.now()) => record(metric, now) === 'accepted',
    recordDetailed: (metric, now = Date.now()) => record(metric, now), recordOutcome,
    markRelease(deployment, sha, label, now = Date.now()) {
      if (!/^[a-f0-9]{40}$/.test(sha) || typeof label !== 'string' || !/^[a-zA-Z0-9 ._-]{1,100}$/.test(label)) throw new Error('Invalid release marker');
      db.query('INSERT OR IGNORE INTO releaseMarkers VALUES(?,?,?,?)').run(deployment,now,sha,label);
    },
    prune(now = Date.now()) { db.prepare('DELETE FROM executions WHERE timestamp < ?').run(now - 14*DAY); db.prepare('DELETE FROM captureOutcomes WHERE timestamp < ?').run(now - 14*DAY); db.prepare('DELETE FROM hourly WHERE hour < ?').run(now - 365*DAY); db.prepare('DELETE FROM sessions WHERE heartbeat < ?').run(now - 365*DAY); db.prepare('DELETE FROM gaps WHERE ended < ?').run(now - 365*DAY); db.prepare('DELETE FROM usageSnapshots WHERE timestamp < ?').run(now - 365*DAY); db.prepare('DELETE FROM releaseMarkers WHERE timestamp < ?').run(now - 365*DAY); },
    close() { db.close(); } };
}

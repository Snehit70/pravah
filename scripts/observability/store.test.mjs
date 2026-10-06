import { jsonlLines } from './jsonl.mjs';
import { describe, test, expect } from 'bun:test';
import { executionMetric, openStore } from './store.mjs';
import { reportWindow, windowMetrics } from './report.mjs';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const timestamp = Date.now();
function event(id = 'execution-1', changes = {}) {
  return { kind: 'Completion', executionId: id, identifier: 'tasks:listBoardTasks',
    timestamp: timestamp/1000, executionTime: 0.01, udfType: 'Query', success: true,
    logLines: ['SECRET TASK CONTENT'], identity: 'SECRET OWNER', error: 'SECRET TOKEN',
    usageStats: { databaseIoReadBytes: 156362, databaseIoWriteBytes: 0,
      databaseReadDocuments: 257, databaseWriteDocuments: 0, databaseWriteIndexRows: 0 }, ...changes };
}
describe('actual-byte metrics store', () => {
  test('deduplicates replay atomically and strips application content', () => {
    const store = openStore(':memory:'); const metric = executionMetric(event(), 'prod');
    expect(JSON.stringify(metric)).not.toContain('SECRET');
    expect(store.record(metric)).toBe(true); expect(store.record(metric)).toBe(false);
    expect(store.db.query('SELECT calls,read,readDocs FROM hourly').get()).toEqual({ calls: 1, read:156362,readDocs:257 });
    store.close();
  });
  test('records cache hits with actual zero I/O rather than estimating from calls', () => {
    const store = openStore(':memory:'); const hit = event('hit',{ cachedResult:true, usageStats: { databaseIoReadBytes:0,databaseIoWriteBytes:0,databaseReadDocuments:0,databaseWriteDocuments:0,databaseWriteIndexRows:0 } });
    store.record(executionMetric(hit,'prod')); expect(store.db.query('SELECT hits,read FROM hourly').get()).toEqual({hits:1,read:0}); store.close();
  });
  test('missing, negative, or non-numeric usage never becomes zero bytes', () => {
    expect(executionMetric(event('missing',{usageStats:{}}),'prod')).toBeNull();
    expect(executionMetric(event('bad',{usageStats:{...event().usageStats,databaseIoReadBytes:-1}}),'prod')).toBeNull();
    expect(executionMetric({...event(),kind:'Progress'},'prod')).toBeNull();
  });
  test('omitted success is successful unless an actual error is present', () => {
    expect(executionMetric(event('normal',{success:undefined,error:null}),'prod').success).toBe(1);
    expect(executionMetric(event('failed',{success:undefined,error:'private failure'}),'prod').success).toBe(0);
  });
  test('retention keeps rollups and rejects old replay after raw dedup expiry', () => {
    const store = openStore(':memory:'); const metric = executionMetric(event(),'prod'); store.record(metric,timestamp);
    const later = timestamp+15*86400000; store.prune(later);
    expect(store.db.query('SELECT COUNT(*) n FROM executions').get().n).toBe(0);
    expect(store.db.query('SELECT SUM(read) n FROM hourly').get().n).toBe(156362);
    expect(store.record(metric,later)).toBe(false); expect(store.db.query('SELECT SUM(calls) n FROM hourly').get().n).toBe(1); store.close();
  });
  test('identical IDs in different deployments do not collide', () => {
    const store = openStore(':memory:'); store.record(executionMetric(event(),'a')); store.record(executionMetric(event(),'b'));
    expect(store.db.query('SELECT COUNT(*) n FROM executions').get().n).toBe(2); store.close();
  });
  test('retains bounded correlation IDs and invocation types without identity or arbitrary content', () => {
    const store = openStore(':memory:');
    store.record(executionMetric(event('correlated', {requestId: 'abc123', parentExecutionId: 'parent-456', caller: 'websocket'}), 'prod'));
    expect(store.db.query('SELECT requestId,parentExecutionId,caller FROM executions').get()).toEqual({requestId: 'abc123', parentExecutionId: 'parent-456', caller: 'websocket'});
    expect(executionMetric(event('cli', {caller: 'SyncWorker'}), 'prod').caller).toBe('SyncWorker');
    const privateMetric = executionMetric(event('private', {requestId: 'SECRET TOKEN', parentExecutionId: '<private>', caller: 'SECRET CONTENT'}), 'prod');
    expect(privateMetric.requestId).toBeNull(); expect(privateMetric.parentExecutionId).toBeNull(); expect(privateMetric.caller).toBeNull();
    store.close();
  });
  test('migrates the original SQLite schema without discarding bytes or replay deduplication', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pravah-io-migration-'));
    const path = join(dir, 'metrics.sqlite');
    try {
      const db = new Database(path);
      db.exec(`CREATE TABLE executions (deployment TEXT,id TEXT,timestamp INTEGER,function TEXT,component TEXT,kind TEXT,cached INTEGER,success INTEGER,duration REAL,read INTEGER,write INTEGER,readDocs INTEGER,writeDocs INTEGER,indexRows INTEGER,PRIMARY KEY(deployment,id));`);
      db.query('INSERT INTO executions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('prod', 'original', timestamp, 'tasks:listBoardTasks', '', 'Query', 0, 1, 1, 1234, 0, 2, 0, 0);
      db.close();
      const store = openStore(path);
      expect(store.db.query('SELECT read,requestId FROM executions').get()).toEqual({read: 1234, requestId: null});
      expect(store.record(executionMetric(event('original'), 'prod'))).toBe(false);
      store.close();
      const reopened = openStore(path);
      expect(reopened.db.query('SELECT COUNT(*) n FROM executions').get().n).toBe(1);
      reopened.close();
    } finally {rmSync(dir, {recursive: true, force: true});}
  });
  test('reports exact half-open byte windows without including the rest of an hour', () => {
    const store = openStore(':memory:');
    for (const [id, offset] of [['before', -1], ['first', 0], ['last', 999], ['after', 1000]]) {
      store.record(executionMetric(event(id, {timestamp: (timestamp+offset)/1000, error: null}), 'prod'), timestamp+1000);
    }
    const report = windowMetrics(store.db, 'prod', {from: timestamp, to: timestamp+1000, function: null});
    expect(report.totals.calls).toBe(2); expect(report.totals.readBytes).toBe(312724);
    expect(report.callers[0].caller).toBe('unknown');
    expect(windowMetrics(store.db, 'prod', {from: timestamp, to: timestamp+1000, function: 'absent'}).totals.readBytes).toBe(0);
    store.close();
  });
  test('rejects misleading windows outside retention and accepts explicit timezone boundaries', () => {
    const from = new Date(timestamp-1000).toISOString(), to = new Date(timestamp).toISOString();
    expect(reportWindow(['--from', from, `--to=${to}`, '--function', 'goals:listLinks'], timestamp)).toEqual({from: timestamp-1000, to: timestamp, function: 'goals:listLinks'});
    expect(() => reportWindow(['--from', new Date(timestamp-15*86400000).toISOString()], timestamp)).toThrow('retention');
    expect(() => reportWindow(['--from', to, '--to', from], timestamp)).toThrow('ordered');
    expect(() => reportWindow(['--from', '2026-10-06T12:00:00'], timestamp)).toThrow('timezone');
  });
});

test('chunked UTF-8 replay preserves every event while SQLite writes apply backpressure', async () => {
  const store = openStore(':memory:');
  const raw = new TextEncoder().encode(Array.from({length:2000},(_,i)=>JSON.stringify(event(`burst-${i}`,{logLines:['unicode é 🌊']}))).join('\r\n\n'));
  async function* chunks() { for(let i=0;i<raw.length;i+=113) yield raw.slice(i,i+113); }
  for await(const line of jsonlLines(chunks())) store.record(executionMetric(JSON.parse(line),'prod'));
  expect(store.db.query('SELECT COUNT(*) n FROM executions').get().n).toBe(2000);
  expect(store.db.query('SELECT SUM(read) n FROM hourly').get().n).toBe(2000*156362);
  store.close();
});

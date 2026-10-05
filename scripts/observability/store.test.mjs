import { jsonlLines } from './jsonl.mjs';
import { describe, test, expect } from 'bun:test';
import { executionMetric, openStore } from './store.mjs';
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

import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';

const canonical = 'https://combative-zebra-261.eu-west-1.convex.cloud';
// Convex's GB usage unit is binary, per model/src/usage_limits/types.rs.
export const BYTES_PER_PROVIDER_GB = 2**30;
export function parseUsageSnapshot(data, timestamp) {
  const usage = data?.metrics?.databaseIoGb;
  if (!['pending','partial','complete','failed'].includes(data?.seedStatus) || usage?.unit !== 'GB' ||
      !['current_day','current_month'].every(key => Number.isFinite(usage.usage?.[key]) && usage.usage[key]>=0)) {
    throw new Error('Unrecognized provider usage response');
  }
  const date = new Date(timestamp);
  return ['day','month'].map(window => ({window,seedStatus:data.seedStatus,
    fromTime: window==='day' ? Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()) : Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),1),
    toTime:timestamp,providerBytes:Math.round(usage.usage[`current_${window}`]*BYTES_PER_PROVIDER_GB)}));
}

/** Uses the same local login/authorize_prod protocol as the installed Convex CLI. */
export async function authorizeCanonicalDeployment(fetcher = fetch,signal) {
  let adminKey = process.env.CONVEX_DEPLOY_KEY;
  if (adminKey && !adminKey.startsWith('prod:combative-zebra-261|')) throw new Error('Usage key must target canonical deployment');
  if (!adminKey) {
    const accessToken = process.env.CONVEX_OVERRIDE_ACCESS_TOKEN ||
      JSON.parse(await readFile(join(homedir(),'.convex/config.json'),'utf8')).accessToken;
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('Convex login is required');
    const auth = await fetcher('https://api.convex.dev/api/deployment/authorize_prod',{
      method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({deploymentName:'combative-zebra-261'}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
    if (!auth.ok) throw new Error(`Usage authorization failed (${auth.status})`);
    const credentials = await auth.json();
    if (credentials.url !== canonical || typeof credentials.adminKey !== 'string') throw new Error('Unexpected usage deployment');
    adminKey=credentials.adminKey;
  }
  return {url:canonical,adminKey};
}
export async function fetchCurrentUsage(fetcher = fetch,signal) {
  const {url,adminKey}=await authorizeCanonicalDeployment(fetcher,signal);
  const response=await fetcher(`${url}/api/v1/get_current_usage`,{
    headers:{Authorization:`Convex ${adminKey}`},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Usage snapshot unavailable (${response.status})`);
  return response.json();
}

export function storeUsageSnapshot(store, deployment, data, timestamp = Date.now()) {
  const snapshots = parseUsageSnapshot(data,timestamp);
  store.db.transaction(() => {for (const snapshot of snapshots) {
    const rawComplete=snapshot.fromTime >= timestamp-14*86400000;
    // Hour-aligned rollups preserve long calendar windows after raw expiry.
    const localBytes=rawComplete
      ? store.db.query('SELECT COALESCE(SUM(read+write),0) bytes FROM executions WHERE deployment=? AND timestamp>=? AND timestamp<?').get(deployment,snapshot.fromTime,timestamp).bytes
      : store.db.query('SELECT COALESCE(SUM(read+write),0) bytes FROM hourly WHERE deployment=? AND hour>=? AND hour<?').get(deployment,snapshot.fromTime,timestamp).bytes;
    store.db.query('INSERT OR REPLACE INTO usageSnapshots VALUES(?,?,?,?,?,?,?,?,?)')
      .run(deployment,timestamp,snapshot.window,snapshot.seedStatus,snapshot.fromTime,timestamp,snapshot.providerBytes,localBytes,rawComplete?1:0);
  }})();
  return snapshots;
}

export function reconciliationReport(db,deployment,now=Date.now()) {
  return ['day','month'].map(window => {
    const row=db.query('SELECT * FROM usageSnapshots WHERE deployment=? AND window=? ORDER BY timestamp DESC LIMIT 1').get(deployment,window);
    if (!row) return {window,status:'not_collected'};
    const {rawComplete,...metadata}=row;
    const today=new Date(now);
    const currentStart=window==='day'?Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()):Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1);
    const currentWindow=row.fromTime===currentStart;
    const fresh=currentWindow && now-row.timestamp<=30*60000 && now>=row.timestamp;
    return {...metadata,rawRetentionCoversWindow:Boolean(rawComplete),
      currentWindow,fresh,
      status:!currentWindow?'previous_window':!fresh?'stale_snapshot':row.seedStatus==='complete' ? 'comparable_with_delivery_lag' : 'provider_incomplete',
      ageMs:now-row.timestamp,differenceBytes:fresh&&row.seedStatus==='complete' ? row.providerBytes-row.localBytes : null,
      observedDifferenceBytes:row.seedStatus==='complete'?row.providerBytes-row.localBytes:null,
      note:'Provider snapshot and local capture are asynchronous. A positive difference suggests missing/delayed capture, not exact lost-event attribution; a negative difference also requires investigation.'};
  });
}

/** Month minus current day gives provider usage before that UTC midnight. */
export function completedWindowReconciliation(db,deployment,now=Date.now()) {
  const pairs=db.query(`SELECT m.timestamp,m.fromTime monthStart,d.fromTime dayStart,
    m.providerBytes-d.providerBytes priorBytes FROM usageSnapshots m JOIN usageSnapshots d
    ON m.deployment=d.deployment AND m.timestamp=d.timestamp WHERE m.deployment=?
    AND m.window='month' AND d.window='day' AND m.seedStatus='complete' AND d.seedStatus='complete'
    ORDER BY m.timestamp`).all(deployment);
  const latest=new Map();for(const row of pairs)latest.set(row.dayStart,row);
  const points=[...latest.values()].sort((a,b)=>a.dayStart-b.dayStart),result=[];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i];
    if(a.monthStart!==b.monthStart||b.priorBytes<a.priorBytes)continue;
    const providerBytes=b.priorBytes-a.priorBytes;
    const raw=a.dayStart>=now-14*86400000;
    const localBytes=raw
      ?db.query('SELECT COALESCE(SUM(read+write),0) bytes FROM executions WHERE deployment=? AND timestamp>=? AND timestamp<?').get(deployment,a.dayStart,b.dayStart).bytes
      :db.query('SELECT COALESCE(SUM(read+write),0) bytes FROM hourly WHERE deployment=? AND hour>=? AND hour<?').get(deployment,a.dayStart,b.dayStart).bytes;
    result.push({from:a.dayStart,to:b.dayStart,providerBytes,localBytes,differenceBytes:providerBytes-localBytes,
      rawRetentionCoversWindow:raw,note:'Provider totals are derived from complete snapshots; delivery lag and retention may affect the discrepancy. Missing snapshot days remain combined intervals.'});
  }
  return result;
}

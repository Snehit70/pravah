import {parseExecution} from './store.mjs';

/** Same administrative log protocol used by the installed Convex CLI. */
export async function pollLogBatch(credentials,cursor,signal,fetcher=fetch) {
  const response=await fetcher(`${credentials.url}/api/stream_function_logs?cursor=${cursor}`,{
    // This is a long poll: an idle deployment can legitimately hold it open.
    // Match the CLI protocol; shutdown aborts it without inventing an outage.
    headers:{Authorization:`Convex ${credentials.adminKey}`},signal});
  if(!response.ok)throw new Error(`Log stream unavailable (${response.status})`);
  const data=await response.json();
  if(!Array.isArray(data?.entries)||!Number.isFinite(data.newCursor)||data.newCursor<cursor)throw new Error('Invalid log batch cursor');
  return data;
}

/** Cursor advancement commits with the metrics; failed writes replay safely. */
export function persistLogBatch(store,deployment,cursor,batch,receivedAt=Date.now()) {
  if(!Array.isArray(batch?.entries)||!Number.isFinite(batch.newCursor)||batch.newCursor<cursor)throw new Error('Invalid log batch cursor');
  return store.db.transaction(()=>{
    const previous=store.db.query('SELECT * FROM logCheckpoints WHERE deployment=?').get(deployment);
    if(previous&&previous.cursor>cursor)throw new Error('Stale log writer');
    let firstEventAt=null,lastEventAt=previous?.lastEventAt??null,accepted=0;
    for(const entry of batch.entries) {
      const timestamp=Number.isFinite(entry?.timestamp)?Math.round(entry.timestamp*1000):null;
      if(timestamp!==null){firstEventAt=firstEventAt===null?timestamp:Math.min(firstEventAt,timestamp);lastEventAt=lastEventAt===null?timestamp:Math.max(lastEventAt,timestamp);}
      const {metric,outcome}=parseExecution(entry,deployment);
      if(metric){if(store.recordDetailed(metric,receivedAt)==='accepted')accepted++;}
      else store.recordOutcome(deployment,outcome,receivedAt);
    }
    store.db.query('INSERT OR REPLACE INTO logCheckpoints VALUES(?,?,?,?)').run(deployment,batch.newCursor,receivedAt,lastEventAt);
    if(batch.entries.length)store.db.query('INSERT OR REPLACE INTO logBatches VALUES(?,?,?,?,?,?,?)')
      .run(deployment,receivedAt,cursor,batch.newCursor,batch.entries.length,firstEventAt,lastEventAt);
    return {cursor:batch.newCursor,accepted};
  })();
}

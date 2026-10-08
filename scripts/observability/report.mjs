const DAY = 86400000;

/** Raw events allow exact comparison windows; hourly rollups cannot trim hours. */
export function reportWindow(args, now = Date.now()) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const [flag, inline] = args[i].split('=');
    if (!['--from', '--to', '--function'].includes(flag)) throw new Error(`Unknown report option: ${flag}`);
    const value = inline ?? args[++i];
    if (!value || value.startsWith('--') || options[flag] !== undefined) throw new Error(`Invalid report option: ${flag}`);
    options[flag] = value;
  }
  const parseTime = (value, fallback) => {
    if (value === undefined) return fallback;
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('Report times must be ISO timestamps with a timezone');
    const time = Date.parse(value);
    if (!Number.isFinite(time)) throw new Error('Invalid report timestamp');
    return time;
  };
  const from = parseTime(options['--from'], now - 7 * DAY);
  const to = parseTime(options['--to'], now);
  if (from < now - 14 * DAY || to > now + 60000 || from >= to) {
    throw new Error('Report window must be ordered and within the last 14 days of raw retention');
  }
  return {from, to, function: options['--function'] ?? null};
}

export function windowMetrics(db, deployment, window) {
  const where = 'deployment=$deployment AND timestamp >= $from AND timestamp < $to AND ($function IS NULL OR function=$function)';
  const params = {$deployment: deployment, $from: window.from, $to: window.to, $function: window.function};
  const functions = db.query(`SELECT function, COUNT(*) calls, SUM(cached) cacheHits,
    SUM(read) readBytes, SUM(write) writeBytes, SUM(readDocs) readDocuments,
    SUM(writeDocs) writeDocuments, SUM(indexRows) writeIndexRows, SUM(1-success) failures,
    SUM(readDocs IS NULL) unknownReadDocuments, SUM(writeDocs IS NULL) unknownWriteDocuments,
    SUM(indexRows IS NULL) unknownWriteIndexRows
    FROM executions WHERE ${where} GROUP BY function ORDER BY SUM(read+write) DESC`).all(params);
  const costs = db.query(`SELECT function, read+write bytes FROM executions WHERE ${where} AND cached=0 ORDER BY function, bytes`).all(params);
  const grouped = new Map();
  for (const row of costs) {const values = grouped.get(row.function) ?? []; values.push(row.bytes); grouped.set(row.function, values);}
  const missCosts = [...grouped].map(([functionName, bytes]) => ({function: functionName, samples: bytes.length,
    meanBytes: bytes.reduce((a,b) => a+b,0)/bytes.length, p95Bytes: bytes[Math.ceil(bytes.length*0.95)-1]}));
  const callers = db.query(`SELECT COALESCE(caller,'unknown') caller, COUNT(*) calls,
    SUM(read) readBytes, SUM(write) writeBytes FROM executions WHERE ${where} GROUP BY caller ORDER BY SUM(read+write) DESC`).all(params);
  const hours = db.query(`SELECT CAST(timestamp/3600000 AS INTEGER)*3600000 hour,
    COUNT(*) calls,SUM(cached) cacheHits,SUM(read) readBytes,SUM(write) writeBytes,
    SUM(CASE WHEN cached=0 THEN 1 ELSE 0 END) cacheMisses,
    SUM(CASE WHEN cached=0 THEN read+write ELSE 0 END) missBytes
    FROM executions WHERE ${where} GROUP BY hour ORDER BY hour`).all(params)
    .map(row => ({...row, meanMissBytes: row.cacheMisses ? row.missBytes/row.cacheMisses : null}));
  const captureOutcomes = db.query(`SELECT outcome,SUM(count) count FROM captureOutcomes
    WHERE deployment=$deployment AND timestamp >= $from AND timestamp < $to GROUP BY outcome`).all(params);
  const releaseMarkers = db.query(`SELECT timestamp,sha,label FROM releaseMarkers
    WHERE deployment=$deployment AND timestamp >= $from AND timestamp < $to ORDER BY timestamp`).all(params);
  const totals = functions.reduce((total, row) => {
    for (const key of Object.keys(total)) total[key] += row[key] ?? 0;
    return total;
  }, {calls: 0, cacheHits: 0, readBytes: 0, writeBytes: 0, readDocuments: 0, writeDocuments: 0, writeIndexRows: 0, failures: 0,
    unknownReadDocuments: 0, unknownWriteDocuments: 0, unknownWriteIndexRows: 0});
  return {functions, missCosts, callers, totals, hours, captureOutcomes, releaseMarkers,
    captureOutcomeTimeBasis: 'receipt time, all functions; execution totals use event time',
    documentCountNote: 'Document/index totals sum known values only; unknown counters indicate incomplete counts.'};
}

/** Process uptime is evidence of capture opportunity, not proof all logs arrived. */
export function windowCoverage(db, deployment, {from, to}, now = Date.now()) {
  const sessions = db.query(`SELECT * FROM sessions WHERE deployment=? AND started < ?
    AND (ended >= ? OR ended IS NULL AND (heartbeat >= ? OR heartbeat >= ?)) ORDER BY started`)
    .all(deployment,to,from,from,now-90000);
  const intervals = sessions.map(row => [Math.max(from,row.started), Math.min(to,
    row.ended ?? (now-row.heartbeat < 90000 ? now : row.heartbeat))]).filter(([a,b]) => b>a);
  const uncovered = []; let cursor = from;
  for (const [a,b] of intervals) {if (a>cursor) uncovered.push({from: cursor,to:a,reason:'no collector session'}); cursor=Math.max(cursor,b);}
  if (cursor<to) uncovered.push({from:cursor,to,reason:'no collector session'});
  const interruptions = db.query(`SELECT started,ended,reason FROM gaps WHERE deployment=?
    AND started < ? AND ended >= ? ORDER BY started`).all(deployment,to,from)
    .map(row => ({from:Math.max(from,row.started),to:Math.min(to,row.ended),reason:row.reason}));
  const allGaps = [...uncovered,...interruptions].sort((a,b) => a.from-b.from);
  let end=from, missingMs=0;
  for (const gap of allGaps) {missingMs += Math.max(0,gap.to-Math.max(end,gap.from)); end=Math.max(end,gap.to);}
  return {sessions,possibleCaptureGaps:allGaps,knownGapMs:missingMs,
    sessionCoverageFraction:1-missingMs/(to-from),
    coverageNote:'Session coverage does not prove complete log delivery. Zero-length transport failures are warnings, not quantified loss.'};
}

export function compareMetrics(before,after) {
  const index = rows => new Map(rows.map(row => [row.function,row]));
  const old=index(before.functions), next=index(after.functions);
  return [...new Set([...old.keys(),...next.keys()])].map(functionName => {
    const a=old.get(functionName), b=next.get(functionName);
    const oldMiss=before.missCosts.find(row => row.function===functionName);
    const newMiss=after.missCosts.find(row => row.function===functionName);
    const oldBytes=(a?.readBytes??0)+(a?.writeBytes??0),newBytes=(b?.readBytes??0)+(b?.writeBytes??0);
    return {function:functionName,beforeBytes:oldBytes,afterBytes:newBytes,bytesDelta:newBytes-oldBytes,
      beforeCalls:a?.calls??0,afterCalls:b?.calls??0,
      beforeCacheMisses:oldMiss?.samples??0,afterCacheMisses:newMiss?.samples??0,
      beforeMeanMissBytes:oldMiss?.meanBytes??null,afterMeanMissBytes:newMiss?.meanBytes??null,
      percentChange:oldBytes ? 100*(newBytes-oldBytes)/oldBytes : null};
  }).sort((a,b) => b.afterBytes-a.afterBytes);
}

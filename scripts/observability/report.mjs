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
    SUM(writeDocs) writeDocuments, SUM(indexRows) writeIndexRows, SUM(1-success) failures
    FROM executions WHERE ${where} GROUP BY function ORDER BY SUM(read+write) DESC`).all(params);
  const costs = db.query(`SELECT function, read+write bytes FROM executions WHERE ${where} AND cached=0 ORDER BY function, bytes`).all(params);
  const grouped = new Map();
  for (const row of costs) {const values = grouped.get(row.function) ?? []; values.push(row.bytes); grouped.set(row.function, values);}
  const missCosts = [...grouped].map(([functionName, bytes]) => ({function: functionName, samples: bytes.length,
    meanBytes: bytes.reduce((a,b) => a+b,0)/bytes.length, p95Bytes: bytes[Math.ceil(bytes.length*0.95)-1]}));
  const callers = db.query(`SELECT COALESCE(caller,'unknown') caller, COUNT(*) calls,
    SUM(read) readBytes, SUM(write) writeBytes FROM executions WHERE ${where} GROUP BY caller ORDER BY SUM(read+write) DESC`).all(params);
  const totals = functions.reduce((total, row) => {
    for (const key of Object.keys(total)) total[key] += row[key];
    return total;
  }, {calls: 0, cacheHits: 0, readBytes: 0, writeBytes: 0, readDocuments: 0, writeDocuments: 0, writeIndexRows: 0, failures: 0});
  return {functions, missCosts, callers, totals};
}

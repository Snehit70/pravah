// Decode chunked UTF-8 explicitly. No readline event queue: slow SQLite writes
// must apply backpressure rather than miss lines from a burst of replay events.
export async function* jsonlLines(chunks) {
  const decoder = new TextDecoder(); let pending = '';
  for await (const chunk of chunks) {
    pending += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0,newline).replace(/\r$/, ''); pending = pending.slice(newline+1);
      if (line.trim()) yield line;
    }
    if (pending.length > 8 * 1024 * 1024) throw new Error('Log event exceeds recorder memory limit');
  }
  pending += decoder.decode(); if (pending.trim()) yield pending.replace(/\r$/, '');
}

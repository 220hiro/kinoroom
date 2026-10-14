import type { Readable } from 'node:stream';

/** Keep one bounded WebTorrent selection alive; cancellation releases that reader. */
export async function* readTorrentRangeInWindows(
  file: { createReadStream(range: { start: number; end: number }): Readable },
  start: number, end: number, signal: AbortSignal, windowBytes = 2 * 1024 * 1024
): AsyncGenerator<Buffer> {
  if (!Number.isSafeInteger(windowBytes) || windowBytes <= 0) throw new Error('Invalid read window');
  for (let offset = start; offset <= end && !signal.aborted; offset += windowBytes) {
    const reader = file.createReadStream({ start: offset, end: Math.min(end, offset + windowBytes - 1) });
    const cancel = () => reader.destroy();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      for await (const chunk of reader) {
        if (signal.aborted) return;
        yield Buffer.from(chunk);
      }
    } catch (error) { if (!signal.aborted) throw error; }
    finally { signal.removeEventListener('abort', cancel); reader.destroy(); }
  }
}

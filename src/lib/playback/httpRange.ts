/** Parse one byte range. Unsupported/malformed ranges are rejected explicitly. */
export function parseHttpRange(header: string, total: number): { start: number; end: number } | null {
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, total - suffix), end: total - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= total || requestedEnd < start) return null;
  return { start, end: Math.min(requestedEnd, total - 1) };
}

/** Explicit local-only experiment; never exposed on Vercel. */
export function hlsPilotEnabled(): boolean {
  return process.env.KINOROOM_HLS_PILOT === '1' && !process.env.VERCEL;
}

export function hlsPilotResource(path: string[]): string | null {
  const resource = path.join('/');
  return resource === 'status' || resource === 'events' || /^hls\/(?:s\d+\/)?(master\.m3u8|init\.mp4|seg\d{5}\.m4s)$/.test(resource)
    ? resource : null;
}

export function hlsPilotOrigin(): string {
  const port = Number(process.env.KINOROOM_HLS_PILOT_PORT || 8092);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local pilot port');
  return `http://127.0.0.1:${port}`;
}

const EVENTS = new Set(['loadstart', 'loadedmetadata', 'canplay', 'playing', 'pause',
  'waiting', 'stalled', 'seeking', 'seeked', 'error', 'ended', 'firstframe', 'sample', 'close']);
/** Only transient numerical media state; no URL, IP, UA, names or arbitrary errors. */
export function sanitizePilotEvent(value: unknown): Record<string, number | string> | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.event !== 'string' || !EVENTS.has(input.event)) return null;
  const result: Record<string, number | string> = { event: input.event };
  for (const [key, limit] of Object.entries({ session: 2 ** 31, elapsedMs: 86_400_000,
    currentTime: 28_800, duration: 28_800, bufferAhead: 28_800, readyState: 4, errorCode: 4, width: 8192, height: 8192 })) {
    const n = input[key];
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= limit) result[key] = n;
  }
  return result;
}

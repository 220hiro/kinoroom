/** Only published media URIs count; .tmp data must never pass the startup barrier. */
export function hlsStartupReady(playlist: string, initReady: boolean, minimumSegments = 3): boolean {
  if (!initReady || !playlist.startsWith('#EXTM3U') || !playlist.includes('#EXT-X-MAP:URI="init.mp4"')) return false;
  const segments = [...playlist.matchAll(/#EXTINF:([\d.]+),[^\n]*\r?\n(seg\d{5}\.m4s)(?=\r?\n|$)/g)]
    .filter(match => Number.isFinite(Number(match[1])) && Number(match[1]) > 0);
  return segments.length >= minimumSegments || (segments.length > 0 && playlist.includes('#EXT-X-ENDLIST'));
}

export function hlsStartAtBeginning(playlist: string): string {
  return playlist.includes('#EXT-X-START:') ? playlist
    : playlist.replace('#EXTM3U', '#EXTM3U\n#EXT-X-START:TIME-OFFSET=0,PRECISE=YES');
}

/** EVENT duration may be Infinity. Controls can seek only within the actual current prefix. */
export function availableMediaDuration(duration: number, seekableEnd: number, bufferedEnd = 0): number {
  if (Number.isFinite(duration) && duration > 0) return duration;
  if (Number.isFinite(seekableEnd) && seekableEnd > 0) return seekableEnd;
  return Number.isFinite(bufferedEnd) && bufferedEnd > 0 ? bufferedEnd : 0;
}

export function parsePilotSeekSession(path: string): { seekOffset: number; filename: string } | null {
  const match = /^\/hls\/(?:s(\d+)\/)?(master\.m3u8|init\.mp4|seg\d{5}\.m4s)$/.exec(path);
  if (!match) return null;
  return {
    seekOffset: match[1] ? Number(match[1]) : 0,
    filename: match[2]
  };
}

export function buildPilotSeekStreamSrc(seekOffsetSeconds: number): string {
  return seekOffsetSeconds > 0
    ? `/api/torrent/hls-pilot/hls/s${Math.floor(seekOffsetSeconds)}/master.m3u8`
    : '/api/torrent/hls-pilot/hls/master.m3u8';
}

export function computeTruePlaybackTime(videoCurrentTime: number, seekOffsetSeconds: number): number {
  const base = Number.isFinite(seekOffsetSeconds) && seekOffsetSeconds > 0 ? seekOffsetSeconds : 0;
  const cur = Number.isFinite(videoCurrentTime) && videoCurrentTime > 0 ? videoCurrentTime : 0;
  return base + cur;
}

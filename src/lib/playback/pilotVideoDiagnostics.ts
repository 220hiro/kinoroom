/** Attached only in the explicitly enabled, local generated-media experiment. */
export function attachPilotVideoDiagnostics(video: HTMLVideoElement): () => void {
  const started = performance.now();
  const session = Math.floor(Math.random() * 2 ** 31); // Transient page tag, not a device/user ID.
  let stopped = false;
  const send = (event: string) => {
    if (stopped) return;
    let bufferAhead = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
        bufferAhead = video.buffered.end(i) - video.currentTime;
        break;
      }
    }
    void fetch('/api/torrent/hls-pilot/events', { method: 'POST', keepalive: event === 'close',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        event, session, elapsedMs: Math.round(performance.now() - started),
        currentTime: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0,
        bufferAhead, readyState: video.readyState, errorCode: video.error?.code || 0,
        width: video.videoWidth, height: video.videoHeight
      }) }).catch(() => {});
  };
  const events = ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'pause',
    'waiting', 'stalled', 'seeking', 'seeked', 'error', 'ended'];
  const listeners = events.map(event => { const handler = () => send(event);
    video.addEventListener(event, handler); return { event, handler }; });
  const frame = typeof video.requestVideoFrameCallback === 'function'
    ? video.requestVideoFrameCallback(() => send('firstframe')) : undefined;
  const timer = setInterval(() => { if (!video.paused) send('sample'); }, 3000);
  const closing = () => send('close');
  window.addEventListener('pagehide', closing);
  return () => { send('close'); stopped = true; clearInterval(timer); window.removeEventListener('pagehide', closing);
    for (const { event, handler } of listeners) video.removeEventListener(event, handler);
    if (frame !== undefined) video.cancelVideoFrameCallback(frame);
  };
}

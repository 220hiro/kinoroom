// Paste on /torrent BEFORE selecting a permitted video. No extra requests.
// Export never contains URLs, titles, hashes, credentials or peer addresses.
(() => {
  window.kinoProbe?.stop();
  let video = document.querySelector('video');
  const started = performance.now();
  const rows = [];
  let session = 0;
  let played = false;
  let waiting = null;
  let seekAt = null;
  let frameId = null;
  let frameVideo = null;
  let stopped = false;
  const ms = () => Math.round(performance.now() - started);
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const backend = source => {
    try {
      const url = new URL(source, location.href);
      if (url.pathname === '/api/torrent/stream') return 'webtorrent';
      if (url.pathname.startsWith('/gst/')) return 'torrserver-hls';
      if (url.pathname === '/stream') return 'torrserver-http';
      if (url.protocol === 'blob:') return 'mse';
      return 'other';
    } catch { return 'unknown'; }
  };
  const sample = (event, extra = {}) => {
    if (stopped) return;
    const ranges = video ? Array.from({ length: video.buffered.length }, (_, i) =>
      [video.buffered.start(i), video.buffered.end(i)].map(n => Math.round(n * 100) / 100)) : [];
    const current = video?.currentTime || 0;
    const range = ranges.find(([a, b]) => a <= current && b >= current);
    rows.push({ event, ms: ms(), session, backend: video ? backend(video.currentSrc || video.src) : 'unknown',
      currentSeconds: Math.round(current * 100) / 100, readyState: video?.readyState ?? 0,
      bufferAheadSeconds: range ? Math.max(0, Math.round((range[1] - current) * 100) / 100) : 0,
      ranges, ...extra });
    if (rows.length > 2000) rows.shift();
  };
  const requestFrame = () => {
    if (!video?.requestVideoFrameCallback) return;
    if (frameId !== null) frameVideo?.cancelVideoFrameCallback(frameId);
    frameVideo = video;
    frameId = video.requestVideoFrameCallback(() => { frameId = null; sample('firstRenderedFrame'); });
  };
  const events = ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'waiting', 'stalled', 'seeking', 'seeked', 'pause', 'ended', 'error'];
  const listener = e => {
    if (!(e.target instanceof HTMLVideoElement)) return;
    if (video !== e.target) {
      if (frameId !== null) frameVideo?.cancelVideoFrameCallback?.(frameId);
      frameId = null;
      video = e.target;
    }
    const now = ms();
    const extra = {};
    if (e.type === 'loadstart') {
      session++; played = false; waiting = null; seekAt = null;
      requestFrame();
    }
    if (e.type === 'waiting' && !video.paused && waiting === null) {
      waiting = { at: now, kind: seekAt !== null || video.seeking ? 'seek' : played ? 'rebuffer' : 'startup' };
    }
    if (e.type === 'seeking') seekAt = now;
    if (e.type === 'seeked' && seekAt !== null) extra.seekMs = now - seekAt;
    if (e.type === 'playing') {
      if (waiting) { extra.waitingMs = now - waiting.at; extra.waitingKind = waiting.kind; waiting = null; }
      if (seekAt !== null) { extra.seekToPlayingMs = now - seekAt; seekAt = null; }
      played = true;
    }
    if (e.type === 'pause' || e.type === 'ended' || e.type === 'error') waiting = null;
    if (e.type === 'error') extra.errorCode = video.error?.code;
    sample(e.type, extra);
  };
  // Capture media events even when the player has not mounted yet.
  events.forEach(event => document.addEventListener(event, listener, true));
  const originalFetch = window.fetch;
  const observedFetch = function (...args) {
    let statusBackend = null;
    try {
      const url = new URL(args[0] instanceof Request ? args[0].url : String(args[0]), location.href);
      if (url.origin === location.origin && url.pathname === '/api/torrent/info') statusBackend = 'webtorrent';
      if (url.origin === location.origin && url.pathname === '/api/torrent/torrserver') statusBackend = 'torrserver';
    } catch {}
    const requestedAt = ms();
    return originalFetch.apply(this, args).then(response => {
      if (statusBackend && !stopped) {
        const requestMs = ms() - requestedAt;
        response.clone().json().then(data => {
          if (typeof data.ready !== 'boolean') {
            if (!response.ok) sample('statusFailure', { statusBackend, requestMs, httpStatus: response.status });
            return;
          }
          const d = data.diagnostics;
          sample('status', {
            statusBackend, requestMs, httpStatus: response.status, metadataReady: data.ready,
            peers: number(data.numPeers), downloadBytesPerSecond: number(data.downloadSpeed),
            server: d ? {
              metadataAlreadyAvailable: d.metadataAlreadyAvailable === true,
              metadataObservedMs: number(d.metadataObservedMs), firstPeerObservedMs: number(d.firstPeerObservedMs),
              streams: Array.isArray(d.streams) ? d.streams.map(s => ({
                id: number(s.id), metadataWaitMs: number(s.metadataWaitMs), firstByteMs: number(s.firstByteMs),
                bytesDelivered: number(s.bytesDelivered), requestedBytes: number(s.requestedBytes),
                state: ['reading', 'ended', 'cancelled', 'error'].includes(s.state) ? s.state : 'unknown',
                nextPieceAvailable: typeof s.nextPieceAvailable === 'boolean' ? s.nextPieceAvailable : null,
                peersWithNextPiece: number(s.peersWithNextPiece)
              })) : []
            } : null
          });
        }).catch(() => {});
      }
      return response;
    });
  };
  window.fetch = observedFetch;
  const timer = setInterval(() => {
    if (!video?.isConnected) video = document.querySelector('video');
    sample('buffer');
  }, 1000);
  sample('attached', { metadataAlreadyLoaded: Boolean(video && video.readyState >= 1) });
  if (video) requestFrame();
  window.kinoProbe = {
    snapshot: () => {
      const summaries = [...new Set(rows.filter(r => r.session > 0).map(r => r.session))].map(id => {
        const items = rows.filter(r => r.session === id);
        const start = items.find(r => r.event === 'loadstart')?.ms;
        const sinceLoad = event => {
          const found = items.find(r => r.event === event);
          return start !== undefined && found ? found.ms - start : null;
        };
        return { session: id, metadataMs: sinceLoad('loadedmetadata'), playableMs: sinceLoad('canplay'),
          firstFrameMs: sinceLoad('firstRenderedFrame'), playingMs: sinceLoad('playing'),
          completedRebuffers: items.filter(r => r.waitingKind === 'rebuffer').map(r => r.waitingMs),
          seekMs: items.filter(r => r.seekMs !== undefined).map(r => r.seekMs),
          seekToPlayingMs: items.filter(r => r.seekToPlayingMs !== undefined).map(r => r.seekToPlayingMs) };
      });
      return { summaries, rows, unfinishedWaitMs: waiting ? ms() - waiting.at : null };
    },
    stop: () => {
      stopped = true;
      clearInterval(timer);
      events.forEach(event => document.removeEventListener(event, listener, true));
      if (frameId !== null) frameVideo?.cancelVideoFrameCallback?.(frameId);
      if (window.fetch === observedFetch) window.fetch = originalFetch;
    }
  };
  console.info('Диагностика включена. Выберите разрешённое видео. Результат: kinoProbe.snapshot(); завершить: kinoProbe.stop().');
})();

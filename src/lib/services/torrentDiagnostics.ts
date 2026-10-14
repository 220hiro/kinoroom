// Opt-in local diagnostics. Never record names, identifiers, URLs or peer addresses.
type StreamSample = {
  id: number;
  startedAt: number;
  metadataWaitMs: number;
  firstByteMs: number | null;
  bytesDelivered: number;
  state: 'reading' | 'ended' | 'cancelled' | 'error';
  file: any;
  start: number;
  end: number;
};
type Observation = {
  startedAt: number;
  metadataAlreadyAvailable: boolean;
  metadataObservedMs: number | null;
  firstPeerObservedMs: number | null;
  nextStreamId: number;
  streams: StreamSample[];
};
declare global {
  // eslint-disable-next-line no-var
  var _kinoTorrentObservations: WeakMap<object, Observation> | undefined;
}

export function torrentDiagnosticsEnabled() {
  return process.env.NODE_ENV !== 'production' && process.env.KINOROOM_STREAM_DIAGNOSTICS === '1';
}

export function observeTorrent(torrent: any): Observation | undefined {
  if (!torrentDiagnosticsEnabled()) return undefined;
  const observations = globalThis._kinoTorrentObservations ??= new WeakMap();
  const existing = observations.get(torrent);
  if (existing) return existing;
  const hasMetadata = Boolean(torrent.files?.length);
  const observation: Observation = {
    startedAt: performance.now(), metadataAlreadyAvailable: hasMetadata,
    metadataObservedMs: hasMetadata ? 0 : null,
    firstPeerObservedMs: torrent.numPeers > 0 ? 0 : null,
    nextStreamId: 1, streams: []
  };
  observations.set(torrent, observation);
  if (!hasMetadata) {
    const metadata = () => {
      observation.metadataObservedMs = Math.round(performance.now() - observation.startedAt);
      torrent.removeListener('metadata', metadata);
      torrent.removeListener('ready', metadata);
    };
    torrent.once('metadata', metadata);
    torrent.once('ready', metadata);
  }
  if (observation.firstPeerObservedMs === null) {
    torrent.once('wire', () => {
      observation.firstPeerObservedMs = Math.round(performance.now() - observation.startedAt);
    });
  }
  return observation;
}

export function observeTorrentStream(torrent: any, file: any, start: number, end: number, metadataWaitMs: number) {
  const observation = observeTorrent(torrent);
  if (!observation) return undefined;
  const stream: StreamSample = {
    id: observation.nextStreamId++, startedAt: performance.now(), metadataWaitMs: Math.round(metadataWaitMs),
    firstByteMs: null, bytesDelivered: 0, state: 'reading', file, start, end
  };
  observation.streams.push(stream);
  // Keep every active request; completed history is bounded for long sessions.
  observation.streams = observation.streams.filter(s => s.state === 'reading' || s.id > stream.id - 8);
  return {
    data(bytes: number) {
      if (stream.firstByteMs === null) stream.firstByteMs = Math.round(performance.now() - stream.startedAt);
      stream.bytesDelivered += bytes;
    },
    finish(state: 'ended' | 'cancelled' | 'error') { stream.state = state; }
  };
}

export function getTorrentDiagnostics(torrent: any) {
  const observation = observeTorrent(torrent);
  if (!observation) return undefined;
  return {
    backend: 'webtorrent' as const,
    metadataAlreadyAvailable: observation.metadataAlreadyAvailable,
    metadataObservedMs: observation.metadataObservedMs,
    firstPeerObservedMs: observation.firstPeerObservedMs,
    streams: observation.streams.map(s => {
      const complete = s.state !== 'reading' || s.start + s.bytesDelivered > s.end;
      const piece = Math.floor((s.file.offset + s.start + s.bytesDelivered) / torrent.pieceLength);
      const available = complete ? null : Boolean(torrent.bitfield?.get(piece));
      return {
        id: s.id, metadataWaitMs: s.metadataWaitMs, firstByteMs: s.firstByteMs,
        bytesDelivered: s.bytesDelivered, requestedBytes: s.end - s.start + 1, state: s.state,
        nextPieceAvailable: available,
        peersWithNextPiece: complete ? null : (torrent.wires || []).filter((w: any) => w.peerPieces?.get(piece)).length
      };
    })
  };
}

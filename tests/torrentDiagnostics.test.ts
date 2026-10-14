import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { getTorrentDiagnostics, observeTorrent, observeTorrentStream } from '../src/lib/services/torrentDiagnostics';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/torrent/stream/route';
import { getTorrentStatus } from '../src/lib/services/torrents';

test('diagnostics distinguish missing requested pieces from aggregate speed without exporting identifiers', () => {
  const previous = process.env.KINOROOM_STREAM_DIAGNOSTICS;
  process.env.KINOROOM_STREAM_DIAGNOSTICS = '1';
  const torrent = Object.assign(new EventEmitter(), {
    files: [], numPeers: 0, pieceLength: 100, downloadSpeed: 2_400_000,
    name: 'private-fixture-name', infoHash: 'private-fixture-hash',
    bitfield: { get: (piece: number) => piece === 0 },
    wires: [{ remoteAddress: 'private-fixture-address', peerPieces: { get: (piece: number) => piece === 1 } }]
  });
  try {
    observeTorrent(torrent);
    torrent.emit('wire');
    torrent.emit('metadata');
    assert.equal(torrent.listenerCount('ready'), 0);
    const stream = observeTorrentStream(torrent, { offset: 50, name: 'private-fixture-name' }, 25, 74, 5)!;
    assert.equal(getTorrentDiagnostics(torrent)!.streams[0].nextPieceAvailable, true);
    stream.data(25); // Next byte is at torrent offset 100, in piece 1.
    const diagnostic = getTorrentDiagnostics(torrent)!;
    assert.equal(diagnostic.streams[0].bytesDelivered, 25);
    assert.equal(diagnostic.streams[0].nextPieceAvailable, false);
    assert.equal(diagnostic.streams[0].peersWithNextPiece, 1);
    assert.equal(diagnostic.metadataAlreadyAvailable, false);
    assert.ok(diagnostic.metadataObservedMs !== null);
    assert.ok(diagnostic.firstPeerObservedMs !== null);
    assert.equal(JSON.stringify(diagnostic).includes('private-fixture'), false);
    stream.data(25);
    stream.finish('ended');
    assert.equal(getTorrentDiagnostics(torrent)!.streams[0].nextPieceAvailable, null);
    assert.equal(getTorrentDiagnostics(torrent)!.streams[0].state, 'ended');
  } finally {
    if (previous === undefined) delete process.env.KINOROOM_STREAM_DIAGNOSTICS;
    else process.env.KINOROOM_STREAM_DIAGNOSTICS = previous;
  }
});

test('HTTP stream diagnostics reflect waiting, delivered bytes and cancellation (controlled fixture, no P2P)', async () => {
  const previous = process.env.KINOROOM_STREAM_DIAGNOSTICS;
  const previousClient = globalThis._webtorrentClient;
  process.env.KINOROOM_STREAM_DIAGNOSTICS = '1';
  const source = new Readable({ read() {} });
  const file = { name: 'fixture.mp4', offset: 0, length: 100, select() {}, createReadStream: () => source };
  const torrent = { ready: true, files: [file], numPeers: 2, pieceLength: 4,
    bitfield: { get: () => false }, wires: [{ peerPieces: { get: () => true } }] };
  globalThis._webtorrentClient = { get: async () => torrent };
  try {
    const response = await GET(new NextRequest('http://localhost/api/torrent/stream?torrent=fixture', { headers: { Range: 'bytes=6-99' } }));
    const before = (await getTorrentStatus('fixture')).diagnostics!;
    assert.equal(before.streams[0].firstByteMs, null);
    assert.equal(before.streams[0].nextPieceAvailable, false);
    assert.equal(before.streams[0].peersWithNextPiece, 1);
    const reader = response.body!.getReader();
    source.push(Buffer.from('6789'));
    assert.equal(Buffer.from((await reader.read()).value).toString(), '6789');
    const delivered = (await getTorrentStatus('fixture')).diagnostics!;
    assert.equal(delivered.streams[0].bytesDelivered, 4);
    assert.ok(delivered.streams[0].firstByteMs !== null);
    await reader.cancel();
    assert.equal(source.destroyed, true);
    assert.equal((await getTorrentStatus('fixture')).diagnostics!.streams[0].state, 'cancelled');
  } finally {
    source.destroy();
    globalThis._webtorrentClient = previousClient;
    if (previous === undefined) delete process.env.KINOROOM_STREAM_DIAGNOSTICS;
    else process.env.KINOROOM_STREAM_DIAGNOSTICS = previous;
  }
});

test('diagnostics are absent by default and disabled in production even with the flag', () => {
  const previousFlag = process.env.KINOROOM_STREAM_DIAGNOSTICS;
  const previousMode = process.env.NODE_ENV;
  try {
    delete process.env.KINOROOM_STREAM_DIAGNOSTICS;
    assert.equal(getTorrentDiagnostics({}), undefined);
    process.env.KINOROOM_STREAM_DIAGNOSTICS = '1';
    process.env.NODE_ENV = 'production';
    assert.equal(observeTorrentStream({}, {}, 0, 10, 0), undefined);
    assert.equal(getTorrentDiagnostics({}), undefined);
  } finally {
    if (previousFlag === undefined) delete process.env.KINOROOM_STREAM_DIAGNOSTICS;
    else process.env.KINOROOM_STREAM_DIAGNOSTICS = previousFlag;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  }
});

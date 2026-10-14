import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHttpRange } from '../src/lib/playback/httpRange';
import { Readable } from 'node:stream';
import { NextRequest } from 'next/server';
import { GET } from '../src/app/api/torrent/stream/route';

test('tail metadata requests address the final bytes of a media file', () => {
  assert.deepEqual(parseHttpRange('bytes=-128', 1000), { start: 872, end: 999 });
  assert.deepEqual(parseHttpRange('bytes=-2000', 1000), { start: 0, end: 999 });
});

test('stream route serves suffix bytes and rejects invalid ranges before reading (controlled fixture, no P2P)', async () => {
  const oldClient = globalThis._webtorrentClient;
  const bytes = Buffer.from('0123456789');
  let reads = 0;
  globalThis._webtorrentClient = { get: async () => ({ ready: true, files: [{
    name: 'fixture.mp4', length: bytes.length, select() { assert.fail('HTTP streaming must not select the whole file'); },
    createReadStream({ start, end }: { start: number; end: number }) {
      reads++;
      return Readable.from([bytes.subarray(start, end + 1)]);
    }
  }] }) };
  try {
    const response = await GET(new NextRequest('http://localhost/api/torrent/stream?torrent=fixture', { headers: { Range: 'bytes=-4' } }));
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 6-9/10');
    assert.equal(response.headers.get('content-length'), '4');
    assert.equal(await response.text(), '6789');
    const invalid = await GET(new NextRequest('http://localhost/api/torrent/stream?torrent=fixture', { headers: { Range: 'bytes=5-2' } }));
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */10');
    assert.equal(reads, 1);
  } finally {
    globalThis._webtorrentClient = oldClient;
  }
});

test('open and bounded seek ranges stay inside the file', () => {
  assert.deepEqual(parseHttpRange('bytes=750-', 1000), { start: 750, end: 999 });
  assert.deepEqual(parseHttpRange('bytes=750-2000', 1000), { start: 750, end: 999 });
  assert.deepEqual(parseHttpRange('bytes=0-0', 1000), { start: 0, end: 0 });
});

test('invalid and unsatisfiable ranges never reach a media read stream', () => {
  for (const value of ['bytes=-0', 'bytes=-', 'bytes=1000-', 'bytes=10-9', 'bytes=nope-20', 'bytes=0-1,4-5', 'items=0-1', 'bytes=9007199254740992-']) {
    assert.equal(parseHttpRange(value, 1000), null, value);
  }
  assert.equal(parseHttpRange('bytes=0-', 0), null);
});

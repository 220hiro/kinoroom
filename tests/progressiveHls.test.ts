import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readTorrentRangeInWindows } from '../src/lib/playback/torrentRangeReader';
import { hlsStartupReady, hlsStartAtBeginning, availableMediaDuration, parsePilotSeekSession, buildPilotSeekStreamSrc, computeTruePlaybackTime } from '../src/lib/playback/progressiveHls';

test('progressive startup waits for init and three complete segments; native start remains zero', () => {
  const head = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n';
  const one = '#EXTINF:4.000,\nseg00000.m4s\n';
  const three = head + one + '#EXTINF:4.000,\nseg00001.m4s\n#EXTINF:4.000,\nseg00002.m4s\n';
  assert.equal(hlsStartupReady(three, false), false);
  assert.equal(hlsStartupReady(head + one, true), false);
  assert.equal(hlsStartupReady(three.replace('seg00002.m4s', 'seg00002.m4s.tmp'), true), false);
  assert.equal(hlsStartupReady(three, true), true);
  assert.equal(hlsStartupReady(head + one + '#EXT-X-ENDLIST\n', true), true);
  assert.equal(hlsStartAtBeginning(hlsStartAtBeginning(three)).match(/EXT-X-START/g)?.length, 1);
  assert.equal(availableMediaDuration(Infinity, 24), 24);
  assert.equal(availableMediaDuration(Infinity, 0), 0);
  assert.equal(availableMediaDuration(Infinity, Infinity, 28), 28);
  assert.deepEqual(parsePilotSeekSession('/hls/master.m3u8'), { seekOffset: 0, filename: 'master.m3u8' });
  assert.deepEqual(parsePilotSeekSession('/hls/s2700/master.m3u8'), { seekOffset: 2700, filename: 'master.m3u8' });
  assert.deepEqual(parsePilotSeekSession('/hls/s2700/seg00001.m4s'), { seekOffset: 2700, filename: 'seg00001.m4s' });
  assert.deepEqual(parsePilotSeekSession('/hls/invalid/master.m3u8'), null);
  assert.equal(buildPilotSeekStreamSrc(0), '/api/torrent/hls-pilot/hls/master.m3u8');
  assert.equal(buildPilotSeekStreamSrc(2700), '/api/torrent/hls-pilot/hls/s2700/master.m3u8');
  assert.equal(computeTruePlaybackTime(15, 2700), 2715);
  assert.equal(computeTruePlaybackTime(15, 0), 15);
});

test('source Range reads are bounded, exact and release selection when cancelled', async () => {
  const bytes = Buffer.alloc(17, 32);
  const ranges: {start: number; end: number}[] = [];
  const readers: Readable[] = [];
  const file = { createReadStream(range: {start: number; end: number}) {
    ranges.push(range); const reader = Readable.from([bytes.subarray(range.start, range.end + 1)]); readers.push(reader); return reader;
  } };
  const received: Buffer[] = [];
  for await (const chunk of readTorrentRangeInWindows(file, 3, 15, new AbortController().signal, 4)) received.push(chunk);
  assert.deepEqual(Buffer.concat(received), bytes.subarray(3, 16));
  assert.deepEqual(ranges, [{start:3,end:6},{start:7,end:10},{start:11,end:14},{start:15,end:15}]);
  const iterator = readTorrentRangeInWindows(file, 0, 16, new AbortController().signal, 4);
  await iterator.next(); await iterator.return(undefined);
  assert.equal(readers.at(-1)?.destroyed, true);
});

test('aborting a missing torrent piece releases a blocked reader', async () => {
  const reader = new Readable({ read() {} });
  const abort = new AbortController();
  const iterator = readTorrentRangeInWindows({ createReadStream: () => reader }, 0, 100, abort.signal);
  const pending = iterator.next(); abort.abort();
  assert.deepEqual(await pending, { done: true, value: undefined });
  assert.equal(reader.destroyed, true);
});

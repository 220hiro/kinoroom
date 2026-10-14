import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hlsPilotEnabled, hlsPilotResource, sanitizePilotEvent } from '../src/lib/playback/hlsPilot';
import { GET } from '../src/app/api/torrent/hls-pilot/[...path]/route';

test('local HLS pilot is opt-in, unavailable on Vercel, and cannot proxy arbitrary paths', async () => {
  const previousFlag = process.env.KINOROOM_HLS_PILOT;
  const previousVercel = process.env.VERCEL;
  try {
    delete process.env.KINOROOM_HLS_PILOT;
    assert.equal(hlsPilotEnabled(), false);
    const disabled = await GET(new Request('http://localhost/api/torrent/hls-pilot/status'), { params: Promise.resolve({ path: ['status'] }) });
    assert.equal(disabled.status, 404);
    process.env.KINOROOM_HLS_PILOT = '1';
    delete process.env.VERCEL;
    assert.equal(hlsPilotEnabled(), true);
    process.env.VERCEL = '1';
    assert.equal(hlsPilotEnabled(), false);
    for (const path of [['..', 'status'], ['http:', 'example.com'], ['hls', '..', 'source'], ['source'], ['hls', 'seg00001.m4s', '..']]) {
      assert.equal(hlsPilotResource(path), null);
    }
    assert.equal(hlsPilotResource(['hls', 'seg00001.m4s']), 'hls/seg00001.m4s');
    assert.equal(hlsPilotResource(['hls', 's2700', 'master.m3u8']), 'hls/s2700/master.m3u8');
    assert.equal(hlsPilotResource(['hls', 's2700', 'init.mp4']), 'hls/s2700/init.mp4');
    assert.equal(hlsPilotResource(['hls', 's2700', 'seg00002.m4s']), 'hls/s2700/seg00002.m4s');
    assert.equal(hlsPilotResource(['hls', 'sabc', 'master.m3u8']), null);
  } finally {
    if (previousFlag === undefined) delete process.env.KINOROOM_HLS_PILOT; else process.env.KINOROOM_HLS_PILOT = previousFlag;
    if (previousVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previousVercel;
  }
});

test('pilot media observations discard URLs, identity, arbitrary errors and invalid values', () => {
  assert.deepEqual(sanitizePilotEvent({ event: 'playing', session: 10, currentTime: 2,
    readyState: 4, width: 1280, height: 720, elapsedMs: 40, bufferAhead: 5, duration: Infinity,
    src: 'https://private.invalid/?token=fixture', ip: 'private-fixture', errorCode: 999,
    message: 'private-fixture' }), { event: 'playing', session: 10, elapsedMs: 40,
    currentTime: 2, bufferAhead: 5, readyState: 4, width: 1280, height: 720 });
  assert.equal(sanitizePilotEvent({ event: 'private-fixture' }), null);
});

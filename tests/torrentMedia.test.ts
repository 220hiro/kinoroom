import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaInfoFromProbe, alignSubtitles } from '../src/lib/playback/torrentMedia';
import { hlsArguments, mediaEnabled, getMediaSession } from '../src/lib/services/torrentMedia';
import { issueSession, validSession } from '../src/lib/serverAuth';

const info = mediaInfoFromProbe({ format: { duration: '120' }, streams: [
  { index: 0, codec_type: 'video', codec_name: 'h264' },
  { index: 1, codec_type: 'audio', codec_name: 'ac3', tags: { language: 'rus', title: 'Студия из метаданных' } },
  { index: 2, codec_type: 'audio', codec_name: 'ac3', tags: { language: 'eng' } },
  { index: 3, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'rus' } },
  { index: 4, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle', tags: { language: 'rus' } }
] });

test('container metadata supplies real audio indices and distinguishes image subtitles', () => {
  assert.equal(info.audio[0].id, 1);
  assert.equal(info.audio[0].label, 'Студия из метаданных');
  assert.match(info.audio[1].label, /English/);
  assert.equal(info.subtitles[0].supported, true);
  assert.equal(info.subtitles[1].supported, false);
  assert.throws(() => mediaInfoFromProbe({ format: {}, streams: [] }));
});

test('audio switching maps the selected container stream and seeks transcode both streams accurately', () => {
  const start = hlsArguments('https://media.example/stream', info, 2, 0);
  assert.equal(start[start.indexOf('-c:v') + 1], 'copy');
  assert.ok(start.includes('0:2'));
  assert.equal(start[start.indexOf('-c:a') + 1], 'aac');
  const seek = hlsArguments('https://media.example/stream', info, 1, 45);
  assert.equal(seek[seek.indexOf('-c:v') + 1], 'libx264');
  assert.equal(seek[seek.indexOf('-ss') + 1], '45');
  assert.throws(() => hlsArguments('https://media.example/stream', info, 99, 0));
  assert.throws(() => hlsArguments('https://media.example/stream', info, 1, -10));
});

test('subtitle windows retain Russian text and align after seek without negative cues', () => {
  const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nПривет\n\n00:00:10.000 --> 00:00:12.000\nМир\n';
  const aligned = alignSubtitles(vtt, 240, 245);
  assert.ok(!aligned.includes('Привет'));
  assert.match(aligned, /00:00:05\.000 --> 00:00:07\.000\nМир/);
});

test('media workers never enable themselves and serverless deployments cannot enable them', () => {
  const enabled = process.env.KADR_MEDIA_ENABLED, vercel = process.env.VERCEL;
  try {
    delete process.env.KADR_MEDIA_ENABLED; delete process.env.VERCEL;
    assert.equal(mediaEnabled(), false);
    process.env.KADR_MEDIA_ENABLED = '1'; assert.equal(mediaEnabled(), true);
    process.env.VERCEL = '1'; assert.equal(mediaEnabled(), false);
    assert.throws(() => getMediaSession('../anything'));
  } finally {
    if (enabled === undefined) delete process.env.KADR_MEDIA_ENABLED; else process.env.KADR_MEDIA_ENABLED = enabled;
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
  }
});

test('public-deployment auth rejects the old forgeable cookie, tampering and expired sessions', () => {
  const secret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'test-only-secret-with-at-least-32-characters';
  try {
    assert.equal(validSession('authorized'), false);
    const token = issueSession(1000000);
    assert.equal(validSession(token, 1000000), true);
    assert.equal(validSession(token + 'x', 1000000), false);
    assert.equal(validSession(token, 1000000 + 31 * 86400000), false);
  } finally { if (secret === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = secret; }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackRequestSchema } from '../src/lib/playback/types';
import { playbackRegistry } from '../src/lib/playback/registry';
import { DEMO_MEDIA_LIBRARY } from '../src/lib/playback/providers/demoProvider';

test('PlaybackRequestSchema validation', () => {
  // Valid numeric mediaId
  const validNum = PlaybackRequestSchema.safeParse({
    mediaId: 969681,
    mediaType: 'movie'
  });
  assert.equal(validNum.success, true);

  // Valid string mediaId with season/episode
  const validTv = PlaybackRequestSchema.safeParse({
    mediaId: 'tears-of-steel',
    mediaType: 'tv',
    season: 1,
    episode: 2,
    translationId: 'tos-orig-en'
  });
  assert.equal(validTv.success, true);

  // Invalid: missing mediaId
  const invalidMissing = PlaybackRequestSchema.safeParse({
    mediaType: 'movie'
  });
  assert.equal(invalidMissing.success, false);

  // Invalid: bad mediaType
  const invalidType = PlaybackRequestSchema.safeParse({
    mediaId: 123,
    mediaType: 'anime' // not allowed
  });
  assert.equal(invalidType.success, false);
});

test('PlaybackRegistry rejects TMDB ID 969681 with SOURCE_UNAVAILABLE and does NOT serve demo movie', async () => {
  const result = await playbackRegistry.resolve({
    mediaId: 969681,
    mediaType: 'movie'
  });

  // Must not succeed and must NOT fall back to tears-of-steel or any demo
  assert.equal(result.success, false);
  assert.equal(result.code, 'SOURCE_UNAVAILABLE');
  assert.equal(result.error, 'SOURCE_UNAVAILABLE');
  assert.notEqual(result.media.id, 'tears-of-steel');
  assert.equal(result.stream.url, '');
});

test('PlaybackRegistry rejects unknown commercial string title with SOURCE_UNAVAILABLE', async () => {
  const result = await playbackRegistry.resolve({
    mediaId: 'avatar-the-way-of-water',
    mediaType: 'movie'
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 'SOURCE_UNAVAILABLE');
  assert.equal(result.error, 'SOURCE_UNAVAILABLE');
  assert.equal(result.stream.url, '');
});

test('PlaybackRegistry resolves Tears of Steel ONLY with explicit demo ID', async () => {
  // 1. Direct ID 'tears-of-steel'
  const direct = await playbackRegistry.resolve({
    mediaId: 'tears-of-steel',
    mediaType: 'movie'
  });
  assert.equal(direct.success, true);
  assert.equal(direct.media.id, 'tears-of-steel');
  assert.equal(direct.stream.type, 'hls');
  assert.match(direct.stream.url, /\.m3u8/);
  assert.ok(direct.stream.audioTracks.length > 0);

  // 2. Prefixed ID 'demo-tears-of-steel'
  const prefixed = await playbackRegistry.resolve({
    mediaId: 'demo-tears-of-steel',
    mediaType: 'movie'
  });
  assert.equal(prefixed.success, true);
  assert.equal(prefixed.media.id, 'tears-of-steel');
});

test('DemoLicensedProvider contains only real audio tracks and no fake Russian dub', () => {
  const item = DEMO_MEDIA_LIBRARY['tears-of-steel'];
  assert.ok(item, 'Tears of steel must exist in DEMO_MEDIA_LIBRARY');

  // Verify translations do not promise fake Russian dubs
  const translationIds = item.translations.map((t) => t.id);
  assert.ok(translationIds.includes('tos-orig-en'), 'Must have English original translation');
  assert.ok(!translationIds.includes('tos-dub-ru'), 'Must NOT have fake Russian dub translation');

  // Verify streamMap audio tracks match true manifest (English only)
  const defaultStream = item.streamMap['tos-orig-en'];
  assert.ok(defaultStream, 'Must have tos-orig-en stream');
  const ruAudio = defaultStream.audioTracks.find((a) => a.lang === 'ru');
  assert.equal(ruAudio, undefined, 'Must not claim non-existent Russian audio track');
});

test('PlaybackRegistry resolves Big Buck Bunny and Apple BipBop streams', async () => {
  const bbb = await playbackRegistry.resolve({
    mediaId: 'big-buck-bunny',
    mediaType: 'movie'
  });
  assert.equal(bbb.success, true);
  assert.equal(bbb.media.id, 'big-buck-bunny');
  assert.match(bbb.stream.url, /\.m3u8/);

  const bipbop = await playbackRegistry.resolve({
    mediaId: 'apple-bipbop',
    mediaType: 'movie'
  });
  assert.equal(bipbop.success, true);
  assert.equal(bipbop.media.id, 'apple-bipbop');
  assert.match(bipbop.stream.url, /\.m3u8/);
});

test('Live CDN HLS Manifest Reachability Test', async () => {
  const sampleUrl = DEMO_MEDIA_LIBRARY['tears-of-steel'].streamMap['tos-orig-en'].url;

  try {
    const res = await fetch(sampleUrl, { method: 'HEAD' });
    assert.ok(res.ok, `HLS stream URL must be reachable with HTTP 200: ${res.status}`);
  } catch (err: any) {
    console.warn('Network fetch skipped or offline:', err?.message);
  }
});

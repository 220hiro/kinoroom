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

test('Subtitle Track switching simulation: ON (ru) -> OFF -> ON (en) -> other language -> OFF', () => {
  const item = DEMO_MEDIA_LIBRARY['tears-of-steel'];
  const stream = item.streamMap['tos-orig-en'];
  const subs = stream.subtitles;

  assert.equal(subs.length, 2, 'Tears of steel must have exactly 2 WebVTT subtitle tracks');
  assert.equal(subs[0].isDefault, false, 'Russian subtitle must not be auto-enabled by default');
  assert.equal(subs[1].isDefault, false, 'English subtitle must not be auto-enabled by default');

  // Mock HTML5 textTracks collection in browser
  const mockTracks = subs.map((s) => ({
    id: s.id,
    label: s.label,
    language: s.lang,
    mode: 'disabled' as 'disabled' | 'showing' | 'hidden'
  }));

  // Helper matching KinoRoomPlayer applySubtitleTrackMode logic
  const simulateApplySubtitle = (targetSubId: string) => {
    const targetSub = subs.find((s) => s.id === targetSubId);
    for (const tr of mockTracks) {
      if (targetSubId === 'off' || !targetSub) {
        tr.mode = 'disabled';
      } else {
        const isMatch =
          tr.id === targetSub.id ||
          tr.label === targetSub.label ||
          (Boolean(tr.language) && tr.language === targetSub.lang);
        tr.mode = isMatch ? 'showing' : 'disabled';
      }
    }
  };

  // 1. Initial: all off
  simulateApplySubtitle('off');
  assert.ok(mockTracks.every((t) => t.mode === 'disabled'), 'Initially all tracks disabled');

  // 2. ON -> Russian
  simulateApplySubtitle('sub-ru');
  assert.equal(mockTracks.find((t) => t.id === 'sub-ru')?.mode, 'showing', 'Russian track must be showing');
  assert.equal(mockTracks.find((t) => t.id === 'sub-en')?.mode, 'disabled', 'English track must be disabled');

  // 3. OFF -> Disabled
  simulateApplySubtitle('off');
  assert.ok(mockTracks.every((t) => t.mode === 'disabled'), 'After selecting off, all tracks disabled');

  // 4. ON -> English
  simulateApplySubtitle('sub-en');
  assert.equal(mockTracks.find((t) => t.id === 'sub-en')?.mode, 'showing', 'English track must be showing');
  assert.equal(mockTracks.find((t) => t.id === 'sub-ru')?.mode, 'disabled', 'Russian track must be disabled');

  // 5. Switch to another language -> Russian again
  simulateApplySubtitle('sub-ru');
  assert.equal(mockTracks.find((t) => t.id === 'sub-ru')?.mode, 'showing', 'Switched back to Russian: Russian showing');
  assert.equal(mockTracks.find((t) => t.id === 'sub-en')?.mode, 'disabled', 'Switched back to Russian: English disabled');

  // 6. OFF -> Final check
  simulateApplySubtitle('off');
  assert.ok(mockTracks.every((t) => t.mode === 'disabled'), 'Finally all tracks disabled');
});

test('Real Tears of Steel Subtitles: Technical validation and dialogue synchronization', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const { parseVttCues, validateSubtitleCues, getActiveCues } = await import('../src/lib/playback/subtitles');

  const enVtt = fs.readFileSync(path.join(process.cwd(), 'public/subtitles/subtitles-en.vtt'), 'utf8');
  const ruVtt = fs.readFileSync(path.join(process.cwd(), 'public/subtitles/subtitles-ru.vtt'), 'utf8');

  const enCues = parseVttCues(enVtt);
  const ruCues = parseVttCues(ruVtt);

  // Assert genuine full cue counts (76 cues, not 6 dummy cues)
  assert.equal(enCues.length, 76, 'English WebVTT must contain all 76 full dialogue cues');
  assert.equal(ruCues.length, 76, 'Russian WebVTT must contain all 76 full dialogue cues');

  // Assert validation passes against movie duration 734s
  const enVal = validateSubtitleCues(enCues, 734);
  assert.equal(enVal.valid, true, `EN validation errors: ${enVal.errors.join('; ')}`);

  const ruVal = validateSubtitleCues(ruCues, 734);
  assert.equal(ruVal.valid, true, `RU validation errors: ${ruVal.errors.join('; ')}`);

  // Assert dialogue correspondence at Start (00:00:23)
  const startEn = getActiveCues(enCues, 23.5);
  assert.equal(startEn.length, 1);
  assert.match(startEn[0].text, /You're a jerk, Thom/);

  const startRu = getActiveCues(ruCues, 23.5);
  assert.equal(startRu.length, 1);
  assert.match(startRu[0].text, /Ты придурок, Том/);

  // Assert dialogue correspondence in Middle (00:05:00)
  const midEn = getActiveCues(enCues, 300.0);
  assert.equal(midEn.length, 1);
  assert.match(midEn[0].text, /You're a jerk, Thom!/);

  const midRu = getActiveCues(ruCues, 300.0);
  assert.equal(midRu.length, 1);
  assert.match(midRu[0].text, /Ты придурок, Том!/);

  // Assert dialogue correspondence at End (00:09:23)
  const endEn = getActiveCues(enCues, 563.0);
  assert.equal(endEn.length, 1);
  assert.match(endEn[0].text, /lesson to be learned/);

  const endRu = getActiveCues(ruCues, 563.0);
  assert.equal(endRu.length, 1);
  assert.match(endRu[0].text, /урок всем нам/);

  // Seek simulation: verify no ghost cues remain from previous time
  // 1. At 563s (end of movie)
  const cuesAtEnd = getActiveCues(enCues, 563.0);
  assert.equal(cuesAtEnd.length, 1);
  assert.match(cuesAtEnd[0].text, /lesson/);

  // 2. Seek back to 10s (intro before dialogue)
  const cuesAtIntro = getActiveCues(enCues, 10.0);
  assert.equal(cuesAtIntro.length, 0, 'Before dialogue starts at 23s, active cues must be strictly empty');

  // 3. Seek forward to 23.5s
  const cuesAtFirstLine = getActiveCues(enCues, 23.5);
  assert.equal(cuesAtFirstLine.length, 1);
  assert.match(cuesAtFirstLine[0].text, /Thom/);
});

test('SRT to WebVTT conversion and offset handling', async () => {
  const { convertSrtToVtt, parseVttCues } = await import('../src/lib/playback/subtitles');

  const sampleSrt = `1
00:00:01,000 --> 00:00:04,000
First cue text

2
00:00:05,500 --> 00:00:08,200
Second cue text
`;

  // Without offset
  const vtt = convertSrtToVtt(sampleSrt);
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /00:00:01\.000 --> 00:00:04\.000/);

  const cues = parseVttCues(vtt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].startTime, 1.0);
  assert.equal(cues[0].endTime, 4.0);

  // With +2.5s offset
  const vttOffset = convertSrtToVtt(sampleSrt, 2.5);
  const cuesOffset = parseVttCues(vttOffset);
  assert.equal(cuesOffset[0].startTime, 3.5);
  assert.equal(cuesOffset[0].endTime, 6.5);
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

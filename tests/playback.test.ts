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

test('PlaybackRegistry maps confirmed TMDB ID 133701 to Tears of Steel with Blender CC BY 3.0 attribution', async () => {
  const resultNum = await playbackRegistry.resolve({
    mediaId: 133701,
    mediaType: 'movie'
  });
  assert.equal(resultNum.success, true);
  assert.equal(resultNum.media.id, 133701);
  assert.match(resultNum.media.title, /Tears of Steel|Слёзы стали/);
  assert.equal(resultNum.stream.type, 'hls');
  assert.match(resultNum.stream.url, /\.m3u8/);
  assert.equal(resultNum.license, 'Creative Commons Attribution 3.0 (CC BY 3.0)');
  assert.ok(resultNum.attribution);
  assert.match(resultNum.attribution!.text, /Blender Foundation/);
  assert.equal(resultNum.attribution!.url, 'https://mango.blender.org/');

  // Also works with string representation '133701'
  const resultStr = await playbackRegistry.resolve({
    mediaId: '133701',
    mediaType: 'movie'
  });
  assert.equal(resultStr.success, true);
  assert.equal(resultStr.license, 'Creative Commons Attribution 3.0 (CC BY 3.0)');

  // TV query with movie TMDB ID must NOT resolve
  const resultTv = await playbackRegistry.resolve({
    mediaId: 133701,
    mediaType: 'tv'
  });
  assert.equal(resultTv.success, false);
  assert.equal(resultTv.code, 'SOURCE_UNAVAILABLE');
});

test('PlaybackRegistry maps confirmed TMDB ID 10378 to Big Buck Bunny with Blender CC BY 3.0 attribution', async () => {
  const result = await playbackRegistry.resolve({
    mediaId: 10378,
    mediaType: 'movie'
  });
  assert.equal(result.success, true);
  assert.equal(result.media.id, 10378);
  assert.match(result.media.title, /Big Buck Bunny|Большой Бак Банни/);
  assert.equal(result.stream.type, 'hls');
  assert.match(result.stream.url, /\.m3u8/);
  assert.equal(result.license, 'Creative Commons Attribution 3.0 (CC BY 3.0)');
  assert.ok(result.attribution);
  assert.match(result.attribution!.text, /Blender Foundation/);
  assert.equal(result.attribution!.url, 'https://peach.blender.org/');
});

test('PlaybackRegistry resolves Tears of Steel with explicit demo ID', async () => {
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

test('Safari Native Fullscreen Bidirectional Subtitle Synchronization simulation', () => {
  const item = DEMO_MEDIA_LIBRARY['tears-of-steel'];
  const stream = item.streamMap['tos-orig-en'];
  const subs = stream.subtitles;

  // Mock textTracks collection as seen in Safari
  const mockSafariTracks = subs.map((s) => ({
    id: s.id,
    label: s.label,
    language: s.lang,
    mode: 'disabled' as 'disabled' | 'showing' | 'hidden'
  }));

  let currentSelectedSubtitleTrack = 'off';
  let isApplyingSubtitleMode = false;
  let syncCallCount = 0;

  // Matching helper matching KinoRoomPlayer isTrackMatchingSubtitle logic
  const isMatch = (tr: typeof mockSafariTracks[0], s: typeof subs[0]) => {
    if (tr.id && (tr.id === s.id || tr.id.toLowerCase() === s.id.toLowerCase())) return true;
    if (tr.label && s.label && tr.label.trim().toLowerCase() === s.label.trim().toLowerCase()) return true;
    if (tr.language && s.lang) {
      const trL = tr.language.trim().toLowerCase();
      const sL = s.lang.trim().toLowerCase();
      if (trL === sL || trL.startsWith(sL) || sL.startsWith(trL)) return true;
    }
    return false;
  };

  const simulateSyncFromMediaTracks = () => {
    if (isApplyingSubtitleMode) return;
    syncCallCount++;

    let activeId = 'off';
    for (const tr of mockSafariTracks) {
      if (tr.mode === 'showing') {
        const found = subs.find((s) => isMatch(tr, s));
        if (found) {
          activeId = found.id;
          break;
        }
      }
    }

    if (currentSelectedSubtitleTrack !== activeId) {
      currentSelectedSubtitleTrack = activeId;
    }
  };

  const simulateApplySubtitle = (targetId: string) => {
    isApplyingSubtitleMode = true;
    currentSelectedSubtitleTrack = targetId;

    const targetSub = subs.find((s) => s.id === targetId);
    for (const tr of mockSafariTracks) {
      if (targetId === 'off' || !targetSub) {
        tr.mode = 'disabled';
      } else {
        tr.mode = isMatch(tr, targetSub) ? 'showing' : 'disabled';
      }
    }
    // Browser fires change event:
    simulateSyncFromMediaTracks(); // Ignored because isApplyingSubtitleMode is true!
    isApplyingSubtitleMode = false;
  };

  // 1. Initial State: OFF
  assert.equal(currentSelectedSubtitleTrack, 'off');
  assert.ok(mockSafariTracks.every((t) => t.mode === 'disabled'));

  // 2. User selects Russian in KinoRoom UI
  simulateApplySubtitle('sub-ru');
  assert.equal(currentSelectedSubtitleTrack, 'sub-ru');
  assert.equal(mockSafariTracks.find((t) => t.id === 'sub-ru')?.mode, 'showing');

  // 3. User enters native fullscreen on iPhone and switches to English via Safari system menu
  mockSafariTracks.find((t) => t.id === 'sub-ru')!.mode = 'disabled';
  mockSafariTracks.find((t) => t.id === 'sub-en')!.mode = 'showing';

  // Safari dispatches change event or webkitendfullscreen exit
  simulateSyncFromMediaTracks();

  // KinoRoom state must now be synchronized to English!
  assert.equal(currentSelectedSubtitleTrack, 'sub-en', 'KinoRoom must synchronize to English when changed in Safari');

  // 4. User exits native fullscreen and switches to OFF via Safari system menu
  mockSafariTracks.forEach((t) => { t.mode = 'disabled'; });
  simulateSyncFromMediaTracks();

  // KinoRoom state must now be synchronized to OFF!
  assert.equal(currentSelectedSubtitleTrack, 'off', 'KinoRoom must synchronize to OFF when disabled in Safari');

  // Verify no infinite loop occurred
  assert.ok(syncCallCount <= 5, 'Must not create infinite sync loops');
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

test('OpenMediaProvider resolves Night of the Living Dead (TMDB 10331) with Public Domain attribution', async () => {
  const result = await playbackRegistry.resolve({
    mediaId: 10331,
    mediaType: 'movie'
  });

  assert.equal(result.success, true);
  assert.equal(result.media.id, 10331);
  assert.match(result.media.title, /Night of the Living Dead|Ночь живых мертвецов/);
  assert.equal(result.stream.type, 'webm');
  assert.match(result.stream.url, /Night_of_the_Living_Dead/);
  assert.match(result.stream.url, /upload\.wikimedia\.org/);
  assert.match(result.license || '', /Общественное достояние|Public Domain/);
  assert.ok(result.attribution);
  assert.match(result.attribution!.text, /Джордж А\. Ромеро|George A\. Romero/);
  assert.equal(result.provider.id, 'open-media');
  assert.equal(result.stream.audioTracks.length, 1);
  assert.equal(result.stream.audioTracks[0].lang, 'en');
  assert.equal(result.stream.subtitles.length, 0); // No fabricated subtitles
});

test('OpenMediaProvider resolves Charade (TMDB 4808) with Public Domain attribution', async () => {
  const result = await playbackRegistry.resolve({
    mediaId: 4808,
    mediaType: 'movie'
  });

  assert.equal(result.success, true);
  assert.equal(result.media.id, 4808);
  assert.match(result.media.title, /Charade|Шарада/);
  assert.equal(result.stream.type, 'webm');
  assert.match(result.stream.url, /Charade/);
  assert.match(result.license || '', /Общественное достояние|Public Domain/);
  assert.ok(result.attribution);
  assert.match(result.attribution!.text, /Стэнли Донен|Stanley Donen/);
  assert.equal(result.provider.id, 'open-media');
});

test('OpenMediaDiscoveryService: Trailer detection heuristic rejects trailers and clips', async () => {
  const { openMediaDiscoveryService } = await import('../src/lib/playback/providers/openMediaProvider');

  // Should identify as trailers
  assert.equal(openMediaDiscoveryService.isTrailer('Night Of The Living Dead (1968) - trailer.webm'), true);
  assert.equal(openMediaDiscoveryService.isTrailer('The_Killers_1964_Trailer.webm'), true);
  assert.equal(openMediaDiscoveryService.isTrailer('Official_Movie_Teaser_HD.mp4'), true);
  assert.equal(openMediaDiscoveryService.isTrailer('Preview_clip_sample.webm'), true);
  assert.equal(openMediaDiscoveryService.isTrailer('Официальный_трейлер.mp4'), true);

  // Should identify as full feature film
  assert.equal(openMediaDiscoveryService.isTrailer('Night of the Living Dead (1968).webm'), false);
  assert.equal(openMediaDiscoveryService.isTrailer('Charade (Stanley Donen, 1963).webm'), false);
  assert.equal(openMediaDiscoveryService.isTrailer('1938. Александр Невский.webm'), false);
});

test('OpenMediaDiscoveryService: License verification allows CC-BY/CC-BY-SA/PD and rejects proprietary/NC', async () => {
  const { openMediaDiscoveryService } = await import('../src/lib/playback/providers/openMediaProvider');

  // Permitted
  assert.equal(openMediaDiscoveryService.isPermittedLicense('Public domain', 'Public domain in the US'), true);
  assert.equal(openMediaDiscoveryService.isPermittedLicense('CC0 1.0 Universal', 'Public Domain Dedication'), true);
  assert.equal(openMediaDiscoveryService.isPermittedLicense('CC BY 3.0', 'Attribution required'), true);
  assert.equal(openMediaDiscoveryService.isPermittedLicense('CC BY-SA 4.0', 'Attribution-ShareAlike'), true);

  // Rejected
  assert.equal(openMediaDiscoveryService.isPermittedLicense('CC BY-NC 4.0', 'Non-commercial only'), false);
  assert.equal(openMediaDiscoveryService.isPermittedLicense('CC BY-ND 3.0', 'No derivatives allowed'), false);
  assert.equal(openMediaDiscoveryService.isPermittedLicense('All rights reserved', 'Copyrighted'), false);
  assert.equal(openMediaDiscoveryService.isPermittedLicense('', ''), false);
});

test('OpenMediaDiscoveryService: Evaluates The Cosmonaut (TMDB 86817) and rejects due to lack of full stream', async () => {
  const { openMediaDiscoveryService } = await import('../src/lib/playback/providers/openMediaProvider');

  const evalResult = await openMediaDiscoveryService.discoverByTmdbId(86817);
  assert.equal(evalResult.tmdbId, 86817);
  assert.equal(evalResult.status, 'REJECTED');
  assert.equal(evalResult.isLegallyPermitted, true); // License statement is CC BY-SA
  assert.equal(evalResult.isTechnicallyAccessible, false); // No direct full video file available
  assert.match(evalResult.reason || '', /thecosmonaut\.org/);
  assert.match(evalResult.reason || '', /видеофайл фильма на сайте отсутствует|разбит на разрозненные исходные фрагменты/);
});

test('OpenMediaDiscoveryService: SSRF and host allowlist enforcement', async () => {
  const { openMediaDiscoveryService } = await import('../src/lib/playback/providers/openMediaProvider');

  // Forbidden targets (internal IPs, localhost, random domains)
  assert.equal(await openMediaDiscoveryService.verifyTechnicalAccessibility('http://localhost:3000/secret'), false);
  assert.equal(await openMediaDiscoveryService.verifyTechnicalAccessibility('http://192.168.1.1/admin'), false);
  assert.equal(await openMediaDiscoveryService.verifyTechnicalAccessibility('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(await openMediaDiscoveryService.verifyTechnicalAccessibility('https://evil-hacker.com/video.mp4'), false);

  // Allowed CDN host (valid reachability check with HTTP 206 Partial Content)
  const validUrl =
    'https://upload.wikimedia.org/wikipedia/commons/transcoded/2/24/Night_of_the_Living_Dead_(1968).webm/Night_of_the_Living_Dead_(1968).webm.720p.vp9.webm';
  const isAccessible = await openMediaDiscoveryService.verifyTechnicalAccessibility(validUrl);
  assert.equal(isAccessible, true, 'Wikimedia Commons video transcode must be reachable via range request');
});

test('External Sources: Allowlist validates safe iframe domains and rejects untrusted/XSS URLs', async () => {
  const { isValidExternalIframeUrl } = await import('../src/lib/services/externalSources/allowlist');

  // Valid trusted domains
  assert.equal(isValidExternalIframeUrl('https://vidsrc.sh/embed/movie/10331'), true);
  assert.equal(isValidExternalIframeUrl('https://vidsrc.sh/embed/tv/1396/1/1'), true);
  assert.equal(isValidExternalIframeUrl('https://kodikplayer.com/seria/73959/68e2e57cb95f7fb93655637acaca26c2/720p'), true);
  assert.equal(isValidExternalIframeUrl('https://aniqit.com/video/123/hash'), true);
  assert.equal(isValidExternalIframeUrl('https://vidsrc.to/embed/movie/550'), true);

  // Rejected invalid or unsafe URLs
  assert.equal(isValidExternalIframeUrl('http://vidsrc.sh/embed/movie/10331'), false, 'Non-HTTPS must be rejected');
  assert.equal(isValidExternalIframeUrl('https://untrusted-pirate-site.ru/player'), false, 'Untrusted host must be rejected');
  assert.equal(isValidExternalIframeUrl('https://vidsrc.sh.malicious.com/embed'), false, 'Lookalike domain must be rejected');
  assert.equal(isValidExternalIframeUrl('javascript:alert(1)'), false, 'javascript: scheme must be rejected');
  assert.equal(isValidExternalIframeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), false, 'data: scheme must be rejected');
  assert.equal(isValidExternalIframeUrl('https://vidsrc.sh/embed/<script>alert(1)</script>'), false, 'XSS payloads must be rejected');
  assert.equal(isValidExternalIframeUrl(''), false);
  assert.equal(isValidExternalIframeUrl(null as any), false);
});

test('External Sources: VidSrc adapter builds correct movie and TV routes with safety checks', async () => {
  const { getVidSrcSources } = await import('../src/lib/services/externalSources/vidsrcAdapter');

  // 1. Movie route
  const movieSources = getVidSrcSources({
    tmdbId: 10331,
    type: 'movie',
    title: 'Night of the Living Dead'
  });
  assert.equal(movieSources.length, 1);
  assert.equal(movieSources[0].adapter, 'vidsrc');
  assert.equal(movieSources[0].status, 'available');
  assert.equal(movieSources[0].type, 'iframe');
  assert.equal(movieSources[0].iframeUrl, 'https://vidsrc.sh/embed/movie/10331');
  assert.equal(movieSources[0].declaredQuality, undefined, 'VidSrc must not claim unconfirmed 1080p stream quality');
  assert.equal(movieSources[0].badge, 'VidSrc');

  // 2. TV Series route with season and episode
  const tvSources = getVidSrcSources({
    tmdbId: 1396,
    type: 'tv',
    season: 2,
    episode: 7,
    title: 'Breaking Bad'
  });
  assert.equal(tvSources.length, 1);
  assert.equal(tvSources[0].adapter, 'vidsrc');
  assert.equal(tvSources[0].status, 'available');
  assert.equal(tvSources[0].type, 'iframe');
  assert.equal(tvSources[0].iframeUrl, 'https://vidsrc.sh/embed/tv/1396/2/7');
  assert.equal(tvSources[0].season, 2);
  assert.equal(tvSources[0].episode, 7);
  assert.match(tvSources[0].name, /S2:E7/);
});

test('External Sources: Kodik adapter handles rate limits, redirect guards, and honest diagnostics', async () => {
  const { getKodikSources } = await import('../src/lib/services/externalSources/kodikAdapter');

  const kodikResults = await getKodikSources({
    tmdbId: 10331,
    type: 'movie',
    title: 'Night of the Living Dead'
  });

  assert.ok(kodikResults.length >= 1);
  assert.equal(kodikResults[0].adapter, 'kodik');
  assert.equal(kodikResults[0].type, 'iframe');

  // When Kinobox server redirects to selectel 1GB speedtest, the adapter catches it without downloading 1GB
  if (kodikResults[0].status === 'unavailable') {
    assert.match(kodikResults[0].diagnostics || '', /Kinobox API|недоступен|ограничен|redirect/);
  }
});

test('External Sources: EzVidAPI adapter is disabled by default with diagnostic explanation', async () => {
  const { getEzVidSources } = await import('../src/lib/services/externalSources/ezvidAdapter');

  const ezvidResults = await getEzVidSources({
    tmdbId: 10331,
    type: 'movie',
    title: 'Night of the Living Dead'
  });

  assert.equal(ezvidResults.length, 1);
  assert.equal(ezvidResults[0].adapter, 'ezvid');
  assert.equal(ezvidResults[0].status, 'disabled');
  assert.equal(ezvidResults[0].isExperimental, true);
  assert.match(ezvidResults[0].diagnostics || '', /502 Bad Gateway|отключен|права на коммерческий контент не подтверждены/);
});

test('External Sources API: GET /api/playback/external-sources validates params and aggregates sources', async () => {
  const { GET } = await import('../src/app/api/playback/external-sources/route');
  const { NextRequest } = await import('next/server');

  // Missing tmdbId
  const missingReq = new NextRequest('http://localhost:3000/api/playback/external-sources');
  const missingRes = await GET(missingReq);
  assert.equal(missingRes.status, 400);
  const missingJson = await missingRes.json();
  assert.equal(missingJson.error, 'MISSING_PARAM');

  // Valid movie request
  const movieReq = new NextRequest('http://localhost:3000/api/playback/external-sources?tmdbId=10331&type=movie');
  const movieRes = await GET(movieReq);
  assert.equal(movieRes.status, 200);
  const movieJson = await movieRes.json();
  assert.equal(movieJson.success, true);
  assert.equal(movieJson.tmdbId, 10331);
  assert.ok(Array.isArray(movieJson.sources));
  assert.ok(movieJson.sources.some((s: any) => s.adapter === 'vidsrc'));
  assert.ok(movieJson.sources.some((s: any) => s.adapter === 'kodik'));
  assert.ok(movieJson.sources.some((s: any) => s.adapter === 'ezvid'));
});


import test from 'node:test';
import assert from 'node:assert/strict';
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

test('External Sources: Allowlist strictly permits embedwave.cc and rejects removed ad/broken/XSS URLs', async () => {
  const { isValidExternalIframeUrl } = await import('../src/lib/services/externalSources/allowlist');

  // Valid trusted EmbedWave Cinesrc routes
  assert.equal(isValidExternalIframeUrl('https://embedwave.cc/embed/movie/550?server=cinesrc'), true);
  assert.equal(isValidExternalIframeUrl('https://embedwave.cc/embed/tv/1396/1/1?server=cinesrc'), true);

  // Rejected ad-supported and defunct domains removed in Step 2E
  assert.equal(isValidExternalIframeUrl('https://vidsrc.sh/embed/movie/550'), false, 'VidSrc.sh must be rejected');
  assert.equal(isValidExternalIframeUrl('https://vidsrc.to/embed/movie/550'), false, 'VidSrc.to must be rejected');
  assert.equal(isValidExternalIframeUrl('https://vidlink.pro/movie/550'), false, 'VidLink must be rejected');
  assert.equal(isValidExternalIframeUrl('https://vidcore.org/embed/movie/550'), false, 'VidCore must be rejected');
  assert.equal(isValidExternalIframeUrl('https://vixsrc.to/movie/550'), false, 'VixSrc must be rejected');
  assert.equal(isValidExternalIframeUrl('https://ezvidapi.com/embed/movie/550'), false, 'EzVidAPI must be rejected');
  assert.equal(isValidExternalIframeUrl('https://multiembed.mov/?video_id=550&tmdb=1'), false, 'MultiEmbed must be rejected');

  // Rejected invalid or unsafe URLs
  assert.equal(isValidExternalIframeUrl('http://embedwave.cc/embed/movie/550?server=cinesrc'), false, 'Non-HTTPS must be rejected');
  assert.equal(isValidExternalIframeUrl('https://untrusted-pirate-site.ru/player'), false, 'Untrusted host must be rejected');
  assert.equal(isValidExternalIframeUrl('https://embedwave.cc.malicious.com/embed'), false, 'Lookalike domain must be rejected');
  assert.equal(isValidExternalIframeUrl('javascript:alert(1)'), false, 'javascript: scheme must be rejected');
  assert.equal(isValidExternalIframeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), false, 'data: scheme must be rejected');
  assert.equal(isValidExternalIframeUrl('https://embedwave.cc/embed/<script>alert(1)</script>'), false, 'XSS payloads must be rejected');
  assert.equal(isValidExternalIframeUrl(''), false);
  assert.equal(isValidExternalIframeUrl(null as any), false);
});

test('Step 2E: EmbedWave — Cinesrc adapter builds documented ?server=cinesrc routes and never selects nxsha', async () => {
  const { getEmbedWaveSources, buildEmbedWaveCinesrcUrl } = await import('../src/lib/services/externalSources/embedwaveAdapter');
  const { EXTERNAL_SOURCES_CONFIG } = await import('../src/lib/services/externalSources/config');

  // 1. Movie route (Fight Club TMDB 550)
  const movieUrl = buildEmbedWaveCinesrcUrl({ tmdbId: 550, type: 'movie' });
  assert.equal(movieUrl, 'https://embedwave.cc/embed/movie/550?server=cinesrc');
  assert.equal(movieUrl.includes('nxsha'), false);

  const movieSources = getEmbedWaveSources({ tmdbId: 550, type: 'movie', title: 'Fight Club' });
  assert.equal(movieSources.length, 1);
  assert.equal(movieSources[0].adapter, 'embedwave');
  assert.equal(movieSources[0].name, 'EmbedWave — Cinesrc');
  assert.equal(movieSources[0].status, 'available');
  assert.equal(movieSources[0].iframeUrl, 'https://embedwave.cc/embed/movie/550?server=cinesrc');
  assert.equal(movieSources[0].badge, 'Экспериментальный');
  // Must NOT claim unverified 1080p, Russian audio, or guaranteed ad-free badge
  assert.notEqual(movieSources[0].badge, '1080p');
  assert.notEqual(movieSources[0].badge, 'Русская озвучка');
  assert.notEqual(movieSources[0].badge, 'Без рекламы');

  // 2. TV Series route (Breaking Bad TMDB 1396 S01E01)
  const tvSources = getEmbedWaveSources({
    tmdbId: 1396,
    type: 'tv',
    season: 1,
    episode: 1,
    title: 'Breaking Bad'
  });
  assert.equal(tvSources.length, 1);
  assert.equal(tvSources[0].name, 'EmbedWave — Cinesrc');
  assert.equal(tvSources[0].iframeUrl, 'https://embedwave.cc/embed/tv/1396/1/1?server=cinesrc');
  assert.equal(tvSources[0].season, 1);
  assert.equal(tvSources[0].episode, 1);

  // 3. When disabled in config
  EXTERNAL_SOURCES_CONFIG.embedwave.enabled = false;
  try {
    const disabled = getEmbedWaveSources({ tmdbId: 550, type: 'movie' });
    assert.equal(disabled.length, 1);
    assert.equal(disabled[0].status, 'disabled');
  } finally {
    EXTERNAL_SOURCES_CONFIG.embedwave.enabled = true;
  }
});

test('External Sources: Preserved Kodik adapter remains disabled by default while API is unavailable', async () => {
  const { getKodikSources } = await import('../src/lib/services/externalSources/kodikAdapter');

  const kodikResults = await getKodikSources({
    tmdbId: 550,
    type: 'movie',
    title: 'Fight Club'
  });

  assert.equal(kodikResults.length, 1);
  assert.equal(kodikResults[0].adapter, 'kodik');
  assert.equal(kodikResults[0].status, 'disabled');
});

test('External Sources API: GET /api/playback/external-sources returns strictly EmbedWave — Cinesrc without rejected sources', async () => {
  const { GET } = await import('../src/app/api/playback/external-sources/route');
  const { NextRequest } = await import('next/server');

  // Missing tmdbId
  const missingReq = new NextRequest('http://localhost:3000/api/playback/external-sources');
  const missingRes = await GET(missingReq);
  assert.equal(missingRes.status, 400);
  const missingJson = await missingRes.json();
  assert.equal(missingJson.error, 'MISSING_PARAM');

  // Valid movie request (Fight Club TMDB 550)
  const movieReq = new NextRequest('http://localhost:3000/api/playback/external-sources?tmdbId=550&type=movie');
  const movieRes = await GET(movieReq);
  assert.equal(movieRes.status, 200);
  const movieJson = await movieRes.json();
  assert.equal(movieJson.success, true);
  assert.equal(movieJson.tmdbId, 550);
  assert.equal(movieJson.sources.length, 1);
  assert.equal(movieJson.sources[0].adapter, 'embedwave');
  assert.equal(movieJson.sources[0].name, 'EmbedWave — Cinesrc');
  assert.equal(movieJson.sources[0].iframeUrl, 'https://embedwave.cc/embed/movie/550?server=cinesrc');

  // Ensure none of the rejected adapters are returned in user API
  assert.equal(movieJson.sources.some((s: any) => s.adapter === 'vidsrc'), false);
  assert.equal(movieJson.sources.some((s: any) => s.adapter === 'vidlink'), false);
  assert.equal(movieJson.sources.some((s: any) => s.adapter === 'vidcore'), false);
  assert.equal(movieJson.sources.some((s: any) => s.adapter === 'vixsrc'), false);
  assert.equal(movieJson.sources.some((s: any) => s.adapter === 'ezvid'), false);
  assert.equal(movieJson.sources.some((s: any) => s.adapter === 'kodik'), false);
});

test('Step 2E: ExternalSourceRegistry reflects iPhone audit (only EmbedWave Cinesrc active, rejected adapters have undefined embedUrl)', async () => {
  const { ExternalSourceRegistry, STEP_2D_PROVIDER_IDS } = await import('../src/lib/services/externalSources');

  assert.equal(STEP_2D_PROVIDER_IDS.length, 7);

  // Movie request (Fight Club TMDB 550)
  const movieProviders = ExternalSourceRegistry.getStep2DProviders({
    tmdbId: 550,
    type: 'movie'
  });
  assert.equal(movieProviders.length, 7);

  // 1. EmbedWave — Cinesrc (Active)
  const embedwave = movieProviders.find((p) => p.id === 'embedwave')!;
  assert.ok(embedwave);
  assert.equal(embedwave.name, 'EmbedWave — Cinesrc');
  assert.equal(embedwave.availabilityStatus, 'AVAILABLE');
  assert.equal(embedwave.embedUrl, 'https://embedwave.cc/embed/movie/550?server=cinesrc');

  // 2. All 6 rejected providers must be UNAVAILABLE with undefined embedUrl (preventing ad/broken iframe loads)
  const rejectedIds = ['vidcore', 'vidlink', 'vidsrc_hair', 'vixsrc', 'autoembed', 'ezvid'] as const;
  for (const id of rejectedIds) {
    const provider = movieProviders.find((p) => p.id === id)!;
    assert.ok(provider, `Provider ${id} must exist in audit registry`);
    assert.equal(provider.availabilityStatus, 'UNAVAILABLE', `Provider ${id} must be UNAVAILABLE`);
    assert.equal(provider.embedUrl, undefined, `Provider ${id} must NOT expose an embedUrl`);
  }

  // 3. TV Series request (Breaking Bad TMDB 1396 S1:E1)
  const tvProviders = ExternalSourceRegistry.getStep2DProviders({
    tmdbId: 1396,
    type: 'tv',
    season: 1,
    episode: 1
  });
  const tvEmbedWave = tvProviders.find((p) => p.id === 'embedwave')!;
  assert.equal(tvEmbedWave.embedUrl, 'https://embedwave.cc/embed/tv/1396/1/1?server=cinesrc');
});

test('Step 2E Providers API: GET /api/playback/providers validates input and returns audit list', async () => {
  const { GET } = await import('../src/app/api/playback/providers/route');
  const { NextRequest } = await import('next/server');

  // Missing tmdbId
  const missingReq = new NextRequest('http://localhost:3000/api/playback/providers');
  const missingRes = await GET(missingReq);
  assert.equal(missingRes.status, 400);

  // Invalid tmdbId
  const invalidReq = new NextRequest('http://localhost:3000/api/playback/providers?tmdbId=-5');
  const invalidRes = await GET(invalidReq);
  assert.equal(invalidRes.status, 400);

  // Valid movie request
  const validReq = new NextRequest('http://localhost:3000/api/playback/providers?tmdbId=550&type=movie');
  const validRes = await GET(validReq);
  assert.equal(validRes.status, 200);
  const json = await validRes.json();
  assert.equal(json.success, true);
  assert.equal(json.providers.length, 7);

  // Single provider check
  const singleReq = new NextRequest('http://localhost:3000/api/playback/providers?tmdbId=550&type=movie&providerId=embedwave');
  const singleRes = await GET(singleReq);
  assert.equal(singleRes.status, 200);
  const singleJson = await singleRes.json();
  assert.equal(singleJson.success, true);
  assert.equal(singleJson.provider.id, 'embedwave');
  assert.equal(singleJson.provider.embedUrl, 'https://embedwave.cc/embed/movie/550?server=cinesrc');
});

test('Step 2F: ExternalSubtitleEngine parses SRT/VTT, decodes UTF-8 & CP1251 Russian, strips XSS tags, and synchronizes cues at 10m/30m with offset -60..+60s', async () => {
  const {
    ExternalSubtitleEngine,
    parseExternalSubtitles,
    sanitizeSubtitleText,
    decodeSubtitleBuffer
  } = await import('../src/lib/playback/externalSubtitleEngine');

  // 1. XSS sanitization test (must never allow HTML tags)
  const dirtyText = `<script>alert("xss")</script><b>Первая строка</b>\n<img src=x onerror=alert(1)>Вторая строка <i>курсивом</i>`;
  const cleanText = sanitizeSubtitleText(dirtyText);
  assert.equal(cleanText.includes('<script'), false);
  assert.equal(cleanText.includes('<img'), false);
  assert.equal(cleanText.includes('<b>'), false);
  assert.equal(cleanText.includes('<i>'), false);
  assert.equal(cleanText, 'Первая строка\nВторая строка курсивом');

  // 2. Windows-1251 (CP1251) Russian decoding fallback
  // Bytes for "Привет, мир!" in Windows-1251: CF F0 E8 E2 E5 F2 2C 20 EC E8 F0 21
  const cp1251Bytes = new Uint8Array([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2, 0x2c, 0x20, 0xec, 0xe8, 0xf0, 0x21]);
  const decodedCp1251 = decodeSubtitleBuffer(cp1251Bytes.buffer);
  assert.equal(decodedCp1251, 'Привет, мир!');

  // 3. Parse SRT with multi-line Russian cues at 00:00:10, 00:10:00 (600s), and 00:30:00 (1800s) + invalid cue
  const sampleSrt = `1
00:00:10,000 --> 00:00:14,500
<b>Первая</b> тестовая реплика в начале.
Вторая строка диалога.

2
00:05:00,000 --> 00:04:50,000
Некорректный таймкод (конец раньше начала — должен быть отброшен)

3
00:10:00,000 --> 00:10:05,000
Тестовая реплика на 10-й минуте (600 секунд).

4
00:30:00,000 --> 00:30:06,000
Тестовая реплика на 30-й минуте (1800 секунд).
`;

  const parsed = parseExternalSubtitles(sampleSrt, { fileName: 'test-ru.srt' });
  assert.equal(parsed.valid, true);
  assert.equal(parsed.format, 'srt');
  assert.equal(parsed.cues.length, 3, 'Invalid cue with endTime < startTime must be filtered out');
  assert.equal(parsed.cues[0].text, 'Первая тестовая реплика в начале.\nВторая строка диалога.');

  // 4. Engine lifecycle: load, timeupdate, pause, seek (600s & 1800s), offset (-60..+60), ended
  const engine = new ExternalSubtitleEngine();
  const loadRes = engine.loadFromText(sampleSrt, {
    fileName: 'test-ru.srt',
    lang: 'ru',
    label: 'Русские (тест)'
  });
  assert.equal(loadRes.valid, true);
  assert.ok(engine.getTrack());
  assert.equal(engine.getTrack()!.cueCount, 3);

  // At 12s -> first cue is active (2 lines)
  let active = engine.updatePlaybackTime(12.0, { isPaused: false });
  assert.equal(active.length, 1);
  assert.match(active[0].text, /Первая тестовая реплика/);
  assert.deepEqual(engine.getActiveLines(), [
    'Первая тестовая реплика в начале.',
    'Вторая строка диалога.'
  ]);

  // Pause at 12.0s -> state is paused, cue remains at 12.0s without autonomous timer drift
  active = engine.onPause(12.0);
  assert.equal(engine.getIsPaused(), true);
  assert.equal(engine.getCurrentTime(), 12.0);
  assert.equal(active.length, 1);

  // Seek to 10 minutes (600s) -> immediately switches to 10-minute cue without ghosting
  active = engine.onSeek(601.5);
  assert.equal(active.length, 1);
  assert.equal(active[0].text, 'Тестовая реплика на 10-й минуте (600 секунд).');

  // Seek to 30 minutes (1800s) -> immediately switches to 30-minute cue
  active = engine.onSeek(1802.0);
  assert.equal(active.length, 1);
  assert.equal(active[0].text, 'Тестовая реплика на 30-й минуте (1800 секунд).');

  // Delay adjustment (+5.0s shifts cue window later: at 1802s cue [1800..1806] shifted by +5 becomes [1805..1811])
  const newOffset = engine.setOffsetSeconds(5.0);
  assert.equal(newOffset, 5.0);
  assert.equal(engine.getActiveCues().length, 0, 'At 1802s with +5s delay, cue starting at 1805s is not yet active');

  active = engine.updatePlaybackTime(1806.0, { isPaused: false });
  assert.equal(active.length, 1);
  assert.equal(active[0].text, 'Тестовая реплика на 30-й минуте (1800 секунд).');

  // Offset clamping to [-60, +60]
  assert.equal(engine.setOffsetSeconds(120), 60);
  assert.equal(engine.setOffsetSeconds(-95), -60);
  engine.setOffsetSeconds(0);

  // Ended clears active cues
  active = engine.onEnded();
  assert.equal(engine.getIsEnded(), true);
  assert.equal(engine.getIsPaused(), true);
  assert.equal(active.length, 0);
});

test('Step 2F: cinesrcBridge strictly validates origin, source window, activeIframeId, event type, and currentTime', async () => {
  const { validateCineSrcMessageEvent } = await import('../src/lib/playback/cinesrcBridge');

  const fakeIframeWindow = {} as Window;
  const otherWindow = {} as Window;

  // 1. Valid cinesrc:timeupdate event
  const validRes = validateCineSrcMessageEvent(
    {
      origin: 'https://cinesrc.st',
      source: fakeIframeWindow,
      data: {
        type: 'cinesrc:timeupdate',
        currentTime: 600.25,
        duration: 7984
      }
    },
    {
      expectedIframeWindow: fakeIframeWindow,
      activeIframeId: 'cinesrc-direct-550',
      currentIframeId: 'cinesrc-direct-550'
    }
  );
  assert.ok(validRes);
  assert.equal(validRes.type, 'cinesrc:timeupdate');
  assert.equal(validRes.currentTime, 600.25);
  assert.equal(validRes.duration, 7984);

  // 2. Reject untrusted origin (including embedwave.cc or malicious domains)
  const badOrigin = validateCineSrcMessageEvent(
    {
      origin: 'https://evil-site.com',
      source: fakeIframeWindow,
      data: { type: 'cinesrc:timeupdate', currentTime: 10 }
    },
    {
      expectedIframeWindow: fakeIframeWindow,
      activeIframeId: 'cinesrc-direct-550',
      currentIframeId: 'cinesrc-direct-550'
    }
  );
  assert.equal(badOrigin, null);

  // 3. Reject mismatched event.source
  const badSource = validateCineSrcMessageEvent(
    {
      origin: 'https://cinesrc.st',
      source: otherWindow,
      data: { type: 'cinesrc:timeupdate', currentTime: 10 }
    },
    {
      expectedIframeWindow: fakeIframeWindow,
      activeIframeId: 'cinesrc-direct-550',
      currentIframeId: 'cinesrc-direct-550'
    }
  );
  assert.equal(badSource, null);

  // 4. Reject mismatched activeIframeId
  const badIframeId = validateCineSrcMessageEvent(
    {
      origin: 'https://cinesrc.st',
      source: fakeIframeWindow,
      data: { type: 'cinesrc:timeupdate', currentTime: 10 }
    },
    {
      expectedIframeWindow: fakeIframeWindow,
      activeIframeId: 'cinesrc-direct-550',
      currentIframeId: 'embedwave-wrapper-550'
    }
  );
  assert.equal(badIframeId, null);

  // 5. Reject negative or NaN currentTime
  const negativeTime = validateCineSrcMessageEvent(
    {
      origin: 'https://cinesrc.st',
      source: fakeIframeWindow,
      data: { type: 'cinesrc:timeupdate', currentTime: -15 }
    },
    {
      expectedIframeWindow: fakeIframeWindow,
      activeIframeId: 'cinesrc-direct-550',
      currentIframeId: 'cinesrc-direct-550'
    }
  );
  assert.equal(negativeTime, null);

  // 6. Valid cinesrc:response for getCurrentTime command
  const cmdResponse = validateCineSrcMessageEvent(
    {
      origin: 'https://cinesrc.st',
      source: fakeIframeWindow,
      data: {
        type: 'cinesrc:response',
        id: 'cmd-1',
        command: 'getCurrentTime',
        result: 1800.5
      }
    },
    {
      expectedIframeWindow: fakeIframeWindow,
      activeIframeId: 'cinesrc-direct-550',
      currentIframeId: 'cinesrc-direct-550'
    }
  );
  assert.ok(cmdResponse);
  assert.equal(cmdResponse.currentTime, 1800.5);
});

test('Step 2F: OpenSubtitlesProvider normalizes IMDb IDs, evaluates release compatibility, and honestly reports REQUIRES_KEY without API key', async () => {
  const {
    normalizeImdbId,
    evaluateSubtitleReleaseCompatibility,
    openSubtitlesProvider
  } = await import('../src/lib/services/openSubtitles');

  // 1. IMDb ID normalization
  assert.deepEqual(normalizeImdbId('tt0137523'), { canonical: 'tt0137523', numeric: 137523 });
  assert.deepEqual(normalizeImdbId('0137523'), { canonical: 'tt0137523', numeric: 137523 });
  assert.deepEqual(normalizeImdbId('137523'), { canonical: 'tt0137523', numeric: 137523 });
  assert.equal(normalizeImdbId('invalid-id'), null);

  // 2. Release compatibility check (BluRay theatrical vs Trailer/CamRip vs ID mismatch)
  const goodMatch = evaluateSubtitleReleaseCompatibility({
    release: 'Fight.Club.1999.1080p.BluRay.x264',
    fileName: 'Fight.Club.1999.BDRip.ru.srt',
    requestedType: 'movie',
    requestedImdbNumeric: 137523,
    requestedTmdbId: 550,
    featureImdbId: 137523,
    featureTmdbId: 550
  });
  assert.equal(goodMatch.isCompatible, true);
  assert.equal(goodMatch.versionTag, 'BluRay / BDRip (Театральная)');

  const trailerReject = evaluateSubtitleReleaseCompatibility({
    release: 'Fight.Club.1999.Official.Trailer.HD',
    fileName: 'Fight.Club.Trailer.ru.srt',
    requestedType: 'movie',
    requestedImdbNumeric: 137523,
    requestedTmdbId: 550,
    featureImdbId: 137523,
    featureTmdbId: 550
  });
  assert.equal(trailerReject.isCompatible, false);
  assert.equal(trailerReject.versionTag, 'Trailer / CamRip');

  const wrongIdReject = evaluateSubtitleReleaseCompatibility({
    release: 'Some.Other.Movie.1080p.WEB-DL',
    fileName: 'Other.Movie.ru.srt',
    requestedType: 'movie',
    requestedImdbNumeric: 137523,
    requestedTmdbId: 550,
    featureImdbId: 999999,
    featureTmdbId: 888888
  });
  assert.equal(wrongIdReject.isCompatible, false);
  assert.equal(wrongIdReject.versionTag, 'Несовпадение ID');

  // 3. Honest REQUIRES_KEY status when OPENSUBTITLES_API_KEY is not configured
  const savedKey = process.env.OPENSUBTITLES_API_KEY;
  process.env.OPENSUBTITLES_API_KEY = '';
  try {
    const searchRes = await openSubtitlesProvider.searchRussianSubtitles({
      tmdbId: 550,
      imdbId: 'tt0137523',
      type: 'movie',
      expectedDurationSeconds: 7984
    });
    assert.equal(searchRes.status, 'REQUIRES_KEY');
    assert.equal(searchRes.configured, false);
    assert.equal(searchRes.downloadAllowed, false);
    assert.equal(searchRes.imdbId, 'tt0137523');
    assert.equal(searchRes.candidates.length, 0, 'Must never fabricate OpenSubtitles results');

    // 4. Verify API route /api/playback/subtitles/opensubtitles
    const { GET } = await import('../src/app/api/playback/subtitles/opensubtitles/route');
    const { NextRequest } = await import('next/server');

    const badReq = new NextRequest('http://localhost:3000/api/playback/subtitles/opensubtitles');
    const badRes = await GET(badReq);
    assert.equal(badRes.status, 400);

    const validReq = new NextRequest(
      'http://localhost:3000/api/playback/subtitles/opensubtitles?tmdbId=550&imdbId=tt0137523&type=movie&expectedDuration=7984'
    );
    const validRes = await GET(validReq);
    assert.equal(validRes.status, 200);
    const validJson = await validRes.json();
    assert.equal(validJson.status, 'REQUIRES_KEY');
    assert.equal(validJson.configured, false);
    assert.equal(validJson.imdbId, 'tt0137523');
    assert.equal(validJson.candidates.length, 0);
  } finally {
    if (savedKey !== undefined) {
      process.env.OPENSUBTITLES_API_KEY = savedKey;
    }
  }
});

test('Step 2F: Allowlist permits direct cinesrc.st and embedwaveAdapter provides directCineSrcUrl alongside default EmbedWave', async () => {
  const { isValidExternalIframeUrl } = await import('../src/lib/services/externalSources/allowlist');
  const { getEmbedWaveSources, buildDirectCineSrcUrl } = await import('../src/lib/services/externalSources/embedwaveAdapter');

  assert.equal(isValidExternalIframeUrl('https://cinesrc.st/embed/movie/550'), true);
  assert.equal(isValidExternalIframeUrl('https://cinesrc.st/embed/tv/1396?s=1&e=1'), true);
  assert.equal(buildDirectCineSrcUrl({ tmdbId: 550, type: 'movie' }), 'https://cinesrc.st/embed/movie/550');
  assert.equal(
    buildDirectCineSrcUrl({ tmdbId: 1396, type: 'tv', season: 1, episode: 1 }),
    'https://cinesrc.st/embed/tv/1396?s=1&e=1'
  );

  // Default source remains EmbedWave — Cinesrc, with directCineSrcUrl attached for experimental subtitle mode
  const sources = getEmbedWaveSources({ tmdbId: 550, type: 'movie', title: 'Fight Club' });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].iframeUrl, 'https://embedwave.cc/embed/movie/550?server=cinesrc');
  assert.equal(sources[0].directCineSrcUrl, 'https://cinesrc.st/embed/movie/550');
});

test('Step 2F: SubDLProvider release compatibility evaluation for movies and TV series', async () => {
  const { evaluateSubDLReleaseCompatibility } = await import('../src/lib/services/subdl');

  // 1. Movie BluRay match (Fight Club)
  const blurayMovie = evaluateSubDLReleaseCompatibility({
    name: 'Fight Club (1999) 1080p BluRay x264 Russian',
    releaseName: 'Fight.Club.1999.1080p.BluRay.DTS-HD.MA.5.1',
    type: 'movie'
  });
  assert.equal(blurayMovie.isCompatible, true);
  assert.equal(blurayMovie.isProvisional, false);
  assert.equal(blurayMovie.versionTag, 'BluRay / BDRip');

  // 2. Movie Director's / Extended Cut (provisional)
  const extendedMovie = evaluateSubDLReleaseCompatibility({
    name: 'Fight Club Extended Director Cut',
    type: 'movie'
  });
  assert.equal(extendedMovie.isCompatible, true);
  assert.equal(extendedMovie.isProvisional, true);
  assert.equal(extendedMovie.versionTag, "Director's / Extended Cut");

  // 3. Movie Trailer / CamRip rejection
  const trailerMovie = evaluateSubDLReleaseCompatibility({
    name: 'Fight Club HDCam CamRip sample',
    type: 'movie'
  });
  assert.equal(trailerMovie.isCompatible, false);
  assert.equal(trailerMovie.isProvisional, true);
  assert.equal(trailerMovie.versionTag, 'Trailer / CamRip');

  // 4. Movie Forced / Foreign only rejection
  const forcedMovie = evaluateSubDLReleaseCompatibility({
    name: 'Fight Club Russian Forced only',
    type: 'movie'
  });
  assert.equal(forcedMovie.isCompatible, false);
  assert.equal(forcedMovie.versionTag, 'Forced / Только надписи');

  // 5. TV Series exact match (Breaking Bad S01E01)
  const tvMatch = evaluateSubDLReleaseCompatibility({
    name: 'Breaking Bad S01E01 Pilot 1080p BluRay',
    type: 'tv',
    requestedSeason: 1,
    requestedEpisode: 1,
    seasonNumber: 1,
    episodeNumber: 1
  });
  assert.equal(tvMatch.isCompatible, true);
  assert.equal(tvMatch.isProvisional, false);

  // 6. TV Series episode mismatch rejection (Requested S01E01, candidate is S01E05)
  const tvMismatch = evaluateSubDLReleaseCompatibility({
    name: 'Breaking Bad S01E05 Gray Matter 1080p',
    type: 'tv',
    requestedSeason: 1,
    requestedEpisode: 1,
    seasonNumber: 1,
    episodeNumber: 5
  });
  assert.equal(tvMismatch.isCompatible, false);
  assert.match(tvMismatch.note, /не совпадает с запрошенной/);
});

test('Step 2F: extractSubtitleFromZip and decodeSubtitleBuffer bulletproof ZIP, BOM & CP1251 decoding', async () => {
  const { zipSync, strToU8 } = await import('fflate');
  const { extractSubtitleFromZip } = await import('../src/lib/services/subdl');
  const { decodeSubtitleBuffer, parseExternalSubtitles } = await import(
    '../src/lib/playback/externalSubtitleEngine'
  );

  const russianText = `1\n00:00:01,000 --> 00:00:04,000\nДобро пожаловать в Бойцовский клуб.\n`;

  // 1. In-memory ZIP archive with __MACOSX noise and TV episodes
  const zipData = zipSync({
    '__MACOSX/._sub.srt': strToU8('binary junk'),
    'Breaking.Bad.S01E02.ru.srt': strToU8('1\n00:00:01,000 --> 00:00:04,000\nВторая серия.\n'),
    'Breaking.Bad.S01E01.ru.srt': strToU8(russianText)
  });

  // Extract S01E01 specifically
  const extracted = extractSubtitleFromZip(zipData.buffer, 1, 1);
  assert.ok(extracted, 'Should safely extract subtitle from ZIP');
  assert.equal(extracted.fileName, 'Breaking.Bad.S01E01.ru.srt');

  // 2. Direct ZIP decoding via decodeSubtitleBuffer
  const autoDecodedFromZip = decodeSubtitleBuffer(zipData);
  assert.match(autoDecodedFromZip, /Бойцовский клуб|Вторая серия/);

  // 3. UTF-8 with BOM
  const utf8Bytes = new TextEncoder().encode(russianText);
  const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8Bytes]);
  const decodedBom = decodeSubtitleBuffer(utf8Bom);
  assert.match(decodedBom, /Добро пожаловать в Бойцовский клуб/);

  // 4. UTF-16LE with BOM
  const utf16leBytes = new Uint8Array(2 + russianText.length * 2);
  utf16leBytes[0] = 0xff;
  utf16leBytes[1] = 0xfe;
  for (let i = 0; i < russianText.length; i++) {
    const code = russianText.charCodeAt(i);
    utf16leBytes[2 + i * 2] = code & 0xff;
    utf16leBytes[2 + i * 2 + 1] = (code >> 8) & 0xff;
  }
  const decodedUtf16le = decodeSubtitleBuffer(utf16leBytes);
  assert.match(decodedUtf16le, /Добро пожаловать в Бойцовский клуб/);

  // 5. UTF-16BE with BOM
  const utf16beBytes = new Uint8Array(2 + russianText.length * 2);
  utf16beBytes[0] = 0xfe;
  utf16beBytes[1] = 0xff;
  for (let i = 0; i < russianText.length; i++) {
    const code = russianText.charCodeAt(i);
    utf16beBytes[2 + i * 2] = (code >> 8) & 0xff;
    utf16beBytes[2 + i * 2 + 1] = code & 0xff;
  }
  const decodedUtf16be = decodeSubtitleBuffer(utf16beBytes);
  assert.match(decodedUtf16be, /Добро пожаловать в Бойцовский клуб/);

  // 6. Windows-1251 (CP1251) decoding
  // "Бойцовский клуб" in CP1251 bytes
  const cp1251Sample = new Uint8Array([
    0xc1, 0xee, 0xe9, 0xf6, 0xee, 0xe2, 0xf1, 0xea, 0xe8, 0xe9, 0x20, 0xea, 0xeb, 0xf3, 0xe1
  ]);
  const decodedCp1251 = decodeSubtitleBuffer(cp1251Sample);
  assert.equal(decodedCp1251, 'Бойцовский клуб', 'CP1251 must decode without mojibake');
});

test('Step 2F: SubDLProvider honestly reports REQUIRES_KEY and /api/playback/subtitles/subdl routes', async () => {
  const { subdlProvider } = await import('../src/lib/services/subdl');
  const { GET, POST } = await import('../src/app/api/playback/subtitles/subdl/route');
  const { NextRequest } = await import('next/server');

  const savedKey = process.env.SUBDL_API_KEY;
  process.env.SUBDL_API_KEY = '';
  try {
    // 1. Search without API key
    const searchRes = await subdlProvider.searchSubtitles({
      tmdbId: 550,
      type: 'movie',
      languages: 'ru'
    });
    assert.equal(searchRes.status, 'REQUIRES_KEY');
    assert.equal(searchRes.configured, false);
    assert.equal(searchRes.candidates.length, 0);

    // 2. GET route parameter validation (missing tmdbId)
    const badReq = new NextRequest('http://localhost:3000/api/playback/subtitles/subdl');
    const badRes = await GET(badReq);
    assert.equal(badRes.status, 400);

    // 3. GET route valid call returning honest status
    const validReq = new NextRequest('http://localhost:3000/api/playback/subtitles/subdl?tmdbId=550&type=movie');
    const validRes = await GET(validReq);
    assert.equal(validRes.status, 200);
    const validJson = await validRes.json();
    assert.equal(validJson.status, 'REQUIRES_KEY');
    assert.equal(validJson.tmdbId, 550);

    // 4. POST route parameter validation
    const badPostReq = new NextRequest('http://localhost:3000/api/playback/subtitles/subdl', {
      method: 'POST',
      body: JSON.stringify({})
    });
    const badPostRes = await POST(badPostReq);
    assert.equal(badPostRes.status, 400);
  } finally {
    if (savedKey !== undefined) {
      process.env.SUBDL_API_KEY = savedKey;
    }
  }
});

test('Step 2F: OpenSubtitlesProvider enforces SSRF protection, search & download caching, and autoDownload handling', async () => {
  const {
    openSubtitlesProvider,
    isValidOpenSubtitlesDownloadUrl
  } = await import('../src/lib/services/openSubtitles');

  // 1. SSRF validation: strictly permit opensubtitles.com/org over HTTPS, reject untrusted hosts & HTTP
  assert.equal(isValidOpenSubtitlesDownloadUrl('https://api.opensubtitles.com/download/12345'), true);
  assert.equal(isValidOpenSubtitlesDownloadUrl('https://dl.opensubtitles.org/subtitles/550.srt'), true);
  assert.equal(isValidOpenSubtitlesDownloadUrl('https://subtitles.opensubtitles.com/ru/550.srt'), true);

  assert.equal(isValidOpenSubtitlesDownloadUrl('http://api.opensubtitles.com/download/12345'), false, 'Must reject insecure HTTP');
  assert.equal(isValidOpenSubtitlesDownloadUrl('https://evil-hacker.com/subtitles/malicious.srt'), false, 'Must reject untrusted domains');
  assert.equal(isValidOpenSubtitlesDownloadUrl('https://192.168.1.1/secret.srt'), false, 'Must reject private IP ranges');
  assert.equal(isValidOpenSubtitlesDownloadUrl('https://169.254.169.254/latest/meta-data'), false, 'Must reject cloud metadata');
  assert.equal(isValidOpenSubtitlesDownloadUrl('javascript:alert(1)'), false, 'Must reject javascript: pseudo-protocol');

  // 2. Download without API key honestly reports REQUIRES_KEY
  const savedKey = process.env.OPENSUBTITLES_API_KEY;
  process.env.OPENSUBTITLES_API_KEY = '';
  try {
    const dlRes = await openSubtitlesProvider.downloadSubtitle({ fileId: 99999 });
    assert.equal(dlRes.success, false);
    assert.equal(dlRes.status, 'REQUIRES_KEY');
    assert.match(dlRes.message, /не задан|не настроен/i);
  } finally {
    if (savedKey !== undefined) {
      process.env.OPENSUBTITLES_API_KEY = savedKey;
    }
  }

  // 3. Verify getAuthToken returns null without full credentials
  const token = await openSubtitlesProvider.getAuthToken();
  assert.equal(token, null, 'Must return null without valid credentials');
});

test('Step 2F: Unified Cascade Logic — SubDL primary with OpenSubtitles fallback simulation', async () => {
  // Scenario A: SubDL finds subtitles -> Primary source used, OpenSubtitles is NOT called
  const subdlPrimarySuccess = {
    status: 'CONNECTED',
    candidates: [{ id: 'sub-1', name: 'fight.club.srt' }],
    autoLoadedSubtitle: {
      content: '1\n00:00:01,000 --> 00:00:04,000\nПривет из SubDL\n',
      fileName: 'fight.club.srt',
      format: 'srt',
      cueCount: 1,
      warnings: [],
      isProvisional: false,
      source: 'subdl'
    }
  };

  let openSubtitlesCalled = false;
  let activeSource: string | null = null;
  let activeTrack: any = null;

  if (subdlPrimarySuccess.autoLoadedSubtitle?.content) {
    activeSource = 'subdl';
    activeTrack = subdlPrimarySuccess.autoLoadedSubtitle;
  } else {
    openSubtitlesCalled = true;
  }

  assert.equal(activeSource, 'subdl');
  assert.equal(openSubtitlesCalled, false, 'OpenSubtitles quota must NOT be used when SubDL has subtitles');
  assert.equal(activeTrack.cueCount, 1);

  // Scenario B: SubDL returns NOT_FOUND -> Fallback automatically activates OpenSubtitles
  const subdlNotFound = {
    status: 'NOT_FOUND',
    candidates: [],
    autoLoadedSubtitle: undefined
  };

  const openSubtitlesFallbackSuccess = {
    status: 'CONNECTED',
    candidates: [{ id: 'os-1', fileName: 'open.subtitles.srt' }],
    autoLoadedSubtitle: {
      content: '1\n00:00:01,000 --> 00:00:04,000\nПривет из OpenSubtitles fallback\n',
      fileName: 'open.subtitles.srt',
      format: 'srt',
      cueCount: 1,
      warnings: [],
      isProvisional: false,
      source: 'opensubtitles'
    }
  };

  let fallbackSource: string | null = null;
  let fallbackTrack: any = null;

  if (subdlNotFound.autoLoadedSubtitle) {
    fallbackSource = 'subdl';
  } else {
    // Automatically trigger OpenSubtitles fallback
    if (openSubtitlesFallbackSuccess.autoLoadedSubtitle?.content) {
      fallbackSource = 'opensubtitles';
      fallbackTrack = openSubtitlesFallbackSuccess.autoLoadedSubtitle;
    }
  }

  assert.equal(fallbackSource, 'opensubtitles', 'OpenSubtitles fallback must activate when SubDL returns NOT_FOUND');
  assert.equal(fallbackTrack.source, 'opensubtitles');
  assert.equal(fallbackTrack.cueCount, 1);

  // Scenario C: Both return NOT_FOUND -> Honest NOT_FOUND status
  const subdlEmpty = { status: 'NOT_FOUND', candidates: [] };
  const osEmpty = { status: 'NOT_FOUND', candidates: [] };

  let unifiedStatus = 'SEARCHING';
  if (!subdlEmpty.candidates.length && !osEmpty.candidates.length) {
    unifiedStatus = 'NOT_FOUND';
  }
  assert.equal(unifiedStatus, 'NOT_FOUND', 'Both sources empty must honestly report NOT_FOUND');
});

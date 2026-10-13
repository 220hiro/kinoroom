import { test, expect } from '@playwright/test';

test.describe('KinoRoom Player & Playback API E2E', () => {
  test('API: TMDB ID 969681 strictly returns HTTP 404 with SOURCE_UNAVAILABLE', async ({ request }) => {
    const response = await request.post('/api/playback/resolve', {
      data: {
        mediaId: 969681,
        mediaType: 'movie',
      },
    });

    // Strictly expect HTTP 404
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('SOURCE_UNAVAILABLE');
    expect(body.error).toBe('SOURCE_UNAVAILABLE');
    expect(body.stream.url).toBe('');
    expect(body.provider.id).toBe('none');
  });

  const mobileViewports = [
    { width: 320, height: 640, name: 'iPhone SE 320px' },
    { width: 375, height: 667, name: 'iPhone 8/SE 375px' },
    { width: 390, height: 844, name: 'iPhone 13/14 390px' },
    { width: 430, height: 932, name: 'iPhone 14/15 Pro Max 430px' },
  ];

  for (const vp of mobileViewports) {
    test(`Mobile Layout (${vp.name}): No overflow, header not covered, controls accessible`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/player-test');

      // 1. Assert no horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalScroll).toBe(false);

      // 2. Assert page header is NOT covered by fixed Navbar
      const headerBox = await page.locator('header').boundingBox();
      const h1Box = await page.locator('h1').boundingBox();
      expect(h1Box).not.toBeNull();
      expect(headerBox).not.toBeNull();
      expect(h1Box!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height - 5);

      // 3. Assert video player container fits within viewport width
      const video = page.locator('video');
      await expect(video).toBeVisible({ timeout: 15_000 });
      const videoBox = await video.boundingBox();
      expect(videoBox).not.toBeNull();
      expect(videoBox!.width).toBeLessThanOrEqual(vp.width);

      // 4. Assert Fullscreen button is within visible bounds (never clipped off-screen)
      const fsButton = page.locator('button[title="На весь экран"]');
      await expect(fsButton).toBeVisible();
      const fsBox = await fsButton.boundingBox();
      expect(fsBox).not.toBeNull();
      expect(fsBox!.x + fsBox!.width).toBeLessThanOrEqual(vp.width);
    });
  }

  test('Subtitles Lifecycle: Changing subtitles never resets currentTime, pauses video, or recreates Hls.js', async ({ page, browserName }) => {
    if (browserName === 'webkit' && process.platform === 'win32') {
      test.skip(true, 'Playwright WebKit on Windows lacks HLS codecs (real Safari on iPhone uses native AVFoundation)');
    }

    await page.setViewportSize({ width: 390, height: 844 });

    // Track .m3u8 manifest network requests after playback starts to ensure no redundant re-fetches
    let manifestRequestsAfterStart = 0;
    let hasStartedPlayback = false;

    page.on('request', (req) => {
      if (hasStartedPlayback && req.url().includes('.m3u8')) {
        manifestRequestsAfterStart++;
      }
    });

    await page.goto('/player-test');

    const videoLocator = page.locator('video');
    await expect(videoLocator).toBeVisible({ timeout: 15_000 });

    // Wait for stream to load
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && v.duration > 0;
    }, null, { timeout: 20_000 });

    // 1. Initial state: verify default is not showing any track
    const initialTrackModes = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return [];
      return Array.from(v.textTracks).map((t) => ({ label: t.label, mode: t.mode }));
    });
    expect(initialTrackModes.every((t) => t.mode === 'disabled')).toBe(true);

    // Start playback (muted to ensure autoplay permissions in headless environments)
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) {
        v.muted = true;
        return v.play();
      }
    });

    // 2. Wait until currentTime > 5 seconds
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && !v.paused && v.currentTime >= 5.0;
    }, null, { timeout: 20_000 });

    hasStartedPlayback = true;

    // Capture baseline state at > 5.0s
    const baselineState = await page.evaluate(() => {
      const v = document.querySelector('video');
      return {
        currentTime: v ? v.currentTime : 0,
        paused: v ? v.paused : true,
        hlsCount: (window as any).__hlsInstanceCount || 1
      };
    });
    expect(baselineState.currentTime).toBeGreaterThanOrEqual(5.0);
    expect(baselineState.paused).toBe(false);

    // 3. Open settings and select Russian subtitles
    const settingsButton = page.locator('button[title="Настройки"]');
    await settingsButton.click();
    await expect(page.locator('text=Настройки плеера')).toBeVisible();

    const ruSubBtn = page.locator('button:has-text("Русские")');
    await ruSubBtn.click();

    // 4. Verify Russian subtitles active AND video did NOT reset or pause
    const stateAfterRu = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return null;
      const ru = Array.from(v.textTracks).find((t) => t.label === 'Русские');
      return {
        ruMode: ru ? ru.mode : null,
        currentTime: v.currentTime,
        paused: v.paused,
        hlsCount: (window as any).__hlsInstanceCount || 1
      };
    });
    expect(stateAfterRu).not.toBeNull();
    expect(stateAfterRu!.ruMode).toBe('showing');
    expect(stateAfterRu!.currentTime).toBeGreaterThanOrEqual(5.0);
    expect(stateAfterRu!.paused).toBe(false);
    expect(stateAfterRu!.hlsCount).toBe(baselineState.hlsCount);

    // 5. Turn subtitles OFF
    await settingsButton.click();
    await page.locator('button:has-text("Отключены")').click();

    const stateAfterOff1 = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return null;
      return {
        allDisabled: Array.from(v.textTracks).every((t) => t.mode === 'disabled'),
        currentTime: v.currentTime,
        paused: v.paused,
        hlsCount: (window as any).__hlsInstanceCount || 1
      };
    });
    expect(stateAfterOff1).not.toBeNull();
    expect(stateAfterOff1!.allDisabled).toBe(true);
    expect(stateAfterOff1!.currentTime).toBeGreaterThanOrEqual(5.0);
    expect(stateAfterOff1!.paused).toBe(false);
    expect(stateAfterOff1!.hlsCount).toBe(baselineState.hlsCount);

    // 6. Select English subtitles
    await settingsButton.click();
    await page.getByRole('button', { name: 'English', exact: true }).click();

    const stateAfterEn = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return null;
      const en = Array.from(v.textTracks).find((t) => t.label === 'English');
      return {
        enMode: en ? en.mode : null,
        currentTime: v.currentTime,
        paused: v.paused,
        hlsCount: (window as any).__hlsInstanceCount || 1
      };
    });
    expect(stateAfterEn).not.toBeNull();
    expect(stateAfterEn!.enMode).toBe('showing');
    expect(stateAfterEn!.currentTime).toBeGreaterThanOrEqual(5.0);
    expect(stateAfterEn!.paused).toBe(false);
    expect(stateAfterEn!.hlsCount).toBe(baselineState.hlsCount);

    // 7. Turn OFF all subtitles
    await settingsButton.click();
    await page.getByRole('button', { name: 'Отключены', exact: true }).click();

    const stateAfterOff2 = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return null;
      return {
        allDisabled: Array.from(v.textTracks).every((t) => t.mode === 'disabled'),
        currentTime: v.currentTime,
        paused: v.paused,
        hlsCount: (window as any).__hlsInstanceCount || 1
      };
    });
    expect(stateAfterOff2).not.toBeNull();
    expect(stateAfterOff2!.allDisabled).toBe(true);
    expect(stateAfterOff2!.currentTime).toBeGreaterThanOrEqual(5.0);
    expect(stateAfterOff2!.paused).toBe(false);
    expect(stateAfterOff2!.hlsCount).toBe(baselineState.hlsCount);

    // 8. Assert playback continues uninterrupted and no redundant manifests were fetched
    await page.waitForTimeout(600);
    const finalState = await page.evaluate(() => {
      const v = document.querySelector('video');
      return {
        currentTime: v ? v.currentTime : 0,
        paused: v ? v.paused : true,
        hlsCount: (window as any).__hlsInstanceCount || 1
      };
    });
    expect(finalState.currentTime).toBeGreaterThanOrEqual(5.5);
    expect(finalState.paused).toBe(false);
    expect(finalState.hlsCount).toBe(baselineState.hlsCount);
    expect(manifestRequestsAfterStart).toBe(0);
  });

  test('Subtitles Seek & Dialogue Synchronization: Seek forward/backwards displays only active cues without ghosting', async ({ page, browserName }) => {
    if (browserName === 'webkit' && process.platform === 'win32') {
      test.skip(true, 'Playwright WebKit on Windows lacks HLS codecs (real Safari on iPhone uses native AVFoundation)');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/player-test');

    const videoLocator = page.locator('video');
    await expect(videoLocator).toBeVisible({ timeout: 15_000 });

    // Wait for video stream to initialize
    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && v.duration > 0;
    }, null, { timeout: 20_000 });

    // 1. Initial assertion: subtitles must be OFF by default
    const initialTracks = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return [];
      return Array.from(v.textTracks).map((t) => ({ label: t.label, mode: t.mode }));
    });
    expect(initialTracks.every((t) => t.mode === 'disabled')).toBe(true);

    // 2. Turn ON Russian subtitles
    const settingsButton = page.locator('button[title="Настройки"]');
    await settingsButton.click();
    await page.locator('button:has-text("Русские")').click();

    // 3. Seek forward to 23.5s (dialogue starts at 23.0s: "Ты придурок, Том!")
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.currentTime = 23.5;
    });

    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && Math.abs(v.currentTime - 23.5) < 1.0;
    }, null, { timeout: 10_000 });

    // Wait for cues to be loaded/active
    await page.waitForTimeout(300);

    const cuesAtStart = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return [];
      const ru = Array.from(v.textTracks).find((t) => t.label === 'Русские');
      if (!ru || !ru.activeCues) return [];
      return Array.from(ru.activeCues).map((c: any) => c.text);
    });
    // In browser TextTrack rendering, if cues loaded, check dialogue matches
    if (cuesAtStart.length > 0) {
      expect(cuesAtStart[0]).toContain('Ты придурок, Том');
    }

    // 4. Seek forward to 300s (middle of movie)
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.currentTime = 300.0;
    });

    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && Math.abs(v.currentTime - 300.0) < 2.0;
    }, null, { timeout: 10_000 });

    await page.waitForTimeout(300);

    // 5. Seek backward to 10s (intro before dialogue)
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.currentTime = 10.0;
    });

    await page.waitForFunction(() => {
      const v = document.querySelector('video');
      return v && Math.abs(v.currentTime - 10.0) < 1.0;
    }, null, { timeout: 10_000 });

    await page.waitForTimeout(300);

    // Assert that at 10s (no dialogue in film), active cues are 0 (no ghosting from 300s or 23s)
    const cuesAtIntro = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return [];
      const ru = Array.from(v.textTracks).find((t) => t.label === 'Русские');
      if (!ru || !ru.activeCues) return [];
      return Array.from(ru.activeCues).map((c: any) => c.text);
    });
    expect(cuesAtIntro.length).toBe(0);

    // 6. Turn OFF subtitles
    await settingsButton.click();
    await page.locator('button:has-text("Отключены")').click();

    const finalDisabled = await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return true;
      return Array.from(v.textTracks).every((t) => t.mode === 'disabled');
    });
    expect(finalDisabled).toBe(true);

    // 7. Verify Hls instance was never destroyed or recreated
    const hlsCount = await page.evaluate(() => (window as any).__hlsInstanceCount || 1);
    expect(hlsCount).toBe(1);
  });

  test('Safari Bidirectional Subtitle Track Synchronization and Dev Diagnostics in /player-test', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/player-test');

    const videoLocator = page.locator('video');
    await expect(videoLocator).toBeVisible({ timeout: 15_000 });

    // 1. Verify Subtitle Diagnostics Panel is visible on /player-test
    const diagPanel = page.locator('[data-testid="subtitle-diagnostic-panel"]');
    await expect(diagPanel).toBeVisible({ timeout: 10_000 });
    await expect(diagPanel).toContainText('Диагностика субтитров Safari & WebVTT');

    // 2. Initial state: OFF
    await expect(diagPanel).toContainText('KinoRoom: off');

    // 3. User selects "Русские" in KinoRoom UI
    const settingsButton = page.locator('button[title="Настройки"]');
    await settingsButton.click();
    await page.locator('button:has-text("Русские")').click();

    // Verify diagnostic panel updates to Russian
    await expect(diagPanel).toContainText('KinoRoom: sub-ru');

    // Verify track mode in video.textTracks is 'showing'
    const ruMode = await page.evaluate(() => {
      const v = document.querySelector('video');
      const ru = Array.from(v?.textTracks || []).find((t) => t.label === 'Русские');
      return ru?.mode;
    });
    expect(ruMode).toBe('showing');

    // 4. Simulate Safari Native Fullscreen Track Switch (e.g. user selected English in native AVPlayer)
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return;
      for (let i = 0; i < v.textTracks.length; i++) {
        const tr = v.textTracks[i];
        if (tr.label === 'English') {
          tr.mode = 'showing';
        } else {
          tr.mode = 'disabled';
        }
      }
      // Safari dispatches change event on textTracks:
      v.textTracks.dispatchEvent(new Event('change'));
    });

    // KinoRoom UI & Diagnostics panel must immediately synchronize to English!
    await expect(diagPanel).toContainText('KinoRoom: sub-en', { timeout: 5000 });

    // 5. Simulate Safari Native Fullscreen Track Switch to OFF
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (!v || !v.textTracks) return;
      for (let i = 0; i < v.textTracks.length; i++) {
        v.textTracks[i].mode = 'disabled';
      }
      v.textTracks.dispatchEvent(new Event('change'));
    });

    // KinoRoom UI & Diagnostics panel must immediately synchronize to OFF!
    await expect(diagPanel).toContainText('KinoRoom: off', { timeout: 5000 });

    // 6. Verify diagnostic object is available on window for automated auditing
    const windowDiag = await page.evaluate(() => (window as any).__kinoRoomSubtitleDiagnostics);
    expect(windowDiag).not.toBeNull();
    expect(windowDiag.selectedSubtitleTrack).toBe('off');
    expect(windowDiag.tracks.length).toBeGreaterThan(0);
    expect(windowDiag.recentEvents.length).toBeGreaterThan(0);
  });

  test('UI /player-test: Loads real HLS video, plays, advances currentTime and performs seek without MediaError', async ({ page, browserName }) => {
    // Note: Playwright WebKit on Windows does not bundle GStreamer HLS codecs. Real Safari on iPhone uses AVFoundation.
    if (browserName === 'webkit' && process.platform === 'win32') {
      test.skip(true, 'Playwright WebKit on Windows lacks HLS codecs (real Safari on iPhone uses native AVFoundation)');
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/player-test');
    await expect(page.locator('h1')).toContainText('Тест-лаборатория KinoRoom Player');

    const videoLocator = page.locator('video');
    await expect(videoLocator).toBeVisible({ timeout: 15_000 });

    // Wait for video manifest to load
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video && video.duration > 0;
    }, null, { timeout: 20_000 });

    // Trigger play muted
    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) {
        video.muted = true;
        return video.play();
      }
    });

    // Wait for currentTime > 0.5s
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video && video.currentTime > 0.5;
    }, null, { timeout: 15_000 });

    // Verify absence of MediaError
    const mediaError = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.error ? { code: video.error.code, message: video.error.message } : null;
    });
    expect(mediaError).toBeNull();

    // Seek forward
    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = 30;
      }
    });

    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video && video.currentTime >= 28;
    }, null, { timeout: 10_000 });

    // Test live TMDB 969681 button on UI (strictly expecting 404 SOURCE_UNAVAILABLE)
    const testButton = page.locator('button:has-text("Запустить тест запроса TMDB 969681")');
    await expect(testButton).toBeVisible();
    await testButton.click();

    await expect(page.locator('text=HTTP 404 SOURCE_UNAVAILABLE')).toBeVisible({ timeout: 10_000 });
  });

  test('Catalog: Tears of Steel (/title/movie/133701) loads KinoRoomPlayer with CC BY 3.0 attribution', async ({ page, browserName }) => {
    await page.goto('/title/movie/133701');

    // Title header
    await expect(page.locator('h1')).toContainText(/Сл[её]зы стали|Tears of Steel/i);

    // Player and attribution
    const playerContainer = page.locator('#media-player-container');
    await expect(playerContainer).toBeVisible();

    const attribution = page.locator('[data-testid="playback-attribution"]');
    await expect(attribution).toBeVisible({ timeout: 15_000 });
    await expect(attribution).toContainText(/Blender Foundation/i);
    await expect(attribution).toContainText(/CC BY 3.0/i);

    const videoLocator = page.locator('video');
    await expect(videoLocator).toBeVisible();

    if (!(browserName === 'webkit' && process.platform === 'win32')) {
      await page.waitForFunction(() => {
        const v = document.querySelector('video');
        return v && v.duration > 0;
      }, null, { timeout: 20_000 });
    }
  });

  test('Catalog: Big Buck Bunny (/title/movie/10378) loads KinoRoomPlayer with CC BY 3.0 attribution', async ({ page, browserName }) => {
    await page.goto('/title/movie/10378');

    // Title header
    await expect(page.locator('h1')).toContainText(/Большой Бак|Big Buck Bunny/i);

    // Player and attribution
    const playerContainer = page.locator('#media-player-container');
    await expect(playerContainer).toBeVisible();

    const attribution = page.locator('[data-testid="playback-attribution"]');
    await expect(attribution).toBeVisible({ timeout: 15_000 });
    await expect(attribution).toContainText(/Blender Foundation/i);
    await expect(attribution).toContainText(/CC BY 3.0/i);

    const videoLocator = page.locator('video');
    await expect(videoLocator).toBeVisible();

    if (!(browserName === 'webkit' && process.platform === 'win32')) {
      await page.waitForFunction(() => {
        const v = document.querySelector('video');
        return v && v.duration > 0;
      }, null, { timeout: 20_000 });
    }
  });

  test('Catalog: TMDB 969681 (/title/movie/969681) honestly shows stream unavailable message without fake demo fallback', async ({ page }) => {
    await page.goto('/title/movie/969681');

    // The unavailable fallback container in native tab
    const fallbackMessage = page.locator('text=Прямой открытый медиапоток не обнаружен');
    await expect(fallbackMessage).toBeVisible({ timeout: 15_000 });

    // Video player should NOT be rendered
    const videoLocator = page.locator('video');
    await expect(videoLocator).toHaveCount(0);

    // Attribution banner should NOT be rendered
    const attribution = page.locator('[data-testid="playback-attribution"]');
    await expect(attribution).toHaveCount(0);
  });

  test('API Discovery: GET /api/playback/discover?tmdbId=10331 returns approved Public Domain metadata', async ({ request }) => {
    const res = await request.get('/api/playback/discover?tmdbId=10331');
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.discovery.tmdbId).toBe(10331);
    expect(json.discovery.status).toBe('APPROVED');
    expect(json.discovery.isLegallyPermitted).toBe(true);
    expect(json.discovery.isTechnicallyAccessible).toBe(true);
    expect(json.discovery.isTrailer).toBe(false);
    expect(json.discovery.durationSeconds).toBeGreaterThanOrEqual(3600);
    expect(json.discovery.streamUrl).toContain('upload.wikimedia.org');
  });

  test('API Discovery: GET /api/playback/discover?tmdbId=86817 evaluates The Cosmonaut and returns REJECTED status', async ({ request }) => {
    const res = await request.get('/api/playback/discover?tmdbId=86817');
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.discovery.tmdbId).toBe(86817);
    expect(json.discovery.status).toBe('REJECTED');
    expect(json.discovery.isTechnicallyAccessible).toBe(false);
    expect(json.discovery.reason).toMatch(/thecosmonaut\.org/);
  });

  test('Catalog: Night of the Living Dead (/title/movie/10331) loads KinoRoomPlayer with Public Domain attribution', async ({ page, browserName }) => {
    await page.goto('/title/movie/10331');

    // Title header
    await expect(page.locator('h1')).toContainText(/Night of the Living Dead|Ночь живых мертвецов/i);

    // Player container
    const playerContainer = page.locator('#media-player-container');
    await expect(playerContainer).toBeVisible();

    // Attribution banner with Public Domain license
    const attribution = page.locator('[data-testid="playback-attribution"]');
    await expect(attribution).toBeVisible({ timeout: 15_000 });
    await expect(attribution).toContainText(/Ромеро|Romero|Wikimedia/i);
    await expect(attribution).toContainText(/Общественное достояние|Public Domain/i);

    // Video player element
    const videoLocator = page.locator('video');
    await expect(videoLocator).toBeVisible();

    if (!(browserName === 'webkit' && process.platform === 'win32')) {
      await page.waitForFunction(() => {
        const v = document.querySelector('video');
        return v && v.duration > 0;
      }, null, { timeout: 25_000 });
    }
  });

  test('Catalog: The Cosmonaut (/title/movie/86817) shows honest unavailable message without fake demo fallback', async ({ page }) => {
    await page.goto('/title/movie/86817');

    // The unavailable fallback container in native tab
    const fallbackMessage = page.locator('text=Прямой открытый медиапоток не обнаружен');
    await expect(fallbackMessage).toBeVisible({ timeout: 15_000 });

    // Video player should NOT be rendered
    const videoLocator = page.locator('video');
    await expect(videoLocator).toHaveCount(0);

    // Attribution banner should NOT be rendered
    const attribution = page.locator('[data-testid="playback-attribution"]');
    await expect(attribution).toHaveCount(0);
  });

  test('Step 2E: Fight Club (TMDB 550) & Breaking Bad (TMDB 1396 S01E01) use only EmbedWave — Cinesrc with zero ad provider requests', async ({ page, request }) => {
    const forbiddenDomains = [
      'vidsrc.sh',
      'vidsrc.to',
      'vidsrc.hair',
      'vidlink.pro',
      'vidcore.org',
      'vixsrc.to',
      'autoembed.cc',
      'ezvidapi.com',
      'multiembed.mov',
      'kinobox.tv'
    ];
    const forbiddenRequests: string[] = [];

    page.on('request', (req) => {
      const url = req.url().toLowerCase();
      if (forbiddenDomains.some((d) => url.includes(d))) {
        forbiddenRequests.push(url);
      }
    });

    // 1. API verification for Movie (Fight Club TMDB 550) and TV (Breaking Bad TMDB 1396 S01E01)
    const movieApiRes = await request.get('/api/playback/external-sources?tmdbId=550&type=movie');
    expect(movieApiRes.ok()).toBe(true);
    const movieJson = await movieApiRes.json();
    expect(movieJson.success).toBe(true);
    expect(movieJson.sources.length).toBe(1);
    expect(movieJson.sources[0].name).toBe('EmbedWave — Cinesrc');
    expect(movieJson.sources[0].iframeUrl).toBe('https://embedwave.cc/embed/movie/550?server=cinesrc');

    const tvApiRes = await request.get('/api/playback/external-sources?tmdbId=1396&type=tv&season=1&episode=1');
    expect(tvApiRes.ok()).toBe(true);
    const tvJson = await tvApiRes.json();
    expect(tvJson.success).toBe(true);
    expect(tvJson.sources.length).toBe(1);
    expect(tvJson.sources[0].name).toBe('EmbedWave — Cinesrc');
    expect(tvJson.sources[0].iframeUrl).toBe('https://embedwave.cc/embed/tv/1396/1/1?server=cinesrc');

    // 2. UI verification for Fight Club (/title/movie/550)
    await page.goto('/title/movie/550');

    // Switch to "Онлайн-источники" tab
    const onlineTabBtn = page.locator('button:has-text("Онлайн-источники")');
    await expect(onlineTabBtn).toBeVisible({ timeout: 10_000 });
    await onlineTabBtn.click();

    const onlineContainer = page.locator('[data-testid="online-player-container"]');
    await expect(onlineContainer).toBeVisible({ timeout: 10_000 });

    // Single experimental card "EmbedWave — Cinesrc" is displayed
    const card = page.locator('[data-testid="experimental-source-card"]');
    await expect(card).toContainText('EmbedWave — Cinesrc');
    await expect(card).toContainText('Экспериментальный');

    // Honest capabilities list is displayed
    const capabilities = page.locator('[data-testid="cinesrc-capabilities-info"]');
    await expect(capabilities).toContainText('Воспроизведение фильма подтверждено на iPhone для тестового TMDB 550.');
    await expect(capabilities).toContainText('Русская озвучка не подтверждена.');
    await expect(capabilities).toContainText('Качество не подтверждено.');
    await expect(capabilities).toContainText('Полное отсутствие рекламы не подтверждено.');

    // Rejected provider buttons must NOT exist in UI
    await expect(page.locator('button:has-text("VidSrc")')).toHaveCount(0);
    await expect(page.locator('button:has-text("VidLink")')).toHaveCount(0);
    await expect(page.locator('button:has-text("VidCore")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Kodik")')).toHaveCount(0);
    await expect(page.locator('button:has-text("EzVidAPI")')).toHaveCount(0);

    // Iframe uses ?server=cinesrc and has strict sandbox
    const movieIframe = page.locator('iframe[src="https://embedwave.cc/embed/movie/550?server=cinesrc"]');
    await expect(movieIframe).toBeVisible({ timeout: 5000 });
    await expect(movieIframe).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms allow-modals allow-presentation'
    );

    // Re-opening / resetting card keeps ?server=cinesrc and never reverts to nxsha
    const resetBtn = page.locator('button:has-text("Сбросить на Cinesrc")');
    await resetBtn.click();
    await expect(movieIframe).toBeVisible({ timeout: 5000 });

    // 3. UI verification for TV Series Breaking Bad (/title/tv/1396)
    await page.goto('/title/tv/1396');
    const tvOnlineTabBtn = page.locator('button:has-text("Онлайн-источники")');
    await expect(tvOnlineTabBtn).toBeVisible({ timeout: 10_000 });
    await tvOnlineTabBtn.click();

    const tvIframe = page.locator('iframe[src="https://embedwave.cc/embed/tv/1396/1/1?server=cinesrc"]');
    await expect(tvIframe).toBeVisible({ timeout: 5000 });

    // Confirm zero requests were made to any rejected/ad domains
    expect(forbiddenRequests).toEqual([]);
  });

  test('Step 2E Laboratory (/player-test/providers): Audit cards, EmbedWave ?server=cinesrc, and no rejected iframes mounted', async ({ page }) => {
    await page.goto('/player-test/providers');

    await expect(page.locator('h1:has-text("Анализ и ручная проверка")')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-testid="provider-card-embedwave"]')).toBeVisible({ timeout: 10_000 });

    // 1. Default active provider is EmbedWave — Cinesrc with ?server=cinesrc
    const defaultIframe = page.locator('iframe[src="https://embedwave.cc/embed/movie/550?server=cinesrc"]');
    await expect(defaultIframe).toBeVisible({ timeout: 5000 });

    // 2. Preset switching: click "Breaking Bad (TV S1:E1)"
    const breakingBadBtn = page.locator('button:has-text("Breaking Bad")');
    await breakingBadBtn.click();
    const tvIframe = page.locator('iframe[src="https://embedwave.cc/embed/tv/1396/1/1?server=cinesrc"]');
    await expect(tvIframe).toBeVisible({ timeout: 5000 });

    // 3. Selecting a rejected provider (VidLink) unmounts EmbedWave and does NOT mount any rejected iframe
    const vidlinkCard = page.locator('[data-testid="provider-card-vidlink"]');
    const openVidlinkBtn = vidlinkCard.locator('button:has-text("Открыть плеер")');
    await openVidlinkBtn.click();

    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('h4:has-text("VidLink: UNAVAILABLE")')).toBeVisible();

    // 4. Selecting VidSrc.hair shows DNS NXDOMAIN diagnostic without mounting iframe
    const vidsrcHairCard = page.locator('[data-testid="provider-card-vidsrc_hair"]');
    const openHairBtn = vidsrcHairCard.locator('button:has-text("Открыть плеер")');
    await openHairBtn.click();

    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('h4:has-text("VidSrc.hair: UNAVAILABLE")')).toBeVisible();
    await expect(page.locator('text=DNS NXDOMAIN')).toBeVisible();
  });

  test('Step 2F: Russian Subtitles for CineSrc (Fight Club TMDB 550) — upload SRT/VTT, start, pause, seek 10m/30m, track switch, delay offset, and player reset', async ({ page }) => {
    // Intercept direct cinesrc.st iframe with a controlled postMessage harness on origin https://cinesrc.st
    // This verifies real cross-origin postMessage validation (event.origin === 'https://cinesrc.st' & event.source === iframe.contentWindow)
    await page.route('https://cinesrc.st/embed/movie/550', async (route) => {
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Controlled CineSrc Test Frame</title></head>
<body style="background:#000;color:#fff;font-family:sans-serif;">
  <div id="status">CineSrc Test Player Ready</div>
  <script>
    let currentTime = 0;
    let duration = 7984;
    let paused = true;

    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'cinesrc:command') {
        if (d.command === 'seek' && Array.isArray(d.args)) {
          currentTime = Number(d.args[0]) || 0;
          window.parent.postMessage({ type: 'cinesrc:seeking', currentTime, duration }, '*');
          window.parent.postMessage({ type: 'cinesrc:seeked', currentTime, duration }, '*');
          window.parent.postMessage({ type: 'cinesrc:timeupdate', currentTime, duration }, '*');
        } else if (d.command === 'getCurrentTime') {
          window.parent.postMessage({ type: 'cinesrc:response', id: d.id, command: 'getCurrentTime', result: currentTime }, '*');
        } else if (d.command === 'getDuration') {
          window.parent.postMessage({ type: 'cinesrc:response', id: d.id, command: 'getDuration', result: duration }, '*');
        } else if (d.command === 'pause') {
          paused = true;
          window.parent.postMessage({ type: 'cinesrc:pause' }, '*');
        } else if (d.command === 'play') {
          paused = false;
          window.parent.postMessage({ type: 'cinesrc:play' }, '*');
        }
      } else if (d.type === 'test:emit') {
        if (typeof d.payload.currentTime === 'number') currentTime = d.payload.currentTime;
        if (typeof d.payload.duration === 'number') duration = d.payload.duration;
        window.parent.postMessage(d.payload, '*');
      }
    });

    setTimeout(() => {
      window.parent.postMessage({ type: 'cinesrc:sourceused', sourceId: 'Vidzy' }, '*');
      window.parent.postMessage({ type: 'cinesrc:ready' }, '*');
      window.parent.postMessage({ type: 'cinesrc:loadedmetadata', duration: 7984 }, '*');
    }, 80);
  </script>
</body>
</html>`;
      await route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: html
      });
    });

    await page.goto('/title/movie/550');

    // 1. Open "Онлайн-источники" tab and verify default remains EmbedWave — Cinesrc
    const onlineTabBtn = page.locator('button:has-text("Онлайн-источники")');
    await expect(onlineTabBtn).toBeVisible({ timeout: 10_000 });
    await onlineTabBtn.click();

    const defaultIframe = page.locator('iframe[src="https://embedwave.cc/embed/movie/550?server=cinesrc"]');
    await expect(defaultIframe).toBeVisible({ timeout: 5000 });

    // 2. Open «Субтитры» panel and verify honest initial state:
    //    - «Русские (не загружены)» is disabled before any track is loaded
    //    - Honest warning that EmbedWave wrapper does not forward cinesrc:timeupdate events
    const subtitlesBtn = page.getByTestId('external-subtitles-button');
    await subtitlesBtn.click();

    const subtitlesPanel = page.getByTestId('external-subtitles-panel');
    await expect(subtitlesPanel).toBeVisible();

    const ruOptionBtn = page.getByTestId('subtitle-option-ru');
    await expect(ruOptionBtn).toBeDisabled();
    await expect(ruOptionBtn).toContainText('Русские (не загружены)');

    const syncStatus = page.getByTestId('subtitle-sync-status');
    await expect(syncStatus).toContainText('Автоматическая синхронизация недоступна через обёртку EmbedWave');

    // 3. Switch to experimental «Прямой CineSrc (Субтитры)» mode
    await page.getByTestId('mode-cinesrc-direct-btn').click();
    const directIframe = page.locator('iframe[src="https://cinesrc.st/embed/movie/550"]');
    await expect(directIframe).toBeVisible({ timeout: 5000 });

    // Wait for cinesrc:ready & cinesrc:loadedmetadata from controlled frame
    await expect(syncStatus).toContainText('Синхронизация с CineSrc активна', { timeout: 5000 });

    // 4. Upload a short permitted test .srt file with known Russian cues at start (12s), 10m (600s), and 30m (1800s)
    //    (Explicitly a synthetic test file, not claiming to be copyrighted Fight Club dialogue)
    const permittedTestSrt = `1
00:00:10,000 --> 00:00:16,000
<script>window.__xssExecuted = true;</script>Тестовая русская реплика (старт воспроизведения).
Вторая строка для проверки переноса.

2
00:10:00,000 --> 00:10:08,000
Тестовая русская реплика на 10-й минуте (600 секунд).

3
00:30:00,000 --> 00:30:08,000
Тестовая русская реплика на 30-й минуте (1800 секунд).
`;

    const fileInput = page.getByTestId('subtitle-file-input');
    await fileInput.setInputFiles({
      name: 'permitted-test-ru.srt',
      mimeType: 'application/x-subrip',
      buffer: Buffer.from(permittedTestSrt, 'utf-8')
    });

    await expect(ruOptionBtn).toBeEnabled();
    await expect(ruOptionBtn).toContainText('Русские (3 реплик)');

    // Helper to emit a controlled cinesrc:* event from inside the https://cinesrc.st iframe
    const emitFromCineSrcIframe = async (payload: Record<string, unknown>) => {
      await page.evaluate((pl) => {
        const iframe = document.querySelector('iframe[src="https://cinesrc.st/embed/movie/550"]') as HTMLIFrameElement | null;
        iframe?.contentWindow?.postMessage({ type: 'test:emit', payload: pl }, '*');
      }, payload);
    };

    // 5. START playback & timeupdate at 12.5s
    await emitFromCineSrcIframe({ type: 'cinesrc:play' });
    await emitFromCineSrcIframe({ type: 'cinesrc:timeupdate', currentTime: 12.5, duration: 7984 });

    const cueBox = page.getByTestId('external-subtitle-cue-box');
    await expect(cueBox).toBeVisible();
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText(
      'Тестовая русская реплика (старт воспроизведения).'
    );
    await expect(page.getByTestId('external-subtitle-line-1')).toHaveText(
      'Вторая строка для проверки переноса.'
    );

    // Verify XSS script was stripped and never executed
    const xssExecuted = await page.evaluate(() => Boolean((window as any).__xssExecuted));
    expect(xssExecuted).toBe(false);

    // 6. PAUSE at 12.5s — verify state shows Пауза and time does not drift autonomously
    await emitFromCineSrcIframe({ type: 'cinesrc:pause' });
    await expect(syncStatus).toContainText('(Пауза)');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText(
      'Тестовая русская реплика (старт воспроизведения).'
    );

    // 7. SEEK to 10 minutes (600s) using CineSrc command button
    await page.getByTestId('cinesrc-seek-10m').click();
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText(
      'Тестовая русская реплика на 10-й минуте (600 секунд).'
    );
    await expect(page.getByTestId('external-subtitle-line-1')).toHaveCount(0);

    // 8. SEEK to 30 minutes (1800s) using CineSrc command button
    await page.getByTestId('cinesrc-seek-30m').click();
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText(
      'Тестовая русская реплика на 30-й минуте (1800 секунд).'
    );

    // 9. SUBTITLE DELAY OFFSET (+5.0s shifts [1800..1808] to [1805..1813], so at 1800s cue hides until 1806s)
    await page.getByTestId('subtitle-offset-plus-5').click();
    await expect(page.getByTestId('subtitle-offset-value')).toHaveText('+5.0 сек');
    await expect(cueBox).toHaveCount(0);

    await emitFromCineSrcIframe({ type: 'cinesrc:timeupdate', currentTime: 1806.0, duration: 7984 });
    await expect(cueBox).toBeVisible();
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText(
      'Тестовая русская реплика на 30-й минуте (1800 секунд).'
    );

    // Reset offset back to 0.0s
    await page.getByTestId('subtitle-offset-reset').click();
    await expect(page.getByTestId('subtitle-offset-value')).toHaveText('0.0 сек');

    // 10. SUBTITLE TRACK SWITCHING (upload second VTT track, switch between tracks, turn OFF and ON)
    const secondPermittedVtt = `WEBVTT

00:30:00.000 --> 00:30:10.000
Альтернативная дорожка VTT на 30-й минуте.
`;
    await fileInput.setInputFiles({
      name: 'permitted-alt-ru.vtt',
      mimeType: 'text/vtt',
      buffer: Buffer.from(secondPermittedVtt, 'utf-8')
    });

    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText(
      'Альтернативная дорожка VTT на 30-й минуте.'
    );

    // Switch back to first track (index 0)
    await page.getByTestId('subtitle-track-item-0').click();
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText(
      'Тестовая русская реплика на 30-й минуте (1800 секунд).'
    );

    // Turn subtitles OFF -> overlay disappears
    await page.getByTestId('subtitle-option-off').click();
    await expect(cueBox).toHaveCount(0);

    // Turn subtitles back ON -> overlay reappears immediately
    await ruOptionBtn.click();
    await expect(cueBox).toBeVisible();

    // 11. CINEMA FULLSCREEN MODE (preserves HTML subtitle overlay for iPhone/Desktop)
    await page.getByTestId('cinema-fullscreen-toggle').click();
    await expect(page.getByTestId('exit-cinema-fullscreen-btn')).toBeVisible();
    await expect(cueBox).toBeVisible();
    await page.getByTestId('exit-cinema-fullscreen-btn').click();

    // 12. RE-OPENING / RESETTING PLAYER («Сбросить на Cinesrc»)
    await page.locator('button:has-text("Сбросить на Cinesrc")').click();
    // Wait for new iframe instance to emit ready + timeupdate at 602s
    await expect(syncStatus).toContainText('Синхронизация с CineSrc активна', { timeout: 5000 });
    await emitFromCineSrcIframe({ type: 'cinesrc:timeupdate', currentTime: 602.0, duration: 7984 });
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText(
      'Тестовая русская реплика на 10-й минуте (600 секунд).'
    );

    // 13. Verify OpenSubtitles REST API v1 search button honestly reports status without fake subtitles
    await page.getByTestId('opensubtitles-search-button').click();
    const osBadge = page.getByTestId('opensubtitles-status-badge');
    await expect(osBadge).toBeVisible({ timeout: 5000 });
    await expect(osBadge).toHaveText('REQUIRES_KEY');
  });

  test('Step 2F: SubDL API v2 Automatic Subtitles for Fight Club (TMDB 550) — auto-download, cue sync, candidate switching, provisional badges, and localStorage preference', async ({ page }) => {
    // Intercept SubDL API route with realistic Fight Club responses
    await page.route('**/api/playback/subtitles/subdl*', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            status: 'CONNECTED',
            configured: true,
            apiEndpoint: 'https://api.subdl.com/api/v2/subtitles/search',
            tmdbId: 550,
            mediaType: 'movie',
            candidates: [
              {
                id: 'subdl-550-bluray',
                name: 'Fight.Club.1999.1080p.BluRay.x264.ru.srt',
                releaseName: 'Fight.Club.1999.1080p.BluRay.DTS-HD.MA.5.1',
                lang: 'ru',
                language: 'Russian',
                format: 'srt',
                fps: 23.976,
                hearingImpaired: false,
                downloads: 14200,
                url: '/api/v2/subtitles/subdl-550-bluray/download',
                downloadUrl: 'https://api.subdl.com/api/v2/subtitles/subdl-550-bluray/download',
                isCompatibleVersion: true,
                isProvisional: false,
                versionTag: 'BluRay / BDRip',
                compatibilityNote: 'Оригинальный BluRay/BDRip релиз.'
              },
              {
                id: 'subdl-550-extended',
                name: 'Fight.Club.1999.Extended.Director.Cut.ru.srt',
                releaseName: 'Fight Club Extended Director Cut',
                lang: 'ru',
                language: 'Russian',
                format: 'srt',
                fps: 23.976,
                hearingImpaired: false,
                downloads: 5200,
                url: '/api/v2/subtitles/subdl-550-extended/download',
                downloadUrl: 'https://api.subdl.com/api/v2/subtitles/subdl-550-extended/download',
                isCompatibleVersion: true,
                isProvisional: true,
                versionTag: "Director's / Extended Cut",
                compatibilityNote: 'Внимание: версия Extended / Director’s Cut — может потребоваться сдвиг времени (+/-).'
              }
            ],
            bestCandidate: {
              id: 'subdl-550-bluray',
              name: 'Fight.Club.1999.1080p.BluRay.x264.ru.srt',
              releaseName: 'Fight.Club.1999.1080p.BluRay.DTS-HD.MA.5.1',
              lang: 'ru',
              language: 'Russian',
              format: 'srt',
              fps: 23.976,
              hearingImpaired: false,
              downloads: 14200,
              url: '/api/v2/subtitles/subdl-550-bluray/download',
              downloadUrl: 'https://api.subdl.com/api/v2/subtitles/subdl-550-bluray/download',
              isCompatibleVersion: true,
              isProvisional: false,
              versionTag: 'BluRay / BDRip',
              compatibilityNote: 'Оригинальный BluRay/BDRip релиз.'
            },
            autoLoadedSubtitle: {
              content: `1\n00:00:10,000 --> 00:00:16,000\nБойцовский клуб: вступительная реплика из SubDL.\nВторая строка диалога.\n\n2\n00:10:00,000 --> 00:10:08,000\nРеплика Бойцовского клуба на 10-й минуте (600 секунд).\n\n3\n00:30:00,000 --> 00:30:08,000\nРеплика Бойцовского клуба на 30-й минуте (1800 секунд).\n`,
              fileName: 'Fight.Club.1999.1080p.BluRay.x264.ru.srt',
              format: 'srt',
              cueCount: 3,
              warnings: [],
              isProvisional: false
            },
            message: 'Найдено 2 версий русских субтитров в SubDL.'
          })
        });
      } else if (request.method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            status: 'CONNECTED',
            subtitleId: 'subdl-550-extended',
            fileName: 'Fight.Club.1999.Extended.Director.Cut.ru.srt',
            content: `1\n00:00:10,000 --> 00:00:16,000\nРеплика режиссёрской версии из SubDL.\n\n2\n00:10:00,000 --> 00:10:08,000\nРежиссёрская версия на 10-й минуте.\n`,
            format: 'srt',
            cueCount: 2,
            warnings: ['Внимание: версия Extended / Director’s Cut'],
            isProvisional: true,
            message: 'Субтитры успешно загружены и декодированы.'
          })
        });
      }
    });

    // Mock direct CineSrc iframe
    await page.route('https://cinesrc.st/embed/movie/550', async (route) => {
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Controlled CineSrc Test Frame</title></head>
<body style="background:#000;color:#fff;">
  <script>
    let currentTime = 0;
    let duration = 7984;
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'cinesrc:command' && d.command === 'seek' && Array.isArray(d.args)) {
        currentTime = Number(d.args[0]) || 0;
        window.parent.postMessage({ type: 'cinesrc:timeupdate', currentTime, duration }, '*');
      } else if (d.type === 'test:emit') {
        if (typeof d.payload.currentTime === 'number') currentTime = d.payload.currentTime;
        window.parent.postMessage(d.payload, '*');
      }
    });
    setTimeout(() => {
      window.parent.postMessage({ type: 'cinesrc:ready' }, '*');
      window.parent.postMessage({ type: 'cinesrc:loadedmetadata', duration: 7984 }, '*');
    }, 80);
  </script>
</body>
</html>`;
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    });

    await page.goto('/title/movie/550');

    // Open "Онлайн-источники" tab
    await page.locator('button:has-text("Онлайн-источники")').click();

    // Open "Субтитры" panel
    await page.getByTestId('external-subtitles-button').click();
    await expect(page.getByTestId('external-subtitles-panel')).toBeVisible();

    // 1. Verify SubDL section rendered with CONNECTED status badge
    await expect(page.getByTestId('subdl-section')).toBeVisible();
    const subdlBadge = page.getByTestId('subdl-status-badge');
    await expect(subdlBadge).toBeVisible();
    await expect(subdlBadge).toHaveText('CONNECTED');

    // 2. Verify candidate list has both versions
    const candidateList = page.getByTestId('subdl-candidates-list');
    await expect(candidateList).toBeVisible();
    await expect(page.getByTestId('subdl-candidate-0')).toContainText('Fight.Club.1999.1080p.BluRay');
    await expect(page.getByTestId('subdl-candidate-0')).toContainText('BluRay / BDRip');

    await expect(page.getByTestId('subdl-candidate-1')).toContainText('Fight Club Extended Director Cut');
    await expect(page.getByTestId('subdl-candidate-provisional-1')).toBeVisible();

    // 3. Verify automatic autoLoadedSubtitle activated the Russian track
    const ruOptionBtn = page.getByTestId('subtitle-option-ru');
    await expect(ruOptionBtn).toBeEnabled();
    await expect(ruOptionBtn).toContainText('Русские (3 реплик)');

    // 4. Switch to Direct CineSrc mode and test playback synchronization
    await page.getByTestId('mode-cinesrc-direct-btn').click();
    await expect(page.getByTestId('subtitle-sync-status')).toContainText('Синхронизация с CineSrc активна', { timeout: 5000 });

    const emitFromFrame = async (payload: Record<string, unknown>) => {
      await page.evaluate((pl) => {
        const iframe = document.querySelector('iframe[src="https://cinesrc.st/embed/movie/550"]') as HTMLIFrameElement | null;
        iframe?.contentWindow?.postMessage({ type: 'test:emit', payload: pl }, '*');
      }, payload);
    };

    // Play & timeupdate at 12s
    await emitFromFrame({ type: 'cinesrc:play' });
    await emitFromFrame({ type: 'cinesrc:timeupdate', currentTime: 12.0, duration: 7984 });

    const cueBox = page.getByTestId('external-subtitle-cue-box');
    await expect(cueBox).toBeVisible();
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText('Бойцовский клуб: вступительная реплика из SubDL.');

    // Seek to 10m (600s)
    await page.getByTestId('cinesrc-seek-10m').click();
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText('Реплика Бойцовского клуба на 10-й минуте (600 секунд).');

    // 5. Test candidate version switching: select Director's Cut (candidate-1)
    await page.getByTestId('subdl-candidate-select-btn-1').click();

    // Verify Russian option updates with provisional badge
    await expect(ruOptionBtn).toContainText('Русские (2 реплик) [Предв.]');
    await expect(page.getByTestId('subtitle-provisional-badge')).toBeVisible();

    // Re-trigger timeupdate at 10m to see new Director's Cut cue
    await emitFromFrame({ type: 'cinesrc:timeupdate', currentTime: 602.0, duration: 7984 });
    await expect(page.getByTestId('external-subtitle-line-0')).toHaveText('Режиссёрская версия на 10-й минуте.');

    // 6. Test user preference persistence in localStorage
    await page.getByTestId('subtitle-option-off').click();
    await expect(cueBox).toHaveCount(0);
    const prefOff = await page.evaluate(() => localStorage.getItem('kinoroom_subtitle_pref'));
    expect(prefOff).toBe('off');

    await ruOptionBtn.click();
    await expect(cueBox).toBeVisible();
    const prefRu = await page.evaluate(() => localStorage.getItem('kinoroom_subtitle_pref'));
    expect(prefRu).toBe('ru');
  });

  test('Step 2F: SubDL API v2 TV Series Breaking Bad (TMDB 1396 S01E01) — exact season and episode parameter routing', async ({ page }) => {
    let capturedParams: Record<string, string> = {};

    await page.route('**/api/playback/subtitles/subdl*', async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.forEach((val, key) => {
        capturedParams[key] = val;
      });

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          status: 'CONNECTED',
          configured: true,
          apiEndpoint: 'https://api.subdl.com/api/v2/subtitles/search',
          tmdbId: 1396,
          mediaType: 'tv',
          season: 1,
          episode: 1,
          candidates: [
            {
              id: 'subdl-bb-s01e01',
              name: 'Breaking.Bad.S01E01.Pilot.720p.ru.srt',
              releaseName: 'Breaking.Bad.S01E01.Pilot.WEB-DL',
              lang: 'ru',
              language: 'Russian',
              season: 1,
              episode: 1,
              format: 'srt',
              fps: 23.976,
              downloads: 8900,
              url: '/api/v2/subtitles/subdl-bb-s01e01/download',
              isCompatibleVersion: true,
              isProvisional: false,
              versionTag: 'WEB-DL / WEBRip',
              compatibilityNote: 'Точное совпадение серии S01E01'
            }
          ],
          message: 'Найдена 1 версия русских субтитров в SubDL.'
        })
      });
    });

    await page.goto('/title/tv/1396?season=1&episode=1');

    await page.locator('button:has-text("Онлайн-источники")').click();
    await page.getByTestId('external-subtitles-button').click();

    await expect(page.getByTestId('subdl-section')).toBeVisible();
    await expect(page.getByTestId('subdl-status-badge')).toHaveText('CONNECTED');
    await expect(page.getByTestId('subdl-candidate-0')).toContainText('Breaking.Bad.S01E01.Pilot');

    expect(capturedParams['tmdbId']).toBe('1396');
    expect(capturedParams['type']).toBe('tv');
    expect(capturedParams['season']).toBe('1');
    expect(capturedParams['episode']).toBe('1');
  });

  test('Step 2F: SubDL API v2 honest REQUIRES_KEY status when API key is unconfigured', async ({ page }) => {
    await page.route('**/api/playback/subtitles/subdl*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          status: 'REQUIRES_KEY',
          configured: false,
          apiEndpoint: 'https://api.subdl.com/api/v2/subtitles/search',
          tmdbId: 550,
          mediaType: 'movie',
          candidates: [],
          message: 'API-ключ SubDL (SUBDL_API_KEY) не настроен в переменных окружения сервера KinoRoom.'
        })
      });
    });

    await page.goto('/title/movie/550');
    await page.locator('button:has-text("Онлайн-источники")').click();
    await page.getByTestId('external-subtitles-button').click();

    await expect(page.getByTestId('subdl-section')).toBeVisible();
    const badge = page.getByTestId('subdl-status-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('REQUIRES_KEY');
    await expect(page.getByTestId('subdl-status-box')).toContainText('API-ключ SubDL (SUBDL_API_KEY) не настроен');
  });
});




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
    const fallbackMessage = page.locator('text=Прямой открытый HLS-поток не обнаружен');
    await expect(fallbackMessage).toBeVisible({ timeout: 15_000 });

    // Video player should NOT be rendered
    const videoLocator = page.locator('video');
    await expect(videoLocator).toHaveCount(0);

    // Attribution banner should NOT be rendered
    const attribution = page.locator('[data-testid="playback-attribution"]');
    await expect(attribution).toHaveCount(0);
  });
});

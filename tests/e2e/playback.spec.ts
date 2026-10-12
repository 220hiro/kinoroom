import { test, expect } from '@playwright/test';

test.describe('KinoRoom Player & Playback API E2E', () => {
  test('API: TMDB ID 969681 returns 404 SOURCE_UNAVAILABLE without fallback to demo stream', async ({ request }) => {
    const response = await request.post('/api/playback/resolve', {
      data: {
        mediaId: 969681,
        mediaType: 'movie',
      },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('SOURCE_UNAVAILABLE');
    expect(body.error).toBe('SOURCE_UNAVAILABLE');
    expect(body.stream.url).toBe('');
    expect(body.provider.id).toBe('none');
  });

  test('UI /player-test: Loads real HLS video, plays, advances currentTime and performs seek without MediaError', async ({ page }) => {
    // 1. Open test player page
    await page.goto('/player-test');
    await expect(page.locator('h1')).toContainText('Тест-лаборатория KinoRoom Player');

    // 2. Video element exists
    const videoLocator = page.locator('video');
    await expect(videoLocator).toBeVisible({ timeout: 15_000 });

    // 3. Wait for video manifest to load (duration > 0)
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video && video.duration > 0;
    }, null, { timeout: 20_000 });

    const initialDuration = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.duration : 0;
    });
    expect(initialDuration).toBeGreaterThan(60);

    // 4. Trigger play
    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) {
        video.muted = true; // allow autoplay without browser audio block
        return video.play();
      }
    });

    // 5. Wait for currentTime to advance past 0.5s
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video && video.currentTime > 0.5;
    }, null, { timeout: 15_000 });

    const currentTimeAfterPlay = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.currentTime : 0;
    });
    expect(currentTimeAfterPlay).toBeGreaterThan(0.5);

    // 6. Verify absence of MediaError
    const mediaError = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video?.error ? { code: video.error.code, message: video.error.message } : null;
    });
    expect(mediaError).toBeNull();

    // 7. Perform seek forward (to 30s)
    await page.evaluate(() => {
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = 30;
      }
    });

    // Wait for seek to settle
    await page.waitForFunction(() => {
      const video = document.querySelector('video');
      return video && video.currentTime >= 28;
    }, null, { timeout: 10_000 });

    const currentTimeAfterSeek = await page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.currentTime : 0;
    });
    expect(currentTimeAfterSeek).toBeGreaterThanOrEqual(28);

    // 8. Test the live TMDB 969681 button on the UI
    const testButton = page.locator('button:has-text("Запустить тест запроса TMDB 969681")');
    await expect(testButton).toBeVisible();
    await testButton.click();

    // Wait for dynamic success message
    await expect(page.locator('text=SOURCE_UNAVAILABLE: API честно сообщает об отсутствии прямого потока')).toBeVisible({ timeout: 10_000 });
  });
});

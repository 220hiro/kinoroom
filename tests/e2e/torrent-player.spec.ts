import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

let directory: string;
test.beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kadr-browser-'));
  const ffmpeg = process.env.FFMPEG_PATH || (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'KinoRoom/gst-pilot/ffmpeg/ffmpeg-n9.0-latest-win64-gpl-9.0/bin/ffmpeg.exe') : '/usr/bin/ffmpeg');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=240x136:rate=24:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=8',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '24', '-c:a', 'aac', '-ac', '2', '-hls_time', '1', '-hls_list_size', '0', '-hls_segment_type', 'fmp4',
    '-hls_segment_filename', 'seg%05d.m4s', 'index.m3u8'], { cwd: directory, timeout: 20000, windowsHide: true });
});
test.afterAll(async () => { if (directory) await fs.rm(directory, { recursive: true, force: true }); });

async function fixtures(page: Page, connected = true) {
  await page.route('**/api/torrent/torrserver', route => route.fulfill({ json: { configured: connected, playbackAvailable: connected, publicUrl: null } }));
  await page.route('**/api/auth', route => route.fulfill({ json: { required: false, authenticated: true } }));
  await page.route('**/api/media/details?*', route => route.fulfill({ json: { media: {
    id: 157336, type: 'movie', title: 'Проверочный фильм', originalTitle: 'Fixture', year: 2014, runtime: 120,
    overview: 'Контролируемая проверка', poster: '', backdrop: '', genres: [], cast: []
  } } }));
  await page.route('**/api/torrent/search?*', route => route.fulfill({ json: [{ title: 'Проверочная раздача', magnet: 'magnet:?xt=urn:btih:' + '1'.repeat(40), seeds: 10, peers: 1, size: '1 GB', tracker: 'Fixture' }] }));
  await page.route('**/api/playback/external-sources?*', route => route.fulfill({ json: { success: true, sources: [] } }));
  await page.route('**/api/playback/subtitles/**', route => route.fulfill({ json: { success: true, status: 'NOT_FOUND', candidates: [] } }));
  if (!connected) return;
  await page.route('**/api/torrent/playback', route => route.fulfill({ json: { session: 'a'.repeat(32), fileIndex: 1, files: [{ index: 1, name: 'film.mkv', isVideo: true }], info: {
    duration: 8, videoCodec: 'h264', audio: [{ id: 1, label: 'Русский', language: 'rus', codec: 'ac3', supported: true }, { id: 2, label: 'English', language: 'eng', codec: 'ac3', supported: true }],
    subtitles: [{ id: 3, label: 'Русские', language: 'rus', codec: 'subrip', supported: true }, { id: 4, label: 'Графические', language: 'eng', codec: 'hdmv_pgs_subtitle', supported: false }]
  } } }));
  await page.route('**/api/torrent/playback/**', async route => {
    if (route.request().method() === 'DELETE') return route.fulfill({ status: 204 });
    const name = new URL(route.request().url()).pathname.split('/').pop()!;
    if (name === 'subtitles.vtt') return route.fulfill({ contentType: 'text/vtt', body: 'WEBVTT\n\n00:00:00.100 --> 00:00:07.900\nРусские субтитры\n' });
    if (!/^(index\.m3u8|init\.mp4|seg\d{5}\.m4s)$/.test(name)) return route.abort();
    return route.fulfill({ contentType: name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp4', body: await fs.readFile(path.join(directory, name)) });
  });
}

test('catalog uses one torrent player, plays real HLS frames, selects audio and shows native subtitle cues', async ({ page }) => {
  const resources: string[] = [];
  page.on('request', request => { if (request.url().includes('/api/torrent/playback/')) resources.push(request.url()); });
  await fixtures(page);
  await page.goto('/title/movie/157336');
  const preparation = page.waitForRequest(request => request.url().endsWith('/api/torrent/playback') && request.method() === 'POST');
  await page.getByRole('button', { name: 'Смотреть раздачу', exact: true }).click();
  const body = (await preparation).postDataJSON();
  expect(body.season, 'a movie must not be resolved as season 1 / episode 1').toBeUndefined();
  expect(body.episode).toBeUndefined();
  await expect(page.locator('video')).toHaveCount(1);
  const hlsCapable = await page.locator('video').evaluate((v: HTMLVideoElement) => {
    const mediaSource = window.MediaSource || (window as any).ManagedMediaSource;
    return Boolean(v.canPlayType('application/vnd.apple.mpegurl') || mediaSource?.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"'));
  });
  if (!hlsCapable) {
    await expect(page.getByRole('region', { name: 'Торрент-плеер КАДР' }).getByRole('alert')).toContainText('Браузер не поддерживает');
    test.skip(true, 'This desktop runtime has neither native HLS nor compatible MSE. It does not test real Safari iOS playback.');
  }
  // Safari can require a fresh, explicit gesture after asynchronous stream preparation.
  if (await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)) {
    const play = page.getByRole('button', { name: 'Воспроизвести', exact: true });
    if (await play.isVisible()) await play.click();
  }
  try {
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 15000 }).toBeGreaterThan(0.2);
  } catch (error) {
    console.log('Media failure diagnostics', await page.locator('video').evaluate((v: HTMLVideoElement) => ({
      paused: v.paused, ready: v.readyState, network: v.networkState, error: v.error?.message, nativeHls: v.canPlayType('application/vnd.apple.mpegurl'), mp4: v.canPlayType('video/mp4; codecs="avc1.42E01E,mp4a.40.2"'), source: v.currentSrc
    })), resources);
    throw error;
  }
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
  await page.getByLabel('Субтитры', { exact: true }).selectOption('3');
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.textTracks[0]?.activeCues?.[0]?.text || ''), { timeout: 10000 }).toContain('Русские субтитры');
  await page.getByLabel('Субтитры', { exact: true }).selectOption('off');
  await expect(page.locator('video track')).toHaveCount(0);
  const selected = page.waitForRequest(request => request.url().includes('index.m3u8?audio=2'));
  await page.getByLabel('Озвучка', { exact: true }).selectOption('2');
  await selected;
  await expect(page.getByLabel('Озвучка', { exact: true })).toHaveValue('2');
  await expect(page.getByRole('button', { name: /экран/ })).toHaveCount(0);
});

for (const width of [320, 390, 768, 1280]) test(`player controls stay within their card at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await fixtures(page);
  await page.goto('/title/movie/157336'); await page.getByRole('button', { name: 'Смотреть раздачу', exact: true }).click();
  const player = page.getByRole('region', { name: 'Торрент-плеер КАДР' });
  await expect(player.getByLabel('Озвучка', { exact: true })).toBeVisible();
  const collisions = await player.evaluate(element => {
    const card = element.getBoundingClientRect();
    return [...element.querySelectorAll('button,select,input[type="range"]')].filter(control => {
      const r = control.getBoundingClientRect();
      return r.width > 0 && (r.left < card.left - 1 || r.right > card.right + 1);
    }).map(control => control.getAttribute('aria-label') || control.textContent);
  });
  expect(collisions).toEqual([]);
  await page.getByRole('textbox', { name: 'Поиск фильмов и сериалов' }).focus();
  const search = await page.getByRole('textbox', { name: 'Поиск фильмов и сериалов' }).boundingBox();
  const profile = await page.getByRole('button', { name: 'Сменить профиль' }).boundingBox();
  expect(search!.x + search!.width).toBeLessThanOrEqual(profile!.x);
  await fs.mkdir('.ai/artifacts/kadr', { recursive: true });
  await player.screenshot({ path: `.ai/artifacts/kadr/player-${width}.png` });
});

test('without an external media worker, show an honest error rather than a laptop fallback', async ({ page }) => {
  await fixtures(page, false);
  await page.goto('/title/movie/157336');
  await expect(page.getByRole('group', { name: 'Плеер', exact: true }).getByRole('button', { name: 'CineSrc', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Доступен торрент-стриминг', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Торрент-плеер', exact: true }).click();
  await page.getByRole('button', { name: 'Смотреть раздачу', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Торрент-плеер КАДР' }).getByRole('alert')).toContainText('внешнего медиасервера');
  await expect(page.getByRole('region', { name: 'Торрент-плеер КАДР' }).getByRole('button', { name: 'CineSrc', exact: true })).toBeVisible();
});

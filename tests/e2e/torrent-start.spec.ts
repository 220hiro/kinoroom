import { test, expect } from '@playwright/test';

for (const [errorName, expected] of [
  ['NotAllowedError', 'Браузер не разрешил запуск видео.'],
  ['NotSupportedError', 'Браузер не может воспроизвести этот формат видео или аудио.']
]) {
  test(`torrent play rejection ${errorName} leaves a retry button and reports the error (controlled fixture)`, async ({ page }) => {
    const uncaught: string[] = [];
    page.on('pageerror', error => uncaught.push(error.name));
    await page.addInitScript(name => {
      // Keep this rejection test independent of the platform's decoder/preload behavior.
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        configurable: true,
        get() { return this.getAttribute('data-fixture-source') || ''; },
        set(value) { this.setAttribute('data-fixture-source', value); }
      });
      HTMLMediaElement.prototype.load = function () {};
      HTMLMediaElement.prototype.play = function () {
        return Promise.reject(new DOMException('private-fixture', name));
      };
    }, errorName);
    await page.route('**/api/torrent/torrserver', route => route.fulfill({ json: { configured: false, publicUrl: null } }));
    await page.route('**/api/torrent/info?*', route => route.fulfill({ json: {
      infoHash: 'fixture', name: 'fixture', ready: true, numPeers: 1, progress: 0, downloadSpeed: 0, uploadSpeed: 0,
      downloaded: 0, total: 100, files: [{ index: 0, name: 'fixture.mp4', path: 'fixture.mp4', length: 100, isVideo: true }]
    } }));
    await page.route('**/api/torrent/stream?*', route => route.fulfill({ contentType: 'video/mp4', body: 'controlled fixture' }));
    await page.goto('/torrent');
    await page.getByPlaceholder('Вставьте magnet-ссылку сюда...').fill('magnet:?xt=urn:btih:0000000000000000000000000000000000000001');
    await page.getByRole('button', { name: 'Запустить трансляцию', exact: true }).click();
    await page.getByRole('button', { name: 'Воспроизвести', exact: true }).click();
    await expect(page.getByText(expected, { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Воспроизвести', exact: true })).toBeVisible();
    await expect(page.getByText('Буферизация потока...', { exact: true })).not.toBeVisible();
    expect(uncaught).toEqual([]);
    await expect(page.getByText('private-fixture', { exact: false })).not.toBeVisible();
  });
}

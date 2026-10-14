import { test, expect } from '@playwright/test';
import path from 'node:path';

test('local probe observes later-mounted video and status without exposing private data (controlled fixture, no P2P)', async ({ page }) => {
  await page.goto('/torrent');
  await page.route('**/api/torrent/info?torrent=private-fixture', route => route.fulfill({
    json: { ready: true, numPeers: 3, downloadSpeed: 1000, name: 'private-fixture', infoHash: 'private-fixture',
      diagnostics: { metadataAlreadyAvailable: false, metadataObservedMs: 20, firstPeerObservedMs: 5,
        secret: 'private-fixture', streams: [{ id: 1, metadataWaitMs: 20, firstByteMs: 10,
          bytesDelivered: 0, requestedBytes: 100, state: 'reading', nextPieceAvailable: false, peersWithNextPiece: 1,
          url: 'private-fixture' }] } }
  }));
  await page.evaluate(() => { (window as any).__probeOriginalFetch = window.fetch; });
  await page.addScriptTag({ path: path.resolve('scripts/playback-probe.js') });
  await page.evaluate(async () => {
    const video = document.createElement('video');
    document.body.appendChild(video);
    Object.defineProperty(video, 'currentSrc', { value: 'http://localhost/api/torrent/stream?torrent=private-fixture' });
    Object.defineProperty(video, 'paused', { value: false });
    for (const event of ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'playing', 'seeking', 'seeked', 'playing']) {
      video.dispatchEvent(new Event(event));
    }
    const response = await fetch('/api/torrent/info?torrent=private-fixture');
    // The application still gets the complete, unconsumed original response.
    if ((await response.json()).name !== 'private-fixture') throw new Error('Response changed');
  });
  await expect.poll(() => page.evaluate(() => (window as any).kinoProbe.snapshot().rows.some((r: any) => r.event === 'status'))).toBe(true);
  const result = await page.evaluate(() => (window as any).kinoProbe.snapshot());
  expect(JSON.stringify(result)).not.toContain('private-fixture');
  expect(result.summaries[0].metadataMs).not.toBeNull();
  expect(result.summaries[0].completedRebuffers).toHaveLength(1);
  expect(result.summaries[0].seekMs).toHaveLength(1);
  expect(result.summaries[0].seekToPlayingMs).toHaveLength(1);
  expect(result.rows.find((r: any) => r.event === 'status').server.streams[0].nextPieceAvailable).toBe(false);
  await page.evaluate(() => (window as any).kinoProbe.stop());
  expect(await page.evaluate(() => window.fetch === (window as any).__probeOriginalFetch)).toBe(true);
});

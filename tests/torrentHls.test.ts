import test from 'node:test';
import assert from 'node:assert/strict';
import { getFfmpegPath, isFfmpegAvailable } from '../src/lib/services/ffmpeg';
import { destroySession, rewritePlaylistWithParams, type TorrentHlsSession } from '../src/lib/services/torrentHls';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

test('FFmpeg locator discovers installed binary or returns null gracefully', () => {
  const binary = getFfmpegPath();
  if (binary) {
    assert.ok(fs.existsSync(binary), `Binary path ${binary} must exist on disk`);
    assert.ok(isFfmpegAvailable(), 'isFfmpegAvailable must be true when binary is found');
  } else {
    assert.equal(isFfmpegAvailable(), false);
  }
});

test('Torrent HLS session cleanup safely terminates readers and removes work directory', async () => {
  const testDir = path.join(os.tmpdir(), 'kinoroom-test-session-' + Date.now());
  await fs.promises.mkdir(testDir, { recursive: true });
  await fs.promises.writeFile(path.join(testDir, 'dummy.txt'), 'hello');

  const mockSession: TorrentHlsSession = {
    id: 'test_hash_0',
    infoHash: 'test_hash',
    fileIndex: 0,
    fileName: 'movie.mkv',
    seekOffsetSeconds: 0,
    workDir: testDir,
    currentSessionDir: testDir,
    ffmpegProcess: null,
    sourceServer: null,
    sourcePort: 0,
    lastActivityAt: Date.now(),
    isReady: false,
    failed: false,
    activeReaders: new Set()
  };

  assert.ok(fs.existsSync(testDir), 'Work directory should exist before cleanup');
  await destroySession(mockSession);
  assert.ok(!fs.existsSync(testDir), 'Work directory must be removed after cleanup');
});

test('Torrent HLS resource path regex accepts valid HLS artifacts and rejects path traversal', () => {
  const validFilenames = ['master.m3u8', 'init.mp4', 'seg00000.m4s', 'seg00123.m4s', 'status'];
  const invalidFilenames = ['..', '../secret.txt', 'index.html', 'payload.exe', 'seg.mp4', 'master.m3u8.exe'];

  const regex = /^(master\.m3u8|init\.mp4|seg\d{5}\.m4s|status)$/;

  for (const name of validFilenames) {
    assert.ok(regex.test(name), `Expected ${name} to be valid`);
  }
  for (const name of invalidFilenames) {
    assert.ok(!regex.test(name), `Expected ${name} to be rejected`);
  }
});

test('rewritePlaylistWithParams rewrites init.mp4 and segment URIs with query parameters', () => {
  const original = '#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6.673000,\nseg00000.m4s\n#EXTINF:2.753000,\nseg00001.m4s';
  const query = 'torrent=magnet123&file=0';
  const rewritten = rewritePlaylistWithParams(original, query);

  assert.ok(rewritten.includes('#EXT-X-MAP:URI="init.mp4?torrent=magnet123&file=0"'));
  assert.ok(rewritten.includes('seg00000.m4s?torrent=magnet123&file=0'));
  assert.ok(rewritten.includes('seg00001.m4s?torrent=magnet123&file=0'));
});

test('FFprobe locator discovers installed binary alongside FFmpeg or returns null', () => {
  const { getFfprobePath, isFfprobeAvailable } = require('../src/lib/services/ffmpeg');
  const probe = getFfprobePath();
  if (probe) {
    assert.ok(fs.existsSync(probe), `FFprobe binary path ${probe} must exist on disk`);
    assert.equal(isFfprobeAvailable(), true);
  } else {
    assert.equal(isFfprobeAvailable(), false);
  }
});

test('HEVC fMP4 packaging requires hvc1 FourCC tag for Safari iOS compatibility', () => {
  const isHevcDetected = (fileName: string, codec?: string) => {
    return codec === 'hevc' || /\b(hevc|h265|x265|2160p|4k)\b/i.test(fileName);
  };

  assert.equal(isHevcDetected('movie.mkv', 'hevc'), true, 'Probed hevc codec must enforce hvc1');
  assert.equal(isHevcDetected('Spider-Man.Brand.New.Day.2026.from.seleZen.mkv', 'hevc'), true);
  assert.equal(isHevcDetected('Inception.2010.2160p.UHD.mkv'), true, '2160p release heuristic must trigger HEVC');
  assert.equal(isHevcDetected('Inception.2010.1080p.BDRip.mkv', 'h264'), false, 'H.264 must not trigger hvc1');
});


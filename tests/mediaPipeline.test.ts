import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { parseHttpRange } from '../src/lib/playback/httpRange';
import { runMediaCommand, createMediaSession, closeMediaSession, embeddedSubtitles, hlsResource } from '../src/lib/services/torrentMedia';

// A bounded local fixture test, never a torrent daemon or a user-facing laptop server.
test('real MKV -> selected AAC HLS + embedded Russian WebVTT; sessions stay isolated', { timeout: 60000 }, async t => {
  const ffmpeg = process.env.FFMPEG_PATH || (process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'KinoRoom/gst-pilot/ffmpeg/ffmpeg-n9.0-latest-win64-gpl-9.0/bin/ffmpeg.exe') : '/usr/bin/ffmpeg');
  try { await fs.access(ffmpeg); } catch { t.skip('FFmpeg fixture runtime is not installed'); return; }
  const saved = { enabled: process.env.KADR_MEDIA_ENABLED, server: process.env.TORRSERVER_URL, ffmpeg: process.env.FFMPEG_PATH, probe: process.env.FFPROBE_PATH, auth: process.env.TORRSERVER_AUTH };
  process.env.FFMPEG_PATH = ffmpeg;
  process.env.FFPROBE_PATH = path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  delete process.env.TORRSERVER_AUTH;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kadr-fixture-'));
  const ids: string[] = [];
  const server = http.createServer(async (req, res) => {
    const bytes = await fs.readFile(path.join(directory, 'film.mkv'));
    const range = req.headers.range ? parseHttpRange(req.headers.range, bytes.length) : { start: 0, end: bytes.length - 1 };
    if (!range) { res.writeHead(416); res.end(); return; }
    res.writeHead(req.headers.range ? 206 : 200, { 'Content-Type': 'video/x-matroska', 'Content-Length': range.end - range.start + 1,
      'Accept-Ranges': 'bytes', ...(req.headers.range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${bytes.length}` } : {}) });
    res.end(req.method === 'HEAD' ? undefined : bytes.subarray(range.start, range.end + 1));
  });
  try {
    await fs.writeFile(path.join(directory, 'ru.srt'), '1\n00:00:01,000 --> 00:00:03,000\nРусские субтитры\n');
    await runMediaCommand(ffmpeg, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=24:duration=8',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=8', '-i', path.join(directory, 'ru.srt'),
      '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:s', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '24', '-c:a', 'ac3', '-c:s', 'srt',
      '-metadata:s:a:0', 'language=rus', '-metadata:s:a:1', 'language=eng', '-metadata:s:s:0', 'language=rus', path.join(directory, 'film.mkv')], 20000);
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    process.env.TORRSERVER_URL = `http://127.0.0.1:${(server.address() as any).port}`;
    process.env.KADR_MEDIA_ENABLED = '1';
    const first = await createMediaSession('1'.repeat(40), 1); ids.push(first.id);
    const second = await createMediaSession('1'.repeat(40), 1); ids.push(second.id);
    assert.notEqual(first.id, second.id);
    assert.equal(first.info.audio.length, 2);
    assert.equal(first.info.subtitles[0].language, 'rus');
    const vtt = await embeddedSubtitles(first, first.info.subtitles[0].id, 0, 0, new AbortController().signal);
    assert.match(vtt, /Русские субтитры/);
    const english = first.info.audio[1].id;
    const playlist = String(await hlsResource(first, english, 0, 'index.m3u8', new AbortController().signal));
    assert.match(playlist, /#EXTINF:/);
    assert.ok(playlist.includes(`audio=${english}`));
    const init = await hlsResource(first, english, 0, 'init.mp4', new AbortController().signal);
    const segment = await hlsResource(first, english, 0, 'seg00000.m4s', new AbortController().signal);
    await fs.writeFile(path.join(directory, 'output.mp4'), Buffer.concat([Buffer.from(init), Buffer.from(segment)]));
    const probe = JSON.parse(await runMediaCommand(process.env.FFPROBE_PATH!, ['-v', 'error', '-show_streams', '-of', 'json', path.join(directory, 'output.mp4')]));
    assert.equal(probe.streams.find((s: any) => s.codec_type === 'audio').codec_name, 'aac');
    assert.equal(probe.streams.find((s: any) => s.codec_type === 'audio').channels, 2);
    assert.equal(second.job, undefined, 'one viewer must not start or change another viewer encoder');
    await hlsResource(first, english, 3, 'index.m3u8', new AbortController().signal, 1);
    const seekInit = await hlsResource(first, english, 3, 'init.mp4', new AbortController().signal, 1);
    const seekSegment = await hlsResource(first, english, 3, 'seg00000.m4s', new AbortController().signal, 1);
    await fs.writeFile(path.join(directory, 'seek.mp4'), Buffer.concat([Buffer.from(seekInit), Buffer.from(seekSegment)]));
    const seekProbe = JSON.parse(await runMediaCommand(process.env.FFPROBE_PATH!, ['-v', 'error', '-show_packets', '-read_intervals', '%+2', '-of', 'json', path.join(directory, 'seek.mp4')]));
    const firstVideo = seekProbe.packets.find((p: any) => p.codec_type === 'video');
    const firstAudio = seekProbe.packets.find((p: any) => p.codec_type === 'audio');
    assert.ok(Math.abs(Number(firstVideo.pts_time) - Number(firstAudio.pts_time)) < 0.2, 'cold seek must not introduce the former multi-second audio lead-in');
    await assert.rejects(() => hlsResource(first, english, 0, 'index.m3u8', new AbortController().signal, 0), /Устаревший/);
    assert.equal(first.job?.key, `a${english}_s3`, 'late old playlist must not restore the previous timeline');
  } finally {
    for (const id of ids) await closeMediaSession(id);
    server.closeAllConnections(); await new Promise<void>(r => server.close(() => r()));
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 });
    for (const [key, value] of Object.entries({ KADR_MEDIA_ENABLED: saved.enabled, TORRSERVER_URL: saved.server, FFMPEG_PATH: saved.ffmpeg, FFPROBE_PATH: saved.probe, TORRSERVER_AUTH: saved.auth })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

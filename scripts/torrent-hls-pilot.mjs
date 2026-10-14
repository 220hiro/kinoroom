// Local transport experiment with OUR generated test pattern. No public swarm.
// Run with the existing tsx CLI (httpRange.ts is shared with the application).
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import WebTorrent from 'webtorrent';
import MemoryStore from 'memory-chunk-store';
import FSStore from 'fs-chunk-store';
import { parseHttpRange } from '../src/lib/playback/httpRange.ts';
import { sanitizePilotEvent } from '../src/lib/playback/hlsPilot.ts';
import { readTorrentRangeInWindows } from '../src/lib/playback/torrentRangeReader.ts';
import { hlsStartupReady, hlsStartAtBeginning } from '../src/lib/playback/progressiveHls.ts';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1]]);
  return pairs;
}, []));
if (!args.media || !args.ffmpeg || !args.output) throw new Error('Required: --media --ffmpeg --output');
const media = resolve(args.media);
const progressive = args.mode === 'progressive';
if (args.mode && !['vod', 'progressive'].includes(args.mode)) throw new Error('Invalid pilot mode');
if (!/^kinoroom-test-(long-)?(hevc|avc)-mp3\.mkv$/.test(basename(media))) {
  throw new Error('This pilot accepts only the generated KinoRoom test pattern');
}
if ((await stat(media)).size > (progressive ? 2 * 1024 ** 3 : 64 * 1024 ** 2)) throw new Error('Pilot fixture size limit');
const outputRoot = resolve(args.output);
await mkdir(outputRoot, { recursive: true });
const output = await mkdtemp(join(outputRoot, 'run-'));
const port = Number(args.port || 8092);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid pilot port');
const uploadRateBytes = progressive ? Number(args['upload-rate'] || 512 * 1024) : -1;
if (progressive && (!Number.isInteger(uploadRateBytes) || uploadRateBytes < 64 * 1024 || uploadRateBytes > 16 * 1024 ** 2)) throw new Error('Invalid throttle');
// Source metadata is read from our OWN seed file. This does not measure magnet discovery/probing.
const probe = spawn(join(dirname(resolve(args.ffmpeg)), 'ffprobe.exe'), ['-v', 'error',
  '-show_entries', 'format=duration:stream=codec_name,width,height', '-of', 'json', media],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
let probeText = '';
probe.stdout.on('data', data => { probeText += data.toString(); });
const probeTimeout = setTimeout(() => probe.kill(), 10_000);
const [probeCode] = await once(probe, 'exit');
clearTimeout(probeTimeout);
if (probeCode !== 0) throw new Error('Own fixture metadata unavailable');
const sourceProbe = JSON.parse(probeText);
const pilotSource = { mode: progressive ? 'progressive' : 'vod',
  durationSeconds: Number(sourceProbe.format.duration), uploadRateBytes,
  ...sourceProbe.streams.find(stream => stream.codec_name === 'hevc' || stream.codec_name === 'h264') };
const events = [];
const started = performance.now();
const metrics = { publicSwarm: false, metadataMs: null, firstSourceByteMs: null,
  firstPlaylistMs: null, remuxMs: null, ffmpegCpuSeconds: null, ffmpegMaxRssKiB: null,
  sourceBytes: 0, packagingDone: false, failed: false, cancelled: false, cancelReason: null,
  downloadedAtFirstPlaylist: null, activeSourceReaders: 0, sourceWindowBytes: 2 * 1024 ** 2,
  nodeRssBytes: 0, mode: pilotSource.mode };
const opts = { tracker: false, dht: false, lsd: false, utp: false, webSeeds: false, natUpnp: false, natPmp: false };
const sender = new WebTorrent(opts);
const receiver = new WebTorrent(opts);
if (progressive) sender.throttleUpload(uploadRateBytes);
let receiving, encoder, packagingAt;
let currentSession = { startSeconds: 0, dir: output };
let lastMediaRequest = performance.now();
const sourceResponses = new Set();
const fail = () => { metrics.failed = true; };
sender.on('error', fail);
receiver.on('error', fail);
const fixture = progressive ? media : await readFile(media);
const seeded = await new Promise((done, reject) => {
  const torrent = sender.seed(fixture, { name: basename(media), private: true, announce: [],
    pieceLength: progressive ? 256 * 1024 : 64 * 1024,
    store: progressive ? FSStore : MemoryStore, storeCacheSlots: 4 }, done);
  torrent.once('error', reject);
});
receiving = receiver.add(seeded.torrentFile, { deselect: true, store: progressive ? FSStore : MemoryStore,
  path: join(output, 'source-cache'), storeCacheSlots: 4 });
await once(receiving, 'ready');
metrics.metadataMs = Math.round(performance.now() - started);
const connected = once(receiving, 'wire');
receiving.addPeer(`127.0.0.1:${sender.torrentPort}`);
await connected;

async function startPackaging(startSeconds = 0) {
  if (encoder) {
    if (currentSession.startSeconds === startSeconds && !metrics.failed && !metrics.cancelled) return;
    cancelPackaging('seek');
  }
  metrics.failed = false;
  metrics.cancelled = false;
  metrics.cancelReason = null;
  metrics.firstSourceByteMs = null;
  metrics.firstPlaylistMs = null;
  metrics.packagingDone = false;
  metrics.seekOffsetSeconds = startSeconds;
  packagingAt = performance.now();
  lastMediaRequest = packagingAt;

  const sessionDir = startSeconds > 0 ? join(output, 's' + startSeconds) : output;
  await mkdir(sessionDir, { recursive: true });
  currentSession = { startSeconds, dir: sessionDir };

  const ffmpegArgs = [
    ...(startSeconds > 0 ? ['-ss', String(startSeconds)] : []),
    '-hide_banner', '-benchmark', '-loglevel', 'info', '-rw_timeout', '15000000',
    ...(progressive ? ['-probesize', '1048576', '-analyzeduration', '1000000',
      '-readrate', '1', '-readrate_initial_burst', '20'] : []),
    '-i', `http://127.0.0.1:${port}/source`, '-map', '0:v:0', '-map', '0:a:0',
    '-c:v', 'copy', ...(basename(media).includes('hevc') ? ['-tag:v', 'hvc1'] : []),
    '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-f', 'hls', '-hls_time', '4',
    '-hls_list_size', '0', '-hls_playlist_type', progressive ? 'event' : 'vod',
    '-hls_flags', 'independent_segments+temp_file', '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4', '-hls_segment_filename', 'seg%05d.m4s',
    'master.m3u8'
  ];

  const currentChild = spawn(resolve(args.ffmpeg), ffmpegArgs, { cwd: sessionDir, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  encoder = currentChild;
  let benchmarkTail = '';
  currentChild.stderr.on('data', chunk => { benchmarkTail = (benchmarkTail + chunk.toString()).slice(-2000); });
  currentChild.on('error', () => {
    if (encoder === currentChild) fail();
  });
  currentChild.on('exit', code => {
    if (encoder !== currentChild) return;
    metrics.remuxMs = Math.round(performance.now() - packagingAt);
    const cpu = /bench: utime=([\d.]+)s stime=([\d.]+)s/.exec(benchmarkTail);
    if (cpu) metrics.ffmpegCpuSeconds = Number(cpu[1]) + Number(cpu[2]);
    const rss = /maxrss=(\d+)KiB/.exec(benchmarkTail);
    if (rss && Number(rss[1]) > 0) metrics.ffmpegMaxRssKiB = Number(rss[1]);
    metrics.packagingDone = code === 0 && !metrics.cancelled;
    if (code !== 0 && !metrics.cancelled) fail();
  });
  writeFile(join(outputRoot, 'runtime.json'), JSON.stringify({ pid: process.pid,
    encoderPid: currentChild.pid, output, session: currentSession, media: basename(media) })).catch(fail);
}

function cancelPackaging(reason) {
  if (!encoder) return;
  metrics.cancelled = true;
  metrics.cancelReason = reason;
  const oldEncoder = encoder;
  encoder = null;
  oldEncoder.removeAllListeners('exit');
  oldEncoder.removeAllListeners('error');
  oldEncoder.kill();
  for (const response of sourceResponses) response.destroy();
}

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (path === '/events') {
      if (req.method === 'POST') {
        let body = '';
        for await (const chunk of req) { body += chunk.toString(); if (body.length > 4096) break; }
        const event = body.length <= 4096 ? sanitizePilotEvent(JSON.parse(body)) : null;
        if (!event) { res.writeHead(400); res.end(); return; }
        events.push(event);
        if (events.length > 200) events.shift();
        res.writeHead(204); res.end(); return;
      }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(events)); return;
    }
    if (path === '/status') {
      const file = receiving.files[0];
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ infoHash: receiving.infoHash, name: `Собственный тестовый MKV (${Math.round(pilotSource.durationSeconds / 60)} минут)`,
        ready: true, files: [{ index: 0, name: basename(media), path: basename(media), length: file.length, isVideo: true }],
        numPeers: receiving.numPeers, downloadSpeed: receiving.downloadSpeed,
        uploadSpeed: receiving.uploadSpeed, downloaded: receiving.downloaded, total: file.length,
        progress: Math.round(receiving.progress * 100), pilotMetrics: metrics, pilotSource,
        currentSession }));
      return;
    }
    if (path === '/source') {
      const file = receiving.files[0];
      const range = req.headers.range ? parseHttpRange(req.headers.range, file.length) : { start: 0, end: file.length - 1 };
      if (!range) { res.writeHead(416, { 'Content-Range': `bytes */${file.length}` }); res.end(); return; }
      if (!metrics.rangeRequests) metrics.rangeRequests = [];
      metrics.rangeRequests.push({ start: range.start, end: range.end, atMs: Math.round(performance.now() - packagingAt) });
      if (metrics.rangeRequests.length > 30) metrics.rangeRequests.shift();
      res.writeHead(req.headers.range ? 206 : 200, { 'Content-Type': 'video/x-matroska',
        'Content-Length': range.end - range.start + 1, 'Accept-Ranges': 'bytes',
        ...(req.headers.range ? { 'Content-Range': `bytes ${range.start}-${range.end}/${file.length}` } : {}) });
      const cancelled = new AbortController();
      sourceResponses.add(res);
      metrics.activeSourceReaders++;
      res.once('close', () => cancelled.abort());
      try { for await (const chunk of readTorrentRangeInWindows(file, range.start, range.end, cancelled.signal)) {
        if (metrics.firstSourceByteMs === null) metrics.firstSourceByteMs = Math.round(performance.now() - packagingAt);
        metrics.sourceBytes += chunk.length;
        if (!res.write(chunk)) await once(res, 'drain', { signal: cancelled.signal });
      } } catch { if (!res.destroyed) res.destroy(); }
      finally { metrics.activeSourceReaders--; sourceResponses.delete(res); cancelled.abort(); }
      if (!res.destroyed) res.end();
      return;
    }
    const hlsMatch = /^\/hls\/(?:s(\d+)\/)?(master\.m3u8|init\.mp4|seg\d{5}\.m4s)$/.exec(path);
    if (hlsMatch) {
      const startSeconds = hlsMatch[1] ? Number(hlsMatch[1]) : 0;
      const filename = hlsMatch[2];
      const sessionDir = startSeconds > 0 ? join(output, 's' + startSeconds) : output;
      if (filename === 'master.m3u8') {
        await startPackaging(startSeconds);
        lastMediaRequest = performance.now();
        const deadline = performance.now() + 20_000;
        while (performance.now() < deadline && !metrics.failed && !metrics.cancelled && !res.destroyed) {
          try {
            let playlist = await readFile(join(sessionDir, 'master.m3u8'), 'utf8');
            if (progressive) {
              const initReady = (await stat(join(sessionDir, 'init.mp4'))).size > 0;
              if (!hlsStartupReady(playlist, initReady)) { await new Promise(done => setTimeout(done, 50)); continue; }
              playlist = hlsStartAtBeginning(playlist);
            } else if (!metrics.packagingDone) { await new Promise(done => setTimeout(done, 50)); continue; }
            if (metrics.firstPlaylistMs === null) {
              metrics.firstPlaylistMs = Math.round(performance.now() - packagingAt);
              metrics.downloadedAtFirstPlaylist = receiving.downloaded;
            }
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.end(playlist);
            return;
          } catch { await new Promise(done => setTimeout(done, 50)); }
        }
        res.writeHead(503); res.end('Local packaging not ready'); return;
      }
      lastMediaRequest = performance.now();
      const file = join(sessionDir, filename);
      const size = (await stat(file)).size;
      res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': size });
      const stream = createReadStream(file);
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
      return;
    }
    res.writeHead(404); res.end();
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end();
  }
});
server.listen(port, '127.0.0.1');
await once(server, 'listening');
await writeFile(join(outputRoot, 'runtime.json'), JSON.stringify({ pid: process.pid, output, media: basename(media) }));
console.log(JSON.stringify({ pilot: 'WebTorrent TCP loopback → FFmpeg video copy / AAC → HLS',
  port, mode: pilotSource.mode, durationSeconds: pilotSource.durationSeconds,
  uploadRateBytes, publicSwarm: false, downloadedBeforePlayback: receiving.downloaded }));
// A SINGLE-VIEWER pilot with a finite test budget; not the final multi-viewer cache/service.
const lifecycle = setInterval(() => {
  metrics.nodeRssBytes = process.memoryUsage().rss;
  if (!progressive || !encoder || metrics.packagingDone || metrics.cancelled) return;
  if (performance.now() - lastMediaRequest > 120_000) cancelPackaging('idle');
  else if (receiving.downloaded >= 128 * 1024 ** 2 || performance.now() - packagingAt > 600_000) cancelPackaging('pilot-budget');
}, 1000);
lifecycle.unref();
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  clearInterval(lifecycle);
  encoder?.kill();
  server.closeAllConnections();
  server.close();
  await Promise.all([sender, receiver].map(client => new Promise(done => client.destroy(done))));
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

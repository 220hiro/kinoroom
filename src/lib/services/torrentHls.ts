import http from 'node:http';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { getFfmpegPath, getFfprobePath } from './ffmpeg';
import { getOrAddTorrent, getTorrentVideoFile } from './torrents';
import { parseHttpRange } from '@/lib/playback/httpRange';
import { readTorrentRangeInWindows } from '@/lib/playback/torrentRangeReader';
import { hlsStartupReady, hlsStartAtBeginning } from '@/lib/playback/progressiveHls';

declare global {
  // eslint-disable-next-line no-var
  var _torrentHlsSessions: Map<string, TorrentHlsSession> | undefined;
  // eslint-disable-next-line no-var
  var _torrentHlsCleanupTimer: NodeJS.Timeout | undefined;
}

export interface TorrentHlsSession {
  id: string; // `${infoHash}_${fileIndex}`
  infoHash: string;
  fileIndex: number;
  fileName: string;
  videoCodec?: string;
  seekOffsetSeconds: number;
  workDir: string;
  currentSessionDir: string;
  ffmpegProcess: ChildProcess | null;
  sourceServer: http.Server | null;
  sourcePort: number;
  lastActivityAt: number;
  isReady: boolean;
  failed: boolean;
  failureReason?: string;
  activeReaders: Set<http.ServerResponse>;
}

function getSessionMap(): Map<string, TorrentHlsSession> {
  if (!globalThis._torrentHlsSessions) {
    globalThis._torrentHlsSessions = new Map<string, TorrentHlsSession>();
  }
  return globalThis._torrentHlsSessions;
}

// Start periodic cleanup timer for inactive sessions (120s timeout)
if (!globalThis._torrentHlsCleanupTimer) {
  const timer = setInterval(() => {
    const sessions = getSessionMap();
    const now = Date.now();
    for (const [id, session] of sessions.entries()) {
      if (now - session.lastActivityAt > 120_000) {
        destroySession(session).catch((err) => {
          console.error(`Error destroying inactive session ${id}:`, err);
        });
        sessions.delete(id);
      }
    }
  }, 30_000);
  timer.unref();
  globalThis._torrentHlsCleanupTimer = timer;
}

export async function destroySession(session: TorrentHlsSession): Promise<void> {
  // Stop FFmpeg
  if (session.ffmpegProcess) {
    try {
      session.ffmpegProcess.removeAllListeners('exit');
      session.ffmpegProcess.removeAllListeners('error');
      session.ffmpegProcess.kill('SIGKILL');
    } catch {}
    session.ffmpegProcess = null;
  }

  // Abort active source readers
  for (const res of session.activeReaders) {
    try {
      res.destroy();
    } catch {}
  }
  session.activeReaders.clear();

  // Close loopback source server
  if (session.sourceServer) {
    try {
      session.sourceServer.close();
    } catch {}
    session.sourceServer = null;
  }

  // Remove temporary work directory
  try {
    await rm(session.workDir, { recursive: true, force: true });
  } catch {}
}

/**
 * Creates an in-process loopback HTTP server on 127.0.0.1:0 (ephemeral port)
 * that serves the torrent video file ranges via readTorrentRangeInWindows.
 */
async function createSourceServer(
  session: TorrentHlsSession,
  file: any
): Promise<{ server: http.Server; port: number }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${session.sourcePort}`);
      if (url.pathname !== '/source') {
        res.writeHead(404);
        res.end();
        return;
      }

      const total = file.length;
      const rangeHeader = req.headers.range;
      const range = rangeHeader ? parseHttpRange(rangeHeader, total) : { start: 0, end: total - 1 };

      if (!range) {
        res.writeHead(416, { 'Content-Range': `bytes */${total}` });
        res.end();
        return;
      }

      res.writeHead(rangeHeader ? 206 : 200, {
        'Content-Type': 'video/mp4',
        'Content-Length': range.end - range.start + 1,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        ...(rangeHeader ? { 'Content-Range': `bytes ${range.start}-${range.end}/${total}` } : {})
      });

      const abortController = new AbortController();
      session.activeReaders.add(res);
      res.once('close', () => abortController.abort());

      try {
        for await (const chunk of readTorrentRangeInWindows(file, range.start, range.end, abortController.signal)) {
          if (abortController.signal.aborted) break;
          session.lastActivityAt = Date.now();
          if (!res.write(chunk)) {
            await once(res, 'drain');
          }
        }
      } catch {
        if (!res.destroyed) res.destroy();
      } finally {
        session.activeReaders.delete(res);
        abortController.abort();
      }

      if (!res.destroyed) res.end();
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { server, port };
}

/**
 * Probes the input video stream codec using ffprobe.
 */
export async function probeVideoCodec(url: string, timeoutMs = 4000): Promise<string | null> {
  const ffprobePath = getFfprobePath();
  if (!ffprobePath) return null;

  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      '-rw_timeout', '3000000',
      url
    ];

    let output = '';
    let settled = false;
    const child = spawn(ffprobePath, args, { windowsHide: true });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch {}
      resolve(null);
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      output += d.toString();
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const trimmed = output.trim().toLowerCase();
      resolve(code === 0 && trimmed ? trimmed : null);
    });

    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/**
 * Spawns the FFmpeg fMP4 HLS remuxing worker for the given session and seek offset.
 */
export async function startSessionEncoder(
  session: TorrentHlsSession,
  seekOffsetSeconds: number,
  isHevc: boolean,
  videoCodec?: string
): Promise<void> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    session.failed = true;
    session.failureReason = 'FFmpeg executable not found on server';
    throw new Error(session.failureReason);
  }

  // Stop previous encoder if still running
  if (session.ffmpegProcess) {
    try {
      session.ffmpegProcess.removeAllListeners('exit');
      session.ffmpegProcess.removeAllListeners('error');
      session.ffmpegProcess.kill('SIGKILL');
    } catch {}
    session.ffmpegProcess = null;
  }

  // Abort active source readers from previous seek
  for (const r of session.activeReaders) {
    try { r.destroy(); } catch {}
  }
  session.activeReaders.clear();

  const sessionDir = seekOffsetSeconds > 0
    ? path.join(session.workDir, `s${seekOffsetSeconds}`)
    : session.workDir;
  await mkdir(sessionDir, { recursive: true });

  session.seekOffsetSeconds = seekOffsetSeconds;
  session.currentSessionDir = sessionDir;
  session.isReady = false;
  session.failed = false;
  session.failureReason = undefined;
  session.lastActivityAt = Date.now();

  const effectiveCodec = videoCodec || session.videoCodec;
  const isVideoCompatible = !effectiveCodec || effectiveCodec === 'h264' || effectiveCodec === 'hevc';

  const videoEncodingArgs = isVideoCompatible
    ? [
        '-c:v', 'copy',
        ...(isHevc ? ['-tag:v', 'hvc1'] : [])
      ]
    : [
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p'
      ];

  const ffmpegArgs = [
    ...(seekOffsetSeconds > 0 ? ['-ss', String(seekOffsetSeconds)] : []),
    '-hide_banner',
    '-loglevel', 'info',
    '-rw_timeout', '15000000',
    '-probesize', '1048576',
    '-analyzeduration', '1000000',
    '-readrate', '1',
    '-readrate_initial_burst', '20',
    '-i', `http://127.0.0.1:${session.sourcePort}/source`,
    '-map', '0:v:0',
    '-map', '0:a:0?',
    ...videoEncodingArgs,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ac', '2',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments+temp_file',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4',
    '-hls_segment_filename', 'seg%05d.m4s',
    'master.m3u8'
  ];

  const child = spawn(ffmpegPath, ffmpegArgs, {
    cwd: sessionDir,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });

  session.ffmpegProcess = child;

  let stderrTail = '';
  child.stderr?.on('data', (d) => {
    stderrTail = (stderrTail + d.toString()).slice(-1500);
  });

  child.on('error', (err) => {
    if (session.ffmpegProcess === child) {
      session.failed = true;
      session.failureReason = `FFmpeg error: ${err.message}`;
      console.error(session.failureReason);
    }
  });

  child.on('exit', (code) => {
    if (session.ffmpegProcess !== child) return;
    if (code !== 0 && code !== null) {
      session.failed = true;
      session.failureReason = `FFmpeg exited with code ${code}: ${stderrTail}`;
      console.error(session.failureReason);
    }
  });
}

/**
 * Resolves or establishes an active HLS stream session for a torrent video file.
 */
export async function getOrCreateHlsSession(
  torrentId: string,
  fileIndex = 0,
  seekOffsetSeconds = 0
): Promise<TorrentHlsSession> {
  const ffmpegPath = getFfmpegPath();
  if (!ffmpegPath) {
    throw new Error('FFmpeg is not installed or configured on the server');
  }

  const torrent = await getOrAddTorrent(torrentId);
  if (!torrent || !torrent.files || torrent.files.length === 0) {
    throw new Error('Torrent metadata not available yet');
  }

  const file = getTorrentVideoFile(torrent, fileIndex);
  if (!file) {
    throw new Error('No playable video file found in torrent');
  }

  const infoHash = torrent.infoHash || 'unknown';
  const sessionId = `${infoHash}_${fileIndex}`;
  const sessions = getSessionMap();
  let session = sessions.get(sessionId);

  if (!session) {
    const workDir = path.join(os.tmpdir(), 'kinoroom-hls', sessionId);
    await mkdir(workDir, { recursive: true });

    session = {
      id: sessionId,
      infoHash,
      fileIndex,
      fileName: file.name,
      seekOffsetSeconds: 0,
      workDir,
      currentSessionDir: workDir,
      ffmpegProcess: null,
      sourceServer: null,
      sourcePort: 0,
      lastActivityAt: Date.now(),
      isReady: false,
      failed: false,
      activeReaders: new Set()
    };

    // Create source server
    const { server, port } = await createSourceServer(session, file);
    session.sourceServer = server;
    session.sourcePort = port;

    // Probe video codec with ffprobe
    const probedCodec = await probeVideoCodec(`http://127.0.0.1:${port}/source`).catch(() => null);
    if (probedCodec) {
      session.videoCodec = probedCodec;
    }

    sessions.set(sessionId, session);
  }

  const isHevc = session.videoCodec === 'hevc' || /\b(hevc|h265|x265|2160p|4k)\b/i.test(file.name);

  // If seek offset changed or encoder not running, start packaging
  if (!session.ffmpegProcess || session.seekOffsetSeconds !== seekOffsetSeconds || session.failed) {
    await startSessionEncoder(session, seekOffsetSeconds, isHevc, session.videoCodec);
  }

  session.lastActivityAt = Date.now();
  return session;
}


/**
 * Waits for the fMP4 master playlist and init segment to be generated.
 */
export async function waitForHlsPlaylist(
  session: TorrentHlsSession,
  timeoutMs = 45_000,
  signal?: AbortSignal
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  const masterPath = path.join(session.currentSessionDir, 'master.m3u8');
  const initPath = path.join(session.currentSessionDir, 'init.mp4');

  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('Client aborted request');
    }
    if (session.failed) {
      throw new Error(session.failureReason || 'Remuxing failed');
    }

    try {
      const playlist = await readFile(masterPath, 'utf8');
      const initStats = await stat(initPath).catch(() => null);
      const initReady = Boolean(initStats && initStats.size > 0);

      if (hlsStartupReady(playlist, initReady)) {
        session.isReady = true;
        session.lastActivityAt = Date.now();
        return hlsStartAtBeginning(playlist);
      }
    } catch {
      // File not written yet
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  throw new Error('Timeout waiting for HLS playlist generation');
}

/**
 * Returns a readable stream for an HLS segment or init.mp4.
 */
export async function getHlsSegmentStream(
  session: TorrentHlsSession,
  filename: string,
  seekOffsetSeconds = 0
): Promise<{ stream: NodeJS.ReadableStream; size: number }> {
  session.lastActivityAt = Date.now();
  const sessionDir = seekOffsetSeconds > 0
    ? path.join(session.workDir, `s${seekOffsetSeconds}`)
    : session.workDir;
  const filePath = path.join(sessionDir, filename);

  const fileStats = await stat(filePath);
  const stream = createReadStream(filePath);
  return { stream, size: fileStats.size };
}

export function getHlsSessionById(sessionId: string): TorrentHlsSession | undefined {
  const sessions = getSessionMap();
  const existing = sessions.get(sessionId);
  if (existing) return existing;

  // Disk fallback for existing session directory
  const workDir = path.join(os.tmpdir(), 'kinoroom-hls', sessionId);
  if (existsSync(workDir)) {
    const masterPath = path.join(workDir, 'master.m3u8');
    const initPath = path.join(workDir, 'init.mp4');
    if (existsSync(masterPath) || existsSync(initPath)) {
      const parts = sessionId.split('_');
      const restoredSession: TorrentHlsSession = {
        id: sessionId,
        infoHash: parts[0] || 'unknown',
        fileIndex: parts[1] ? parseInt(parts[1], 10) : 0,
        fileName: 'cached_stream',
        seekOffsetSeconds: 0,
        workDir,
        currentSessionDir: workDir,
        ffmpegProcess: null,
        sourceServer: null,
        sourcePort: 0,
        lastActivityAt: Date.now(),
        isReady: true,
        failed: false,
        activeReaders: new Set()
      };
      sessions.set(sessionId, restoredSession);
      return restoredSession;
    }
  }

  return undefined;
}

export function getLatestHlsSession(): TorrentHlsSession | undefined {
  const sessions = getSessionMap();
  if (sessions.size === 1) {
    return Array.from(sessions.values())[0];
  }
  let latest: TorrentHlsSession | undefined;
  for (const s of sessions.values()) {
    if (!latest || s.lastActivityAt > latest.lastActivityAt) {
      latest = s;
    }
  }
  return latest;
}

export function rewritePlaylistWithParams(playlist: string, queryParams: string): string {
  if (!queryParams) return playlist;
  const q = queryParams.startsWith('?') ? queryParams : `?${queryParams}`;
  let updated = playlist.replace(/#EXT-X-MAP:URI="([^"?]+)"/g, `#EXT-X-MAP:URI="$1${q}"`);
  updated = updated.replace(/^(seg\d{5}\.m4s)$/gm, `$1${q}`);
  return updated;
}

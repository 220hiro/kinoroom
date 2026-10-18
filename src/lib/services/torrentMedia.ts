import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getFfmpegPath, getFfprobePath } from './ffmpeg';
import { torrServerBase, torrServerHeaders } from './remoteTorrents';
import { alignSubtitles, mediaInfoFromProbe, type TorrentMediaInfo } from '@/lib/playback/torrentMedia';

interface Job { key: string; revision: number; directory: string; process: ChildProcess; failed: boolean; error?: string }
export interface MediaSession { id: string; source: string; info: TorrentMediaInfo; directory: string; lastUsed: number; closed?: boolean; job?: Job; operations: Promise<unknown>; subtitles: Map<string, Promise<string>> }
declare global { var kadrMediaSessions: Map<string, MediaSession> | undefined; var kadrMediaCleanup: NodeJS.Timeout | undefined }
const sessions = globalThis.kadrMediaSessions ||= new Map();
const root = path.join(os.tmpdir(), 'kadr-media');
let preparing = 0;

export function mediaEnabled(): boolean { return process.env.KADR_MEDIA_ENABLED === '1' && !process.env.VERCEL; }
export function requireMediaServer() {
  if (!mediaEnabled()) throw new Error('Торрент-просмотр доступен после подключения внешнего медиасервера. Ноутбук не используется как сервер.');
  torrServerBase();
  if (!getFfmpegPath() || !getFfprobePath()) throw new Error('На внешнем медиасервере нужны FFmpeg и FFprobe.');
}

function inputArgs(source: string): string[] {
  const headers = Object.entries(torrServerHeaders()).map(([k, v]) => `${k}: ${v}\r\n`).join('');
  return ['-rw_timeout', '15000000', ...(headers ? ['-headers', headers] : []), '-i', source];
}

export function runMediaCommand(binary: string, args: string[], timeoutMs = 20000, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true });
    let output = '', errors = '', settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error) { child.kill(); reject(error); } else resolve(output);
    };
    const abort = () => finish(new Error('Запрос отменён.'));
    const timer = setTimeout(() => finish(new Error('Медиасервер не ответил вовремя. Попробуйте другую раздачу.')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', d => { output += d.toString(); if (output.length > 5 * 1024 * 1024) finish(new Error('Слишком большой ответ медиасервера.')); });
    child.stderr.on('data', d => { errors = (errors + d.toString()).slice(-1500); });
    child.on('error', () => finish(new Error('Не удалось запустить обработчик медиа.')));
    child.on('close', code => finish(code === 0 ? undefined : new Error('Не удалось прочитать выбранную дорожку или видеофайл.')));
    if (signal?.aborted) abort();
  });
}

export async function probeMedia(source: string, signal?: AbortSignal): Promise<TorrentMediaInfo> {
  const binary = getFfprobePath();
  if (!binary) throw new Error('FFprobe не установлен.');
  const output = await runMediaCommand(binary, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', ...inputArgs(source)], 25000, signal);
  return mediaInfoFromProbe(JSON.parse(output));
}

export async function createMediaSession(hash: string, file: number, signal?: AbortSignal): Promise<MediaSession> {
  requireMediaServer();
  if (!/^[a-f0-9]{40}$/i.test(hash) || !Number.isSafeInteger(file) || file < 0) throw new Error('Некорректная раздача или файл.');
  const maximum = Number(process.env.KADR_MAX_STREAMS || 4);
  if (!Number.isInteger(maximum) || maximum < 1 || sessions.size + preparing >= maximum) throw new Error('Медиасервер занят. Попробуйте позже.');
  preparing++;
  try {
  const source = `${torrServerBase()}/stream?link=${hash}&index=${file}&play`;
  const info = await probeMedia(source, signal);
  const id = randomBytes(16).toString('hex');
  const directory = path.join(root, id);
  await mkdir(directory, { recursive: true });
  const session: MediaSession = { id, source, info, directory, lastUsed: Date.now(), operations: Promise.resolve(), subtitles: new Map() };
  sessions.set(id, session);
  return session;
  } finally { preparing--; }
}

export function getMediaSession(id: string): MediaSession {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Некорректная сессия.');
  const session = sessions.get(id);
  if (!session) throw new Error('Сессия закончилась. Откройте раздачу заново.');
  session.lastUsed = Date.now(); return session;
}

export async function closeMediaSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  session.closed = true; sessions.delete(id);
  await session.operations.catch(() => {});
  session.job?.process.kill();
  await rm(session.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }).catch(() => {});
}
if (!globalThis.kadrMediaCleanup) {
  globalThis.kadrMediaCleanup = setInterval(() => {
    for (const session of sessions.values()) if (Date.now() - session.lastUsed > 180000) void closeMediaSession(session.id);
  }, 30000);
  globalThis.kadrMediaCleanup.unref();
}

export function hlsArguments(source: string, info: TorrentMediaInfo, audio: number, seek: number): string[] {
  if (!Number.isInteger(seek) || seek < 0 || seek >= info.duration) throw new Error('Некорректная позиция.');
  if (info.audio.length && !info.audio.some(t => t.id === audio)) throw new Error('Аудиодорожка отсутствует.');
  const copy = seek === 0 && ['h264', 'hevc'].includes(info.videoCodec);
  return ['-hide_banner', '-loglevel', 'error', '-y', ...(seek ? ['-ss', String(seek)] : []), '-readrate', '1', ...inputArgs(source),
    '-map', '0:v:0', ...(info.audio.length ? ['-map', `0:${audio}`] : ['-an']),
    ...(copy ? ['-c:v', 'copy', ...(info.videoCodec === 'hevc' ? ['-tag:v', 'hvc1'] : [])] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-force_key_frames', 'expr:gte(t,n_forced*4)']),
    '-c:a', 'aac', '-ac', '2', '-b:a', '192k', '-sn', '-f', 'hls', '-hls_time', '4', '-hls_list_size', '0', '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments+temp_file', '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', 'init.mp4', '-hls_segment_filename', 'seg%05d.m4s', 'index.m3u8'];
}

async function ensureHlsJob(session: MediaSession, audio: number, seek: number, revision: number): Promise<Job> {
  const key = `a${audio}_s${seek}`;
  const operation = session.operations.then(async () => {
    if (session.closed) throw new Error('Сессия закончилась.');
    if (session.job && revision < session.job.revision) throw new Error('Устаревший запрос потока.');
    if (session.job?.key === key && !session.job.failed) { session.job.revision = revision; return session.job; }
    const args = hlsArguments(session.source, session.info, audio, seek);
    const previous = session.job;
    previous?.process.kill();
    if (previous) await rm(previous.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }).catch(() => {});
    const directory = path.join(session.directory, key);
    await rm(directory, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
    await mkdir(directory, { recursive: true });
    const child = spawn(getFfmpegPath()!, args, { cwd: directory, windowsHide: true });
    const job: Job = { key, revision, directory, process: child, failed: false };
    session.job = job;
    child.stderr?.on('data', () => {});
    child.on('error', () => { job.failed = true; job.error = 'Не удалось запустить поток.'; });
    child.on('close', code => { if (code !== 0 && code !== null) { job.failed = true; job.error = 'Обработка видео остановилась. Выберите другую раздачу.'; } });
    return job;
  });
  session.operations = operation.catch(() => {});
  return operation;
}

export async function hlsResource(session: MediaSession, audio: number, seek: number, filename: string, signal: AbortSignal, revision = 0): Promise<Buffer | string> {
  if (signal.aborted) throw new Error('Запрос отменён.');
  if (!/^(index\.m3u8|init\.mp4|seg\d{5}\.m4s)$/.test(filename)) throw new Error('Ресурс не найден.');
  // Only playlist requests can start/reconfigure an encoder. Late segment requests never switch it back.
  const job = filename === 'index.m3u8' ? await ensureHlsJob(session, audio, seek, revision) : session.job;
  if (!job || job.key !== `a${audio}_s${seek}` || revision < job.revision) throw new Error('Поток сменился.');
  const deadline = Date.now() + (filename === 'index.m3u8' ? 45000 : 15000);
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('Запрос отменён.');
    if (job.failed) throw new Error(job.error);
    try {
      const data = await readFile(path.join(job.directory, filename));
      if (filename !== 'index.m3u8') return data;
      const playlist = data.toString();
      if (playlist.includes('#EXTINF:') && (await stat(path.join(job.directory, 'init.mp4'))).size) {
        const query = `audio=${audio}&seek=${seek}&revision=${revision}`;
        return playlist.replace('#EXTM3U', '#EXTM3U\n#EXT-X-START:TIME-OFFSET=0,PRECISE=YES')
          .replace(/URI="init.mp4"/g, `URI="init.mp4?${query}"`).replace(/^(seg\d{5}\.m4s)$/gm, `$1?${query}`);
      }
    } catch { /* Wait for atomic FFmpeg outputs. */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Раздача не успевает загрузиться. Попробуйте другую.');
}

export async function embeddedSubtitles(session: MediaSession, trackId: number, start: number, offset: number, signal: AbortSignal): Promise<string> {
  const track = session.info.subtitles.find(t => t.id === trackId);
  if (!track?.supported) throw new Error('Эта дорожка содержит изображения. Выберите текстовые субтитры или загрузите SRT/VTT.');
  if (![start, offset].every(n => Number.isInteger(n) && n >= 0 && n < session.info.duration)) throw new Error('Некорректная позиция субтитров.');
  const key = `${trackId}:${start}`;
  let work = session.subtitles.get(key);
  if (!work) {
    work = runMediaCommand(getFfmpegPath()!, ['-v', 'error', '-ss', String(start), ...inputArgs(session.source), '-t', '300', '-map', `0:${trackId}`, '-vn', '-an', '-c:s', 'webvtt', '-f', 'webvtt', 'pipe:1'], 30000, signal);
    if (session.subtitles.size >= 6) session.subtitles.delete(session.subtitles.keys().next().value!);
    session.subtitles.set(key, work);
    work.catch(() => session.subtitles.delete(key));
  }
  return alignSubtitles(await work, start, offset);
}

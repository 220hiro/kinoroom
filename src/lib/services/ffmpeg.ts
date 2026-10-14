import fs from 'node:fs';
import path from 'node:path';

let cachedFfmpegPath: string | null | undefined = undefined;

/**
 * Resolves the path to the ffmpeg executable on the host system.
 * Checks environment variable FFMPEG_PATH, local KinoRoom installation, and standard system paths.
 */
export function getFfmpegPath(): string | null {
  if (cachedFfmpegPath !== undefined) {
    return cachedFfmpegPath;
  }

  // 1. Explicit environment variable
  if (process.env.FFMPEG_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.FFMPEG_PATH)) {
    cachedFfmpegPath = process.env.FFMPEG_PATH;
    return cachedFfmpegPath;
  }

  // 2. Local AppData KinoRoom bundled FFmpeg (Windows)
  if (process.env.LOCALAPPDATA) {
    const localAppDataCandidates = [
      path.join(process.env.LOCALAPPDATA, 'KinoRoom', 'gst-pilot', 'ffmpeg', 'ffmpeg-n9.0-latest-win64-gpl-9.0', 'bin', 'ffmpeg.exe'),
      path.join(process.env.LOCALAPPDATA, 'KinoRoom', 'ffmpeg', 'bin', 'ffmpeg.exe'),
    ];
    for (const candidate of localAppDataCandidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
        cachedFfmpegPath = candidate;
        return cachedFfmpegPath;
      }
    }
  }

  // 3. Common Windows paths
  const windowsCandidates = [
    'C:\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
    'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
  ];
  for (const candidate of windowsCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
      cachedFfmpegPath = candidate;
      return cachedFfmpegPath;
    }
  }

  // 4. Unix/Linux/macOS standard paths
  const unixCandidates = [
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/opt/homebrew/bin/ffmpeg',
  ];
  for (const candidate of unixCandidates) {
    if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
      cachedFfmpegPath = candidate;
      return cachedFfmpegPath;
    }
  }

  cachedFfmpegPath = null;
  return null;
}

let cachedFfprobePath: string | null | undefined = undefined;

/**
 * Resolves the path to the ffprobe executable on the host system.
 */
export function getFfprobePath(): string | null {
  if (cachedFfprobePath !== undefined) {
    return cachedFfprobePath;
  }

  // 1. Explicit environment variable
  if (process.env.FFPROBE_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.FFPROBE_PATH)) {
    cachedFfprobePath = process.env.FFPROBE_PATH;
    return cachedFfprobePath;
  }

  // 2. Adjacent to ffmpeg binary
  const ffmpegPath = getFfmpegPath();
  if (ffmpegPath) {
    const probeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
    const adjacent = path.join(path.dirname(ffmpegPath), probeName);
    if (fs.existsSync(/*turbopackIgnore: true*/ adjacent)) {
      cachedFfprobePath = adjacent;
      return cachedFfprobePath;
    }
  }

  // 3. AppData KinoRoom bundled
  if (process.env.LOCALAPPDATA) {
    const candidates = [
      path.join(process.env.LOCALAPPDATA, 'KinoRoom', 'gst-pilot', 'ffmpeg', 'ffmpeg-n9.0-latest-win64-gpl-9.0', 'bin', 'ffprobe.exe'),
      path.join(process.env.LOCALAPPDATA, 'KinoRoom', 'ffmpeg', 'bin', 'ffprobe.exe'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ c)) {
        cachedFfprobePath = c;
        return cachedFfprobePath;
      }
    }
  }

  cachedFfprobePath = null;
  return null;
}

export function isFfmpegAvailable(): boolean {
  return Boolean(getFfmpegPath());
}

export function isFfprobeAvailable(): boolean {
  return Boolean(getFfprobePath());
}

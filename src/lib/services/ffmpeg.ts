import fs from 'node:fs';
import path from 'node:path';
// No auto-discovery of old laptop pilot installations. Production uses system binaries or explicit paths.
export function getFfmpegPath(): string | null {
  return [process.env.FFMPEG_PATH, '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((p): p is string => Boolean(p && fs.existsSync(p))) || null;
}
export function getFfprobePath(): string | null {
  const ffmpeg = getFfmpegPath();
  return [process.env.FFPROBE_PATH, ffmpeg ? path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe') : '', '/usr/bin/ffprobe'].find((p): p is string => Boolean(p && fs.existsSync(p))) || null;
}
export const isFfmpegAvailable = () => Boolean(getFfmpegPath());
export const isFfprobeAvailable = () => Boolean(getFfprobePath());

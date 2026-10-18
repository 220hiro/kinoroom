import { parseExternalSubtitles } from './externalSubtitleEngine';

export interface MediaTrack {
  id: number;
  label: string;
  language: string;
  codec: string;
  supported: boolean;
  isDefault: boolean;
}
export interface TorrentMediaInfo {
  duration: number;
  videoCodec: string;
  audio: MediaTrack[];
  subtitles: MediaTrack[];
}

export function languageName(language: string): string {
  return ({ ru: 'Русский', rus: 'Русский', en: 'English', eng: 'English', ukr: 'Українська', uk: 'Українська' } as Record<string, string>)[language] || language || 'Язык не указан';
}

export function mediaInfoFromProbe(probe: any): TorrentMediaInfo {
  const streams: any[] = Array.isArray(probe.streams) ? probe.streams : [];
  const tracks = (type: string): MediaTrack[] => streams.filter(s => s.codec_type === type).map((s, i) => {
    const language = String(s.tags?.language || 'und').toLowerCase();
    const codec = String(s.codec_name || 'unknown');
    const title = s.tags?.title ? String(s.tags.title) : `${languageName(language === 'und' ? '' : language)} · ${i + 1}`;
    return { id: s.index, language, codec, label: title, isDefault: Boolean(s.disposition?.default),
      supported: type === 'audio' || ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text'].includes(codec) };
  });
  const duration = Number(probe.format?.duration || streams.find(s => s.codec_type === 'video')?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Не удалось определить длительность видео. Выберите другую раздачу.');
  if (!streams.some(s => s.codec_type === 'video')) throw new Error('В файле нет видеодорожки.');
  return { duration, videoCodec: streams.find(s => s.codec_type === 'video')?.codec_name || '', audio: tracks('audio'), subtitles: tracks('subtitle') };
}

export function timestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${Math.floor(ms / 3600000).toString().padStart(2, '0')}:${Math.floor(ms / 60000 % 60).toString().padStart(2, '0')}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}.${(ms % 1000).toString().padStart(3, '0')}`;
}

/** FFmpeg extracts a bounded window, whose cues start at zero. Align it with this player's timeline. */
export function alignSubtitles(vtt: string, windowStart: number, playbackOffset: number): string {
  const { cues } = parseExternalSubtitles(vtt, { fileName: 'embedded.vtt' });
  return 'WEBVTT\n\n' + cues.map(c => ({ ...c, startTime: c.startTime + windowStart - playbackOffset, endTime: c.endTime + windowStart - playbackOffset }))
    .filter(c => c.endTime > 0)
    .map(c => `${timestamp(c.startTime)} --> ${timestamp(c.endTime)}\n${c.text}\n`).join('\n');
}

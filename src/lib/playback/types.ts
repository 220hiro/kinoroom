import { z } from 'zod';

export type PlaybackStreamType = 'hls' | 'mp4' | 'webm';

export interface PlaybackQuality {
  id: string;
  label: string; // e.g. '1080p', '720p', '480p', 'Auto'
  height: number;
  bitrate?: number;
  url?: string;
}

export interface PlaybackAudioTrack {
  id: string | number;
  name: string; // e.g. 'Русский (Дубляж)', 'English (Original)'
  lang: string; // e.g. 'ru', 'en'
  isDefault?: boolean;
}

export interface PlaybackTranslation {
  id: string;
  name: string; // e.g. 'Дубляж', 'LostFilm', 'HDRezka Studio', 'Оригинал'
  type: 'dub' | 'voiceover' | 'subtitles' | 'original';
  quality?: string;
  providerId: string;
}

export interface PlaybackSubtitle {
  id: string;
  lang: string;
  label: string;
  url: string; // Direct link to .vtt file
  format: 'vtt' | 'srt';
  isDefault?: boolean;
  sourceId?: string;       // Linked media/video ID
  releaseId?: string;      // Specific release or version ID
  duration?: number;       // Verified media duration in seconds
  offset?: number;         // Individual sync offset in seconds
}

export interface PlaybackSource {
  url: string;
  type: PlaybackStreamType;
  qualities: PlaybackQuality[];
  audioTracks: PlaybackAudioTrack[];
  subtitles: PlaybackSubtitle[];
  headers?: Record<string, string>;
  expiresAt?: number;
}

export interface PlaybackRequest {
  mediaId: string | number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  translationId?: string;
  providerId?: string;
  quality?: string;
}

export interface PlaybackResponse {
  success: boolean;
  code?: string;
  media: {
    id: string | number;
    title: string;
    mediaType: 'movie' | 'tv';
    season?: number;
    episode?: number;
  };
  currentTranslation?: PlaybackTranslation;
  availableTranslations: PlaybackTranslation[];
  stream: PlaybackSource;
  provider: {
    id: string;
    name: string;
  };
  license?: string;
  attribution?: {
    text: string;
    url?: string;
  };
  error?: string;
}

export interface MediaProvider {
  readonly id: string;
  readonly name: string;
  readonly priority: number;

  isAvailable(): Promise<boolean>;
  getTranslations?(request: PlaybackRequest): Promise<PlaybackTranslation[]>;
  resolvePlayback(request: PlaybackRequest): Promise<PlaybackResponse | null>;
  refreshPlayback?(token: string): Promise<PlaybackSource | null>;
}

// Zod validation schema for POST /api/playback/resolve
export const PlaybackRequestSchema = z.object({
  mediaId: z.union([z.string().min(1), z.number().int().positive()]),
  mediaType: z.enum(['movie', 'tv']),
  season: z.number().int().positive().optional(),
  episode: z.number().int().positive().optional(),
  translationId: z.string().optional(),
  providerId: z.string().optional(),
  quality: z.string().optional()
});

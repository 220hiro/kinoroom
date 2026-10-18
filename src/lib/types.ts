export type MediaType = 'movie' | 'tv';

export type Media = {
  id: number;
  type: MediaType;
  title: string;
  originalTitle: string;
  year: number;
  overview: string;
  poster: string;
  backdrop: string;
  rating?: number;
  runtime?: number;
  genres: string[];
  cast: string[];
  originalLanguage: string;
  imdbId?: string;
  kinopoiskId?: number;
  seasons?: { number: number; name: string; count: number }[];
  license?: string;
};

export type Episode = {
  number: number;
  name: string;
  overview: string;
  runtime?: number;
  still?: string;
};

export type SourceInput = {
  tmdbId: number;
  imdbId?: string;
  kinopoiskId?: number;
  title: string;
  year?: number;
  type: MediaType;
  season?: number;
  episode?: number;
};

export type SubtitleTrack = {
  id: string;
  provider: string;
  language: 'en' | 'ru';
  label: string;
  url?: string;
  fileId?: number;
  score: number;
  format?: string;
};

export type AudioTrack = {
  id: string;
  language: string;
  label: string;
  original?: boolean;
};

export type MediaSource = {
  id: string;
  provider: string;
  providerName: string;
  category: 'DIRECT' | 'PUBLIC' | 'EMBED' | 'EXTERNAL' | 'TORRENT';
  format: 'mp4' | 'webm' | 'hls' | 'dash' | 'embed' | 'external' | 'torrent';
  url: string;
  resolution?: number;
  audioTracks: AudioTrack[];
  subtitles: SubtitleTrack[];
  stable: boolean;
  license?: string;
  score?: number;
  resolvedAt?: number;
};

export type ResolvedMedia = MediaSource;

export type CatalogOptions = {
  type: MediaType;
  genre?: string;
  sortBy?: 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc';
  page?: number;
};

export interface MetadataProvider {
  search(query: string): Promise<Media[]>;
  details(type: MediaType, id: number): Promise<Media>;
  season(id: number, season: number): Promise<Episode[]>;
  home(): Promise<{ title: string; items: Media[] }[]>;
  catalog(options: CatalogOptions): Promise<{ items: Media[]; totalPages: number }>;
}

export interface MediaSourceProvider {
  id: string;
  name: string;
  search(input: SourceInput): Promise<MediaSource[]>;
  resolve(source: MediaSource): Promise<ResolvedMedia>;
}

export interface SubtitleProvider {
  id: string;
  search(input: SourceInput): Promise<SubtitleTrack[]>;
  download(track: SubtitleTrack): Promise<string>;
}

export type Translation = {
  word: string;
  phonetic?: string;
  translation: string;
  definition?: string;
  phraseTranslation?: string;
  provider: string;
};

export interface TranslationProvider {
  id: string;
  translate(word: string, context: string): Promise<Translation>;
}

export interface StorageProvider {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export type Cue = { start: number; end: number; text: string };
export type Discovery = {
  sources: MediaSource[];
  subtitles: SubtitleTrack[];
  warnings: string[];
  region: string;
};

// Torrent streaming and search types
export type TorrentSearchResult = {
  id?: string;
  title: string;
  magnet: string;
  size: string;
  sizeBytes?: number;
  seeds: number;
  peers: number;
  tracker?: string;
  quality?: string;
  translation?: string;
  infoHash?: string;
  sourceType?: 'magnet' | 'torrent';
  downloadUrl?: string; // Safe relative proxy URL (e.g. /api/torrent/download?token=...), never leaks secrets
  year?: number;
  category?: string;
  claimedDub?: string;
};

export type TorrentFile = {
  index: number;
  name: string;
  path: string;
  length: number;
  isVideo: boolean;
};

export type TorrentStatus = {
  infoHash: string;
  name: string;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  downloaded: number;
  total: number;
  ready: boolean;
  files: TorrentFile[];
};

export const mediaKey = (m: Pick<Media, 'type' | 'id'>) => `${m.type}:${m.id}`;
export const playbackKey = (
  m: Pick<Media, 'type' | 'id'>,
  season?: number,
  episode?: number
) => `${mediaKey(m)}${m.type === 'tv' ? `:${season}:${episode}` : ''}`;

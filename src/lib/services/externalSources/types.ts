export type ExternalAdapterId = 'kodik' | 'vidsrc' | 'ezvid';

export type ExternalSourceStatus =
  | 'available'
  | 'unavailable'
  | 'disabled'
  | 'rate_limited'
  | 'error';

export interface ExternalSourceItem {
  id: string;
  adapter: ExternalAdapterId;
  name: string;
  type: 'iframe' | 'direct_hls';
  status: ExternalSourceStatus;
  iframeUrl?: string;
  translationName?: string;
  declaredQuality?: string;
  season?: number;
  episode?: number;
  badge?: string;
  description?: string;
  diagnostics?: string;
  isExperimental?: boolean;
}

export interface ExternalSourcesRequest {
  tmdbId: number;
  imdbId?: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title?: string;
  year?: number;
}

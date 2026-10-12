export type ExternalAdapterId =
  | 'embedwave'
  | 'vidcore'
  | 'vidlink'
  | 'vidsrc_hair'
  | 'vixsrc'
  | 'autoembed'
  | 'ezvid'
  | 'kodik'
  | 'vidsrc';

export type AvailabilityStatus =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'REQUIRES_KEY'
  | 'REQUIRES_PAYMENT'
  | 'UNSUPPORTED'
  | 'TESTING';

export type PlaybackStatus =
  | 'NOT_TESTED'
  | 'PLAYER_LOADED'
  | 'PLAYBACK_CONFIRMED'
  | 'PLAYBACK_FAILED';

export type AdStatus =
  | 'CLAIMED_AD_FREE'
  | 'MANUALLY_VERIFIED_AD_FREE'
  | 'ADS_DETECTED'
  | 'UNKNOWN';

export type SupportedPlaybackMode = 'iframe' | 'direct_hls' | 'unsupported';

export type ExternalSourceStatus =
  | 'available'
  | 'unavailable'
  | 'disabled'
  | 'rate_limited'
  | 'error';

/**
 * Standardized Unified Provider Metadata for Step 2D and ExternalSourceRegistry
 */
export interface UnifiedProviderInfo {
  id: ExternalAdapterId;
  name: string;
  homepage: string;
  supportedMediaTypes: ('movie' | 'tv')[];
  requiresApiKey: boolean;
  requiresPayment: boolean;
  claimedAdFree: boolean;
  verifiedAdFree: AdStatus;
  availabilityStatus: AvailabilityStatus;
  playbackStatus: PlaybackStatus;
  supportedPlaybackMode: SupportedPlaybackMode;
  embedUrl?: string;
  availableLanguages?: string[];
  availableSubtitles?: string[];
  verifiedQuality?: string;
  lastCheckedAt: string;
  errorReason?: string;
  rightsStatus: string;
  diagnostics?: string;
  badge?: string;
  description?: string;
  notes?: string;
}

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

export interface ProviderManualQACheck {
  providerId: ExternalAdapterId;
  testedAt: string;
  videoPlays: boolean;
  correctMovie: boolean;
  hasRussianAudio: boolean;
  seekWorks: boolean;
  fullscreenWorks: boolean;
  hasAds: boolean;
  opensNewTabs: boolean;
  worksOnIPhone: boolean;
  comment?: string;
}

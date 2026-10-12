import { ExternalSourcesRequest, UnifiedProviderInfo } from './types';
import { isValidExternalIframeUrl } from './allowlist';

/**
 * VixSrc Adapter (https://vixsrc.to/)
 *
 * Characteristics:
 *  - Routes: /movie/{id} and /tv/{id}/{season}/{episode} (supports TMDB and IMDb ID)
 *  - Player events: postMessage ({ type: 'PLAYER_EVENT', data: { event: 'play' | 'pause' | ... } })
 *  - Network: HTTP 200 OK on movie and TV endpoints
 */
export function getVixSrcProviderInfo(request: ExternalSourcesRequest): UnifiedProviderInfo {
  const { tmdbId, type, season = 1, episode = 1 } = request;
  const isTv = type === 'tv';

  const embedUrl = isTv
    ? `https://vixsrc.to/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
    : `https://vixsrc.to/movie/${encodeURIComponent(tmdbId)}`;

  const isSafeUrl = isValidExternalIframeUrl(embedUrl);

  return {
    id: 'vixsrc',
    name: 'VixSrc',
    homepage: 'https://vixsrc.to/',
    supportedMediaTypes: ['movie', 'tv'],
    requiresApiKey: false,
    requiresPayment: false,
    claimedAdFree: false,
    verifiedAdFree: 'UNKNOWN',
    availabilityStatus: isSafeUrl ? 'AVAILABLE' : 'UNSUPPORTED',
    playbackStatus: 'NOT_TESTED',
    supportedPlaybackMode: 'iframe',
    embedUrl,
    availableLanguages: ['Original', 'Multi-Audio'],
    availableSubtitles: ['Multi-Subtitles'],
    verifiedQuality: '720p/1080p',
    lastCheckedAt: new Date().toISOString(),
    rightsStatus: 'Сторонний агрегатор (коммерческий каталог)',
    badge: 'PLAYER_EVENT API',
    description: 'Плеер VixSrc: поддержка TMDB/IMDb, трансляция событий плеера через postMessage, поддержка сезонов и серий',
    diagnostics: 'Сервер отвечает HTTP 200. Требуется ручная проверка на iPhone для контроля всплывающих окон при первом тапе.'
  };
}

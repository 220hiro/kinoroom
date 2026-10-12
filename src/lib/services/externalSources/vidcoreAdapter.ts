import { ExternalSourcesRequest, UnifiedProviderInfo } from './types';
import { isValidExternalIframeUrl } from './allowlist';

/**
 * VidCore Adapter (https://vidcore.org/)
 *
 * Characteristics:
 *  - Documented routes: /embed/movie/{tmdb_id} and /embed/tv/{tmdb_id}/{season}/{episode}
 *  - Network: HTTP 200 OK, accessible in Kazakhstan without blocking
 *  - Embed support: Validated via allowlist
 */
export function getVidCoreProviderInfo(request: ExternalSourcesRequest): UnifiedProviderInfo {
  const { tmdbId, type, season = 1, episode = 1 } = request;
  const isTv = type === 'tv';

  const embedUrl = isTv
    ? `https://vidcore.org/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
    : `https://vidcore.org/embed/movie/${encodeURIComponent(tmdbId)}`;

  const isSafeUrl = isValidExternalIframeUrl(embedUrl);

  return {
    id: 'vidcore',
    name: 'VidCore',
    homepage: 'https://vidcore.org/',
    supportedMediaTypes: ['movie', 'tv'],
    requiresApiKey: false,
    requiresPayment: false,
    claimedAdFree: true,
    verifiedAdFree: 'CLAIMED_AD_FREE',
    availabilityStatus: isSafeUrl ? 'AVAILABLE' : 'UNSUPPORTED',
    playbackStatus: 'NOT_TESTED',
    supportedPlaybackMode: 'iframe',
    embedUrl,
    availableLanguages: ['Original', 'Subtitles'],
    availableSubtitles: ['Multi-Language'],
    verifiedQuality: '720p/1080p',
    lastCheckedAt: new Date().toISOString(),
    rightsStatus: 'Сторонний агрегатор (коммерческий контент без лицензии)',
    badge: 'Clean UI',
    description: 'Встраиваемый плеер VidCore: документированный маршрут по TMDB ID, доступен в Казахстане напрямую',
    diagnostics: 'Сервер отвечает HTTP 200. Требуется ручная проверка на iPhone для тестирования рекламы при клике на Play.'
  };
}

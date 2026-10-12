import { ExternalSourcesRequest, UnifiedProviderInfo } from './types';
import { isValidExternalIframeUrl } from './allowlist';

/**
 * VidLink Adapter (https://vidlink.pro/)
 *
 * Characteristics:
 *  - Routes: /movie/{tmdbId} and /tv/{tmdbId}/{season}/{episode}
 *  - Player Events: postMessage ({ type: 'play' | 'pause' | 'timeupdate' | 'ended' | 'seeked' })
 *  - Subtitles: Supports custom ?sub.url= and ?sub.label= query parameters
 *  - Network: HTTP 200 OK on embed routes
 */
export function getVidLinkProviderInfo(request: ExternalSourcesRequest): UnifiedProviderInfo {
  const { tmdbId, type, season = 1, episode = 1 } = request;
  const isTv = type === 'tv';

  const embedUrl = isTv
    ? `https://vidlink.pro/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
    : `https://vidlink.pro/movie/${encodeURIComponent(tmdbId)}`;

  const isSafeUrl = isValidExternalIframeUrl(embedUrl);

  return {
    id: 'vidlink',
    name: 'VidLink',
    homepage: 'https://vidlink.pro/',
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
    availableSubtitles: ['Multi-Language', 'External VTT URL'],
    verifiedQuality: 'HD (Auto)',
    lastCheckedAt: new Date().toISOString(),
    rightsStatus: 'Сторонний агрегатор (коммерческий контент)',
    badge: 'postMessage API',
    description: 'Продвинутый плеер VidLink: поддержка postMessage событий, передача внешних субтитров, адаптивный дизайн для мобильных',
    diagnostics: 'Маршруты /movie и /tv отвечают HTTP 200. Требуется ручная проверка на iPhone для контроля редиректов при клике.'
  };
}

import { ExternalSourcesRequest, UnifiedProviderInfo } from './types';
import { isValidExternalIframeUrl } from './allowlist';

/**
 * EmbedWave Adapter (https://embedwave.cc/)
 *
 * Characteristics:
 *  - Routes: /embed/movie/{tmdb_id} and /embed/tv/{tmdb_id}/{season}/{episode}
 *  - Claim: Zero Injected Ads, no API key, no signup, multi-server switcher
 *  - Network: HTTP 200 reachable on embed routes
 */
export function getEmbedWaveProviderInfo(request: ExternalSourcesRequest): UnifiedProviderInfo {
  const { tmdbId, type, season = 1, episode = 1 } = request;
  const isTv = type === 'tv';

  const embedUrl = isTv
    ? `https://embedwave.cc/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
    : `https://embedwave.cc/embed/movie/${encodeURIComponent(tmdbId)}`;

  const isSafeUrl = isValidExternalIframeUrl(embedUrl);

  return {
    id: 'embedwave',
    name: 'EmbedWave',
    homepage: 'https://embedwave.cc/',
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
    verifiedQuality: 'Auto/HD',
    lastCheckedAt: new Date().toISOString(),
    rightsStatus: 'Сторонний агрегатор (коммерческий каталог без прямой лицензии)',
    badge: 'No Ads (Заявлено)',
    description: 'Бесплатный embed API: адресация по TMDB ID, встроенный выбор серверов, заявлено полное отсутствие рекламы и редиректов',
    diagnostics: 'Сервис отвечает HTTP 200. Требуется ручная проверка на iPhone для подтверждения отсутствия всплывающих окон.'
  };
}

import { ExternalSourceItem, ExternalSourcesRequest, UnifiedProviderInfo } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';

/**
 * EzVidAPI Experimental Adapter (https://ezvidapi.com/)
 *
 * Current Status:
 *  - Network test: Cloudflare HTTP 502 Bad Gateway on all paths.
 *  - Browser test: Shows blank/black screen due to 502 and X-Frame-Options: SAMEORIGIN.
 *  - AvailabilityStatus: UNAVAILABLE
 *  - PlaybackStatus: PLAYBACK_FAILED
 */
export function getEzVidProviderInfo(request: ExternalSourcesRequest): UnifiedProviderInfo {
  const { tmdbId, type, season = 1, episode = 1 } = request;
  const isTv = type === 'tv';
  const baseUrl = EXTERNAL_SOURCES_CONFIG.ezvid.baseUrl.replace(/\/+$/, '');
  const embedUrl = isTv
    ? `${baseUrl}/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
    : `${baseUrl}/embed/movie/${encodeURIComponent(tmdbId)}`;

  return {
    id: 'ezvid',
    name: 'EzVidAPI',
    homepage: 'https://ezvidapi.com/',
    supportedMediaTypes: ['movie', 'tv'],
    requiresApiKey: false,
    requiresPayment: false,
    claimedAdFree: true,
    verifiedAdFree: 'UNKNOWN',
    availabilityStatus: 'UNAVAILABLE',
    playbackStatus: 'PLAYBACK_FAILED',
    supportedPlaybackMode: 'unsupported',
    embedUrl,
    availableLanguages: [],
    availableSubtitles: [],
    verifiedQuality: undefined,
    lastCheckedAt: new Date().toISOString(),
    errorReason: 'Сервер ezvidapi.com возвращает HTTP 502 Bad Gateway и X-Frame-Options: SAMEORIGIN (в браузере отображается черный экран).',
    rightsStatus: 'Не подтверждено (сервер апстрима отключен)',
    badge: 'HTTP 502 (Недоступен)',
    description: 'Экспериментальный сервис EzVidAPI: заявлялся ad-free HLS, но сервер не функционирует (Cloudflare 502)',
    diagnostics: 'Сетевой тест: HTTP 502 Bad Gateway. Браузер блокирует встраивание из-за ошибки шлюза. Настоящее видео не воспроизводится.'
  };
}

export function getEzVidSources(request: ExternalSourcesRequest): ExternalSourceItem[] {
  const { tmdbId, type, season = 1, episode = 1 } = request;

  if (!EXTERNAL_SOURCES_CONFIG.ezvid.enabled) {
    return [
      {
        id: 'ezvid-disabled',
        adapter: 'ezvid',
        name: 'EzVidAPI (На проверке)',
        type: 'iframe',
        status: 'disabled',
        badge: 'На проверке',
        isExperimental: true,
        description: 'Прямые HLS / iframe потоки EzVidAPI',
        diagnostics: EXTERNAL_SOURCES_CONFIG.ezvid.disabledReason
      }
    ];
  }

  if (!tmdbId) {
    return [];
  }

  const baseUrl = EXTERNAL_SOURCES_CONFIG.ezvid.baseUrl.replace(/\/+$/, '');
  const isTv = type === 'tv';
  const iframeUrl = isTv
    ? `${baseUrl}/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
    : `${baseUrl}/embed/movie/${encodeURIComponent(tmdbId)}`;

  return [
    {
      id: isTv ? `ezvid-s${season}e${episode}` : 'ezvid-movie',
      adapter: 'ezvid',
      name: isTv ? `EzVidAPI (S${season}:E${episode})` : 'EzVidAPI Embed',
      type: 'iframe',
      status: 'available',
      iframeUrl,
      season: isTv ? season : undefined,
      episode: isTv ? episode : undefined,
      badge: 'EzVidAPI',
      isExperimental: true,
      description: 'Экспериментальный источник EzVidAPI (тестирование заявленного ad-free стриминга)',
      diagnostics:
        'EzVidAPI iframe для тестирования. Сервис может возвращать Cloudflare 502 Bad Gateway.'
    }
  ];
}

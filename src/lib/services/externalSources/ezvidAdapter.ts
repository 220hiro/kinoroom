import { ExternalSourceItem, ExternalSourcesRequest, UnifiedProviderInfo } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';

/**
 * EzVidAPI Adapter (https://ezvidapi.com/)
 *
 * Manual iPhone & Network Verification Result (Step 2E):
 *  - Returns Cloudflare HTTP 502 Bad Gateway and X-Frame-Options: SAMEORIGIN.
 *  - Rejected and disabled. embedUrl is undefined to prevent mounting dead iframes.
 */
export function getEzVidProviderInfo(_request: ExternalSourcesRequest): UnifiedProviderInfo {
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
    embedUrl: undefined,
    availableLanguages: [],
    availableSubtitles: [],
    verifiedQuality: undefined,
    lastCheckedAt: new Date().toISOString(),
    errorReason: 'Отклонён: сервер ezvidapi.com возвращает HTTP 502 Bad Gateway и не работает.',
    rightsStatus: 'Отклонён (сервер апстрима не работает)',
    badge: 'Отклонён (HTTP 502)',
    description: 'Экспериментальный сервис EzVidAPI: отклонён и удалён из интерфейса (HTTP 502 Bad Gateway)',
    diagnostics: 'Сетевой тест и проверка на iPhone: HTTP 502 Bad Gateway. Источник отключён.'
  };
}

export function getEzVidSources(_request: ExternalSourcesRequest): ExternalSourceItem[] {
  return [
    {
      id: 'ezvid-disabled',
      adapter: 'ezvid',
      name: 'EzVidAPI (Отклонён)',
      type: 'iframe',
      status: 'disabled',
      badge: 'HTTP 502',
      isExperimental: true,
      description: 'Источник EzVidAPI отклонён',
      diagnostics: EXTERNAL_SOURCES_CONFIG.ezvid.disabledReason
    }
  ];
}

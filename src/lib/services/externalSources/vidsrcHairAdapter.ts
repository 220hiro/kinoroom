import { ExternalSourcesRequest, UnifiedProviderInfo } from './types';

/**
 * VidSrc.hair Adapter (https://vidsrc.hair/)
 *
 * Characteristics:
 *  - Separate service, distinct from VidSrc.sh
 *  - Network test: DNS NXDOMAIN (host cannot be resolved)
 *  - Policy: No paid subscriptions created without user permission
 *  - Status: UNAVAILABLE
 */
export function getVidSrcHairProviderInfo(_request: ExternalSourcesRequest): UnifiedProviderInfo {
  return {
    id: 'vidsrc_hair',
    name: 'VidSrc.hair',
    homepage: 'https://vidsrc.hair/',
    supportedMediaTypes: ['movie', 'tv'],
    requiresApiKey: true,
    requiresPayment: true,
    claimedAdFree: false,
    verifiedAdFree: 'UNKNOWN',
    availabilityStatus: 'UNAVAILABLE',
    playbackStatus: 'NOT_TESTED',
    supportedPlaybackMode: 'unsupported',
    embedUrl: undefined,
    availableLanguages: [],
    availableSubtitles: [],
    verifiedQuality: undefined,
    lastCheckedAt: new Date().toISOString(),
    errorReason: 'Домен vidsrc.hair не резолвится (DNS NXDOMAIN). Сервис недоступен.',
    rightsStatus: 'Неизвестно (домен не функционирует)',
    badge: 'DNS Недоступен',
    description: 'Отдельный сервис VidSrc.hair: домен не отвечает, оплата и регистрация не проводились по правилам проекта',
    diagnostics: 'Сетевой тест: Could not resolve host vidsrc.hair (NXDOMAIN). Адаптер сохранен в реестре в статусе UNAVAILABLE.'
  };
}

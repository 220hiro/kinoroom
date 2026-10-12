import { ExternalSourcesRequest, UnifiedProviderInfo } from './types';

/**
 * AutoEmbed Adapter (https://autoembed.cc/)
 *
 * Characteristics:
 *  - Network test: DNS NXDOMAIN (host cannot be resolved)
 *  - Policy: "Если актуальный сервис не найден, не подставляй случайный похожий домен"
 *  - Status: UNAVAILABLE
 */
export function getAutoEmbedProviderInfo(_request: ExternalSourcesRequest): UnifiedProviderInfo {
  return {
    id: 'autoembed',
    name: 'AutoEmbed',
    homepage: 'https://autoembed.cc/',
    supportedMediaTypes: ['movie', 'tv'],
    requiresApiKey: false,
    requiresPayment: false,
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
    errorReason: 'Домен autoembed.cc не резолвится (DNS NXDOMAIN). Сторонние зеркала не подставляются.',
    rightsStatus: 'Неизвестно (сервис недоступен)',
    badge: 'DNS Недоступен',
    description: 'Сервис AutoEmbed: домен autoembed.cc отключен, подмена случайными зеркалами запрещена правилами проекта',
    diagnostics: 'Сетевой тест: Could not resolve host autoembed.cc. Адаптер сохранен в реестре в статусе UNAVAILABLE.'
  };
}

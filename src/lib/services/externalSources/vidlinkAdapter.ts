import { ExternalSourcesRequest, UnifiedProviderInfo } from './types';

/**
 * VidLink Adapter (https://vidlink.pro/)
 *
 * Manual iPhone Verification Result (Step 2E):
 *  - Rejected due to advertisements.
 *  - Removed from regular UI and iframe allowlist.
 *  - embedUrl is undefined to prevent loading rejected ad iframes.
 */
export function getVidLinkProviderInfo(_request: ExternalSourcesRequest): UnifiedProviderInfo {
  return {
    id: 'vidlink',
    name: 'VidLink',
    homepage: 'https://vidlink.pro/',
    supportedMediaTypes: ['movie', 'tv'],
    requiresApiKey: false,
    requiresPayment: false,
    claimedAdFree: true,
    verifiedAdFree: 'ADS_DETECTED',
    availabilityStatus: 'UNAVAILABLE',
    playbackStatus: 'PLAYBACK_FAILED',
    supportedPlaybackMode: 'unsupported',
    embedUrl: undefined,
    availableLanguages: [],
    availableSubtitles: [],
    verifiedQuality: undefined,
    lastCheckedAt: new Date().toISOString(),
    errorReason: 'Отклонён по результатам проверки на iPhone: обнаружена реклама. Источник отключён.',
    rightsStatus: 'Отклонён (обнаружена реклама)',
    badge: 'Отклонён (Реклама)',
    description: 'Плеер VidLink: отклонён и удалён из интерфейса из-за обнаруженной рекламы',
    diagnostics: 'Проверка на iPhone выявила рекламу. Автоматическая загрузка iframe заблокирована.'
  };
}

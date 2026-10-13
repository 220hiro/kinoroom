import { ExternalSourcesRequest, UnifiedProviderInfo } from './types';

/**
 * VidCore Adapter (https://vidcore.org/)
 *
 * Manual iPhone Verification Result (Step 2E):
 *  - Rejected due to advertisements.
 *  - Removed from regular UI and iframe allowlist.
 *  - embedUrl is undefined to prevent loading rejected ad iframes.
 */
export function getVidCoreProviderInfo(_request: ExternalSourcesRequest): UnifiedProviderInfo {
  return {
    id: 'vidcore',
    name: 'VidCore',
    homepage: 'https://vidcore.org/',
    supportedMediaTypes: ['movie', 'tv'],
    requiresApiKey: false,
    requiresPayment: false,
    claimedAdFree: false,
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
    description: 'Встраиваемый плеер VidCore: отклонён и удалён из интерфейса из-за наличия рекламы',
    diagnostics: 'Проверка на iPhone выявила рекламу. Автоматическая загрузка iframe заблокирована.'
  };
}

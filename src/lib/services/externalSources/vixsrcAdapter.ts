import { ExternalSourcesRequest, UnifiedProviderInfo } from './types';

/**
 * VixSrc Adapter (https://vixsrc.to/)
 *
 * Manual iPhone Verification Result (Step 2E):
 *  - Rejected: Blocked on device/network.
 *  - Removed from regular UI and iframe allowlist.
 *  - embedUrl is undefined to prevent loading rejected iframes.
 */
export function getVixSrcProviderInfo(_request: ExternalSourcesRequest): UnifiedProviderInfo {
  return {
    id: 'vixsrc',
    name: 'VixSrc',
    homepage: 'https://vixsrc.to/',
    supportedMediaTypes: ['movie', 'tv'],
    requiresApiKey: false,
    requiresPayment: false,
    claimedAdFree: false,
    verifiedAdFree: 'UNKNOWN',
    availabilityStatus: 'UNAVAILABLE',
    playbackStatus: 'PLAYBACK_FAILED',
    supportedPlaybackMode: 'unsupported',
    embedUrl: undefined,
    availableLanguages: [],
    availableSubtitles: [],
    verifiedQuality: undefined,
    lastCheckedAt: new Date().toISOString(),
    errorReason: 'Отклонён по результатам проверки на iPhone: источник заблокирован. Отключён.',
    rightsStatus: 'Отклонён (заблокирован)',
    badge: 'Отклонён (Заблокирован)',
    description: 'Плеер VixSrc: отклонён и удалён из интерфейса, так как заблокирован при проверке на iPhone',
    diagnostics: 'Проверка на iPhone выявила блокировку сервиса. Автоматическая загрузка iframe заблокирована.'
  };
}

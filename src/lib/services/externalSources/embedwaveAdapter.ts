import { ExternalSourceItem, ExternalSourcesRequest, UnifiedProviderInfo } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';
import { isValidExternalIframeUrl } from './allowlist';

/**
 * EmbedWave — Cinesrc Adapter (https://embedwave.cc/docs)
 *
 * Verified Manual iPhone Safari Results (Step 2E):
 *  - Server `nxsha` (Multi HD): Rejected (wrong movie, severe lag). Never selected automatically.
 *  - Server `cinesrc` (Cinesrc): Confirmed playback of correct movie on iPhone for TMDB 550 (Fight Club).
 *  - Documented selection parameter: `?server=cinesrc`
 *    * Movie: https://embedwave.cc/embed/movie/{tmdbId}?server=cinesrc
 *    * TV:    https://embedwave.cc/embed/tv/{tmdbId}/{season}/{episode}?server=cinesrc
 *  - Russian audio: NOT confirmed (original audio + subtitles).
 *  - Quality: NOT confirmed (no unverified 1080p badges).
 *  - Ad-free status: NOT fully confirmed (no unverified ad-free claims).
 *  - Caveat: `?server=cinesrc` pins the initial backend on load, but the user can still switch servers
 *    inside the EmbedWave iframe header dropdown (`Server: Cinesrc`). No undocumented parameters exist
 *    to hide or lock that internal menu.
 */
export function buildEmbedWaveCinesrcUrl(request: ExternalSourcesRequest): string {
  const { tmdbId, type, season = 1, episode = 1 } = request;
  const baseUrl = EXTERNAL_SOURCES_CONFIG.embedwave.baseUrl.replace(/\/+$/, '');
  const serverParam = EXTERNAL_SOURCES_CONFIG.embedwave.defaultServer; // 'cinesrc'

  if (type === 'tv') {
    const safeSeason = Math.max(1, Math.floor(Number(season) || 1));
    const safeEpisode = Math.max(1, Math.floor(Number(episode) || 1));
    return `${baseUrl}/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(safeSeason)}/${encodeURIComponent(safeEpisode)}?server=${serverParam}`;
  }

  return `${baseUrl}/embed/movie/${encodeURIComponent(tmdbId)}?server=${serverParam}`;
}

export function getEmbedWaveProviderInfo(request: ExternalSourcesRequest): UnifiedProviderInfo {
  const embedUrl = buildEmbedWaveCinesrcUrl(request);
  const isSafeUrl = isValidExternalIframeUrl(embedUrl);

  return {
    id: 'embedwave',
    name: 'EmbedWave — Cinesrc',
    homepage: 'https://embedwave.cc/docs',
    supportedMediaTypes: ['movie', 'tv'],
    requiresApiKey: false,
    requiresPayment: false,
    claimedAdFree: true,
    verifiedAdFree: 'UNKNOWN',
    availabilityStatus: isSafeUrl ? 'AVAILABLE' : 'UNSUPPORTED',
    playbackStatus: 'PLAYBACK_CONFIRMED',
    supportedPlaybackMode: 'iframe',
    embedUrl: isSafeUrl ? embedUrl : undefined,
    availableLanguages: ['Original (Русская озвучка не подтверждена)'],
    availableSubtitles: ['Зависит от релиза'],
    verifiedQuality: undefined, // Качество не подтверждено
    lastCheckedAt: new Date().toISOString(),
    rightsStatus: 'Экспериментальный внешний источник (сторонний iframe)',
    badge: 'Экспериментальный',
    description:
      'Экспериментальный внешний плеер с принудительным выбором сервера Cinesrc (?server=cinesrc). Сервер Multi HD (nxsha) отклонён.',
    diagnostics:
      'Воспроизведение подтверждено на iPhone для тестового TMDB 550. Русская озвучка не подтверждена. Качество не подтверждено. Полное отсутствие рекламы не подтверждено. Внутри iframe остаётся меню выбора сервера — не переключайтесь на Multi HD (nxsha).'
  };
}

export function getEmbedWaveSources(request: ExternalSourcesRequest): ExternalSourceItem[] {
  const { tmdbId, type, season = 1, episode = 1 } = request;

  if (!EXTERNAL_SOURCES_CONFIG.embedwave.enabled) {
    return [
      {
        id: 'embedwave-cinesrc-disabled',
        adapter: 'embedwave',
        name: 'EmbedWave — Cinesrc',
        type: 'iframe',
        status: 'disabled',
        badge: 'Отключён',
        isExperimental: true,
        description: 'Экспериментальный внешний источник EmbedWave (сервер Cinesrc)',
        diagnostics: EXTERNAL_SOURCES_CONFIG.embedwave.disabledReason
      }
    ];
  }

  if (!tmdbId || tmdbId <= 0) {
    return [];
  }

  const isTv = type === 'tv';
  const safeSeason = Math.max(1, Math.floor(Number(season) || 1));
  const safeEpisode = Math.max(1, Math.floor(Number(episode) || 1));
  const iframeUrl = buildEmbedWaveCinesrcUrl({
    ...request,
    season: safeSeason,
    episode: safeEpisode
  });

  if (!isValidExternalIframeUrl(iframeUrl)) {
    return [
      {
        id: 'embedwave-cinesrc-invalid',
        adapter: 'embedwave',
        name: 'EmbedWave — Cinesrc',
        type: 'iframe',
        status: 'error',
        badge: 'Ошибка URL',
        isExperimental: true,
        description: 'Экспериментальный внешний источник EmbedWave — Cinesrc',
        diagnostics: 'Сформированный адрес не прошёл проверку безопасности allowlist.'
      }
    ];
  }

  return [
    {
      id: isTv ? `embedwave-cinesrc-s${safeSeason}e${safeEpisode}` : 'embedwave-cinesrc-movie',
      adapter: 'embedwave',
      name: 'EmbedWave — Cinesrc',
      type: 'iframe',
      status: 'available',
      iframeUrl,
      season: isTv ? safeSeason : undefined,
      episode: isTv ? safeEpisode : undefined,
      badge: 'Экспериментальный',
      isExperimental: true,
      description: isTv
        ? `Экспериментальный источник Cinesrc (Сезон ${safeSeason}, Серия ${safeEpisode})`
        : 'Экспериментальный внешний источник (сервер Cinesrc)',
      diagnostics:
        'Воспроизведение подтверждено на iPhone для тестового TMDB 550. Русская озвучка, качество и полное отсутствие рекламы не подтверждены. Начальный сервер закреплён через ?server=cinesrc — не переключайте сервер внутри iframe на Multi HD (nxsha).'
    }
  ];
}

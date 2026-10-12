import { ExternalSourceItem, ExternalSourcesRequest } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';
import { isValidExternalIframeUrl } from './allowlist';

/**
 * VidSrc Adapter (https://vidsrc.sh/vidsrc/docs/)
 * Routes:
 *  - Movie: /embed/movie/{tmdbId}
 *  - TV:    /embed/tv/{tmdbId}/{season}/{episode}
 *
 * NOTE: Loading of iframe does not prove existence of video content for obscure titles.
 */
export function getVidSrcSources(request: ExternalSourcesRequest): ExternalSourceItem[] {
  const { tmdbId, type, season = 1, episode = 1 } = request;
  if (!EXTERNAL_SOURCES_CONFIG.vidsrc.enabled || !tmdbId) {
    return [];
  }

  const baseUrl = EXTERNAL_SOURCES_CONFIG.vidsrc.baseUrl.replace(/\/+$/, '');
  const isTv = type === 'tv';

  const iframeUrl = isTv
    ? `${baseUrl}/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
    : `${baseUrl}/embed/movie/${encodeURIComponent(tmdbId)}`;

  if (!isValidExternalIframeUrl(iframeUrl)) {
    return [
      {
        id: 'vidsrc-invalid',
        adapter: 'vidsrc',
        name: 'VidSrc Global',
        type: 'iframe',
        status: 'error',
        badge: 'Ошибка',
        description: 'Международный балансер VidSrc',
        diagnostics: 'Сформированный URL VidSrc не соответствует правилам безопасности allowlist.'
      }
    ];
  }

  return [
    {
      id: isTv ? `vidsrc-s${season}e${episode}` : 'vidsrc-movie',
      adapter: 'vidsrc',
      name: isTv ? `VidSrc (S${season}:E${episode})` : 'VidSrc Global (1080p)',
      type: 'iframe',
      status: 'available',
      iframeUrl,
      season: isTv ? season : undefined,
      episode: isTv ? episode : undefined,
      declaredQuality: '1080p',
      badge: '1080p / EN',
      description: isTv
        ? `Международный плеер (Сезон ${season}, Серия ${episode})`
        : 'Оригинальная звуковая дорожка, субтитры',
      diagnostics:
        'Внешний iframe VidSrc. Может содержать стороннюю рекламу провайдера. Успешная загрузка контейнера не является подтверждением наличия видео в базе.'
    }
  ];
}

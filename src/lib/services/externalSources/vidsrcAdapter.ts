import { ExternalSourceItem, ExternalSourcesRequest } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';
import { isValidExternalIframeUrl } from './allowlist';

/**
 * VidSrc Adapter (https://vidsrc.sh/vidsrc/docs/)
 * Routes:
 *  - Movie: /embed/movie/{tmdbId}
 *  - TV:    /embed/tv/{tmdbId}/{season}/{episode}
 *
 * NOTE:
 *  - Loading of iframe does not prove existence of video content for obscure titles.
 *  - Unconfirmed stream properties (e.g. "1080p", "EN") are strictly NOT claimed.
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
      name: isTv ? `VidSrc (S${season}:E${episode})` : 'VidSrc Global',
      type: 'iframe',
      status: 'available',
      iframeUrl,
      season: isTv ? season : undefined,
      episode: isTv ? episode : undefined,
      badge: 'VidSrc', // Honest: no unverified '1080p' or 'EN' badges
      description: isTv
        ? `Международный балансер (Сезон ${season}, Серия ${episode})`
        : 'Международный балансер (выбор дорожек и субтитров внутри плеера)',
      diagnostics:
        'Внешний iframe VidSrc. Не подтверждает автоматически фактическое разрешение потока. Встраивается без sandbox по спецификации провайдера.'
    }
  ];
}

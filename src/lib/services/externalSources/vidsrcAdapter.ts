import { ExternalSourceItem, ExternalSourcesRequest } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';
import { isValidExternalIframeUrl } from './allowlist';

/**
 * VidSrc Adapter (https://vidsrc.sh/vidsrc/docs/)
 *
 * Current Status:
 *  - Disabled after confirmed intrusive popup advertising and redirection on iPhone.
 *  - Preserved in codebase for reference and testing.
 */
export function getVidSrcSources(request: ExternalSourcesRequest): ExternalSourceItem[] {
  const { tmdbId, type, season = 1, episode = 1 } = request;

  // When disabled due to intrusive advertising on iPhone
  if (!EXTERNAL_SOURCES_CONFIG.vidsrc.enabled) {
    return [
      {
        id: 'vidsrc-disabled',
        adapter: 'vidsrc',
        name: 'VidSrc (Отключен)',
        type: 'iframe',
        status: 'disabled',
        badge: 'Реклама',
        description: 'Внешний плеер VidSrc',
        diagnostics: EXTERNAL_SOURCES_CONFIG.vidsrc.disabledReason
      }
    ];
  }

  if (!tmdbId) {
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
      badge: 'VidSrc',
      description: isTv
        ? `Международный балансер (Сезон ${season}, Серия ${episode})`
        : 'Международный балансер (выбор дорожек и субтитров внутри плеера)',
      diagnostics:
        'Внешний iframe VidSrc. Не подтверждает автоматически фактическое разрешение потока. Встраивается без sandbox по спецификации провайдера.'
    }
  ];
}

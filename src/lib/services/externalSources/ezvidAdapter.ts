import { ExternalSourceItem, ExternalSourcesRequest } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';

/**
 * EzVidAPI Experimental Adapter (https://ezvidapi.com/)
 *
 * Current Status:
 *  - Network test: Returns Cloudflare HTTP 502 Bad Gateway across all endpoints.
 *  - Legal status: Commercial movie rights and direct HLS conditions unverified.
 *  - Policy: Preserved in codebase but kept disabled with honest diagnostics. Direct HLS is strictly NOT connected.
 */
export function getEzVidSources(request: ExternalSourcesRequest): ExternalSourceItem[] {
  const { tmdbId, type, season = 1, episode = 1 } = request;

  // If explicitly disabled in configuration
  if (!EXTERNAL_SOURCES_CONFIG.ezvid.enabled) {
    return [
      {
        id: 'ezvid-disabled',
        adapter: 'ezvid',
        name: 'EzVidAPI (На проверке)',
        type: 'iframe',
        status: 'disabled',
        badge: 'На проверке',
        isExperimental: true,
        description: 'Прямые HLS / iframe потоки EzVidAPI',
        diagnostics: EXTERNAL_SOURCES_CONFIG.ezvid.disabledReason
      }
    ];
  }

  if (!tmdbId) {
    return [];
  }

  const baseUrl = EXTERNAL_SOURCES_CONFIG.ezvid.baseUrl.replace(/\/+$/, '');
  const isTv = type === 'tv';
  const iframeUrl = isTv
    ? `${baseUrl}/embed/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`
    : `${baseUrl}/embed/movie/${encodeURIComponent(tmdbId)}`;

  return [
    {
      id: isTv ? `ezvid-s${season}e${episode}` : 'ezvid-movie',
      adapter: 'ezvid',
      name: isTv ? `EzVidAPI (S${season}:E${episode})` : 'EzVidAPI Embed',
      type: 'iframe',
      status: 'available',
      iframeUrl,
      season: isTv ? season : undefined,
      episode: isTv ? episode : undefined,
      badge: 'EzVidAPI',
      isExperimental: true,
      description: 'Экспериментальный источник EzVidAPI (тестирование заявленного ad-free стриминга)',
      diagnostics:
        'EzVidAPI iframe для тестирования. Сервис может возвращать Cloudflare 502 Bad Gateway.'
    }
  ];
}

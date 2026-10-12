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
export async function getEzVidSources(_request: ExternalSourcesRequest): Promise<ExternalSourceItem[]> {
  // If explicitly disabled in configuration (default)
  if (!EXTERNAL_SOURCES_CONFIG.ezvid.enabled) {
    return [
      {
        id: 'ezvid-testing',
        adapter: 'ezvid',
        name: 'EzVidAPI (На проверке)',
        type: 'direct_hls',
        status: 'disabled',
        badge: 'На проверке',
        isExperimental: true,
        description: 'Прямые HLS / iframe потоки EzVidAPI',
        diagnostics: EXTERNAL_SOURCES_CONFIG.ezvid.disabledReason
      }
    ];
  }

  // Live healthcheck if someone enables it via config
  try {
    const res = await fetch(EXTERNAL_SOURCES_CONFIG.ezvid.baseUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(EXTERNAL_SOURCES_CONFIG.ezvid.timeoutMs)
    });

    if (!res.ok) {
      return [
        {
          id: 'ezvid-down',
          adapter: 'ezvid',
          name: 'EzVidAPI (На проверке)',
          type: 'direct_hls',
          status: 'unavailable',
          badge: 'HTTP 502',
          isExperimental: true,
          description: 'Экспериментальный сервис EzVidAPI',
          diagnostics: `Сервер EzVidAPI вернул статус HTTP ${res.status}. Сервис нестабилен или недоступен.`
        }
      ];
    }

    return [
      {
        id: 'ezvid-unverified',
        adapter: 'ezvid',
        name: 'EzVidAPI (На проверке)',
        type: 'direct_hls',
        status: 'disabled',
        badge: 'Проверка прав',
        isExperimental: true,
        description: 'EzVidAPI требует проверки условий лицензирования',
        diagnostics:
          'Сервис доступен, однако техническая совместимость и права на использование прямого HLS не подтверждены.'
      }
    ];
  } catch (err: any) {
    return [
      {
        id: 'ezvid-error',
        adapter: 'ezvid',
        name: 'EzVidAPI (На проверке)',
        type: 'direct_hls',
        status: 'unavailable',
        badge: 'Сбой сети',
        isExperimental: true,
        description: 'Экспериментальный сервис EzVidAPI',
        diagnostics: `Ошибка соединения с EzVidAPI: ${err?.message || 'Сервис не отвечает'}. Прямой HLS отключен.`
      }
    ];
  }
}

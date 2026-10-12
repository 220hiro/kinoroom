import { ExternalSourceItem, ExternalSourcesRequest } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';
import { isValidExternalIframeUrl } from './allowlist';
import { cache } from '../cache';

// Rate limiter state: 2 requests per second maximum (minimum 500ms between calls)
let lastKodikRequestTimestamp = 0;
const RATE_LIMIT_GAP_MS = 500;

async function throttleKodikRequest(): Promise<void> {
  const now = Date.now();
  const timeSinceLast = now - lastKodikRequestTimestamp;
  if (timeSinceLast < RATE_LIMIT_GAP_MS) {
    const waitTime = RATE_LIMIT_GAP_MS - timeSinceLast;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastKodikRequestTimestamp = Date.now();
}

/**
 * Kodik Adapter using Kinobox API (https://kinobox.tv/api/players?tmdb={id}&sources=kodik)
 *
 * Current Status:
 *  - Preserved in codebase but kept unavailable to users pending full ad/quality/translation verification.
 */
export async function getKodikSources(request: ExternalSourcesRequest): Promise<ExternalSourceItem[]> {
  const { tmdbId } = request;

  // Kept unavailable to users until full ad, quality and translation audit is complete
  if (!EXTERNAL_SOURCES_CONFIG.kodik.enabled) {
    return [
      {
        id: 'kodik-testing',
        adapter: 'kodik',
        name: 'Kodik (На проверке)',
        type: 'iframe',
        status: 'disabled',
        badge: 'На проверке',
        description: 'Балансер Kodik',
        diagnostics: EXTERNAL_SOURCES_CONFIG.kodik.disabledReason
      }
    ];
  }

  if (!tmdbId) {
    return [];
  }

  const cacheKey = `external_kodik_v2_${tmdbId}`;

  return cache.remember<ExternalSourceItem[]>(cacheKey, EXTERNAL_SOURCES_CONFIG.kodik.cacheTtlMs, async () => {
    try {
      await throttleKodikRequest();

      const apiUrl = `${EXTERNAL_SOURCES_CONFIG.kodik.kinoboxApiUrl}?tmdb=${encodeURIComponent(tmdbId)}&sources=kodik`;

      // Use redirect: 'manual' to prevent downloading Selectel 1GB speedtest redirect
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'KinoRoom/1.0 (+https://kinoroom.app)'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(EXTERNAL_SOURCES_CONFIG.kodik.timeoutMs)
      });

      // Handle server redirects (e.g. 301 to selectel.ru/1GB when public API is closed)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location') || '';
        return [
          {
            id: 'kodik-unavailable',
            adapter: 'kodik',
            name: 'Kodik (Kinobox)',
            type: 'iframe',
            status: 'unavailable',
            badge: 'Недоступен',
            description: 'Балансер Kodik через Kinobox API',
            diagnostics: `Kinobox API временно ограничен сервером (HTTP ${response.status} redirect -> ${location.slice(0, 50)}). Публичный доступ закрыт.`
          }
        ];
      }

      if (!response.ok) {
        return [
          {
            id: 'kodik-error',
            adapter: 'kodik',
            name: 'Kodik (Kinobox)',
            type: 'iframe',
            status: 'unavailable',
            badge: 'Ошибка',
            description: 'Балансер Kodik через Kinobox API',
            diagnostics: `Kinobox API ответил с ошибкой HTTP ${response.status}.`
          }
        ];
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return [
          {
            id: 'kodik-invalid-response',
            adapter: 'kodik',
            name: 'Kodik (Kinobox)',
            type: 'iframe',
            status: 'unavailable',
            badge: 'Формат',
            description: 'Балансер Kodik через Kinobox API',
            diagnostics: 'Kinobox API вернул не JSON-ответ.'
          }
        ];
      }

      const data = await response.json();
      const rawPlayers: any[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.players)
        ? data.players
        : [];

      // Filter and map only genuine Kodik players from API
      const kodikPlayers = rawPlayers.filter(
        (p) => String(p?.source || p?.type || '').toLowerCase() === 'kodik' || rawPlayers.length === 1
      );

      if (kodikPlayers.length === 0) {
        return [
          {
            id: 'kodik-not-found',
            adapter: 'kodik',
            name: 'Kodik (Kinobox)',
            type: 'iframe',
            status: 'unavailable',
            badge: 'Не найден',
            description: 'Балансер Kodik через Kinobox API',
            diagnostics: 'Для данного тайтла в базе Kodik плеер не обнаружен.'
          }
        ];
      }

      const results: ExternalSourceItem[] = [];

      for (let i = 0; i < kodikPlayers.length; i++) {
        const item = kodikPlayers[i];
        const iframeUrl = item.iframeUrl || item.link || item.url || '';

        // Extract honest translation name without inventing
        const translationName =
          typeof item.translation === 'string'
            ? item.translation
            : item.translation?.title || item.voice || undefined;

        // Extract declared quality without inventing
        const declaredQuality = item.quality ? String(item.quality) : undefined;

        if (isValidExternalIframeUrl(iframeUrl)) {
          results.push({
            id: `kodik-${i + 1}`,
            adapter: 'kodik',
            name: translationName ? `Kodik (${translationName})` : 'Kodik HD',
            type: 'iframe',
            status: 'available',
            iframeUrl,
            translationName,
            declaredQuality,
            badge: declaredQuality ? `${declaredQuality}p` : 'Kodik',
            description: translationName ? `Озвучка: ${translationName}` : 'Оригинальный плеер Kodik'
          });
        }
      }

      if (results.length === 0) {
        return [
          {
            id: 'kodik-untrusted-url',
            adapter: 'kodik',
            name: 'Kodik (Kinobox)',
            type: 'iframe',
            status: 'error',
            badge: 'Безопасность',
            description: 'Балансер Kodik через Kinobox API',
            diagnostics: 'Возвращенный URL плеера Kodik не прошел проверку доверенных доменов.'
          }
        ];
      }

      return results;
    } catch (err: any) {
      return [
        {
          id: 'kodik-catch-error',
          adapter: 'kodik',
          name: 'Kodik (Kinobox)',
          type: 'iframe',
          status: 'error',
          badge: 'Сбой сети',
          description: 'Балансер Kodik через Kinobox API',
          diagnostics: `Ошибка запроса к Kinobox API: ${err?.message || 'Таймаут или ошибка сети'}`
        }
      ];
    }
  });
}

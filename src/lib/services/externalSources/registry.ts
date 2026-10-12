import {
  ExternalAdapterId,
  ExternalSourcesRequest,
  UnifiedProviderInfo,
  AvailabilityStatus
} from './types';
import { getEmbedWaveProviderInfo } from './embedwaveAdapter';
import { getVidCoreProviderInfo } from './vidcoreAdapter';
import { getVidLinkProviderInfo } from './vidlinkAdapter';
import { getVidSrcHairProviderInfo } from './vidsrcHairAdapter';
import { getVixSrcProviderInfo } from './vixsrcAdapter';
import { getAutoEmbedProviderInfo } from './autoembedAdapter';
import { getEzVidProviderInfo } from './ezvidAdapter';

export const STEP_2D_PROVIDER_IDS: ExternalAdapterId[] = [
  'embedwave',
  'vidcore',
  'vidlink',
  'vidsrc_hair',
  'vixsrc',
  'autoembed',
  'ezvid'
];

/**
 * Unified ExternalSourceRegistry (Step 2D)
 * Orchestrates all 7 candidate video providers with standardized metadata,
 * real network probing, and separate tracking for ads and actual playback.
 */
export class ExternalSourceRegistry {
  /**
   * Retrieves unified metadata for all 7 providers for a given title request
   */
  static getStep2DProviders(request: ExternalSourcesRequest): UnifiedProviderInfo[] {
    return [
      getEmbedWaveProviderInfo(request),
      getVidCoreProviderInfo(request),
      getVidLinkProviderInfo(request),
      getVidSrcHairProviderInfo(request),
      getVixSrcProviderInfo(request),
      getAutoEmbedProviderInfo(request),
      getEzVidProviderInfo(request)
    ];
  }

  /**
   * Retrieves a single provider info by ID
   */
  static getProvider(id: ExternalAdapterId, request: ExternalSourcesRequest): UnifiedProviderInfo | null {
    switch (id) {
      case 'embedwave':
        return getEmbedWaveProviderInfo(request);
      case 'vidcore':
        return getVidCoreProviderInfo(request);
      case 'vidlink':
        return getVidLinkProviderInfo(request);
      case 'vidsrc_hair':
        return getVidSrcHairProviderInfo(request);
      case 'vixsrc':
        return getVixSrcProviderInfo(request);
      case 'autoembed':
        return getAutoEmbedProviderInfo(request);
      case 'ezvid':
        return getEzVidProviderInfo(request);
      default:
        return null;
    }
  }

  /**
   * Performs an active, live network probe (HTTP HEAD/GET) to verify reachability
   */
  static async probeProvider(
    id: ExternalAdapterId,
    request: ExternalSourcesRequest
  ): Promise<{
    status: AvailabilityStatus;
    httpStatus?: number;
    latencyMs: number;
    error?: string;
    details: string;
  }> {
    const provider = this.getProvider(id, request);
    if (!provider || !provider.embedUrl) {
      if (id === 'vidsrc_hair') {
        return {
          status: 'UNAVAILABLE',
          latencyMs: 0,
          error: 'DNS NXDOMAIN',
          details: 'Домен vidsrc.hair не резолвится в глобальной системе DNS.'
        };
      }
      if (id === 'autoembed') {
        return {
          status: 'UNAVAILABLE',
          latencyMs: 0,
          error: 'DNS NXDOMAIN',
          details: 'Домен autoembed.cc не резолвится. Сторонние зеркала не подставляются.'
        };
      }
      return {
        status: 'UNAVAILABLE',
        latencyMs: 0,
        error: 'NO_EMBED_URL',
        details: 'Маршрут для встраивания не определен.'
      };
    }

    const start = Date.now();
    try {
      const res = await fetch(provider.embedUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
        redirect: 'manual'
      });
      const latencyMs = Date.now() - start;

      if (res.status >= 200 && res.status < 400) {
        return {
          status: 'AVAILABLE',
          httpStatus: res.status,
          latencyMs,
          details: `Сервер ответил HTTP ${res.status} (${latencyMs}ms). Поток доступен для встраивания.`
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'REQUIRES_KEY',
          httpStatus: res.status,
          latencyMs,
          error: `HTTP ${res.status}`,
          details: `Сервер вернул HTTP ${res.status}. Требуется авторизация или подтверждение домена.`
        };
      }

      if (res.status === 502 || res.status === 503) {
        return {
          status: 'UNAVAILABLE',
          httpStatus: res.status,
          latencyMs,
          error: `HTTP ${res.status}`,
          details: `Шлюз провайдера возвращает HTTP ${res.status} (Bad Gateway / Offline).`
        };
      }

      return {
        status: 'UNAVAILABLE',
        httpStatus: res.status,
        latencyMs,
        error: `HTTP ${res.status}`,
        details: `Сервер ответил с кодом HTTP ${res.status}.`
      };
    } catch (e: any) {
      const latencyMs = Date.now() - start;
      return {
        status: 'UNAVAILABLE',
        latencyMs,
        error: e?.message || 'Сбой соединения',
        details: `Ошибка сетевого запроса: ${e?.message || 'Таймаут или сбой DNS'}`
      };
    }
  }
}

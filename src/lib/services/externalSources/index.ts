import { ExternalSourceItem, ExternalSourcesRequest } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';
import { getKodikSources } from './kodikAdapter';
import { getVidSrcSources } from './vidsrcAdapter';
import { getEzVidSources } from './ezvidAdapter';

export * from './types';
export * from './config';
export * from './allowlist';
export * from './registry';
export * from './embedwaveAdapter';
export * from './vidcoreAdapter';
export * from './vidlinkAdapter';
export * from './vidsrcHairAdapter';
export * from './vixsrcAdapter';
export * from './autoembedAdapter';
export * from './ezvidAdapter';
export * from './kodikAdapter';
export * from './vidsrcAdapter';

/**
 * Aggregates legacy external sources with safety allowlists and honest status.
 */
export async function getExternalSources(request: ExternalSourcesRequest): Promise<ExternalSourceItem[]> {
  if (!EXTERNAL_SOURCES_CONFIG.enabled) {
    return [];
  }

  const [kodikResults, vidsrcResults, ezvidResults] = await Promise.all([
    getKodikSources(request).catch((e) => [
      {
        id: 'kodik-error',
        adapter: 'kodik' as const,
        name: 'Kodik (Kinobox)',
        type: 'iframe' as const,
        status: 'error' as const,
        description: 'Балансер Kodik через Kinobox API',
        diagnostics: `Ошибка адаптера: ${e?.message || 'Неизвестная ошибка'}`
      }
    ]),
    Promise.resolve(getVidSrcSources(request)),
    Promise.resolve(getEzVidSources(request))
  ]);

  return [...kodikResults, ...vidsrcResults, ...ezvidResults];
}

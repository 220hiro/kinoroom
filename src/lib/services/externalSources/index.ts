import { ExternalSourceItem, ExternalSourcesRequest } from './types';
import { EXTERNAL_SOURCES_CONFIG } from './config';
import { getEmbedWaveSources } from './embedwaveAdapter';

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
 * Returns the single approved experimental external source for regular UI:
 * «EmbedWave — Cinesrc» (?server=cinesrc).
 *
 * All rejected ad-supported or broken adapters (VidCore, VidLink, VidSrc.sh,
 * VidSrc.hair, VixSrc, AutoEmbed, EzVidAPI) are excluded from the UI.
 * Kodik/Kinobox adapter is preserved in codebase but hidden from UI while API is unavailable.
 */
export async function getExternalSources(request: ExternalSourcesRequest): Promise<ExternalSourceItem[]> {
  if (!EXTERNAL_SOURCES_CONFIG.enabled) {
    return [];
  }

  return getEmbedWaveSources(request);
}

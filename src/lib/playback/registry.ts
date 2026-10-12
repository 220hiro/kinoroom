import {
  MediaProvider,
  PlaybackRequest,
  PlaybackResponse
} from './types';
import { DemoLicensedProvider } from './providers/demoProvider';
import { TorrServerProvider } from './providers/torrServerProvider';

class MediaProviderRegistry {
  private providers: Map<string, MediaProvider> = new Map();

  constructor() {
    // Register default built-in providers
    this.registerProvider(new DemoLicensedProvider());
    this.registerProvider(new TorrServerProvider());
  }

  registerProvider(provider: MediaProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProvider(id: string): MediaProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): MediaProvider[] {
    return Array.from(this.providers.values()).sort((a, b) => b.priority - a.priority);
  }

  async resolve(request: PlaybackRequest): Promise<PlaybackResponse> {
    // 1. If a specific provider is requested, prioritize it
    if (request.providerId) {
      const p = this.getProvider(request.providerId);
      if (p) {
        const isAvail = await p.isAvailable().catch(() => false);
        if (isAvail) {
          try {
            const res = await p.resolvePlayback(request);
            if (res) return res;
          } catch (err: any) {
            console.error(`Provider ${p.id} error:`, err?.message || err);
          }
        }
      }
    }

    // 2. Iterate through available providers in priority order
    const sorted = this.getAllProviders();
    for (const provider of sorted) {
      // If user specified another provider, skip here
      if (request.providerId && provider.id !== request.providerId) continue;

      const isAvail = await provider.isAvailable().catch(() => false);
      if (!isAvail) continue;

      try {
        const res = await provider.resolvePlayback(request);
        if (res && res.success) {
          return res;
        }
      } catch (err: any) {
        console.error(`Error resolving with provider ${provider.id}:`, err?.message || err);
      }
    }

    // 3. Fallback: If mediaId is not in demo library and no commercial source is connected,
    // return an honest, non-deceptive error response
    return {
      success: false,
      code: 'SOURCE_UNAVAILABLE',
      error: 'SOURCE_UNAVAILABLE',
      media: {
        id: request.mediaId,
        title: `Медиа #${request.mediaId}`,
        mediaType: request.mediaType,
        season: request.season,
        episode: request.episode
      },
      availableTranslations: [],
      stream: {
        url: '',
        type: 'hls',
        qualities: [],
        audioTracks: [],
        subtitles: []
      },
      provider: {
        id: 'none',
        name: 'Нет доступных источников'
      }
    };
  }
}

// Global singleton instance
export const playbackRegistry = new MediaProviderRegistry();

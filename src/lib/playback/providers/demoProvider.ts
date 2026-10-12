import {
  MediaProvider,
  PlaybackRequest,
  PlaybackResponse,
  PlaybackTranslation,
  PlaybackSource
} from '../types';

export interface DemoMediaItem {
  id: string;
  title: string;
  description: string;
  year: number;
  duration: number; // in seconds
  poster: string;
  backdrop: string;
  translations: PlaybackTranslation[];
  streamMap: Record<string, PlaybackSource>;
}

export const DEMO_MEDIA_LIBRARY: Record<string, DemoMediaItem> = {
  'tears-of-steel': {
    id: 'tears-of-steel',
    title: 'Слёзы стали (Tears of Steel)',
    description: 'Открытый научно-фантастический фильм Blender Foundation (2012) в качестве 1080p с адаптивным HLS-потоком.',
    year: 2012,
    duration: 734,
    poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop',
    backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop',
    translations: [
      {
        id: 'tos-orig-en',
        name: 'Оригинал (English Stereo)',
        type: 'original',
        quality: '1080p',
        providerId: 'demo-licensed'
      }
    ],
    streamMap: {
      'tos-orig-en': {
        url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
        type: 'hls',
        qualities: [
          { id: 'auto', label: 'Авто', height: 0 },
          { id: '1080p', label: '1080p (2.4M)', height: 1080, bitrate: 2468000 },
          { id: '750p', label: '750p (1.7M)', height: 750, bitrate: 1727000 },
          { id: '350p', label: '350p (1.2M)', height: 350, bitrate: 1197000 },
          { id: '200p', label: '200p (930k)', height: 200, bitrate: 932000 }
        ],
        audioTracks: [
          { id: 'en-orig', name: 'English (Original)', lang: 'en', isDefault: true }
        ],
        subtitles: [
          {
            id: 'sub-ru',
            lang: 'ru',
            label: 'Русские',
            url: '/subtitles/subtitles-ru.vtt',
            format: 'vtt',
            isDefault: false
          },
          {
            id: 'sub-en',
            lang: 'en',
            label: 'English',
            url: '/subtitles/subtitles-en.vtt',
            format: 'vtt',
            isDefault: true
          }
        ]
      }
    }
  },
  'big-buck-bunny': {
    id: 'big-buck-bunny',
    title: 'Большой Бак Банни (Big Buck Bunny)',
    description: 'Классический открытый анимационный фильм Blender Foundation с адаптивным многобитрейтным HLS качеством 1080p/720p/480p.',
    year: 2008,
    duration: 596,
    poster: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=800&auto=format&fit=crop',
    backdrop: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1600&auto=format&fit=crop',
    translations: [
      {
        id: 'bbb-orig',
        name: 'Оригинал (Original Audio)',
        type: 'original',
        quality: '1080p',
        providerId: 'demo-licensed'
      }
    ],
    streamMap: {
      'bbb-orig': {
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        type: 'hls',
        qualities: [
          { id: 'auto', label: 'Авто', height: 0 },
          { id: '1080p', label: '1080p (4.5M)', height: 1080, bitrate: 4500000 },
          { id: '720p', label: '720p (2.1M)', height: 720, bitrate: 2100000 },
          { id: '480p', label: '480p (1.2M)', height: 480, bitrate: 1200000 },
          { id: '360p', label: '360p (600k)', height: 360, bitrate: 600000 }
        ],
        audioTracks: [
          { id: 'orig', name: 'Stereo', lang: 'en', isDefault: true }
        ],
        subtitles: []
      }
    }
  },
  'apple-bipbop': {
    id: 'apple-bipbop',
    title: 'Тестовый HLS-стрим Apple (BipBop fMP4)',
    description: 'Официальный эталонный HLS-поток Apple с фрагментированным MP4 (fMP4), 1080p 60fps и многоязычными аудиодорожками.',
    year: 2020,
    duration: 600,
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop',
    backdrop: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1600&auto=format&fit=crop',
    translations: [
      {
        id: 'bipbop-multi',
        name: 'Многоязычный поток (fMP4)',
        type: 'original',
        quality: '1080p',
        providerId: 'demo-licensed'
      }
    ],
    streamMap: {
      'bipbop-multi': {
        url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
        type: 'hls',
        qualities: [
          { id: 'auto', label: 'Авто', height: 0 },
          { id: '1080p', label: '1080p (8.0M)', height: 1080, bitrate: 8000000 },
          { id: '540p', label: '540p (2.2M)', height: 540, bitrate: 2170000 }
        ],
        audioTracks: [
          { id: 'aud1', name: 'English', lang: 'en', isDefault: true },
          { id: 'aud2', name: 'Deutsch', lang: 'de' },
          { id: 'aud3', name: 'Español', lang: 'es' },
          { id: 'aud4', name: 'Français', lang: 'fr' }
        ],
        subtitles: []
      }
    }
  }
};

export class DemoLicensedProvider implements MediaProvider {
  readonly id = 'demo-licensed';
  readonly name = 'Лицензированные открытые медиапотоки (HLS)';
  readonly priority = 10;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getTranslations(request: PlaybackRequest): Promise<PlaybackTranslation[]> {
    const key = this.resolveKey(request);
    if (!key) return [];
    const item = DEMO_MEDIA_LIBRARY[key];
    return item ? item.translations : [];
  }

  async resolvePlayback(request: PlaybackRequest): Promise<PlaybackResponse | null> {
    const key = this.resolveKey(request);
    if (!key) return null;

    const item = DEMO_MEDIA_LIBRARY[key];
    if (!item) return null;

    const chosenTranslationId = request.translationId || item.translations[0]?.id;
    const stream = item.streamMap[chosenTranslationId] || Object.values(item.streamMap)[0];
    const currentTranslation = item.translations.find((t) => t.id === chosenTranslationId) || item.translations[0];

    return {
      success: true,
      media: {
        id: item.id,
        title: item.title,
        mediaType: request.mediaType,
        season: request.season,
        episode: request.episode
      },
      currentTranslation,
      availableTranslations: item.translations,
      stream,
      provider: {
        id: this.id,
        name: this.name
      }
    };
  }

  private resolveKey(request: PlaybackRequest): string | null {
    // Numeric mediaId (e.g. TMDB ID 969681) is never a demo item
    if (typeof request.mediaId === 'number') {
      return null;
    }

    const idStr = String(request.mediaId).trim().toLowerCase();

    // Direct match against registered demo library
    if (DEMO_MEDIA_LIBRARY[idStr]) {
      return idStr;
    }

    // Match with 'demo-' prefix
    if (idStr.startsWith('demo-')) {
      const stripped = idStr.replace('demo-', '');
      if (DEMO_MEDIA_LIBRARY[stripped]) {
        return stripped;
      }
    }

    // Strict: never fall back to demo content for unknown IDs or catalog titles
    return null;
  }
}

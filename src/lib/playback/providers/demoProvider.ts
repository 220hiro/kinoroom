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
    description: 'Фантастический постапокалиптический фильм Blender Foundation в высоком разрешении 1080p с многодорожечным звуком и субтитрами.',
    year: 2012,
    duration: 734,
    poster: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop',
    backdrop: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&auto=format&fit=crop',
    translations: [
      {
        id: 'tos-dub-ru',
        name: 'Русский дубляж (Stereo)',
        type: 'dub',
        quality: '1080p',
        providerId: 'demo-licensed'
      },
      {
        id: 'tos-orig-en',
        name: 'Оригинал (English 5.1)',
        type: 'original',
        quality: '1080p',
        providerId: 'demo-licensed'
      },
      {
        id: 'tos-commentary',
        name: 'Режиссёрские комментарии',
        type: 'voiceover',
        quality: '1080p',
        providerId: 'demo-licensed'
      }
    ],
    streamMap: {
      'tos-dub-ru': {
        url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
        type: 'hls',
        qualities: [
          { id: 'auto', label: 'Авто', height: 0 },
          { id: '1080p', label: '1080p', height: 1080, bitrate: 4500000 },
          { id: '720p', label: '720p', height: 720, bitrate: 2200000 },
          { id: '480p', label: '480p', height: 480, bitrate: 1100000 },
          { id: '360p', label: '360p', height: 360, bitrate: 650000 }
        ],
        audioTracks: [
          { id: 'ru-dub', name: 'Русский (Дубляж)', lang: 'ru', isDefault: true },
          { id: 'en-orig', name: 'English (Original)', lang: 'en' },
          { id: 'commentary', name: 'Director Commentary', lang: 'en' }
        ],
        subtitles: [
          {
            id: 'sub-ru',
            lang: 'ru',
            label: 'Русские',
            url: 'https://raw.githubusercontent.com/brenopolanski/html5-video-webvtt-example/master/subtitles-en.vtt',
            format: 'vtt',
            isDefault: false
          },
          {
            id: 'sub-en',
            lang: 'en',
            label: 'English',
            url: 'https://raw.githubusercontent.com/brenopolanski/html5-video-webvtt-example/master/subtitles-en.vtt',
            format: 'vtt',
            isDefault: false
          }
        ]
      },
      'tos-orig-en': {
        url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
        type: 'hls',
        qualities: [
          { id: 'auto', label: 'Авто', height: 0 },
          { id: '1080p', label: '1080p', height: 1080, bitrate: 4500000 },
          { id: '720p', label: '720p', height: 720, bitrate: 2200000 }
        ],
        audioTracks: [
          { id: 'en-orig', name: 'English (Original)', lang: 'en', isDefault: true },
          { id: 'ru-dub', name: 'Русский (Дубляж)', lang: 'ru' }
        ],
        subtitles: [
          {
            id: 'sub-en',
            lang: 'en',
            label: 'English',
            url: 'https://raw.githubusercontent.com/brenopolanski/html5-video-webvtt-example/master/subtitles-en.vtt',
            format: 'vtt',
            isDefault: true
          }
        ]
      },
      'tos-commentary': {
        url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
        type: 'hls',
        qualities: [
          { id: 'auto', label: 'Авто', height: 0 },
          { id: '720p', label: '720p', height: 720, bitrate: 2200000 }
        ],
        audioTracks: [
          { id: 'commentary', name: 'Director Commentary', lang: 'en', isDefault: true },
          { id: 'en-orig', name: 'English (Original)', lang: 'en' }
        ],
        subtitles: []
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
        name: 'Оригинальная звуковая дорожка',
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
  'sintel': {
    id: 'sintel',
    title: 'Синтел (Sintel)',
    description: 'Эпическая фэнтези драма о девочке и драконе с полноценным адаптивным HLS стримом и субтитрами.',
    year: 2010,
    duration: 888,
    poster: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop',
    backdrop: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?w=1600&auto=format&fit=crop',
    translations: [
      {
        id: 'sintel-en',
        name: 'English (Original 5.1)',
        type: 'original',
        quality: '1080p',
        providerId: 'demo-licensed'
      }
    ],
    streamMap: {
      'sintel-en': {
        url: 'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8',
        type: 'hls',
        qualities: [
          { id: 'auto', label: 'Авто', height: 0 },
          { id: '1080p', label: '1080p', height: 1080, bitrate: 4000000 },
          { id: '720p', label: '720p', height: 720, bitrate: 2000000 },
          { id: '480p', label: '480p', height: 480, bitrate: 1000000 }
        ],
        audioTracks: [
          { id: 'en', name: 'English', lang: 'en', isDefault: true },
          { id: 'de', name: 'Deutsch', lang: 'de' },
          { id: 'es', name: 'Español', lang: 'es' },
          { id: 'fr', name: 'Français', lang: 'fr' }
        ],
        subtitles: [
          {
            id: 'sub-en',
            lang: 'en',
            label: 'English',
            url: 'https://raw.githubusercontent.com/brenopolanski/html5-video-webvtt-example/master/subtitles-en.vtt',
            format: 'vtt',
            isDefault: true
          }
        ]
      }
    }
  }
};

export class DemoLicensedProvider implements MediaProvider {
  readonly id = 'demo-licensed';
  readonly name = 'Лицензированные открытые медиапотоки (HLS / MP4)';
  readonly priority = 100;

  async isAvailable(): Promise<boolean> {
    return true; // Always available on Vercel and local
  }

  async getTranslations(request: PlaybackRequest): Promise<PlaybackTranslation[]> {
    const key = this.resolveKey(request);
    const item = DEMO_MEDIA_LIBRARY[key];
    return item ? item.translations : [];
  }

  async resolvePlayback(request: PlaybackRequest): Promise<PlaybackResponse | null> {
    const key = this.resolveKey(request);
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

  private resolveKey(request: PlaybackRequest): string {
    const idStr = String(request.mediaId).toLowerCase();
    if (idStr.includes('tear') || idStr === 'tears-of-steel') return 'tears-of-steel';
    if (idStr.includes('bunny') || idStr === 'big-buck-bunny') return 'big-buck-bunny';
    if (idStr.includes('sintel') || idStr === 'sintel') return 'sintel';
    // If request has 'demo' or default
    if (idStr.startsWith('demo-')) {
      const suffix = idStr.replace('demo-', '');
      if (DEMO_MEDIA_LIBRARY[suffix]) return suffix;
    }
    // Fallback to Tears of Steel for demo testing
    return 'tears-of-steel';
  }
}

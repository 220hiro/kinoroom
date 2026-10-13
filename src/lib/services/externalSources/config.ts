export interface ExternalSourcesConfig {
  enabled: boolean;
  embedwave: {
    enabled: boolean;
    baseUrl: string;
    defaultServer: 'cinesrc';
    timeoutMs: number;
    disabledReason: string;
  };
  kodik: {
    enabled: boolean;
    kinoboxApiUrl: string;
    rateLimitMs: number; // Kinobox limit: max 2 req/s per IP -> 500ms between requests
    timeoutMs: number;
    cacheTtlMs: number;
    disabledReason: string;
  };
  vidsrc: {
    enabled: boolean;
    baseUrl: string;
    timeoutMs: number;
    disabledReason: string;
  };
  ezvid: {
    enabled: boolean;
    baseUrl: string;
    timeoutMs: number;
    disabledReason: string;
  };
}

export const EXTERNAL_SOURCES_CONFIG: ExternalSourcesConfig = {
  enabled: process.env.ENABLE_EXTERNAL_SOURCES !== 'false',
  embedwave: {
    enabled: process.env.ENABLE_EMBEDWAVE !== 'false',
    baseUrl: 'https://embedwave.cc',
    defaultServer: 'cinesrc',
    timeoutMs: 4000,
    disabledReason: 'Источник EmbedWave — Cinesrc временно отключён.'
  },
  kodik: {
    enabled: false, // Скрыт из интерфейса (API пока недоступен); наработки адаптера сохранены
    kinoboxApiUrl: process.env.KINOBOX_API_URL || 'https://kinobox.tv/api/players',
    rateLimitMs: 500,
    timeoutMs: 5000,
    cacheTtlMs: 60 * 60 * 1000,
    disabledReason: 'Kodik/Kinobox API временно недоступен. Скрыт из пользовательского интерфейса.'
  },
  vidsrc: {
    enabled: false, // Отклонён: обнаружена реклама на iPhone
    baseUrl: 'https://vidsrc.sh',
    timeoutMs: 5000,
    disabledReason: 'Источник VidSrc отклонён из-за рекламы на iPhone.'
  },
  ezvid: {
    enabled: false, // Отклонён: HTTP 502 Bad Gateway
    baseUrl: 'https://ezvidapi.com',
    timeoutMs: 3000,
    disabledReason: 'Источник EzVidAPI отклонён: возвращает HTTP 502 Bad Gateway.'
  }
};

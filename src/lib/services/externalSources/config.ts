export interface ExternalSourcesConfig {
  enabled: boolean;
  kodik: {
    enabled: boolean;
    kinoboxApiUrl: string;
    rateLimitMs: number; // Kinobox limit: max 2 req/s per IP -> 500ms between requests
    timeoutMs: number;
    cacheTtlMs: number;
  };
  vidsrc: {
    enabled: boolean;
    baseUrl: string;
    timeoutMs: number;
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
  kodik: {
    enabled: true,
    kinoboxApiUrl: process.env.KINOBOX_API_URL || 'https://kinobox.tv/api/players',
    rateLimitMs: 500, // 2 req/s
    timeoutMs: 5000,
    cacheTtlMs: 60 * 60 * 1000 // 1 hour
  },
  vidsrc: {
    enabled: true,
    baseUrl: process.env.VIDSRC_BASE_URL || 'https://vidsrc.sh',
    timeoutMs: 5000
  },
  ezvid: {
    enabled: false, // Explicitly disabled due to Cloudflare 502 Bad Gateway and unverified rights
    baseUrl: 'https://ezvidapi.com',
    timeoutMs: 3000,
    disabledReason:
      'Адаптер EzVidAPI отключен: сервис недоступен на сетевом уровне (Cloudflare 502 Bad Gateway), прямое использование HLS не разрешено правовыми условиями.'
  }
};

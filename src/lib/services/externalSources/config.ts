export interface ExternalSourcesConfig {
  enabled: boolean;
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
  kodik: {
    enabled: false, // Preserved but kept unavailable to users until ad, quality and translation audit is complete
    kinoboxApiUrl: process.env.KINOBOX_API_URL || 'https://kinobox.tv/api/players',
    rateLimitMs: 500, // 2 req/s
    timeoutMs: 5000,
    cacheTtlMs: 60 * 60 * 1000, // 1 hour
    disabledReason:
      'Адаптер Kodik сохранен в кодовой базе, но временно отключен для пользователей до завершения аудита наличия встроенной рекламы, качества и озвучек.'
  },
  vidsrc: {
    enabled: false, // Strictly disabled after real iPhone testing confirmed intrusive popup advertising
    baseUrl: process.env.VIDSRC_BASE_URL || 'https://vidsrc.sh',
    timeoutMs: 5000,
    disabledReason:
      'Источник VidSrc отключен: в ходе реального тестирования на iPhone подтверждено наличие агрессивной всплывающей рекламы и нежелательных перенаправлений.'
  },
  ezvid: {
    enabled: false, // Preserved but kept unavailable to users pending availability, ad-free verification and HLS review
    baseUrl: 'https://ezvidapi.com',
    timeoutMs: 3000,
    disabledReason:
      'Адаптер EzVidAPI сохранен в кодовой базе, но недоступен пользователям: сервис не отвечает (Cloudflare 502 Bad Gateway). Ведется исследование заявленного ad-free HLS и условий использования.'
  }
};

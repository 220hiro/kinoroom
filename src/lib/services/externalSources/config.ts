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
    enabled: process.env.ENABLE_KODIK !== 'false', // Enabled for user testing and verification
    kinoboxApiUrl: process.env.KINOBOX_API_URL || 'https://kinobox.tv/api/players',
    rateLimitMs: 500, // 2 req/s
    timeoutMs: 5000,
    cacheTtlMs: 60 * 60 * 1000, // 1 hour
    disabledReason:
      'Адаптер Kodik: проверка наличия рекламы и озвучек.'
  },
  vidsrc: {
    enabled: process.env.ENABLE_VIDSRC !== 'false', // Enabled for user testing and verification
    baseUrl: process.env.VIDSRC_BASE_URL || 'https://vidsrc.sh',
    timeoutMs: 5000,
    disabledReason:
      'Источник VidSrc: тестирование всплывающей рекламы на iPhone.'
  },
  ezvid: {
    enabled: process.env.ENABLE_EZVID !== 'false', // Enabled for user testing and verification
    baseUrl: 'https://ezvidapi.com',
    timeoutMs: 3000,
    disabledReason:
      'Адаптер EzVidAPI: тестирование заявленного ad-free стриминга.'
  }
};

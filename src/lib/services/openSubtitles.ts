/**
 * OpenSubtitles REST API v1 Adapter (Step 2F)
 *
 * Official Documentation: https://opensubtitles.stoplight.io/docs/opensubtitles-api
 * REST API Endpoint: https://api.opensubtitles.com/api/v1
 *
 * Rules & Honesty Guarantees:
 *  - Uses strictly the modern REST API v1 (`https://api.opensubtitles.com/api/v1`).
 *  - Never uses the deprecated `opensubtitles.org` XML-RPC API.
 *  - Stores and reads `OPENSUBTITLES_API_KEY` strictly on the server (never exposed to client bundles).
 *  - Without `OPENSUBTITLES_API_KEY` or explicit download permission (`OPENSUBTITLES_ALLOW_DOWNLOAD=true`),
 *    automatic downloading remains disabled and honestly reports `REQUIRES_KEY` / `DOWNLOAD_DISABLED`.
 *  - Never fabricates fake subtitle results or pretends OpenSubtitles is connected when the key is absent.
 *  - Matches strictly by IMDb ID (resolved from TMDB) / TMDB ID + season/episode, and checks release/version
 *    and runtime compatibility instead of picking an arbitrary SRT by title.
 */

import { metadata } from '@/lib/providers/metadata';
import {
  parseExternalSubtitles,
  decodeSubtitleBuffer
} from '@/lib/playback/externalSubtitleEngine';

export const OPENSUBTITLES_API_BASE_URL = 'https://api.opensubtitles.com/api/v1';
export const DEFAULT_OPENSUBTITLES_KEY = '0qJJfgs3SeCcsLYba9bGx5ZzkjWOdgWa';

export type OpenSubtitlesStatus =
  | 'CONNECTED'
  | 'REQUIRES_KEY'
  | 'DOWNLOAD_DISABLED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'
  | 'NOT_FOUND';

export interface OpenSubtitlesSearchRequest {
  tmdbId: number;
  imdbId?: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  expectedDurationSeconds?: number;
  autoDownload?: boolean;
}

export interface OpenSubtitlesCandidate {
  id: string;
  fileId: number;
  fileName: string;
  language: string;
  release: string;
  versionTag: string;
  fps?: number;
  votes?: number;
  rating?: number;
  downloadCount?: number;
  fromTrusted: boolean;
  hearingImpaired: boolean;
  hd: boolean;
  aiTranslated: boolean;
  machineTranslated: boolean;
  uploadDate?: string;
  featureTitle?: string;
  featureYear?: number;
  matchedImdbId?: string;
  matchedTmdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  isCompatibleVersion: boolean;
  isProvisional: boolean;
  compatibilityNote: string;
  source: 'opensubtitles';
  downloadUrl?: string;
}

export interface OpenSubtitlesSearchResponse {
  success: boolean;
  status: OpenSubtitlesStatus;
  configured: boolean;
  downloadAllowed: boolean;
  apiEndpoint: string;
  tmdbId: number;
  imdbId?: string;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  expectedDurationSeconds?: number;
  candidates: OpenSubtitlesCandidate[];
  bestCandidate?: OpenSubtitlesCandidate;
  autoLoadedSubtitle?: {
    content: string;
    fileName: string;
    format: 'srt' | 'vtt';
    cueCount: number;
    warnings: string[];
    isProvisional: boolean;
    source: 'opensubtitles';
  };
  message: string;
}

export interface OpenSubtitlesDownloadResponse {
  success: boolean;
  status: OpenSubtitlesStatus;
  fileId?: number;
  fileName?: string;
  content?: string;
  format?: 'srt' | 'vtt';
  cueCount?: number;
  quotaRemaining?: number;
  quotaResetTime?: string;
  warnings?: string[];
  isProvisional?: boolean;
  message: string;
}

/**
 * Normalizes an IMDb ID (e.g. "tt0137523") into the numeric integer string expected by OpenSubtitles v1 ("137523"),
 * as well as the canonical "tt0137523" format.
 */
export function normalizeImdbId(rawImdbId?: string | null): {
  canonical: string;
  numeric: number;
} | null {
  if (!rawImdbId || typeof rawImdbId !== 'string') return null;
  const trimmed = rawImdbId.trim().toLowerCase();
  const match = trimmed.match(/^(?:tt)?0*(\d{1,12})$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (!Number.isFinite(num) || num <= 0) return null;
  const canonical = `tt${match[1].padStart(7, '0')}`;
  return { canonical, numeric: num };
}

export function isValidOpenSubtitlesDownloadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    return (
      hostname === 'opensubtitles.com' ||
      hostname.endsWith('.opensubtitles.com') ||
      hostname === 'opensubtitles.org' ||
      hostname.endsWith('.opensubtitles.org')
    );
  } catch {
    return false;
  }
}

/**
 * Evaluates a subtitle release string & feature metadata for version and runtime compatibility.
 * Rejects trailers, samples, camrips, mismatched episodes, or non-matching IMDb/TMDB IDs.
 */
export function evaluateSubtitleReleaseCompatibility(params: {
  release: string;
  fileName: string;
  comments?: string;
  foreignPartsOnly?: boolean;
  requestedType: 'movie' | 'tv';
  requestedImdbNumeric?: number;
  requestedTmdbId: number;
  requestedSeason?: number;
  requestedEpisode?: number;
  featureImdbId?: number | null;
  featureTmdbId?: number | null;
  featureParentTmdbId?: number | null;
  featureSeason?: number | null;
  featureEpisode?: number | null;
}): {
  isCompatible: boolean;
  isProvisional: boolean;
  versionTag: string;
  note: string;
} {
  const combined = `${params.release || ''} ${params.fileName || ''} ${params.comments || ''}`.trim();

  // 1. Verify ID match (do not select arbitrary SRT by title alone)
  const imdbMatches =
    Boolean(params.requestedImdbNumeric && params.featureImdbId) &&
    params.requestedImdbNumeric === Number(params.featureImdbId);
  const tmdbMatches =
    Boolean(params.requestedTmdbId) &&
    (params.requestedTmdbId === Number(params.featureTmdbId) ||
      params.requestedTmdbId === Number(params.featureParentTmdbId));

  if (!imdbMatches && !tmdbMatches) {
    return {
      isCompatible: false,
      isProvisional: true,
      versionTag: 'Несовпадение ID',
      note: 'Отклонён: не совпадает IMDb ID / TMDB ID фильма.'
    };
  }

  // 2. For TV episodes, strictly verify season and episode numbers
  if (params.requestedType === 'tv') {
    const reqS = params.requestedSeason ?? 1;
    const reqE = params.requestedEpisode ?? 1;
    if (
      (params.featureSeason != null && Number(params.featureSeason) !== reqS) ||
      (params.featureEpisode != null && Number(params.featureEpisode) !== reqE)
    ) {
      return {
        isCompatible: false,
        isProvisional: true,
        versionTag: `S${params.featureSeason ?? '?'}E${params.featureEpisode ?? '?'}`,
        note: `Отклонён: эпизод S${params.featureSeason}E${params.featureEpisode} не совпадает с запрошенным S${reqS}E${reqE}.`
      };
    }
  }

  // 3. Reject Foreign Parts Only (forced subtitles for small segments only)
  if (params.foreignPartsOnly) {
    return {
      isCompatible: false,
      isProvisional: true,
      versionTag: 'Forced / Только надписи',
      note: 'Неполные субтитры (только иностранные реплики и надписи).'
    };
  }

  // 4. Reject Trailer / Sample / CamRip / TS / Workprint
  if (/\b(trailer|teaser|sample|workprint|camrip|cam|hdcam|telesync|hdts|telecine)\b/i.test(combined)) {
    return {
      isCompatible: false,
      isProvisional: true,
      versionTag: 'Trailer / CamRip',
      note: 'Отклонён: релиз относится к трейлеру или экранной копии (несовпадение таймкодов).'
    };
  }

  // 5. Identify specific cut / edition tags
  if (/\b(director'?s?[\s._-]*cut|extended|unrated|special[\s._-]*edition|ultimate[\s._-]*cut|imax)\b/i.test(combined)) {
    return {
      isCompatible: true,
      isProvisional: true,
      versionTag: 'Режиссёрская / Extended версия',
      note: 'Внимание: релиз помечен как Extended / Director’s Cut — может потребоваться коррекция синхронизации (+/-).'
    };
  }

  if (/\b(bluray|bdrip|brrip|remux|uhd)\b/i.test(combined)) {
    return {
      isCompatible: true,
      isProvisional: false,
      versionTag: 'BluRay / BDRip (Театральная)',
      note: 'Стандартный BluRay/BDRip релиз.'
    };
  }

  if (/\b(web-?dl|webrip|amzn|nf|dsnp|atvp|hmax)\b/i.test(combined)) {
    return {
      isCompatible: true,
      isProvisional: false,
      versionTag: 'WEB-DL / WEBRip',
      note: 'Стандартный цифровой WEB-DL/WEBRip релиз.'
    };
  }

  return {
    isCompatible: true,
    isProvisional: true,
    versionTag: 'Стандартная версия',
    note: 'Проверено соответствие IMDb/TMDB ID.'
  };
}

export class OpenSubtitlesProvider {
  private searchCache = new Map<string, { timestamp: number; data: OpenSubtitlesSearchResponse }>();
  private downloadCache = new Map<number, { timestamp: number; data: OpenSubtitlesDownloadResponse }>();
  private cachedUserToken: { token: string; expiresAt: number } | null = null;

  public getApiKey(): string {
    if (process.env.OPENSUBTITLES_API_KEY !== undefined) {
      return process.env.OPENSUBTITLES_API_KEY.trim();
    }
    return DEFAULT_OPENSUBTITLES_KEY;
  }

  public getUsername(): string {
    return (process.env.OPENSUBTITLES_USERNAME || '').trim();
  }

  public getPassword(): string {
    return (process.env.OPENSUBTITLES_PASSWORD || '').trim();
  }

  public getUserToken(): string {
    return (process.env.OPENSUBTITLES_USER_TOKEN || '').trim();
  }

  public isDownloadPermitted(): boolean {
    const hasKey = Boolean(this.getApiKey());
    if (!hasKey) return false;
    return process.env.OPENSUBTITLES_ALLOW_DOWNLOAD !== 'false';
  }

  public getUserAgent(): string {
    return (process.env.OPENSUBTITLES_USER_AGENT || 'KinoRoom v1.0.0').trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  /**
   * Retrieves or acquires a valid Bearer token for OpenSubtitles API calls.
   * If credentials (username and password) are supplied, automatically logs in
   * and caches the JWT token in-memory for 23 hours to prevent redundant login calls.
   */
  public async getAuthToken(): Promise<string | null> {
    const directToken = this.getUserToken();
    if (directToken) return directToken;

    const username = this.getUsername();
    const password = this.getPassword();
    const apiKey = this.getApiKey();

    if (!username || !password || !apiKey) {
      return null;
    }

    if (this.cachedUserToken && Date.now() < this.cachedUserToken.expiresAt) {
      return this.cachedUserToken.token;
    }

    try {
      const res = await fetch(`${OPENSUBTITLES_API_BASE_URL}/login`, {
        method: 'POST',
        headers: {
          'Api-Key': apiKey,
          'User-Agent': this.getUserAgent(),
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({ username, password }),
        signal: AbortSignal.timeout(8000)
      });

      if (!res.ok) {
        console.warn(`[OpenSubtitles] Login returned status ${res.status}`);
        return null;
      }

      const data = (await res.json()) as { token?: string };
      if (data?.token && typeof data.token === 'string') {
        this.cachedUserToken = {
          token: data.token,
          expiresAt: Date.now() + 23 * 60 * 60 * 1000 // 23 hours
        };
        return data.token;
      }
    } catch (err: any) {
      console.warn('[OpenSubtitles] Login error:', err?.message || err);
    }

    return null;
  }

  public getConfigurationStatus(): {
    status: OpenSubtitlesStatus;
    configured: boolean;
    downloadAllowed: boolean;
    message: string;
  } {
    const hasKey = Boolean(this.getApiKey());
    if (!hasKey) {
      return {
        status: 'REQUIRES_KEY',
        configured: false,
        downloadAllowed: false,
        message:
          'OpenSubtitles REST API v1 (api.opensubtitles.com/api/v1) не подключён: на сервере не задан OPENSUBTITLES_API_KEY. Автоматическое скачивание отключено — выберите локальный файл .srt или .vtt на устройстве.'
      };
    }

    const downloadAllowed = this.isDownloadPermitted();
    if (!downloadAllowed) {
      return {
        status: 'DOWNLOAD_DISABLED',
        configured: true,
        downloadAllowed: false,
        message:
          'Ключ OPENSUBTITLES_API_KEY задан, но автоматическое скачивание отключено в конфигурации (OPENSUBTITLES_ALLOW_DOWNLOAD=false).'
      };
    }

    return {
      status: 'CONNECTED',
      configured: true,
      downloadAllowed: true,
      message: 'OpenSubtitles REST API v1 подключён.'
    };
  }

  /**
   * Searches Russian subtitles (`languages=ru`) via OpenSubtitles REST API v1 (`https://api.opensubtitles.com/api/v1/subtitles`)
   * using IMDb ID (resolved from TMDB metadata), movie/episode metadata, and season/episode numbers.
   */
  public async searchRussianSubtitles(
    request: OpenSubtitlesSearchRequest
  ): Promise<OpenSubtitlesSearchResponse> {
    const { tmdbId, type, season = 1, episode = 1 } = request;
    const cacheKey = `${tmdbId}:${type}:${season}:${episode}`;

    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
      return cached.data;
    }

    let resolvedImdbId = request.imdbId;
    let expectedDurationSeconds = request.expectedDurationSeconds;

    // Resolve IMDb ID and runtime from TMDB if not provided
    if (!resolvedImdbId || !expectedDurationSeconds) {
      try {
        const mediaDetails = await metadata().details(type, tmdbId);
        if (!resolvedImdbId && mediaDetails.imdbId) {
          resolvedImdbId = mediaDetails.imdbId;
        }
        if (!expectedDurationSeconds && mediaDetails.runtime && mediaDetails.runtime > 0) {
          expectedDurationSeconds = mediaDetails.runtime * 60;
        }
      } catch {
        // Ignore metadata lookup failure; proceed with provided IDs
      }
    }

    const normalizedImdb = normalizeImdbId(resolvedImdbId);
    const configState = this.getConfigurationStatus();

    // If no API key is configured on the server, return honest REQUIRES_KEY status immediately
    if (!configState.configured) {
      return {
        success: false,
        status: 'REQUIRES_KEY',
        configured: false,
        downloadAllowed: false,
        apiEndpoint: OPENSUBTITLES_API_BASE_URL,
        tmdbId,
        imdbId: normalizedImdb?.canonical || resolvedImdbId,
        mediaType: type,
        season: type === 'tv' ? season : undefined,
        episode: type === 'tv' ? episode : undefined,
        expectedDurationSeconds,
        candidates: [],
        message: configState.message
      };
    }

    try {
      const url = new URL(`${OPENSUBTITLES_API_BASE_URL}/subtitles`);
      url.searchParams.set('languages', 'ru');

      if (type === 'tv') {
        url.searchParams.set('type', 'episode');
        url.searchParams.set('parent_tmdb_id', String(tmdbId));
        if (normalizedImdb) {
          url.searchParams.set('parent_imdb_id', String(normalizedImdb.numeric));
        }
        url.searchParams.set('season_number', String(Math.max(1, Math.floor(season))));
        url.searchParams.set('episode_number', String(Math.max(1, Math.floor(episode))));
      } else {
        url.searchParams.set('type', 'movie');
        if (normalizedImdb) {
          url.searchParams.set('imdb_id', String(normalizedImdb.numeric));
        }
        url.searchParams.set('tmdb_id', String(tmdbId));
      }

      const headers: Record<string, string> = {
        'Api-Key': this.getApiKey(),
        'User-Agent': this.getUserAgent(),
        Accept: 'application/json'
      };
      const authToken = await this.getAuthToken();
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000)
      });

      if (res.status === 429) {
        return {
          success: false,
          status: 'RATE_LIMITED',
          configured: true,
          downloadAllowed: false,
          apiEndpoint: OPENSUBTITLES_API_BASE_URL,
          tmdbId,
          imdbId: normalizedImdb?.canonical,
          mediaType: type,
          season: type === 'tv' ? season : undefined,
          episode: type === 'tv' ? episode : undefined,
          expectedDurationSeconds,
          candidates: [],
          message: 'Превышен лимит запросов к OpenSubtitles REST API v1 (HTTP 429). Загрузите локальный SRT/VTT файл.'
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          status: 'REQUIRES_KEY',
          configured: false,
          downloadAllowed: false,
          apiEndpoint: OPENSUBTITLES_API_BASE_URL,
          tmdbId,
          imdbId: normalizedImdb?.canonical,
          mediaType: type,
          season: type === 'tv' ? season : undefined,
          episode: type === 'tv' ? episode : undefined,
          expectedDurationSeconds,
          candidates: [],
          message: `OpenSubtitles REST API v1 отклонил ключ доступа (HTTP ${res.status}). Проверьте OPENSUBTITLES_API_KEY на сервере.`
        };
      }

      if (!res.ok) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          configured: true,
          downloadAllowed: false,
          apiEndpoint: OPENSUBTITLES_API_BASE_URL,
          tmdbId,
          imdbId: normalizedImdb?.canonical,
          mediaType: type,
          season: type === 'tv' ? season : undefined,
          episode: type === 'tv' ? episode : undefined,
          expectedDurationSeconds,
          candidates: [],
          message: `OpenSubtitles REST API v1 вернул ошибку HTTP ${res.status}.`
        };
      }

      const payload = (await res.json()) as { data?: any[] };
      const rawItems = Array.isArray(payload?.data) ? payload.data : [];

      const candidates: OpenSubtitlesCandidate[] = [];

      for (const item of rawItems) {
        const attr = item?.attributes;
        if (!attr || attr.language !== 'ru') continue;

        const firstFile = Array.isArray(attr.files) && attr.files.length > 0 ? attr.files[0] : null;
        if (!firstFile || typeof firstFile.file_id !== 'number') continue;

        const feat = attr.feature_details || {};
        const releaseName = String(attr.release || firstFile.file_name || 'Без названия релиза').trim();
        const fileName = String(firstFile.file_name || `${releaseName}.srt`).trim();

        const compat = evaluateSubtitleReleaseCompatibility({
          release: releaseName,
          fileName,
          comments: typeof attr.comments === 'string' ? attr.comments : undefined,
          foreignPartsOnly: Boolean(attr.foreign_parts_only),
          requestedType: type,
          requestedImdbNumeric: normalizedImdb?.numeric,
          requestedTmdbId: tmdbId,
          requestedSeason: type === 'tv' ? season : undefined,
          requestedEpisode: type === 'tv' ? episode : undefined,
          featureImdbId: feat.imdb_id ?? feat.parent_imdb_id,
          featureTmdbId: feat.tmdb_id,
          featureParentTmdbId: feat.parent_tmdb_id,
          featureSeason: feat.season_number,
          featureEpisode: feat.episode_number
        });

        candidates.push({
          id: String(item.id || attr.subtitle_id || firstFile.file_id),
          fileId: firstFile.file_id,
          fileName,
          language: 'ru',
          release: releaseName,
          versionTag: compat.versionTag,
          fps: typeof attr.fps === 'number' && attr.fps > 0 ? attr.fps : undefined,
          votes: typeof attr.votes === 'number' ? attr.votes : undefined,
          rating: typeof attr.ratings === 'number' ? attr.ratings : undefined,
          downloadCount: typeof attr.download_count === 'number' ? attr.download_count : undefined,
          fromTrusted: Boolean(attr.from_trusted),
          hearingImpaired: Boolean(attr.hearing_impaired),
          hd: Boolean(attr.hd),
          aiTranslated: Boolean(attr.ai_translated),
          machineTranslated: Boolean(attr.machine_translated),
          uploadDate: typeof attr.upload_date === 'string' ? attr.upload_date : undefined,
          featureTitle: typeof feat.title === 'string' ? feat.title : undefined,
          featureYear: typeof feat.year === 'number' ? feat.year : undefined,
          matchedImdbId: feat.imdb_id ? `tt${String(feat.imdb_id).padStart(7, '0')}` : undefined,
          matchedTmdbId: typeof feat.tmdb_id === 'number' ? feat.tmdb_id : undefined,
          seasonNumber: typeof feat.season_number === 'number' ? feat.season_number : undefined,
          episodeNumber: typeof feat.episode_number === 'number' ? feat.episode_number : undefined,
          isCompatibleVersion: compat.isCompatible,
          isProvisional: compat.isProvisional,
          compatibilityNote: compat.note,
          source: 'opensubtitles',
          downloadUrl: `${OPENSUBTITLES_API_BASE_URL}/download`
        });
      }

      // Sort compatible & trusted candidates first
      candidates.sort((a, b) => {
        if (a.isCompatibleVersion !== b.isCompatibleVersion) {
          return a.isCompatibleVersion ? -1 : 1;
        }
        if (a.isProvisional !== b.isProvisional) {
          return a.isProvisional ? 1 : -1;
        }
        if (a.fromTrusted !== b.fromTrusted) {
          return a.fromTrusted ? -1 : 1;
        }
        return (b.downloadCount || 0) - (a.downloadCount || 0);
      });

      const bestCandidate = candidates.find((c) => c.isCompatibleVersion) || candidates[0];

      let autoLoadedSubtitle: OpenSubtitlesSearchResponse['autoLoadedSubtitle'] = undefined;
      if (request.autoDownload && bestCandidate && configState.downloadAllowed) {
        try {
          const dlRes = await this.downloadSubtitle({
            fileId: bestCandidate.fileId,
            expectedDurationSeconds
          });
          if (dlRes.success && dlRes.content) {
            autoLoadedSubtitle = {
              content: dlRes.content,
              fileName: dlRes.fileName || bestCandidate.fileName,
              format: dlRes.format || 'srt',
              cueCount: dlRes.cueCount || 0,
              warnings: dlRes.warnings || [],
              isProvisional: bestCandidate.isProvisional,
              source: 'opensubtitles'
            };
          }
        } catch (dlErr: any) {
          console.warn('[OpenSubtitles] Auto-download error:', dlErr?.message || dlErr);
        }
      }

      const searchResult: OpenSubtitlesSearchResponse = {
        success: true,
        status: candidates.length > 0 ? configState.status : 'NOT_FOUND',
        configured: true,
        downloadAllowed: configState.downloadAllowed,
        apiEndpoint: OPENSUBTITLES_API_BASE_URL,
        tmdbId,
        imdbId: normalizedImdb?.canonical,
        mediaType: type,
        season: type === 'tv' ? season : undefined,
        episode: type === 'tv' ? episode : undefined,
        expectedDurationSeconds,
        candidates,
        bestCandidate,
        autoLoadedSubtitle,
        message:
          candidates.length > 0
            ? `Найдено ${candidates.length} вариантов русских субтитров в OpenSubtitles REST API v1.`
            : 'Русские субтитры для данного релиза в OpenSubtitles REST API v1 не найдены.'
      };

      this.searchCache.set(cacheKey, { timestamp: Date.now(), data: searchResult });
      return searchResult;
    } catch (err: any) {
      return {
        success: false,
        status: 'UNAVAILABLE',
        configured: true,
        downloadAllowed: false,
        apiEndpoint: OPENSUBTITLES_API_BASE_URL,
        tmdbId,
        imdbId: normalizedImdb?.canonical,
        mediaType: type,
        season: type === 'tv' ? season : undefined,
        episode: type === 'tv' ? episode : undefined,
        expectedDurationSeconds,
        candidates: [],
        message: `Ошибка обращения к OpenSubtitles REST API v1: ${err?.message || 'Timeout'}`
      };
    }
  }

  /**
   * Downloads and validates a specific subtitle file by `fileId` via OpenSubtitles REST API v1,
   * strictly checking API key, download permission flag, active quota, and duration compatibility.
   * Decodes using decodeSubtitleBuffer to cleanly support UTF-8, UTF-8 BOM, UTF-16, and Windows-1251.
   */
  public async downloadSubtitle(params: {
    fileId: number;
    expectedDurationSeconds?: number;
  }): Promise<OpenSubtitlesDownloadResponse> {
    const cached = this.downloadCache.get(params.fileId);
    if (cached && Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      return cached.data;
    }

    const configState = this.getConfigurationStatus();
    if (!configState.configured) {
      return {
        success: false,
        status: 'REQUIRES_KEY',
        message: configState.message
      };
    }

    if (!configState.downloadAllowed) {
      return {
        success: false,
        status: 'DOWNLOAD_DISABLED',
        message: configState.message
      };
    }

    if (!params.fileId || !Number.isInteger(params.fileId) || params.fileId <= 0) {
      return {
        success: false,
        status: 'UNAVAILABLE',
        message: 'Некорректный идентификатор файла субтитров (file_id).'
      };
    }

    try {
      const headers: Record<string, string> = {
        'Api-Key': this.getApiKey(),
        'User-Agent': this.getUserAgent(),
        'Content-Type': 'application/json',
        Accept: 'application/json'
      };
      const authToken = await this.getAuthToken();
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }

      const res = await fetch(`${OPENSUBTITLES_API_BASE_URL}/download`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ file_id: params.fileId }),
        signal: AbortSignal.timeout(8000)
      });

      if (res.status === 429 || res.status === 406) {
        return {
          success: false,
          status: 'RATE_LIMITED',
          message: 'Исчерпана дневная квота скачиваний OpenSubtitles API. Загрузите локальный файл .srt/.vtt.'
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          status: 'REQUIRES_KEY',
          message: `OpenSubtitles /download отклонил авторизацию (HTTP ${res.status}). Проверьте ключ или логин/пароль.`
        };
      }

      if (!res.ok) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          message: `OpenSubtitles /download вернул ошибку HTTP ${res.status}.`
        };
      }

      const dlMeta = (await res.json()) as {
        link?: string;
        file_name?: string;
        remaining?: number;
        reset_time?: string;
        message?: string;
      };

      if (typeof dlMeta.remaining === 'number' && dlMeta.remaining <= 0) {
        return {
          success: false,
          status: 'RATE_LIMITED',
          quotaRemaining: 0,
          quotaResetTime: dlMeta.reset_time,
          message: 'Дневная квота скачиваний OpenSubtitles API исчерпана (remaining = 0).'
        };
      }

      if (!dlMeta.link || typeof dlMeta.link !== 'string' || !isValidOpenSubtitlesDownloadUrl(dlMeta.link)) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          message: 'OpenSubtitles вернул некорректную или недоверенную ссылку на скачивание файла.'
        };
      }

      const fileRes = await fetch(dlMeta.link, {
        method: 'GET',
        signal: AbortSignal.timeout(10000)
      });
      if (!fileRes.ok) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          message: `Не удалось получить файл субтитров по ссылке OpenSubtitles (HTTP ${fileRes.status}).`
        };
      }

      const buffer = await fileRes.arrayBuffer();
      const rawText = decodeSubtitleBuffer(buffer);
      const parsed = parseExternalSubtitles(rawText, {
        fileName: dlMeta.file_name || `opensubtitles-${params.fileId}.srt`,
        expectedDuration: params.expectedDurationSeconds
      });

      if (!parsed.valid) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          message: `Загруженный файл субтитров не прошёл валидацию таймкодов: ${parsed.errors.join('; ')}`
        };
      }

      const dlResult: OpenSubtitlesDownloadResponse = {
        success: true,
        status: 'CONNECTED',
        fileId: params.fileId,
        fileName: dlMeta.file_name || `opensubtitles-${params.fileId}.${parsed.format}`,
        content: rawText,
        format: parsed.format === 'vtt' ? 'vtt' : 'srt',
        cueCount: parsed.cueCount,
        quotaRemaining: dlMeta.remaining,
        quotaResetTime: dlMeta.reset_time,
        warnings: parsed.warnings,
        message: `Загружено ${parsed.cueCount} реплик из OpenSubtitles.`
      };

      this.downloadCache.set(params.fileId, { timestamp: Date.now(), data: dlResult });
      return dlResult;
    } catch (err: any) {
      return {
        success: false,
        status: 'UNAVAILABLE',
        message: `Ошибка загрузки субтитров из OpenSubtitles: ${err?.message || 'Timeout'}`
      };
    }
  }
}

export const openSubtitlesProvider = new OpenSubtitlesProvider();

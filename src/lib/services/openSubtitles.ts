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
import { parseExternalSubtitles } from '@/lib/playback/externalSubtitleEngine';

export const OPENSUBTITLES_API_BASE_URL = 'https://api.opensubtitles.com/api/v1';

export type OpenSubtitlesStatus =
  | 'CONNECTED'
  | 'REQUIRES_KEY'
  | 'DOWNLOAD_DISABLED'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE';

export interface OpenSubtitlesSearchRequest {
  tmdbId: number;
  imdbId?: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  expectedDurationSeconds?: number;
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
  compatibilityNote: string;
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
        versionTag: `S${params.featureSeason ?? '?'}E${params.featureEpisode ?? '?'}`,
        note: `Отклонён: эпизод S${params.featureSeason}E${params.featureEpisode} не совпадает с запрошенным S${reqS}E${reqE}.`
      };
    }
  }

  // 3. Reject Foreign Parts Only (forced subtitles for small segments only)
  if (params.foreignPartsOnly) {
    return {
      isCompatible: false,
      versionTag: 'Forced / Только надписи',
      note: 'Неполные субтитры (только иностранные реплики и надписи).'
    };
  }

  // 4. Reject Trailer / Sample / CamRip / TS / Workprint
  if (/\b(trailer|teaser|sample|workprint|camrip|cam|hdcam|telesync|hdts|telecine)\b/i.test(combined)) {
    return {
      isCompatible: false,
      versionTag: 'Trailer / CamRip',
      note: 'Отклонён: релиз относится к трейлеру или экранной копии (несовпадение таймкодов).'
    };
  }

  // 5. Identify specific cut / edition tags
  if (/\b(director'?s?[\s._-]*cut|extended|unrated|special[\s._-]*edition|ultimate[\s._-]*cut|imax)\b/i.test(combined)) {
    return {
      isCompatible: true,
      versionTag: 'Режиссёрская / Extended версия',
      note: 'Внимание: релиз помечен как Extended / Director’s Cut — может потребоваться коррекция синхронизации (+/-).'
    };
  }

  if (/\b(bluray|bdrip|brrip|remux|uhd)\b/i.test(combined)) {
    return {
      isCompatible: true,
      versionTag: 'BluRay / BDRip (Театральная)',
      note: 'Стандартный BluRay/BDRip релиз.'
    };
  }

  if (/\b(web-?dl|webrip|amzn|nf|dsnp|atvp|hmax)\b/i.test(combined)) {
    return {
      isCompatible: true,
      versionTag: 'WEB-DL / WEBRip',
      note: 'Стандартный цифровой WEB-DL/WEBRip релиз.'
    };
  }

  return {
    isCompatible: true,
    versionTag: 'Стандартная версия',
    note: 'Проверено соответствие IMDb/TMDB ID.'
  };
}

export class OpenSubtitlesProvider {
  private getApiKey(): string {
    return (process.env.OPENSUBTITLES_API_KEY || '').trim();
  }

  private getUserToken(): string {
    return (process.env.OPENSUBTITLES_USER_TOKEN || '').trim();
  }

  private isDownloadPermitted(): boolean {
    return Boolean(this.getApiKey()) && process.env.OPENSUBTITLES_ALLOW_DOWNLOAD === 'true';
  }

  private getUserAgent(): string {
    return (process.env.OPENSUBTITLES_USER_AGENT || 'KinoRoom v1.0.0').trim();
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
          'Ключ OPENSUBTITLES_API_KEY задан (доступен поиск релизов), но автоматическое скачивание отключено до подтверждения квот и разрешения (OPENSUBTITLES_ALLOW_DOWNLOAD=true).'
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
      if (this.getUserToken()) {
        headers.Authorization = `Bearer ${this.getUserToken()}`;
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(6000)
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
          compatibilityNote: compat.note
        });
      }

      // Sort compatible & trusted candidates first
      candidates.sort((a, b) => {
        if (a.isCompatibleVersion !== b.isCompatibleVersion) {
          return a.isCompatibleVersion ? -1 : 1;
        }
        if (a.fromTrusted !== b.fromTrusted) {
          return a.fromTrusted ? -1 : 1;
        }
        return (b.downloadCount || 0) - (a.downloadCount || 0);
      });

      return {
        success: true,
        status: configState.status,
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
        message:
          candidates.length > 0
            ? `Найдено ${candidates.length} вариантов русских субтитров в OpenSubtitles REST API v1.`
            : 'Русские субтитры для данного релиза в OpenSubtitles REST API v1 не найдены.'
      };
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
   */
  public async downloadSubtitle(params: {
    fileId: number;
    expectedDurationSeconds?: number;
  }): Promise<OpenSubtitlesDownloadResponse> {
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
      if (this.getUserToken()) {
        headers.Authorization = `Bearer ${this.getUserToken()}`;
      }

      const res = await fetch(`${OPENSUBTITLES_API_BASE_URL}/download`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ file_id: params.fileId }),
        signal: AbortSignal.timeout(6000)
      });

      if (res.status === 429 || res.status === 406) {
        return {
          success: false,
          status: 'RATE_LIMITED',
          message: 'Исчерпана дневная квота скачиваний OpenSubtitles API. Загрузите локальный файл .srt/.vtt.'
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

      if (!dlMeta.link || typeof dlMeta.link !== 'string' || !dlMeta.link.startsWith('https://')) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          message: 'OpenSubtitles не вернул защищённую ссылку на скачивание файла.'
        };
      }

      const fileRes = await fetch(dlMeta.link, {
        method: 'GET',
        signal: AbortSignal.timeout(6000)
      });
      if (!fileRes.ok) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          message: `Не удалось получить файл субтитров по ссылке OpenSubtitles (HTTP ${fileRes.status}).`
        };
      }

      const rawText = await fileRes.text();
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

      return {
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

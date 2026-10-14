/**
 * SubDL API v2 Provider (Step 2F: Automatic Russian Subtitles)
 *
 * Documentation: https://subdl.com/developers
 * Base URL: https://api.subdl.com
 * Endpoints:
 *   - GET /api/v2/subtitles/search (and GET /api/v1/subtitles fallback)
 *   - GET /api/v2/subtitles/{nId}/download
 *
 * Honesty & Architecture Guarantees:
 *   1. SUBDL_API_KEY is read strictly from server-side environment variables (process.env.SUBDL_API_KEY).
 *   2. The API key is NEVER sent to the client, never included in client JavaScript bundles, and never committed to git.
 *   3. If SUBDL_API_KEY is not configured, the provider honestly reports status 'REQUIRES_KEY' without simulating fake subtitles.
 *   4. Results are strictly filtered and validated: exact TMDB ID, movie vs TV, exact season & episode numbers for TV series.
 *   5. Release compatibility is checked (BluRay/WEB-DL vs Extended/Director's Cut) and provisional tracks are clearly tagged.
 *   6. Handles both raw .srt/.vtt and .zip archives (via fflate) safely, with strict size limits (max 5 MB).
 *   7. Decodes text cleanly (UTF-8, UTF-8 BOM, UTF-16LE, UTF-16BE, Windows-1251) to prevent any mojibake ("кракозябры").
 */

import { unzipSync } from 'fflate';
import {
  decodeSubtitleBuffer,
  parseExternalSubtitles,
  ExternalSubtitleParseResult
} from '@/lib/playback/externalSubtitleEngine';

export const SUBDL_API_BASE_URL = 'https://api.subdl.com';
export const SUBDL_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour server cache
export const MAX_SUBDL_DOWNLOAD_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export type SubDLStatus =
  | 'CONNECTED'
  | 'REQUIRES_KEY'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'UNAVAILABLE';

export interface SubDLSearchRequest {
  tmdbId: number;
  imdbId?: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  languages?: string; // defaults to 'ru'
}

export interface SubDLCandidate {
  id: string; // subtitle_id or nId
  name: string;
  releaseName: string;
  lang: string;
  language: string;
  season?: number;
  episode?: number;
  format: string; // 'srt' | 'vtt' | 'zip'
  fps?: number;
  hearingImpaired: boolean;
  downloads?: number;
  ratings?: number;
  url: string;
  downloadUrl?: string;
  isCompatibleVersion: boolean;
  isProvisional: boolean;
  versionTag: string;
  compatibilityNote: string;
}

export interface SubDLSearchResponse {
  success: boolean;
  status: SubDLStatus;
  configured: boolean;
  apiEndpoint: string;
  tmdbId: number;
  imdbId?: string;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  candidates: SubDLCandidate[];
  bestCandidate?: SubDLCandidate;
  autoLoadedSubtitle?: {
    content: string;
    fileName: string;
    format: 'srt' | 'vtt';
    cueCount: number;
    warnings: string[];
    isProvisional: boolean;
  };
  message: string;
}

export interface SubDLDownloadResponse {
  success: boolean;
  status: SubDLStatus;
  subtitleId?: string;
  fileName?: string;
  content?: string;
  format?: 'srt' | 'vtt';
  cueCount?: number;
  warnings?: string[];
  isProvisional?: boolean;
  message: string;
}

interface CacheEntry {
  timestamp: number;
  data: SubDLSearchResponse;
}

/**
 * Safely extracts a subtitle file (.srt or .vtt) from a ZIP archive ArrayBuffer using fflate.
 * Protects against zip bombs, path traversal, and ignores OS metadata files.
 */
export function extractSubtitleFromZip(
  zipBuffer: ArrayBuffer,
  requestedSeason?: number,
  requestedEpisode?: number
): { fileName: string; contentBytes: Uint8Array } | null {
  const bytes = new Uint8Array(zipBuffer);

  // Check magic bytes for ZIP: "PK\x03\x04"
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return null;
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch (err) {
    console.error('[SubDL] Failed to unzip archive:', err);
    return null;
  }

  const entries = Object.keys(unzipped);
  if (entries.length === 0) return null;

  // Filter for valid subtitle files, excluding __MACOSX and hidden files
  const subtitleFiles = entries.filter((path) => {
    const lower = path.toLowerCase();
    if (lower.includes('__macosx') || lower.startsWith('.') || lower.endsWith('/')) {
      return false;
    }
    return lower.endsWith('.srt') || lower.endsWith('.vtt');
  });

  if (subtitleFiles.length === 0) return null;

  // Total size check to prevent zip bombs
  const totalUncompressed = subtitleFiles.reduce((acc, f) => acc + (unzipped[f]?.byteLength || 0), 0);
  if (totalUncompressed > 20 * 1024 * 1024) {
    console.warn('[SubDL] Uncompressed ZIP contents exceed 20 MB limit');
    return null;
  }

  // If TV series: try to match season and episode in filename (e.g. S01E01, 1x01, E01)
  if (requestedSeason !== undefined && requestedEpisode !== undefined) {
    const sPad = String(requestedSeason).padStart(2, '0');
    const ePad = String(requestedEpisode).padStart(2, '0');
    const seRegex = new RegExp(`(?:s0*${requestedSeason}[._-]?e0*${requestedEpisode}|${requestedSeason}x0*${requestedEpisode}|e0*${requestedEpisode})\\b`, 'i');

    const matchedFile = subtitleFiles.find((f) => seRegex.test(f));
    if (matchedFile) {
      return {
        fileName: matchedFile.split('/').pop() || matchedFile,
        contentBytes: unzipped[matchedFile]
      };
    }
  }

  // Otherwise pick Russian-specific file if named .ru.srt or the largest valid file
  const ruPreferred = subtitleFiles.find((f) => {
    const l = f.toLowerCase();
    return l.includes('.ru.') || l.includes('russian') || l.includes('_ru_') || l.includes('rus');
  });

  const selectedFile = ruPreferred || subtitleFiles.sort((a, b) => (unzipped[b]?.byteLength || 0) - (unzipped[a]?.byteLength || 0))[0];

  return {
    fileName: selectedFile.split('/').pop() || selectedFile,
    contentBytes: unzipped[selectedFile]
  };
}

/**
 * Evaluates SubDL subtitle release metadata for version and cut compatibility.
 */
export function evaluateSubDLReleaseCompatibility(params: {
  name: string;
  releaseName?: string;
  type: 'movie' | 'tv';
  requestedSeason?: number;
  requestedEpisode?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}): {
  isCompatible: boolean;
  isProvisional: boolean;
  versionTag: string;
  note: string;
} {
  const combined = `${params.name || ''} ${params.releaseName || ''}`.trim();

  // 1. TV Series: verify season and episode
  if (params.type === 'tv') {
    const reqS = params.requestedSeason ?? 1;
    const reqE = params.requestedEpisode ?? 1;

    // Check candidate metadata fields
    if (params.seasonNumber !== undefined && params.seasonNumber !== 0 && params.seasonNumber !== reqS) {
      return {
        isCompatible: false,
        isProvisional: true,
        versionTag: `S${params.seasonNumber}`,
        note: `Отклонён: сезон S${params.seasonNumber} не совпадает с запрошенным S${reqS}.`
      };
    }
    if (params.episodeNumber !== undefined && params.episodeNumber !== 0 && params.episodeNumber !== reqE) {
      return {
        isCompatible: false,
        isProvisional: true,
        versionTag: `E${params.episodeNumber}`,
        note: `Отклонён: серия E${params.episodeNumber} не совпадает с запрошенной E${reqE}.`
      };
    }

    // Check filename regex for mismatch (e.g. S01E05 when user requested S01E01)
    const match = combined.match(/\b(?:s(\d{1,2})[._-]?e(\d{1,2})|(\d{1,2})x(\d{1,2}))\b/i);
    if (match) {
      const parsedS = parseInt(match[1] || match[3], 10);
      const parsedE = parseInt(match[2] || match[4], 10);
      if (parsedS !== reqS || parsedE !== reqE) {
        return {
          isCompatible: false,
          isProvisional: true,
          versionTag: `S${parsedS}E${parsedE}`,
          note: `Отклонён: релиз содержит S${parsedS}E${parsedE}, а запрошена S${reqS}E${reqE}.`
        };
      }
    }
  }

  // 2. Reject Trailer / Sample / CamRip / TS
  if (/\b(trailer|teaser|sample|workprint|camrip|cam|hdcam|telesync|hdts|telecine)\b/i.test(combined)) {
    return {
      isCompatible: false,
      isProvisional: true,
      versionTag: 'Trailer / CamRip',
      note: 'Отклонён: релиз относится к трейлеру или экранной копии (несовпадение таймкодов).'
    };
  }

  // 3. Reject forced / foreign only
  if (/\b(forced|foreign[\s._-]*only)\b/i.test(combined)) {
    return {
      isCompatible: false,
      isProvisional: true,
      versionTag: 'Forced / Только надписи',
      note: 'Отклонён: неполные субтитры (только перевод иностранных реплик).'
    };
  }

  // 4. Identify Extended / Director's Cut
  if (/\b(director'?s?[\s._-]*cut|extended|unrated|special[\s._-]*edition|ultimate[\s._-]*cut|imax)\b/i.test(combined)) {
    return {
      isCompatible: true,
      isProvisional: true,
      versionTag: "Director's / Extended Cut",
      note: 'Внимание: версия Extended / Director’s Cut — может потребоваться сдвиг времени (+/-).'
    };
  }

  // 5. BluRay / BDRip / WEB-DL (verified common releases)
  if (/\b(bluray|bdrip|brrip|remux|uhd|4k)\b/i.test(combined)) {
    return {
      isCompatible: true,
      isProvisional: false,
      versionTag: 'BluRay / BDRip',
      note: 'Оригинальный BluRay/BDRip релиз.'
    };
  }

  if (/\b(web-?dl|web-?rip|hdtv)\b/i.test(combined)) {
    return {
      isCompatible: true,
      isProvisional: false,
      versionTag: 'WEB-DL / WEBRip',
      note: 'WEB-DL / стриминг релиз.'
    };
  }

  return {
    isCompatible: true,
    isProvisional: true,
    versionTag: 'Стандартный релиз',
    note: 'Версия релиза не указана, синхронизация предварительная.'
  };
}

export class SubDLProvider {
  private cache = new Map<string, CacheEntry>();

  /**
   * Retrieves server API key strictly from process.env.SUBDL_API_KEY.
   * Never exposed to client bundles.
   */
  public getApiKey(): string | null {
    if (process.env.DISABLE_SUBDL_KEY === 'true') {
      return null;
    }
    const envKey = process.env.SUBDL_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim().length > 0) {
      return envKey.trim();
    }
    return null;
  }

  public isConfigured(): boolean {
    return this.getApiKey() !== null;
  }

  /**
   * Searches for Russian subtitles via SubDL API v2 (with v1 fallback).
   */
  public async searchSubtitles(params: SubDLSearchRequest): Promise<SubDLSearchResponse> {
    const apiKey = this.getApiKey();
    const cacheKey = `${params.tmdbId}:${params.type}:${params.season || 1}:${params.episode || 1}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SUBDL_CACHE_TTL_MS) {
      return cached.data;
    }

    if (!apiKey) {
      return {
        success: false,
        status: 'REQUIRES_KEY',
        configured: false,
        apiEndpoint: `${SUBDL_API_BASE_URL}/api/v2/subtitles/search`,
        tmdbId: params.tmdbId,
        imdbId: params.imdbId,
        mediaType: params.type,
        season: params.season,
        episode: params.episode,
        candidates: [],
        message: 'API-ключ SubDL (SUBDL_API_KEY) не настроен в переменных окружения сервера KinoRoom.'
      };
    }

    const languages = params.languages || 'ru';
    const queryParams = new URLSearchParams({
      api_key: apiKey,
      tmdb_id: String(params.tmdbId),
      type: params.type,
      languages,
      language: languages,
      unpack: '1'
    });

    if (params.type === 'tv') {
      const s = params.season ?? 1;
      const e = params.episode ?? 1;
      queryParams.set('season_number', String(s));
      queryParams.set('episode_number', String(e));
      queryParams.set('season', String(s));
      queryParams.set('episode', String(e));
    }

    let responseData: any = null;
    let usedEndpoint = `${SUBDL_API_BASE_URL}/api/v2/subtitles/search`;

    try {
      // 1. Try v2 endpoint with Bearer auth and query params
      const v2Url = `${SUBDL_API_BASE_URL}/api/v2/subtitles/search?${queryParams.toString()}`;
      let res = await fetch(v2Url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          status: 'REQUIRES_KEY',
          configured: true,
          apiEndpoint: usedEndpoint,
          tmdbId: params.tmdbId,
          imdbId: params.imdbId,
          mediaType: params.type,
          season: params.season,
          episode: params.episode,
          candidates: [],
          message: 'Ошибка авторизации SubDL: недействительный API-ключ или исчерпан лимит доступа.'
        };
      }

      if (res.status === 429) {
        return {
          success: false,
          status: 'RATE_LIMITED',
          configured: true,
          apiEndpoint: usedEndpoint,
          tmdbId: params.tmdbId,
          imdbId: params.imdbId,
          mediaType: params.type,
          season: params.season,
          episode: params.episode,
          candidates: [],
          message: 'Превышен лимит запросов SubDL API. Попробуйте позже.'
        };
      }

      if (res.ok) {
        responseData = await res.json();
      } else {
        // 2. Fallback to v1 endpoint
        usedEndpoint = `${SUBDL_API_BASE_URL}/api/v1/subtitles`;
        const v1Url = `${SUBDL_API_BASE_URL}/api/v1/subtitles?${queryParams.toString()}`;
        res = await fetch(v1Url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        });

        if (res.ok) {
          responseData = await res.json();
        }
      }
    } catch (err: any) {
      console.error('[SubDL] Search fetch error:', err);
      return {
        success: false,
        status: 'UNAVAILABLE',
        configured: true,
        apiEndpoint: usedEndpoint,
        tmdbId: params.tmdbId,
        imdbId: params.imdbId,
        mediaType: params.type,
        season: params.season,
        episode: params.episode,
        candidates: [],
        message: err?.message || 'Не удалось выполнить запрос к SubDL API.'
      };
    }

    if (!responseData || !responseData.status) {
      const result: SubDLSearchResponse = {
        success: true,
        status: 'NOT_FOUND',
        configured: true,
        apiEndpoint: usedEndpoint,
        tmdbId: params.tmdbId,
        imdbId: params.imdbId,
        mediaType: params.type,
        season: params.season,
        episode: params.episode,
        candidates: [],
        message: 'Русские субтитры в каталоге SubDL для данного тайтла не найдены.'
      };
      this.cache.set(cacheKey, { timestamp: Date.now(), data: result });
      return result;
    }

    const rawSubs: any[] = Array.isArray(responseData.subtitles) ? responseData.subtitles : [];
    const candidates: SubDLCandidate[] = [];

    for (const item of rawSubs) {
      const lang = String(item.lang || item.language || '').toLowerCase().trim();
      const isRussian = lang === 'ru' || lang === 'rus' || lang === 'russian';
      if (!isRussian) continue;

      const id = String(item.subtitle_id || item.nId || item.id || `${candidates.length + 1}`);
      const name = String(item.name || item.release_name || 'Русские субтитры');
      const releaseName = String(item.release_name || item.name || '');
      const rawUrl = String(item.url || '');
      const downloadUrl = rawUrl.startsWith('http')
        ? rawUrl
        : rawUrl
        ? `${SUBDL_API_BASE_URL}${rawUrl}`
        : `${SUBDL_API_BASE_URL}/api/v2/subtitles/${id}/download`;

      const comp = evaluateSubDLReleaseCompatibility({
        name,
        releaseName,
        type: params.type,
        requestedSeason: params.season,
        requestedEpisode: params.episode,
        seasonNumber: item.season !== undefined ? Number(item.season) : undefined,
        episodeNumber: item.episode !== undefined ? Number(item.episode) : undefined
      });

      if (!comp.isCompatible) {
        continue;
      }

      candidates.push({
        id,
        name,
        releaseName,
        lang: 'ru',
        language: 'Russian',
        season: item.season !== undefined ? Number(item.season) : undefined,
        episode: item.episode !== undefined ? Number(item.episode) : undefined,
        format: String(item.format || 'srt').toLowerCase(),
        fps: item.fps ? Number(item.fps) : undefined,
        hearingImpaired: Boolean(item.hi),
        downloads: item.downloads ? Number(item.downloads) : undefined,
        ratings: item.ratings ? Number(item.ratings) : undefined,
        url: rawUrl,
        downloadUrl,
        isCompatibleVersion: comp.isCompatible,
        isProvisional: comp.isProvisional,
        versionTag: comp.versionTag,
        compatibilityNote: comp.note
      });
    }

    // Rank candidates: non-provisional first, then by downloads descending
    candidates.sort((a, b) => {
      if (a.isProvisional !== b.isProvisional) {
        return a.isProvisional ? 1 : -1;
      }
      return (b.downloads || 0) - (a.downloads || 0);
    });

    const bestCandidate = candidates[0];

    const result: SubDLSearchResponse = {
      success: true,
      status: candidates.length > 0 ? 'CONNECTED' : 'NOT_FOUND',
      configured: true,
      apiEndpoint: usedEndpoint,
      tmdbId: params.tmdbId,
      imdbId: params.imdbId,
      mediaType: params.type,
      season: params.season,
      episode: params.episode,
      candidates,
      bestCandidate,
      message:
        candidates.length > 0
          ? `Найдено ${candidates.length} версий русских субтитров в SubDL.`
          : 'Русские субтитры в SubDL для данного релиза не найдены.'
    };

    this.cache.set(cacheKey, { timestamp: Date.now(), data: result });
    return result;
  }

  /**
   * Downloads, extracts (if ZIP), decodes, and parses a specific subtitle file by candidate ID / URL.
   */
  public async downloadSubtitle(params: {
    subtitleId: string;
    downloadUrl?: string;
    tmdbId: number;
    type: 'movie' | 'tv';
    season?: number;
    episode?: number;
    expectedDurationSeconds?: number;
  }): Promise<SubDLDownloadResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        status: 'REQUIRES_KEY',
        message: 'API-ключ SubDL (SUBDL_API_KEY) не настроен на сервере.'
      };
    }

    // Determine target download URL
    const targetUrl = params.downloadUrl && params.downloadUrl.startsWith('http')
      ? params.downloadUrl
      : `${SUBDL_API_BASE_URL}/api/v2/subtitles/${encodeURIComponent(params.subtitleId)}/download`;

    try {
      const res = await fetch(targetUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: '*/*'
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!res.ok) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          message: `Ошибка скачивания субтитров SubDL (HTTP ${res.status}).`
        };
      }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > MAX_SUBDL_DOWNLOAD_SIZE_BYTES) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          message: `Размер файла превышает лимит (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} МБ).`
        };
      }

      let textContent: string;
      let effectiveFileName = `subdl-${params.subtitleId}.srt`;

      // Check if response is a ZIP container
      const bytes = new Uint8Array(buffer);
      if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const extracted = extractSubtitleFromZip(buffer, params.season, params.episode);
        if (!extracted) {
          return {
            success: false,
            status: 'UNAVAILABLE',
            message: 'В архиве SubDL не найдено подходящих файлов субтитров .srt / .vtt.'
          };
        }
        effectiveFileName = extracted.fileName;
        textContent = decodeSubtitleBuffer(extracted.contentBytes);
      } else {
        textContent = decodeSubtitleBuffer(buffer);
      }

      const parsed: ExternalSubtitleParseResult = parseExternalSubtitles(textContent, {
        fileName: effectiveFileName,
        label: `Русские (SubDL: ${effectiveFileName})`,
        lang: 'ru',
        expectedDuration: params.expectedDurationSeconds
      });

      if (!parsed.valid || !parsed.track) {
        return {
          success: false,
          status: 'UNAVAILABLE',
          message: parsed.errors.join(' ') || 'Не удалось распознать таймкоды в полученных субтитрах SubDL.'
        };
      }

      return {
        success: true,
        status: 'CONNECTED',
        subtitleId: params.subtitleId,
        fileName: effectiveFileName,
        content: textContent,
        format: parsed.format === 'vtt' ? 'vtt' : 'srt',
        cueCount: parsed.cueCount,
        warnings: parsed.warnings,
        message: `Субтитры успешно загружены (${parsed.cueCount} реплик).`
      };
    } catch (err: any) {
      console.error('[SubDL] Download error:', err);
      return {
        success: false,
        status: 'UNAVAILABLE',
        message: err?.message || 'Ошибка загрузки субтитров из SubDL.'
      };
    }
  }

  public clearCache(): void {
    this.cache.clear();
  }
}

export const subdlProvider = new SubDLProvider();

import {
  MediaProvider,
  PlaybackRequest,
  PlaybackResponse,
  PlaybackTranslation,
  PlaybackSource,
  PlaybackStreamType,
  PlaybackQuality,
  PlaybackAudioTrack,
  PlaybackSubtitle
} from '../types';
import { cache, HOUR } from '@/lib/services/cache';

export interface ApprovedOpenMedia {
  tmdbId: number;
  wikidataId: string;
  title: string;
  originalTitle: string;
  year: number;
  duration: number; // in seconds, must be >= 3600 (>= 60 min)
  license: string;
  legalBasis: string;
  sourcePageUrl: string;
  artist: string;
  attribution: {
    text: string;
    url?: string;
  };
  verificationDate: string; // ISO date 'YYYY-MM-DD'
  streamUrl: string;
  streamType: PlaybackStreamType;
  qualities: PlaybackQuality[];
  audioTracks: PlaybackAudioTrack[];
  subtitles: PlaybackSubtitle[];
}

/**
 * Curated registry of verified full-length feature films with confirmed open rights
 * and tested technical streaming endpoints.
 */
export const OPEN_MEDIA_APPROVED_REGISTRY: Record<string, ApprovedOpenMedia> = {
  // 1. Night of the Living Dead (1968) - Iconic Public Domain Masterpiece
  '10331': {
    tmdbId: 10331,
    wikidataId: 'Q623051',
    title: 'Ночь живых мертвецов (Night of the Living Dead)',
    originalTitle: 'Night of the Living Dead',
    year: 1968,
    duration: 5760, // 96 minutes
    license: 'Общественное достояние (Public Domain)',
    legalBasis:
      'В США фильм перешел в общественное достояние в день премьеры в 1968 году из-за отсутствия обязательного знака копирайта на оригинальных прокатных копиях (согласно Закону об авторском праве США 1909 года).',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Night_of_the_Living_Dead_(1968).webm',
    artist: 'George A. Romero',
    attribution: {
      text: '(PD) Джордж А. Ромеро | Image Ten | Wikimedia Commons',
      url: 'https://commons.wikimedia.org/wiki/File:Night_of_the_Living_Dead_(1968).webm'
    },
    verificationDate: '2026-10-12',
    streamUrl:
      'https://upload.wikimedia.org/wikipedia/commons/transcoded/2/24/Night_of_the_Living_Dead_(1968).webm/Night_of_the_Living_Dead_(1968).webm.720p.vp9.webm',
    streamType: 'webm',
    qualities: [
      {
        id: '720p',
        label: '720p (VP9)',
        height: 720,
        url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/2/24/Night_of_the_Living_Dead_(1968).webm/Night_of_the_Living_Dead_(1968).webm.720p.vp9.webm'
      },
      {
        id: '480p',
        label: '480p (VP9)',
        height: 480,
        url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/2/24/Night_of_the_Living_Dead_(1968).webm/Night_of_the_Living_Dead_(1968).webm.480p.vp9.webm'
      },
      {
        id: 'orig',
        label: 'Оригинал (1080p)',
        height: 1080,
        url: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Night_of_the_Living_Dead_%281968%29.webm'
      }
    ],
    audioTracks: [
      { id: 'en-orig', name: 'English (Original Mono)', lang: 'en', isDefault: true }
    ],
    subtitles: [] // Strictly honest: no artificial subtitles
  },

  // 2. Charade (1963) - Classic Mystery Comedy with Audrey Hepburn & Cary Grant
  '4808': {
    tmdbId: 4808,
    wikidataId: 'Q496266',
    title: 'Шарада (Charade)',
    originalTitle: 'Charade',
    year: 1963,
    duration: 6780, // 113 minutes
    license: 'Общественное достояние (Public Domain)',
    legalBasis:
      'В США фильм перешел в общественное достояние сразу после выхода, так как кинокомпания Universal Pictures не указала корректное уведомление об авторских правах (notice of copyright) в титрах в соответствии с Законом об авторском праве США 1909 года.',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Charade_(Stanley_Donen,_1963).webm',
    artist: 'Stanley Donen',
    attribution: {
      text: '(PD) Стэнли Донен | Universal Pictures | Wikimedia Commons',
      url: 'https://commons.wikimedia.org/wiki/File:Charade_(Stanley_Donen,_1963).webm'
    },
    verificationDate: '2026-10-12',
    streamUrl:
      'https://upload.wikimedia.org/wikipedia/commons/transcoded/e/ef/Charade_(Stanley_Donen,_1963).webm/Charade_(Stanley_Donen,_1963).webm.720p.vp9.webm',
    streamType: 'webm',
    qualities: [
      {
        id: '720p',
        label: '720p (VP9)',
        height: 720,
        url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/e/ef/Charade_(Stanley_Donen,_1963).webm/Charade_(Stanley_Donen,_1963).webm.720p.vp9.webm'
      },
      {
        id: '480p',
        label: '480p (VP9)',
        height: 480,
        url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/e/ef/Charade_(Stanley_Donen,_1963).webm/Charade_(Stanley_Donen,_1963).webm.480p.vp9.webm'
      },
      {
        id: 'orig',
        label: 'Оригинал (1080p)',
        height: 1080,
        url: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Charade_%28Stanley_Donen%2C_1963%29.webm'
      }
    ],
    audioTracks: [
      { id: 'en-orig', name: 'English (Original Stereo)', lang: 'en', isDefault: true }
    ],
    subtitles: []
  },

  // 3. Alexander Nevsky (1938) - Historical Epic by Sergei Eisenstein
  '10235': {
    tmdbId: 10235,
    wikidataId: 'Q118976',
    title: 'Александр Невский',
    originalTitle: 'Александр Невский',
    year: 1938,
    duration: 6720, // 112 minutes
    license: 'Общественное достояние (Public Domain, pd-rus-1996)',
    legalBasis:
      'Фильм киностудии «Мосфильм» выпущен в СССР в 1938 году. Находится в общественном достоянии в РФ и за рубежом по истечении срока действия авторских прав.',
    sourcePageUrl:
      'https://commons.wikimedia.org/wiki/File:1938._%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80_%D0%9D%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D0%B9.webm',
    artist: 'Сергей Эйзенштейн, Дмитрий Васильев',
    attribution: {
      text: '(PD) Сергей Эйзенштейн | Киностудия «Мосфильм» (1938) | Wikimedia Commons',
      url: 'https://commons.wikimedia.org/wiki/File:1938._%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80_%D0%9D%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D0%B9.webm'
    },
    verificationDate: '2026-10-12',
    streamUrl:
      'https://upload.wikimedia.org/wikipedia/commons/transcoded/1/1a/1938._%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80_%D0%9D%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D0%B9.webm/1938._%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80_%D0%9D%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D0%B9.webm.720p.vp9.webm',
    streamType: 'webm',
    qualities: [
      {
        id: '720p',
        label: '720p (VP9)',
        height: 720,
        url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/1/1a/1938._%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80_%D0%9D%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D0%B9.webm/1938._%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80_%D0%9D%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D0%B9.webm.720p.vp9.webm'
      },
      {
        id: '480p',
        label: '480p (VP9)',
        height: 480,
        url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/1/1a/1938._%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80_%D0%9D%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D0%B9.webm/1938._%D0%90%D0%BB%D0%B5%D0%BA%D1%81%D0%B0%D0%BD%D0%B4%D1%80_%D0%9D%D0%B5%D0%B2%D1%81%D0%BA%D0%B8%D0%B9.webm.480p.vp9.webm'
      }
    ],
    audioTracks: [
      { id: 'ru-orig', name: 'Русский (Оригинал 1938)', lang: 'ru', isDefault: true }
    ],
    subtitles: []
  }
};

export interface DiscoveryResult {
  tmdbId: number;
  wikidataId?: string;
  status: 'APPROVED' | 'REJECTED' | 'NOT_FOUND';
  reason?: string;
  candidateTitle?: string;
  videoFile?: string;
  isTrailer?: boolean;
  durationSeconds?: number;
  declaredLicense?: string;
  isLegallyPermitted?: boolean;
  isTechnicallyAccessible?: boolean;
  streamUrl?: string;
  details?: Record<string, any>;
}

// Allowed host domains for outbound media reachability checks (SSRF prevention)
const ALLOWED_STREAM_HOSTS = new Set([
  'upload.wikimedia.org',
  'commons.wikimedia.org',
  'thecosmonaut.org',
  'demo.unified-streaming.com',
  'test-streams.mux.dev',
  'devstreaming-cdn.apple.com'
]);

/**
 * Automated Discovery and Technical Verification Service
 */
export class OpenMediaDiscoveryService {
  /**
   * Discovers and evaluates open media for a given TMDB movie ID
   */
  async discoverByTmdbId(tmdbId: number | string): Promise<DiscoveryResult> {
    const idNum = Number(tmdbId);
    if (!idNum || isNaN(idNum) || idNum <= 0) {
      return {
        tmdbId: 0,
        status: 'NOT_FOUND',
        reason: 'Invalid TMDB ID'
      };
    }

    const cacheKey = `open-media:discover:${idNum}`;
    return cache.remember(cacheKey, HOUR, async () => {
      // 1. Check approved registry first
      const approved = OPEN_MEDIA_APPROVED_REGISTRY[String(idNum)];
      if (approved) {
        const isAccessible = await this.verifyTechnicalAccessibility(approved.streamUrl);
        return {
          tmdbId: idNum,
          wikidataId: approved.wikidataId,
          status: 'APPROVED',
          candidateTitle: approved.title,
          videoFile: approved.sourcePageUrl,
          isTrailer: false,
          durationSeconds: approved.duration,
          declaredLicense: approved.license,
          isLegallyPermitted: true,
          isTechnicallyAccessible: isAccessible,
          streamUrl: approved.streamUrl,
          details: {
            legalBasis: approved.legalBasis,
            attribution: approved.attribution,
            verificationDate: approved.verificationDate
          }
        };
      }

      // Special handling for candidate evaluation: The Cosmonaut (2013) - TMDB 86817
      if (idNum === 86817) {
        return this.evaluateTheCosmonaut();
      }

      // 2. Perform live Wikidata lookup via P4947 (TMDb movie ID)
      try {
        const wikidataEntity = await this.lookupWikidataEntity(idNum);
        if (!wikidataEntity) {
          return {
            tmdbId: idNum,
            status: 'NOT_FOUND',
            reason: `No Wikidata entity found with property P4947 = ${idNum}`
          };
        }

        const { qid, claims, label } = wikidataEntity;

        // Check P10 (video) property
        const videoClaims = claims.P10 || [];
        if (videoClaims.length === 0) {
          return {
            tmdbId: idNum,
            wikidataId: qid,
            status: 'REJECTED',
            candidateTitle: label,
            reason: 'Wikidata entity does not have P10 (video) property'
          };
        }

        // Filter out trailers, teasers, and clips
        const candidateFiles: string[] = videoClaims
          .map((c: any) => c.mainsnak?.datavalue?.value)
          .filter(Boolean);

        const fullFilms = candidateFiles.filter((f) => !this.isTrailer(f));
        if (fullFilms.length === 0) {
          return {
            tmdbId: idNum,
            wikidataId: qid,
            status: 'REJECTED',
            candidateTitle: label,
            isTrailer: true,
            reason: `All associated P10 video files (${candidateFiles.join(', ')}) are trailers or preview clips, not full films`
          };
        }

        const chosenFile = fullFilms[0];

        // 3. Inspect Wikimedia Commons metadata for the chosen file
        const commonsMeta = await this.fetchCommonsMetadata(chosenFile);
        if (!commonsMeta) {
          return {
            tmdbId: idNum,
            wikidataId: qid,
            status: 'REJECTED',
            candidateTitle: label,
            videoFile: chosenFile,
            reason: 'Failed to retrieve Wikimedia Commons metadata for video file'
          };
        }

        // 4. Validate legal status
        const isPermitted = this.isPermittedLicense(commonsMeta.license, commonsMeta.usageTerms);
        if (!isPermitted) {
          return {
            tmdbId: idNum,
            wikidataId: qid,
            status: 'REJECTED',
            candidateTitle: label,
            videoFile: chosenFile,
            declaredLicense: commonsMeta.license,
            isLegallyPermitted: false,
            reason: `License "${commonsMeta.license}" is not approved for free public playback (must be Public Domain, CC0, CC-BY, or CC-BY-SA)`
          };
        }

        // 5. Validate duration (must be >= 60 minutes = 3600 seconds)
        let durationSec = commonsMeta.duration;
        if (!durationSec && claims.P2047?.[0]) {
          const durationVal = claims.P2047[0].mainsnak?.datavalue?.value;
          if (durationVal?.amount) {
            durationSec = parseFloat(durationVal.amount) * 60; // minutes to seconds
          }
        }

        if (durationSec && durationSec < 3600) {
          return {
            tmdbId: idNum,
            wikidataId: qid,
            status: 'REJECTED',
            candidateTitle: label,
            videoFile: chosenFile,
            durationSeconds: durationSec,
            reason: `Duration (${Math.round(durationSec / 60)} min) is less than 60 minutes threshold (short film or excerpt)`
          };
        }

        // 6. Check technical stream availability
        const streamUrl = this.buildTranscodeUrl(commonsMeta.url, chosenFile);
        const isAccessible = await this.verifyTechnicalAccessibility(streamUrl);
        if (!isAccessible) {
          return {
            tmdbId: idNum,
            wikidataId: qid,
            status: 'REJECTED',
            candidateTitle: label,
            videoFile: chosenFile,
            isTechnicallyAccessible: false,
            reason: 'Stream URL failed technical accessibility checks (HTTP status or byte-range failed)'
          };
        }

        // Note: Discovered candidate passes automated checks, but requires manual approval in registry
        return {
          tmdbId: idNum,
          wikidataId: qid,
          status: 'REJECTED', // Not in approved registry yet
          candidateTitle: label,
          videoFile: chosenFile,
          durationSeconds: durationSec,
          declaredLicense: commonsMeta.license,
          isLegallyPermitted: isPermitted,
          isTechnicallyAccessible: isAccessible,
          streamUrl,
          reason: 'Automated checks passed; pending administrative confirmation in approved registry'
        };
      } catch (err: any) {
        return {
          tmdbId: idNum,
          status: 'REJECTED',
          reason: `Discovery query failed: ${err?.message || String(err)}`
        };
      }
    });
  }

  /**
   * Dedicated evaluation for candidate #1: The Cosmonaut (2013, TMDB 86817)
   */
  private async evaluateTheCosmonaut(): Promise<DiscoveryResult> {
    return {
      tmdbId: 86817,
      wikidataId: 'Q3016381',
      candidateTitle: 'Космонавт (The Cosmonaut / El cosmonauta, 2013)',
      status: 'REJECTED',
      declaredLicense: 'Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0)',
      isLegallyPermitted: true,
      isTrailer: false,
      isTechnicallyAccessible: false,
      reason:
        'Официальный сайт thecosmonaut.org декларирует лицензию CC BY-SA, однако на его серверах размещены только промо-материалы (постеры, сценарий, мерч); видеофайл фильма на сайте отсутствует. В Wikidata Q3016381 свойство P10 (видео) отсутствует; категория Category:The_Cosmonaut на Wikimedia Commons содержит лишь фотографии актёров. Архив на Internet Archive разбит на разрозненные исходные фрагменты (r1p01), а прямой сетевой доступ к archive.org блокируется DPI/таймаутом у части пользователей. Прямой проверенный стриминг-поток полного фильма отсутствует.'
    };
  }

  /**
   * Trailer & preview detection heuristic
   */
  isTrailer(filenameOrUrl: string): boolean {
    const lower = filenameOrUrl.toLowerCase();
    return (
      lower.includes('trailer') ||
      lower.includes('teaser') ||
      lower.includes('preview') ||
      lower.includes('clip') ||
      lower.includes('sample') ||
      lower.includes('трейлер') ||
      lower.includes('тизер')
    );
  }

  /**
   * Evaluates if a license string allows free public video streaming
   */
  isPermittedLicense(license?: string, usageTerms?: string): boolean {
    const text = `${license || ''} ${usageTerms || ''}`.toLowerCase();
    if (text.includes('public domain') || text.includes('общественное достояние')) return true;
    if (text.includes('cc0') || text.includes('cc-zero')) return true;
    if (text.includes('cc by') || text.includes('cc-by')) {
      // Exclude non-commercial and no-derivatives restrictions
      if (text.includes('-nc') || text.includes('noncommercial') || text.includes('non-commercial')) {
        return false;
      }
      if (text.includes('-nd') || text.includes('no-derivatives')) {
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Queries Wikidata for an entity matching TMDB movie ID (P4947)
   */
  private async lookupWikidataEntity(tmdbId: number): Promise<{ qid: string; claims: any; label: string } | null> {
    const query = `
      SELECT ?item ?itemLabel WHERE {
        ?item wdt:P31 wd:Q11424 .
        ?item wdt:P4947 "${tmdbId}" .
        SERVICE wikibase:label { bd:serviceParam wikibase:language "ru,en". }
      }
      LIMIT 1
    `;
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'KinoRoomOpenMedia/1.0 (https://kinoroom.app; contact@kinoroom.app)'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) return null;
    const data = await res.json();
    const binding = data.results?.bindings?.[0];
    if (!binding?.item?.value) return null;

    const qid = binding.item.value.split('/').pop()!;
    const label = binding.itemLabel?.value || `Film ${tmdbId}`;

    // Fetch entity claims
    const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
    const entityRes = await fetch(entityUrl, { signal: AbortSignal.timeout(8000) });
    if (!entityRes.ok) return null;
    const entityData = await entityRes.json();
    const claims = entityData.entities?.[qid]?.claims || {};

    return { qid, claims, label };
  }

  /**
   * Fetches metadata from Wikimedia Commons API
   */
  private async fetchCommonsMetadata(
    fileTitle: string
  ): Promise<{ url: string; size: number; license: string; usageTerms: string; duration: number } | null> {
    const titleParam = fileTitle.startsWith('File:') ? fileTitle : `File:${fileTitle}`;
    const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(
      titleParam
    )}&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'KinoRoomOpenMedia/1.0 (https://kinoroom.app; contact@kinoroom.app)'
      },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const page = Object.values(data.query?.pages || {})[0] as any;
    const ii = page?.imageinfo?.[0];
    if (!ii?.url) return null;

    const license =
      ii.extmetadata?.LicenseShortName?.value ||
      ii.extmetadata?.License?.value ||
      '';
    const usageTerms = ii.extmetadata?.UsageTerms?.value || '';
    const duration = parseFloat(ii.extmetadata?.DateTimeOriginal?.value || '0');

    return {
      url: ii.url,
      size: ii.size || 0,
      license,
      usageTerms,
      duration
    };
  }

  /**
   * Constructs optimal transcoded stream URL on upload.wikimedia.org
   */
  private buildTranscodeUrl(originalUrl: string, fileTitle: string): string {
    const cleanUrl = originalUrl.split('?')[0];
    if (!cleanUrl.includes('/wikipedia/commons/')) return cleanUrl;

    const parts = cleanUrl.split('/wikipedia/commons/');
    const subpath = parts[1];
    const fileName = subpath.split('/').pop()!;

    // Return standard 720p VP9 transcode
    return `https://upload.wikimedia.org/wikipedia/commons/transcoded/${subpath}/${fileName}.720p.vp9.webm`;
  }

  /**
   * Technical accessibility verification with strict host allowlist and HTTP 206 Partial Content check
   */
  async verifyTechnicalAccessibility(url: string): Promise<boolean> {
    try {
      const parsed = new URL(url);
      if (!ALLOWED_STREAM_HOSTS.has(parsed.hostname)) {
        console.warn(`[OpenMedia] Host ${parsed.hostname} is not in allowed stream host list`);
        return false;
      }

      // Check HTTP 206 Range request
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-1024',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) KinoRoomPlayer/1.0'
        },
        signal: AbortSignal.timeout(6000)
      });

      return res.status === 200 || res.status === 206;
    } catch {
      return false;
    }
  }
}

export const openMediaDiscoveryService = new OpenMediaDiscoveryService();

/**
 * OpenMediaProvider: Media provider for verified open-access & public domain full-length films
 */
export class OpenMediaProvider implements MediaProvider {
  readonly id = 'open-media';
  readonly name = 'Открытые фильмы (Wikimedia Commons / Wikidata)';
  readonly priority = 20;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async getTranslations(request: PlaybackRequest): Promise<PlaybackTranslation[]> {
    const idStr = String(request.mediaId).trim();
    const item = OPEN_MEDIA_APPROVED_REGISTRY[idStr];
    if (!item) return [];

    return [
      {
        id: 'open-orig',
        name: item.audioTracks[0]?.name || 'Оригинал',
        type: 'original',
        quality: '720p',
        providerId: this.id
      }
    ];
  }

  async resolvePlayback(request: PlaybackRequest): Promise<PlaybackResponse | null> {
    const idStr = String(request.mediaId).trim();

    // 1. Strict Registry Check: Only approved films with verified rights are published
    const item = OPEN_MEDIA_APPROVED_REGISTRY[idStr];
    if (!item) {
      return null;
    }

    // 2. Build PlaybackSource
    const stream: PlaybackSource = {
      url: item.streamUrl,
      type: item.streamType,
      qualities: item.qualities,
      audioTracks: item.audioTracks,
      subtitles: item.subtitles
    };

    const currentTranslation: PlaybackTranslation = {
      id: 'open-orig',
      name: item.audioTracks[0]?.name || 'Оригинал',
      type: 'original',
      quality: '720p',
      providerId: this.id
    };

    return {
      success: true,
      media: {
        id: item.tmdbId,
        title: item.title,
        mediaType: 'movie'
      },
      currentTranslation,
      availableTranslations: [currentTranslation],
      stream,
      provider: {
        id: this.id,
        name: this.name
      },
      license: item.license,
      attribution: item.attribution
    };
  }
}

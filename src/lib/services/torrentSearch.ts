import type { TorrentSearchResult } from '@/lib/types';
import { cleanTorrentQuery, DEFAULT_TRACKERS, enrichMagnet, detectTranslation } from './torrentUtils';
import { searchJackett, normalizeInfoHash } from './jackett';

export interface TorrentSearchOptions {
  query: string;
  originalTitle?: string;
  year?: number;
  type?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  imdbId?: string;
  includeCam?: boolean;
  timeoutMs?: number;
}

export class BoundedMemoryCache<T> {
  private maxItems: number;
  private ttlMs: number;
  private cache = new Map<string, { value: T; expiresAt: number }>();

  constructor(maxItems = 200, ttlMs = 10 * 60 * 1000) {
    this.maxItems = maxItems;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    // Refresh LRU position
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxItems) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Global bounded search cache to avoid hammering trackers on page navigation
const searchResultsCache = new BoundedMemoryCache<TorrentSearchResult[]>(200, 10 * 60 * 1000);

export function isCamOrTs(title: string): boolean {
  return /\b(camrip|cam|ts|telesync|tele-sync|hdts|tc|hdtc|telecine|tele-cine|dvdscr|scr|hdcam|workprint|wp)\b/i.test(title) ||
    /(?:^|[^\p{L}\p{N}])(камрип|экранка|звук\s*с\s*ts)(?:$|[^\p{L}\p{N}])/iu.test(title);
}

export function isTrailerOrSample(title: string): boolean {
  return /(?:^|[^\p{L}\p{N}])(трейлер|тизер|отрывок|trailer|teaser|sample|promotional)(?:$|[^\p{L}\p{N}])/iu.test(title);
}

export function isIrrelevantCategory(title: string, category?: string): boolean {
  const isExcludedTitle = /(?:^|[^\p{L}\p{N}])(soundtrack|ost|саундтрек|аудиокнига|audiobook|книга|комикс|игра|game)(?:$|[^\p{L}\p{N}])/iu.test(title);
  if (isExcludedTitle) return true;

  if (category) {
    const cat = category.toLowerCase();
    if (/(?:^|[^\p{L}\p{N}])(soundtrack|audio|music|музыка|book|книги|game|игры)(?:$|[^\p{L}\p{N}])/iu.test(cat)) {
      return true;
    }
  }
  return false;
}

export function isYearMatch(title: string, expectedYear?: number): boolean {
  if (!expectedYear) return true;

  // Extract all 4-digit years between 1900 and 2099 from the title
  const matches = title.match(/\b(19\d\d|20\d\d)\b/g);
  if (!matches || matches.length === 0) {
    return true; // No explicit year mentioned in title, do not reject
  }

  const parsedYears = matches.map((y) => parseInt(y, 10));
  // Allow +/- 1 year tolerance for international release date shifts
  return parsedYears.some((y) => Math.abs(y - expectedYear) <= 1);
}

export function isTvSeasonMatch(title: string, expectedSeason?: number): boolean {
  if (expectedSeason === undefined) return true;

  const t = title.toLowerCase();

  // 1. Check multi-season ranges: e.g. "Сезоны 1-4", "сезон 1-2", "s01-s03", "s01-03", "seasons 1-2"
  const multiMatches = [
    ...t.matchAll(/(?:сезоны?|seasons?)\s*[:\s]*0?(\d+)\s*[-–]\s*(?:сезоны?|seasons?)?\s*0?(\d+)/gi),
    ...t.matchAll(/\bs0?(\d+)\s*[-–]\s*s?0?(\d+)\b/gi)
  ];

  if (multiMatches.length > 0) {
    for (const m of multiMatches) {
      const start = parseInt(m[1], 10);
      const end = parseInt(m[2], 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        if (start <= expectedSeason && expectedSeason <= end) {
          return true;
        }
      }
    }
    // If multi-season range was explicitly specified and none covered expectedSeason, reject
    return false;
  }

  // 2. Check single season mentions:
  // e.g. "Сезон 1", "1 сезон", "S02", "S02E05", "02x05", "Сезон: 1"
  const singleMatches = [
    ...t.matchAll(/(?:сезон|season)\s*[:\s]*0?(\d+)(?:$|[^\p{L}\p{N}])/giu),
    ...t.matchAll(/(?:^|[^\p{L}\p{N}])0?(\d+)\s*сезон/giu),
    ...t.matchAll(/\bs0?(\d+)(?=[ex\s._\-\[\(]|\b|$)/gi),
    ...t.matchAll(/\b0?(\d+)x\d+\b/gi)
  ];

  if (singleMatches.length > 0) {
    const seasonsFound = singleMatches
      .map((m) => parseInt(m[1], 10))
      .filter((n) => !isNaN(n));

    if (seasonsFound.length > 0) {
      return seasonsFound.includes(expectedSeason);
    }
  }

  // No specific season mentioned in title: keep as general series release
  return true;
}

export function isTvEpisodeMatch(title: string, expectedEpisode?: number): boolean {
  if (expectedEpisode === undefined) return true;

  const t = title.toLowerCase();

  // 1. Episode ranges:
  // e.g. "s01e01-e08", "s01e01-08", "e01-08", "серии 1-8", "1-8 серии", "[01-08 из 08]", "(1-8 из 8)"
  const rangePatterns = [
    // s01e01-e08, s01e01-08, e01-e08, e01-08
    /(?:s\d+)?[ex]0?(\d{1,3})\s*[-–]\s*(?:[ex]0?)?(\d{1,3})/gi,
    // 01x01-08, 01x01-x08
    /\d+x0?(\d{1,3})\s*[-–]\s*(?:x0?)?(\d{1,3})/gi,
    // "серии 1-8", "серий 1-8", "эпизоды 1-8"
    /(?:сери[яие]|серий|эпизод[а-я]*|episodes?)\s*[:\s]*0?(\d{1,3})\s*[-–]\s*0?(\d{1,3})/giu,
    // "1-8 серии", "01-08 серий", "1-8 эпизоды"
    /(?:^|[^\p{L}\p{N}])0?(\d{1,3})\s*[-–]\s*0?(\d{1,3})\s*(?:сери[яие]|серий|эпизод[а-я]*|выпуск[а-я]*)/giu,
    // "[01-08 из 08]", "(1-8 из 8)", "(1-8)"
    /[\[\(]\s*0?(\d{1,3})\s*[-–]\s*0?(\d{1,3})\s*(?:[а-яa-z\s]+)?(?:из\s*\d+)?\s*[\]\)]/giu
  ];

  const foundRanges: Array<{ start: number; end: number }> = [];
  for (const regex of rangePatterns) {
    for (const match of t.matchAll(regex)) {
      const start = parseInt(match[1], 10);
      const end = parseInt(match[2], 10);
      if (!isNaN(start) && !isNaN(end) && start <= end) {
        foundRanges.push({ start, end });
      }
    }
  }

  if (foundRanges.length > 0) {
    // If any explicit range includes the requested episode, it's a match!
    const matchesAnyRange = foundRanges.some(
      (r) => r.start <= expectedEpisode && expectedEpisode <= r.end
    );
    return matchesAnyRange;
  }

  // 2. Single episode mentions:
  // e.g. "s01e03", "01x03", "e03", "3 серия", "3-я серия", "серия 3", "[03 из 12]"
  const singlePatterns = [
    // s01e03, e03, e3
    /(?:s\d+)?[ex]0?(\d{1,3})(?:$|[^\p{L}\p{N}])/giu,
    // 01x03, 1x03
    /\d+x0?(\d{1,3})\b/gi,
    // "[03 из 12]", "(03 из 12)", "[03/12]"
    /[\[\(]\s*0?(\d{1,3})\s*(?:из|\/)\s*\d+\s*[\]\)]/gi,
    // "серия 3", "эпизод 3", "серия: 3", "серия 03"
    /(?:сери[яю]|эпизод|episode)\s*[:\s]*0?(\d{1,3})(?:$|[^\p{L}\p{N}])/giu,
    // "3 серия", "3-я серия", "03-я серия"
    /(?:^|[^\p{L}\p{N}])0?(\d{1,3})\s*[-–]?(?:я|ая)?\s*сери[яю](?:$|[^\p{L}\p{N}])/giu
  ];

  const foundEpisodes: number[] = [];
  for (const regex of singlePatterns) {
    for (const match of t.matchAll(regex)) {
      const ep = parseInt(match[1], 10);
      if (!isNaN(ep)) {
        foundEpisodes.push(ep);
      }
    }
  }

  if (foundEpisodes.length > 0) {
    return foundEpisodes.includes(expectedEpisode);
  }

  // 3. Neither specific episode nor conflicting episode range found in title.
  // This is a season pack (e.g. "Сезон 1", "S01", "Сезоны 1-5") or complete series.
  // Season packs contain all episodes, so preserve them!
  return true;
}


/**
 * Merges search results having the same normalized infohash while preserving distinct releases
 */
export function deduplicateTorrentResults(results: TorrentSearchResult[]): TorrentSearchResult[] {
  const mapByHash = new Map<string, TorrentSearchResult>();
  const itemsWithoutHash: TorrentSearchResult[] = [];

  for (const item of results) {
    const hash = item.infoHash ? normalizeInfoHash(item.infoHash) : normalizeInfoHash(item.magnet);
    if (hash) {
      const existing = mapByHash.get(hash);
      if (existing) {
        // Merge identical swarm release across multiple trackers
        const existingTrackers = (existing.tracker || '').split(/,\s*/).map((s) => s.trim()).filter(Boolean);
        const newTrackers = (item.tracker || '').split(/,\s*/).map((s) => s.trim()).filter(Boolean);
        const combined = Array.from(new Set([...existingTrackers, ...newTrackers])).join(', ');
        existing.tracker = combined || existing.tracker;

        existing.seeds = Math.max(existing.seeds, item.seeds);
        existing.peers = Math.max(existing.peers, item.peers);

        if (!existing.quality || existing.quality === 'HD') {
          existing.quality = item.quality || existing.quality;
        }
        if (!existing.translation && item.translation) {
          existing.translation = item.translation;
        }
        if (!existing.downloadUrl && item.downloadUrl) {
          existing.downloadUrl = item.downloadUrl;
        }
        if (item.magnet.startsWith('magnet:') && (!existing.magnet.startsWith('magnet:') || item.magnet.length > existing.magnet.length)) {
          existing.magnet = item.magnet;
        }
      } else {
        item.infoHash = hash;
        mapByHash.set(hash, { ...item });
      }
    } else {
      const existingSameMagnet = itemsWithoutHash.find((it) => it.magnet === item.magnet);
      if (existingSameMagnet) {
        existingSameMagnet.seeds = Math.max(existingSameMagnet.seeds, item.seeds);
        existingSameMagnet.peers = Math.max(existingSameMagnet.peers, item.peers);
      } else {
        itemsWithoutHash.push({ ...item });
      }
    }
  }

  return [...mapByHash.values(), ...itemsWithoutHash];
}

/**
 * Computes release ranking score based on quality, seeders, audio, and container
 */
export function computeReleaseScore(item: TorrentSearchResult): number {
  let score = 0;

  // Quality preference
  if (item.quality === '1080p') score += 100;
  else if (item.quality === '4K UHD') score += 95;
  else if (item.quality === '720p') score += 65;
  else if (item.quality === 'WEB-DL') score += 55;
  else if (item.quality === 'BDRip') score += 45;
  else score += 20;

  // Container & source heuristic bonus
  if (/\b(web-dl|webrip)\b/i.test(item.title)) score += 25;
  if (/\b(bdrip|bluray|blu-ray|remux)\b/i.test(item.title)) score += 20;

  // Seeders: availability is essential for smooth playback
  if (item.seeds > 0) {
    score += Math.min(60, Math.round(Math.log10(item.seeds + 1) * 30));
  } else {
    score -= 100;
  }

  // Declared voiceover/translation bonus
  if (item.translation) {
    score += 15;
  }

  return score;
}

/**
 * Direct scraper for Rutor mirrors (working backup provider)
 */
async function fetchFromRutorInternal(query: string, timeoutMs = 7000): Promise<TorrentSearchResult[]> {
  const clean = cleanTorrentQuery(query);
  if (!clean) return [];

  const mirrors = [
    `https://rutor.info/search/0/0/0/0/${encodeURIComponent(clean)}`,
    `https://rutor.is/search/0/0/0/0/${encodeURIComponent(clean)}`
  ];

  for (const url of mirrors) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!res.ok) continue;

      const html = await res.text();
      const rows = html.split(/<tr class="(?:gai|tum)">/);
      if (rows.length <= 1) continue;

      const results: TorrentSearchResult[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const magnetMatch = row.match(/href="(magnet:\?xt=[^"]+)"/);
        const titleMatch = row.match(/<a href="\/torrent\/\d+\/[^"]*">([^<]+)<\/a>/);
        const sizeMatch = row.match(/<td align="right">(?:<span[^>]*>)?([^<]+(?:GB|MB|KB|ГБ|МБ|КБ|B|Б))(?:<\/span>)?<\/td>/i);
        const seedsMatch = row.match(/<span class="green">.*?(\d+).*?<\/span>/);
        const peersMatch = row.match(/<span class="red">.*?(\d+).*?<\/span>/);

        if (magnetMatch && titleMatch) {
          const rawTitle = titleMatch[1].replace(/&nbsp;/g, ' ').trim();
          const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : 0;
          const peers = peersMatch ? parseInt(peersMatch[1], 10) : 0;
          const size = sizeMatch ? sizeMatch[1].replace(/&nbsp;/g, ' ').trim() : 'N/A';

          let quality = 'HD';
          if (/2160p|4k|uhd/i.test(rawTitle)) quality = '4K UHD';
          else if (/1080p|bdrip\s*1080|1080i/i.test(rawTitle)) quality = '1080p';
          else if (/720p/i.test(rawTitle)) quality = '720p';
          else if (/bdrip|dvdrip/i.test(rawTitle)) quality = 'BDRip';
          else if (/web-dl|webrip/i.test(rawTitle)) quality = 'WEB-DL';

          const translation = detectTranslation(rawTitle);
          const magnet = enrichMagnet(magnetMatch[1]);
          const infoHash = normalizeInfoHash(magnet);

          results.push({
            title: rawTitle,
            magnet,
            size,
            seeds,
            peers,
            tracker: 'Rutor',
            quality,
            translation,
            infoHash: infoHash || undefined,
            sourceType: 'magnet'
          });
        }
      }

      return results;
    } catch {
      continue;
    }
  }

  return [];
}

/**
 * Unified multi-source search orchestrator:
 * - Queries Jackett (RuTracker, NNM-Club) and Rutor concurrently
 * - Merges duplicates by normalized infohash
 * - Filters CAM/TS, trailers, irrelevant categories, wrong year and season
 * - Ranks results by quality, seed count, and voiceover
 * - Utilizes bounded LRU in-memory cache
 */
export async function searchTorrentsUnified(options: TorrentSearchOptions): Promise<TorrentSearchResult[]> {
  const {
    query,
    originalTitle,
    year,
    type = 'movie',
    season,
    episode,
    imdbId,
    includeCam = false,
    timeoutMs = 7000
  } = options;

  const cleanQuery = cleanTorrentQuery(query);
  if (!cleanQuery && !originalTitle) {
    return [];
  }

  // Check bounded cache
  const cacheKey = JSON.stringify({
    q: cleanQuery.toLowerCase(),
    orig: (originalTitle || '').toLowerCase(),
    year,
    type,
    season,
    episode,
    imdbId,
    includeCam
  });

  const cached = searchResultsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Build search query variations
  const searchQueries: string[] = [];

  if (cleanQuery) {
    if (type === 'tv' && season !== undefined) {
      if (episode !== undefined) {
        searchQueries.push(`${cleanQuery} s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`);
      }
      searchQueries.push(`${cleanQuery} s${String(season).padStart(2, '0')}`);
      searchQueries.push(`${cleanQuery} сезон ${season}`);
      searchQueries.push(cleanQuery);
    } else if (year && !cleanQuery.includes(String(year))) {
      searchQueries.push(`${cleanQuery} ${year}`);
      searchQueries.push(cleanQuery);
    } else {
      searchQueries.push(cleanQuery);
    }
  }

  if (originalTitle) {
    const cleanOrig = cleanTorrentQuery(originalTitle);
    if (cleanOrig && cleanOrig.toLowerCase() !== cleanQuery.toLowerCase()) {
      if (year && !cleanOrig.includes(String(year))) {
        searchQueries.push(`${cleanOrig} ${year}`);
      }
      searchQueries.push(cleanOrig);
    }
  }

  // Deduplicate search strings
  const uniqueQueries = Array.from(new Set(searchQueries)).slice(0, 3);

  // Execute providers concurrently
  const rawResults: TorrentSearchResult[] = [];

  for (const q of uniqueQueries) {
    const providers = [
      // 1. Jackett (RuTracker, NNM-Club)
      searchJackett(q, {
        timeoutMs,
        year,
        type,
        season,
        episode,
        imdbId
      }).catch(() => []),

      // 2. Rutor backup
      fetchFromRutorInternal(q, timeoutMs).catch(() => [])
    ];

    const batch = await Promise.allSettled(providers);
    for (const b of batch) {
      if (b.status === 'fulfilled' && Array.isArray(b.value)) {
        rawResults.push(...b.value);
      }
    }

    // If primary query yielded a healthy batch of results, skip slower fallback queries
    if (rawResults.length >= 10) {
      break;
    }
  }

  // Step 1: Deduplicate identical releases by normalized infohash
  const deduped = deduplicateTorrentResults(rawResults);

  // Step 2: Filter out CAM/TS, trailers, irrelevant categories, wrong years, wrong seasons
  const filtered = deduped.filter((item) => {
    // CAM/TS filter
    if (!includeCam && isCamOrTs(item.title)) {
      return false;
    }

    // Trailer / sample filter
    if (isTrailerOrSample(item.title)) {
      return false;
    }

    // Irrelevant category filter (audiobooks, soundtracks, games)
    if (isIrrelevantCategory(item.title, item.category)) {
      return false;
    }

    // Year validation
    if (!isYearMatch(item.title, year)) {
      return false;
    }

    // TV season and episode validation
    if (type === 'tv') {
      if (season !== undefined && !isTvSeasonMatch(item.title, season)) {
        return false;
      }
      if (episode !== undefined && !isTvEpisodeMatch(item.title, episode)) {
        return false;
      }
    }

    return true;
  });

  // Step 3: Rank by quality, seeds, and release viability
  filtered.sort((a, b) => computeReleaseScore(b) - computeReleaseScore(a));

  const finalResults = filtered.slice(0, 40);

  // Store in cache
  searchResultsCache.set(cacheKey, finalResults);

  return finalResults;
}

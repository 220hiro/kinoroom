import crypto from 'node:crypto';
import type { TorrentSearchResult } from '@/lib/types';
import { enrichMagnet, detectTranslation, formatBytes } from './torrentUtils';

export interface JackettResultItem {
  FirstSeen?: string;
  Tracker?: string;
  TrackerId?: string;
  CategoryDesc?: string;
  Title?: string;
  Guid?: string;
  Link?: string;
  Comments?: string;
  PublishDate?: string;
  Category?: number[];
  Size?: number;
  Files?: number;
  Grabs?: number;
  Description?: string;
  Seeders?: number;
  Peers?: number;
  InfoHash?: string;
  MagnetUri?: string;
}

export interface JackettResponse {
  Indexers?: Array<{ ID: string; Name: string; Status: number; Results: number; Error?: string | null }>;
  Results?: JackettResultItem[];
}

export interface TorrentDownloadRef {
  token: string;
  privateUrl: string;
  title: string;
  tracker: string;
  infoHash?: string;
  createdAt: number;
}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Cross-process storage & caching for server-side private download references
// Prevents exposing Jackett API keys and private passkeys to the client
const downloadRefCache = new Map<string, TorrentDownloadRef>();
const MAX_DOWNLOAD_REFS = 1000;
const DOWNLOAD_REF_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

const TOKEN_CACHE_DIR = path.join(os.tmpdir(), 'kinoroom_torrent_refs');
try {
  if (!fs.existsSync(TOKEN_CACHE_DIR)) {
    fs.mkdirSync(TOKEN_CACHE_DIR, { recursive: true });
  }
} catch {}

function getServerTokenKey(): Buffer {
  const envSecret = process.env.JACKETT_API_KEY || process.env.NEXTAUTH_SECRET || process.env.TORRENT_TOKEN_SECRET;
  if (envSecret) {
    return crypto.createHash('sha256').update('kinoroom-torrent-ref-key:' + envSecret).digest();
  }
  const secretFile = path.join(os.tmpdir(), '.kinoroom_torrent_key');
  try {
    if (fs.existsSync(secretFile)) {
      return Buffer.from(fs.readFileSync(secretFile, 'utf8'), 'hex');
    }
    const newKey = crypto.randomBytes(32);
    fs.writeFileSync(secretFile, newKey.toString('hex'), 'utf8');
    return newKey;
  } catch {
    return crypto.createHash('sha256').update('kinoroom-default-fallback-key').digest();
  }
}

export function registerTorrentDownloadRef(data: {
  privateUrl: string;
  title: string;
  tracker: string;
  infoHash?: string;
}): string {
  const now = Date.now();
  const exp = now + DOWNLOAD_REF_TTL_MS;

  // 1. Generate tamper-proof stateless encrypted token (AES-256-GCM)
  // Embeds privateUrl, title, tracker, infoHash and expiration
  const payload = {
    u: data.privateUrl,
    t: data.title,
    k: data.tracker,
    h: data.infoHash,
    c: now,
    e: exp
  };

  const key = getServerTokenKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const jsonStr = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const token = 'ref_' + Buffer.concat([iv, tag, encrypted]).toString('base64url');

  const ref: TorrentDownloadRef = {
    token,
    privateUrl: data.privateUrl,
    title: data.title,
    tracker: data.tracker,
    infoHash: data.infoHash,
    createdAt: now
  };

  // 2. Cache in memory
  downloadRefCache.set(token, ref);
  if (downloadRefCache.size > MAX_DOWNLOAD_REFS) {
    const oldestKey = downloadRefCache.keys().next().value;
    if (oldestKey) downloadRefCache.delete(oldestKey);
  }

  // 3. Write to file-backed persistent directory for cross-process access
  try {
    const filePath = path.join(TOKEN_CACHE_DIR, `${token.slice(0, 64)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(ref), 'utf8');
  } catch {}

  return token;
}

export function resolveTorrentDownloadRef(token: string): TorrentDownloadRef | undefined {
  if (!token) return undefined;
  const now = Date.now();

  // 1. Check in-memory map
  const inMem = downloadRefCache.get(token);
  if (inMem) {
    if (now - inMem.createdAt > DOWNLOAD_REF_TTL_MS) {
      downloadRefCache.delete(token);
      return undefined;
    }
    return inMem;
  }

  // 2. If stateless encrypted token (ref_...), decrypt and validate across processes
  if (token.startsWith('ref_')) {
    try {
      const raw = Buffer.from(token.slice(4), 'base64url');
      if (raw.length >= 28) {
        const iv = raw.subarray(0, 12);
        const tag = raw.subarray(12, 28);
        const ciphertext = raw.subarray(28);
        const key = getServerTokenKey();
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        const payload = JSON.parse(decrypted.toString('utf8'));
        if (payload.e && now > payload.e) {
          return undefined;
        }
        const ref: TorrentDownloadRef = {
          token,
          privateUrl: payload.u,
          title: payload.t,
          tracker: payload.k,
          infoHash: payload.h,
          createdAt: payload.c || now
        };
        downloadRefCache.set(token, ref);
        return ref;
      }
    } catch {
      // Fall through to file cache
    }
  }

  // 3. Check file-backed persistent cache for cross-process resolution
  try {
    const filePath = path.join(TOKEN_CACHE_DIR, `${token.slice(0, 64)}.json`);
    if (fs.existsSync(filePath)) {
      const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (now - fileData.createdAt <= DOWNLOAD_REF_TTL_MS) {
        downloadRefCache.set(token, fileData);
        return fileData;
      } else {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  } catch {}

  return undefined;
}

export function getJackettConfig(): {
  configured: boolean;
  url: string | null;
  indexers: string[];
} {
  const rawUrl = process.env.JACKETT_URL?.trim();
  const apiKey = process.env.JACKETT_API_KEY?.trim();
  const rawIndexers = process.env.JACKETT_INDEXERS?.trim() || 'rutracker,noname-club';

  if (!rawUrl || !apiKey) {
    return { configured: false, url: null, indexers: [] };
  }

  const cleanUrl = rawUrl.replace(/\/+$/, '');
  const indexers = rawIndexers
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  return {
    configured: true,
    url: cleanUrl,
    indexers: indexers.length > 0 ? indexers : ['rutracker', 'noname-club']
  };
}

/**
 * Normalizes infohash string to 40-character lowercase hex format
 */
export function normalizeInfoHash(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const magnetMatch = /urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i.exec(trimmed);
  const rawHash = magnetMatch ? magnetMatch[1] : trimmed;

  // 40-character hexadecimal infohash
  if (/^[a-fA-F0-9]{40}$/.test(rawHash)) {
    return rawHash.toLowerCase();
  }

  // 32-character base32 infohash (RFC 4648)
  if (/^[a-zA-Z2-7]{32}$/.test(rawHash)) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    const upper = rawHash.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
      const val = alphabet.indexOf(upper[i]);
      if (val === -1) return null;
      bits += val.toString(2).padStart(5, '0');
    }
    let hex = '';
    for (let i = 0; i + 4 <= bits.length; i += 4) {
      const chunk = bits.substring(i, i + 4);
      hex += parseInt(chunk, 2).toString(16);
    }
    return hex.slice(0, 40).toLowerCase();
  }

  return null;
}

export function normalizeTrackerName(rawTracker?: string, trackerId?: string): string {
  const t = (rawTracker || trackerId || '').toLowerCase();
  if (t.includes('rutracker')) return 'RuTracker';
  if (t.includes('nnm') || t.includes('noname')) return 'NNM-Club';
  if (t.includes('rutor')) return 'Rutor';
  if (t.includes('kinozal')) return 'Kinozal';
  return rawTracker || trackerId || 'Jackett';
}

export function detectQualityFromTitle(rawTitle: string): string {
  if (/2160p|4k|uhd/i.test(rawTitle)) return '4K UHD';
  if (/1080p|bdrip\s*1080|1080i/i.test(rawTitle)) return '1080p';
  if (/720p/i.test(rawTitle)) return '720p';
  if (/bdrip|dvdrip/i.test(rawTitle)) return 'BDRip';
  if (/web-dl|webrip/i.test(rawTitle)) return 'WEB-DL';
  return 'HD';
}

/**
 * Parses Torznab XML RSS response from Jackett
 */
export function parseTorznabXml(xml: string, defaultTracker?: string): JackettResultItem[] {
  const items: JackettResultItem[] = [];
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];

  for (const block of itemMatches) {
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const enclosureMatch = block.match(/<enclosure[^>]*url="([^"]+)"/i);
    const sizeMatch = block.match(/<size>(\d+)<\/size>/i);
    const trackerMatch = block.match(/<jackettindexer[^>]*>([\s\S]*?)<\/jackettindexer>/i);
    const trackerIdMatch = block.match(/<jackettindexer[^>]*id="([^"]+)"/i);
    const seedersMatch = block.match(/<torznab:attr[^>]*name="seeders"[^>]*value="(\d+)"/i);
    const peersMatch = block.match(/<torznab:attr[^>]*name="peers"[^>]*value="(\d+)"/i);
    const infoHashMatch = block.match(/<torznab:attr[^>]*name="infohash"[^>]*value="([^"]+)"/i);
    const magnetMatch = block.match(/<torznab:attr[^>]*name="magneturl"[^>]*value="([^"]+)"/i);
    const catMatch = block.match(/<category>([\s\S]*?)<\/category>/i);

    const title = titleMatch
      ? titleMatch[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim()
      : '';
    if (!title) continue;

    const link = (linkMatch?.[1] || enclosureMatch?.[1] || '')
      .replace(/&amp;/g, '&')
      .trim();
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : undefined;
    const tracker = trackerMatch ? trackerMatch[1].trim() : defaultTracker;
    const trackerId = trackerIdMatch ? trackerIdMatch[1].trim() : defaultTracker;
    const seeders = seedersMatch ? parseInt(seedersMatch[1], 10) : 0;
    const peers = peersMatch ? parseInt(peersMatch[1], 10) : 0;
    const infoHash = infoHashMatch ? infoHashMatch[1].trim() : undefined;
    const magnetUri = magnetMatch ? magnetMatch[1].replace(/&amp;/g, '&').trim() : undefined;
    const categoryDesc = catMatch ? catMatch[1].trim() : undefined;

    items.push({
      Title: title,
      Link: link || undefined,
      Tracker: tracker,
      TrackerId: trackerId,
      Size: size,
      Seeders: seeders,
      Peers: peers,
      InfoHash: infoHash,
      MagnetUri: magnetUri,
      CategoryDesc: categoryDesc
    });
  }

  return items;
}

/**
 * Searches Jackett for given query across configured indexers
 */
export async function searchJackett(
  query: string,
  options?: {
    timeoutMs?: number;
    year?: number;
    type?: 'movie' | 'tv';
    season?: number;
    episode?: number;
    imdbId?: string;
  }
): Promise<TorrentSearchResult[]> {
  const config = getJackettConfig();
  if (!config.configured || !config.url) {
    return [];
  }

  const apiKey = process.env.JACKETT_API_KEY!.trim();
  const timeoutMs = options?.timeoutMs || 6000;
  const cleanQ = query.trim();
  if (!cleanQ) return [];

  const indexerList = config.indexers.includes('all') ? ['all'] : config.indexers;

  const fetchIndexer = async (indexerId: string): Promise<TorrentSearchResult[]> => {
    try {
      let rawItems: JackettResultItem[] = [];

      // 1. Try Jackett native JSON results API
      try {
        const jsonEndpoint = `${config.url}/api/v2.0/indexers/${encodeURIComponent(indexerId)}/results`;
        const params = new URLSearchParams({
          apikey: apiKey,
          Query: cleanQ
        });

        const res = await fetch(`${jsonEndpoint}?${params.toString()}`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'KinoRoom-Server/1.0'
          },
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (res.ok) {
          const text = await res.text();
          if (text.trim().startsWith('{')) {
            const data: JackettResponse = JSON.parse(text);
            if (data.Results && Array.isArray(data.Results)) {
              rawItems = data.Results;
            }
          } else if (text.includes('<rss') || text.includes('<item>')) {
            rawItems = parseTorznabXml(text, indexerId);
          }
        }
      } catch {
        // Fallback to Torznab endpoint if JSON results failed
      }

      // 2. Torznab XML fallback if no results from native JSON endpoint
      if (rawItems.length === 0) {
        try {
          const torznabEndpoint = `${config.url}/api/v2.0/indexers/${encodeURIComponent(indexerId)}/results/torznab/api`;
          const torznabParams = new URLSearchParams({
            apikey: apiKey,
            t: 'search',
            q: cleanQ
          });
          if (options?.imdbId && options.imdbId.startsWith('tt')) {
            torznabParams.set('imdbid', options.imdbId);
          }

          const resTorznab = await fetch(`${torznabEndpoint}?${torznabParams.toString()}`, {
            headers: {
              'User-Agent': 'KinoRoom-Server/1.0'
            },
            signal: AbortSignal.timeout(timeoutMs)
          });

          if (resTorznab.ok) {
            const xml = await resTorznab.text();
            rawItems = parseTorznabXml(xml, indexerId);
          }
        } catch {
          // Ignore fallback error
        }
      }

      if (rawItems.length === 0) {
        return [];
      }

      const results: TorrentSearchResult[] = [];

      for (const item of rawItems) {
        if (!item.Title) continue;

        const rawTitle = item.Title.trim();
        const trackerName = normalizeTrackerName(item.Tracker, item.TrackerId);
        const seeds = typeof item.Seeders === 'number' ? item.Seeders : 0;
        const peers = typeof item.Peers === 'number' ? item.Peers : 0;
        const sizeBytes = typeof item.Size === 'number' ? item.Size : 0;
        const sizeFormatted = sizeBytes > 0 ? formatBytes(sizeBytes) : 'N/A';

        const infoHash = normalizeInfoHash(item.InfoHash || item.MagnetUri);
        const quality = detectQualityFromTitle(rawTitle);
        const translation = detectTranslation(rawTitle);

        // Security: NEVER return item.Link directly as it contains jackett_apikey or tracker passkeys
        let downloadUrl: string | undefined = undefined;
        let token: string | undefined = undefined;

        if (item.Link) {
          token = registerTorrentDownloadRef({
            privateUrl: item.Link,
            title: rawTitle,
            tracker: trackerName,
            infoHash: infoHash || undefined
          });
          downloadUrl = `/api/torrent/download?token=${token}`;
        }

        // Formulate safe magnet link
        let magnet = '';
        let sourceType: 'magnet' | 'torrent' = 'magnet';

        if (infoHash) {
          magnet = enrichMagnet(`magnet:?xt=urn:btih:${infoHash}&dn=${encodeURIComponent(rawTitle)}`);
        } else if (item.MagnetUri && item.MagnetUri.startsWith('magnet:')) {
          magnet = enrichMagnet(item.MagnetUri);
        } else if (token) {
          // If no magnet link or infohash exists, identify as a .torrent source with safe token
          magnet = `torrent-ref:${token}`;
          sourceType = 'torrent';
        } else {
          // No playable reference
          continue;
        }

        results.push({
          id: token || infoHash || undefined,
          title: rawTitle,
          magnet,
          size: sizeFormatted,
          sizeBytes,
          seeds,
          peers,
          tracker: trackerName,
          quality,
          translation,
          infoHash: infoHash || undefined,
          sourceType,
          downloadUrl,
          category: item.CategoryDesc || undefined
        });
      }

      return results;
    } catch {
      // Indexer error or timeout: return empty array so other indexers continue
      return [];
    }
  };

  const settled = await Promise.allSettled(indexerList.map((idx) => fetchIndexer(idx)));
  const combined: TorrentSearchResult[] = [];

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      combined.push(...result.value);
    }
  }

  return combined;
}

/**
 * Scrubs private passkeys, authkeys, and user tokens from .torrent announce URLs
 * while strictly preserving the infoHash (info dictionary is untouched).
 */
export async function scrubPasskeysFromTorrentBuffer(buffer: Buffer): Promise<Buffer> {
  try {
    const { default: parseTorrent, toTorrentFile } = await import('parse-torrent');
    const parsed: any = await parseTorrent(buffer);
    if (!parsed || !parsed.info) {
      return buffer;
    }

    const scrubUrl = (rawUrl: string): string => {
      try {
        const u = new URL(rawUrl);
        // 1. Remove sensitive query params: passkey, uk, authkey, key, token, secret
        for (const param of ['passkey', 'uk', 'authkey', 'key', 'token', 'secret', 'password']) {
          u.searchParams.delete(param);
        }
        // 2. Remove path-based 20-64 char passkeys e.g. /ffffffffb32c53807cd1df75df2acea2/announce -> /announce
        u.pathname = u.pathname.replace(/\/[a-zA-Z0-9_-]{20,64}\/announce/gi, '/announce');
        return u.toString();
      } catch {
        return rawUrl;
      }
    };

    if (Array.isArray(parsed.announce)) {
      parsed.announce = parsed.announce.map(scrubUrl);
    } else if (typeof parsed.announce === 'string') {
      parsed.announce = scrubUrl(parsed.announce);
    }

    if (Array.isArray(parsed.urlList)) {
      parsed.urlList = parsed.urlList.map(scrubUrl);
    }

    return Buffer.from(toTorrentFile(parsed));
  } catch {
    return buffer;
  }
}

/**
 * Downloads .torrent buffer securely from Jackett for server-side parsing and remote torrent playback
 * Handles HTTP redirects safely with SSRF mitigation.
 */
export async function fetchTorrentBufferByToken(token: string): Promise<{ buffer: Buffer; ref: TorrentDownloadRef } | null> {
  const ref = resolveTorrentDownloadRef(token);
  if (!ref) return null;

  const config = getJackettConfig();
  if (!config.configured || !config.url) return null;

  try {
    const configuredJackett = new URL(config.url);

    // Follow redirects safely, inspecting location headers
    let currentUrl = ref.privateUrl;
    let hops = 0;
    const maxHops = 3;
    let finalBuffer: Buffer | null = null;

    while (hops < maxHops) {
      const parsedTarget = new URL(currentUrl);
      const isSameJackettHost =
        parsedTarget.origin === configuredJackett.origin ||
        parsedTarget.hostname === configuredJackett.hostname;

      // Disallow internal private networks / cloud metadata for non-Jackett redirects
      if (!isSameJackettHost) {
        const isPrivateIp =
          /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|169\.254\.|::1|localhost)/i.test(
            parsedTarget.hostname
          );
        if (isPrivateIp) {
          return null;
        }
      }

      const res = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'KinoRoom-Server/1.0'
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(10000)
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) return null;
        const nextUrl = new URL(loc, currentUrl).toString();
        currentUrl = nextUrl;
        hops++;
        continue;
      }

      if (!res.ok) return null;

      const arrayBuffer = await res.arrayBuffer();
      finalBuffer = Buffer.from(arrayBuffer);
      break;
    }

    if (!finalBuffer) return null;

    return { buffer: finalBuffer, ref };
  } catch {
    return null;
  }
}

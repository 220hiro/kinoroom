import os from 'node:os';
import path from 'node:path';
import type { TorrentSearchResult, TorrentStatus, TorrentFile } from '@/lib/types';
import { observeTorrent, getTorrentDiagnostics } from './torrentDiagnostics';

// Global torrent client storage to survive Next.js HMR in dev
declare global {
  // eslint-disable-next-line no-var
  var _webtorrentClient: any;
}

const VIDEO_EXT_REGEX = /\.(mp4|mkv|webm|avi|mov|m4v|ts|flv)$/i;
const TEMP_DOWNLOAD_DIR = path.join(os.tmpdir(), 'kinoroom-torrents');

export async function getWebTorrentClient() {
  if (!globalThis._webtorrentClient) {
    const { default: WebTorrent } = await import('webtorrent');
    globalThis._webtorrentClient = new WebTorrent({
      maxConns: 55,
      dht: true,
    });
  }
  return globalThis._webtorrentClient;
}

export function cleanTorrentQuery(query: string): string {
  return query
    .replace(/\b(19\d\d|20\d\d)\b/g, '') // remove 4-digit release years that break sphinx search
    .replace(/[:\-—–_()[\]{}«»"']/g, ' ')  // remove punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectTranslation(rawTitle: string): string | undefined {
  if (/Red\s*Head\s*Sound|RHS/i.test(rawTitle)) return 'Red Head Sound';
  if (/LostFilm|Лостфильм/i.test(rawTitle)) return 'LostFilm';
  if (/HDRezka|Rezka|Резка/i.test(rawTitle)) return 'HDRezka';
  if (/Кубик\s*в\s*Кубе/i.test(rawTitle)) return 'Кубик в кубе';
  if (/Студийная\s*Банда|StudioBand/i.test(rawTitle)) return 'Студийная Банда';
  if (/AniLibria|Анилибрия/i.test(rawTitle)) return 'AniLibria';
  if (/AnimeVost|Анимевост/i.test(rawTitle)) return 'AnimeVost';
  if (/NewStudio/i.test(rawTitle)) return 'NewStudio';
  if (/AlexFilm/i.test(rawTitle)) return 'AlexFilm';
  if (/TVShows/i.test(rawTitle)) return 'TVShows';
  if (/Гоблин|Пучков/i.test(rawTitle)) return 'Гоблин (П/П)';
  if (/(?:\|\s*|\[|\(|\b)(?:D|ДБ|Дубляж|Дублированный)(?:\s*\||\]|\)|\b)/i.test(rawTitle)) return 'Дубляж';
  if (/(?:\|\s*|\[|\(|\b)(?:MVO|П|Многоголосый|Проф\.\s*многоголосый)(?:\s*\||\]|\)|\b)/i.test(rawTitle)) return 'Многоголосый';
  if (/ТВ-?3|ТВ3/i.test(rawTitle)) return 'ТВ-3';
  if (/Кураж\s*[-–]?\s*Бамбей/i.test(rawTitle)) return 'Кураж-Бамбей';
  if (/BaibaKo|Байбако/i.test(rawTitle)) return 'BaibaKo';
  if (/Кравец/i.test(rawTitle)) return 'Кравец-Рекордз';
  if (/Jaskier|Яскьер/i.test(rawTitle)) return 'Jaskier';
  if (/(?:\|\s*|\[|\(|\b)(?:AVO|Авторский|Одноголосый|А)(?:\s*\||\]|\)|\b)/i.test(rawTitle)) return 'Авторский';
  if (/Субтитры|Subtitles|SoftSub/i.test(rawTitle)) return 'Субтитры';
  return undefined;
}

export const DEFAULT_TRACKERS = [
  'udp://opentor.net:6969',
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://explodie.org:6969/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz'
];

export function enrichMagnet(magnet: string): string {
  let enriched = magnet;
  for (const tr of DEFAULT_TRACKERS) {
    if (!enriched.includes(encodeURIComponent(tr)) && !enriched.includes(tr)) {
      enriched += `&tr=${encodeURIComponent(tr)}`;
    }
  }
  return enriched;
}

async function fetchFromRutor(query: string): Promise<TorrentSearchResult[]> {
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(8000)
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

          // Extract quality
          let quality = 'HD';
          if (/2160p|4k|uhd/i.test(rawTitle)) quality = '4K UHD';
          else if (/1080p|bdrip\s*1080|1080i/i.test(rawTitle)) quality = '1080p';
          else if (/720p/i.test(rawTitle)) quality = '720p';
          else if (/bdrip|dvdrip/i.test(rawTitle)) quality = 'BDRip';
          else if (/web-dl|webrip/i.test(rawTitle)) quality = 'WEB-DL';

          const translation = detectTranslation(rawTitle);
          const magnet = enrichMagnet(magnetMatch[1]);

          results.push({
            title: rawTitle,
            magnet,
            size,
            seeds,
            peers,
            tracker: 'Rutor',
            quality,
            translation
          });
        }
      }

      // Sort by seeders descending
      results.sort((a, b) => b.seeds - a.seeds);
      return results;
    } catch {
      continue;
    }
  }

  return [];
}

/**
 * Searches open trackers (Rutor / mirrors) for releases matching query
 * If primary query returns no results, attempts search with originalTitle
 */
export async function searchTorrents(query: string, originalTitle?: string): Promise<TorrentSearchResult[]> {
  let results = await fetchFromRutor(query);

  if (results.length === 0 && originalTitle) {
    const cleanOrig = cleanTorrentQuery(originalTitle);
    const cleanPrim = cleanTorrentQuery(query);
    if (cleanOrig && cleanOrig.toLowerCase() !== cleanPrim.toLowerCase()) {
      results = await fetchFromRutor(originalTitle);
    }
  }

  // Deduplicate by magnet link
  const seen = new Set<string>();
  const deduped: TorrentSearchResult[] = [];
  for (const item of results) {
    if (!seen.has(item.magnet)) {
      seen.add(item.magnet);
      deduped.push(item);
    }
  }

  return deduped.slice(0, 30);
}

/**
 * Gets or adds a torrent by magnet URI / hash and waits for metadata
 */
export async function getOrAddTorrent(torrentId: string): Promise<any> {
  const client = await getWebTorrentClient();
  const formattedId = torrentId.startsWith('magnet:') ? enrichMagnet(torrentId) : torrentId;

  // Check if already present in client
  const existing = (await client.get(torrentId)) || (formattedId !== torrentId ? await client.get(formattedId) : null);
  if (existing) {
    observeTorrent(existing);
    if (existing.ready || (existing.files && existing.files.length > 0)) {
      return existing;
    }
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve(existing);
        }
      };
      existing.once('metadata', done);
      existing.once('ready', done);
      setTimeout(done, 12000);
    });
  }

  return new Promise((resolve, reject) => {
    try {
      const torrent = client.add(formattedId, {
        path: TEMP_DOWNLOAD_DIR,
        destroyStoreOnDestroy: true,
        // Metadata/status alone must not start downloading the whole release.
        // Each createReadStream selects its own range and releases it on close.
        deselect: true,
      });
      observeTorrent(torrent);

      if (torrent.ready || (torrent.files && torrent.files.length > 0)) {
        resolve(torrent);
        return;
      }

      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve(torrent);
        }
      };

      torrent.once('metadata', done);
      torrent.once('ready', done);

      torrent.on('error', (err: any) => {
        console.error('Torrent error:', err);
      });

      setTimeout(done, 12000);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieves structured status for a torrent
 */
export async function getTorrentStatus(torrentId: string): Promise<TorrentStatus & { diagnostics?: ReturnType<typeof getTorrentDiagnostics> }> {
  const torrent = await getOrAddTorrent(torrentId);

  const files: TorrentFile[] = (torrent.files || []).map((f: any, idx: number) => ({
    index: idx,
    name: f.name,
    path: f.path,
    length: f.length,
    isVideo: VIDEO_EXT_REGEX.test(f.name)
  }));

  return {
    infoHash: torrent.infoHash || '',
    name: torrent.name || 'Загрузка метаданных...',
    progress: Math.round((torrent.progress || 0) * 100),
    downloadSpeed: torrent.downloadSpeed || 0,
    uploadSpeed: torrent.uploadSpeed || 0,
    numPeers: torrent.numPeers || 0,
    downloaded: torrent.downloaded || 0,
    total: torrent.length || 0,
    ready: Boolean(torrent.files && torrent.files.length > 0),
    files,
    diagnostics: getTorrentDiagnostics(torrent)
  };
}

/**
 * Finds the target video file inside the torrent
 */
export function getTorrentVideoFile(torrent: any, fileIndex?: number) {
  if (!torrent.files || torrent.files.length === 0) return null;

  if (fileIndex !== undefined && fileIndex >= 0 && fileIndex < torrent.files.length) {
    return torrent.files[fileIndex];
  }

  // Find largest video file by length
  const videoFiles = torrent.files.filter((f: any) => VIDEO_EXT_REGEX.test(f.name));
  if (videoFiles.length > 0) {
    return videoFiles.reduce((prev: any, cur: any) => (cur.length > prev.length ? cur : prev));
  }

  // Fallback to largest file overall
  return torrent.files.reduce((prev: any, cur: any) => (cur.length > prev.length ? cur : prev));
}

export function formatBytes(bytes: number, decimals = 1) {
  if (!bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

import os from 'node:os';
import path from 'node:path';
import type { TorrentSearchResult, TorrentStatus, TorrentFile } from '@/lib/types';

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

/**
 * Searches open trackers (Rutor / mirrors) for releases matching query
 */
export async function searchTorrents(query: string): Promise<TorrentSearchResult[]> {
  const clean = query.trim();
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
          else if (/1080p|bdrip\s*1080/i.test(rawTitle)) quality = '1080p';
          else if (/720p/i.test(rawTitle)) quality = '720p';
          else if (/bdrip|dvdrip/i.test(rawTitle)) quality = 'BDRip';

          results.push({
            title: rawTitle,
            magnet: magnetMatch[1],
            size,
            seeds,
            peers,
            tracker: 'Rutor',
            quality
          });
        }
      }

      // Sort by seeders descending
      results.sort((a, b) => b.seeds - a.seeds);
      return results.slice(0, 25);
    } catch {
      continue;
    }
  }

  return [];
}

/**
 * Gets or adds a torrent by magnet URI / hash and waits for metadata
 */
export async function getOrAddTorrent(torrentId: string): Promise<any> {
  const client = await getWebTorrentClient();

  // Check if already present in client
  const existing = client.get(torrentId);
  if (existing) {
    if (existing.files && existing.files.length > 0) return existing;
    return new Promise((resolve) => {
      existing.once('metadata', () => resolve(existing));
      existing.once('ready', () => resolve(existing));
      setTimeout(() => resolve(existing), 10000);
    });
  }

  return new Promise((resolve, reject) => {
    try {
      const torrent = client.add(torrentId, {
        path: TEMP_DOWNLOAD_DIR,
        destroyStoreOnDestroy: true,
      });

      const onReady = () => resolve(torrent);
      torrent.once('metadata', onReady);
      torrent.once('ready', onReady);

      torrent.on('error', (err: any) => {
        console.error('Torrent error:', err);
      });

      setTimeout(() => {
        // Return torrent anyway even if metadata is still pending
        resolve(torrent);
      }, 15000);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Retrieves structured status for a torrent
 */
export async function getTorrentStatus(torrentId: string): Promise<TorrentStatus> {
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
    files
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

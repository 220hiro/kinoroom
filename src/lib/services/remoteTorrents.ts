import { normalizeInfoHash, resolveTorrentDownloadRef, fetchTorrentBufferByToken } from './jackett';
import { enrichMagnet } from './torrentUtils';
import type { TorrentStatus } from '@/lib/types';

export function torrServerBase(): string {
  const value = process.env.TORRSERVER_URL?.trim();
  if (!value) throw new Error('Внешний сервер воспроизведения не подключён. Нужен сервер с TorrServer; ноутбук не используется.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Некорректная настройка TorrServer.');
  return value.replace(/\/$/, '');
}

export function torrServerHeaders(): Record<string, string> {
  const auth = process.env.TORRSERVER_AUTH?.trim();
  return auth ? { Authorization: /^(Basic|Bearer) /i.test(auth) ? auth : `Basic ${Buffer.from(auth).toString('base64')}` } : {};
}

export async function torrentStatus(torrent: string, knownHash?: string, title?: string): Promise<TorrentStatus> {
  const base = torrServerBase();
  let link = torrent;
  let hash = normalizeInfoHash(knownHash || torrent);
  if (torrent.startsWith('torrent-ref:')) {
    const token = torrent.slice(12);
    const ref = resolveTorrentDownloadRef(token);
    hash = hash || ref?.infoHash || null;
    const fetched = await fetchTorrentBufferByToken(token);
    if (!fetched) throw new Error('Ссылка на раздачу истекла. Обновите поиск.');
    const { default: parseTorrent } = await import('parse-torrent');
    const parsed: any = await parseTorrent(fetched.buffer);
    hash = parsed.infoHash;
    // Preserve this release's announce URLs; never send the .torrent itself to the browser.
    link = enrichMagnet(`magnet:?xt=urn:btih:${hash}`, parsed.announce || []);
  } else if (hash && !torrent.startsWith('magnet:')) link = `magnet:?xt=urn:btih:${hash}`;
  if (!hash || !link.startsWith('magnet:')) throw new Error('Нужна magnet-ссылка или подтверждённая раздача.');
  const send = async (body: object) => fetch(`${base}/torrents`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...torrServerHeaders() },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000), redirect: 'error', cache: 'no-store' });
  let result = await send({ action: 'get', hash });
  let data = result.ok ? await result.json() : null;
  if (!data?.hash) {
    result = await send({ action: 'add', link: enrichMagnet(link), title, save_to_db: true });
    if (!result.ok) throw new Error('Внешний TorrServer не смог открыть раздачу.');
    data = await result.json();
  }
  return { infoHash: data.hash, name: data.title || 'Раздача', ready: Boolean(data.file_stats?.length), progress: 0,
    numPeers: Number(data.active_peers || 0), downloadSpeed: Number(data.download_speed || 0), uploadSpeed: 0,
    downloaded: Number(data.preloaded_bytes || 0), total: Number(data.torrent_size || 0),
    files: (data.file_stats || []).map((f: any, i: number) => ({ index: f.id ?? i, path: f.path || '', name: String(f.path || '').split(/[\\/]/).pop() || `Файл ${i + 1}`,
      length: Number(f.length || 0), isVideo: /\.(mkv|mp4|m4v|webm|avi|mov|ts)$/i.test(f.path || '') })) };
}

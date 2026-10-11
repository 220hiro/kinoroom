import { NextRequest, NextResponse } from 'next/server';
import type { TorrentStatus, TorrentFile } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VIDEO_EXT_REGEX = /\.(mp4|mkv|webm|avi|mov|m4v|ts|flv)$/i;

/**
 * Normalizes TorrServer torrent JSON response into Kinoroom TorrentStatus format
 */
function normalizeTorrServerStatus(data: any): TorrentStatus {
  const files: TorrentFile[] = (data.file_stats || []).map((f: any, idx: number) => ({
    index: f.id !== undefined ? f.id : idx,
    name: f.path?.split(/[\\/]/).pop() || f.path || `File ${idx + 1}`,
    path: f.path || '',
    length: f.length || 0,
    isVideo: VIDEO_EXT_REGEX.test(f.path || '')
  }));

  const numPeers = (data.connected_seeders || 0) + (data.active_peers || 0);

  return {
    infoHash: data.hash || '',
    name: data.title || 'TorrServer поток',
    progress: data.torrent_size ? Math.min(100, Math.round(((data.preloaded_bytes || 0) / data.torrent_size) * 100)) : 0,
    downloadSpeed: data.download_speed || 0,
    uploadSpeed: data.upload_speed || 0,
    numPeers,
    downloaded: data.preloaded_bytes || 0,
    total: data.torrent_size || 0,
    ready: Boolean(files.length > 0 && (data.stat === 2 || data.stat === 3 || data.stat_string === 'Working' || data.stat_string === 'Preload')),
    files
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { torrServerUrl, magnet } = body;

    if (!torrServerUrl || !magnet) {
      return NextResponse.json({ error: 'Missing torrServerUrl or magnet' }, { status: 400 });
    }

    const cleanBaseUrl = torrServerUrl.replace(/\/$/, '');

    // Add torrent to TorrServer and retrieve its status
    const addRes = await fetch(`${cleanBaseUrl}/torrents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add',
        link: magnet,
        save_to_db: true
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!addRes.ok) {
      return NextResponse.json(
        { error: `TorrServer returned HTTP ${addRes.status}` },
        { status: 502 }
      );
    }

    const torrData = await addRes.json();
    const normalized = normalizeTorrServerStatus(torrData);

    return NextResponse.json(normalized);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to communicate with TorrServer' },
      { status: 502 }
    );
  }
}

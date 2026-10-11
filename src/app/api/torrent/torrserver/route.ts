import { NextRequest, NextResponse } from 'next/server';
import type { TorrentStatus, TorrentFile } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VIDEO_EXT_REGEX = /\.(mp4|mkv|webm|avi|mov|m4v|ts|flv)$/i;

/**
 * Validates target TorrServer URL to prevent SSRF against cloud internal metadata
 */
function isValidTorrServerUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    // Block cloud metadata & internal loopback services from public manipulation
    if (
      host === '169.254.169.254' ||
      host === 'metadata.google.internal' ||
      host === 'instance-data' ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
    const { torrServerUrl, torrServerAuth, magnet, hash } = body;

    // Prioritize server environment variable if configured, otherwise validate user-provided URL
    const targetUrl = (process.env.TORRSERVER_URL || torrServerUrl || '').trim();
    const targetAuth = (process.env.TORRSERVER_AUTH || torrServerAuth || '').trim();

    if (!targetUrl) {
      return NextResponse.json({ error: 'Missing TorrServer URL' }, { status: 400 });
    }

    if (!isValidTorrServerUrl(targetUrl)) {
      return NextResponse.json(
        { error: 'Invalid or forbidden TorrServer URL (SSRF protection)' },
        { status: 400 }
      );
    }

    if (!magnet && !hash) {
      return NextResponse.json({ error: 'Missing magnet link or info hash' }, { status: 400 });
    }

    const cleanBaseUrl = targetUrl.replace(/\/$/, '');

    // Setup headers with optional Basic Auth
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (targetAuth) {
      headers['Authorization'] =
        targetAuth.startsWith('Basic ') || targetAuth.startsWith('Bearer ')
          ? targetAuth
          : `Basic ${Buffer.from(targetAuth).toString('base64')}`;
    }

    let torrData: any = null;

    // 1. If hash is already known, query status using action: "get" to avoid repeatedly re-adding
    if (hash) {
      try {
        const getRes = await fetch(`${cleanBaseUrl}/torrents`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'get', hash }),
          signal: AbortSignal.timeout(5000)
        });
        if (getRes.ok) {
          torrData = await getRes.json();
        }
      } catch {
        // Fall back to add
      }
    }

    // 2. If not found or initial poll without hash, call action: "add"
    if (!torrData && magnet) {
      const addRes = await fetch(`${cleanBaseUrl}/torrents`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'add',
          link: magnet,
          save_to_db: true
        }),
        signal: AbortSignal.timeout(7000)
      });

      if (!addRes.ok) {
        return NextResponse.json(
          { error: `TorrServer returned HTTP ${addRes.status}` },
          { status: addRes.status === 401 ? 401 : 502 }
        );
      }

      torrData = await addRes.json();
    }

    if (!torrData) {
      return NextResponse.json({ error: 'Failed to retrieve torrent from TorrServer' }, { status: 404 });
    }

    const normalized = normalizeTorrServerStatus(torrData);
    return NextResponse.json(normalized);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to communicate with TorrServer' },
      { status: 502 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import type { TorrentStatus, TorrentFile } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VIDEO_EXT_REGEX = /\.(mp4|mkv|webm|avi|mov|m4v|ts|flv)$/i;

/**
 * Validates public TorrServer URL to prevent SSRF against internal/private cloud infrastructure
 */
function isValidTorrServerUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    const cleanHost = host.replace(/^\[|\]$/g, '');

    // Block localhost, loopback, and undefined hosts
    if (
      cleanHost === 'localhost' ||
      cleanHost === '127.0.0.1' ||
      cleanHost === '0.0.0.0' ||
      cleanHost === '::1' ||
      cleanHost === '::' ||
      cleanHost.endsWith('.localhost')
    ) {
      return false;
    }

    // Block IPv6 link-local (fe80::/10), ULA (fc00::/7, fd00::/8), and IPv4-mapped (::ffff:)
    if (
      cleanHost.startsWith('fe80:') ||
      cleanHost.startsWith('fc') ||
      cleanHost.startsWith('fd') ||
      cleanHost.startsWith('::ffff:')
    ) {
      return false;
    }

    // Block private/internal IPv4 ranges:
    // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10
    const ipv4Match = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const b0 = parseInt(ipv4Match[1], 10);
      const b1 = parseInt(ipv4Match[2], 10);
      if (b0 === 0 || b0 === 10 || b0 === 127) return false;
      if (b0 === 169 && b1 === 254) return false;
      if (b0 === 192 && b1 === 168) return false;
      if (b0 === 172 && b1 >= 16 && b1 <= 31) return false;
      if (b0 === 100 && b1 >= 64 && b1 <= 127) return false;
    }

    // Block cloud metadata & internal suffixes
    if (
      cleanHost === 'metadata.google.internal' ||
      cleanHost === 'instance-data' ||
      cleanHost.endsWith('.internal') ||
      cleanHost.endsWith('.local') ||
      cleanHost.endsWith('.corp') ||
      cleanHost.endsWith('.home') ||
      cleanHost.endsWith('.lan')
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

    // Security policy:
    // If TORRSERVER_URL is configured on server environment, lock exclusively to it and server-configured auth.
    // Client cannot override target server URL when server has its own TORRSERVER_URL.
    let targetUrl = '';
    let targetAuth = '';

    if (process.env.TORRSERVER_URL) {
      targetUrl = process.env.TORRSERVER_URL.trim();
      targetAuth = (process.env.TORRSERVER_AUTH || '').trim();
    } else {
      targetUrl = (torrServerUrl || '').trim();
      targetAuth = (torrServerAuth || '').trim();

      if (!targetUrl) {
        return NextResponse.json({ error: 'Missing TorrServer URL' }, { status: 400 });
      }

      if (!isValidTorrServerUrl(targetUrl)) {
        return NextResponse.json(
          { error: 'Forbidden or private TorrServer URL. SSRF protection prevents accessing internal networks.' },
          { status: 400 }
        );
      }
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
          signal: AbortSignal.timeout(5000),
          redirect: 'error' // Disallow SSRF redirect chains
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
        signal: AbortSignal.timeout(7000),
        redirect: 'error' // Disallow SSRF redirect chains
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

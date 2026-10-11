import { NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { getOrAddTorrent, getTorrentVideoFile } from '@/lib/services/torrents';

export const dynamic = 'force-dynamic';

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'mov':
      return 'video/quicktime';
    case 'ts':
      return 'video/mp2t';
    default:
      return 'video/mp4';
  }
}

function nodeToWebStream(nodeStream: any): ReadableStream {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: any) => {
        try {
          controller.enqueue(chunk);
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            nodeStream.pause?.();
          }
        } catch {
          // Stream closed by client
        }
      });
      nodeStream.on('end', () => {
        try { controller.close(); } catch {}
      });
      nodeStream.on('error', (err: any) => {
        try { controller.error(err); } catch {}
      });
    },
    pull() {
      nodeStream.resume?.();
    },
    cancel() {
      nodeStream.destroy?.();
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const torrentId = request.nextUrl.searchParams.get('torrent');
    if (!torrentId) {
      return new Response('Missing torrent parameter', { status: 400 });
    }

    const fileIndexParam = request.nextUrl.searchParams.get('file');
    const fileIndex = fileIndexParam !== null ? parseInt(fileIndexParam, 10) : undefined;

    let torrent = await getOrAddTorrent(torrentId);
    let attempts = 0;
    while ((!torrent || !torrent.files || torrent.files.length === 0) && attempts < 10) {
      await new Promise((r) => setTimeout(r, 1000));
      attempts++;
      torrent = await getOrAddTorrent(torrentId);
    }

    if (!torrent || !torrent.files || torrent.files.length === 0) {
      return new Response('Torrent metadata not available yet. Please retry in a few seconds.', { status: 503 });
    }

    const file = getTorrentVideoFile(torrent, fileIndex);
    if (!file) {
      return new Response('No playable video file found in torrent', { status: 404 });
    }

    // Select file for priority sequential download
    if (typeof file.select === 'function') {
      file.select();
    }

    const total = file.length;
    const rangeHeader = request.headers.get('range');
    const mime = getMimeType(file.name);

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;

      if (start >= total || end >= total) {
        return new Response('Requested range not satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` }
        });
      }

      const chunkSize = end - start + 1;
      const nodeStream = file.createReadStream({ start, end });
      const webStream = nodeToWebStream(nodeStream);

      return new Response(webStream as any, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': mime,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } else {
      const nodeStream = file.createReadStream();
      const webStream = nodeToWebStream(nodeStream);

      return new Response(webStream as any, {
        status: 200,
        headers: {
          'Content-Length': total.toString(),
          'Accept-Ranges': 'bytes',
          'Content-Type': mime,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  } catch (err: any) {
    console.error('Torrent stream error:', err);
    return new Response(`Streaming error: ${err.message}`, { status: 500 });
  }
}

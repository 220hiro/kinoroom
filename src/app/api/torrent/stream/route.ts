import { NextRequest } from 'next/server';
import { parseHttpRange } from '@/lib/playback/httpRange';
import { getOrAddTorrent, getTorrentVideoFile } from '@/lib/services/torrents';
import { observeTorrentStream } from '@/lib/services/torrentDiagnostics';

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

function nodeToWebStream(nodeStream: any, diagnostic?: ReturnType<typeof observeTorrentStream>): ReadableStream {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: any) => {
        try {
          controller.enqueue(chunk);
          diagnostic?.data(chunk.byteLength);
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            nodeStream.pause?.();
          }
        } catch {
          // Stream closed by client
        }
      });
      nodeStream.on('end', () => {
        diagnostic?.finish('ended');
        try { controller.close(); } catch {}
      });
      nodeStream.on('error', (err: any) => {
        diagnostic?.finish('error');
        try { controller.error(err); } catch {}
      });
    },
    pull() {
      nodeStream.resume?.();
    },
    cancel() {
      diagnostic?.finish('cancelled');
      nodeStream.destroy?.();
    }
  });
}

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
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

    // createReadStream owns the range selection; no persistent whole-file download.
    const total = file.length;
    const rangeHeader = request.headers.get('range');
    const mime = getMimeType(file.name);

    if (rangeHeader) {
      const range = parseHttpRange(rangeHeader, total);
      if (!range) {
        return new Response('Requested range not satisfiable', {
          status: 416,
          headers: { 'Content-Range': `bytes */${total}` }
        });
      }
      const { start, end } = range;
      const chunkSize = end - start + 1;
      const nodeStream = file.createReadStream({ start, end });
      const diagnostic = observeTorrentStream(torrent, file, start, end, performance.now() - startedAt);
      const webStream = nodeToWebStream(nodeStream, diagnostic);

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
      const diagnostic = observeTorrentStream(torrent, file, 0, total - 1, performance.now() - startedAt);
      const webStream = nodeToWebStream(nodeStream, diagnostic);

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

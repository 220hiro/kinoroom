import { NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import {
  getOrCreateHlsSession,
  getHlsSessionById,
  getLatestHlsSession,
  startSessionEncoder,
  waitForHlsPlaylist,
  getHlsSegmentStream,
  rewritePlaylistWithParams,
  TorrentHlsSession
} from '@/lib/services/torrentHls';

export const dynamic = 'force-dynamic';

function nodeToWebStream(nodeStream: NodeJS.ReadableStream): ReadableStream {
  const readable = nodeStream as Readable;
  return new ReadableStream({
    start(controller) {
      readable.on('data', (chunk) => {
        try {
          controller.enqueue(chunk);
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            readable.pause?.();
          }
        } catch {
          // Closed by client
        }
      });
      readable.on('end', () => {
        try { controller.close(); } catch {}
      });
      readable.on('error', (err) => {
        try { controller.error(err); } catch {}
      });
    },
    pull() {
      readable.resume?.();
    },
    cancel() {
      readable.destroy?.();
    }
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  if (process.env.VERCEL) {
    return new Response('Torrent streaming is not supported on Vercel Serverless', { status: 404 });
  }

  const rawPath = (await context.params).path || [];
  let pathSessionId: string | null = null;
  const remainingPath = [...rawPath];

  // Check if first path segment is a sessionId: e.g. <infoHash>_<fileIndex>
  if (remainingPath.length > 0 && /^([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})_\d+$/.test(remainingPath[0])) {
    pathSessionId = remainingPath.shift()!;
  }

  let seekSeconds = 0;
  let filename = '';

  if (remainingPath.length === 1) {
    filename = remainingPath[0];
  } else if (remainingPath.length === 2 && /^s(\d+)$/.test(remainingPath[0])) {
    seekSeconds = parseInt(remainingPath[0].slice(1), 10);
    filename = remainingPath[1];
  } else {
    return new Response('Invalid HLS resource path', { status: 404 });
  }

  // Validate filename
  if (!/^(master\.m3u8|init\.mp4|seg\d{5}\.m4s|status)$/.test(filename)) {
    return new Response('Resource not found', { status: 404 });
  }

  const torrentParam = request.nextUrl.searchParams.get('torrent');
  const fileParam = request.nextUrl.searchParams.get('file');
  const fileIndex = fileParam !== null ? parseInt(fileParam, 10) : (pathSessionId ? parseInt(pathSessionId.split('_')[1], 10) : 0);

  try {
    let session: TorrentHlsSession | undefined;

    if (torrentParam) {
      session = await getOrCreateHlsSession(torrentParam, fileIndex, seekSeconds);
    } else if (pathSessionId) {
      session = getHlsSessionById(pathSessionId);
    } else {
      session = getLatestHlsSession();
    }

    if (!session) {
      return new Response('HLS Session not found. Please provide torrent parameter.', { status: 404 });
    }

    // If seeking without torrent param on existing session
    if (session.seekOffsetSeconds !== seekSeconds) {
      const isHevc = session.videoCodec === 'hevc' || /\b(hevc|h265|x265|2160p|4k)\b/i.test(session.fileName);
      await startSessionEncoder(session, seekSeconds, isHevc, session.videoCodec);
    }

    if (filename === 'status') {
      return Response.json({
        infoHash: session.infoHash,
        fileName: session.fileName,
        isReady: session.isReady,
        seekOffset: session.seekOffsetSeconds,
        failed: session.failed,
        failureReason: session.failureReason
      });
    }

    if (filename === 'master.m3u8') {
      let playlist = await waitForHlsPlaylist(session, 45_000, request.signal);
      if (torrentParam) {
        playlist = rewritePlaylistWithParams(playlist, `torrent=${encodeURIComponent(torrentParam)}&file=${session.fileIndex}`);
      }
      return new Response(playlist, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Segment or init.mp4
    const { stream, size } = await getHlsSegmentStream(session, filename, seekSeconds);
    const webStream = nodeToWebStream(stream);

    return new Response(webStream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err: any) {
    console.error('Torrent HLS streaming error:', err);
    return new Response(`HLS Streaming error: ${err.message || 'Internal error'}`, { status: 503 });
  }
}

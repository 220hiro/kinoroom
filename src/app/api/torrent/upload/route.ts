import { NextRequest, NextResponse } from 'next/server';
import { getWebTorrentClient } from '@/lib/services/torrents';

export async function POST(request: NextRequest) {
  try {
    const { fileData } = await request.json();
    if (!fileData) {
      return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
    }

    const buffer = Buffer.from(fileData, 'base64');
    const client = await getWebTorrentClient();

    return new Promise<NextResponse>((resolve) => {
      try {
        const torrent = client.add(buffer, {
          destroyStoreOnDestroy: true
        });

        // If magnetURI is available or on metadata
        if (torrent.magnetURI) {
          resolve(NextResponse.json({ magnet: torrent.magnetURI, infoHash: torrent.infoHash }));
        } else {
          torrent.once('metadata', () => {
            resolve(NextResponse.json({ magnet: torrent.magnetURI, infoHash: torrent.infoHash }));
          });
          setTimeout(() => {
            resolve(
              NextResponse.json({
                magnet: torrent.magnetURI || `magnet:?xt=urn:btih:${torrent.infoHash}`,
                infoHash: torrent.infoHash
              })
            );
          }, 3000);
        }
      } catch (err: any) {
        resolve(NextResponse.json({ error: err.message || 'Failed to parse torrent' }, { status: 500 }));
      }
    });
  } catch (err: any) {
    console.error('Torrent upload error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}

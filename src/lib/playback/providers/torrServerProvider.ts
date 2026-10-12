import {
  MediaProvider,
  PlaybackRequest,
  PlaybackResponse
} from '../types';

export class TorrServerProvider implements MediaProvider {
  readonly id = 'torrserver';
  readonly name = 'TorrServer P2P Стриминг (Требуется собственный VPS)';
  readonly priority = 50;

  async isAvailable(): Promise<boolean> {
    const url = process.env.TORRSERVER_URL;
    return Boolean(url && url.trim().length > 0);
  }

  async resolvePlayback(request: PlaybackRequest): Promise<PlaybackResponse | null> {
    const configured = await this.isAvailable();
    if (!configured) {
      return null;
    }

    const torrServerUrl = process.env.TORRSERVER_URL!.trim();

    return {
      success: true,
      media: {
        id: request.mediaId,
        title: `Медиа #${request.mediaId}`,
        mediaType: request.mediaType,
        season: request.season,
        episode: request.episode
      },
      currentTranslation: {
        id: 'torrserver-direct',
        name: 'Оригинальный торрент-поток',
        type: 'original',
        quality: '1080p',
        providerId: this.id
      },
      availableTranslations: [
        {
          id: 'torrserver-direct',
          name: 'Оригинальный торрент-поток',
          type: 'original',
          quality: '1080p',
          providerId: this.id
        }
      ],
      stream: {
        url: `${torrServerUrl}/stream?link=${encodeURIComponent(String(request.mediaId))}`,
        type: 'mp4',
        qualities: [
          { id: 'source', label: 'Исходное качество (Direct)', height: 1080 }
        ],
        audioTracks: [],
        subtitles: []
      },
      provider: {
        id: this.id,
        name: this.name
      }
    };
  }
}

import { buildEmbedWaveCinesrcUrl } from './externalSources/embedwaveAdapter';

export type OnlineEmbed = {
  id: string;
  name: string;
  type: 'iframe';
  url?: string;
  description: string;
  badge?: string;
};

export type TitleInfo = {
  tmdbId: number;
  imdbId?: string;
  kinopoiskId?: number;
  title: string;
  year?: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
};

/**
 * Legacy helper cleaned in Step 2E:
 * Returns strictly the experimental «EmbedWave — Cinesrc» source (?server=cinesrc).
 * Rejected ad-supported and dead sources (MultiEmbed, VidSrc, Collaps, Kinobox widget) are removed.
 */
export function getOnlineEmbedSources(info: TitleInfo): OnlineEmbed[] {
  if (!info.tmdbId || info.tmdbId <= 0) {
    return [];
  }

  const s = info.season || 1;
  const e = info.episode || 1;

  const cinesrcUrl = buildEmbedWaveCinesrcUrl({
    tmdbId: info.tmdbId,
    imdbId: info.imdbId,
    type: info.type,
    season: s,
    episode: e,
    title: info.title,
    year: info.year
  });

  return [
    {
      id: 'embedwave-cinesrc',
      name: 'EmbedWave — Cinesrc',
      type: 'iframe',
      url: cinesrcUrl,
      description: 'Экспериментальный внешний источник (сервер Cinesrc)',
      badge: 'Экспериментальный'
    }
  ];
}

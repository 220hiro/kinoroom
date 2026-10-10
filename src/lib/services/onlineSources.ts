export type OnlineEmbed = {
  id: string;
  name: string;
  type: 'kinobox' | 'iframe';
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

export function getOnlineEmbedSources(info: TitleInfo): OnlineEmbed[] {
  const sources: OnlineEmbed[] = [];

  // 1. Kinobox All-In-One (Kodik, Voidboost, Collaps, Alloha, Turbo)
  sources.push({
    id: 'kinobox',
    name: 'Kinobox Мульти-балансер',
    type: 'kinobox',
    description: 'Все озвучки (Дубляж, LostFilm, HDRezka, Кубик в кубе), выбор качества и серий',
    badge: 'Рекомендуется'
  });

  const s = info.season || 1;
  const e = info.episode || 1;
  const idOrImdb = info.imdbId || info.tmdbId;

  // 2. Multiembed (Global + multi-subtitles)
  const multiUrl = info.type === 'tv'
    ? `https://multiembed.mov/?video_id=${idOrImdb}&tmdb=1&s=${s}&e=${e}`
    : `https://multiembed.mov/?video_id=${idOrImdb}&tmdb=1`;

  sources.push({
    id: 'multiembed',
    name: 'MultiEmbed Global',
    type: 'iframe',
    url: multiUrl,
    description: 'Оригинальный звук, субтитры, стабильный международный поток',
    badge: '1080p'
  });

  // 3. VidSrc
  const vidsrcUrl = info.type === 'tv'
    ? `https://vidsrc.to/embed/tv/${idOrImdb}/${s}/${e}`
    : `https://vidsrc.to/embed/movie/${idOrImdb}`;

  sources.push({
    id: 'vidsrc',
    name: 'VidSrc Direct',
    type: 'iframe',
    url: vidsrcUrl,
    description: 'Быстрый резервный плеер',
    badge: 'Резерв'
  });

  // 4. If Kinopoisk ID exists or we can derive one
  if (info.kinopoiskId) {
    sources.push({
      id: 'collaps',
      name: 'Collaps HD',
      type: 'iframe',
      url: `https://api.delivembid.ws/embed/movie/${info.kinopoiskId}`,
      description: 'Российский балансер с дубляжом',
      badge: 'Дубляж'
    });
  }

  return sources;
}

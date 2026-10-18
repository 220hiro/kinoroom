import { cache, fetchJSON, HOUR } from '@/lib/services/cache';
import { openCatalog } from './catalog';
import type { Media, MetadataProvider, MediaType, Episode, CatalogOptions } from '@/lib/types';


type Row = {
  id: number;
  media_type?: MediaType;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string;
  backdrop_path?: string;
  vote_average?: number;
  runtime?: number;
  genres?: { name: string }[];
  credits?: { cast: { name: string }[] };
  original_language?: string;
  external_ids?: { imdb_id?: string };
  seasons?: { season_number: number; name: string; episode_count: number }[];
};

export const getTMDBKey = () => process.env.TMDB_API_KEY || '';
export const hasTMDB = () => Boolean(getTMDBKey() || process.env.TMDB_ACCESS_TOKEN);

export async function tmdb<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  url.searchParams.set('language', 'ru-RU');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const apiKey = getTMDBKey();
  if (apiKey) url.searchParams.set('api_key', apiKey);

  return cache.remember(
    `tmdb:${path}:${JSON.stringify(params)}`,
    HOUR,
    () => fetchJSON<T>(url.toString(), {
      headers: process.env.TMDB_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}` } : {}
    })
  );
}

function normalize(r: Row, type: MediaType): Media {
  return {
    id: r.id,
    type,
    title: r.title || r.name || '',
    originalTitle: r.original_title || r.original_name || '',
    year: Number((r.release_date || r.first_air_date || '').slice(0, 4)) || 0,
    overview: r.overview || '',
    poster: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : '',
    backdrop: r.backdrop_path ? `https://image.tmdb.org/t/p/w1280${r.backdrop_path}` : '',
    rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : undefined,
    runtime: r.runtime,
    genres: r.genres?.map(g => g.name) || [],
    cast: r.credits?.cast.slice(0, 8).map(c => c.name) || [],
    originalLanguage: r.original_language || 'en',
    imdbId: r.external_ids?.imdb_id,
    seasons: r.seasons?.filter(s => s.season_number > 0).map(s => ({
      number: s.season_number,
      name: s.name,
      count: s.episode_count
    }))
  };
}

export class TMDBProvider implements MetadataProvider {
  async search(query: string) {
    const q = query.trim();
    if (!q) return [];
    if (/^tt\d{5,12}$/i.test(q)) {
      const r = await tmdb<{ movie_results: Row[]; tv_results: Row[] }>(`find/${q.toLowerCase()}`, { external_source: 'imdb_id' });
      return [...r.movie_results.map(x => normalize(x, 'movie')), ...r.tv_results.map(x => normalize(x, 'tv'))];
    }
    const match = q.match(/^(?:(movie|tv)[:/ ]|tmdb[:/ ])?(\d+)$/i);
    if (match) {
      const types: MediaType[] = match[1] ? [match[1].toLowerCase() as MediaType] : ['movie', 'tv'];
      const r = await Promise.allSettled(types.map(t => this.details(t, Number(match[2]))));
      return r.flatMap(v => v.status === 'fulfilled' ? [v.value] : []);
    }
    const r = await tmdb<{ results: Row[] }>('search/multi', { query: q, include_adult: 'false' });
    return r.results
      .filter(x => x.media_type === 'movie' || x.media_type === 'tv')
      .map(x => normalize(x, x.media_type!));
  }

  async details(type: MediaType, id: number) {
    return normalize(await tmdb<Row>(`${type}/${id}`, { append_to_response: 'external_ids,credits' }), type);
  }

  async season(id: number, season: number): Promise<Episode[]> {
    try {
      const r = await tmdb<{ episodes: { episode_number: number; name: string; overview: string; runtime: number; still_path: string }[] }>(`tv/${id}/season/${season}`);
      return r.episodes.map(e => ({
        number: e.episode_number,
        name: e.name,
        overview: e.overview,
        runtime: e.runtime,
        still: e.still_path ? `https://image.tmdb.org/t/p/w300${e.still_path}` : undefined
      }));
    } catch {
      return [];
    }
  }

  async home() {
    const sections = [
      ['🔥 Сегодня в тренде', 'trending/all/day', 'movie'],
      ['🍿 Популярные фильмы', 'movie/popular', 'movie'],
      ['📺 Популярные сериалы', 'tv/popular', 'tv'],
      ['🎬 Новинки кинопроката', 'movie/now_playing', 'movie'],
      ['⭐ Топ с высоким рейтингом', 'movie/top_rated', 'movie']
    ] as const;

    const results = await Promise.allSettled(
      sections.map(async ([title, path, defaultType]) => {
        const data = await tmdb<{ results: Row[] }>(path);
        const items = data.results
          .filter(r => !r.media_type || ['movie', 'tv'].includes(r.media_type))
          .slice(0, 15)
          .map(r => normalize(r, r.media_type || defaultType));
        return { title, items };
      })
    );

    const successful = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
    if (successful.length === 0) {
      return [{ title: 'Открытое кино', items: openCatalog }];
    }
    return successful;
  }

  async catalog(options: CatalogOptions) {
    const type = options.type || 'movie';
    const params: Record<string, string> = {
      sort_by: options.sortBy || 'popularity.desc',
      page: (options.page || 1).toString(),
      'vote_count.gte': options.sortBy === 'vote_average.desc' ? '100' : '20'
    };

    if (options.genre) {
      params['with_genres'] = options.genre;
    }

    try {
      const data = await tmdb<{ results: Row[]; total_pages: number }>(`discover/${type}`, params);
      const items = (data.results || []).map(r => normalize(r, type));
      return {
        items,
        totalPages: Math.min(data.total_pages || 1, 50)
      };
    } catch {
      return { items: [], totalPages: 1 };
    }
  }
}

export class OpenMetadataProvider implements MetadataProvider {
  async search(query: string) {
    const q = query.trim().toLowerCase().replace(/^(tmdb|movie)[:/ ]/, '');
    return openCatalog.filter(x => `${x.title} ${x.originalTitle} ${x.id} ${x.imdbId}`.toLowerCase().includes(q));
  }

  async details(type: MediaType, id: number) {
    const m = openCatalog.find(x => x.id === id && x.type === type);
    if (!m) throw new Error('TITLE_NOT_FOUND');
    return m;
  }

  async season(): Promise<Episode[]> {
    return [];
  }

  async home() {
    return [{ title: 'Открытое кино', items: openCatalog }];
  }

  async catalog(options: CatalogOptions) {
    let items = openCatalog.filter(x => x.type === options.type);
    if (options.genre) {
      items = items.filter(x => x.genres.includes(options.genre!));
    }
    return { items, totalPages: 1 };
  }
}

export const metadata = (): MetadataProvider => hasTMDB() ? new TMDBProvider() : new OpenMetadataProvider();

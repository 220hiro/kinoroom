'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Film, Tv, SlidersHorizontal, Sparkles, ArrowDown } from 'lucide-react';
import { MediaCard } from '@/components/MediaCard';
import { Media, MediaType } from '@/lib/types';

const MOVIE_GENRES = [
  { id: '', name: 'Все жанры' },
  { id: '28', name: 'Боевики' },
  { id: '878', name: 'Фантастика' },
  { id: '35', name: 'Комедии' },
  { id: '18', name: 'Драмы' },
  { id: '27', name: 'Ужасы' },
  { id: '53', name: 'Триллеры' },
  { id: '16', name: 'Мультфильмы' },
  { id: '14', name: 'Фэнтези' },
  { id: '9648', name: 'Детективы' },
  { id: '12', name: 'Приключения' }
];

const TV_GENRES = [
  { id: '', name: 'Все жанры' },
  { id: '10759', name: 'Боевики & Приключения' },
  { id: '10765', name: 'НФ & Фэнтези' },
  { id: '35', name: 'Комедии' },
  { id: '18', name: 'Драмы' },
  { id: '80', name: 'Криминал' },
  { id: '9648', name: 'Детективы' },
  { id: '16', name: 'Анимация / Аниме' }
];

const SORT_OPTIONS = [
  { id: 'popularity.desc', label: 'По популярности' },
  { id: 'vote_average.desc', label: 'По рейтингу' },
  { id: 'primary_release_date.desc', label: 'Сначала новинки' }
];

function CatalogContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialType = (searchParams.get('type') === 'tv' ? 'tv' : 'movie') as MediaType;
  const initialGenre = searchParams.get('genre') || '';

  const [type, setType] = useState<MediaType>(initialType);
  const [selectedGenre, setSelectedGenre] = useState<string>(initialGenre);
  const [sortBy, setSortBy] = useState<string>('popularity.desc');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Load catalog when filters change
  useEffect(() => {
    async function fetchCatalog() {
      setLoading(true);
      setPage(1);
      try {
        const params = new URLSearchParams({
          type,
          sort: sortBy,
          page: '1'
        });
        if (selectedGenre) params.append('genre', selectedGenre);

        const res = await fetch(`/api/media/catalog?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || []);
          setTotalPages(data.totalPages || 1);
        }
      } catch (err) {
        console.error('Catalog load error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchCatalog();
  }, [type, selectedGenre, sortBy]);

  // Load more pages
  const handleLoadMore = async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const params = new URLSearchParams({
        type,
        sort: sortBy,
        page: nextPage.toString()
      });
      if (selectedGenre) params.append('genre', selectedGenre);

      const res = await fetch(`/api/media/catalog?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems((prev) => [...prev, ...(data.items || [])]);
        setPage(nextPage);
      }
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const genres = type === 'movie' ? MOVIE_GENRES : TV_GENRES;

  return (
    <div className="min-h-screen pt-24 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-center gap-3">
            <span>{type === 'movie' ? 'Каталог фильмов' : 'Каталог сериалов'}</span>
            <span className="text-xs px-2.5 py-1 rounded-full bg-red-600/20 text-red-400 font-bold border border-red-500/30">
              {items.length} {type === 'movie' ? 'фильмов' : 'сериалов'}
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Мировые премьеры, хиты и классика с мгновенным просмотром
          </p>
        </div>

        {/* Type Toggle & Sort Selector */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Type Toggle */}
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => {
                setType('movie');
                setSelectedGenre('');
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                type === 'movie'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Film className="w-3.5 h-3.5" /> Фильмы
            </button>
            <button
              onClick={() => {
                setType('tv');
                setSelectedGenre('');
              }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                type === 'tv'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Tv className="w-3.5 h-3.5" /> Сериалы
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent text-gray-200 font-medium focus:outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-gray-900 text-white">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Genre Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
        {genres.map((g) => (
          <button
            key={g.id}
            onClick={() => setSelectedGenre(g.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              selectedGenre === g.id
                ? 'bg-white text-black font-bold shadow-md'
                : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5'
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center my-20 space-y-3">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-gray-400 font-medium">Загрузка каталога...</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {items.map((item) => (
              <div key={`${item.type}-${item.id}`} className="flex justify-center">
                <MediaCard media={item} />
              </div>
            ))}
          </div>

          {/* Load More Button */}
          {page < totalPages && (
            <div className="flex justify-center pt-4">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-white font-bold text-sm transition-all hover:scale-105 cursor-pointer disabled:opacity-50 shadow-xl"
              >
                {loadingMore ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowDown className="w-4 h-4 text-red-500" />
                )}
                <span>{loadingMore ? 'Загрузка...' : 'Загрузить еще'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-24 text-center text-gray-400">Загрузка каталога...</div>}>
      <CatalogContent />
    </Suspense>
  );
}

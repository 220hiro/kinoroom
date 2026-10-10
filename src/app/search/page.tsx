'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Search, Film, Magnet, X } from 'lucide-react';
import { MediaCard } from '@/components/MediaCard';
import { Media } from '@/lib/types';
import Link from 'next/link';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQ = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clean = query.trim();
    if (!clean) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/media/search?q=${encodeURIComponent(clean)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.replace(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="min-h-screen pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Search Header */}
      <div className="max-w-2xl mx-auto text-center mb-8">
        <h1 className="text-3xl font-black text-white mb-4">Поиск фильмов и сериалов</h1>
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Введите название фильма или сериала..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-12 text-white placeholder-gray-400 focus:outline-none focus:border-red-500 focus:bg-white/10 text-base shadow-xl"
          />
          <Search className="w-5 h-5 text-gray-400 absolute left-4 top-4" />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setResults([]);
                router.replace('/search');
              }}
              className="absolute right-4 top-4 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </form>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center my-12">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Results Grid */}
      {!loading && (
        <>
          {results.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">
                  Найдено результатов: {results.length}
                </h2>
                {query && (
                  <Link
                    href={`/torrent?q=${encodeURIComponent(query)}`}
                    className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-semibold"
                  >
                    <Magnet className="w-3.5 h-3.5" /> Искать торренты для «{query}»
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {results.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="flex justify-center">
                    <MediaCard media={item} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            query && (
              <div className="text-center py-16">
                <Film className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-gray-300 mb-1">Ничего не найдено</h3>
                <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
                  Попробуйте изменить поисковый запрос или воспользоваться прямым поиском в торрент-плеере.
                </p>
                <Link
                  href={`/torrent?q=${encodeURIComponent(query)}`}
                  className="inline-flex items-center gap-2 bg-amber-500 text-black font-bold px-5 py-2.5 rounded-xl text-sm"
                >
                  <Magnet className="w-4 h-4" /> Искать в торрентах
                </Link>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-24 text-center text-gray-400">Загрузка...</div>}>
      <SearchContent />
    </Suspense>
  );
}

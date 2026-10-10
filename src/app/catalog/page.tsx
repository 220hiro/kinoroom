'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Film, Tv } from 'lucide-react';
import { MediaCard } from '@/components/MediaCard';
import { Media } from '@/lib/types';

function CatalogContent() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  const [type, setType] = useState<'movie' | 'tv'>(initialType);
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCatalog() {
      setLoading(true);
      try {
        const res = await fetch(`/api/media/home`);
        if (res.ok) {
          const sections = await res.json();
          // Find matching category
          const targetSection = sections.find((s: any) =>
            type === 'tv' ? s.title.includes('сериалы') : s.title.includes('фильмы')
          ) || sections[0];
          setItems(targetSection?.items || []);
        }
      } catch (err) {
        console.error('Catalog load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCatalog();
  }, [type]);

  return (
    <div className="min-h-screen pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Catalog Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-white">
            {type === 'movie' ? 'Каталог фильмов' : 'Каталог сериалов'}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Популярные новинки и мировые премьеры
          </p>
        </div>

        {/* Type Toggle */}
        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10 w-fit">
          <button
            onClick={() => setType('movie')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              type === 'movie'
                ? 'bg-red-600 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" /> Фильмы
          </button>
          <button
            onClick={() => setType('tv')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              type === 'tv'
                ? 'bg-red-600 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Tv className="w-3.5 h-3.5" /> Сериалы
          </button>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center my-16">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => (
            <div key={`${item.type}-${item.id}`} className="flex justify-center">
              <MediaCard media={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-24 text-center text-gray-400">Загрузка...</div>}>
      <CatalogContent />
    </Suspense>
  );
}

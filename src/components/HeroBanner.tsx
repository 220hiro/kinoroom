'use client';

import React from 'react';
import Link from 'next/link';
import { Play, Info, Star, Magnet } from 'lucide-react';
import { Media } from '@/lib/types';

interface HeroBannerProps {
  media?: Media;
}

export function HeroBanner({ media }: HeroBannerProps) {
  if (!media) return null;

  const backdrop = media.backdrop || media.poster;

  return (
    <div className="relative w-full h-[70vh] min-h-[500px] max-h-[750px] overflow-hidden">
      {/* Background Image with Gradual Fades */}
      <div className="absolute inset-0">
        <img
          src={backdrop}
          alt={media.title}
          className="w-full h-full object-cover object-center"
        />
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#090a0f] via-[#090a0f]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090a0f] via-[#090a0f]/80 to-transparent" />
      </div>

      {/* Content Container */}
      <div className="relative max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex flex-col justify-end pb-16 z-10">
        <div className="max-w-2xl space-y-4">
          {/* Metadata badges */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {media.rating && (
              <span className="flex items-center gap-1 bg-amber-500/20 text-amber-400 font-semibold px-2.5 py-0.5 rounded-md border border-amber-500/30">
                <Star className="w-3.5 h-3.5 fill-current" />
                {media.rating.toFixed(1)}
              </span>
            )}
            <span className="text-gray-300 font-medium">{media.year}</span>
            <span className="uppercase text-xs font-bold tracking-wider px-2 py-0.5 rounded bg-white/10 text-gray-200">
              {media.type === 'tv' ? 'Сериал' : 'Фильм'}
            </span>
            {media.genres.slice(0, 3).map((g) => (
              <span key={g} className="text-gray-400 text-xs">
                • {g}
              </span>
            ))}
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-tight drop-shadow-md">
            {media.title}
          </h1>

          {/* Overview */}
          <p className="text-gray-300 text-sm sm:text-base line-clamp-3 leading-relaxed drop-shadow">
            {media.overview || 'Описание фильма загружается...'}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href={`/title/${media.type}/${media.id}`}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-all duration-300 hover:scale-105 shadow-xl shadow-red-600/30"
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Смотреть онлайн</span>
            </Link>

            <Link
              href={`/title/${media.type}/${media.id}#torrents`}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-5 py-3 rounded-xl border border-white/10 backdrop-blur-md transition-all duration-300 hover:scale-105"
            >
              <Magnet className="w-4 h-4 text-amber-400" />
              <span>Торренты 4K / 1080p</span>
            </Link>

            <Link
              href={`/title/${media.type}/${media.id}`}
              className="flex items-center gap-2 bg-black/40 hover:bg-black/60 text-gray-300 hover:text-white px-4 py-3 rounded-xl border border-white/5 backdrop-blur-md transition-all"
            >
              <Info className="w-4 h-4" />
              <span className="hidden sm:inline">О фильме</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

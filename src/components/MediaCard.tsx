'use client';

import React from 'react';
import Link from 'next/link';
import { Star, Play } from 'lucide-react';
import { Media } from '@/lib/types';

interface MediaCardProps {
  media: Media;
}

export function MediaCard({ media }: MediaCardProps) {
  const fallbackPoster = 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=60';
  const posterUrl = media.poster || fallbackPoster;

  return (
    <Link
      href={`/title/${media.type}/${media.id}`}
      className="group relative flex-shrink-0 w-40 sm:w-48 flex flex-col rounded-xl overflow-hidden bg-[#13151f] border border-white/5 hover:border-red-500/50 hover:scale-105 transition-all duration-300 shadow-lg glow-card cursor-pointer"
    >
      {/* Poster Image Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-900">
        <img
          src={posterUrl}
          alt={media.title}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
        />

        {/* Overlay gradient on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-xl transform scale-75 group-hover:scale-100 transition-transform">
            <Play className="w-6 h-6 fill-current ml-1" />
          </div>
        </div>

        {/* Rating Badge */}
        {media.rating !== undefined && media.rating > 0 && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md text-xs font-semibold text-amber-400 border border-white/10">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{media.rating.toFixed(1)}</span>
          </div>
        )}

        {/* Type Badge */}
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-black/60 backdrop-blur-md text-gray-300 border border-white/10">
          {media.type === 'tv' ? 'Сериал' : 'Фильм'}
        </div>
      </div>

      {/* Info Section */}
      <div className="p-3 flex flex-col justify-between flex-grow">
        <h3 className="text-sm font-semibold text-gray-100 group-hover:text-red-400 transition-colors line-clamp-1">
          {media.title}
        </h3>
        <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
          <span>{media.year || '—'}</span>
          {media.genres.length > 0 && (
            <span className="text-[11px] truncate max-w-[90px] text-gray-400">
              {media.genres[0]}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

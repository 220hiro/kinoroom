'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Play, Clock, X, Sparkles } from 'lucide-react';
import { WatchProgress, getActiveProfileId, getHistory } from '@/lib/storage';

export function ContinueWatching() {
  const [history, setHistory] = useState<WatchProgress[]>([]);
  const [mounted, setMounted] = useState(false);

  const loadHistory = () => {
    const profileId = getActiveProfileId();
    const items = getHistory(profileId).filter((h) => h.currentTime > 20 && h.duration > 0);
    setHistory(items);
  };

  useEffect(() => {
    setMounted(true);
    loadHistory();

    const handleStorage = () => loadHistory();
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleRemove = (e: React.MouseEvent, mediaId: number, mediaType: string) => {
    e.preventDefault();
    e.stopPropagation();
    const profileId = getActiveProfileId();
    const raw = localStorage.getItem(`kinoroom:${profileId}:history`);
    if (raw) {
      try {
        const parsed: WatchProgress[] = JSON.parse(raw);
        const filtered = parsed.filter(
          (h) => !(h.media.id === mediaId && h.media.type === mediaType)
        );
        localStorage.setItem(`kinoroom:${profileId}:history`, JSON.stringify(filtered));
        setHistory(filtered);
      } catch (err) {
        console.error(err);
      }
    }
  };

  if (!mounted || history.length === 0) {
    return null;
  }

  const formatRemaining = (cur: number, dur: number) => {
    const rem = Math.max(0, dur - cur);
    const m = Math.floor(rem / 60);
    if (m > 60) {
      const h = Math.floor(m / 60);
      return `${h} ч ${m % 60} мин`;
    }
    return `${m} мин`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <span>Продолжить просмотр</span>
        </h2>
        <span className="text-xs text-gray-400 font-medium">
          {history.length} {history.length === 1 ? 'видео' : 'видео'}
        </span>
      </div>

      <div className="flex gap-4 overflow-x-auto no-scrollbar pb-3 -mx-4 px-4 sm:mx-0 sm:px-0">
        {history.map((item) => {
          const progressPercent = Math.min(
            100,
            Math.max(2, Math.round((item.currentTime / item.duration) * 100))
          );
          const image = item.media.backdrop || item.media.poster;

          return (
            <Link
              key={`${item.media.type}-${item.media.id}`}
              href={`/title/${item.media.type}/${item.media.id}`}
              className="flex-shrink-0 w-64 sm:w-72 bg-[#13151f] rounded-2xl overflow-hidden border border-white/10 hover:border-amber-500/50 transition-all duration-300 group hover:scale-[1.02] shadow-xl relative flex flex-col justify-between"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-video w-full overflow-hidden bg-black/60">
                <img
                  src={image}
                  alt={item.media.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

                {/* Big Play Overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                  <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={(e) => handleRemove(e, item.media.id, item.media.type)}
                  title="Удалить из истории"
                  className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/90 text-gray-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                {/* Season / Episode Badge */}
                {item.season && item.episode && (
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/80 text-amber-400 border border-amber-500/30 text-[11px] font-bold">
                    S{item.season} E{item.episode}
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-white/10 relative">
                <div
                  className="h-full bg-gradient-to-r from-red-600 to-amber-500 rounded-r-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Card Meta Info */}
              <div className="p-3.5 flex flex-col justify-between flex-grow">
                <div>
                  <h3 className="text-sm font-bold text-white truncate group-hover:text-amber-400 transition-colors">
                    {item.media.title}
                  </h3>
                  <div className="flex items-center justify-between text-xs text-gray-400 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-500" />
                      Осталось: {formatRemaining(item.currentTime, item.duration)}
                    </span>
                    <span className="font-semibold text-gray-300">{progressPercent}%</span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

interface KinoboxPlayerProps {
  title: string;
  imdbId?: string;
  kinopoiskId?: number;
}

/**
 * KinoboxPlayer (Preserved, inactive in UI while Kinobox/Kodik API is unavailable).
 * Does not load third-party scripts automatically.
 */
export function KinoboxPlayer({ title }: KinoboxPlayerProps) {
  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
      <div className="flex flex-col items-center justify-center bg-black/90 p-6 text-center gap-3">
        <AlertCircle className="w-10 h-10 text-amber-500" />
        <h4 className="text-base font-semibold text-white">Балансер Kinobox / Kodik временно недоступен</h4>
        <p className="text-xs text-gray-400 max-w-md">
          Для просмотра «{title}» используйте «Плеер КиноРум», «Торренты» или экспериментальный источник «EmbedWave — Cinesrc».
        </p>
      </div>
    </div>
  );
}

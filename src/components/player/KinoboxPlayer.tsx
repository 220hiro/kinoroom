'use client';

import React, { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Loader2, AlertCircle } from 'lucide-react';

interface KinoboxPlayerProps {
  title: string;
  imdbId?: string;
  kinopoiskId?: number;
}

export function KinoboxPlayer({ title, imdbId, kinopoiskId }: KinoboxPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [initError, setInitError] = useState(false);

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current) return;

    try {
      const Kinobox = (window as any).Kinobox;
      if (!Kinobox) {
        setInitError(true);
        return;
      }

      // Clear previous instances if any
      containerRef.current.innerHTML = '';

      new Kinobox(containerRef.current, {
        search: {
          kinopoisk: kinopoiskId || '',
          imdb: imdbId || '',
          title: title
        },
        menu: {
          enable: true,
          default: 'menu_list',
          format: '{name}'
        },
        players: {
          alloha: { enable: true, position: 1 },
          kodik: { enable: true, position: 2 },
          voidboost: { enable: true, position: 3 },
          collaps: { enable: true, position: 4 },
          turbo: { enable: true, position: 5 }
        }
      }).init();
    } catch (e) {
      console.error('Kinobox init error:', e);
      setInitError(true);
    }
  }, [scriptLoaded, title, imdbId, kinopoiskId]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
      {/* Kinobox Script */}
      <Script
        src="https://kinobox.tv/kinobox.min.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => setInitError(true)}
      />

      {/* Target Container */}
      <div ref={containerRef} className="w-full h-full kinobox_player" />

      {/* Loading Overlay */}
      {!scriptLoaded && !initError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-3 z-10">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          <p className="text-sm text-gray-300">Подключение мульти-балансера озвучек...</p>
        </div>
      )}

      {/* Error fallback */}
      {initError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 p-6 text-center gap-3 z-10">
          <AlertCircle className="w-10 h-10 text-amber-500" />
          <h4 className="text-base font-semibold text-white">Онлайн-балансер загружается</h4>
          <p className="text-xs text-gray-400 max-w-md">
            Если балансер недоступен в вашем регионе, вы можете переключиться на вкладку «Торрент-стриминг» или «Резервный плеер».
          </p>
        </div>
      )}
    </div>
  );
}

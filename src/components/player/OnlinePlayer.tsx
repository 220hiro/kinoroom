'use client';

import React, { useState } from 'react';
import { Play, Sparkles, RefreshCw, ExternalLink, ShieldCheck, ShieldAlert } from 'lucide-react';

interface OnlinePlayerProps {
  tmdbId: number;
  imdbId?: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title: string;
}

type ProviderKey = 'vidlink' | 'vidsrc_to' | 'vidsrc_sh' | 'multiembed' | 'twoembed' | 'anyembed';

export function OnlinePlayer({
  tmdbId,
  imdbId,
  type,
  season = 1,
  episode = 1,
  title
}: OnlinePlayerProps) {
  const [provider, setProvider] = useState<ProviderKey>('vidlink');
  const [key, setKey] = useState(0);
  const [blockAds, setBlockAds] = useState(true);

  const idOrImdb = imdbId || tmdbId;

  // Build provider URLs
  const urls: Record<ProviderKey, string> = {
    vidlink:
      type === 'tv'
        ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
        : `https://vidlink.pro/movie/${tmdbId}`,
    vidsrc_to:
      type === 'tv'
        ? `https://vidsrc.to/embed/tv/${idOrImdb}/${season}/${episode}`
        : `https://vidsrc.to/embed/movie/${idOrImdb}`,
    vidsrc_sh:
      type === 'tv'
        ? `https://vidsrc.sh/embed/tv?imdb=${imdbId || ''}&tmdb=${tmdbId}&season=${season}&episode=${episode}`
        : `https://vidsrc.sh/embed/movie?imdb=${imdbId || ''}&tmdb=${tmdbId}`,
    multiembed:
      type === 'tv'
        ? `https://multiembed.mov/?video_id=${idOrImdb}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/?video_id=${idOrImdb}&tmdb=1`,
    twoembed:
      type === 'tv'
        ? `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`
        : `https://www.2embed.cc/embed/${tmdbId}`,
    anyembed:
      type === 'tv'
        ? `https://anyembed.xyz/embed/tmdb-tv-${tmdbId}-${season}-${episode}`
        : `https://anyembed.xyz/embed/tmdb-movie-${tmdbId}`
  };

  const currentUrl = urls[provider];

  const providersList = [
    { id: 'vidlink', name: 'VidLink PRO', badge: '1080p Рекомендуемый', desc: 'Быстрый поток с субтитрами' },
    { id: 'vidsrc_to', name: 'VidSrc HD', badge: 'Стабильный', desc: 'Популярный мировой балансер' },
    { id: 'vidsrc_sh', name: 'VidSrc Direct', badge: 'Прямой поток', desc: 'Без промежуточных редиректов' },
    { id: 'multiembed', name: 'MultiEmbed', badge: 'Субтитры', desc: 'Мульти-дорожки и субтитры' },
    { id: 'twoembed', name: '2Embed', badge: 'Легкий', desc: 'Быстрый легкий плеер' },
    { id: 'anyembed', name: 'AnyEmbed', badge: 'Резерв', desc: 'Запасной сервер' }
  ] as const;

  return (
    <div className="space-y-3">
      {/* Provider Selector Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#13151f] p-2.5 rounded-xl border border-white/10">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400 font-semibold px-2 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Сервер:
          </span>
          {providersList.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setProvider(p.id);
                setKey((k) => k + 1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                provider === p.id
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Anti-Ad Shield Toggle */}
          <button
            onClick={() => setBlockAds(!blockAds)}
            title="Блокировать всплывающую рекламу (внимание: на некоторых устройствах может ограничивать запуск видео)"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer border ${
              blockAds
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            {blockAds ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Анти-реклама: ВКЛ</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Анти-реклама: ВЫКЛ</span>
              </>
            )}
          </button>

          <button
            onClick={() => setKey((k) => k + 1)}
            title="Перезагрузить плеер"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a
            href={currentUrl}
            target="_blank"
            rel="noreferrer"
            title="Открыть в новом окне"
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Responsive Iframe Container */}
      <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
        <iframe
          key={`${provider}-${key}-${season}-${episode}-${blockAds}`}
          src={currentUrl}
          sandbox={
            blockAds
              ? 'allow-scripts allow-same-origin allow-forms allow-presentation'
              : undefined
          }
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          className="w-full h-full border-0"
        />
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between text-xs text-gray-400 gap-2">
        <span>
          💡 <strong>Совет:</strong> если видео на сервере не загружается, нажмите на другой сервер выше (VidLink, VidSrc HD, MultiEmbed).
        </span>
        <span className="text-gray-400">
          Для 100% чистого видео без рекламы перейдите на вкладку <strong className="text-amber-400">«🧲 Торренты»</strong>.
        </span>
      </div>
    </div>
  );
}

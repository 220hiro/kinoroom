'use client';

import React, { useState, useEffect } from 'react';
import {
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Tv,
  Film,
  Info,
  AlertTriangle
} from 'lucide-react';
import { ExternalSourceItem } from '@/lib/services/externalSources/types';
import { isValidExternalIframeUrl } from '@/lib/services/externalSources/allowlist';

interface OnlinePlayerProps {
  tmdbId: number;
  imdbId?: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title: string;
}

/**
 * OnlinePlayer (Step 2E)
 *
 * Simplified external player displaying strictly the single experimental card:
 * «EmbedWave — Cinesrc» (?server=cinesrc).
 *
 * Security & Honesty Guarantees:
 *  - Only URLs matching TRUSTED_IFRAME_DOMAINS (embedwave.cc) and containing ?server=cinesrc are embedded.
 *  - Isolated via sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-presentation"
 *    (blocks allow-popups and allow-top-navigation).
 *  - Does NOT claim unverified 1080p, Russian dubbing, or guaranteed ad-free status.
 *  - Does NOT treat iframe onLoad as confirmed video playback.
 */
export function OnlinePlayer({
  tmdbId,
  imdbId,
  type,
  season = 1,
  episode = 1,
  title
}: OnlinePlayerProps) {
  const [source, setSource] = useState<ExternalSourceItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [iframeContainerLoaded, setIframeContainerLoaded] = useState<boolean>(false);
  const [iframeLoadFailed, setIframeLoadFailed] = useState<boolean>(false);

  useEffect(() => {
    let isCancelled = false;

    async function fetchSource() {
      setIsLoading(true);
      setLoadError(null);
      setIframeContainerLoaded(false);
      setIframeLoadFailed(false);

      try {
        const params = new URLSearchParams({
          tmdbId: String(tmdbId),
          type,
          season: String(season),
          episode: String(episode)
        });
        if (imdbId) params.append('imdbId', imdbId);
        if (title) params.append('title', title);

        const res = await fetch(`/api/playback/external-sources?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Ошибка получения источника (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (isCancelled) return;

        if (data.success && Array.isArray(data.sources) && data.sources.length > 0) {
          const cinesrcSource = data.sources.find(
            (s: ExternalSourceItem) =>
              s.adapter === 'embedwave' &&
              s.iframeUrl &&
              s.iframeUrl.includes('server=cinesrc')
          );

          if (cinesrcSource) {
            setSource(cinesrcSource);
          } else {
            setSource(data.sources[0]);
          }
        } else {
          setSource(null);
          setLoadError(data.message || 'Экспериментальный источник недоступен для данного тайтла.');
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[OnlinePlayer] Fetch error:', err);
          setLoadError(err?.message || 'Не удалось подключиться к API внешнего источника.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchSource();

    return () => {
      isCancelled = true;
    };
  }, [tmdbId, imdbId, type, season, episode, title]);

  const isPlayable = Boolean(
    source &&
      source.status === 'available' &&
      source.iframeUrl &&
      source.iframeUrl.includes('server=cinesrc')
  );
  const isValidUrl = isPlayable && isValidExternalIframeUrl(source?.iframeUrl);

  // Strict sandbox matching Cinesrc's documented embed isolation (no allow-popups, no allow-top-navigation)
  const iframeSandbox = 'allow-scripts allow-same-origin allow-forms allow-modals allow-presentation';

  const handleResetToCinesrc = () => {
    setIframeContainerLoaded(false);
    setIframeLoadFailed(false);
    setIframeKey((k) => k + 1);
  };

  return (
    <div className="space-y-4" data-testid="online-player-container">
      {/* Experimental Card Header: «EmbedWave — Cinesrc» */}
      <div className="bg-[#13151f] p-4 rounded-2xl border border-white/10 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div
              data-testid="experimental-source-card"
              className="px-3.5 py-2 rounded-xl bg-red-600/20 border border-red-500/40 text-white text-xs sm:text-sm font-bold flex items-center gap-2"
            >
              {type === 'tv' ? (
                <Tv className="w-4 h-4 text-red-400 shrink-0" />
              ) : (
                <Film className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>EmbedWave — Cinesrc</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                Экспериментальный
              </span>
            </div>

            {type === 'tv' && (
              <span className="text-xs text-gray-300 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 font-medium">
                Сезон {season}, Серия {episode}
              </span>
            )}
          </div>

          {/* Action Controls */}
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {isValidUrl && source?.iframeUrl && (
              <>
                <button
                  onClick={handleResetToCinesrc}
                  title="Сбросить и перезагрузить сервер Cinesrc"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer border border-white/10"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Сбросить на Cinesrc</span>
                </button>

                <a
                  href={source.iframeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Открыть EmbedWave — Cinesrc в отдельной вкладке"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer border border-white/10"
                >
                  <span className="hidden sm:inline">Открыть отдельно</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Real Verified Capabilities List (No false 1080p / RU / Ad-free badges) */}
        <div
          data-testid="cinesrc-capabilities-info"
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-white/5 text-xs text-gray-300"
        >
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
            <span>Воспроизведение фильма подтверждено на iPhone для тестового TMDB 550.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
            <span>Русская озвучка не подтверждена.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
            <span>Качество не подтверждено.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
            <span>Полное отсутствие рекламы не подтверждено.</span>
          </div>
        </div>
      </div>

      {/* Video Iframe Container */}
      <div className="relative w-full aspect-video min-h-[260px] sm:min-h-[360px] md:min-h-[460px] bg-[#0d0f17] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Loader2 className="w-9 h-9 text-red-500 animate-spin" />
            <p className="text-xs text-gray-300">Подключение к EmbedWave — Cinesrc...</p>
          </div>
        ) : isValidUrl && source?.iframeUrl && !iframeLoadFailed ? (
          <>
            <iframe
              key={`${source.id}-${iframeKey}-${tmdbId}-${season}-${episode}`}
              src={source.iframeUrl}
              title="EmbedWave — Cinesrc"
              className="w-full h-full border-0 absolute inset-0"
              referrerPolicy="no-referrer"
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              sandbox={iframeSandbox}
              onLoad={() => setIframeContainerLoaded(true)}
              onError={() => setIframeLoadFailed(true)}
            />
          </>
        ) : (
          /* Honest Unavailable / Error Fallback Card instead of a black screen */
          <div
            data-testid="online-player-error-fallback"
            className="flex flex-col items-center justify-center p-6 text-center max-w-lg space-y-3"
          >
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-white font-bold text-sm sm:text-base">
              Источник «EmbedWave — Cinesrc» недоступен
            </h4>
            <p className="text-gray-400 text-xs leading-relaxed">
              {loadError ||
                source?.diagnostics ||
                'Не удалось загрузить внешний плеер Cinesrc для выбранного фильма или серии. Наличие каждого тайтла на внешнем сервере не гарантируется.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                onClick={handleResetToCinesrc}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Повторить попытку</span>
              </button>
              {source?.iframeUrl && (
                <a
                  href={source.iframeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5"
                >
                  <span>Открыть ссылку напрямую</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Warning regarding internal server switcher & non-guaranteed availability */}
      <div className="p-3.5 bg-[#11131c] rounded-xl border border-amber-500/20 text-[11px] sm:text-xs text-gray-400 space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Важное примечание по выбору сервера внутри iframe:</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-gray-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Sandbox активен • {iframeContainerLoaded ? 'Фрейм загружен (поток проверяется вручную)' : 'Ожидание фрейма'}
            </span>
          </div>
        </div>
        <p className="leading-relaxed">
          Кнопочный параметр <code className="text-gray-200 bg-white/5 px-1 py-0.5 rounded">?server=cinesrc</code> автоматически выбирает проверенный сервер <strong className="text-gray-200">Cinesrc</strong> при открытии.
          Внутри самого плеера EmbedWave остаётся собственное меню смены серверов — <strong className="text-amber-300">не переключайтесь на Multi HD (nxsha)</strong>, так как на нём зафиксированы несоответствие фильма и зависания. Если вы случайно переключили сервер или видео не отвечает, нажмите кнопку <strong className="text-gray-200">«Сбросить на Cinesrc»</strong> выше.
        </p>
      </div>
    </div>
  );
}

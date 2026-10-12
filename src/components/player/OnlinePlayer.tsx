'use client';

import React, { useState, useEffect } from 'react';
import {
  Play,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Tv,
  Film,
  Info
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

export function OnlinePlayer({
  tmdbId,
  imdbId,
  type,
  season = 1,
  episode = 1,
  title
}: OnlinePlayerProps) {
  const [sources, setSources] = useState<ExternalSourceItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isSandboxStrict, setIsSandboxStrict] = useState<boolean>(true);

  // Fetch verified sources from Playback External Sources API
  useEffect(() => {
    let isCancelled = false;

    async function fetchSources() {
      setIsLoading(true);
      setLoadError(null);
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
          throw new Error(`Ошибка загрузки источников (HTTP ${res.status})`);
        }

        const data = await res.json();
        if (isCancelled) return;

        if (data.success && Array.isArray(data.sources)) {
          setSources(data.sources);

          // Select first available source with valid iframeUrl, otherwise first item
          const firstAvailable = data.sources.find(
            (s: ExternalSourceItem) => s.status === 'available' && s.iframeUrl
          );
          if (firstAvailable) {
            setSelectedSourceId(firstAvailable.id);
          } else if (data.sources.length > 0) {
            setSelectedSourceId(data.sources[0].id);
          }
        } else {
          setSources([]);
          setLoadError(data.message || 'Источники не найдены');
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[OnlinePlayer] Fetch error:', err);
          setLoadError(err?.message || 'Не удалось связаться с сервером источников');
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchSources();

    return () => {
      isCancelled = true;
    };
  }, [tmdbId, imdbId, type, season, episode, title]);

  // Shield against untrusted postMessages (e.g. anti-devtools from third-party iframes)
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Third-party iframes might post events like 'VS_DEVTOOLS' or internal commands.
      // We safely intercept and drop them to prevent interference with KinoRoom.
      if (e.data && typeof e.data === 'object' && e.data.type === 'VS_DEVTOOLS') {
        e.stopImmediatePropagation();
      }
    };

    window.addEventListener('message', handleMessage, true);
    return () => {
      window.removeEventListener('message', handleMessage, true);
    };
  }, []);

  const activeSource = sources.find((s) => s.id === selectedSourceId);
  const isPlayable = Boolean(activeSource && activeSource.status === 'available' && activeSource.iframeUrl);
  const isValidUrl = isPlayable && isValidExternalIframeUrl(activeSource?.iframeUrl);

  return (
    <div className="space-y-4" data-testid="online-player-container">
      {/* Top Header & Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#13151f] p-3 rounded-2xl border border-white/10 shadow-lg">
        {/* Source Picker */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400 font-semibold px-1 flex items-center gap-1.5 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Источник:</span>
          </span>

          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
              <span>Опрос балансеров...</span>
            </div>
          ) : sources.length === 0 ? (
            <span className="text-xs text-gray-400">Нет доступных внешних балансеров</span>
          ) : (
            sources.map((s) => {
              const isSelected = selectedSourceId === s.id;
              const isAvail = s.status === 'available';

              return (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedSourceId(s.id);
                    setIframeKey((k) => k + 1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 border ${
                    isSelected
                      ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30'
                      : isAvail
                      ? 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border-white/5'
                      : 'bg-white/5 text-gray-500 border-white/5 hover:text-gray-400 opacity-70'
                  }`}
                >
                  <span>{s.name}</span>
                  {s.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded font-normal ${
                        isSelected
                          ? 'bg-black/30 text-white'
                          : isAvail
                          ? 'bg-white/10 text-gray-300'
                          : 'bg-red-950/40 text-red-400'
                      }`}
                    >
                      {s.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Controls: Reload & Open Separately */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {isPlayable && isValidUrl && (
            <>
              {/* Sandbox toggle for compatibility */}
              <button
                onClick={() => {
                  setIsSandboxStrict(!isSandboxStrict);
                  setIframeKey((k) => k + 1);
                }}
                title={
                  isSandboxStrict
                    ? 'Строгая песочница включена (защита от редиректов)'
                    : 'Песочница ослаблена для максимальной совместимости'
                }
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                  isSandboxStrict
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Песочница: {isSandboxStrict ? 'Строгая' : 'Стандарт'}</span>
              </button>

              <button
                onClick={() => setIframeKey((k) => k + 1)}
                title="Перезагрузить плеер"
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer border border-white/5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {activeSource?.iframeUrl && (
                <a
                  href={activeSource.iframeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Открыть источник отдельно в новой вкладке"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer border border-white/10"
                >
                  <span className="hidden sm:inline">Открыть отдельно</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {/* Active Source Banner / Description */}
      {activeSource && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/5 text-xs text-gray-400">
          <div className="flex items-center gap-2">
            {type === 'tv' ? <Tv className="w-3.5 h-3.5 text-red-400" /> : <Film className="w-3.5 h-3.5 text-red-400" />}
            <span className="text-gray-300 font-medium">{activeSource.description || activeSource.name}</span>
            {activeSource.translationName && (
              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px]">
                {activeSource.translationName}
              </span>
            )}
            {activeSource.declaredQuality && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px]">
                {activeSource.declaredQuality}
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1">
            <Info className="w-3 h-3 text-gray-400" />
            <span>Внешний iframe-плеер провайдера</span>
          </div>
        </div>
      )}

      {/* Video Container / Unmounted when inactive */}
      <div className="relative w-full aspect-video min-h-[260px] sm:min-h-[360px] md:min-h-[460px] bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="w-10 h-10 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
            <p className="text-xs text-gray-400">Проверка внешних плееров...</p>
          </div>
        ) : isPlayable && isValidUrl && activeSource?.iframeUrl ? (
          /* UNMOUNTING GUARANTEE: Inactive iframes are completely removed from DOM */
          <iframe
            key={`${activeSource.id}-${iframeKey}-${season}-${episode}-${isSandboxStrict}`}
            src={activeSource.iframeUrl}
            title={activeSource.name}
            className="w-full h-full border-0 absolute inset-0"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            sandbox={
              isSandboxStrict
                ? 'allow-scripts allow-same-origin allow-forms allow-presentation'
                : 'allow-scripts allow-same-origin allow-forms allow-presentation allow-popups'
            }
          />
        ) : (
          /* Error or Unavailable Fallback Card */
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-lg space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-white font-bold text-sm sm:text-base">
              {activeSource?.name || 'Источник недоступен'}
            </h4>
            <p className="text-gray-400 text-xs leading-relaxed">
              {activeSource?.diagnostics ||
                loadError ||
                'Данный внешний плеер временно недоступен или ограничен сервером провайдера.'}
            </p>

            {/* If there's an available alternative, suggest switching */}
            {sources.some((s) => s.status === 'available' && s.id !== selectedSourceId) && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    const alt = sources.find((s) => s.status === 'available');
                    if (alt) {
                      setSelectedSourceId(alt.id);
                      setIframeKey((k) => k + 1);
                    }
                  }}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-red-600/30"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Переключиться на доступный источник</span>
                </button>
              </div>
            )}

            {/* Direct Link button if URL exists */}
            {activeSource?.iframeUrl && (
              <div className="pt-1">
                <a
                  href={activeSource.iframeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  <span>Попробовать открыть ссылку напрямую</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Educational notice regarding external providers */}
      <div className="p-3 bg-[#11131c] rounded-xl border border-white/5 text-[11px] text-gray-400 space-y-1">
        <div className="flex items-center gap-1.5 text-gray-300 font-semibold">
          <Info className="w-3.5 h-3.5 text-amber-400" />
          <span>Особенности внешних онлайн-источников:</span>
        </div>
        <p>
          Внешние балансеры встраиваются через изолированный фрейм и могут воспроизводить стороннюю рекламу, не контролируемую KinoRoom.
          Для просмотра без рекламы и с гарантированным качеством используйте вкладку <strong className="text-gray-300">«Плеер КиноРум»</strong> (для подтвержденных фильмов) или <strong className="text-gray-300">«Торренты»</strong>.
        </p>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import {
  Play,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Loader2,
  Tv,
  Film,
  Info,
  Radio
} from 'lucide-react';
import { ExternalSourceItem } from '@/lib/services/externalSources/types';
import { isValidExternalIframeUrl, TRUSTED_IFRAME_DOMAINS } from '@/lib/services/externalSources/allowlist';

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

  // By default, VidSrc requires no sandbox to avoid "This content can't be embedded in a sandboxed frame".
  // For other providers (e.g. Kodik), sandbox is kept on by default.
  // Users can manually test sandbox on VidSrc via the toggle.
  const [forceSandboxOnVidSrc, setForceSandboxOnVidSrc] = useState<boolean>(false);
  const [playerEventStatus, setPlayerEventStatus] = useState<string | null>(null);

  // Fetch verified sources from Playback External Sources API
  useEffect(() => {
    let isCancelled = false;

    async function fetchSources() {
      setIsLoading(true);
      setLoadError(null);
      setPlayerEventStatus(null);
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

  // Strict origin validation and secure event monitoring for postMessage
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.origin || typeof e.origin !== 'string') return;

      // 1. Validate that the sender's origin is strictly in TRUSTED_IFRAME_DOMAINS
      let isTrustedOrigin = false;
      try {
        const originUrl = new URL(e.origin);
        const hostname = originUrl.hostname.toLowerCase();
        isTrustedOrigin = TRUSTED_IFRAME_DOMAINS.some(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
        );
      } catch {
        return;
      }

      if (!isTrustedOrigin) {
        return; // Reject messages from untrusted third parties
      }

      const data = e.data;
      if (!data || typeof data !== 'object') return;

      // 2. Protect KinoRoom against third-party tamper scripts (e.g. disable-devtool in VidSrc)
      if (data.type === 'VS_DEVTOOLS') {
        e.stopImmediatePropagation();
        return;
      }

      // 3. Monitor documented VidSrc events without asserting actual video playback
      if (data.type === 'PLAYER_TITLE' && data.title) {
        setPlayerEventStatus(`Плеер активен: ${data.title}`);
      } else if (data.type === 'TV_INFO') {
        setPlayerEventStatus('Сериал загружен (TV_INFO)');
      } else if (data.type === 'PLAYER_EVENT') {
        setPlayerEventStatus(`Событие плеера: ${data.event || 'активен'}`);
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
  const isVidSrc = activeSource?.adapter === 'vidsrc';

  // Sandbox resolution:
  // - VidSrc: by default NO sandbox (undefined), because sandbox triggers "This content can't be embedded in a sandboxed frame"
  // - If user explicitly turns on forceSandboxOnVidSrc: 'allow-scripts allow-same-origin allow-forms allow-presentation'
  // - For any other external adapters: always keep strict sandbox
  const iframeSandbox = isVidSrc
    ? forceSandboxOnVidSrc
      ? 'allow-scripts allow-same-origin allow-forms allow-presentation'
      : undefined
    : 'allow-scripts allow-same-origin allow-forms allow-presentation';

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
                    setPlayerEventStatus(null);
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

        {/* Controls: Sandbox Toggle, Reload & Open Separately */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          {isPlayable && isValidUrl && (
            <>
              {/* VidSrc specific Sandbox Experiment Toggle */}
              {isVidSrc && (
                <button
                  onClick={() => {
                    setForceSandboxOnVidSrc(!forceSandboxOnVidSrc);
                    setIframeKey((k) => k + 1);
                  }}
                  title={
                    forceSandboxOnVidSrc
                      ? 'Песочница включена (VidSrc может блокировать воспроизведение ошибкой sandboxed frame)'
                      : 'Песочница отключена (режим совместимости VidSrc для iPhone Safari)'
                  }
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                    forceSandboxOnVidSrc
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                      : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                  }`}
                >
                  {forceSandboxOnVidSrc ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">
                    {forceSandboxOnVidSrc ? 'Песочница: ВКЛ (Блок)' : 'Песочница: ВЫКЛ (VidSrc)'}
                  </span>
                </button>
              )}

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
          <div className="flex flex-wrap items-center gap-2">
            {type === 'tv' ? <Tv className="w-3.5 h-3.5 text-red-400" /> : <Film className="w-3.5 h-3.5 text-red-400" />}
            <span className="text-gray-300 font-medium">{activeSource.description || activeSource.name}</span>
            {activeSource.translationName && (
              <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[11px]">
                {activeSource.translationName}
              </span>
            )}
            {playerEventStatus && (
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] flex items-center gap-1">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                <span>{playerEventStatus}</span>
              </span>
            )}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1">
            <Info className="w-3 h-3 text-gray-400" />
            <span>
              {isVidSrc && !forceSandboxOnVidSrc
                ? 'Режим VidSrc (без sandbox per specs)'
                : 'Изолированный iframe'}
            </span>
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
            key={`${activeSource.id}-${iframeKey}-${season}-${episode}-${iframeSandbox}`}
            src={activeSource.iframeUrl}
            title={activeSource.name}
            className="w-full h-full border-0 absolute inset-0"
            referrerPolicy="origin"
            allowFullScreen
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            sandbox={iframeSandbox}
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

      {/* Honest educational notice regarding external providers */}
      <div className="p-3 bg-[#11131c] rounded-xl border border-white/5 text-[11px] text-gray-400 space-y-1">
        <div className="flex items-center gap-1.5 text-gray-300 font-semibold">
          <Info className="w-3.5 h-3.5 text-amber-400" />
          <span>Особенности воспроизведения VidSrc на iPhone Safari:</span>
        </div>
        <p>
          Провайдер VidSrc требует встраивания без атрибута sandbox (в песочнице возвращается ошибка блокировки фрейма).
          В Safari на iPhone полноэкранный режим, звук и перемотка управляются встроенными контролами плеера.
          Если сторонний плеер инициирует всплывающие рекламные вкладки, используйте встроенную функцию Safari «Блокировка всплывающих окон» или открывайте источник через кнопку <strong className="text-gray-300">«Открыть отдельно»</strong>.
        </p>
      </div>
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  RefreshCw,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Tv,
  Film,
  AlertTriangle,
  Subtitles,
  Upload,
  Maximize2,
  Minimize2,
  CheckCircle2,
  Clock,
  Search,
  Sliders,
  X
} from 'lucide-react';
import { ExternalSourceItem } from '@/lib/services/externalSources/types';
import { isValidExternalIframeUrl } from '@/lib/services/externalSources/allowlist';
import {
  ExternalSubtitleEngine,
  ExternalSubtitleTrack,
  MAX_SUBTITLE_FILE_SIZE_BYTES,
  MIN_SUBTITLE_OFFSET_SEC,
  MAX_SUBTITLE_OFFSET_SEC,
  clampSubtitleOffset
} from '@/lib/playback/externalSubtitleEngine';
import {
  validateCineSrcMessageEvent,
  sendCineSrcCommand,
  CINESRC_ORIGIN
} from '@/lib/playback/cinesrcBridge';
import type {
  OpenSubtitlesCandidate,
  OpenSubtitlesSearchResponse
} from '@/lib/services/openSubtitles';

interface OnlinePlayerProps {
  tmdbId: number;
  imdbId?: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title: string;
  runtimeMinutes?: number;
}

type EmbedMode = 'embedwave' | 'cinesrc_direct';
type SubtitleSelection = 'off' | 'ru';
type SubtitleFontSize = 'sm' | 'md' | 'lg' | 'xl';
type SubtitlePosition = 'bottom' | 'mid' | 'top';
type SyncState = 'wrapper_no_events' | 'waiting_for_events' | 'synced' | 'error';

function formatPlayerTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * OnlinePlayer (Step 2E + Step 2F: Russian Subtitles & CineSrc Synchronization)
 *
 * Architecture & Honesty Guarantees:
 *  1. Default mode remains «EmbedWave — Cinesrc» (`?server=cinesrc`), never replaced automatically.
 *  2. Because `embedwave.cc` nests `cinesrc.st` inside an intermediate iframe without forwarding
 *     `postMessage` events, an optional experimental mode «Прямой CineSrc (Синхронизация субтитров)»
 *     (`https://cinesrc.st/embed/...`) is provided.
 *  3. Real video time is obtained strictly from verified `cinesrc:*` postMessage events
 *     (checking `event.origin`, `event.source`, `activeIframeId`, event type, and finite `currentTime`).
 *     Never uses `Date.now()` or autonomous timers during pause.
 *  4. Subtitle text is sanitized and rendered strictly as React text nodes (never `innerHTML`).
 *  5. If no Russian subtitles are loaded, «Русские» is never shown as available.
 */
export function OnlinePlayer({
  tmdbId,
  imdbId,
  type,
  season = 1,
  episode = 1,
  title,
  runtimeMinutes
}: OnlinePlayerProps) {
  const [source, setSource] = useState<ExternalSourceItem | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [iframeContainerLoaded, setIframeContainerLoaded] = useState<boolean>(false);
  const [iframeLoadFailed, setIframeLoadFailed] = useState<boolean>(false);

  // Step 2F: Embed Mode ('embedwave' default, 'cinesrc_direct' experimental for postMessage sync)
  const [embedMode, setEmbedMode] = useState<EmbedMode>('embedwave');

  // Step 2F: Subtitle Engine & Tracks
  const engineRef = useRef<ExternalSubtitleEngine>(new ExternalSubtitleEngine());
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);

  const [isSubtitleMenuOpen, setIsSubtitleMenuOpen] = useState<boolean>(false);
  const [subtitleSelection, setSubtitleSelection] = useState<SubtitleSelection>('off');
  const [loadedTracks, setLoadedTracks] = useState<ExternalSubtitleTrack[]>([]);
  const [activeTrackIndex, setActiveTrackIndex] = useState<number>(0);
  const [activeLines, setActiveLines] = useState<string[]>([]);
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
  const [subtitleFontSize, setSubtitleFontSize] = useState<SubtitleFontSize>('md');
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>('bottom');
  const [subtitleUploadError, setSubtitleUploadError] = useState<string | null>(null);
  const [subtitleWarnings, setSubtitleWarnings] = useState<string[]>([]);

  // Step 2F: CineSrc postMessage Synchronization State
  const [syncState, setSyncState] = useState<SyncState>('wrapper_no_events');
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [isEnded, setIsEnded] = useState<boolean>(false);
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);

  // Step 2F: iPhone / Browser CSS Cinema Fullscreen mode (preserves HTML subtitle overlay)
  const [isCinemaFullscreen, setIsCinemaFullscreen] = useState<boolean>(false);

  // Step 2F: OpenSubtitles REST API v1 state
  const [osLoading, setOsLoading] = useState<boolean>(false);
  const [osResponse, setOsResponse] = useState<OpenSubtitlesSearchResponse | null>(null);
  const [osDownloadingId, setOsDownloadingId] = useState<number | null>(null);

  // Unique identifier for the currently mounted iframe instance
  const activeIframeId = `cinesrc-iframe-${embedMode}-${tmdbId}-${season}-${episode}-${iframeKey}`;

  // Fetch external source metadata
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

  // Reset playback synchronization state when iframe reloads or mode/title changes
  useEffect(() => {
    engineRef.current.resetPlaybackState();
    setActiveLines([]);
    setPlayerReady(false);
    setCurrentTime(null);
    setDuration(null);
    setIsPaused(true);
    setIsEnded(false);
    setLastEventType(null);
    setActiveServerId(null);
    setSyncState(embedMode === 'cinesrc_direct' ? 'waiting_for_events' : 'wrapper_no_events');
  }, [activeIframeId, embedMode]);

  // Listen for Escape key to exit CSS Cinema Fullscreen
  useEffect(() => {
    if (!isCinemaFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCinemaFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCinemaFullscreen]);

  // Strict postMessage listener for CineSrc events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const expectedWindow = iframeRef.current?.contentWindow;
      const validated = validateCineSrcMessageEvent(
        {
          origin: event.origin,
          source: event.source,
          data: event.data
        },
        {
          expectedIframeWindow: expectedWindow,
          activeIframeId,
          currentIframeId: activeIframeId
        }
      );

      if (!validated) {
        return;
      }

      setLastEventType(validated.type);

      switch (validated.type) {
        case 'cinesrc:ready': {
          setPlayerReady(true);
          setSyncState('synced');
          // Request initial duration and currentTime via documented getter commands
          sendCineSrcCommand(expectedWindow, 'getDuration');
          sendCineSrcCommand(expectedWindow, 'getCurrentTime');
          break;
        }

        case 'cinesrc:loadedmetadata': {
          if (validated.duration !== undefined) {
            setDuration(validated.duration);
          }
          setSyncState('synced');
          break;
        }

        case 'cinesrc:play': {
          setIsPaused(false);
          setIsEnded(false);
          setSyncState('synced');
          engineRef.current.onPlay();
          setActiveLines(engineRef.current.getActiveLines());
          break;
        }

        case 'cinesrc:pause': {
          setIsPaused(true);
          setSyncState('synced');
          engineRef.current.onPause();
          setActiveLines(engineRef.current.getActiveLines());
          break;
        }

        case 'cinesrc:timeupdate': {
          if (validated.currentTime !== undefined) {
            setCurrentTime(validated.currentTime);
            setIsEnded(false);
            setSyncState('synced');
            if (validated.duration !== undefined) {
              setDuration(validated.duration);
            }
            engineRef.current.updatePlaybackTime(validated.currentTime);
            setActiveLines(engineRef.current.getActiveLines());
          }
          break;
        }

        case 'cinesrc:seeking':
        case 'cinesrc:seeked': {
          if (validated.currentTime !== undefined) {
            setCurrentTime(validated.currentTime);
            setIsEnded(false);
            setSyncState('synced');
            if (validated.duration !== undefined) {
              setDuration(validated.duration);
            }
            // Immediately recalculate active cues after seek
            engineRef.current.onSeek(validated.currentTime);
            setActiveLines(engineRef.current.getActiveLines());
          }
          break;
        }

        case 'cinesrc:ended': {
          setIsEnded(true);
          setIsPaused(true);
          engineRef.current.onEnded();
          setActiveLines([]);
          break;
        }

        case 'cinesrc:response': {
          if (validated.command === 'getCurrentTime' && validated.currentTime !== undefined) {
            setCurrentTime(validated.currentTime);
            setSyncState('synced');
            engineRef.current.updatePlaybackTime(validated.currentTime);
            setActiveLines(engineRef.current.getActiveLines());
          } else if (validated.command === 'getDuration' && validated.duration !== undefined) {
            setDuration(validated.duration);
          } else if (validated.command === 'getPaused' && typeof validated.result === 'boolean') {
            setIsPaused(validated.result);
          }
          break;
        }

        case 'cinesrc:sourceused': {
          if (validated.sourceId) {
            setActiveServerId(validated.sourceId);
          }
          break;
        }

        case 'cinesrc:error': {
          setSyncState('error');
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [activeIframeId]);

  // Apply track switch when activeTrackIndex or loadedTracks changes
  const activateTrackAtIndex = useCallback(
    (index: number, tracksList: ExternalSubtitleTrack[] = loadedTracks) => {
      const target = tracksList[index];
      if (!target) return;
      // Re-hydrate engine with selected track cues
      const engine = engineRef.current;
      const vttLines = ['WEBVTT\n'];
      for (const c of target.cues) {
        const formatSec = (sec: number) => {
          const s = Math.max(0, sec);
          const hh = Math.floor(s / 3600).toString().padStart(2, '0');
          const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
          const ss = Math.floor(s % 60).toString().padStart(2, '0');
          const ms = Math.round((s - Math.floor(s)) * 1000).toString().padStart(3, '0');
          return `${hh}:${mm}:${ss}.${ms}`;
        };
        vttLines.push(`${formatSec(c.startTime)} --> ${formatSec(c.endTime)}\n${c.text}`);
      }
      engine.loadFromText(vttLines.join('\n\n'), {
        fileName: target.fileName,
        label: target.label,
        lang: target.lang
      });
      engine.setOffsetSeconds(subtitleOffset);
      if (currentTime !== null) {
        engine.updatePlaybackTime(currentTime, { isPaused });
      }
      setActiveTrackIndex(index);
      setActiveLines(engine.getActiveLines());
    },
    [loadedTracks, subtitleOffset, currentTime, isPaused]
  );

  // Handle local SRT/VTT file upload on user device
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setSubtitleUploadError(null);
    setSubtitleWarnings([]);

    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so selecting the same file again still triggers onChange
    e.target.value = '';

    const lowerName = file.name.toLowerCase().trim();
    if (!lowerName.endsWith('.srt') && !lowerName.endsWith('.vtt')) {
      setSubtitleUploadError(
        'Неподдерживаемый формат файла. Пожалуйста, выберите файл субтитров с расширением .srt или .vtt.'
      );
      return;
    }

    if (file.size === 0) {
      setSubtitleUploadError('Выбранный файл пуст (0 байт).');
      return;
    }

    if (file.size > MAX_SUBTITLE_FILE_SIZE_BYTES) {
      setSubtitleUploadError(
        `Файл слишком большой (${(file.size / (1024 * 1024)).toFixed(1)} МБ). Максимальный размер: 5 МБ.`
      );
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const expectedDur = duration || (runtimeMinutes ? runtimeMinutes * 60 : undefined);
      const parseResult = engineRef.current.loadFromBuffer(buffer, {
        fileName: file.name,
        label: `Русские (${file.name})`,
        lang: 'ru',
        expectedDuration: expectedDur
      });

      if (!parseResult.valid || !parseResult.track) {
        setSubtitleUploadError(
          parseResult.errors.join(' ') || 'Не удалось распознать таймкоды в файле субтитров.'
        );
        return;
      }

      engineRef.current.setOffsetSeconds(subtitleOffset);
      if (currentTime !== null) {
        engineRef.current.updatePlaybackTime(currentTime, { isPaused });
      }

      const newTrack = parseResult.track;
      setLoadedTracks((prev) => {
        const next = [...prev, newTrack];
        setActiveTrackIndex(next.length - 1);
        return next;
      });
      setSubtitleSelection('ru');
      setSubtitleWarnings(parseResult.warnings);
      setActiveLines(engineRef.current.getActiveLines());
    } catch (err: any) {
      setSubtitleUploadError(err?.message || 'Ошибка чтения локального файла субтитров.');
    }
  };

  // Handle subtitle delay offset adjustment (-60s to +60s)
  const handleAdjustOffset = (delta: number) => {
    const updated = engineRef.current.adjustOffsetSeconds(delta);
    setSubtitleOffset(updated);
    setActiveLines(engineRef.current.getActiveLines());
  };

  const handleSetOffset = (value: number) => {
    const updated = engineRef.current.setOffsetSeconds(clampSubtitleOffset(value));
    setSubtitleOffset(updated);
    setActiveLines(engineRef.current.getActiveLines());
  };

  // Send seek command to Direct CineSrc iframe
  const handleCommandSeek = (targetSeconds: number) => {
    const win = iframeRef.current?.contentWindow;
    if (win && embedMode === 'cinesrc_direct') {
      sendCineSrcCommand(win, 'seek', [targetSeconds]);
      sendCineSrcCommand(win, 'getCurrentTime');
    }
  };

  // OpenSubtitles REST API v1 search
  const handleSearchOpenSubtitles = async () => {
    setOsLoading(true);
    try {
      const params = new URLSearchParams({
        tmdbId: String(tmdbId),
        type,
        season: String(season),
        episode: String(episode)
      });
      if (imdbId) params.set('imdbId', imdbId);
      const expectedDur = duration || (runtimeMinutes ? runtimeMinutes * 60 : undefined);
      if (expectedDur) params.set('duration', String(Math.round(expectedDur)));

      const res = await fetch(`/api/playback/subtitles/opensubtitles?${params.toString()}`);
      const data: OpenSubtitlesSearchResponse = await res.json();
      setOsResponse(data);
    } catch (err: any) {
      setOsResponse({
        success: false,
        status: 'UNAVAILABLE',
        configured: false,
        downloadAllowed: false,
        apiEndpoint: 'https://api.opensubtitles.com/api/v1',
        tmdbId,
        imdbId,
        mediaType: type,
        candidates: [],
        message: err?.message || 'Не удалось выполнить запрос к серверному адаптеру OpenSubtitles.'
      });
    } finally {
      setOsLoading(false);
    }
  };

  const handleDownloadOpenSubtitle = async (candidate: OpenSubtitlesCandidate) => {
    setOsDownloadingId(candidate.fileId);
    setSubtitleUploadError(null);
    try {
      const expectedDur = duration || (runtimeMinutes ? runtimeMinutes * 60 : undefined);
      const res = await fetch('/api/playback/subtitles/opensubtitles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: candidate.fileId,
          expectedDurationSeconds: expectedDur
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.content) {
        setSubtitleUploadError(data.message || 'Загрузка через OpenSubtitles недоступна.');
        return;
      }

      const parsed = engineRef.current.loadFromText(data.content, {
        fileName: data.fileName || candidate.fileName,
        label: `Русские (${candidate.release})`,
        lang: 'ru',
        expectedDuration: expectedDur
      });

      if (!parsed.valid || !parsed.track) {
        setSubtitleUploadError(parsed.errors.join(' ') || 'Ошибка валидации загруженных субтитров.');
        return;
      }

      engineRef.current.setOffsetSeconds(subtitleOffset);
      if (currentTime !== null) {
        engineRef.current.updatePlaybackTime(currentTime, { isPaused });
      }

      const newTrack = parsed.track;
      setLoadedTracks((prev) => {
        const next = [...prev, newTrack];
        setActiveTrackIndex(next.length - 1);
        return next;
      });
      setSubtitleSelection('ru');
      setSubtitleWarnings(parsed.warnings);
      setActiveLines(engineRef.current.getActiveLines());
    } catch (err: any) {
      setSubtitleUploadError(err?.message || 'Ошибка загрузки субтитров из OpenSubtitles.');
    } finally {
      setOsDownloadingId(null);
    }
  };

  // Compute active iframe URL based on mode
  const fallbackDirectUrl =
    type === 'tv'
      ? `https://cinesrc.st/embed/tv/${encodeURIComponent(tmdbId)}?s=${encodeURIComponent(season)}&e=${encodeURIComponent(episode)}`
      : `https://cinesrc.st/embed/movie/${encodeURIComponent(tmdbId)}`;

  const directCineSrcUrl = source?.directCineSrcUrl || fallbackDirectUrl;
  const activeIframeUrl =
    embedMode === 'cinesrc_direct' ? directCineSrcUrl : source?.iframeUrl;

  const isPlayable = Boolean(
    source &&
      source.status === 'available' &&
      activeIframeUrl &&
      (embedMode === 'cinesrc_direct'
        ? activeIframeUrl.startsWith('https://cinesrc.st/embed/')
        : activeIframeUrl.includes('server=cinesrc'))
  );
  const isValidUrl = isPlayable && isValidExternalIframeUrl(activeIframeUrl);

  // Strict sandbox matching Cinesrc's documented embed isolation (no allow-popups, no allow-top-navigation)
  const iframeSandbox = 'allow-scripts allow-same-origin allow-forms allow-modals allow-presentation';

  const handleResetToCinesrc = () => {
    setIframeContainerLoaded(false);
    setIframeLoadFailed(false);
    setIframeKey((k) => k + 1);
  };

  const hasLoadedRussianSubtitles = loadedTracks.length > 0;
  const activeTrack = hasLoadedRussianSubtitles ? loadedTracks[activeTrackIndex] || loadedTracks[0] : null;
  const shouldRenderOverlayCues =
    subtitleSelection === 'ru' &&
    hasLoadedRussianSubtitles &&
    syncState === 'synced' &&
    !isEnded &&
    activeLines.length > 0;

  const fontSizeClass =
    subtitleFontSize === 'sm'
      ? 'text-xs sm:text-sm'
      : subtitleFontSize === 'lg'
      ? 'text-base sm:text-xl md:text-2xl'
      : subtitleFontSize === 'xl'
      ? 'text-lg sm:text-2xl md:text-3xl'
      : 'text-sm sm:text-base md:text-lg';

  const positionClass =
    subtitlePosition === 'top'
      ? 'top-12 sm:top-14 bottom-auto'
      : subtitlePosition === 'mid'
      ? 'bottom-24 sm:bottom-28'
      : 'bottom-14 sm:bottom-16';

  return (
    <div className="space-y-4" data-testid="online-player-container">
      {/* Hidden local file input for .srt / .vtt */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt,text/vtt,application/x-subrip,text/plain"
        onChange={handleFileChange}
        data-testid="subtitle-file-input"
        className="hidden"
      />

      {/* Experimental Card Header */}
      <div className="bg-[#13151f] p-4 rounded-2xl border border-white/10 shadow-lg space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
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
              <span>
                {embedMode === 'cinesrc_direct'
                  ? 'CineSrc Direct — Режим субтитров'
                  : 'EmbedWave — Cinesrc'}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                Экспериментальный
              </span>
            </div>

            {/* Mode Switcher: Default EmbedWave vs Direct CineSrc for postMessage subtitle sync */}
            <div
              className="inline-flex items-center rounded-xl bg-white/5 p-1 border border-white/10"
              role="group"
              aria-label="Режим встраивания Cinesrc"
            >
              <button
                type="button"
                data-testid="mode-embedwave-btn"
                onClick={() => setEmbedMode('embedwave')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  embedMode === 'embedwave'
                    ? 'bg-red-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                EmbedWave (По умолчанию)
              </button>
              <button
                type="button"
                data-testid="mode-cinesrc-direct-btn"
                onClick={() => setEmbedMode('cinesrc_direct')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  embedMode === 'cinesrc_direct'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Прямой CineSrc (Субтитры)
              </button>
            </div>

            {type === 'tv' && (
              <span className="text-xs text-gray-300 bg-white/5 px-2.5 py-1 rounded-lg border border-white/10 font-medium">
                Сезон {season}, Серия {episode}
              </span>
            )}
          </div>

          {/* Action Controls */}
          <div className="flex flex-wrap items-center gap-2 self-end lg:self-auto">
            {/* Subtitles Button */}
            <button
              type="button"
              data-testid="external-subtitles-button"
              onClick={() => setIsSubtitleMenuOpen((open) => !open)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                subtitleSelection === 'ru' && hasLoadedRussianSubtitles
                  ? 'bg-emerald-600/25 border-emerald-500/50 text-emerald-300'
                  : isSubtitleMenuOpen
                  ? 'bg-white/15 border-white/30 text-white'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-200 hover:text-white'
              }`}
            >
              <Subtitles className="w-3.5 h-3.5" />
              <span>Субтитры</span>
              {subtitleSelection === 'ru' && hasLoadedRussianSubtitles && (
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/30 text-[10px] text-emerald-200">
                  RU
                </span>
              )}
            </button>

            {/* Cinema Fullscreen Toggle (keeps HTML subtitle overlay visible on iPhone & Desktop) */}
            <button
              type="button"
              data-testid="cinema-fullscreen-toggle"
              onClick={() => setIsCinemaFullscreen((v) => !v)}
              title="Режим «Кинотеатр» на весь экран браузера с сохранением оверлея русских субтитров"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer border border-white/10"
            >
              {isCinemaFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Обычный вид</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Режим Кинотеатр</span>
                </>
              )}
            </button>

            {isValidUrl && activeIframeUrl && (
              <>
                <button
                  type="button"
                  onClick={handleResetToCinesrc}
                  title="Сбросить и перезагрузить сервер Cinesrc"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-colors cursor-pointer border border-white/10"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Сбросить на Cinesrc</span>
                </button>

                <a
                  href={activeIframeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Открыть плеер в отдельной вкладке"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer border border-white/10"
                >
                  <span className="hidden sm:inline">Открыть отдельно</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* Real Verified Capabilities List */}
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
            <span>Русская озвучка не подтверждена. Доступно подключение внешних русских субтитров (SRT/VTT).</span>
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

      {/* Subtitles Control Panel («Субтитры») */}
      {isSubtitleMenuOpen && (
        <div
          data-testid="external-subtitles-panel"
          className="bg-[#13151f] p-4 sm:p-5 rounded-2xl border border-white/15 shadow-xl space-y-4"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Subtitles className="w-4 h-4 text-emerald-400" />
              <h4 className="text-white font-bold text-sm">Управление русскими субтитрами (SRT / WebVTT)</h4>
            </div>
            <button
              type="button"
              onClick={() => setIsSubtitleMenuOpen(false)}
              className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
              aria-label="Закрыть панель субтитров"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sync Status Banner */}
          <div
            data-testid="subtitle-sync-status"
            className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              syncState === 'synced'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : syncState === 'waiting_for_events'
                ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            }`}
          >
            <div className="space-y-0.5">
              {syncState === 'synced' ? (
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Синхронизация с CineSrc активна • Время видео: {formatPlayerTime(currentTime)} /{' '}
                    {formatPlayerTime(duration)} ({isPaused ? 'Пауза' : 'Воспроизведение'})
                  </span>
                </div>
              ) : syncState === 'waiting_for_events' ? (
                <div className="flex items-center gap-2 font-semibold">
                  <Clock className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>
                    Прямой CineSrc подключён: ожидание событий времени (нажмите Play внутри плеера).
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Автоматическая синхронизация недоступна через обёртку EmbedWave
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-200/80">
                    Обёртка <code className="bg-black/30 px-1 rounded">embedwave.cc</code> не передаёт события{' '}
                    <code className="bg-black/30 px-1 rounded">cinesrc:timeupdate</code> родительскому окну KinoRoom.
                    Для точной синхронизации субтитров по времени видео переключитесь на экспериментальный режим{' '}
                    <strong>«Прямой CineSrc»</strong>.
                  </p>
                </div>
              )}
            </div>

            {embedMode === 'embedwave' && (
              <button
                type="button"
                data-testid="switch-to-direct-cinesrc-btn"
                onClick={() => setEmbedMode('cinesrc_direct')}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs whitespace-nowrap cursor-pointer transition-all shrink-0"
              >
                Включить Прямой CineSrc
              </button>
            )}
          </div>

          {/* 1. Track Selection & Local File Upload */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-xs font-semibold text-gray-300 block">Дорожка субтитров:</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="subtitle-option-off"
                  onClick={() => setSubtitleSelection('off')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                    subtitleSelection === 'off'
                      ? 'bg-red-600 text-white border-red-500 shadow'
                      : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
                  }`}
                >
                  Выключены
                </button>

                <button
                  type="button"
                  data-testid="subtitle-option-ru"
                  disabled={!hasLoadedRussianSubtitles}
                  aria-disabled={!hasLoadedRussianSubtitles}
                  onClick={() => {
                    if (hasLoadedRussianSubtitles) {
                      setSubtitleSelection('ru');
                    }
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
                    !hasLoadedRussianSubtitles
                      ? 'bg-white/[0.02] text-gray-500 border-white/5 cursor-not-allowed'
                      : subtitleSelection === 'ru'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow cursor-pointer'
                      : 'bg-white/5 hover:bg-white/10 text-gray-200 border-white/10 cursor-pointer'
                  }`}
                >
                  {hasLoadedRussianSubtitles
                    ? `Русские (${activeTrack?.cueCount || 0} реплик)`
                    : 'Русские (не загружены)'}
                </button>

                <button
                  type="button"
                  data-testid="subtitle-upload-button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Загрузить SRT/VTT</span>
                </button>
              </div>

              {/* Switch between multiple loaded tracks if user uploaded more than one */}
              {loadedTracks.length > 1 && (
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-gray-400">Загруженные файлы:</span>
                  {loadedTracks.map((tr, idx) => (
                    <button
                      key={tr.id}
                      type="button"
                      data-testid={`subtitle-track-item-${idx}`}
                      onClick={() => {
                        activateTrackAtIndex(idx);
                        setSubtitleSelection('ru');
                      }}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                        activeTrackIndex === idx
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                      }`}
                    >
                      {tr.fileName || tr.label} ({tr.cueCount})
                    </button>
                  ))}
                </div>
              )}

              {subtitleUploadError && (
                <p
                  data-testid="subtitle-upload-error"
                  className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
                >
                  {subtitleUploadError}
                </p>
              )}

              {subtitleWarnings.length > 0 && (
                <div
                  data-testid="subtitle-upload-warnings"
                  className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 space-y-0.5"
                >
                  {subtitleWarnings.slice(0, 2).map((w, i) => (
                    <div key={i}>{w}</div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Synchronization Offset Controls (-60s to +60s) */}
            <div className="space-y-2" data-testid="subtitle-sync-controls">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-gray-300">Синхронизация +/− (задержка):</span>
                <span
                  data-testid="subtitle-offset-value"
                  className="font-mono font-bold text-emerald-400 bg-white/5 px-2 py-0.5 rounded border border-white/10"
                >
                  {subtitleOffset > 0 ? `+${subtitleOffset.toFixed(1)}` : subtitleOffset.toFixed(1)} сек
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="subtitle-offset-minus-5"
                  onClick={() => handleAdjustOffset(-5)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-200 font-mono cursor-pointer"
                >
                  −5.0с
                </button>
                <button
                  type="button"
                  data-testid="subtitle-offset-minus"
                  onClick={() => handleAdjustOffset(-0.5)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-200 font-mono cursor-pointer"
                >
                  −0.5с
                </button>
                <button
                  type="button"
                  data-testid="subtitle-offset-reset"
                  onClick={() => handleSetOffset(0)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs text-white font-semibold cursor-pointer"
                >
                  Сброс (0.0с)
                </button>
                <button
                  type="button"
                  data-testid="subtitle-offset-plus"
                  onClick={() => handleAdjustOffset(0.5)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-200 font-mono cursor-pointer"
                >
                  +0.5с
                </button>
                <button
                  type="button"
                  data-testid="subtitle-offset-plus-5"
                  onClick={() => handleAdjustOffset(5)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-gray-200 font-mono cursor-pointer"
                >
                  +5.0с
                </button>
              </div>

              <input
                type="range"
                min={MIN_SUBTITLE_OFFSET_SEC}
                max={MAX_SUBTITLE_OFFSET_SEC}
                step={0.5}
                value={subtitleOffset}
                onChange={(e) => handleSetOffset(parseFloat(e.target.value))}
                data-testid="subtitle-offset-slider"
                aria-label="Сдвиг времени субтитров в секундах"
                className="w-full accent-emerald-500 cursor-pointer"
              />
            </div>
          </div>

          {/* 3. Size & Position Settings + CineSrc API Seek Controls */}
          <div
            data-testid="subtitle-style-controls"
            className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/10"
          >
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-300">
                <Sliders className="w-3.5 h-3.5 text-gray-400" />
                <span>Размер и положение текста:</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(
                  [
                    ['sm', 'Маленький'],
                    ['md', 'Средний'],
                    ['lg', 'Крупный'],
                    ['xl', 'Очень крупный']
                  ] as const
                ).map(([sizeKey, label]) => (
                  <button
                    key={sizeKey}
                    type="button"
                    data-testid={`subtitle-size-${sizeKey}`}
                    onClick={() => setSubtitleFontSize(sizeKey)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                      subtitleFontSize === sizeKey
                        ? 'bg-white/20 border-white/40 text-white font-bold'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {(
                  [
                    ['bottom', 'Внизу (над панелью)'],
                    ['mid', 'Выше'],
                    ['top', 'Вверху']
                  ] as const
                ).map(([posKey, label]) => (
                  <button
                    key={posKey}
                    type="button"
                    data-testid={`subtitle-pos-${posKey}`}
                    onClick={() => setSubtitlePosition(posKey)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                      subtitlePosition === posKey
                        ? 'bg-white/20 border-white/40 text-white font-bold'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Documented CineSrc API Seek Shortcuts when Direct CineSrc is active */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-gray-300 block">
                Команды API плеера CineSrc (postMessage):
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={embedMode !== 'cinesrc_direct'}
                  data-testid="cinesrc-seek-0"
                  onClick={() => handleCommandSeek(0)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-xs text-gray-200 cursor-pointer disabled:cursor-not-allowed"
                >
                  В начало (0:00)
                </button>
                <button
                  type="button"
                  disabled={embedMode !== 'cinesrc_direct'}
                  data-testid="cinesrc-seek-10m"
                  onClick={() => handleCommandSeek(600)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-xs text-gray-200 cursor-pointer disabled:cursor-not-allowed"
                >
                  10 мин (10:00)
                </button>
                <button
                  type="button"
                  disabled={embedMode !== 'cinesrc_direct'}
                  data-testid="cinesrc-seek-30m"
                  onClick={() => handleCommandSeek(1800)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 text-xs text-gray-200 cursor-pointer disabled:cursor-not-allowed"
                >
                  30 мин (30:00)
                </button>
                <button
                  type="button"
                  disabled={embedMode !== 'cinesrc_direct'}
                  data-testid="cinesrc-query-time"
                  onClick={() =>
                    sendCineSrcCommand(iframeRef.current?.contentWindow, 'getCurrentTime')
                  }
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 border border-white/15 text-xs text-white cursor-pointer disabled:cursor-not-allowed"
                >
                  Запросить время
                </button>
              </div>
              <p className="text-[11px] text-gray-400">
                Последнее событие: <code className="text-gray-300">{lastEventType || 'нет'}</code>
                {activeServerId ? ` • Источник: ${activeServerId}` : ''}
              </p>
            </div>
          </div>

          {/* 4. OpenSubtitles REST API v1 Automatic Search Section */}
          <div
            data-testid="opensubtitles-section"
            className="pt-3 border-t border-white/10 space-y-2.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h5 className="text-xs font-bold text-gray-200">
                  Автоматический поиск через OpenSubtitles REST API v1
                </h5>
                <p className="text-[11px] text-gray-400">
                  Поиск по IMDb ID ({imdbId || 'из TMDB'}), языку <code className="text-gray-300">ru</code> и проверка совместимости версии релиза
                </p>
              </div>
              <button
                type="button"
                data-testid="opensubtitles-search-button"
                onClick={handleSearchOpenSubtitles}
                disabled={osLoading}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
              >
                {osLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>Проверить в OpenSubtitles</span>
              </button>
            </div>

            {osResponse && (
              <div
                data-testid="opensubtitles-status-box"
                className="p-3 rounded-xl bg-black/30 border border-white/10 text-xs space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-gray-300">{osResponse.message}</span>
                  <span
                    data-testid="opensubtitles-status-badge"
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      osResponse.status === 'CONNECTED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {osResponse.status}
                  </span>
                </div>

                {osResponse.candidates.length > 0 && (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pt-1">
                    {osResponse.candidates.map((cand) => (
                      <div
                        key={cand.id}
                        className="p-2 rounded-lg bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-semibold text-white truncate">{cand.release}</div>
                          <div className="text-[11px] text-gray-400 flex flex-wrap items-center gap-2">
                            <span
                              className={
                                cand.isCompatibleVersion ? 'text-emerald-400' : 'text-red-400'
                              }
                            >
                              {cand.versionTag}
                            </span>
                            {cand.fps && <span>{cand.fps} FPS</span>}
                            <span>{cand.compatibilityNote}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!osResponse.downloadAllowed || !cand.isCompatibleVersion || osDownloadingId === cand.fileId}
                          onClick={() => handleDownloadOpenSubtitle(cand)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0"
                        >
                          {osDownloadingId === cand.fileId
                            ? 'Загрузка...'
                            : osResponse.downloadAllowed
                            ? 'Подключить'
                            : 'Скачивание отключено'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Video Iframe & HTML Subtitle Overlay Container */}
      <div
        ref={playerContainerRef}
        data-testid="online-player-stage"
        className={
          isCinemaFullscreen
            ? 'fixed inset-0 z-[9999] bg-black w-screen h-dvh flex items-center justify-center'
            : 'relative w-full aspect-video min-h-[260px] sm:min-h-[360px] md:min-h-[460px] bg-[#0d0f17] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center'
        }
      >
        {/* Floating controls when in Cinema Fullscreen mode */}
        {isCinemaFullscreen && (
          <div className="absolute top-3 right-3 z-30 flex items-center gap-2 bg-black/75 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15">
            <button
              type="button"
              onClick={() => setSubtitleSelection((s) => (s === 'ru' && hasLoadedRussianSubtitles ? 'off' : hasLoadedRussianSubtitles ? 'ru' : 'off'))}
              disabled={!hasLoadedRussianSubtitles}
              className="text-xs font-semibold text-white disabled:text-gray-500 cursor-pointer"
            >
              {subtitleSelection === 'ru' && hasLoadedRussianSubtitles ? 'Субтитры: ВКЛ' : 'Субтитры: ВЫКЛ'}
            </button>
            <span className="text-white/20">|</span>
            <button
              type="button"
              data-testid="exit-cinema-fullscreen-btn"
              onClick={() => setIsCinemaFullscreen(false)}
              className="flex items-center gap-1 text-xs font-bold text-red-400 hover:text-red-300 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Выйти</span>
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
            <Loader2 className="w-9 h-9 text-red-500 animate-spin" />
            <p className="text-xs text-gray-300">Подключение к Cinesrc...</p>
          </div>
        ) : isValidUrl && activeIframeUrl && !iframeLoadFailed ? (
          <>
            <iframe
              ref={iframeRef}
              id={activeIframeId}
              data-testid="external-player-iframe"
              key={activeIframeId}
              src={activeIframeUrl}
              title={
                embedMode === 'cinesrc_direct'
                  ? 'CineSrc Direct'
                  : 'EmbedWave — Cinesrc'
              }
              className="w-full h-full border-0 absolute inset-0 z-10"
              referrerPolicy={
                embedMode === 'cinesrc_direct'
                  ? 'strict-origin-when-cross-origin'
                  : 'no-referrer'
              }
              allowFullScreen
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              sandbox={iframeSandbox}
              onLoad={() => setIframeContainerLoaded(true)}
              onError={() => setIframeLoadFailed(true)}
            />

            {/* Synchronized Russian Subtitle Overlay (renders strictly via React text nodes, never innerHTML) */}
            <div
              data-testid="external-subtitle-overlay"
              aria-live="polite"
              className={`pointer-events-none select-none absolute left-4 right-4 z-20 flex flex-col items-center justify-center text-center transition-all ${positionClass}`}
            >
              {shouldRenderOverlayCues && (
                <div
                  data-testid="external-subtitle-cue-box"
                  className="max-w-[92%] sm:max-w-[80%] px-3.5 py-1.5 rounded-lg bg-black/80 text-white font-semibold shadow-lg border border-white/10"
                  style={{
                    textShadow: '0 1px 3px rgba(0, 0, 0, 0.95)'
                  }}
                >
                  {activeLines.map((line, idx) => (
                    <div
                      key={idx}
                      data-testid={`external-subtitle-line-${idx}`}
                      className={`leading-snug ${fontSizeClass}`}
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                type="button"
                onClick={handleResetToCinesrc}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Повторить попытку</span>
              </button>
              {activeIframeUrl && (
                <a
                  href={activeIframeUrl}
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

      {/* Warning regarding internal server switcher & iPhone Safari Fullscreen Subtitle behavior */}
      <div className="p-3.5 bg-[#11131c] rounded-xl border border-amber-500/20 text-[11px] sm:text-xs text-gray-400 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Важное примечание по выбору сервера и полноэкранному режиму iPhone:</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-gray-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Sandbox активен •{' '}
              {iframeContainerLoaded
                ? 'Фрейм загружен (поток проверяется вручную)'
                : 'Ожидание фрейма'}
            </span>
          </div>
        </div>
        <p className="leading-relaxed">
          Кнопочный параметр <code className="text-gray-200 bg-white/5 px-1 py-0.5 rounded">?server=cinesrc</code> автоматически выбирает проверенный сервер <strong className="text-gray-200">Cinesrc</strong> при открытии.
          Внутри самого плеера EmbedWave остаётся собственное меню смены серверов — <strong className="text-amber-300">не переключайтесь на Multi HD (nxsha)</strong>, так как на нём зафиксированы несоответствие фильма и зависания. Если вы случайно переключили сервер или видео не отвечает, нажмите кнопку <strong className="text-gray-200">«Сбросить на Cinesrc»</strong> выше.
        </p>
        <p className="leading-relaxed text-gray-400 border-t border-white/5 pt-1.5">
          <strong className="text-gray-200">Субтитры на iPhone Safari:</strong> внешний HTML-оверлей русских субтитров работает при встроенном просмотре, в горизонтальной ориентации и в режиме <strong className="text-gray-200">«Режим Кинотеатр»</strong> (кнопка выше). Системный нативный fullscreen iOS Safari (кнопка внутри самого видеоплеера) открывает видео поверх веб-страницы и скрывает любые HTML-оверлеи браузера.
        </p>
      </div>
    </div>
  );
}

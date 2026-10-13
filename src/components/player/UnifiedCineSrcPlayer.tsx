'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Subtitles,
  Maximize,
  Minimize,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Sparkles,
  X,
  Info,
  Bug,
  ChevronDown
} from 'lucide-react';
import {
  ExternalSubtitleEngine,
  ExternalSubtitleTrack,
  clampSubtitleOffset,
  MIN_SUBTITLE_OFFSET_SEC,
  MAX_SUBTITLE_OFFSET_SEC,
  MAX_SUBTITLE_FILE_SIZE_BYTES
} from '@/lib/playback/externalSubtitleEngine';
import {
  validateCineSrcMessageEvent,
  sendCineSrcCommand,
  CINESRC_ORIGIN,
  CineSrcCommandName,
  CineSrcEventType
} from '@/lib/playback/cinesrcBridge';
import type { SubDLSearchResponse } from '@/lib/services/subdl';
import type { OpenSubtitlesSearchResponse } from '@/lib/services/openSubtitles';

export interface UnifiedCineSrcPlayerProps {
  tmdbId: number;
  imdbId?: string;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title: string;
  runtimeMinutes?: number;
  initialControlsDisabled?: boolean;
  showDiagnosticsByDefault?: boolean;
  onNextEpisode?: () => void;
}

type SubtitleSelection = 'off' | 'ru';
type SubtitleFontSize = 'sm' | 'md' | 'lg' | 'xl';
type SubtitlePosition = 'bottom' | 'mid' | 'top';

function formatPlayerTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '0:00';
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
 * UnifiedCineSrcPlayer (Step 2G: Experimental Unified Player)
 *
 * Architecture & Guarantees:
 *  1. One clean cinematic KinoRoom player interface (dark theme, red accents).
 *  2. Direct CineSrc iframe (`controls=false&autoplay=false` by default).
 *  3. Bidirectional postMessage command & event bridge with origin & source verification.
 *  4. Sequential SubDL -> OpenSubtitles automatic subtitle cascade.
 *  5. HTML Subtitle overlay with timing synchronization and CSS Cinema Fullscreen.
 *  6. Separate Developer Diagnostics panel for inspecting real events without cluttering UX.
 */
export function UnifiedCineSrcPlayer({
  tmdbId,
  imdbId,
  type,
  season = 1,
  episode = 1,
  title,
  runtimeMinutes,
  initialControlsDisabled = true,
  showDiagnosticsByDefault = false,
  onNextEpisode
}: UnifiedCineSrcPlayerProps) {
  // Player container & iframe references
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // CineSrc mode configuration (?controls=false default)
  const [controlsDisabled, setControlsDisabled] = useState<boolean>(initialControlsDisabled);
  const [autoplayEnabled, setAutoplayEnabled] = useState<boolean>(false);
  const [iframeKey, setIframeKey] = useState<number>(0);

  // Playback state
  const [playerReady, setPlayerReady] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const [seekPreviewTime, setSeekPreviewTime] = useState<number | null>(null);

  // UI state
  const [controlsVisible, setControlsVisible] = useState<boolean>(true);
  const [isCinemaFullscreen, setIsCinemaFullscreen] = useState<boolean>(false);
  const [isCcMenuOpen, setIsCcMenuOpen] = useState<boolean>(false);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(showDiagnosticsByDefault);

  // Diagnostics & Event Tracking
  const [lastEventType, setLastEventType] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<Array<{ time: string; type: string; payload: string }>>([]);
  const [testedCommands, setTestedCommands] = useState<Record<string, { count: number; lastStatus: string }>>({});

  // Subtitle Engine & Cascade State
  const engineRef = useRef<ExternalSubtitleEngine>(new ExternalSubtitleEngine());
  const [subtitleSelection, setSubtitleSelection] = useState<SubtitleSelection>('off');
  const [loadedTracks, setLoadedTracks] = useState<ExternalSubtitleTrack[]>([]);
  const [activeTrackIndex, setActiveTrackIndex] = useState<number>(0);
  const [activeLines, setActiveLines] = useState<string[]>([]);
  const [subtitleOffset, setSubtitleOffset] = useState<number>(0);
  const [subtitleFontSize, setSubtitleFontSize] = useState<SubtitleFontSize>('md');
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitlePosition>('bottom');
  const [isProvisionalTrack, setIsProvisionalTrack] = useState<boolean>(false);
  const [activeSubtitleSource, setActiveSubtitleSource] = useState<'subdl' | 'opensubtitles' | 'local' | null>(null);
  const [activeSubtitleName, setActiveSubtitleName] = useState<string | null>(null);
  const [activeSubtitleCues, setActiveSubtitleCues] = useState<number>(0);
  const [subtitlesAutoLoading, setSubtitlesAutoLoading] = useState<boolean>(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);

  // Unique identifier for the iframe instance
  const activeIframeId = `cinesrc-unified-${tmdbId}-${season}-${episode}-${iframeKey}`;

  // Build direct CineSrc URL
  const iframeSrc =
    type === 'tv'
      ? `https://cinesrc.st/embed/tv/${encodeURIComponent(tmdbId)}?s=${encodeURIComponent(season)}&e=${encodeURIComponent(episode)}&controls=${controlsDisabled ? 'false' : 'true'}&autoplay=${autoplayEnabled ? 'true' : 'false'}`
      : `https://cinesrc.st/embed/movie/${encodeURIComponent(tmdbId)}?controls=${controlsDisabled ? 'false' : 'true'}&autoplay=${autoplayEnabled ? 'true' : 'false'}`;

  // Log diagnostic events
  const logDiagnosticEvent = useCallback((type: string, payload: string) => {
    setRecentEvents((prev) => [
      { time: new Date().toLocaleTimeString(), type, payload },
      ...prev.slice(0, 29)
    ]);
  }, []);

  // Dispatch postMessage command to CineSrc iframe
  const dispatchCommand = useCallback(
    (command: CineSrcCommandName, args: unknown[] = []) => {
      const win = iframeRef.current?.contentWindow;
      const success = sendCineSrcCommand(win, command, args);
      setTestedCommands((prev) => ({
        ...prev,
        [command]: {
          count: (prev[command]?.count || 0) + 1,
          lastStatus: success ? 'Отправлено' : 'Ошибка окна'
        }
      }));
      logDiagnosticEvent(`cmd:${command}`, JSON.stringify(args));
      return success;
    },
    [logDiagnosticEvent]
  );

  // Play / Pause toggler
  const handleTogglePlay = useCallback(() => {
    if (isPaused) {
      dispatchCommand('play');
    } else {
      dispatchCommand('pause');
    }
  }, [isPaused, dispatchCommand]);

  // Seek handler
  const handleSeek = useCallback(
    (targetSeconds: number) => {
      const clamped = Math.max(0, Math.min(duration || 86400, targetSeconds));
      dispatchCommand('seek', [clamped]);
      engineRef.current.onSeek(clamped);
      setActiveLines(engineRef.current.getActiveLines());
    },
    [duration, dispatchCommand]
  );

  const handleSeekRelative = useCallback(
    (deltaSeconds: number) => {
      handleSeek(currentTime + deltaSeconds);
    },
    [currentTime, handleSeek]
  );

  // Volume handler
  const handleVolumeChange = useCallback(
    (newVolume: number) => {
      const clamped = Math.max(0, Math.min(1, newVolume));
      setVolume(clamped);
      setIsMuted(clamped === 0);
      dispatchCommand('setVolume', [clamped]);
    },
    [dispatchCommand]
  );

  const handleToggleMute = useCallback(() => {
    if (isMuted) {
      setIsMuted(false);
      const targetVol = volume > 0 ? volume : 1;
      setVolume(targetVol);
      dispatchCommand('setVolume', [targetVol]);
    } else {
      setIsMuted(true);
      dispatchCommand('setVolume', [0]);
    }
  }, [isMuted, volume, dispatchCommand]);

  // Controls auto-hide timer
  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (!isPaused) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (!isCcMenuOpen && !showDiagnostics) {
          setControlsVisible(false);
        }
      }, 3500);
    }
  }, [isPaused, isCcMenuOpen, showDiagnostics]);

  // PostMessage listener for CineSrc iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const expectedWindow = iframeRef.current?.contentWindow;
      const validated = validateCineSrcMessageEvent(
        { origin: event.origin, source: event.source, data: event.data },
        { expectedIframeWindow: expectedWindow, activeIframeId, currentIframeId: activeIframeId }
      );

      if (!validated) return;

      setLastEventType(validated.type);

      switch (validated.type) {
        case 'cinesrc:ready': {
          setPlayerReady(true);
          dispatchCommand('getDuration');
          dispatchCommand('getCurrentTime');
          logDiagnosticEvent('cinesrc:ready', 'Player iframe ready');
          break;
        }

        case 'cinesrc:loadedmetadata': {
          if (validated.duration !== undefined) {
            setDuration(validated.duration);
          }
          logDiagnosticEvent('cinesrc:loadedmetadata', `duration=${validated.duration}`);
          break;
        }

        case 'cinesrc:play': {
          setIsPaused(false);
          engineRef.current.onPlay();
          setActiveLines(engineRef.current.getActiveLines());
          logDiagnosticEvent('cinesrc:play', 'Playback started');
          break;
        }

        case 'cinesrc:pause': {
          setIsPaused(true);
          setControlsVisible(true);
          engineRef.current.onPause();
          setActiveLines(engineRef.current.getActiveLines());
          logDiagnosticEvent('cinesrc:pause', 'Playback paused');
          break;
        }

        case 'cinesrc:timeupdate': {
          if (validated.currentTime !== undefined) {
            setCurrentTime(validated.currentTime);
            if (validated.duration !== undefined) {
              setDuration(validated.duration);
            }
            engineRef.current.updatePlaybackTime(validated.currentTime, { isPaused: false });
            setActiveLines(engineRef.current.getActiveLines());
          }
          break;
        }

        case 'cinesrc:seeking':
        case 'cinesrc:seeked': {
          if (validated.currentTime !== undefined) {
            setCurrentTime(validated.currentTime);
            engineRef.current.onSeek(validated.currentTime);
            setActiveLines(engineRef.current.getActiveLines());
            logDiagnosticEvent(validated.type, `currentTime=${validated.currentTime}`);
          }
          break;
        }

        case 'cinesrc:ended': {
          setIsPaused(true);
          setControlsVisible(true);
          engineRef.current.onEnded();
          setActiveLines([]);
          logDiagnosticEvent('cinesrc:ended', 'Stream ended');
          break;
        }

        case 'cinesrc:nextepisode': {
          logDiagnosticEvent('cinesrc:nextepisode', 'Next episode requested');
          onNextEpisode?.();
          break;
        }

        case 'cinesrc:response': {
          if (validated.command === 'getCurrentTime' && validated.currentTime !== undefined) {
            setCurrentTime(validated.currentTime);
            engineRef.current.updatePlaybackTime(validated.currentTime);
            setActiveLines(engineRef.current.getActiveLines());
          } else if (validated.command === 'getDuration' && validated.duration !== undefined) {
            setDuration(validated.duration);
          } else if (validated.command === 'getPaused' && typeof validated.result === 'boolean') {
            setIsPaused(validated.result);
          }
          break;
        }

        case 'cinesrc:error': {
          logDiagnosticEvent('cinesrc:error', validated.error || 'CineSrc error');
          break;
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [activeIframeId, dispatchCommand, logDiagnosticEvent, onNextEpisode]);

  // Step 2G: Automatic Subtitles Fetch (Cascade: SubDL primary -> OpenSubtitles fallback)
  useEffect(() => {
    let isCancelled = false;

    async function autoFetchSubtitles() {
      setSubtitlesAutoLoading(true);
      setSubtitleError(null);

      try {
        // --- 1. Primary Source: SubDL API v2 ---
        const subdlParams = new URLSearchParams({
          tmdbId: String(tmdbId),
          type,
          season: String(season),
          episode: String(episode),
          autoDownload: 'true'
        });
        if (imdbId) subdlParams.append('imdbId', imdbId);

        const subdlRes = await fetch(`/api/playback/subtitles/subdl?${subdlParams.toString()}`);
        let subdlData: SubDLSearchResponse | null = null;
        if (subdlRes.ok) {
          subdlData = await subdlRes.json();
        }

        if (!isCancelled && subdlData?.autoLoadedSubtitle?.content) {
          const autoSub = subdlData.autoLoadedSubtitle;
          const parseResult = engineRef.current.loadFromText(autoSub.content, {
            fileName: autoSub.fileName,
            label: `Русские [SubDL] (${autoSub.fileName})`,
            lang: 'ru'
          });

          if (parseResult.valid && parseResult.track) {
            setLoadedTracks([parseResult.track]);
            setActiveTrackIndex(0);
            setIsProvisionalTrack(Boolean(autoSub.isProvisional));
            setActiveSubtitleSource('subdl');
            setActiveSubtitleName(subdlData.bestCandidate?.releaseName || autoSub.fileName);
            setActiveSubtitleCues(parseResult.track.cues.length);

            const savedPref = typeof window !== 'undefined' ? localStorage.getItem('kinoroom_subtitle_pref') : null;
            if (savedPref !== 'off') {
              setSubtitleSelection('ru');
            } else {
              setSubtitleSelection('off');
            }

            if (currentTime > 0) {
              engineRef.current.updatePlaybackTime(currentTime, { isPaused });
              setActiveLines(engineRef.current.getActiveLines());
            }
            return;
          }
        }

        // --- 2. Fallback: OpenSubtitles REST API v1 ---
        const osParams = new URLSearchParams({
          tmdbId: String(tmdbId),
          type,
          season: String(season),
          episode: String(episode),
          autoDownload: 'true'
        });
        if (imdbId) osParams.append('imdbId', imdbId);
        const expectedDur = duration || (runtimeMinutes ? runtimeMinutes * 60 : undefined);
        if (expectedDur) osParams.append('duration', String(Math.round(expectedDur)));

        const osRes = await fetch(`/api/playback/subtitles/opensubtitles?${osParams.toString()}`);
        let osData: OpenSubtitlesSearchResponse | null = null;
        if (osRes.ok) {
          osData = await osRes.json();
        }

        if (!isCancelled && osData?.autoLoadedSubtitle?.content) {
          const autoSub = osData.autoLoadedSubtitle;
          const parseResult = engineRef.current.loadFromText(autoSub.content, {
            fileName: autoSub.fileName,
            label: `Русские [OpenSubtitles] (${autoSub.fileName})`,
            lang: 'ru'
          });

          if (parseResult.valid && parseResult.track) {
            setLoadedTracks([parseResult.track]);
            setActiveTrackIndex(0);
            setIsProvisionalTrack(Boolean(autoSub.isProvisional));
            setActiveSubtitleSource('opensubtitles');
            setActiveSubtitleName(osData.bestCandidate?.release || autoSub.fileName);
            setActiveSubtitleCues(parseResult.track.cues.length);

            const savedPref = typeof window !== 'undefined' ? localStorage.getItem('kinoroom_subtitle_pref') : null;
            if (savedPref !== 'off') {
              setSubtitleSelection('ru');
            } else {
              setSubtitleSelection('off');
            }

            if (currentTime > 0) {
              engineRef.current.updatePlaybackTime(currentTime, { isPaused });
              setActiveLines(engineRef.current.getActiveLines());
            }
            return;
          }
        }

        // Neither source had compatible subtitles
        if (!isCancelled) {
          setActiveSubtitleSource(null);
          setSubtitleSelection('off');
        }
      } catch (err: any) {
        if (!isCancelled) {
          setSubtitleError(err?.message || 'Ошибка авто-подбора субтитров');
        }
      } finally {
        if (!isCancelled) {
          setSubtitlesAutoLoading(false);
        }
      }
    }

    autoFetchSubtitles();

    return () => {
      isCancelled = true;
    };
  }, [tmdbId, imdbId, type, season, episode, duration, runtimeMinutes, isPaused, currentTime]);

  // Subtitle timing offset adjustment
  const handleAdjustOffset = (delta: number) => {
    const updated = engineRef.current.adjustOffsetSeconds(delta);
    setSubtitleOffset(updated);
    setActiveLines(engineRef.current.getActiveLines());
  };

  const handleResetOffset = () => {
    const updated = engineRef.current.setOffsetSeconds(0);
    setSubtitleOffset(updated);
    setActiveLines(engineRef.current.getActiveLines());
  };

  // Local subtitle file upload
  const handleUploadLocalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > MAX_SUBTITLE_FILE_SIZE_BYTES) {
      setSubtitleError('Файл превышает лимит 5 МБ');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const parseResult = engineRef.current.loadFromBuffer(buffer, {
        fileName: file.name,
        label: `Русские (${file.name})`,
        lang: 'ru'
      });

      if (!parseResult.valid || !parseResult.track) {
        setSubtitleError('Не удалось распознать таймкоды файла');
        return;
      }

      setLoadedTracks((prev) => [...prev, parseResult.track!]);
      setActiveTrackIndex(loadedTracks.length);
      setActiveSubtitleSource('local');
      setActiveSubtitleName(file.name);
      setActiveSubtitleCues(parseResult.track.cues.length);
      setSubtitleSelection('ru');
      if (typeof window !== 'undefined') {
        localStorage.setItem('kinoroom_subtitle_pref', 'ru');
      }
      setActiveLines(engineRef.current.getActiveLines());
    } catch (err: any) {
      setSubtitleError(err?.message || 'Ошибка чтения файла');
    }
  };

  // Listen for Escape key to exit Cinema Fullscreen
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

  // CSS classes for subtitle position & size
  const subtitlePositionClass =
    subtitlePosition === 'top'
      ? 'top-8 sm:top-12'
      : subtitlePosition === 'mid'
      ? 'top-1/2 -translate-y-1/2'
      : 'bottom-16 sm:bottom-20';

  const subtitleSizeClass =
    subtitleFontSize === 'sm'
      ? 'text-xs sm:text-sm'
      : subtitleFontSize === 'lg'
      ? 'text-base sm:text-xl md:text-2xl'
      : subtitleFontSize === 'xl'
      ? 'text-lg sm:text-2xl md:text-3xl'
      : 'text-sm sm:text-base md:text-lg';

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Hidden file input for manual upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".srt,.vtt"
        onChange={handleUploadLocalFile}
        className="hidden"
        aria-hidden="true"
      />

      {/* Main Unified Player Container */}
      <div
        ref={containerRef}
        data-testid="unified-player-container"
        onMouseMove={resetControlsTimer}
        onTouchStart={resetControlsTimer}
        className={
          isCinemaFullscreen
            ? 'fixed inset-0 z-[9999] bg-black w-screen h-dvh flex items-center justify-center overflow-hidden'
            : 'relative w-full aspect-video min-h-[260px] sm:min-h-[360px] md:min-h-[460px] bg-[#090b10] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center select-none'
        }
      >
        {/* 1. Underlying CineSrc Iframe */}
        <iframe
          ref={iframeRef}
          id={activeIframeId}
          data-testid="unified-cinesrc-iframe"
          key={activeIframeId}
          src={iframeSrc}
          title={title}
          className="w-full h-full border-0 absolute inset-0 z-0"
          referrerPolicy="no-referrer"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        />

        {/* 2. Synchronized HTML Subtitle Overlay (Strict React Text Nodes) */}
        {subtitleSelection === 'ru' && activeLines.length > 0 && (
          <div
            data-testid="unified-subtitle-overlay"
            className={`absolute ${subtitlePositionClass} left-4 right-4 z-20 flex flex-col items-center justify-center pointer-events-none transition-all duration-150`}
          >
            <div
              data-testid="unified-subtitle-cue-box"
              className="max-w-3xl px-3.5 py-1.5 rounded-xl bg-black/80 backdrop-blur-xs text-white font-medium text-center shadow-2xl border border-white/10 leading-snug tracking-wide"
            >
              {activeLines.map((line, idx) => (
                <div
                  key={idx}
                  data-testid={`unified-subtitle-line-${idx}`}
                  className={`${subtitleSizeClass} drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]`}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Big Central Play/Pause Watermark Overlay when controls=false */}
        {controlsDisabled && isPaused && (
          <button
            type="button"
            data-testid="unified-big-play-btn"
            onClick={handleTogglePlay}
            aria-label="Воспроизведение"
            className="absolute z-20 p-5 sm:p-6 rounded-full bg-red-600/90 hover:bg-red-600 text-white shadow-2xl border border-red-500/50 backdrop-blur-md transition-transform hover:scale-110 active:scale-95 cursor-pointer"
          >
            <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current translate-x-0.5" />
          </button>
        )}

        {/* 4. Top Control Bar (Title + Status + Exit Fullscreen / Diagnostics) */}
        <div
          className={`absolute top-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 flex items-center justify-between gap-3 ${
            controlsVisible || isPaused ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 truncate">
            <span className="text-xs sm:text-sm font-bold text-white truncate">{title}</span>
            {type === 'tv' && (
              <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded bg-white/10 border border-white/15 text-gray-300">
                S{season}E{episode}
              </span>
            )}
            {activeSubtitleSource && subtitleSelection === 'ru' && (
              <span
                data-testid="unified-active-sub-badge"
                className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase"
              >
                [{activeSubtitleSource}]
                {isProvisionalTrack && <span className="text-amber-300">[Предв.]</span>}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Toggle Diagnostics Panel */}
            <button
              type="button"
              data-testid="toggle-diagnostics-btn"
              onClick={() => setShowDiagnostics((prev) => !prev)}
              className={`p-1.5 sm:px-2.5 sm:py-1 rounded-xl text-xs font-medium border flex items-center gap-1.5 cursor-pointer transition-all ${
                showDiagnostics
                  ? 'bg-red-600/30 border-red-500/50 text-red-300'
                  : 'bg-black/60 hover:bg-black/80 border-white/15 text-gray-300 hover:text-white'
              }`}
            >
              <Bug className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Диагностика</span>
            </button>

            {/* Exit Cinema Fullscreen */}
            {isCinemaFullscreen && (
              <button
                type="button"
                data-testid="exit-cinema-fullscreen-btn"
                onClick={() => setIsCinemaFullscreen(false)}
                className="px-3 py-1 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
              >
                <Minimize className="w-3.5 h-3.5" />
                <span>Выход</span>
              </button>
            )}
          </div>
        </div>

        {/* 5. Bottom Unified Cinematic Controls Bar */}
        <div
          data-testid="unified-controls-bar"
          className={`absolute bottom-0 inset-x-0 z-30 p-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent transition-opacity duration-300 space-y-2 ${
            controlsVisible || isPaused ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Timeline / Progress Scrubber */}
          <div className="relative group flex items-center">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.5}
              value={seekPreviewTime !== null ? seekPreviewTime : currentTime}
              onMouseDown={() => setIsSeeking(true)}
              onTouchStart={() => setIsSeeking(true)}
              onChange={(e) => setSeekPreviewTime(parseFloat(e.target.value))}
              onMouseUp={(e) => {
                setIsSeeking(false);
                setSeekPreviewTime(null);
                handleSeek(parseFloat((e.target as HTMLInputElement).value));
              }}
              onTouchEnd={(e) => {
                setIsSeeking(false);
                setSeekPreviewTime(null);
                handleSeek(parseFloat((e.target as HTMLInputElement).value));
              }}
              data-testid="unified-progress-slider"
              aria-label="Перемотка видео"
              className="w-full h-1.5 sm:h-2 bg-white/20 hover:bg-white/30 rounded-lg appearance-none cursor-pointer accent-red-600 transition-all"
            />
            <div
              className="absolute left-0 top-0 bottom-0 pointer-events-none rounded-lg bg-red-600 h-1.5 sm:h-2"
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>

          {/* Control Buttons Row */}
          <div className="flex items-center justify-between gap-2 text-white">
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Play / Pause button */}
              <button
                type="button"
                data-testid="unified-play-pause-btn"
                onClick={handleTogglePlay}
                aria-label={isPaused ? 'Воспроизведение' : 'Пауза'}
                className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
              >
                {isPaused ? <Play className="w-4 h-4 fill-current" /> : <Pause className="w-4 h-4 fill-current" />}
              </button>

              {/* Backward 10s */}
              <button
                type="button"
                data-testid="unified-seek-backward-btn"
                onClick={() => handleSeekRelative(-10)}
                aria-label="Назад 10 секунд"
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-200 hover:text-white cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* Forward 10s */}
              <button
                type="button"
                data-testid="unified-seek-forward-btn"
                onClick={() => handleSeekRelative(10)}
                aria-label="Вперёд 10 секунд"
                className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-200 hover:text-white cursor-pointer transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {/* Volume / Mute controls */}
              <div className="flex items-center gap-1 group/vol">
                <button
                  type="button"
                  data-testid="unified-mute-btn"
                  onClick={handleToggleMute}
                  aria-label={isMuted ? 'Включить звук' : 'Выключить звук'}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-gray-200 hover:text-white cursor-pointer transition-colors"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  data-testid="unified-volume-slider"
                  aria-label="Громкость"
                  className="w-16 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-600 hidden sm:block"
                />
              </div>

              {/* Time display */}
              <div
                data-testid="unified-time-display"
                className="text-xs sm:text-sm font-mono text-gray-300 ml-1.5 select-none"
              >
                <span>{formatPlayerTime(currentTime)}</span>
                <span className="text-gray-500 mx-1">/</span>
                <span>{formatPlayerTime(duration)}</span>
              </div>
            </div>

            {/* Right side controls (Subtitles + Fullscreen) */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* CC Subtitles Button */}
              <div className="relative">
                <button
                  type="button"
                  data-testid="unified-subtitles-btn"
                  onClick={() => setIsCcMenuOpen((prev) => !prev)}
                  aria-label="Настройки субтитров"
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    subtitleSelection === 'ru'
                      ? 'bg-red-600/30 border-red-500/50 text-red-200'
                      : 'bg-white/10 hover:bg-white/15 border-white/15 text-gray-300'
                  }`}
                >
                  <Subtitles className="w-3.5 h-3.5" />
                  <span>CC</span>
                  {subtitleSelection === 'ru' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                </button>

                {/* Subtitles Popover Menu */}
                {isCcMenuOpen && (
                  <div
                    data-testid="unified-cc-popover"
                    className="absolute right-0 bottom-full mb-2 w-72 sm:w-80 p-3.5 rounded-2xl bg-[#11141d]/95 backdrop-blur-md border border-white/15 shadow-2xl z-40 text-xs space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div className="flex items-center gap-1.5 font-bold text-white">
                        <Subtitles className="w-4 h-4 text-red-400" />
                        <span>Русские субтитры</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCcMenuOpen(false)}
                        className="text-gray-400 hover:text-white p-0.5 rounded cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Track state toggle */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        data-testid="unified-cc-off-btn"
                        onClick={() => {
                          setSubtitleSelection('off');
                          if (typeof window !== 'undefined') {
                            localStorage.setItem('kinoroom_subtitle_pref', 'off');
                          }
                        }}
                        className={`flex-1 py-1.5 rounded-xl font-bold border transition-colors cursor-pointer ${
                          subtitleSelection === 'off'
                            ? 'bg-red-600 text-white border-red-500'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        Выключены
                      </button>
                      <button
                        type="button"
                        data-testid="unified-cc-ru-btn"
                        disabled={loadedTracks.length === 0}
                        onClick={() => {
                          if (loadedTracks.length > 0) {
                            setSubtitleSelection('ru');
                            if (typeof window !== 'undefined') {
                              localStorage.setItem('kinoroom_subtitle_pref', 'ru');
                            }
                          }
                        }}
                        className={`flex-1 py-1.5 rounded-xl font-bold border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          subtitleSelection === 'ru'
                            ? 'bg-emerald-600 text-white border-emerald-500'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                        }`}
                      >
                        Русские {loadedTracks.length > 0 ? `(${activeSubtitleCues})` : ''}
                      </button>
                    </div>

                    {/* Active Track info */}
                    <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400">Источник:</span>
                        <span className="font-semibold text-emerald-400">
                          {activeSubtitleSource ? `[${activeSubtitleSource.toUpperCase()}]` : 'Не загружен'}
                          {isProvisionalTrack && ' [Предв.]'}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-300 truncate" title={activeSubtitleName || ''}>
                        {activeSubtitleName || (subtitlesAutoLoading ? 'Поиск...' : 'Субтитры отсутствуют')}
                      </div>
                    </div>

                    {/* Font Size controls */}
                    <div className="space-y-1.5">
                      <span className="text-gray-400 text-[11px] block">Размер текста:</span>
                      <div className="grid grid-cols-4 gap-1">
                        {(['sm', 'md', 'lg', 'xl'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setSubtitleFontSize(sz)}
                            className={`py-1 rounded-lg font-medium text-[11px] border cursor-pointer ${
                              subtitleFontSize === sz
                                ? 'bg-white/20 border-white/40 text-white font-bold'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                            }`}
                          >
                            {sz.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Delay Offset Controls (-60s to +60s) */}
                    <div className="space-y-1.5 pt-1 border-t border-white/10">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400">Сдвиг тайминга:</span>
                        <span className="font-mono font-bold text-emerald-400">
                          {subtitleOffset > 0 ? `+${subtitleOffset.toFixed(1)}` : subtitleOffset.toFixed(1)}с
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => handleAdjustOffset(-5)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono cursor-pointer"
                        >
                          -5с
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustOffset(-0.5)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono cursor-pointer"
                        >
                          -0.5с
                        </button>
                        <button
                          type="button"
                          onClick={handleResetOffset}
                          className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-semibold cursor-pointer"
                        >
                          0.0с
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustOffset(0.5)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono cursor-pointer"
                        >
                          +0.5с
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustOffset(5)}
                          className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono cursor-pointer"
                        >
                          +5с
                        </button>
                      </div>
                    </div>

                    {/* Manual upload button */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-[11px] font-semibold cursor-pointer transition-colors"
                    >
                      Загрузить свой файл (.srt / .vtt)
                    </button>
                  </div>
                )}
              </div>

              {/* Fullscreen (CSS Cinema Fullscreen for iPhone compatibility) */}
              <button
                type="button"
                data-testid="unified-fullscreen-btn"
                onClick={() => setIsCinemaFullscreen((prev) => !prev)}
                aria-label={isCinemaFullscreen ? 'Обычный экран' : 'Полноэкранный режим'}
                className="p-2 sm:p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
              >
                {isCinemaFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Developer Diagnostics Panel (Collapsible / Dedicated Mode for Step 2G) */}
      {showDiagnostics && (
        <div
          data-testid="developer-diagnostics-panel"
          className="p-4 rounded-2xl bg-[#0c0e15] border border-white/10 space-y-4 text-xs text-gray-300"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Bug className="w-4 h-4 text-red-400" />
              <h4 className="font-bold text-white text-sm">Лаборатория CineSrc postMessage API (Шаг 2G)</h4>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="diag-toggle-controls-btn"
                onClick={() => {
                  setControlsDisabled((prev) => !prev);
                  setIframeKey((k) => k + 1);
                }}
                className={`px-2.5 py-1 rounded-xl text-xs font-semibold border cursor-pointer ${
                  controlsDisabled
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}
              >
                controls={controlsDisabled ? 'false (KinoRoom UI)' : 'true (Встроенные)'}
              </button>
              <button
                type="button"
                onClick={() => setIframeKey((k) => k + 1)}
                className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/15 text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Перезагрузить фрейм</span>
              </button>
            </div>
          </div>

          {/* Quick command dispatchers */}
          <div className="space-y-1.5">
            <span className="font-semibold text-gray-200 block">Отправка документированных команд postMessage:</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid="diag-cmd-play"
                onClick={() => dispatchCommand('play')}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-mono cursor-pointer"
              >
                play
              </button>
              <button
                type="button"
                data-testid="diag-cmd-pause"
                onClick={() => dispatchCommand('pause')}
                className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 font-mono cursor-pointer"
              >
                pause
              </button>
              <button
                type="button"
                data-testid="diag-cmd-seek-0"
                onClick={() => dispatchCommand('seek', [0])}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-mono cursor-pointer"
              >
                seek(0s)
              </button>
              <button
                type="button"
                data-testid="diag-cmd-seek-600"
                onClick={() => dispatchCommand('seek', [600])}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-mono cursor-pointer"
              >
                seek(600s / 10м)
              </button>
              <button
                type="button"
                data-testid="diag-cmd-seek-1800"
                onClick={() => dispatchCommand('seek', [1800])}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 font-mono cursor-pointer"
              >
                seek(1800s / 30м)
              </button>
              <button
                type="button"
                data-testid="diag-cmd-get-time"
                onClick={() => dispatchCommand('getCurrentTime')}
                className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 font-mono cursor-pointer"
              >
                getCurrentTime
              </button>
              <button
                type="button"
                data-testid="diag-cmd-get-duration"
                onClick={() => dispatchCommand('getDuration')}
                className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 font-mono cursor-pointer"
              >
                getDuration
              </button>
              <button
                type="button"
                data-testid="diag-cmd-get-paused"
                onClick={() => dispatchCommand('getPaused')}
                className="px-2.5 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 font-mono cursor-pointer"
              >
                getPaused
              </button>
            </div>
          </div>

          {/* Real-time status indicators */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-white/10">
            <div className="p-2 rounded-lg bg-white/5">
              <span className="text-[10px] text-gray-400 block">Готовность плеера:</span>
              <span className="font-bold text-white">{playerReady ? 'READY' : 'Ожидание...'}</span>
            </div>
            <div className="p-2 rounded-lg bg-white/5">
              <span className="text-[10px] text-gray-400 block">Текущее время:</span>
              <span className="font-bold text-emerald-400 font-mono">{currentTime.toFixed(2)}с</span>
            </div>
            <div className="p-2 rounded-lg bg-white/5">
              <span className="text-[10px] text-gray-400 block">Длительность:</span>
              <span className="font-bold text-white font-mono">{duration.toFixed(2)}с</span>
            </div>
            <div className="p-2 rounded-lg bg-white/5">
              <span className="text-[10px] text-gray-400 block">Последнее событие:</span>
              <span className="font-bold text-amber-300 font-mono truncate block">{lastEventType || '—'}</span>
            </div>
          </div>

          {/* Event Stream Log */}
          <div className="space-y-1.5">
            <span className="font-semibold text-gray-200 block">История полученных событий postMessage:</span>
            <div
              data-testid="diag-event-log"
              className="max-h-36 overflow-y-auto rounded-xl bg-black/60 p-2 font-mono text-[11px] space-y-1 border border-white/5"
            >
              {recentEvents.length === 0 ? (
                <div className="text-gray-500">События ещё не поступали...</div>
              ) : (
                recentEvents.map((ev, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-gray-500">{ev.time}</span>
                    <span className="text-emerald-400 font-bold">{ev.type}</span>
                    <span className="text-gray-400 truncate">{ev.payload}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

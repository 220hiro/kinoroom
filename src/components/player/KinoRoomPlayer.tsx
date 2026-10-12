'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Subtitles,
  Languages,
  Mic,
  Gauge,
  Layers,
  Loader2,
  Sparkles,
  AlertCircle,
  RefreshCw,
  X
} from 'lucide-react';
import {
  PlaybackResponse,
  PlaybackSource,
  PlaybackTranslation,
  PlaybackAudioTrack,
  PlaybackSubtitle,
  PlaybackQuality
} from '@/lib/playback/types';

interface KinoRoomPlayerProps {
  playbackData: PlaybackResponse;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onTranslationChange?: (translationId: string, currentTime: number) => Promise<PlaybackResponse | void>;
  onRefreshStream?: () => Promise<PlaybackResponse | void>;
  autoPlay?: boolean;
}

export function KinoRoomPlayer({
  playbackData,
  initialTime = 0,
  onTimeUpdate,
  onTranslationChange,
  onRefreshStream,
  autoPlay = false
}: KinoRoomPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const hasAppliedInitialTimeRef = useRef<boolean>(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [bufferedEnd, setBufferedEnd] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active stream and metadata
  const [activeStream, setActiveStream] = useState<PlaybackSource>(playbackData.stream);
  const [currentTranslation, setCurrentTranslation] = useState<PlaybackTranslation | undefined>(
    playbackData.currentTranslation
  );
  const [availableTranslations, setAvailableTranslations] = useState<PlaybackTranslation[]>(
    playbackData.availableTranslations || []
  );

  // Tracks discovered in HLS or passed in source
  const [audioTracks, setAudioTracks] = useState<PlaybackAudioTrack[]>(activeStream.audioTracks || []);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<string | number>(-1);

  const [subtitleTracks, setSubtitleTracks] = useState<PlaybackSubtitle[]>(activeStream.subtitles || []);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<string>('off');

  const [qualityLevels, setQualityLevels] = useState<PlaybackQuality[]>(activeStream.qualities || []);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1); // -1 = Auto

  // Dropdown menu toggles
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [showTranslationMenu, setShowTranslationMenu] = useState<boolean>(false);
  const [showAudioMenu, setShowAudioMenu] = useState<boolean>(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState<boolean>(false);
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);

  // Resume prompt state
  const [resumePromptTime, setResumePromptTime] = useState<number | null>(null);

  // Keep state synced if prop changes
  useEffect(() => {
    setActiveStream(playbackData.stream);
    setCurrentTranslation(playbackData.currentTranslation);
    setAvailableTranslations(playbackData.availableTranslations || []);
    if (playbackData.error) {
      setErrorMessage(playbackData.error);
    } else {
      setErrorMessage(null);
    }
  }, [playbackData]);

  // Initial resume prompt
  useEffect(() => {
    if (initialTime && initialTime > 15 && !hasAppliedInitialTimeRef.current) {
      setResumePromptTime(initialTime);
      const timer = setTimeout(() => setResumePromptTime(null), 10000);
      return () => clearTimeout(timer);
    }
  }, [initialTime]);

  const handleApplyResume = () => {
    if (videoRef.current && resumePromptTime) {
      videoRef.current.currentTime = resumePromptTime;
      setCurrentTime(resumePromptTime);
      hasAppliedInitialTimeRef.current = true;
      setResumePromptTime(null);
      videoRef.current.play().catch(() => {});
    }
  };

  const handleDismissResume = () => {
    hasAppliedInitialTimeRef.current = true;
    setResumePromptTime(null);
  };

  // Format seconds to mm:ss or hh:mm:ss
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Setup stream (Hls.js or native HTML5 for Safari / MP4)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStream.url) return;

    setErrorMessage(null);
    setIsBuffering(true);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsUrl = activeStream.url.includes('.m3u8') || activeStream.type === 'hls';

    if (isHlsUrl && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        capLevelToPlayerSize: true
      });
      hlsRef.current = hls;

      hls.loadSource(activeStream.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, _data) => {
        setIsBuffering(false);

        // Quality levels from HLS manifest
        if (hls.levels && hls.levels.length > 0) {
          const lvls: PlaybackQuality[] = hls.levels.map((lvl, idx) => ({
            id: String(idx),
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
            height: lvl.height || 0,
            bitrate: lvl.bitrate
          }));
          setQualityLevels(lvls);
        }

        // Pending seek (e.g. from translation change or resume)
        if (pendingSeekTimeRef.current !== null) {
          video.currentTime = pendingSeekTimeRef.current;
          pendingSeekTimeRef.current = null;
        }

        if (autoPlay) {
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          const parsedTracks: PlaybackAudioTrack[] = hls.audioTracks.map((tr, idx) => ({
            id: idx,
            name: tr.name || `Дорожка ${idx + 1}`,
            lang: tr.lang || '',
            isDefault: tr.default
          }));
          setAudioTracks(parsedTracks);
          setSelectedAudioTrack(hls.audioTrack);
        }
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
          const parsedSubs: PlaybackSubtitle[] = hls.subtitleTracks.map((sub, idx) => ({
            id: String(idx),
            lang: sub.lang || '',
            label: sub.name || `Субтитры ${idx + 1}`,
            url: '',
            format: 'vtt',
            isDefault: sub.default
          }));
          setSubtitleTracks((prev) => {
            const combined = [...prev];
            parsedSubs.forEach((ps) => {
              if (!combined.some((c) => c.label === ps.label)) combined.push(ps);
            });
            return combined;
          });
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.warn('[KinoRoomPlayer] Network error, recovering...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.warn('[KinoRoomPlayer] Media error, recovering...');
              hls.recoverMediaError();
              break;
            default:
              console.error('[KinoRoomPlayer] Fatal error, destroying instance');
              hls.destroy();
              setErrorMessage('Не удалось загрузить видеопоток. Пожалуйста, попробуйте обновить плеер.');
              setIsBuffering(false);
              break;
          }
        }
      });
    } else {
      // Native Apple Safari HLS or direct MP4
      video.src = activeStream.url;
      video.load();

      if (pendingSeekTimeRef.current !== null) {
        video.currentTime = pendingSeekTimeRef.current;
        pendingSeekTimeRef.current = null;
      }

      if (autoPlay) {
        video.play().catch(() => {});
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeStream.url, activeStream.type, autoPlay]);

  // Video playback listeners
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);

    // Buffer range
    if (videoRef.current.buffered.length > 0) {
      for (let i = 0; i < videoRef.current.buffered.length; i++) {
        if (
          videoRef.current.buffered.start(i) <= cur &&
          cur <= videoRef.current.buffered.end(i)
        ) {
          setBufferedEnd(videoRef.current.buffered.end(i));
          break;
        }
      }
    }

    if (onTimeUpdate) onTimeUpdate(cur, dur);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seekRelative = (seconds: number) => {
    if (!videoRef.current) return;
    const target = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
    videoRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (!videoRef.current) return;
    videoRef.current.currentTime = val;
    setCurrentTime(val);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    videoRef.current.muted = next;
  };

  const handleSpeedSelect = (rate: number) => {
    setPlaybackSpeed(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

  // Fullscreen support (including iOS Safari webkitEnterFullscreen)
  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    const isFs = Boolean(
      document.fullscreenElement || (document as any).webkitFullscreenElement
    );

    if (!isFs) {
      if (container.requestFullscreen) {
        container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {
          if (video && (video as any).webkitEnterFullscreen) {
            (video as any).webkitEnterFullscreen();
            setIsFullscreen(true);
          }
        });
      } else if (video && (video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen();
        setIsFullscreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(
        Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement)
      );
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekRelative(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          if (videoRef.current) {
            const next = Math.min(1, Math.round((volume + 0.1) * 10) / 10);
            setVolume(next);
            videoRef.current.volume = next;
            videoRef.current.muted = false;
            setIsMuted(false);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const next = Math.max(0, Math.round((volume - 0.1) * 10) / 10);
            setVolume(next);
            videoRef.current.volume = next;
            if (next === 0) setIsMuted(true);
          }
          break;
        case 'KeyF':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, volume, duration]);

  // Controls auto-hide on inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowSpeedMenu(false);
        setShowTranslationMenu(false);
        setShowAudioMenu(false);
        setShowSubtitleMenu(false);
        setShowQualityMenu(false);
      }
    }, 3500);
  };

  // Switching Translation / Voice Acting (preserves current playback position!)
  const handleSelectTranslation = async (translation: PlaybackTranslation) => {
    if (translation.id === currentTranslation?.id) {
      setShowTranslationMenu(false);
      return;
    }

    const savedPosition = videoRef.current?.currentTime || currentTime;
    pendingSeekTimeRef.current = savedPosition;
    setCurrentTranslation(translation);
    setShowTranslationMenu(false);
    setIsBuffering(true);

    if (onTranslationChange) {
      try {
        const updated = await onTranslationChange(translation.id, savedPosition);
        if (updated && updated.stream) {
          setActiveStream(updated.stream);
        }
      } catch (err: any) {
        console.error('Failed to change translation:', err);
      }
    }
  };

  // Switching In-Manifest Audio Track (via Hls.js or native Safari tracks)
  const handleSelectAudioTrack = (trackId: string | number) => {
    setSelectedAudioTrack(trackId);
    if (hlsRef.current && typeof trackId === 'number') {
      hlsRef.current.audioTrack = trackId;
    } else if (videoRef.current && (videoRef.current as any).audioTracks) {
      const tracks = (videoRef.current as any).audioTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = i === Number(trackId);
      }
    }
    setShowAudioMenu(false);
  };

  // Switching Subtitles
  const handleSelectSubtitleTrack = (subId: string) => {
    setSelectedSubtitleTrack(subId);

    // HLS.js native subtitles
    if (hlsRef.current) {
      const numericId = parseInt(subId, 10);
      hlsRef.current.subtitleTrack = subId === 'off' || isNaN(numericId) ? -1 : numericId;
    }

    // HTML5 text tracks (<track>)
    if (videoRef.current && videoRef.current.textTracks) {
      for (let i = 0; i < videoRef.current.textTracks.length; i++) {
        const tr = videoRef.current.textTracks[i];
        if (subId === 'off') {
          tr.mode = 'disabled';
        } else {
          tr.mode = tr.id === subId || tr.label === subId ? 'showing' : 'disabled';
        }
      }
    }

    setShowSubtitleMenu(false);
  };

  // Switching Quality
  const handleSelectQuality = (qualityId: number) => {
    setSelectedQuality(qualityId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = qualityId; // -1 = Auto
    }
    setShowQualityMenu(false);
  };

  return (
    <div className="space-y-3 select-none">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        className="relative w-full aspect-video min-h-[260px] sm:min-h-[420px] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group flex flex-col justify-between"
      >
        {/* HTML5 Video Element */}
        <video
          ref={videoRef}
          crossOrigin="anonymous"
          playsInline
          preload="auto"
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => {
            setIsPlaying(true);
            setIsBuffering(false);
            setErrorMessage(null);
          }}
          onPause={() => setIsPlaying(false)}
          onWaiting={() => setIsBuffering(true)}
          onPlaying={() => {
            setIsBuffering(false);
            setIsPlaying(true);
          }}
          onError={() => {
            const err = videoRef.current?.error;
            let msg = 'Ошибка воспроизведения видеопотока.';
            if (err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
              msg = 'Формат потока не поддерживается данным браузером.';
            } else if (err?.code === MediaError.MEDIA_ERR_NETWORK) {
              msg = 'Сетевая ошибка при загрузке видео. Проверьте соединение.';
            }
            setErrorMessage(msg);
            setIsBuffering(false);
          }}
          onClick={togglePlay}
          className="w-full h-full object-contain cursor-pointer"
        >
          {/* External VTT Subtitles */}
          {subtitleTracks
            .filter((sub) => sub.url && sub.url.length > 0)
            .map((sub) => (
              <track
                key={sub.id}
                id={sub.id}
                kind="subtitles"
                label={sub.label}
                srcLang={sub.lang}
                src={sub.url}
                default={sub.isDefault}
              />
            ))}
        </video>

        {/* Floating Resume Notification Banner */}
        {resumePromptTime && (
          <div className="absolute top-16 left-4 sm:left-6 z-30 max-w-sm bg-[#12141f]/95 backdrop-blur-md border border-amber-500/50 rounded-xl p-3 shadow-2xl animate-fade-in flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-xs">
                <span className="text-white font-bold">Продолжить просмотр?</span>
                <p className="text-gray-300">С таймкода {formatTime(resumePromptTime)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleApplyResume}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                Да
              </button>
              <button
                onClick={handleDismissResume}
                className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Top Info Header Bar */}
        <div
          className={`absolute top-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 z-20 flex items-center justify-between pointer-events-auto ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 max-w-[70%]">
            <span className="px-2 py-0.5 rounded bg-red-600/90 text-white font-bold text-[10px] tracking-wider uppercase">
              KinoRoom PRO
            </span>
            <span className="text-xs sm:text-sm font-semibold text-white truncate">
              {playbackData.media?.title || 'Воспроизведение'}
            </span>
            {currentTranslation && (
              <span className="hidden md:inline text-[11px] text-gray-300 bg-white/10 px-2 py-0.5 rounded-full border border-white/10">
                {currentTranslation.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-300">
            {playbackData.provider?.name && (
              <span className="hidden sm:inline text-[11px] text-gray-400 font-mono">
                {playbackData.provider.name}
              </span>
            )}
            {onRefreshStream && (
              <button
                onClick={() => onRefreshStream()}
                title="Обновить поток"
                className="p-1.5 rounded-lg bg-black/50 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Center Big Play Button (when paused) */}
        {!isPlaying && !isBuffering && !errorMessage && (
          <button
            type="button"
            onClick={togglePlay}
            className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors cursor-pointer group"
            aria-label="Воспроизвести"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
              <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />
            </div>
          </button>
        )}

        {/* Buffering Indicator */}
        {isBuffering && !errorMessage && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 pointer-events-none gap-2">
            <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
            <span className="text-xs text-white/90 font-medium">Буферизация потока...</span>
          </div>
        )}

        {/* Error Notification Overlay */}
        {errorMessage && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 p-6 text-center space-y-3">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <div className="max-w-md space-y-1">
              <h4 className="text-white font-bold text-sm sm:text-base">Воспроизведение недоступно</h4>
              <p className="text-gray-300 text-xs">{errorMessage}</p>
            </div>
            {onRefreshStream && (
              <button
                onClick={() => onRefreshStream()}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Повторить попытку</span>
              </button>
            )}
          </div>
        )}

        {/* Bottom Control Bar */}
        <div
          className={`absolute bottom-0 inset-x-0 p-3 sm:p-4 bg-gradient-to-t from-black/90 via-black/60 to-transparent transition-opacity duration-300 z-20 space-y-2 pointer-events-auto ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Progress / Seek Slider */}
          <div className="relative group/bar flex items-center">
            {/* Buffered Bar */}
            <div
              className="absolute h-1 sm:h-1.5 bg-white/20 rounded-full pointer-events-none transition-all"
              style={{
                width: `${duration > 0 ? (bufferedEnd / duration) * 100 : 0}%`
              }}
            />
            {/* Played Bar */}
            <div
              className="absolute h-1 sm:h-1.5 bg-red-600 rounded-full pointer-events-none transition-all"
              style={{
                width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`
              }}
            />
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 sm:h-1.5 bg-transparent appearance-none cursor-pointer focus:outline-none relative z-10 accent-red-600 group-hover/bar:h-2 transition-all"
            />
          </div>

          {/* Control Buttons */}
          <div className="flex items-center justify-between text-white text-xs pt-1">
            {/* Left Controls: Play, Rewind, Volume, Time */}
            <div className="flex items-center gap-1.5 sm:gap-3">
              <button
                onClick={togglePlay}
                className="p-1 sm:p-1.5 hover:text-red-500 transition-colors cursor-pointer"
                title={isPlaying ? 'Пауза (Space)' : 'Воспроизведение (Space)'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => seekRelative(-10)}
                className="p-1 hover:text-red-500 transition-colors cursor-pointer hidden sm:block"
                title="Назад 10 секунд (←)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => seekRelative(10)}
                className="p-1 hover:text-red-500 transition-colors cursor-pointer hidden sm:block"
                title="Вперед 10 секунд (→)"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume Slider */}
              <div className="flex items-center gap-1 group/vol">
                <button
                  onClick={toggleMute}
                  className="p-1 hover:text-red-500 transition-colors cursor-pointer"
                  title="Звук (M)"
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-12 sm:w-16 h-1 bg-white/20 accent-red-600 rounded cursor-pointer hidden group-hover/vol:block sm:block"
                />
              </div>

              {/* Time Display */}
              <div className="text-[10px] sm:text-xs text-gray-300 font-mono ml-1 whitespace-nowrap">
                <span>{formatTime(currentTime)}</span>
                <span className="text-gray-500"> / </span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Translations, Audio Tracks, Subtitles, Quality, Speed, Fullscreen */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* 1. Translations / Voice acting selector */}
              {availableTranslations.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowTranslationMenu(!showTranslationMenu);
                      setShowAudioMenu(false);
                      setShowSubtitleMenu(false);
                      setShowQualityMenu(false);
                      setShowSpeedMenu(false);
                    }}
                    className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-2 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors cursor-pointer"
                    title="Выбор озвучки / перевода"
                  >
                    <Mic className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden md:inline max-w-[90px] truncate">
                      {currentTranslation?.name || 'Озвучка'}
                    </span>
                  </button>

                  {showTranslationMenu && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowTranslationMenu(false)} />
                      <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[160px] max-w-[220px]">
                        <div className="px-3 py-1 text-[10px] uppercase font-bold text-gray-400 border-b border-white/10 mb-1">
                          Варианты озвучки
                        </div>
                        {availableTranslations.map((tr) => (
                          <button
                            key={tr.id}
                            onClick={() => handleSelectTranslation(tr)}
                            className={`px-3 py-1.5 rounded text-xs text-left truncate transition-colors cursor-pointer ${
                              currentTranslation?.id === tr.id
                                ? 'bg-amber-500 text-black font-bold'
                                : 'text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {tr.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 2. In-Manifest Audio Tracks */}
              {audioTracks.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowAudioMenu(!showAudioMenu);
                      setShowTranslationMenu(false);
                      setShowSubtitleMenu(false);
                      setShowQualityMenu(false);
                      setShowSpeedMenu(false);
                    }}
                    className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors cursor-pointer"
                    title="Аудиодорожки в потоке"
                  >
                    <Languages className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden lg:inline">Дорожка</span>
                  </button>

                  {showAudioMenu && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowAudioMenu(false)} />
                      <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[150px] max-w-[200px]">
                        <div className="px-3 py-1 text-[10px] uppercase font-bold text-gray-400 border-b border-white/10 mb-1">
                          Аудиодорожки
                        </div>
                        {audioTracks.map((tr) => (
                          <button
                            key={tr.id}
                            onClick={() => handleSelectAudioTrack(tr.id)}
                            className={`px-3 py-1.5 rounded text-xs text-left truncate transition-colors cursor-pointer ${
                              selectedAudioTrack === tr.id
                                ? 'bg-blue-600 text-white font-bold'
                                : 'text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {tr.name} {tr.lang ? `(${tr.lang})` : ''}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 3. Subtitles */}
              {subtitleTracks.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowSubtitleMenu(!showSubtitleMenu);
                      setShowTranslationMenu(false);
                      setShowAudioMenu(false);
                      setShowQualityMenu(false);
                      setShowSpeedMenu(false);
                    }}
                    className={`flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-2 py-1 rounded transition-colors cursor-pointer ${
                      selectedSubtitleTrack !== 'off'
                        ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30'
                        : 'bg-white/10 hover:bg-white/20 text-gray-300'
                    }`}
                    title="Субтитры"
                  >
                    <Subtitles className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden lg:inline">Субтитры</span>
                  </button>

                  {showSubtitleMenu && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowSubtitleMenu(false)} />
                      <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[140px] max-w-[200px]">
                        <div className="px-3 py-1 text-[10px] uppercase font-bold text-gray-400 border-b border-white/10 mb-1">
                          Субтитры
                        </div>
                        <button
                          onClick={() => handleSelectSubtitleTrack('off')}
                          className={`px-3 py-1.5 rounded text-xs text-left transition-colors cursor-pointer ${
                            selectedSubtitleTrack === 'off'
                              ? 'bg-purple-600 text-white font-bold'
                              : 'text-gray-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          Отключены
                        </button>
                        {subtitleTracks.map((sub) => (
                          <button
                            key={sub.id}
                            onClick={() => handleSelectSubtitleTrack(sub.id)}
                            className={`px-3 py-1.5 rounded text-xs text-left truncate transition-colors cursor-pointer ${
                              selectedSubtitleTrack === sub.id
                                ? 'bg-purple-600 text-white font-bold'
                                : 'text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {sub.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 4. Quality Selector */}
              {qualityLevels.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowQualityMenu(!showQualityMenu);
                      setShowTranslationMenu(false);
                      setShowAudioMenu(false);
                      setShowSubtitleMenu(false);
                      setShowSpeedMenu(false);
                    }}
                    className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors cursor-pointer"
                    title="Качество видео"
                  >
                    <Layers className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {selectedQuality === -1 ? 'Авто' : qualityLevels[selectedQuality]?.label || 'Качество'}
                    </span>
                  </button>

                  {showQualityMenu && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setShowQualityMenu(false)} />
                      <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[120px]">
                        <div className="px-3 py-1 text-[10px] uppercase font-bold text-gray-400 border-b border-white/10 mb-1">
                          Качество
                        </div>
                        <button
                          onClick={() => handleSelectQuality(-1)}
                          className={`px-3 py-1.5 rounded text-xs text-left transition-colors cursor-pointer ${
                            selectedQuality === -1
                              ? 'bg-red-600 text-white font-bold'
                              : 'text-gray-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          Авто
                        </button>
                        {qualityLevels.map((lvl, idx) => (
                          <button
                            key={lvl.id}
                            onClick={() => handleSelectQuality(idx)}
                            className={`px-3 py-1.5 rounded text-xs text-left transition-colors cursor-pointer ${
                              selectedQuality === idx
                                ? 'bg-red-600 text-white font-bold'
                                : 'text-gray-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {lvl.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 5. Speed Selector */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSpeedMenu(!showSpeedMenu);
                    setShowTranslationMenu(false);
                    setShowAudioMenu(false);
                    setShowSubtitleMenu(false);
                    setShowQualityMenu(false);
                  }}
                  className="flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors cursor-pointer"
                  title="Скорость"
                >
                  <Gauge className="w-3.5 h-3.5 shrink-0" />
                  <span>{playbackSpeed}x</span>
                </button>

                {showSpeedMenu && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setShowSpeedMenu(false)} />
                    <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[90px]">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                        <button
                          key={s}
                          onClick={() => handleSpeedSelect(s)}
                          className={`px-3 py-1 rounded text-xs text-left transition-colors cursor-pointer ${
                            playbackSpeed === s
                              ? 'bg-amber-500 text-black font-bold'
                              : 'text-gray-300 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {s}x
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 6. Fullscreen */}
              <button
                onClick={toggleFullscreen}
                className="p-1 sm:p-1.5 hover:text-red-500 transition-colors cursor-pointer"
                title="На весь экран (F)"
              >
                {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

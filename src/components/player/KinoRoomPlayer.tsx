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
  X,
  Settings
} from 'lucide-react';
import {
  PlaybackResponse,
  PlaybackSource,
  PlaybackTranslation,
  PlaybackAudioTrack,
  PlaybackSubtitle,
  PlaybackQuality
} from '@/lib/playback/types';

export interface SubtitleTrackDiagnostic {
  id: string;
  label: string;
  language: string;
  kind: string;
  mode: string;
  readyState: number;
  readyStateLabel: string;
  cuesCount: number;
  activeCuesCount: number;
  activeCueTexts: string[];
}

export interface SubtitleDiagnosticData {
  selectedSubtitleTrack: string;
  isFullscreen: boolean;
  isNativeFullscreen: boolean;
  tracks: SubtitleTrackDiagnostic[];
  recentEvents: string[];
}

interface KinoRoomPlayerProps {
  playbackData: PlaybackResponse;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onTranslationChange?: (translationId: string, currentTime: number) => Promise<PlaybackResponse | void>;
  onRefreshStream?: () => Promise<PlaybackResponse | void>;
  autoPlay?: boolean;
  showSubtitleDiagnostics?: boolean;
  onSubtitleDiagnosticsUpdate?: (diag: SubtitleDiagnosticData) => void;
}

export function KinoRoomPlayer({
  playbackData,
  initialTime = 0,
  onTimeUpdate,
  onTranslationChange,
  onRefreshStream,
  autoPlay = false,
  showSubtitleDiagnostics = false,
  onSubtitleDiagnosticsUpdate
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

  // Synchronized refs to decouple sub-systems from stream initialization lifecycle
  const subtitleTracksRef = useRef<PlaybackSubtitle[]>(subtitleTracks);
  subtitleTracksRef.current = subtitleTracks;

  const selectedSubtitleTrackRef = useRef<string>(selectedSubtitleTrack);
  selectedSubtitleTrackRef.current = selectedSubtitleTrack;

  const autoPlayRef = useRef<boolean>(autoPlay);
  autoPlayRef.current = autoPlay;

  const [qualityLevels, setQualityLevels] = useState<PlaybackQuality[]>(activeStream.qualities || []);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1); // -1 = Auto

  // Dropdown menu toggles (Desktop)
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [showTranslationMenu, setShowTranslationMenu] = useState<boolean>(false);
  const [showAudioMenu, setShowAudioMenu] = useState<boolean>(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState<boolean>(false);
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);

  // Mobile settings drawer toggle
  const [showMobileSettings, setShowMobileSettings] = useState<boolean>(false);

  // Resume prompt state
  const [resumePromptTime, setResumePromptTime] = useState<number | null>(null);

  // Synchronize state when playbackData prop changes
  useEffect(() => {
    setActiveStream(playbackData.stream);
    setCurrentTranslation(playbackData.currentTranslation);
    setAvailableTranslations(playbackData.availableTranslations || []);
    setSubtitleTracks(playbackData.stream.subtitles || []);
    setAudioTracks(playbackData.stream.audioTracks || []);
    setQualityLevels(playbackData.stream.qualities || []);
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

  // Flag to suppress echo loop during programmatic subtitle switching
  const isApplyingSubtitleModeRef = useRef<boolean>(false);
  const recentEventsRef = useRef<string[]>([]);

  // Subtitle Diagnostics State
  const [subtitleDiagnostics, setSubtitleDiagnostics] = useState<SubtitleDiagnosticData>({
    selectedSubtitleTrack: 'off',
    isFullscreen: false,
    isNativeFullscreen: false,
    tracks: [],
    recentEvents: []
  });

  const logSubtitleEvent = useCallback((event: string) => {
    const timeStr = new Date().toLocaleTimeString('ru-RU', { hour12: false });
    const line = `[${timeStr}] ${event}`;
    recentEventsRef.current = [line, ...recentEventsRef.current.slice(0, 19)];
  }, []);

  // Matching helper: 100% reliable across DOM identity, track id, label, and language code
  const isTrackMatchingSubtitle = useCallback(
    (tr: TextTrack, s: PlaybackSubtitle, video: HTMLVideoElement): boolean => {
      // 1. Direct object identity via HTMLTrackElement.track
      const trackEl = video.querySelector<HTMLTrackElement>(`track[id="${s.id}"]`);
      if (trackEl && trackEl.track === tr) return true;

      // 2. Exact or lowercase track ID match
      if (tr.id && (tr.id === s.id || tr.id.toLowerCase() === s.id.toLowerCase())) {
        return true;
      }

      // 3. Label matching (normalized)
      if (tr.label && s.label && tr.label.trim().toLowerCase() === s.label.trim().toLowerCase()) {
        return true;
      }

      // 4. Language code matching (normalized)
      if (tr.language && s.lang) {
        const trLang = tr.language.trim().toLowerCase();
        const sLang = s.lang.trim().toLowerCase();
        if (trLang === sLang || trLang.startsWith(sLang) || sLang.startsWith(trLang)) {
          return true;
        }
      }

      return false;
    },
    []
  );

  // Update diagnostic snapshot for developers and automated tests
  const updateDiagnostics = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const textTracks = video.textTracks;
    const trackList: SubtitleTrackDiagnostic[] = [];

    if (textTracks && textTracks.length > 0) {
      for (let i = 0; i < textTracks.length; i++) {
        const tr = textTracks[i];
        const match = subtitleTracksRef.current.find((s) => isTrackMatchingSubtitle(tr, s, video));
        const trackEl = match ? video.querySelector<HTMLTrackElement>(`track[id="${match.id}"]`) : null;
        const readyState = trackEl ? trackEl.readyState : 0;
        const readyStateLabel =
          readyState === 0
            ? '0: NONE'
            : readyState === 1
            ? '1: LOADING'
            : readyState === 2
            ? '2: LOADED'
            : '3: ERROR';

        const cuesCount = tr.cues ? tr.cues.length : 0;
        const activeCues = tr.activeCues ? Array.from(tr.activeCues) : [];
        const activeCueTexts = activeCues.map((c: any) => c.text || '').filter(Boolean);

        trackList.push({
          id: tr.id || match?.id || `track-${i}`,
          label: tr.label || match?.label || `Track ${i + 1}`,
          language: tr.language || match?.lang || 'unknown',
          kind: tr.kind || 'subtitles',
          mode: tr.mode,
          readyState,
          readyStateLabel,
          cuesCount,
          activeCuesCount: activeCues.length,
          activeCueTexts
        });
      }
    }

    const isNativeFs = Boolean((video as any).webkitDisplayingFullscreen);
    const isDocFs = Boolean(
      document.fullscreenElement || (document as any).webkitFullscreenElement
    );

    const snapshot: SubtitleDiagnosticData = {
      selectedSubtitleTrack: selectedSubtitleTrackRef.current,
      isFullscreen: isDocFs || isNativeFs,
      isNativeFullscreen: isNativeFs,
      tracks: trackList,
      recentEvents: [...recentEventsRef.current]
    };

    setSubtitleDiagnostics(snapshot);

    if (typeof window !== 'undefined') {
      (window as any).__kinoRoomSubtitleDiagnostics = snapshot;
    }

    if (onSubtitleDiagnosticsUpdate) {
      onSubtitleDiagnosticsUpdate(snapshot);
    }
  }, [isTrackMatchingSubtitle, onSubtitleDiagnosticsUpdate]);

  // Robust subtitle track application across Hls.js AND Native Safari WebKit
  // Decoupled from stream lifecycle and memoized without state dependencies
  const applySubtitleTrackMode = useCallback((targetSubId: string) => {
    const video = videoRef.current;
    if (!video) return;

    isApplyingSubtitleModeRef.current = true;
    selectedSubtitleTrackRef.current = targetSubId;

    const currentSubtitles = subtitleTracksRef.current;
    const targetSub = currentSubtitles.find((s) => s.id === targetSubId);

    // 1. HLS.js subtitles (MSE mode)
    if (hlsRef.current) {
      if (targetSubId === 'off') {
        hlsRef.current.subtitleTrack = -1;
      } else {
        // If this is an external VTT track with a URL, let HTML5 TextTrack handle it and disable in-manifest HLS subtitles
        if (targetSub && targetSub.url && targetSub.url.length > 0) {
          hlsRef.current.subtitleTrack = -1;
        } else {
          // In-manifest HLS track
          const numericId = parseInt(targetSubId, 10);
          if (!isNaN(numericId) && numericId >= 0) {
            hlsRef.current.subtitleTrack = numericId;
          } else {
            const hlsSubs = hlsRef.current.subtitleTracks || [];
            const idx = hlsSubs.findIndex(
              (st) => st.name === targetSubId || st.lang === targetSubId
            );
            hlsRef.current.subtitleTrack = idx >= 0 ? idx : -1;
          }
        }
      }
    }

    // 2. HTML5 TextTrack mode (Native Safari HLS + HTML <track> elements)
    if (video.textTracks && video.textTracks.length > 0) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const tr = video.textTracks[i];
        if (targetSubId === 'off' || !targetSub) {
          tr.mode = 'disabled';
        } else {
          // When Hls.js is active and handling in-manifest subtitle track internally,
          // ensure external text tracks don't collide.
          if (hlsRef.current && (!targetSub.url || targetSub.url.length === 0)) {
            tr.mode = 'disabled';
            continue;
          }

          const isMatch = isTrackMatchingSubtitle(tr, targetSub, video);
          tr.mode = isMatch ? 'showing' : 'disabled';
        }
      }
    }

    logSubtitleEvent(`[Apply] Applied mode target="${targetSubId}" (${targetSub?.label || 'OFF'})`);
    updateDiagnostics();

    // Reset flag after microtask queue so immediate browser events from setting tr.mode are ignored
    queueMicrotask(() => {
      isApplyingSubtitleModeRef.current = false;
    });
  }, [isTrackMatchingSubtitle, logSubtitleEvent, updateDiagnostics]);

  // Synchronize state from browser's video.textTracks (e.g. user toggles subtitles in Safari native fullscreen)
  const syncFromMediaTracks = useCallback(() => {
    // If we are currently applying a mode programmatically, skip to prevent race conditions or loops
    if (isApplyingSubtitleModeRef.current) return;

    const video = videoRef.current;
    if (!video || !video.textTracks) return;

    let activeTrackId = 'off';
    const textTracks = video.textTracks;

    for (let i = 0; i < textTracks.length; i++) {
      const tr = textTracks[i];
      if (tr.mode === 'showing') {
        const match = subtitleTracksRef.current.find((s) =>
          isTrackMatchingSubtitle(tr, s, video)
        );
        if (match) {
          activeTrackId = match.id;
          break;
        }
      }
    }

    if (selectedSubtitleTrackRef.current !== activeTrackId) {
      logSubtitleEvent(`[Sync] Safari changed active track: "${selectedSubtitleTrackRef.current}" -> "${activeTrackId}"`);
      selectedSubtitleTrackRef.current = activeTrackId;
      setSelectedSubtitleTrack(activeTrackId);
    }
    updateDiagnostics();
  }, [isTrackMatchingSubtitle, logSubtitleEvent, updateDiagnostics]);

  // Dedicated Subtitle Application Effect (Decoupled from Stream Lifecycle)
  useEffect(() => {
    applySubtitleTrackMode(selectedSubtitleTrack);
  }, [selectedSubtitleTrack, subtitleTracks, applySubtitleTrackMode]);

  // Track synchronization & Safari auto-select suppression
  // Ensures that tracks added asynchronously by the browser respect user selection (default: OFF)
  // and syncs changes made in Safari native fullscreen back into KinoRoomPlayer state
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !video.textTracks) return;

    const textTracks = video.textTracks;

    const handleTrackAdded = (e: TrackEvent) => {
      logSubtitleEvent(`[Event] addtrack: label="${e.track?.label}", lang="${e.track?.language}"`);
      if (selectedSubtitleTrackRef.current === 'off') {
        if (e.track && e.track.mode !== 'disabled') {
          e.track.mode = 'disabled';
        }
      } else {
        applySubtitleTrackMode(selectedSubtitleTrackRef.current);
      }
      updateDiagnostics();
    };

    const handleTrackChange = () => {
      logSubtitleEvent('[Event] textTracks change event');
      syncFromMediaTracks();
    };

    const handleTrackRemoved = () => {
      logSubtitleEvent('[Event] textTracks removetrack event');
      syncFromMediaTracks();
    };

    textTracks.addEventListener('addtrack', handleTrackAdded);
    textTracks.addEventListener('change', handleTrackChange);
    textTracks.addEventListener('removetrack', handleTrackRemoved);

    // Initial check
    if (selectedSubtitleTrackRef.current === 'off') {
      applySubtitleTrackMode('off');
    } else {
      applySubtitleTrackMode(selectedSubtitleTrackRef.current);
    }

    return () => {
      textTracks.removeEventListener('addtrack', handleTrackAdded);
      textTracks.removeEventListener('change', handleTrackChange);
      textTracks.removeEventListener('removetrack', handleTrackRemoved);
    };
  }, [applySubtitleTrackMode, syncFromMediaTracks, updateDiagnostics, logSubtitleEvent, activeStream.url]);

  // Cue change and metadata lifecycle synchronization
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onLoadedMetadata = () => {
      logSubtitleEvent('[Event] video loadedmetadata');
      if (selectedSubtitleTrackRef.current === 'off') {
        applySubtitleTrackMode('off');
      } else {
        applySubtitleTrackMode(selectedSubtitleTrackRef.current);
      }
      updateDiagnostics();
    };

    const onCanPlay = () => {
      updateDiagnostics();
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);

    // Listen to cuechange on all tracks to update activeCue texts in diagnostics
    const attachedTracks: TextTrack[] = [];
    const onCueChange = () => {
      updateDiagnostics();
    };

    if (video.textTracks) {
      for (let i = 0; i < video.textTracks.length; i++) {
        const tr = video.textTracks[i];
        tr.addEventListener('cuechange', onCueChange);
        attachedTracks.push(tr);
      }
    }

    return () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      attachedTracks.forEach((tr) => tr.removeEventListener('cuechange', onCueChange));
    };
  }, [applySubtitleTrackMode, updateDiagnostics, logSubtitleEvent, activeStream.url]);

  // Setup stream (Hls.js or native HTML5 for Safari / MP4)
  // DECOUPLED: depends STRICTLY on activeStream.url and activeStream.type!
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
    let cleanupSafariListener: (() => void) | null = null;

    if (isHlsUrl && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        capLevelToPlayerSize: true
      });
      hlsRef.current = hls;
      hls.subtitleTrack = -1; // Explicitly OFF by default

      if (typeof window !== 'undefined') {
        (window as any).__hlsInstanceCount = ((window as any).__hlsInstanceCount || 0) + 1;
        (window as any).__hlsInstance = hls;
      }

      hls.loadSource(activeStream.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, _data) => {
        setIsBuffering(false);

        if (hls.levels && hls.levels.length > 0) {
          const lvls: PlaybackQuality[] = hls.levels.map((lvl, idx) => ({
            id: String(idx),
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
            height: lvl.height || 0,
            bitrate: lvl.bitrate
          }));
          setQualityLevels(lvls);
        }

        if (pendingSeekTimeRef.current !== null) {
          video.currentTime = pendingSeekTimeRef.current;
          pendingSeekTimeRef.current = null;
        }

        applySubtitleTrackMode(selectedSubtitleTrackRef.current);

        if (autoPlayRef.current) {
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
            isDefault: false
          }));
          setSubtitleTracks((prev) => {
            const combined = [...prev];
            parsedSubs.forEach((ps) => {
              if (!combined.some((c) => c.label === ps.label)) combined.push(ps);
            });
            return combined;
          });
          applySubtitleTrackMode(selectedSubtitleTrackRef.current);
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

      const onCanPlay = () => {
        setIsBuffering(false);
        applySubtitleTrackMode(selectedSubtitleTrackRef.current);
      };
      video.addEventListener('canplay', onCanPlay, { once: true });
      cleanupSafariListener = () => {
        video.removeEventListener('canplay', onCanPlay);
      };

      if (pendingSeekTimeRef.current !== null) {
        video.currentTime = pendingSeekTimeRef.current;
        pendingSeekTimeRef.current = null;
      }

      if (autoPlayRef.current) {
        video.play().catch(() => {});
      }
    }

    return () => {
      if (cleanupSafariListener) {
        cleanupSafariListener();
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeStream.url, activeStream.type, applySubtitleTrackMode]);

  // Video playback listeners
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);

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
    setShowMobileSettings(false);
  };

  // Fullscreen support: Robust selection between Fullscreen API and iPhone Safari webkitEnterFullscreen
  const toggleFullscreen = () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    const isIPhone = typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent);

    // On iPhone, Apple ONLY supports webkitEnterFullscreen on the HTMLVideoElement
    if (isIPhone && typeof (video as any).webkitEnterFullscreen === 'function') {
      if ((video as any).webkitDisplayingFullscreen) {
        if (typeof (video as any).webkitExitFullscreen === 'function') {
          (video as any).webkitExitFullscreen();
        }
      } else {
        try {
          (video as any).webkitEnterFullscreen();
        } catch (err) {
          console.warn('[KinoRoomPlayer] webkitEnterFullscreen error:', err);
        }
      }
      return;
    }

    // Standard Fullscreen API for Desktop, Android, iPad
    const isFs = Boolean(
      document.fullscreenElement || (document as any).webkitFullscreenElement
    );

    if (!isFs) {
      if (container.requestFullscreen) {
        container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {
          if (typeof (video as any).webkitEnterFullscreen === 'function') {
            (video as any).webkitEnterFullscreen();
          }
        });
      } else if (typeof (video as any).webkitEnterFullscreen === 'function') {
        (video as any).webkitEnterFullscreen();
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

  // Fullscreen event listeners including WebKit native iPhone events
  useEffect(() => {
    const video = videoRef.current;

    const onStandardFsChange = () => {
      const isFs = Boolean(
        document.fullscreenElement || (document as any).webkitFullscreenElement
      );
      setIsFullscreen(isFs);
      syncFromMediaTracks();
      updateDiagnostics();
    };

    const onWebkitBegin = () => {
      setIsFullscreen(true);
      logSubtitleEvent('[Fullscreen] webkitbeginfullscreen');
      updateDiagnostics();
    };

    const onWebkitEnd = () => {
      setIsFullscreen(false);
      logSubtitleEvent('[Fullscreen] webkitendfullscreen');
      syncFromMediaTracks();
      updateDiagnostics();
    };

    document.addEventListener('fullscreenchange', onStandardFsChange);
    document.addEventListener('webkitfullscreenchange', onStandardFsChange);

    if (video) {
      video.addEventListener('webkitbeginfullscreen', onWebkitBegin);
      video.addEventListener('webkitendfullscreen', onWebkitEnd);
    }

    return () => {
      document.removeEventListener('fullscreenchange', onStandardFsChange);
      document.removeEventListener('webkitfullscreenchange', onStandardFsChange);
      if (video) {
        video.removeEventListener('webkitbeginfullscreen', onWebkitBegin);
        video.removeEventListener('webkitendfullscreen', onWebkitEnd);
      }
    };
  }, [syncFromMediaTracks, updateDiagnostics, logSubtitleEvent]);

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
        setShowMobileSettings(false);
      }
    }, 4000);
  };

  // Switching Translation
  const handleSelectTranslation = async (translation: PlaybackTranslation) => {
    if (translation.id === currentTranslation?.id) {
      setShowTranslationMenu(false);
      setShowMobileSettings(false);
      return;
    }

    const savedPosition = videoRef.current?.currentTime || currentTime;
    pendingSeekTimeRef.current = savedPosition;
    setCurrentTranslation(translation);
    setShowTranslationMenu(false);
    setShowMobileSettings(false);
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

  // Switching In-Manifest Audio Track
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
    setShowMobileSettings(false);
  };

  // Switching Subtitles
  const handleSelectSubtitleTrack = (subId: string) => {
    selectedSubtitleTrackRef.current = subId;
    setSelectedSubtitleTrack(subId);
    applySubtitleTrackMode(subId);
    setShowSubtitleMenu(false);
    setShowMobileSettings(false);
  };

  // Switching Quality
  const handleSelectQuality = (qualityId: number) => {
    setSelectedQuality(qualityId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = qualityId; // -1 = Auto
    }
    setShowQualityMenu(false);
    setShowMobileSettings(false);
  };

  const activeSub = subtitleTracks.find((s) => s.id === selectedSubtitleTrack);

  return (
    <div className="space-y-3 select-none w-full">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onTouchStart={() => setShowControls(true)}
        className="relative w-full aspect-video bg-black rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-white/10 group flex flex-col justify-between"
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
            const code = err?.code;
            if (code === 4) {
              msg = 'Формат видеопотока не поддерживается данным браузером.';
            } else if (code === 2) {
              msg = 'Сетевая ошибка при загрузке видео. Проверьте соединение.';
            } else if (typeof MediaError !== 'undefined') {
              if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                msg = 'Формат видеопотока не поддерживается данным браузером.';
              } else if (code === MediaError.MEDIA_ERR_NETWORK) {
                msg = 'Сетевая ошибка при загрузке видео. Проверьте соединение.';
              }
            }
            setErrorMessage(msg);
            setIsBuffering(false);
          }}
          onClick={togglePlay}
          className="w-full h-full object-contain cursor-pointer"
        >
          {/* External VTT Subtitles (default is strictly false to prevent auto-enabling in Safari) */}
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
                onLoad={() => {
                  logSubtitleEvent(`[Track Load] "${sub.label}" (${sub.id}) readyState: 2 (LOADED)`);
                  updateDiagnostics();
                }}
                onError={() => {
                  logSubtitleEvent(`[Track Error] "${sub.label}" (${sub.id}) failed to load`);
                  updateDiagnostics();
                }}
              />
            ))}
        </video>

        {/* Floating Resume Notification Banner */}
        {resumePromptTime && (
          <div className="absolute top-12 sm:top-16 left-3 sm:left-6 z-30 max-w-[90%] sm:max-w-sm bg-[#12141f]/95 backdrop-blur-md border border-amber-500/50 rounded-xl p-2.5 sm:p-3 shadow-2xl animate-fade-in flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-xs">
                <span className="text-white font-bold block sm:inline">Продолжить просмотр?</span>{' '}
                <span className="text-gray-300">С {formatTime(resumePromptTime)}</span>
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
          className={`absolute top-0 inset-x-0 p-2.5 sm:p-4 bg-gradient-to-b from-black/85 via-black/40 to-transparent transition-opacity duration-300 z-20 flex items-center justify-between pointer-events-auto ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2 max-w-[75%] min-w-0">
            <span className="px-1.5 py-0.5 rounded bg-red-600/90 text-white font-bold text-[9px] sm:text-[10px] tracking-wider uppercase shrink-0">
              KinoRoom
            </span>
            <span className="text-xs sm:text-sm font-semibold text-white truncate">
              {playbackData.media?.title || 'Воспроизведение'}
            </span>
            {currentTranslation && (
              <span className="hidden md:inline text-[11px] text-gray-300 bg-white/10 px-2 py-0.5 rounded-full border border-white/10 truncate">
                {currentTranslation.name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-300 shrink-0">
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
            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
              <Play className="w-7 h-7 sm:w-10 sm:h-10 fill-current ml-1" />
            </div>
          </button>
        )}

        {/* Buffering Indicator */}
        {isBuffering && !errorMessage && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 pointer-events-none gap-2">
            <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-red-500 animate-spin" />
            <span className="text-xs text-white/90 font-medium">Буферизация...</span>
          </div>
        )}

        {/* Error Notification Overlay */}
        {errorMessage && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 p-4 sm:p-6 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-red-400" />
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

        {/* Mobile Settings Modal Sheet */}
        {showMobileSettings && (
          <div className="absolute inset-0 z-40 bg-black/90 backdrop-blur-md p-4 flex flex-col justify-between overflow-y-auto animate-fade-in sm:hidden">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-red-500" /> Настройки плеера
              </span>
              <button
                onClick={() => setShowMobileSettings(false)}
                className="p-1 text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 py-2 text-xs">
              {/* Subtitles Section */}
              {subtitleTracks.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-gray-400 mb-1.5 flex items-center gap-1.5">
                    <Subtitles className="w-3.5 h-3.5 text-purple-400" /> Субтитры
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => handleSelectSubtitleTrack('off')}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                        selectedSubtitleTrack === 'off'
                          ? 'bg-purple-600 text-white shadow'
                          : 'bg-white/10 text-gray-300'
                      }`}
                    >
                      Отключены
                    </button>
                    {subtitleTracks.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => handleSelectSubtitleTrack(sub.id)}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                          selectedSubtitleTrack === sub.id
                            ? 'bg-purple-600 text-white shadow'
                            : 'bg-white/10 text-gray-300'
                        }`}
                      >
                        {sub.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quality Section */}
              {qualityLevels.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold text-gray-400 mb-1.5 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-400" /> Качество видео
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => handleSelectQuality(-1)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                        selectedQuality === -1
                          ? 'bg-red-600 text-white shadow'
                          : 'bg-white/10 text-gray-300'
                      }`}
                    >
                      Авто
                    </button>
                    {qualityLevels.map((lvl, idx) => (
                      <button
                        key={lvl.id}
                        onClick={() => handleSelectQuality(idx)}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                          selectedQuality === idx
                            ? 'bg-red-600 text-white shadow'
                            : 'bg-white/10 text-gray-300'
                        }`}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Speed Section */}
              <div>
                <div className="text-[11px] font-bold text-gray-400 mb-1.5 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" /> Скорость воспроизведения
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedSelect(s)}
                      className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                        playbackSpeed === s
                          ? 'bg-amber-500 text-black font-bold shadow'
                          : 'bg-white/10 text-gray-300'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio tracks Section */}
              {audioTracks.length > 1 && (
                <div>
                  <div className="text-[11px] font-bold text-gray-400 mb-1.5 flex items-center gap-1.5">
                    <Languages className="w-3.5 h-3.5 text-emerald-400" /> Аудиодорожка
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {audioTracks.map((tr) => (
                      <button
                        key={tr.id}
                        onClick={() => handleSelectAudioTrack(tr.id)}
                        className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                          selectedAudioTrack === tr.id
                            ? 'bg-emerald-600 text-white shadow'
                            : 'bg-white/10 text-gray-300'
                        }`}
                      >
                        {tr.name} {tr.lang ? `(${tr.lang})` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowMobileSettings(false)}
              className="w-full py-2.5 bg-white/10 text-white rounded-xl text-xs font-bold transition-colors text-center cursor-pointer mt-2"
            >
              Закрыть
            </button>
          </div>
        )}

        {/* Bottom Control Bar */}
        <div
          className={`absolute bottom-0 inset-x-0 p-2 sm:p-4 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 z-20 space-y-1.5 pointer-events-auto ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Progress / Seek Slider */}
          <div className="relative group/bar flex items-center">
            <div
              className="absolute h-1 sm:h-1.5 bg-white/20 rounded-full pointer-events-none transition-all"
              style={{
                width: `${duration > 0 ? (bufferedEnd / duration) * 100 : 0}%`
              }}
            />
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
              className="w-full h-2 sm:h-1.5 bg-transparent appearance-none cursor-pointer focus:outline-none relative z-10 accent-red-600 transition-all"
            />
          </div>

          {/* Control Buttons (Fully Responsive & Overflow-Safe) */}
          <div className="flex items-center justify-between text-white text-xs gap-1 w-full min-w-0">
            {/* Left Controls: Play, Rewind, Time */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                onClick={togglePlay}
                className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center hover:text-red-500 transition-colors cursor-pointer"
                title={isPlaying ? 'Пауза (Space)' : 'Воспроизведение (Space)'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <button
                onClick={() => seekRelative(-10)}
                className="hidden sm:flex w-9 h-9 min-w-[36px] min-h-[36px] items-center justify-center hover:text-red-500 transition-colors cursor-pointer"
                title="Назад 10 секунд (←)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                onClick={() => seekRelative(10)}
                className="hidden sm:flex w-9 h-9 min-w-[36px] min-h-[36px] items-center justify-center hover:text-red-500 transition-colors cursor-pointer"
                title="Вперед 10 секунд (→)"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Volume (hidden on mobile screens, hardware keys used; visible on sm and up) */}
              <div className="hidden sm:flex items-center gap-1 group/vol">
                <button
                  onClick={toggleMute}
                  className="w-9 h-9 min-w-[36px] min-h-[36px] flex items-center justify-center hover:text-red-500 transition-colors cursor-pointer"
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
                  className="w-12 sm:w-16 h-1 bg-white/20 accent-red-600 rounded cursor-pointer hidden sm:block"
                />
              </div>

              {/* Time Display */}
              <div className="text-[10px] sm:text-xs text-gray-300 font-mono ml-0.5 sm:ml-1 whitespace-nowrap">
                <span>{formatTime(currentTime)}</span>
                <span className="text-gray-500"> / </span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls: Desktop Dropdowns + Mobile Compact Controls */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* --- DESKTOP TOOLBAR (Hidden on mobile) --- */}
              <div className="hidden sm:flex items-center gap-1 sm:gap-1.5">
                {/* 1. Translations */}
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
                      className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-2 py-1.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors cursor-pointer"
                      title="Выбор перевода"
                    >
                      <Mic className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden lg:inline max-w-[80px] truncate">
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

                {/* 2. Audio Tracks */}
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
                      className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-2 py-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors cursor-pointer"
                      title="Аудиодорожки"
                    >
                      <Languages className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden lg:inline">Дорожка</span>
                    </button>

                    {showAudioMenu && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setShowAudioMenu(false)} />
                        <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[150px]">
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

                {/* 3. Subtitles (Desktop) */}
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
                      className={`flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-2 py-1.5 rounded transition-colors cursor-pointer ${
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
                        <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[140px]">
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

                {/* 4. Quality (Desktop) */}
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
                      className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-2 py-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors cursor-pointer"
                      title="Качество"
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

                {/* 5. Speed (Desktop) */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowSpeedMenu(!showSpeedMenu);
                      setShowTranslationMenu(false);
                      setShowAudioMenu(false);
                      setShowSubtitleMenu(false);
                      setShowQualityMenu(false);
                    }}
                    className="flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2 py-1.5 rounded bg-white/10 hover:bg-white/20 text-gray-300 transition-colors cursor-pointer"
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
              </div>

              {/* --- MOBILE COMPACT BUTTONS (Shown on mobile only) --- */}
              <div className="flex sm:hidden items-center gap-1">
                {/* Mobile Settings Gear Button */}
                <button
                  onClick={() => setShowMobileSettings(true)}
                  className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center text-gray-300 hover:text-white transition-colors cursor-pointer"
                  title="Настройки"
                >
                  <Settings className="w-5 h-5" />
                </button>
              </div>

              {/* 6. Fullscreen Button (Always pinned and accessible, min 40x40px touch zone) */}
              <button
                onClick={toggleFullscreen}
                className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center hover:text-red-500 transition-colors cursor-pointer shrink-0"
                title="На весь экран"
              >
                {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dev Diagnostic Panel: strictly gated to showSubtitleDiagnostics prop */}
      {showSubtitleDiagnostics && (
        <div
          data-testid="subtitle-diagnostic-panel"
          className="p-3 bg-[#0d0e15] border border-purple-500/30 rounded-xl text-xs font-mono space-y-2 text-gray-300"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
            <span className="font-bold text-purple-400">Диагностика субтитров Safari & WebVTT (Dev)</span>
            <span className="text-[10px] text-gray-400">
              KinoRoom: <strong className="text-white">{subtitleDiagnostics.selectedSubtitleTrack}</strong> |{' '}
              Fullscreen: <strong className={subtitleDiagnostics.isFullscreen ? 'text-emerald-400' : 'text-gray-400'}>
                {subtitleDiagnostics.isNativeFullscreen ? 'iOS Native' : subtitleDiagnostics.isFullscreen ? 'Doc FS' : 'Inline'}
              </strong>
            </span>
          </div>

          {/* Tracks table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="text-gray-500 border-b border-white/5">
                  <th className="py-1 pr-2">ID</th>
                  <th className="py-1 pr-2">Label</th>
                  <th className="py-1 pr-2">Lang</th>
                  <th className="py-1 pr-2">Mode</th>
                  <th className="py-1 pr-2">ReadyState</th>
                  <th className="py-1 pr-2">Cues</th>
                  <th className="py-1">Active Cue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {subtitleDiagnostics.tracks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-2 text-gray-500 italic">
                      video.textTracks пуст или не инициализирован
                    </td>
                  </tr>
                ) : (
                  subtitleDiagnostics.tracks.map((t) => (
                    <tr key={t.id} className={t.mode === 'showing' ? 'text-emerald-300 font-semibold' : 'text-gray-400'}>
                      <td className="py-1 pr-2">{t.id}</td>
                      <td className="py-1 pr-2">{t.label}</td>
                      <td className="py-1 pr-2">{t.language}</td>
                      <td className="py-1 pr-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${t.mode === 'showing' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-gray-400'}`}>
                          {t.mode}
                        </span>
                      </td>
                      <td className="py-1 pr-2">{t.readyStateLabel}</td>
                      <td className="py-1 pr-2">{t.cuesCount}</td>
                      <td className="py-1 truncate max-w-[150px] text-emerald-400">
                        {t.activeCueTexts.join(' / ') || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Recent Events Log */}
          {subtitleDiagnostics.recentEvents.length > 0 && (
            <div className="pt-1 border-t border-white/5">
              <div className="text-[10px] text-gray-400 mb-1">События синхронизации (последние):</div>
              <div className="max-h-20 overflow-y-auto space-y-0.5 text-[10px] text-gray-400">
                {subtitleDiagnostics.recentEvents.map((ev, idx) => (
                  <div key={idx} className="leading-tight">{ev}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

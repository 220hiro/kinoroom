'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Radio,
  FileVideo,
  Download,
  Users,
  Loader2,
  Gauge,
  ExternalLink,
  Settings,
  Check,
  X,
  Sparkles,
  Languages,
  Subtitles,
  Layers
} from 'lucide-react';
import { TorrentStatus, TorrentSearchResult } from '@/lib/types';
import { formatBytes } from '@/lib/utils';
import { getSettings, saveSettings, AppSettings } from '@/lib/storage';
import { isDeclaredMp4Release, playbackStartErrorMessage } from '@/lib/playback/torrentCompatibility';
import { attachPilotVideoDiagnostics } from '@/lib/playback/pilotVideoDiagnostics';
import { availableMediaDuration, buildPilotSeekStreamSrc, computeTruePlaybackTime } from '@/lib/playback/progressiveHls';

interface TorrentPlayerProps {
  magnet: string;
  initialFileIndex?: number;
  initialTime?: number;
  season?: number;
  episode?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onSwitchToOnline?: () => void;
  availableTorrents?: TorrentSearchResult[];
  onSelectTorrent?: (magnet: string) => void;
  /** Only the explicitly enabled local /torrent-pilot page supplies this. */
  hlsPilot?: boolean;
  hlsPilotProgressive?: boolean;
  expectedDuration?: number;
}

function extractInfoHash(magnet: string): string | null {
  const match = /urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i.exec(magnet);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Builds stream URL for TorrServer.
 * Uses clean public URLs without embedding credentials into URL parameters.
 * Supports GStreamer HLS master playlist for iOS Safari.
 */
function buildTorrServerStreamUrl({
  baseUrl,
  magnet,
  fileIndex,
  infoHash,
  preferHls
}: {
  baseUrl?: string | null;
  magnet: string;
  fileIndex: number;
  infoHash?: string | null;
  preferHls?: boolean;
}): string {
  const clean = (baseUrl || '').replace(/\/$/, '');
  const prefix = clean ? clean : '';
  // TorrServer -gst build provides /gst/{hash}/master.m3u8?index={index}
  if (preferHls && infoHash) {
    return `${prefix}/gst/${infoHash}/master.m3u8?index=${fileIndex}`;
  }
  return `${prefix}/stream?link=${encodeURIComponent(magnet)}&index=${fileIndex}&play`;
}

export function TorrentPlayer({
  magnet,
  initialFileIndex,
  initialTime,
  season,
  episode,
  onTimeUpdate,
  onSwitchToOnline,
  availableTorrents,
  onSelectTorrent,
  hlsPilot = false,
  hlsPilotProgressive = false,
  expectedDuration
}: TorrentPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<TorrentStatus | null>(null);
  const infoHashRef = useRef<string | null>(null);
  const [useHlsFallback, setUseHlsFallback] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(initialFileIndex ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekAnchor, setSeekAnchor] = useState<number>(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  // Playback speed
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Audio tracks, subtitles, quality selection
  const hlsRef = useRef<Hls | null>(null);
  const [audioTracks, setAudioTracks] = useState<{ id: number; name: string; lang?: string }[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(-1);
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  const [subtitleTracks, setSubtitleTracks] = useState<{ id: number; name: string; lang?: string }[]>([]);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<number>(-1);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);

  const [qualityLevels, setQualityLevels] = useState<{ id: number; label: string; height: number }[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<number>(-1);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  // External player menu
  const [showExternalMenu, setShowExternalMenu] = useState(false);

  // Settings / TorrServer modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const [serverConfig, setServerConfig] = useState<{ configured: boolean; publicUrl: string | null } | null>(null);
  const [torrServerInput, setTorrServerInput] = useState('');
  const [useTorrServerToggle, setUseTorrServerToggle] = useState(false);
  const [videoPlaybackError, setVideoPlaybackError] = useState<string | null>(null);

  // Resume prompt state
  const [resumePromptTime, setResumePromptTime] = useState<number | null>(null);
  const hasAppliedInitialTimeRef = useRef(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial settings & query server-side central TorrServer configuration
  useEffect(() => {
    if (hlsPilot) return;
    // 1. Fetch server-configured TorrServer (single source of truth for all visitors)
    fetch('/api/torrent/torrserver')
      .then((res) => res.json())
      .then((data) => {
        if (data?.configured && data?.publicUrl) {
          setServerConfig(data);
        }
      })
      .catch(() => {});

    // 2. Load user's local override settings
    const s = getSettings();
    setSettings(s);
    setTorrServerInput(s.torrServerUrl);
    setUseTorrServerToggle(s.useTorrServer);
  }, [hlsPilot]);

  // Central server configuration takes precedence so new visitors/friends have TorrServer active out of the box!
  const isTorrServerActive = !hlsPilot && Boolean(serverConfig?.configured || settings.useTorrServer);
  const effectiveTorrServerUrl = serverConfig?.publicUrl || (settings.useTorrServer ? settings.torrServerUrl : '');

  const mp4Alternative = availableTorrents?.find(
    (t) => isDeclaredMp4Release(t.title) && t.magnet !== magnet
  );

  // Reset state when magnet or active server changes
  useEffect(() => {
    setStatus(null);
    infoHashRef.current = null;
    setUseHlsFallback(false);
    setIsLoadingMetadata(true);
    setHasStartedPlaying(false);
    setBackendError(null);
    setVideoPlaybackError(null);
    setElapsedSeconds(0);
    setSeekAnchor(0);
  }, [magnet, isTorrServerActive, effectiveTorrServerUrl]);

  // Track elapsed seconds while waiting for metadata
  useEffect(() => {
    if (!isLoadingMetadata || hasStartedPlaying) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLoadingMetadata, hasStartedPlaying]);

  // Poll torrent status via appropriate backend (TorrServer or WebTorrent)
  useEffect(() => {
    let isMounted = true;
    let pollTimer: NodeJS.Timeout | null = null;
    let isFetching = false;

    async function checkStatus() {
      if (!isMounted || isFetching) return;
      isFetching = true;

      try {
        let res: Response;
        if (hlsPilot) {
          res = await fetch('/api/torrent/hls-pilot/status');
        } else if (isTorrServerActive && effectiveTorrServerUrl) {
          res = await fetch('/api/torrent/torrserver', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              torrServerUrl: effectiveTorrServerUrl,
              magnet,
              hash: infoHashRef.current || undefined
            })
          });
        } else {
          res = await fetch(`/api/torrent/info?torrent=${encodeURIComponent(magnet)}`);
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          if (isMounted && (hlsPilot || isTorrServerActive)) {
            setBackendError(hlsPilot ? 'Локальный тестовый процесс недоступен.' : `TorrServer (${effectiveTorrServerUrl}): ${errData.error || res.statusText}`);
          }
          return;
        }

        const data: TorrentStatus = await res.json();
        if (isMounted) {
          if (data.infoHash) {
            infoHashRef.current = data.infoHash;
          }
          setBackendError(null);
          setStatus(data);
          if (data.ready && data.files.length > 0) {
            setIsLoadingMetadata(false);
            // Auto-select episode/file
            if (initialFileIndex === undefined) {
              const videoFiles = data.files.filter((f) => f.isVideo);
              if (videoFiles.length > 0) {
                let matchedFile: any = null;
                if (season && episode) {
                  const sStr = season.toString().padStart(2, '0');
                  const eStr = episode.toString().padStart(2, '0');
                  matchedFile = videoFiles.find((f) => {
                    const n = f.name.toLowerCase();
                    return (
                      n.includes(`s${sStr}e${eStr}`) ||
                      n.includes(`s${season}e${episode}`) ||
                      n.includes(`s${sStr}.e${eStr}`) ||
                      n.includes(`[${sStr}x${eStr}]`) ||
                      n.includes(`_${eStr}.`) ||
                      n.includes(`e${eStr}`)
                    );
                  });
                }
                const chosen = matchedFile || videoFiles[0];
                setSelectedFileIndex(chosen.index);
              }
            }
          }
        }
      } catch (err: any) {
        if (isMounted && (hlsPilot || isTorrServerActive)) {
          setBackendError(hlsPilot ? 'Локальный тестовый процесс недоступен.' : `Не удалось связаться с TorrServer (${effectiveTorrServerUrl})`);
        }
        console.error('Status poll error:', err);
      } finally {
        isFetching = false;
        if (isMounted) {
          pollTimer = setTimeout(checkStatus, 2500);
        }
      }
    }

    checkStatus();

    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [
    magnet,
    hlsPilot,
    initialFileIndex,
    isIOS,
    season,
    episode,
    isTorrServerActive,
    effectiveTorrServerUrl
  ]);

  // Update selected file if season or episode changes
  useEffect(() => {
    if (!status?.ready || !status?.files?.length || !season || !episode) return;
    const videoFiles = status.files.filter((f) => f.isVideo);
    const sStr = season.toString().padStart(2, '0');
    const eStr = episode.toString().padStart(2, '0');
    const matchedFile = videoFiles.find((f) => {
      const n = f.name.toLowerCase();
      return (
        n.includes(`s${sStr}e${eStr}`) ||
        n.includes(`s${season}e${episode}`) ||
        n.includes(`s${sStr}.e${eStr}`) ||
        n.includes(`[${sStr}x${eStr}]`) ||
        n.includes(`_${eStr}.`) ||
        n.includes(`e${eStr}`)
      );
    });
    if (matchedFile && matchedFile.index !== selectedFileIndex) {
      setSelectedFileIndex(matchedFile.index);
    }
  }, [season, episode, status]);

  // Check initial resume time
  useEffect(() => {
    if (initialTime && initialTime > 15 && !hasAppliedInitialTimeRef.current) {
      setResumePromptTime(initialTime);
      const timer = setTimeout(() => setResumePromptTime(null), 12000);
      return () => clearTimeout(timer);
    }
  }, [initialTime]);

  const handleApplyResume = () => {
    if (videoRef.current && resumePromptTime) {
      videoRef.current.currentTime = resumePromptTime;
      setCurrentTime(resumePromptTime);
      hasAppliedInitialTimeRef.current = true;
      setResumePromptTime(null);
      void requestPlayback();
    }
  };

  const handleDismissResume = () => {
    hasAppliedInitialTimeRef.current = true;
    setResumePromptTime(null);
  };

  // Progressive HLS and timeline duration logic
  const effectiveInfoHash = status?.infoHash || infoHashRef.current || extractInfoHash(magnet) || 'stream';
  const hlsSessionId = `${effectiveInfoHash}_${selectedFileIndex}`;

  const isNonMp4 = status?.files?.find((f) => f.index === selectedFileIndex)?.name
    ? !/\.mp4$/i.test(status.files.find((f) => f.index === selectedFileIndex)!.name)
    : true; // Default true before status loads so iOS/non-Chromium browsers never attempt raw MKV
  const isHlsMode = (isIOS || isNonMp4) && !useHlsFallback && Boolean(effectiveInfoHash && effectiveInfoHash !== 'stream');
  const isProgressiveHls = hlsPilotProgressive || (isHlsMode && !isTorrServerActive);
  const mediaTotalDuration = Number((status as any)?.pilotSource?.durationSeconds) || expectedDuration || 5400;

  const streamSrc = hlsPilot
    ? (hlsPilotProgressive ? buildPilotSeekStreamSrc(seekAnchor) : '/api/torrent/hls-pilot/hls/master.m3u8')
    : isTorrServerActive && effectiveTorrServerUrl
    ? buildTorrServerStreamUrl({
        baseUrl: effectiveTorrServerUrl,
        magnet,
        fileIndex: selectedFileIndex,
        infoHash: status?.infoHash || infoHashRef.current,
        preferHls: isIOS && !useHlsFallback
      })
    : isHlsMode
    ? `/api/torrent/hls/${hlsSessionId}/${seekAnchor > 0 ? `s${seekAnchor}/` : ''}master.m3u8?torrent=${encodeURIComponent(magnet)}&file=${selectedFileIndex}`
    : `/api/torrent/stream?torrent=${encodeURIComponent(magnet)}&file=${selectedFileIndex}`;

  const effectiveDuration = isProgressiveHls && mediaTotalDuration > 0
    ? mediaTotalDuration
    : duration;
  const effectiveCurrentTime = isProgressiveHls
    ? computeTruePlaybackTime(currentTime, seekAnchor)
    : currentTime;

  const currentMediaDuration = () => {
    const video = videoRef.current;
    if (!video) return 0;
    if (!isProgressiveHls) return video.duration || 0;
    return mediaTotalDuration;
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);
    if (!isProgressiveHls) {
      const dur = videoRef.current.duration || 0;
      setDuration(dur);
      if (onTimeUpdate) onTimeUpdate(cur, dur);
    } else {
      setDuration(mediaTotalDuration);
      if (onTimeUpdate) onTimeUpdate(computeTruePlaybackTime(cur, seekAnchor), mediaTotalDuration);
    }
  };

  const requestPlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    setHasStartedPlaying(true);
    const targetSrc = streamSrc;
    if (targetSrc && video.getAttribute('src') !== targetSrc) {
      video.src = targetSrc;
      video.load();
    }
    const source = video.src;
    setVideoPlaybackError(null);
    setIsLoadingMetadata(true);
    try {
      await video.play();
    } catch (error) {
      // A replaced/unmounted source must not receive a stale error from its predecessor.
      if (videoRef.current !== video || video.src !== source) return;
      setIsPlaying(false);
      setIsLoadingMetadata(false);
      setVideoPlaybackError(playbackStartErrorMessage(error));
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      // onPlay/onPlaying report actual media state; clicking alone is not playback.
      void requestPlayback();
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const performSeek = (targetTrue: number) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(effectiveDuration, targetTrue));
    if (isProgressiveHls) {
      const offsetInSession = clamped - seekAnchor;
      const bufferedEnd = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
      // Seek within current session if target is buffered and non-negative
      if (offsetInSession >= 0 && offsetInSession <= Math.max(bufferedEnd, 4)) {
        video.currentTime = offsetInSession;
        setCurrentTime(offsetInSession);
      } else {
        // Cold seek: change session anchor to trigger new stream
        const newAnchor = Math.floor(clamped);
        setSeekAnchor(newAnchor);
        setCurrentTime(0);
        setIsLoadingMetadata(true);
      }
    } else {
      video.currentTime = clamped;
      setCurrentTime(clamped);
    }
  };

  const seekRelative = (seconds: number) => {
    if (!videoRef.current) return;
    const currentTrue = isProgressiveHls
      ? computeTruePlaybackTime(videoRef.current.currentTime, seekAnchor)
      : videoRef.current.currentTime;
    performSeek(currentTrue + seconds);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    performSeek(val);
    if (videoRef.current && (isPlaying || hasStartedPlaying)) {
      void videoRef.current.play().catch(() => {});
    }
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
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    const container = containerRef.current;
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
          console.warn('[TorrentPlayer] webkitEnterFullscreen error:', err);
        }
      }
      return;
    }

    const isFs = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);

    if (!isFs) {
      if (container.requestFullscreen) {
        container.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {
          if (typeof (video as any).webkitEnterFullscreen === 'function') {
            (video as any).webkitEnterFullscreen();
            setIsFullscreen(true);
          }
        });
      } else if (typeof (video as any).webkitEnterFullscreen === 'function') {
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
    const video = videoRef.current;

    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };

    const onWebkitBegin = () => {
      setIsFullscreen(true);
    };

    const onWebkitEnd = () => {
      setIsFullscreen(false);
    };

    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);

    if (video) {
      video.addEventListener('webkitbeginfullscreen', onWebkitBegin);
      video.addEventListener('webkitendfullscreen', onWebkitEnd);
    }

    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      if (video) {
        video.removeEventListener('webkitbeginfullscreen', onWebkitBegin);
        video.removeEventListener('webkitendfullscreen', onWebkitEnd);
      }
    };
  }, []);


  const handleSpeedSelect = (rate: number) => {
    setPlaybackSpeed(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSpeedMenu(false);
  };

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
            const nextVol = Math.min(1, Math.round((volume + 0.1) * 10) / 10);
            setVolume(nextVol);
            videoRef.current.volume = nextVol;
            videoRef.current.muted = false;
            setIsMuted(false);
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (videoRef.current) {
            const nextVol = Math.max(0, Math.round((volume - 0.1) * 10) / 10);
            setVolume(nextVol);
            videoRef.current.volume = nextVol;
            if (nextVol === 0) setIsMuted(true);
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

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
        setShowSpeedMenu(false);
        setShowExternalMenu(false);
        setShowAudioMenu(false);
        setShowSubtitleMenu(false);
        setShowQualityMenu(false);
      }
    }, 3500);
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (hlsPilot && videoRef.current) return attachPilotVideoDiagnostics(videoRef.current);
  }, [hlsPilot]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamSrc) return;

    // Reset tracks & selection
    setAudioTracks([]);
    setSubtitleTracks([]);
    setQualityLevels([]);
    setSelectedAudioTrack(-1);
    setSelectedSubtitleTrack(-1);
    setSelectedQuality(-1);

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHlsStream = streamSrc.includes('.m3u8') || streamSrc.includes('/gst/');

    // For real torrents, only attach and load stream if user requested playback, is playing, or in pilot mode
    const shouldLoadMedia = hlsPilot || hasStartedPlaying || isPlaying;
    if (!shouldLoadMedia) return;

    if (isHlsStream && isIOS && video.canPlayType('application/vnd.apple.mpegurl')) {
      if (video.getAttribute('src') !== streamSrc) {
        video.src = streamSrc;
        video.load();
      }
      if (isPlaying || hasStartedPlaying) {
        void video.play().catch(() => {});
      }
    } else if (isHlsStream && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        ...(isProgressiveHls ? { startPosition: 0, liveDurationInfinity: false, maxLiveSyncPlaybackRate: 1 } : {}),
      });
      hlsRef.current = hls;

      hls.loadSource(streamSrc);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isPlaying || hasStartedPlaying) {
          void video.play().catch(() => {});
        }
        if (hls.levels && hls.levels.length > 0) {
          const lvls = hls.levels.map((lvl, idx) => ({
            id: idx,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
            height: lvl.height || 0,
          }));
          setQualityLevels(lvls);
        }
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
        if (hls.audioTracks && hls.audioTracks.length > 0) {
          const tracks = hls.audioTracks.map((t, idx) => ({
            id: idx,
            name: t.name || `Дорожка ${idx + 1}`,
            lang: t.lang,
          }));
          setAudioTracks(tracks);
          setSelectedAudioTrack(hls.audioTrack);
        }
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => {
        if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
          const subs = hls.subtitleTracks.map((s, idx) => ({
            id: idx,
            name: s.name || `Субтитры ${idx + 1}`,
            lang: s.lang,
          }));
          setSubtitleTracks(subs);
          setSelectedSubtitleTrack(hls.subtitleTrack);
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });
    } else {
      // Direct stream or Safari native HLS
      video.src = streamSrc;
      video.load();
    }

    const syncNativeTracks = () => {
      const anyVideo = video as any;
      if (anyVideo.audioTracks && anyVideo.audioTracks.length > 0) {
        const natAudio = [];
        for (let i = 0; i < anyVideo.audioTracks.length; i++) {
          const tr = anyVideo.audioTracks[i];
          natAudio.push({
            id: i,
            name: tr.label || tr.language || `Дорожка ${i + 1}`,
            lang: tr.language || undefined,
          });
          if (tr.enabled) {
            setSelectedAudioTrack(i);
          }
        }
        setAudioTracks(natAudio);
      }

      if (video.textTracks && video.textTracks.length > 0) {
        const natSubs = [];
        for (let i = 0; i < video.textTracks.length; i++) {
          const tr = video.textTracks[i];
          if (tr.kind === 'subtitles' || tr.kind === 'captions') {
            natSubs.push({
              id: i,
              name: tr.label || tr.language || `Субтитры ${i + 1}`,
              lang: tr.language || undefined,
            });
            if (tr.mode === 'showing') {
              setSelectedSubtitleTrack(i);
            }
          }
        }
        if (natSubs.length > 0) {
          setSubtitleTracks(natSubs);
        }
      }
    };

    video.addEventListener('loadedmetadata', syncNativeTracks);

    return () => {
      video.removeEventListener('loadedmetadata', syncNativeTracks);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamSrc, hasStartedPlaying]);

  const handleSelectAudioTrack = (trackId: number) => {
    setSelectedAudioTrack(trackId);
    if (hlsRef.current) {
      hlsRef.current.audioTrack = trackId;
    } else if (videoRef.current && (videoRef.current as any).audioTracks) {
      const tracks = (videoRef.current as any).audioTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = i === trackId;
      }
    }
    setShowAudioMenu(false);
  };

  const handleSelectSubtitleTrack = (trackId: number) => {
    setSelectedSubtitleTrack(trackId);
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = trackId;
    } else if (videoRef.current && videoRef.current.textTracks) {
      const tracks = videoRef.current.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = i === trackId ? 'showing' : 'disabled';
      }
    }
    setShowSubtitleMenu(false);
  };

  const handleSelectQuality = (qualityId: number) => {
    setSelectedQuality(qualityId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = qualityId;
    }
    setShowQualityMenu(false);
  };

  const getFullStreamUrl = () => {
    if (typeof window === 'undefined') return streamSrc;
    if (streamSrc.startsWith('http')) return streamSrc;
    return `${window.location.origin}${streamSrc}`;
  };

  const handleDownloadM3u = () => {
    const fullUrl = getFullStreamUrl();
    const content = `#EXTM3U\n#EXTINF:-1,КиноРум Стрим (1080p/4K)\n${fullUrl}\n`;
    const blob = new Blob([content], { type: 'application/x-mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kinoroom-stream.m3u`;
    a.click();
    URL.revokeObjectURL(url);
    setShowExternalMenu(false);
  };

  const handleSaveSettings = () => {
    saveSettings({
      torrServerUrl: torrServerInput.trim() || 'http://127.0.0.1:8090',
      useTorrServer: useTorrServerToggle
    });
    setSettings(getSettings());
    setShowSettingsModal(false);
  };

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        className="relative w-full min-h-[300px] sm:min-h-0 sm:aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group select-none flex flex-col justify-between"
      >
      {/* Native Video Element */}
      <video
        ref={videoRef}
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onProgress={() => { if (isProgressiveHls) setDuration(mediaTotalDuration); }}
        onDurationChange={() => { if (isProgressiveHls) setDuration(mediaTotalDuration); }}
        onPlay={() => {
          setIsPlaying(true);
          setVideoPlaybackError(null);
        }}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsLoadingMetadata(true)}
        onPlaying={() => {
          setIsLoadingMetadata(false);
          setHasStartedPlaying(true);
          setVideoPlaybackError(null);
        }}
        onError={() => {
          const err = videoRef.current?.error;
          // If iOS tried HLS first and failed (e.g. TorrServer instance without GStreamer), auto-fallback to direct HTTP stream
          if (isIOS && !useHlsFallback && isTorrServerActive) {
            setUseHlsFallback(true);
            return;
          }

          let msg = 'Не удалось загрузить видеопоток.';
          if (err?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
            msg = isIOS
              ? 'Формат или аудиокодек не поддерживается Safari нативно в HTML5. Рекомендуется раздача с пометкой MP4 или запуск через Outplayer/VLC.'
              : 'Формат видео или аудиокодек не поддерживается данным браузером.';
          } else if (err?.code === MediaError.MEDIA_ERR_NETWORK) {
            msg = 'Сетевая ошибка при передаче видеопотока. Проверьте соединение с сервером.';
          } else if (err?.code === MediaError.MEDIA_ERR_DECODE) {
            msg = 'Ошибка декодирования видео.';
          }
          setVideoPlaybackError(msg);
          setIsLoadingMetadata(false);
        }}
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
        preload="auto"
      />

      {/* Floating Resume Notification Banner */}
      {resumePromptTime && (
        <div className="absolute top-16 left-4 sm:left-6 z-20 max-w-sm bg-[#12141f]/95 backdrop-blur-md border border-amber-500/50 rounded-xl p-3 shadow-2xl animate-fade-in flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="text-xs">
              <span className="text-white font-bold">Продолжить просмотр?</span>
              <p className="text-gray-300">С таймкода {formatTime(resumePromptTime)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
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
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Stream Status & Controls Bar */}
      <div
        className={`absolute top-0 left-0 right-0 p-2.5 sm:p-4 bg-gradient-to-b from-black/85 via-black/50 to-transparent flex items-center justify-between text-xs text-gray-300 transition-opacity duration-300 z-10 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-1.5 sm:gap-3 flex-wrap">
          <span className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-red-600/30 text-red-400 font-semibold border border-red-500/30 backdrop-blur-md text-[11px] sm:text-xs">
            <Radio className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-pulse text-red-500" />
            <span>
              {hlsPilot
                ? 'Торрент → HLS'
                : isTorrServerActive
                ? isHlsMode
                  ? 'TorrServer HLS'
                  : 'TorrServer'
                : isHlsMode
                ? 'Торрент → HLS'
                : 'WebTorrent Direct'}
            </span>
          </span>

          {status && (
            <span className="hidden sm:flex items-center gap-1.5 text-gray-300">
              <Users className="w-3.5 h-3.5 text-blue-400" />
              <span>{status.numPeers} пиров</span>
            </span>
          )}

          {status && status.downloadSpeed > 0 && (
            <span className="hidden sm:flex items-center gap-1.5 text-emerald-400 font-medium">
              <Download className="w-3.5 h-3.5" />
              <span>{formatBytes(status.downloadSpeed)}/с</span>
            </span>
          )}
        </div>

        {/* Right Top Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Multi-file selector (if more than 1 video file in torrent) */}
          {status && status.files.filter((f) => f.isVideo).length > 1 && (
            <div className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-lg border border-white/10">
              <FileVideo className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400" />
              <select
                value={selectedFileIndex}
                onChange={(e) => setSelectedFileIndex(parseInt(e.target.value, 10))}
                className="bg-transparent text-[11px] sm:text-xs text-white focus:outline-none max-w-[100px] sm:max-w-[140px] truncate"
              >
                {status.files
                  .filter((f) => f.isVideo)
                  .map((f) => (
                    <option key={f.index} value={f.index} className="bg-gray-900 text-white">
                      {f.name} ({formatBytes(f.length)})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* External player launcher menu */}
          <div className="relative">
            <button
              onClick={() => setShowExternalMenu(!showExternalMenu)}
              title="Открыть во внешнем плеере (VLC / PotPlayer)"
              className="p-1.5 rounded-lg bg-black/60 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all cursor-pointer flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline text-xs">Внешний плеер</span>
            </button>

            {showExternalMenu && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={() => setShowExternalMenu(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-48 sm:w-52 max-w-[calc(100vw-32px)] bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-2 z-30 space-y-1">
                  {isIOS && (
                    <a
                      href={`outplayer://${getFullStreamUrl()}`}
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 text-xs text-purple-300 hover:text-white flex items-center justify-between transition-colors block"
                    >
                      <span>Запустить в Outplayer</span>
                      <span className="text-[10px] text-purple-400 font-mono">outplayer://</span>
                    </a>
                  )}
                  <a
                    href={`vlc://${getFullStreamUrl()}`}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 text-xs text-gray-200 hover:text-white flex items-center justify-between transition-colors block"
                  >
                    <span>Запустить в VLC</span>
                    <span className="text-[10px] text-amber-400 font-mono">vlc://</span>
                  </a>
                  <a
                    href={`potplayer://${getFullStreamUrl()}`}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 text-xs text-gray-200 hover:text-white flex items-center justify-between transition-colors block"
                  >
                    <span>Запустить в PotPlayer</span>
                    <span className="text-[10px] text-blue-400 font-mono">potplayer://</span>
                  </a>
                  <button
                    onClick={handleDownloadM3u}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/10 text-xs text-emerald-300 hover:text-emerald-200 flex items-center justify-between transition-colors cursor-pointer"
                  >
                    <span>Скачать плейлист .m3u</span>
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Settings button */}
          <button
            onClick={() => setShowSettingsModal(true)}
            title="Настройки стриминга (TorrServer)"
            className="p-1.5 rounded-lg bg-black/60 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center Big Play Button (when paused) */}
      {!isPlaying && (
        <button
          type="button"
          onClick={togglePlay}
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 hover:bg-black/30 transition-colors cursor-pointer group"
          aria-label="Воспроизвести"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
            <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-current ml-1" />
          </div>
        </button>
      )}

      {/* Sleek Buffering & Diagnostic Indicator */}
      {isLoadingMetadata && isPlaying && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 pointer-events-none gap-2 px-4 text-center">
          <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-red-500 animate-spin" />
          <span className="text-xs text-white/90 font-medium">
            {settings.useTorrServer
              ? 'Подключение к TorrServer...'
              : elapsedSeconds > 10
              ? `Поиск пиров в сети (${status?.numPeers || 0} пиров, ${elapsedSeconds}с)...`
              : 'Буферизация потока...'}
          </span>
          {backendError && (
            <span className="text-[11px] text-red-400 bg-red-950/70 px-3 py-1 rounded-lg border border-red-500/30">
              {backendError}
            </span>
          )}
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-2 sm:p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-1.5 sm:gap-2 transition-opacity duration-300 z-10 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Timeline Slider */}
        <div className="flex items-center gap-3 px-1">
          <input
            type="range"
            min={0}
            max={effectiveDuration || 100}
            value={effectiveCurrentTime}
            onChange={handleSeek}
            className="w-full h-1 sm:h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none"
          />
        </div>

        {/* Bottom Buttons */}
        <div className="flex items-center justify-between text-white px-1">
          <div className="flex items-center gap-1.5 sm:gap-3">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-1 sm:p-1.5 hover:text-red-500 transition-colors cursor-pointer"
              title="Пробел / K"
            >
              {isPlaying ? <Pause className="w-4 h-4 sm:w-5 sm:h-5" /> : <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />}
            </button>

            {/* Rewind / Fast Forward */}
            <button
              onClick={() => seekRelative(-10)}
              className="p-1 hover:text-gray-300 transition-colors cursor-pointer"
              title="-10 сек (Стрелка влево)"
            >
              <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <button
              onClick={() => seekRelative(10)}
              className="p-1 hover:text-gray-300 transition-colors cursor-pointer"
              title="+10 сек (Стрелка вправо)"
            >
              <RotateCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-1.5 group/volume">
              <button onClick={toggleMute} className="p-1 hover:text-gray-300 cursor-pointer" title="M">
                {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-500 hidden sm:inline"
              />
            </div>

            {/* Time Display */}
            <div className="text-[10px] sm:text-xs text-gray-300 font-mono ml-1 sm:ml-2 whitespace-nowrap">
              <span>{formatTime(effectiveCurrentTime)}</span>
              <span className="text-gray-500"> / </span>
              <span>{formatTime(effectiveDuration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Audio Tracks */}
            {audioTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowAudioMenu(!showAudioMenu);
                    setShowSubtitleMenu(false);
                    setShowQualityMenu(false);
                    setShowSpeedMenu(false);
                  }}
                  className={`flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded transition-colors cursor-pointer ${
                    selectedAudioTrack >= 0 ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30' : 'bg-white/10 hover:bg-white/20 text-gray-300'
                  }`}
                  title="Аудиодорожки"
                >
                  <Languages className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Аудио</span>
                </button>

                {showAudioMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setShowAudioMenu(false)}
                    />
                    <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[140px] max-w-[200px]">
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

            {/* Subtitles */}
            {subtitleTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSubtitleMenu(!showSubtitleMenu);
                    setShowAudioMenu(false);
                    setShowQualityMenu(false);
                    setShowSpeedMenu(false);
                  }}
                  className={`flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded transition-colors cursor-pointer ${
                    selectedSubtitleTrack >= 0 ? 'bg-purple-600/30 text-purple-300 border border-purple-500/30' : 'bg-white/10 hover:bg-white/20 text-gray-300'
                  }`}
                  title="Субтитры"
                >
                  <Subtitles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">Субтитры</span>
                </button>

                {showSubtitleMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setShowSubtitleMenu(false)}
                    />
                    <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[140px] max-w-[200px]">
                      <button
                        onClick={() => handleSelectSubtitleTrack(-1)}
                        className={`px-3 py-1.5 rounded text-xs text-left transition-colors cursor-pointer ${
                          selectedSubtitleTrack === -1
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
                          {sub.name} {sub.lang ? `(${sub.lang})` : ''}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Quality Levels */}
            {qualityLevels.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => {
                    setShowQualityMenu(!showQualityMenu);
                    setShowAudioMenu(false);
                    setShowSubtitleMenu(false);
                    setShowSpeedMenu(false);
                  }}
                  className={`flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded transition-colors cursor-pointer ${
                    selectedQuality >= 0 ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/30' : 'bg-white/10 hover:bg-white/20 text-gray-300'
                  }`}
                  title="Качество видео"
                >
                  <Layers className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>{selectedQuality === -1 ? 'Авто' : qualityLevels[selectedQuality]?.label || 'Качество'}</span>
                </button>

                {showQualityMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setShowQualityMenu(false)}
                    />
                    <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5 min-w-[120px]">
                      <button
                        onClick={() => handleSelectQuality(-1)}
                        className={`px-3 py-1.5 rounded text-xs text-left transition-colors cursor-pointer ${
                          selectedQuality === -1
                            ? 'bg-emerald-600 text-white font-bold'
                            : 'text-gray-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        Авто
                      </button>
                      {qualityLevels.map((lvl) => (
                        <button
                          key={lvl.id}
                          onClick={() => handleSelectQuality(lvl.id)}
                          className={`px-3 py-1.5 rounded text-xs text-left transition-colors cursor-pointer ${
                            selectedQuality === lvl.id
                              ? 'bg-emerald-600 text-white font-bold'
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

            {/* Speed selector */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex items-center gap-1 text-[11px] sm:text-xs font-bold px-1.5 sm:px-2 py-0.5 sm:py-1 rounded bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                title="Скорость воспроизведения"
              >
                <Gauge className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>{playbackSpeed}x</span>
              </button>

              {showSpeedMenu && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setShowSpeedMenu(false)}
                  />
                  <div className="absolute right-0 bottom-full mb-2 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-1 z-30 flex flex-col gap-0.5">
                    {[0.75, 1, 1.25, 1.5, 2].map((s) => (
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

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1 sm:p-1.5 hover:text-red-500 transition-colors cursor-pointer"
              title={isFullscreen ? "Выйти из полноэкранного режима (F)" : "На весь экран (F)"}
            >
              {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal (TorrServer configuration) - Fullscreen Fixed Modal */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettingsModal(false);
          }}
        >
          <div className="bg-[#12141f] border border-white/20 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 my-auto relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-400" />
                <span>Настройки стриминга (TorrServer)</span>
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 -mr-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                title="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {serverConfig?.configured && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                  <div className="font-bold flex items-center gap-1.5 text-white">
                    <Check className="w-4 h-4 text-emerald-400" /> Серверный TorrServer активен
                  </div>
                  <div className="font-mono text-[11px] text-gray-300 mt-1 truncate">
                    {serverConfig.publicUrl}
                  </div>
                  <div className="text-[10px] text-emerald-400 mt-1">
                    Подключение настроено в Vercel. Все гости сайта и устройства смотрят через него автоматически.
                  </div>
                </div>
              )}

              <label className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                <div>
                  <div className="text-white font-semibold">Собственный адрес TorrServer</div>
                  <div className="text-gray-400 text-[11px]">
                    Для локального сервера на вашем компьютере или в домашней сети
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={useTorrServerToggle}
                  onChange={(e) => setUseTorrServerToggle(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                />
              </label>

              {useTorrServerToggle && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-gray-300 font-medium mb-1">
                      Адрес TorrServer (IP или домен):
                    </label>
                    <input
                      type="text"
                      value={torrServerInput}
                      onChange={(e) => setTorrServerInput(e.target.value)}
                      placeholder="http://127.0.0.1:8090"
                      className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      По умолчанию: http://127.0.0.1:8090 (или https://ваш-хост:8090)
                    </p>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] sm:text-xs leading-relaxed">
                💡 <strong>Совет:</strong> Если вы хотите смотреть тяжелые 4K фильмы без буферизации, используйте кнопку «Внешний плеер» ➔ «Запустить в VLC» или «Скачать .m3u».
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold cursor-pointer"
              >
                Закрыть
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow cursor-pointer"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Backend connection diagnostic error banner */}
      {backendError && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-red-500/15 border border-red-500/30 rounded-xl text-xs text-red-300">
          <span className="truncate">⚠️ {backendError}</span>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs shrink-0"
          >
            Настройки
          </button>
        </div>
      )}

      {/* Playback diagnostic error banner */}
      {videoPlaybackError && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-amber-500/15 border border-amber-500/30 rounded-xl text-xs text-amber-300">
          <span className="truncate">⚠️ {videoPlaybackError}</span>
          <button
            onClick={() => {
              setVideoPlaybackError(null);
              if (videoRef.current) {
                videoRef.current.load();
                void requestPlayback();
              }
            }}
            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors cursor-pointer text-xs shrink-0"
          >
            Повторить
          </button>
        </div>
      )}

      {/* Subtle non-blocking hint for non-MP4 releases on iOS */}
      {isIOS && !hlsPilot && status?.files && (() => {
        const currentFile = status.files.find((f) => f.index === selectedFileIndex);
        if (currentFile && /\.(avi|mkv|wmv)$/i.test(currentFile.name)) {
          return (
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
              <span className="truncate">
                ⚠️ Формат .{currentFile.name.split('.').pop()?.toLowerCase()} может не открыться в Safari.
              </span>
              {mp4Alternative && onSelectTorrent && (
                <button
                  onClick={() => onSelectTorrent(mp4Alternative.magnet)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors cursor-pointer text-xs shrink-0"
                >
                  Попробовать раздачу с пометкой MP4
                </button>
              )}
            </div>
          );
        }
        return null;
      })()}

      {/* Episodes Playlist row if multi-file */}
      {status && status.files.filter((f) => f.isVideo).length > 1 && (
        <div className="bg-[#13151f] p-3 rounded-xl border border-white/10 space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-300">
            <span className="font-bold flex items-center gap-1.5 text-white">
              <FileVideo className="w-3.5 h-3.5 text-amber-400" /> Серии в раздаче:
            </span>
            <span className="text-gray-400 text-[11px]">
              {status.files.filter((f) => f.isVideo).length} серий
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {status.files
              .filter((f) => f.isVideo)
              .map((f) => (
                <button
                  key={f.index}
                  onClick={() => {
                    setSelectedFileIndex(f.index);
                    setIsLoadingMetadata(true);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    selectedFileIndex === f.index
                      ? 'bg-amber-500 text-black font-bold shadow'
                      : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white'
                  }`}
                >
                  {f.name.replace(/\.(mp4|mkv|avi)$/i, '')}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

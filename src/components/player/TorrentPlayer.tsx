'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  Sparkles
} from 'lucide-react';
import { TorrentStatus } from '@/lib/types';
import { formatBytes } from '@/lib/utils';
import { getSettings, saveSettings, AppSettings } from '@/lib/storage';

interface TorrentPlayerProps {
  magnet: string;
  initialFileIndex?: number;
  initialTime?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export function TorrentPlayer({
  magnet,
  initialFileIndex,
  initialTime,
  onTimeUpdate
}: TorrentPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<TorrentStatus | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(initialFileIndex ?? 0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);

  // Playback speed
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // External player menu
  const [showExternalMenu, setShowExternalMenu] = useState(false);

  // Settings / TorrServer modal
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());
  const [torrServerInput, setTorrServerInput] = useState('');
  const [useTorrServerToggle, setUseTorrServerToggle] = useState(false);

  // Resume prompt state
  const [resumePromptTime, setResumePromptTime] = useState<number | null>(null);
  const hasAppliedInitialTimeRef = useRef(false);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load initial settings
  useEffect(() => {
    const s = getSettings();
    setSettings(s);
    setTorrServerInput(s.torrServerUrl);
    setUseTorrServerToggle(s.useTorrServer);
  }, []);

  // Poll torrent status
  useEffect(() => {
    let isMounted = true;

    async function checkStatus() {
      try {
        const res = await fetch(`/api/torrent/info?torrent=${encodeURIComponent(magnet)}`);
        if (!res.ok) return;
        const data: TorrentStatus = await res.json();
        if (isMounted) {
          setStatus(data);
          if (data.ready && data.files.length > 0) {
            setIsLoadingMetadata(false);
            // Auto-select largest video if not set
            if (initialFileIndex === undefined) {
              const videoFiles = data.files.filter((f) => f.isVideo);
              if (videoFiles.length > 0) {
                const largest = videoFiles.reduce((p, c) => (c.length > p.length ? c : p));
                setSelectedFileIndex(largest.index);
              }
            }
          }
        }
      } catch (err) {
        console.error('Status poll error:', err);
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [magnet, initialFileIndex]);

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
      videoRef.current.play().catch(() => {});
    }
  };

  const handleDismissResume = () => {
    hasAppliedInitialTimeRef.current = true;
    setResumePromptTime(null);
  };

  // Video element event listeners
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 0;
    setCurrentTime(cur);
    setDuration(dur);
    if (onTimeUpdate) onTimeUpdate(cur, dur);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
      setHasStartedPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seekRelative = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + seconds));
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
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

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
      }
    }, 3500);
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

  // Determine stream source: either internal proxy or TorrServer
  const streamSrc = settings.useTorrServer && settings.torrServerUrl
    ? `${settings.torrServerUrl.replace(/\/$/, '')}/stream?link=${encodeURIComponent(magnet)}&index=${selectedFileIndex}&play`
    : `/api/torrent/stream?torrent=${encodeURIComponent(magnet)}&file=${selectedFileIndex}`;

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
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 group select-none flex flex-col justify-between"
    >
      {/* Native Video Element */}
      <video
        ref={videoRef}
        src={streamSrc}
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setIsLoadingMetadata(true)}
        onPlaying={() => {
          setIsLoadingMetadata(false);
          setHasStartedPlaying(true);
        }}
        onClick={togglePlay}
        className="w-full h-full object-contain cursor-pointer"
        playsInline
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
        className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/85 via-black/50 to-transparent flex items-center justify-between text-xs text-gray-300 transition-opacity duration-300 z-10 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/30 text-red-400 font-semibold border border-red-500/30 backdrop-blur-md">
            <Radio className="w-3.5 h-3.5 animate-pulse text-red-500" />
            <span>{settings.useTorrServer ? 'TorrServer' : 'Торрент-поток'}</span>
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
        <div className="flex items-center gap-2">
          {/* Multi-file selector (if more than 1 video file in torrent) */}
          {status && status.files.filter((f) => f.isVideo).length > 1 && (
            <div className="flex items-center gap-1.5 bg-black/60 px-2 py-1 rounded-lg border border-white/10">
              <FileVideo className="w-3.5 h-3.5 text-amber-400" />
              <select
                value={selectedFileIndex}
                onChange={(e) => setSelectedFileIndex(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs text-white focus:outline-none max-w-[140px] truncate"
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
              <div className="absolute right-0 top-full mt-2 w-52 bg-[#12141f] border border-white/15 rounded-xl shadow-2xl p-2 z-30 space-y-1">
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

      {/* Center Buffering Spinner */}
      {isLoadingMetadata && !hasStartedPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm gap-3 z-10">
          <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
          <h4 className="text-base font-semibold text-white">Подключение к пирам...</h4>
          <p className="text-xs text-gray-400 text-center max-w-sm px-4">
            Загрузка первых блоков видеопотока. Обычно занимает от 5 до 15 секунд в зависимости от сидов.
          </p>
          {status && (
            <div className="flex items-center gap-4 text-xs text-gray-300 mt-2 bg-white/5 px-4 py-1.5 rounded-full border border-white/10">
              <span>Сиды/Пиры: {status.numPeers}</span>
              <span>Скорость: {formatBytes(status.downloadSpeed)}/с</span>
            </div>
          )}
        </div>
      )}

      {/* Big Play Overlay (when paused) */}
      {!isPlaying && !isLoadingMetadata && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
        >
          <div className="w-20 h-20 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
            <Play className="w-10 h-10 fill-current ml-1" />
          </div>
        </div>
      )}

      {/* Bottom Controls Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-2 transition-opacity duration-300 z-10 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Timeline Slider */}
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-red-600 focus:outline-none"
          />
        </div>

        {/* Bottom Buttons */}
        <div className="flex items-center justify-between text-white">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-1.5 hover:text-red-500 transition-colors cursor-pointer"
              title="Пробел / K"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            {/* Rewind / Fast Forward */}
            <button
              onClick={() => seekRelative(-10)}
              className="p-1 hover:text-gray-300 transition-colors cursor-pointer"
              title="-10 сек (Стрелка влево)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => seekRelative(10)}
              className="p-1 hover:text-gray-300 transition-colors cursor-pointer"
              title="+10 сек (Стрелка вправо)"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 group/volume">
              <button onClick={toggleMute} className="p-1 hover:text-gray-300 cursor-pointer" title="M">
                {isMuted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
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
            <div className="text-xs text-gray-300 font-mono ml-2">
              <span>{formatTime(currentTime)}</span>
              <span className="text-gray-500"> / </span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Speed selector */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                title="Скорость воспроизведения"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>{playbackSpeed}x</span>
              </button>

              {showSpeedMenu && (
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
              )}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 hover:text-red-500 transition-colors cursor-pointer"
              title="На весь экран (F)"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Settings Modal (TorrServer configuration) */}
      {showSettingsModal && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md z-40 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/20 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-400" />
                <span>Настройки стриминга (Lampa / TorrServer)</span>
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                <div>
                  <div className="text-white font-semibold">Использовать TorrServer</div>
                  <div className="text-gray-400 text-[11px]">
                    Для прямого 4K воспроизведения без ограничений сервера
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={useTorrServerToggle}
                  onChange={(e) => setUseTorrServerToggle(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
              </label>

              {useTorrServerToggle && (
                <div>
                  <label className="block text-gray-300 font-medium mb-1">
                    Адрес TorrServer (IP или localhost):
                  </label>
                  <input
                    type="text"
                    value={torrServerInput}
                    onChange={(e) => setTorrServerInput(e.target.value)}
                    placeholder="http://127.0.0.1:8090"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-400"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    По умолчанию: http://127.0.0.1:8090 (если запущен на вашем ПК или Smart TV)
                  </p>
                </div>
              )}

              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] leading-relaxed">
                💡 <strong>Совет:</strong> Если вы хотите смотреть тяжелые 4K фильмы без буферизации, используйте кнопку «Внешний плеер» ➔ «Запустить в VLC» или «Скачать .m3u».
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

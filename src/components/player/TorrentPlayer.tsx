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
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { TorrentStatus, TorrentFile } from '@/lib/types';
import { formatBytes } from '@/lib/utils';

interface TorrentPlayerProps {
  magnet: string;
  initialFileIndex?: number;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

export function TorrentPlayer({ magnet, initialFileIndex, onTimeUpdate }: TorrentPlayerProps) {
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

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
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

  const streamSrc = `/api/torrent/stream?torrent=${encodeURIComponent(magnet)}&file=${selectedFileIndex}`;

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

      {/* Top Stream Status Bar */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between text-xs text-gray-300 transition-opacity duration-300 ${
          showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/30 text-red-400 font-semibold border border-red-500/30 backdrop-blur-md">
            <Radio className="w-3.5 h-3.5 animate-pulse text-red-500" /> Торрент-поток
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

        {/* Multi-file selector (if more than 1 video) */}
        {status && status.files.filter((f) => f.isVideo).length > 1 && (
          <div className="flex items-center gap-2">
            <FileVideo className="w-4 h-4 text-amber-400" />
            <select
              value={selectedFileIndex}
              onChange={(e) => setSelectedFileIndex(parseInt(e.target.value, 10))}
              className="bg-black/80 border border-white/20 text-xs rounded-lg px-2 py-1 text-white focus:outline-none"
            >
              {status.files
                .filter((f) => f.isVideo)
                .map((f) => (
                  <option key={f.index} value={f.index}>
                    {f.name} ({formatBytes(f.length)})
                  </option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* Center Buffering Spinner */}
      {isLoadingMetadata && !hasStartedPlaying && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm gap-3 z-10">
          <Loader2 className="w-10 h-10 text-red-500 animate-spin" />
          <h4 className="text-base font-semibold text-white">Подключение к пирам...</h4>
          <p className="text-xs text-gray-400 text-center max-w-sm">
            Загрузка первых блоков видеопотока. Обычно занимает от 5 до 15 секунд в зависимости от количества сидов.
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
        className={`absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-2 transition-opacity duration-300 ${
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
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            {/* Rewind / Fast Forward */}
            <button
              onClick={() => seekRelative(-10)}
              className="p-1 hover:text-gray-300 transition-colors cursor-pointer"
              title="-10 сек"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => seekRelative(10)}
              className="p-1 hover:text-gray-300 transition-colors cursor-pointer"
              title="+10 сек"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2 group/volume">
              <button onClick={toggleMute} className="p-1 hover:text-gray-300 cursor-pointer">
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
            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 hover:text-red-500 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

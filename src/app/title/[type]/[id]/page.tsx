'use client';

import React, { useState, useEffect, use } from 'react';
import {
  Star,
  Clock,
  Calendar,
  Bookmark,
  Play,
  Magnet,
  Tv,
  Globe,
  Radio,
  Download,
  Users,
  Search,
  Check,
  Film,
  Copy,
  ExternalLink,
  Volume2,
  Sparkles,
  RefreshCw,
  Flame
} from 'lucide-react';
import { Media, Episode, TorrentSearchResult } from '@/lib/types';
import { OnlinePlayer } from '@/components/player/OnlinePlayer';
import { TorrentPlayer } from '@/components/player/TorrentPlayer';
import {
  getActiveProfileId,
  isBookmarked,
  toggleBookmark,
  saveHistory,
  getWatchProgress
} from '@/lib/storage';

interface TitlePageProps {
  params: Promise<{
    type: 'movie' | 'tv';
    id: string;
  }>;
}

export default function TitlePage({ params }: TitlePageProps) {
  const resolvedParams = use(params);
  const mediaType = resolvedParams.type;
  const mediaId = parseInt(resolvedParams.id, 10);

  const [media, setMedia] = useState<Media | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);

  // Streaming player state (online player default for instant cross-device playback)
  const [activeTab, setActiveTab] = useState<'online' | 'torrent'>('online');
  const [bookmarked, setBookmarked] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  const isIOS = typeof window !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const isMp4Release = (title: string) => {
    return /(кпк|mp4|avc|iphone|ipad|android|h\.264|web-dlrip-avc|hdtvrip-avc)/i.test(title);
  };

  // Torrents state
  const [torrents, setTorrents] = useState<TorrentSearchResult[]>([]);
  const [isSearchingTorrents, setIsSearchingTorrents] = useState(false);
  const [selectedMagnet, setSelectedMagnet] = useState<string | null>(null);
  const [copiedMagnet, setCopiedMagnet] = useState<string | null>(null);
  const [torrentFilter, setTorrentFilter] = useState<'all' | 'high_seeds' | 'hd' | 'dub' | 'mp4'>('all');
  const [searchTorrentText, setSearchTorrentText] = useState('');

  const [savedProgressTime, setSavedProgressTime] = useState<number | null>(null);

  // Load details
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/media/details?type=${mediaType}&id=${mediaId}&season=${selectedSeason}`);
        if (!res.ok) return;
        const data = await res.json();
        setMedia(data.media);
        if (data.episodes) setEpisodes(data.episodes);

        const profileId = getActiveProfileId();
        setBookmarked(isBookmarked(profileId, mediaId, mediaType));

        // Check if there is saved watch progress
        const progress = getWatchProgress(profileId, mediaId, mediaType, selectedSeason, selectedEpisode);
        if (progress && progress.currentTime > 15) {
          setSavedProgressTime(progress.currentTime);
        } else {
          setSavedProgressTime(null);
        }
      } catch (err) {
        console.error('Load details error:', err);
      }
    }
    loadData();
  }, [mediaType, mediaId, selectedSeason, selectedEpisode]);

  // Fetch torrents helper
  const fetchTorrents = async (overrideQuery?: string) => {
    if (!media) return;
    setIsSearchingTorrents(true);
    try {
      const q = overrideQuery !== undefined ? overrideQuery.trim() : media.title;
      const params = new URLSearchParams({
        q: q || media.title,
        originalTitle: media.originalTitle || ''
      });
      const res = await fetch(`/api/torrent/search?${params.toString()}`);
      if (res.ok) {
        const data: TorrentSearchResult[] = await res.json();
        setTorrents(data);
        if (data.length > 0) {
          setSelectedMagnet((prev) => {
            if (prev && data.some((d) => d.magnet === prev)) return prev;
            // On iOS (iPhone/iPad), prioritize releases that work natively in Safari (MP4 / КПК)
            if (isIOS) {
              const mp4Candidate = data.find((d) => isMp4Release(d.title));
              if (mp4Candidate) return mp4Candidate.magnet;
            }
            return data[0].magnet;
          });
        }
      }
    } catch (err) {
      console.error('Torrent search error:', err);
    } finally {
      setIsSearchingTorrents(false);
    }
  };

  // Search torrents automatically when media changes
  useEffect(() => {
    if (!media) return;
    fetchTorrents();
  }, [media?.id, media?.title]);

  const handleCopyMagnet = (magnet: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(magnet);
    setCopiedMagnet(magnet);
    setTimeout(() => setCopiedMagnet(null), 2500);
  };

  const handleSelectTorrent = (magnet: string) => {
    setSelectedMagnet(magnet);
    setActiveTab('torrent');
    const el = document.getElementById('media-player-container');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const filteredTorrents = torrents.filter((t) => {
    if (searchTorrentText.trim()) {
      const q = searchTorrentText.toLowerCase();
      const matchesTitle = t.title.toLowerCase().includes(q);
      const matchesTrans = (t.translation || '').toLowerCase().includes(q);
      const matchesQuality = (t.quality || '').toLowerCase().includes(q);
      if (!matchesTitle && !matchesTrans && !matchesQuality) return false;
    }
    if (torrentFilter === 'mp4') return isMp4Release(t.title);
    if (torrentFilter === 'high_seeds') return t.seeds >= 15;
    if (torrentFilter === 'hd') return t.quality === '1080p' || t.quality === '4K UHD';
    if (torrentFilter === 'dub') return Boolean(t.translation);
    return true;
  });

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

  const handleBookmarkClick = () => {
    if (!media) return;
    const profileId = getActiveProfileId();
    const state = toggleBookmark(profileId, media);
    setBookmarked(state);
  };

  const handleStartWatch = () => {
    setIsPlayerOpen(true);
    // Smooth scroll to player
    const el = document.getElementById('media-player-container');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTimeUpdate = (currentTime: number, duration: number) => {
    if (!media) return;
    const profileId = getActiveProfileId();
    saveHistory(profileId, {
      media,
      currentTime,
      duration,
      season: mediaType === 'tv' ? selectedSeason : undefined,
      episode: mediaType === 'tv' ? selectedEpisode : undefined,
      updatedAt: Date.now()
    });
  };

  if (!media) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-red-500" />
      </div>
    );
  }

  const backdrop = media.backdrop || media.poster;

  return (
    <div className="min-h-screen pb-24">
      {/* Hero Backdrop */}
      <div className="relative w-full h-[60vh] min-h-[450px] overflow-hidden">
        <img
          src={backdrop}
          alt={media.title}
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#090a0f] via-[#090a0f]/75 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#090a0f] via-[#090a0f]/50 to-transparent" />
      </div>

      {/* Main Details Card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-40 relative z-10">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          {/* Poster */}
          <div className="w-52 sm:w-64 flex-shrink-0 rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-gray-900 glow-card">
            <img src={media.poster} alt={media.title} className="w-full h-auto object-cover" />
          </div>

          {/* Details */}
          <div className="flex-grow space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {media.rating && (
                <span className="flex items-center gap-1 bg-amber-500/20 text-amber-400 font-bold px-3 py-1 rounded-lg border border-amber-500/30 text-sm">
                  <Star className="w-4 h-4 fill-current" />
                  {media.rating.toFixed(1)}
                </span>
              )}
              <span className="text-gray-300 font-medium text-sm flex items-center gap-1">
                <Calendar className="w-4 h-4 text-gray-400" /> {media.year}
              </span>
              {media.runtime && (
                <span className="text-gray-300 font-medium text-sm flex items-center gap-1">
                  <Clock className="w-4 h-4 text-gray-400" /> {media.runtime} мин.
                </span>
              )}
              <span className="uppercase text-xs font-bold tracking-wider px-2 py-0.5 rounded bg-white/10 text-gray-200">
                {media.type === 'tv' ? 'Сериал' : 'Фильм'}
              </span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              {media.title}
            </h1>
            {media.originalTitle && media.originalTitle !== media.title && (
              <p className="text-gray-400 text-lg font-medium">{media.originalTitle}</p>
            )}

            {/* Genres */}
            <div className="flex flex-wrap gap-2">
              {media.genres.map((g) => (
                <span
                  key={g}
                  className="bg-white/5 border border-white/10 text-gray-300 text-xs px-3 py-1 rounded-full"
                >
                  {g}
                </span>
              ))}
            </div>

            {/* Overview */}
            <p className="text-gray-300 leading-relaxed text-sm sm:text-base max-w-3xl">
              {media.overview || 'Описание отсутствует.'}
            </p>

            {/* Cast */}
            {media.cast.length > 0 && (
              <div className="pt-2 text-sm text-gray-400">
                <span className="text-gray-200 font-semibold">В ролях: </span>
                {media.cast.join(', ')}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-4">
              {savedProgressTime && savedProgressTime > 15 && (
                <button
                  onClick={() => {
                    setActiveTab('torrent');
                    handleStartWatch();
                  }}
                  className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold px-7 py-3 rounded-xl transition-all duration-300 hover:scale-105 shadow-xl shadow-amber-500/25 cursor-pointer"
                >
                  <Sparkles className="w-5 h-5 fill-current" />
                  <span>Продолжить с {formatTime(savedProgressTime)}</span>
                </button>
              )}

              <button
                onClick={handleStartWatch}
                className={`flex items-center gap-2 text-white font-bold px-7 py-3 rounded-xl transition-all duration-300 hover:scale-105 shadow-xl cursor-pointer ${
                  savedProgressTime && savedProgressTime > 15
                    ? 'bg-white/10 hover:bg-white/20 border border-white/15'
                    : 'bg-red-600 hover:bg-red-700 shadow-red-600/30'
                }`}
              >
                <Play className="w-5 h-5 fill-current" />
                <span>{savedProgressTime && savedProgressTime > 15 ? 'Смотреть с начала' : 'Смотреть'}</span>
              </button>

              <button
                onClick={handleBookmarkClick}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl border transition-all duration-300 cursor-pointer ${
                  bookmarked
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                }`}
              >
                <Bookmark className={`w-4 h-4 ${bookmarked ? 'fill-current' : ''}`} />
                <span>{bookmarked ? 'В закладках' : 'Буду смотреть'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* TV Seasons & Episodes Selector (if TV) */}
        {media.type === 'tv' && media.seasons && media.seasons.length > 0 && (
          <div className="mt-12 bg-[#13151f] rounded-2xl p-6 border border-white/10">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Tv className="w-5 h-5 text-red-500" /> Выбор сезона и серии
            </h3>

            {/* Season Tabs */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3 mb-4">
              {media.seasons.map((s) => (
                <button
                  key={s.number}
                  onClick={() => setSelectedSeason(s.number)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    selectedSeason === s.number
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                      : 'bg-white/5 hover:bg-white/10 text-gray-300'
                  }`}
                >
                  {s.name || `Сезон ${s.number}`} ({s.count} серий)
                </button>
              ))}
            </div>

            {/* Episode Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 max-h-60 overflow-y-auto pr-1">
              {episodes.map((ep) => (
                <button
                  key={ep.number}
                  onClick={() => {
                    setSelectedEpisode(ep.number);
                    handleStartWatch();
                  }}
                  className={`p-3 rounded-xl text-center border transition-all cursor-pointer ${
                    selectedEpisode === ep.number
                      ? 'bg-red-600/20 border-red-500 text-white font-bold'
                      : 'bg-white/5 border-white/5 hover:border-white/20 text-gray-300 hover:text-white'
                  }`}
                >
                  <div className="text-sm">Серия {ep.number}</div>
                  <div className="text-[11px] text-gray-400 truncate mt-0.5">{ep.name}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Streaming & Player Section */}
        <div id="media-player-container" className="mt-12 space-y-6">
          {/* Stream Type Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:items-center">
              <button
                onClick={() => setActiveTab('torrent')}
                className={`flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer text-center ${
                  activeTab === 'torrent'
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5'
                }`}
              >
                <Magnet className="w-4 h-4 shrink-0 text-current" />
                <span className="truncate">🧲 Торренты (Без рекламы)</span>
              </button>

              <button
                onClick={() => setActiveTab('online')}
                className={`flex items-center justify-center gap-2 px-3 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer text-center ${
                  activeTab === 'online'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5'
                }`}
              >
                <Radio className="w-4 h-4 shrink-0" />
                <span className="truncate">⚡ Онлайн-плееры</span>
              </button>
            </div>

            <div className="text-[11px] sm:text-xs text-gray-400 text-center sm:text-right">
              {activeTab === 'torrent' && 'Прямая чистая трансляция без единой рекламы'}
              {activeTab === 'online' && 'Мгновенный просмотр через внешние веб-серверы'}
            </div>
          </div>

          {/* Player Tab Content */}
          {activeTab === 'online' && (
            <div className="space-y-4">
              <OnlinePlayer
                tmdbId={media.id}
                imdbId={media.imdbId}
                type={mediaType}
                season={selectedSeason}
                episode={selectedEpisode}
                title={media.title}
              />

              {/* Fast switch promotion if torrents are available */}
              {torrents.length > 0 && (
                <div className="bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500 text-black font-bold">
                      <Magnet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-white font-bold text-sm flex items-center gap-2">
                        <span>Доступен торрент-стриминг без рекламы</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-black">
                          {torrents[0]?.seeds || 0} сидов
                        </span>
                      </div>
                      <p className="text-xs text-gray-300">
                        Оригинальное 1080p/4K качество, чистый звук и отсутствие любых рекламных окон
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setActiveTab('torrent')}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md transition-all whitespace-nowrap cursor-pointer"
                  >
                    Перейти к Торрент-плееру ➔
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'torrent' && (
            <div className="space-y-4">
              {/* Torrent Live Player */}
              {selectedMagnet ? (
                <TorrentPlayer
                  magnet={selectedMagnet}
                  initialTime={savedProgressTime ?? undefined}
                  season={selectedSeason}
                  episode={selectedEpisode}
                  onTimeUpdate={handleTimeUpdate}
                  onSwitchToOnline={() => setActiveTab('online')}
                  availableTorrents={torrents}
                  onSelectTorrent={handleSelectTorrent}
                />
              ) : (
                <div className="w-full aspect-video min-h-[220px] bg-black/50 rounded-2xl border border-white/10 flex flex-col items-center justify-center p-6 text-center">
                  <Magnet className="w-12 h-12 text-amber-400 mb-3" />
                  <p className="text-gray-300 text-sm">
                    {torrents.length > 0
                      ? 'Выберите раздачу из списка ниже для старта потока'
                      : 'Поиск раздач на трекерах...'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Active Torrents Section (Shown directly below the player) */}
          <div className="bg-[#12141f] rounded-2xl p-5 sm:p-6 border border-white/10 shadow-xl space-y-4">
            {/* Header & Filter Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-400" />
                  <span>Активные раздачи торрентов</span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {filteredTorrents.length} {filteredTorrents.length === 1 ? 'раздача' : 'раздач'}
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Сортировка по количеству сидов для быстрого старта и плавной буферизации без рекламы
                </p>
              </div>

              {/* Search & Refresh */}
              <div className="flex items-center gap-2">
                <div className="relative flex-grow sm:w-64">
                  <input
                    type="text"
                    value={searchTorrentText}
                    onChange={(e) => setSearchTorrentText(e.target.value)}
                    placeholder="Поиск по раздачам (1080p, дубляж...)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 pl-9 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/60"
                  />
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                </div>

                <button
                  onClick={() => fetchTorrents()}
                  disabled={isSearchingTorrents}
                  title="Обновить список раздач"
                  className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSearchingTorrents ? 'animate-spin text-amber-400' : ''}`} />
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setTorrentFilter('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  torrentFilter === 'all'
                    ? 'bg-amber-500 text-black font-bold shadow'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                }`}
              >
                Все ({torrents.length})
              </button>
              <button
                onClick={() => setTorrentFilter('mp4')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  torrentFilter === 'mp4'
                    ? 'bg-emerald-500 text-black font-bold shadow'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <span>📱 Для iPhone (MP4)</span>
              </button>
              <button
                onClick={() => setTorrentFilter('high_seeds')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  torrentFilter === 'high_seeds'
                    ? 'bg-emerald-500 text-black font-bold shadow'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Топ сидов (15+)
              </button>
              <button
                onClick={() => setTorrentFilter('hd')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  torrentFilter === 'hd'
                    ? 'bg-sky-500 text-black font-bold shadow'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                }`}
              >
                1080p / 4K UHD
              </button>
              <button
                onClick={() => setTorrentFilter('dub')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  torrentFilter === 'dub'
                    ? 'bg-purple-500 text-white font-bold shadow'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                }`}
              >
                С озвучкой / дубляжом
              </button>
            </div>

            {/* Loading State */}
            {isSearchingTorrents && torrents.length === 0 && (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-300 font-medium">Ищем активные торрент-раздачи на трекерах...</p>
                <p className="text-xs text-gray-500">Опрашиваем Rutor и зеркала по названию «{media.title}»</p>
              </div>
            )}

            {/* Empty State */}
            {!isSearchingTorrents && filteredTorrents.length === 0 && (
              <div className="py-8 px-4 text-center bg-white/[0.02] rounded-xl border border-dashed border-white/10">
                <Magnet className="w-8 h-8 text-gray-500 mx-auto mb-2" />
                <p className="text-sm text-gray-300 font-semibold">
                  {torrents.length === 0
                    ? `Раздачи для «${media.title}» не найдены автоматически`
                    : 'Нет раздач, соответствующих выбранному фильтру'}
                </p>
                <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                  Вы можете ввести другое название в строке поиска выше или перетащить свой .torrent файл на вкладке «Торрент-плеер».
                </p>
              </div>
            )}

            {/* Torrents List */}
            {filteredTorrents.length > 0 && (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {filteredTorrents.map((t, idx) => {
                  const isPlaying = selectedMagnet === t.magnet && activeTab === 'torrent';
                  return (
                    <div
                      key={idx}
                      className={`p-3.5 rounded-xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isPlaying
                          ? 'bg-amber-500/10 border-amber-500/60 shadow-lg ring-1 ring-amber-500/30'
                          : 'bg-white/[0.03] border-white/5 hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      {/* Left: Badges & Title */}
                      <div className="space-y-1.5 flex-grow min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Seed Badge */}
                          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-black">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            {t.seeds} сидов
                          </span>

                          {/* MP4 iPhone Badge */}
                          {isMp4Release(t.title) && (
                            <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                              <span>📱 MP4 (iPhone)</span>
                            </span>
                          )}

                          {/* Peers Badge */}
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
                            <Users className="w-3 h-3" />
                            {t.peers} пиров
                          </span>

                          {/* Quality Badge */}
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                              t.quality === '4K UHD'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                : t.quality === '1080p'
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                : 'bg-white/10 text-gray-300'
                            }`}
                          >
                            {t.quality || 'HD'}
                          </span>

                          {/* Translation / Voiceover Badge */}
                          {t.translation && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-medium">
                              <Volume2 className="w-3 h-3" />
                              {t.translation}
                            </span>
                          )}

                          {/* Size */}
                          <span className="text-xs text-gray-300 font-semibold px-2 py-0.5 rounded bg-white/5">
                            💾 {t.size}
                          </span>
                        </div>

                        {/* Title */}
                        <p className="text-sm font-medium text-white break-words line-clamp-2 hover:line-clamp-none transition-all">
                          {t.title}
                        </p>
                      </div>

                      {/* Right: Quick Action Buttons */}
                      <div className="flex items-center gap-2 flex-shrink-0 pt-2 sm:pt-0">
                        {isPlaying ? (
                          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                            <Check className="w-4 h-4 text-emerald-400" />
                            <span>Играет</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleSelectTorrent(t.magnet)}
                            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-md shadow-amber-500/20 transition-all hover:scale-105 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Смотреть</span>
                          </button>
                        )}

                        <a
                          href={t.magnet}
                          title="Открыть magnet в торрент-клиенте устройства (qBittorrent / uTorrent)"
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>

                        <button
                          onClick={(e) => handleCopyMagnet(t.magnet, e)}
                          title="Скопировать magnet-ссылку"
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all cursor-pointer"
                        >
                          {copiedMagnet === t.magnet ? (
                            <Check className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

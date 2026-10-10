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
  Film
} from 'lucide-react';
import { Media, Episode, TorrentSearchResult } from '@/lib/types';
import { OnlinePlayer } from '@/components/player/OnlinePlayer';
import { TorrentPlayer } from '@/components/player/TorrentPlayer';
import {
  getActiveProfileId,
  isBookmarked,
  toggleBookmark,
  saveHistory
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

  // Streaming player state
  const [activeTab, setActiveTab] = useState<'online' | 'torrent'>('online');
  const [bookmarked, setBookmarked] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);

  // Torrents state
  const [torrents, setTorrents] = useState<TorrentSearchResult[]>([]);
  const [isSearchingTorrents, setIsSearchingTorrents] = useState(false);
  const [selectedMagnet, setSelectedMagnet] = useState<string | null>(null);

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
      } catch (err) {
        console.error('Load details error:', err);
      }
    }
    loadData();
  }, [mediaType, mediaId, selectedSeason]);

  // Search torrents automatically
  useEffect(() => {
    if (!media) return;
    async function findTorrents() {
      setIsSearchingTorrents(true);
      try {
        const searchQuery = `${media?.title || ''} ${media?.year || ''}`.trim();
        const res = await fetch(`/api/torrent/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setTorrents(data);
          if (data.length > 0 && !selectedMagnet) {
            setSelectedMagnet(data[0].magnet);
          }
        }
      } catch (err) {
        console.error('Torrent search error:', err);
      } finally {
        setIsSearchingTorrents(false);
      }
    }
    findTorrents();
  }, [media]);

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
              <button
                onClick={handleStartWatch}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-7 py-3 rounded-xl transition-all duration-300 hover:scale-105 shadow-xl shadow-red-600/30 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>Смотреть</span>
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
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('online')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
                  activeTab === 'online'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <Radio className="w-4 h-4" />
                <span>⚡ Онлайн-плееры (VidLink / VidSrc / Smashy)</span>
              </button>

              <button
                onClick={() => setActiveTab('torrent')}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
                  activeTab === 'torrent'
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 font-bold'
                    : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <Magnet className="w-4 h-4 text-amber-400" />
                <span>🧲 Торрент-стриминг 1080p/4K (Русский Дубляж)</span>
              </button>
            </div>

            <div className="text-xs text-gray-400">
              {activeTab === 'online' && 'Мгновенный просмотр через онлайн-серверы'}
              {activeTab === 'torrent' && 'Прямая трансляция с трекеров в максимальном битрейте'}
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
            </div>
          )}

          {activeTab === 'torrent' && (
            <div className="space-y-6">
              {/* Torrent Live Player */}
              {selectedMagnet ? (
                <TorrentPlayer
                  magnet={selectedMagnet}
                  onTimeUpdate={handleTimeUpdate}
                />
              ) : (
                <div className="w-full aspect-video bg-black/50 rounded-2xl border border-white/10 flex flex-col items-center justify-center p-6 text-center">
                  <Magnet className="w-12 h-12 text-amber-400 mb-3" />
                  <p className="text-gray-300 text-sm">Выберите раздачу из списка ниже для старта потока</p>
                </div>
              )}

              {/* Torrent Releases List */}
              <div className="bg-[#13151f] rounded-2xl p-6 border border-white/10">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Download className="w-4 h-4 text-amber-400" /> Найденные раздачи для «{media.title}»
                  </h3>
                  {isSearchingTorrents && (
                    <span className="text-xs text-gray-400 flex items-center gap-1.5">
                      <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                      Поиск раздач...
                    </span>
                  )}
                </div>

                {torrents.length === 0 && !isSearchingTorrents ? (
                  <p className="text-sm text-gray-400">
                    Раздачи не найдены по запросу. Вы можете перетащить свой .torrent файл на вкладке «Торрент-плеер».
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {torrents.map((t, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedMagnet(t.magnet)}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                          selectedMagnet === t.magnet
                            ? 'bg-amber-500/10 border-amber-500/50 shadow-md'
                            : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-black/60 text-amber-400 border border-amber-500/30 flex-shrink-0 mt-0.5">
                            {t.quality || 'HD'}
                          </span>
                          <span className="text-sm font-medium text-gray-200 line-clamp-1">
                            {t.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-xs text-gray-400 mt-2 sm:mt-0 flex-shrink-0">
                          <span className="text-gray-300 font-semibold">{t.size}</span>
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Users className="w-3 h-3" /> {t.seeds} сидов
                          </span>
                          {selectedMagnet === t.magnet && (
                            <span className="text-amber-400 font-bold flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> Играет
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

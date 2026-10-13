'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Play,
  Film,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Layers,
  ShieldCheck,
  Sparkles,
  Clock,
  Volume2,
  Subtitles,
  HelpCircle,
  XCircle,
  Tv,
  Info,
  Bug,
  Smartphone,
  SlidersHorizontal
} from 'lucide-react';
import { KinoRoomPlayer } from '@/components/player/KinoRoomPlayer';
import { UnifiedCineSrcPlayer } from '@/components/player/UnifiedCineSrcPlayer';
import { PlaybackResponse } from '@/lib/playback/types';
import { DEMO_MEDIA_LIBRARY } from '@/lib/playback/providers/demoProvider';

interface UnifiedPreset {
  id: string;
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title: string;
  runtimeMinutes: number;
  description: string;
  poster: string;
}

const UNIFIED_PRESETS: UnifiedPreset[] = [
  {
    id: 'fight-club',
    tmdbId: 550,
    type: 'movie',
    title: 'Бойцовский клуб',
    runtimeMinutes: 139,
    description: '1999 • TMDB 550 • 139 мин. • SubDL & OpenSubtitles',
    poster: 'https://image.tmdb.org/t/p/w300/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg'
  },
  {
    id: 'breaking-bad-s1e1',
    tmdbId: 1396,
    type: 'tv',
    season: 1,
    episode: 1,
    title: 'Во все тяжкие',
    runtimeMinutes: 58,
    description: '2008 • Сезон 1, Эпизод 1 • TMDB 1396 • SubDL & OpenSubtitles',
    poster: 'https://image.tmdb.org/t/p/w300/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg'
  },
  {
    id: 'interstellar',
    tmdbId: 157336,
    type: 'movie',
    title: 'Интерстеллар',
    runtimeMinutes: 169,
    description: '2014 • TMDB 157336 • 169 мин. • SubDL & OpenSubtitles',
    poster: 'https://image.tmdb.org/t/p/w300/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'
  }
];

function PlayerTestContent() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get('mode');
  const [activeTab, setActiveTab] = useState<'unified' | 'hls'>(modeParam === 'unified' ? 'unified' : 'hls');

  useEffect(() => {
    if (modeParam === 'unified') {
      setActiveTab('unified');
    } else if (modeParam === 'hls') {
      setActiveTab('hls');
    }
  }, [modeParam]);

  // Unified Mode State
  const [selectedUnifiedPresetId, setSelectedUnifiedPresetId] = useState<string>('fight-club');
  const [customUnifiedType, setCustomUnifiedType] = useState<'movie' | 'tv'>('movie');
  const [customUnifiedTmdbId, setCustomUnifiedTmdbId] = useState<string>('550');
  const [customUnifiedSeason, setCustomUnifiedSeason] = useState<number>(1);
  const [customUnifiedEpisode, setCustomUnifiedEpisode] = useState<number>(1);
  const [customUnifiedTitle, setCustomUnifiedTitle] = useState<string>('Бойцовский клуб');
  const [isCustomMode, setIsCustomMode] = useState<boolean>(false);
  const [unifiedPlayerKey, setUnifiedPlayerKey] = useState<number>(0);

  const activePreset = UNIFIED_PRESETS.find((p) => p.id === selectedUnifiedPresetId) || UNIFIED_PRESETS[0];
  const activeMedia = isCustomMode
    ? {
        tmdbId: parseInt(customUnifiedTmdbId, 10) || 550,
        type: customUnifiedType,
        season: customUnifiedSeason,
        episode: customUnifiedEpisode,
        title: customUnifiedTitle || 'Фильм',
        runtimeMinutes: 120
      }
    : activePreset;

  // HLS Lab State
  const [selectedDemoKey, setSelectedDemoKey] = useState<string>('tears-of-steel');
  const [playbackData, setPlaybackData] = useState<PlaybackResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [customUrl, setCustomUrl] = useState<string>('');
  const [testEvents, setTestEvents] = useState<string[]>([]);
  const [playerCurrentTime, setPlayerCurrentTime] = useState<number>(0);
  const [playerDuration, setPlayerDuration] = useState<number>(0);
  const [hasStartedPlayback, setHasStartedPlayback] = useState<boolean>(false);
  const [hasTestedSeek, setHasTestedSeek] = useState<boolean>(false);
  const [tmdbTestStatus, setTmdbTestStatus] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle');
  const [tmdbTestDetails, setTmdbTestDetails] = useState<string | null>(null);

  const addEvent = (msg: string) => {
    setTestEvents((prev) => [
      `[${new Date().toLocaleTimeString()}] ${msg}`,
      ...prev.slice(0, 24)
    ]);
  };

  const loadStream = async (mediaId: string, translationId?: string) => {
    setIsLoading(true);
    setPlayerCurrentTime(0);
    setPlayerDuration(0);
    setHasStartedPlayback(false);
    setHasTestedSeek(false);
    addEvent(`Запрос Playback API для mediaId="${mediaId}"...`);
    try {
      const res = await fetch('/api/playback/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId,
          mediaType: 'movie',
          translationId
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        addEvent(`Ошибка API (${res.status}): ${errJson.error || errJson.code || res.statusText}`);
        setPlaybackData(null);
        return;
      }

      const data: PlaybackResponse = await res.json();
      setPlaybackData(data);
      addEvent(`Поток разрешен: ${data.stream.url.slice(0, 45)}...`);
      addEvent(`Дорожек: ${data.stream.audioTracks.length}, Субтитров: ${data.stream.subtitles.length}`);
    } catch (e: any) {
      addEvent(`Сетевая ошибка: ${e?.message || e}`);
      setPlaybackData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'hls') {
      loadStream(selectedDemoKey);
    }
  }, [selectedDemoKey, activeTab]);

  const handleTranslationChange = async (translationId: string, currentTime: number) => {
    addEvent(`Смена озвучки на "${translationId}", текущая позиция: ${Math.round(currentTime)}с`);
    await loadStream(selectedDemoKey, translationId);
  };

  const handlePlayerTimeUpdate = (currentTime: number, duration: number) => {
    setPlayerCurrentTime(currentTime);
    setPlayerDuration(duration);
    if (currentTime > 0.5 && !hasStartedPlayback) {
      setHasStartedPlayback(true);
      addEvent(`Старт воспроизведения: currentTime=${currentTime.toFixed(1)}с`);
    }
    if (currentTime > 15 && !hasTestedSeek) {
      setHasTestedSeek(true);
      addEvent(`Зафиксирована перемотка: currentTime=${currentTime.toFixed(1)}с`);
    }
  };

  const runTmdb969681Test = async () => {
    setTmdbTestStatus('loading');
    setTmdbTestDetails(null);
    addEvent('Проверка TMDB ID 969681: отправка POST к /api/playback/resolve...');
    try {
      const res = await fetch('/api/playback/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: 969681,
          mediaType: 'movie'
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 404 && (data.error === 'SOURCE_UNAVAILABLE' || data.code === 'SOURCE_UNAVAILABLE') && !data.success) {
        setTmdbTestStatus('success');
        setTmdbTestDetails('Подтверждено: API вернул ожидаемый HTTP 404 SOURCE_UNAVAILABLE без подмены фильма на Tears of Steel.');
        addEvent('УСПЕХ ТЕСТА: получен статус HTTP 404 SOURCE_UNAVAILABLE.');
      } else if (data.success) {
        setTmdbTestStatus('failed');
        setTmdbTestDetails(`ОШИБКА: API вернул success: true для фильма из каталога (${data.media?.title})!`);
        addEvent(`ПРОВАЛ ТЕСТА: неожиданный success: true (${data.media?.title})`);
      } else {
        setTmdbTestStatus('failed');
        setTmdbTestDetails(`ОШИБКА: Ожидался HTTP 404 SOURCE_UNAVAILABLE, получен HTTP ${res.status}: ${data.error || data.code || 'Неизвестная ошибка'}`);
        addEvent(`ПРОВАЛ ТЕСТА: код ${res.status} вместо ожидаемого 404 SOURCE_UNAVAILABLE`);
      }
    } catch (err: any) {
      setTmdbTestStatus('failed');
      setTmdbTestDetails(`Ошибка сети: ${err?.message || err}`);
      addEvent(`Ошибка теста: ${err?.message || err}`);
    }
  };

  const handleCustomStreamLoad = () => {
    if (!customUrl.trim()) return;
    addEvent(`Загрузка пользовательского потока: ${customUrl}`);
    setPlaybackData({
      success: true,
      media: {
        id: 'custom',
        title: 'Пользовательский стрим',
        mediaType: 'movie'
      },
      currentTranslation: {
        id: 'custom-direct',
        name: 'Прямой поток',
        type: 'original',
        quality: 'Source',
        providerId: 'custom'
      },
      availableTranslations: [],
      stream: {
        url: customUrl.trim(),
        type: customUrl.includes('.m3u8') ? 'hls' : 'mp4',
        qualities: [{ id: 'auto', label: 'Авто', height: 0 }],
        audioTracks: [],
        subtitles: []
      },
      provider: {
        id: 'custom',
        name: 'Пользовательский URL'
      }
    });
  };

  const demoItems = Object.values(DEMO_MEDIA_LIBRARY);

  return (
    <div className="min-h-screen bg-[#090a0f] text-white pt-24 sm:pt-28 pb-28 sm:pb-16 px-3 sm:px-6 lg:px-8 overflow-x-hidden">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all text-xs font-semibold shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Главная</span>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/player-test/providers"
                className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/30 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5 text-red-400" />
                <span>Лаборатория 7 источников ➔</span>
              </Link>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight">
                Тест-лаборатория KinoRoom Player
              </h1>
              <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-300 border border-red-500/30 font-medium">
                Шаг 2G: Единый плеер
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Экспериментальный единый плеер с автоматическими русскими субтитрами (SubDL + OpenSubtitles) и HLS лаборатория
            </p>
          </div>
        </div>

        {/* Tab Switcher: CineSrc Unified Player vs HLS / Playback API */}
        <div className="flex flex-wrap gap-2 p-1.5 bg-[#12141f] rounded-2xl border border-white/10">
          <button
            type="button"
            data-testid="tab-unified-player"
            onClick={() => setActiveTab('unified')}
            className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'unified'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/25 border border-red-500'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Film className="w-4 h-4 shrink-0" />
            <span>Единый плеер CineSrc (Шаг 2G)</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-semibold">
              Субтитры
            </span>
          </button>

          <button
            type="button"
            data-testid="tab-hls-player"
            onClick={() => setActiveTab('hls')}
            className={`flex-1 min-w-[200px] py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'hls'
                ? 'bg-red-600 text-white shadow-lg shadow-red-600/25 border border-red-500'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Layers className="w-4 h-4 shrink-0" />
            <span>HLS / Playback API (Лаборатория)</span>
          </button>
        </div>

        {/* TAB 1: ЕДИНЫЙ ПЛЕЕР CINESRC (ШАГ 2G) */}
        {activeTab === 'unified' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Media Selector Presets */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Film className="w-3.5 h-3.5 text-red-400" />
                  <span>Пресеты для тестирования:</span>
                </span>
                <button
                  type="button"
                  data-testid="toggle-custom-media-btn"
                  onClick={() => setIsCustomMode((prev) => !prev)}
                  className="text-xs text-red-400 hover:text-red-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>{isCustomMode ? 'Выбрать из пресетов' : 'Свой TMDB ID'}</span>
                </button>
              </div>

              {!isCustomMode ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  {UNIFIED_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`unified-preset-${preset.id}`}
                      onClick={() => {
                        setSelectedUnifiedPresetId(preset.id);
                        setUnifiedPlayerKey((k) => k + 1);
                      }}
                      className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                        selectedUnifiedPresetId === preset.id
                          ? 'bg-red-600/20 border-red-500 text-white shadow-lg shadow-red-600/10'
                          : 'bg-[#12141f] border-white/10 text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg overflow-hidden bg-gray-800 shrink-0 border border-white/10">
                        <img src={preset.poster} alt={preset.title} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate text-white">{preset.title}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2 leading-tight">
                          {preset.description}
                        </div>
                        <div className="text-[10px] text-emerald-400 font-medium mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>SubDL / OpenSubtitles</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                /* Custom TMDB Input Card */
                <div className="p-3.5 sm:p-4 rounded-2xl bg-[#12141f] border border-white/10 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="text-[11px] text-gray-400 font-medium block mb-1">Тип контента</label>
                      <select
                        value={customUnifiedType}
                        onChange={(e) => setCustomUnifiedType(e.target.value as 'movie' | 'tv')}
                        className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                      >
                        <option value="movie">Фильм (Movie)</option>
                        <option value="tv">Сериал (TV)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-gray-400 font-medium block mb-1">TMDB ID</label>
                      <input
                        type="number"
                        value={customUnifiedTmdbId}
                        onChange={(e) => setCustomUnifiedTmdbId(e.target.value)}
                        placeholder="Например, 550"
                        className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
                      >
                      </input>
                    </div>

                    {customUnifiedType === 'tv' && (
                      <>
                        <div>
                          <label className="text-[11px] text-gray-400 font-medium block mb-1">Сезон</label>
                          <input
                            type="number"
                            min={1}
                            value={customUnifiedSeason}
                            onChange={(e) => setCustomUnifiedSeason(parseInt(e.target.value, 10) || 1)}
                            className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-gray-400 font-medium block mb-1">Серия</label>
                          <input
                            type="number"
                            min={1}
                            value={customUnifiedEpisode}
                            onChange={(e) => setCustomUnifiedEpisode(parseInt(e.target.value, 10) || 1)}
                            className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
                          />
                        </div>
                      </>
                    )}

                    <div className={customUnifiedType === 'tv' ? 'sm:col-span-4' : 'sm:col-span-2'}>
                      <label className="text-[11px] text-gray-400 font-medium block mb-1">Название фильма / сериала</label>
                      <input
                        type="text"
                        value={customUnifiedTitle}
                        onChange={(e) => setCustomUnifiedTitle(e.target.value)}
                        placeholder="Название для плеера"
                        className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setUnifiedPlayerKey((k) => k + 1)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Применить и перезагрузить плеер
                  </button>
                </div>
              )}
            </div>

            {/* Embedded Unified CineSrc Player */}
            <div className="bg-[#12141f] rounded-2xl p-2 sm:p-5 border border-white/10 shadow-2xl space-y-4">
              <UnifiedCineSrcPlayer
                key={`unified-${activeMedia.tmdbId}-${activeMedia.type}-${activeMedia.season || 1}-${activeMedia.episode || 1}-${unifiedPlayerKey}`}
                tmdbId={activeMedia.tmdbId}
                type={activeMedia.type}
                season={activeMedia.season}
                episode={activeMedia.episode}
                title={activeMedia.title}
                runtimeMinutes={activeMedia.runtimeMinutes}
                initialControlsDisabled={true}
                showDiagnosticsByDefault={false}
              />
            </div>

            {/* iOS Safari Verification & Architecture Information Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#12141f] border border-white/10 space-y-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Памятка тестирования на iPhone Safari (Шаг 2G)
                </h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-300">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 text-red-400" />
                    <span>Старт воспроизведения и жесты на iOS</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    iOS Safari блокирует автовоспроизведение видео без прямого касания экрана пользователем. Большой красный Play по центру передает касание в плеер и инициирует воспроизведение.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Subtitles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Субтитры и Cinema Fullscreen на iPhone</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Нативный полноэкранный плеер QuickTime на iOS полностью перекрывает внешние HTML-элементы. В KinoRoom используется режим <strong>Cinema Fullscreen</strong> (кнопка в правом нижнем углу), при котором русские субтитры гарантированно остаются видимыми поверх видео.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Каскад SubDL ➔ OpenSubtitles</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    При запуске плеер автоматически ищет дорожку в SubDL v2. Если SubDL возвращает <code>NOT_FOUND</code>, плеер мгновенно переключается на OpenSubtitles REST API v1.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5">
                  <div className="font-semibold text-white flex items-center gap-1.5">
                    <Bug className="w-3.5 h-3.5 text-blue-400" />
                    <span>Диагностика postMessage</span>
                  </div>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Кнопка «Диагностика» в верхней панели плеера открывает поток живых событий postMessage (<code>cinesrc:timeupdate</code>, <code>cinesrc:play</code>) и позволяет вручную посылать команды.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HLS / PLAYBACK API (ЛАБОРАТОРИЯ) */}
        {activeTab === 'hls' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Media Selector Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
              {demoItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedDemoKey(item.id)}
                  className={`p-2.5 sm:p-3 rounded-xl sm:rounded-2xl border text-left transition-all cursor-pointer flex items-center sm:items-start gap-3 ${
                    selectedDemoKey === item.id
                      ? 'bg-red-600/20 border-red-500 text-white shadow-lg shadow-red-600/10'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg overflow-hidden bg-gray-800 shrink-0 border border-white/10">
                    <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate text-white">{item.title}</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">{item.year} г. • {Math.round(item.duration / 60)} мин.</div>
                    <div className="text-[10px] text-amber-400 font-medium mt-1 flex items-center gap-1 truncate">
                      <Sparkles className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.translations[0]?.name || 'HLS'}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Video Player Container */}
            <div className="bg-[#12141f] rounded-xl sm:rounded-2xl p-2 sm:p-5 border border-white/10 shadow-2xl space-y-4">
              {isLoading ? (
                <div className="w-full aspect-video rounded-xl bg-black/60 flex flex-col items-center justify-center gap-2">
                  <div className="w-7 h-7 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
                  <span className="text-xs text-gray-300">Разрешение потока...</span>
                </div>
              ) : playbackData && playbackData.success ? (
                <KinoRoomPlayer
                  key={playbackData.media?.id}
                  playbackData={playbackData}
                  initialTime={10}
                  onTimeUpdate={handlePlayerTimeUpdate}
                  onTranslationChange={handleTranslationChange}
                  onRefreshStream={() => loadStream(selectedDemoKey)}
                  autoPlay={false}
                  showSubtitleDiagnostics={true}
                />
              ) : (
                <div className="w-full aspect-video rounded-xl bg-black/60 flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <AlertCircle className="w-8 h-8 text-red-400" />
                  <div className="text-sm font-bold text-white">Не удалось загрузить поток</div>
                  <p className="text-xs text-gray-400 max-w-md">
                    {playbackData?.error || 'Проверьте сетевое подключение к CDN.'}
                  </p>
                </div>
              )}
            </div>

            {/* Real-time Checklist & Diagnostic Log */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-[#12141f] rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-white/10 space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Динамический статус воспроизведения (Live)</span>
                </h3>
                <ul className="space-y-2 text-xs">
                  <li className="flex items-start gap-2">
                    {playbackData?.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <HelpCircle className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-semibold text-white">Разрешение Playback API:</span>{' '}
                      <span className={playbackData?.success ? 'text-emerald-400' : 'text-gray-400'}>
                        {playbackData?.success ? 'Успешно (HLS .m3u8)' : 'Ожидание...'}
                      </span>
                    </div>
                  </li>

                  <li className="flex items-start gap-2">
                    {playerDuration > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Clock className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-semibold text-white">Длительность:</span>{' '}
                      <span className={playerDuration > 0 ? 'text-emerald-400 font-mono' : 'text-gray-400'}>
                        {playerDuration > 0 ? `${Math.round(playerDuration)} сек` : 'Загрузка манифеста...'}
                      </span>
                    </div>
                  </li>

                  <li className="flex items-start gap-2">
                    {playerCurrentTime > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Play className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-semibold text-white">Текущий таймкод:</span>{' '}
                      <span className={playerCurrentTime > 0 ? 'text-emerald-400 font-mono' : 'text-gray-400'}>
                        {playerCurrentTime > 0 ? `${playerCurrentTime.toFixed(1)} сек` : 'Нажмите Play'}
                      </span>
                    </div>
                  </li>

                  <li className="flex items-start gap-2">
                    {(playbackData?.stream?.audioTracks?.length || 0) > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-semibold text-white">Аудиодорожки:</span>{' '}
                      <span className={(playbackData?.stream?.audioTracks?.length || 0) > 0 ? 'text-emerald-400' : 'text-gray-400'}>
                        {(playbackData?.stream?.audioTracks?.length || 0) > 0
                          ? `${playbackData!.stream.audioTracks.length} (${playbackData!.stream.audioTracks.map((t) => t.name).join(', ')})`
                          : 'Встроенная дорожка'}
                      </span>
                    </div>
                  </li>

                  <li className="flex items-start gap-2">
                    {(playbackData?.stream?.subtitles?.length || 0) > 0 ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <Subtitles className="w-4 h-4 text-gray-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-semibold text-white">WebVTT субтитры:</span>{' '}
                      <span className={(playbackData?.stream?.subtitles?.length || 0) > 0 ? 'text-emerald-400' : 'text-gray-400'}>
                        {(playbackData?.stream?.subtitles?.length || 0) > 0
                          ? `${playbackData!.stream.subtitles.length} (${playbackData!.stream.subtitles.map((s) => s.label).join(', ')})`
                          : 'Без субтитров'}
                      </span>
                    </div>
                  </li>

                  <li className="flex items-start gap-2 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-white">Изоляция:</span>{' '}
                      <span>100% нативный HTML5/Hls.js плеер без сторонней рекламы</span>
                    </div>
                  </li>
                </ul>
              </div>

              <div className="bg-[#12141f] rounded-xl sm:rounded-2xl p-4 sm:p-5 border border-white/10 space-y-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                  <span>Проверка изоляции каталога (TMDB 969681)</span>
                  <span className="text-[10px] text-gray-400 font-mono">Строго 404</span>
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Тестовый видеопоток не должен подменять фильм из каталога. Для неизвестного TMDB ID API обязан честно вернуть <code className="text-amber-400 bg-white/5 px-1 py-0.5 rounded">HTTP 404 SOURCE_UNAVAILABLE</code>.
                </p>
                <div className="pt-1">
                  <button
                    onClick={runTmdb969681Test}
                    disabled={tmdbTestStatus === 'loading'}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {tmdbTestStatus === 'loading' ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    <span>Запустить тест запроса TMDB 969681</span>
                  </button>
                </div>

                {tmdbTestStatus === 'success' && (
                  <div className="p-2.5 sm:p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-2 text-xs text-emerald-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
                    <span>{tmdbTestDetails}</span>
                  </div>
                )}

                {tmdbTestStatus === 'failed' && (
                  <div className="p-2.5 sm:p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-2 text-xs text-red-300">
                    <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                    <span>{tmdbTestDetails}</span>
                  </div>
                )}

                <div className="pt-1">
                  <div className="text-[11px] text-gray-400 font-semibold mb-1 flex items-center justify-between">
                    <span>Журнал событий плеера:</span>
                    <span className="text-[10px] font-mono">{testEvents.length} событий</span>
                  </div>
                  <div className="bg-black/60 rounded-xl p-2.5 font-mono text-[10px] text-gray-300 max-h-28 overflow-y-auto space-y-0.5">
                    {testEvents.length === 0 ? (
                      <div className="text-gray-500">Ожидание событий...</div>
                    ) : (
                      testEvents.map((ev, idx) => (
                        <div key={idx} className="truncate text-gray-400 hover:text-white">
                          {ev}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Stream Input */}
            <div className="bg-[#12141f] rounded-xl sm:rounded-2xl p-3.5 sm:p-5 border border-white/10 space-y-2.5">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Тестирование произвольного внешнего HLS / MP4 потока</span>
              </h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Вставьте ссылку на .m3u8 или .mp4 поток..."
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-red-500"
                />
                <button
                  onClick={handleCustomStreamLoad}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Запустить в плеере
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PlayerTestPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#090a0f] text-white flex items-center justify-center p-4">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <RefreshCw className="w-4 h-4 animate-spin text-red-500" />
            <span>Загрузка лаборатории KinoRoom...</span>
          </div>
        </div>
      }
    >
      <PlayerTestContent />
    </Suspense>
  );
}

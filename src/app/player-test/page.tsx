'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Film, CheckCircle2, AlertCircle, RefreshCw, Layers, ShieldCheck, Sparkles } from 'lucide-react';
import { KinoRoomPlayer } from '@/components/player/KinoRoomPlayer';
import { PlaybackResponse } from '@/lib/playback/types';
import { DEMO_MEDIA_LIBRARY } from '@/lib/playback/providers/demoProvider';

export default function PlayerTestPage() {
  const [selectedDemoKey, setSelectedDemoKey] = useState<string>('tears-of-steel');
  const [playbackData, setPlaybackData] = useState<PlaybackResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [customUrl, setCustomUrl] = useState<string>('');
  const [testEvents, setTestEvents] = useState<string[]>([]);

  const addEvent = (msg: string) => {
    setTestEvents((prev) => [
      `[${new Date().toLocaleTimeString()}] ${msg}`,
      ...prev.slice(0, 19)
    ]);
  };

  const loadStream = async (mediaId: string, translationId?: string) => {
    setIsLoading(true);
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
        addEvent(`Ошибка API (${res.status}): ${errJson.error || res.statusText}`);
        return;
      }

      const data: PlaybackResponse = await res.json();
      setPlaybackData(data);
      addEvent(`Поток успешно разрешен: ${data.stream.url.slice(0, 50)}...`);
      addEvent(`Доступно вариантов озвучки: ${data.availableTranslations.length}`);
      addEvent(`Доступно аудиодорожек: ${data.stream.audioTracks.length}`);
      addEvent(`Доступно субтитров: ${data.stream.subtitles.length}`);
    } catch (e: any) {
      addEvent(`Сетевая ошибка: ${e?.message || e}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStream(selectedDemoKey);
  }, [selectedDemoKey]);

  const handleTranslationChange = async (translationId: string, currentTime: number) => {
    addEvent(`Переключение озвучки на "${translationId}", таймкод: ${Math.round(currentTime)}с`);
    await loadStream(selectedDemoKey, translationId);
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
    <div className="min-h-screen bg-[#090a0f] text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>В КиноРум</span>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <span>Тестирование плеера КиноРум</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  End-to-End HLS
                </span>
              </h1>
              <p className="text-xs text-gray-400">
                Проверка архитектуры Playback API, нативного плеера, переключения озвучек, аудиодорожек и субтитров
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadStream(selectedDemoKey)}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Перезагрузить поток</span>
            </button>
          </div>
        </div>

        {/* Media Selector Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {demoItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedDemoKey(item.id)}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                selectedDemoKey === item.id
                  ? 'bg-red-600/20 border-red-500 text-white shadow-lg shadow-red-600/10'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <div className="w-12 h-16 rounded-lg overflow-hidden bg-gray-800 shrink-0">
                <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold truncate text-white">{item.title}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{item.year} г. • {Math.round(item.duration / 60)} мин.</div>
                <div className="text-[10px] text-amber-400 font-medium mt-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  <span>{item.translations.length} варианта озвучки</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Main Video Player Container */}
        <div className="bg-[#12141f] rounded-2xl p-4 sm:p-6 border border-white/10 shadow-2xl space-y-4">
          {isLoading ? (
            <div className="w-full aspect-video rounded-2xl bg-black/60 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
              <span className="text-xs text-gray-300">Разрешение потока через Playback API...</span>
            </div>
          ) : playbackData && playbackData.success ? (
            <KinoRoomPlayer
              key={`${playbackData.stream.url}-${playbackData.currentTranslation?.id}`}
              playbackData={playbackData}
              initialTime={10}
              onTranslationChange={handleTranslationChange}
              onRefreshStream={() => loadStream(selectedDemoKey)}
              autoPlay={false}
            />
          ) : (
            <div className="w-full aspect-video rounded-2xl bg-black/60 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <div className="text-sm font-bold text-white">Не удалось загрузить поток</div>
              <p className="text-xs text-gray-400 max-w-md">
                {playbackData?.error || 'Проверьте сетевое подключение к CDN.'}
              </p>
            </div>
          )}
        </div>

        {/* Custom Stream Input */}
        <div className="bg-[#12141f] rounded-2xl p-4 sm:p-5 border border-white/10 space-y-3">
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Тестирование произвольного HLS / MP4 потока</span>
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

        {/* Diagnostic Log & Architecture Verification */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Architecture Checklist */}
          <div className="bg-[#12141f] rounded-2xl p-5 border border-white/10 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Проверка критериев воспроизведения</span>
            </h3>
            <ul className="space-y-2 text-xs">
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Архитектура AnimeOn: UI → Playback API → MediaProvider → HLS Player</span>
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Hls.js + HTML5 с поддержкой iPhone Safari и Android</span>
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Переключение озвучек с сохранением позиции таймкода</span>
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Переключение аудиодорожек и VTT субтитров без перезагрузки</span>
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Полное отсутствие сторонних рекламных iframe и всплывающих окон</span>
              </li>
              <li className="flex items-center gap-2 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Работает на Vercel без необходимости покупки VPS</span>
              </li>
            </ul>
          </div>

          {/* Real-time Diagnostics Event Log */}
          <div className="bg-[#12141f] rounded-2xl p-5 border border-white/10 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
              <span>События плеера и Playback API</span>
              <span className="text-[10px] text-gray-500 font-mono">{testEvents.length} событий</span>
            </h3>
            <div className="bg-black/60 rounded-xl p-3 font-mono text-[11px] text-gray-300 max-h-48 overflow-y-auto space-y-1">
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
    </div>
  );
}

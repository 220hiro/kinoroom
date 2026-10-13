'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ExternalAdapterId,
  UnifiedProviderInfo,
  ProviderManualQACheck,
  AvailabilityStatus
} from '@/lib/services/externalSources/types';
import { TRUSTED_IFRAME_DOMAINS } from '@/lib/services/externalSources/allowlist';
import {
  Play,
  Film,
  Tv,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Sparkles,
  Radio,
  ChevronLeft,
  Info,
  Activity,
  Layers,
  Check
} from 'lucide-react';

interface MediaPreset {
  id: string;
  label: string;
  tmdbId: number;
  type: 'movie' | 'tv';
  season?: number;
  episode?: number;
  title: string;
}

const PRESETS: MediaPreset[] = [
  {
    id: 'fight-club',
    label: 'Fight Club (Movie)',
    tmdbId: 550,
    type: 'movie',
    title: 'Бойцовский клуб'
  },
  {
    id: 'living-dead',
    label: 'Night of the Living Dead (Movie)',
    tmdbId: 10331,
    type: 'movie',
    title: 'Ночь живых мертвецов'
  },
  {
    id: 'breaking-bad',
    label: 'Breaking Bad (TV S1:E1)',
    tmdbId: 1396,
    type: 'tv',
    season: 1,
    episode: 1,
    title: 'Во все тяжкие'
  }
];

const DEFAULT_QA: ProviderManualQACheck = {
  providerId: 'embedwave',
  testedAt: '',
  videoPlays: false,
  correctMovie: false,
  hasRussianAudio: false,
  seekWorks: false,
  fullscreenWorks: false,
  hasAds: false,
  opensNewTabs: false,
  worksOnIPhone: false,
  comment: ''
};

export default function ProvidersTestLabPage() {
  // Media Request State
  const [tmdbId, setTmdbId] = useState<number>(550);
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [season, setSeason] = useState<number>(1);
  const [episode, setEpisode] = useState<number>(1);

  // Providers State
  const [providers, setProviders] = useState<UnifiedProviderInfo[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [probingId, setProbingId] = useState<string | null>(null);

  // Active Viewing Area State
  const [activeProviderId, setActiveProviderId] = useState<ExternalAdapterId>('embedwave');
  const [sandboxEnabled, setSandboxEnabled] = useState<boolean>(true); // default on for security isolation
  const [iframeKey, setIframeKey] = useState<number>(1);
  const [postMessageEvents, setPostMessageEvents] = useState<string[]>([]);

  // Manual QA State (stored in localStorage)
  const [qaRecords, setQaRecords] = useState<Record<string, ProviderManualQACheck>>({});
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  // Load saved QA from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kinoroom_qa_providers_results');
      if (saved) {
        setQaRecords(JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Failed to parse saved QA records:', e);
    }
  }, []);

  // Save QA helper
  const updateQa = (providerId: ExternalAdapterId, patch: Partial<ProviderManualQACheck>) => {
    setQaRecords((prev) => {
      const current = prev[providerId] || { ...DEFAULT_QA, providerId };
      const updated = {
        ...current,
        ...patch,
        testedAt: new Date().toISOString()
      };
      const next = { ...prev, [providerId]: updated };
      try {
        localStorage.setItem('kinoroom_qa_providers_results', JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save QA records:', e);
      }
      return next;
    });
  };

  // Fetch Providers metadata
  const fetchProviders = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        tmdbId: String(tmdbId),
        type: mediaType,
        season: String(season),
        episode: String(episode)
      });
      const res = await fetch(`/api/playback/providers?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.providers)) {
        setProviders(data.providers);
      }
    } catch (e) {
      console.error('Fetch providers error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [tmdbId, mediaType, season, episode]);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders]);

  // Live probe single provider
  const handleProbe = async (id: ExternalAdapterId) => {
    setProbingId(id);
    try {
      const params = new URLSearchParams({
        tmdbId: String(tmdbId),
        type: mediaType,
        season: String(season),
        episode: String(episode),
        providerId: id,
        probe: 'true'
      });
      const res = await fetch(`/api/playback/providers?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.success && data.provider) {
        setProviders((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...data.provider } : p))
        );
      }
    } catch (e: any) {
      console.error('Probe error:', e);
    } finally {
      setProbingId(null);
    }
  };

  // PostMessage event listener for VidLink, VixSrc, etc.
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.origin || typeof e.origin !== 'string') return;

      // Validate trusted domain
      let isTrusted = false;
      try {
        const hostname = new URL(e.origin).hostname.toLowerCase();
        isTrusted = TRUSTED_IFRAME_DOMAINS.some(
          (d) => hostname === d || hostname.endsWith(`.${d}`)
        );
      } catch {
        return;
      }

      if (!isTrusted) return;

      const data = e.data;
      if (!data) return;

      const timeStr = new Date().toLocaleTimeString();
      let eventSummary = '';

      if (typeof data === 'object') {
        if (data.type) {
          eventSummary = `[${e.origin}] type: ${data.type} ${data.currentTime ? `(time: ${Math.round(data.currentTime)}s)` : ''}`;
        } else if (data.event) {
          eventSummary = `[${e.origin}] event: ${data.event}`;
        } else {
          eventSummary = `[${e.origin}] data: ${JSON.stringify(data).slice(0, 80)}`;
        }
      } else if (typeof data === 'string') {
        eventSummary = `[${e.origin}] msg: ${data.slice(0, 80)}`;
      }

      if (eventSummary) {
        setPostMessageEvents((prev) => [
          `${timeStr} - ${eventSummary}`,
          ...prev.slice(0, 19)
        ]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const activeProvider = providers.find((p) => p.id === activeProviderId);
  const activeQa = qaRecords[activeProviderId] || { ...DEFAULT_QA, providerId: activeProviderId };

  // Copy full QA report as markdown
  const copyFullReport = () => {
    let md = `# KinoRoom QA: Отчет тестирования 7 видеопровайдеров\n`;
    md += `Дата: ${new Date().toLocaleString()}\n`;
    md += `Тестовый тайтл: TMDB ${tmdbId} (${mediaType}${mediaType === 'tv' ? ` S${season}:E${episode}` : ''})\n\n`;

    md += `| Провайдер | Статус API | Воспроизведение | Без рекламы | Рус. язык | iPhone | Комментарий |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    providers.forEach((p) => {
      const qa = qaRecords[p.id];
      const plays = qa?.videoPlays ? '✅ Да' : '❌ Нет';
      const noAds = qa?.hasAds === false && qa?.testedAt ? '✅ Без рекламы' : qa?.hasAds ? '❌ Реклама' : '⚠️ Не проверено';
      const ru = qa?.hasRussianAudio ? '✅ Есть' : '❌ Нет';
      const iphone = qa?.worksOnIPhone ? '✅ Да' : '❌ Нет';
      const comment = qa?.comment || p.errorReason || '-';

      md += `| **${p.name}** | ${p.availabilityStatus} | ${plays} | ${noAds} | ${ru} | ${iphone} | ${comment} |\n`;
    });

    navigator.clipboard.writeText(md).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2500);
    });
  };

  return (
    <div className="min-h-screen bg-[#0b0d14] text-gray-200 pb-20 selection:bg-red-500 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#0b0d14]/90 backdrop-blur-md border-b border-white/10 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/player-test"
              className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Назад в тест-лабораторию"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-red-500 font-black text-sm tracking-wide">KINOROOM</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-600/20 text-red-400 border border-red-500/30 font-bold">
                  ШАГ 2D: ЛАБОРАТОРИЯ 7 ИСТОЧНИКОВ
                </span>
              </div>
              <h1 className="text-xs text-gray-400 font-medium">
                Анализ и ручная проверка рекламы, Safari iPhone и потоков
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyFullReport}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                copySuccess
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-white/10 hover:bg-white/15 text-white border-white/10'
              }`}
            >
              {copySuccess ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copySuccess ? 'Скопировано!' : 'Скопировать все результаты'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {/* SECTION A: Выбор фильма / сериала и пресеты */}
        <section className="bg-[#13151f] p-4 sm:p-5 rounded-2xl border border-white/10 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Film className="w-4 h-4 text-red-500" />
              <span>Тестовый тайтл для проверки провайдеров</span>
            </div>
            <div className="text-xs text-gray-400">
              Маршруты собираются строго по спецификациям TMDB ID
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 font-semibold px-1">Пресеты:</span>
            {PRESETS.map((preset) => {
              const isCurrent =
                tmdbId === preset.tmdbId &&
                mediaType === preset.type &&
                (preset.type === 'movie' || (season === preset.season && episode === preset.episode));

              return (
                <button
                  key={preset.id}
                  onClick={() => {
                    setTmdbId(preset.tmdbId);
                    setMediaType(preset.type);
                    if (preset.season) setSeason(preset.season);
                    if (preset.episode) setEpisode(preset.episode);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                    isCurrent
                      ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30'
                      : 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border-white/5'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          {/* Custom Input Form */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">TMDB ID</label>
              <input
                type="number"
                value={tmdbId}
                onChange={(e) => setTmdbId(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                placeholder="550"
              />
            </div>

            <div>
              <label className="block text-[11px] text-gray-400 font-semibold mb-1">Тип медиа</label>
              <div className="flex rounded-xl bg-black/40 border border-white/10 p-0.5">
                <button
                  onClick={() => setMediaType('movie')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    mediaType === 'movie' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Фильм
                </button>
                <button
                  onClick={() => setMediaType('tv')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    mediaType === 'tv' ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Сериал
                </button>
              </div>
            </div>

            {mediaType === 'tv' && (
              <>
                <div>
                  <label className="block text-[11px] text-gray-400 font-semibold mb-1">Сезон</label>
                  <input
                    type="number"
                    min={1}
                    value={season}
                    onChange={(e) => setSeason(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-400 font-semibold mb-1">Серия</label>
                  <input
                    type="number"
                    min={1}
                    value={episode}
                    onChange={(e) => setEpisode(parseInt(e.target.value, 10) || 1)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </>
            )}
          </div>
        </section>

        {/* SECTION C: Область просмотра (Один активный iframe с размонтированием) */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#13151f] p-3 rounded-2xl border border-white/10 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-white font-bold text-sm">
                Активный плеер: {activeProvider?.name || 'Не выбран'}
              </span>
              {activeProvider?.badge && (
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-gray-300 font-medium">
                  {activeProvider.badge}
                </span>
              )}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setSandboxEnabled((prev) => !prev);
                  setIframeKey((k) => k + 1);
                }}
                title="Переключить sandbox (песочницу)"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  sandboxEnabled
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                }`}
              >
                {sandboxEnabled ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>
                  {sandboxEnabled ? 'Песочница: ВКЛ (Блок рекламы)' : 'Песочница: ВЫКЛ (Safari)'}
                </span>
              </button>

              <button
                onClick={() => setIframeKey((k) => k + 1)}
                title="Перезагрузить плеер"
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer border border-white/5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              {activeProvider?.embedUrl && (
                <a
                  href={activeProvider.embedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all cursor-pointer border border-white/10"
                >
                  <span>Открыть отдельно</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          {/* Active Iframe Container */}
          <div className="relative w-full aspect-video min-h-[260px] sm:min-h-[380px] md:min-h-[500px] bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex items-center justify-center">
            {activeProvider && activeProvider.availabilityStatus === 'AVAILABLE' && activeProvider.embedUrl ? (
              /* UNMOUNTING GUARANTEE: Exactly 1 iframe in DOM, replaced cleanly when switching */
              <iframe
                key={`${activeProvider.id}-${iframeKey}-${tmdbId}-${mediaType}-${season}-${episode}-${sandboxEnabled}`}
                src={activeProvider.embedUrl}
                title={activeProvider.name}
                className="w-full h-full border-0 absolute inset-0"
                referrerPolicy="origin"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
                sandbox={
                  sandboxEnabled
                    ? 'allow-scripts allow-same-origin allow-forms allow-modals allow-presentation'
                    : undefined
                }
              />
            ) : (
              /* Honest Diagnostic Explanation Card instead of infinite black screen */
              <div className="flex flex-col items-center justify-center p-6 text-center max-w-lg space-y-3 z-10">
                <div className="w-12 h-12 rounded-2xl bg-red-600/10 border border-red-500/20 flex items-center justify-center text-red-400">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h4 className="text-white font-bold text-base">
                  {activeProvider?.name || 'Источник'}: {activeProvider?.availabilityStatus || 'Недоступен'}
                </h4>
                <p className="text-gray-400 text-xs leading-relaxed">
                  {activeProvider?.errorReason ||
                    activeProvider?.diagnostics ||
                    'Данный сервис не отвечает по сети или не предоставляет работоспособный маршрут для встраивания.'}
                </p>
                <div className="text-[11px] text-gray-500 font-mono pt-2">
                  URL: {activeProvider?.embedUrl || activeProvider?.homepage || 'отсутствует'}
                </div>
              </div>
            )}
          </div>

          {/* Live PostMessage Console Log */}
          {postMessageEvents.length > 0 && (
            <div className="bg-[#13151f] p-3 rounded-2xl border border-white/5 space-y-1.5">
              <div className="text-[11px] text-gray-400 font-semibold flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>События плеера (postMessage):</span>
              </div>
              <div className="font-mono text-[10px] text-gray-300 max-h-24 overflow-y-auto space-y-0.5">
                {postMessageEvents.map((evt, idx) => (
                  <div key={idx} className="text-emerald-400/90">{evt}</div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* SECTION D: Чеклист ручной проверки для iPhone */}
        <section className="bg-[#13151f] p-4 sm:p-6 rounded-2xl border border-white/10 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Чеклист ручной проверки: {activeProvider?.name}</span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  iPhone Safari QA
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Оценки сохраняются локально и не подменяют автоматическую диагностику
              </p>
            </div>
            {activeQa.testedAt && (
              <span className="text-[11px] text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Проверено: {new Date(activeQa.testedAt).toLocaleTimeString()}</span>
              </span>
            )}
          </div>

          {/* Checklist Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { key: 'videoPlays', label: '1. Видео воспроизводится' },
              { key: 'correctMovie', label: '2. Правильный фильм' },
              { key: 'hasRussianAudio', label: '3. Есть русский язык' },
              { key: 'seekWorks', label: '4. Работает перемотка' },
              { key: 'fullscreenWorks', label: '5. Работает Fullscreen' },
              { key: 'hasAds', label: '6. Есть реклама (Внимание!)' },
              { key: 'opensNewTabs', label: '7. Открывает новые вкладки' },
              { key: 'worksOnIPhone', label: '8. Работает на iPhone' }
            ].map(({ key, label }) => {
              const val = Boolean((activeQa as any)[key]);
              const isDanger = key === 'hasAds' || key === 'opensNewTabs';

              return (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-xs"
                >
                  <span className="text-gray-300 font-medium pr-2">{label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQa(activeProviderId, { [key]: true })}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                        val
                          ? isDanger
                            ? 'bg-red-600 text-white'
                            : 'bg-emerald-600 text-white'
                          : 'bg-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      Да
                    </button>
                    <button
                      onClick={() => updateQa(activeProviderId, { [key]: false })}
                      className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all cursor-pointer ${
                        !val
                          ? isDanger
                            ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-950/40 text-red-400 border border-red-500/30'
                          : 'bg-white/5 text-gray-400 hover:text-white'
                      }`}
                    >
                      Нет
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Comment Field */}
          <div>
            <label className="block text-xs text-gray-400 font-semibold mb-1">
              Заметки по провайдеру (поведение на iPhone, плеер, озвучки):
            </label>
            <input
              type="text"
              value={activeQa.comment || ''}
              onChange={(e) => updateQa(activeProviderId, { comment: e.target.value })}
              placeholder="Например: звук чистый, но при клике на Play открывается вкладка казино..."
              className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
            />
          </div>
        </section>

        {/* SECTION B: Панель всех 7 провайдеров (Карточки с полной информацией) */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-red-500" />
                <span>Все 7 кандидатов видеоисточников</span>
              </h2>
              <p className="text-xs text-gray-400">
                Техническая проверка сетевой доступности, заявлений об отсутствии рекламы и прав
              </p>
            </div>
            <button
              onClick={fetchProviders}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 transition-all cursor-pointer border border-white/5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Обновить всех</span>
            </button>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-gray-400 space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin mx-auto" />
              <p className="text-xs">Загрузка информации о 7 провайдерах...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {providers.map((p) => {
                const isSelected = activeProviderId === p.id;
                const qa = qaRecords[p.id];
                const isProbing = probingId === p.id;

                const isAvail = p.availabilityStatus === 'AVAILABLE';
                const isKeyReq = p.availabilityStatus === 'REQUIRES_KEY';

                return (
                  <div
                    key={p.id}
                    data-testid={`provider-card-${p.id}`}
                    className={`rounded-2xl p-5 border transition-all flex flex-col justify-between space-y-4 ${
                      isSelected
                        ? 'bg-[#181a27] border-red-500/80 shadow-lg shadow-red-600/10 ring-1 ring-red-500/50'
                        : 'bg-[#13151f] border-white/10 hover:border-white/20'
                    }`}
                  >
                    {/* Top Row: Title, Link & Status Badges */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-white">{p.name}</h3>
                            <a
                              href={p.homepage}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-500 hover:text-gray-300 transition-colors"
                              title="Открыть главную страницу"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>
                          <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                            {p.homepage}
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`text-[10px] px-2.5 py-1 rounded-full font-bold border uppercase tracking-wider ${
                            isAvail
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : isKeyReq
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-red-500/20 text-red-300 border-red-500/30'
                          }`}
                        >
                          {p.availabilityStatus}
                        </span>
                      </div>

                      {/* Attribute Pills */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span
                          className={`px-2 py-0.5 rounded border ${
                            p.claimedAdFree
                              ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                              : 'bg-white/5 text-gray-400 border-white/10'
                          }`}
                        >
                          {p.claimedAdFree ? 'Заявлен No Ads' : 'Реклама не отрицается'}
                        </span>

                        <span className="px-2 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10">
                          {p.supportedPlaybackMode === 'iframe' ? 'Iframe Embed' : 'Не поддерживается'}
                        </span>

                        {qa?.hasAds !== undefined && (
                          <span
                            className={`px-2 py-0.5 rounded font-bold border ${
                              qa.hasAds
                                ? 'bg-red-500/20 text-red-300 border-red-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            }`}
                          >
                            {qa.hasAds ? 'Реклама найдена' : 'Ручной тест: чисто'}
                          </span>
                        )}
                      </div>

                      {/* Description & Diagnostics */}
                      <p className="text-xs text-gray-400 leading-relaxed line-clamp-2">
                        {p.description}
                      </p>

                      {p.diagnostics && (
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] text-gray-300 flex items-start gap-2">
                          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span className="leading-tight">{p.diagnostics}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="pt-2 border-t border-white/5 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => {
                          setActiveProviderId(p.id);
                          setIframeKey((k) => k + 1);
                        }}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                            : 'bg-white/10 hover:bg-white/15 text-white'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isSelected ? 'Активен' : 'Открыть плеер'}</span>
                      </button>

                      <button
                        onClick={() => handleProbe(p.id)}
                        disabled={isProbing}
                        title="Проверить сетевой статус"
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer border border-white/5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isProbing ? 'animate-spin' : ''}`} />
                      </button>

                      {p.embedUrl && (
                        <a
                          href={p.embedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Открыть напрямую в новой вкладке"
                          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer border border-white/5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import { Magnet, Upload, Play, Search, Radio, FileVideo, Sparkles, AlertCircle } from 'lucide-react';
import { TorrentPlayer } from '@/components/player/TorrentPlayer';
import { TorrentSearchResult } from '@/lib/types';

export default function TorrentHubPage() {
  const [magnetInput, setMagnetInput] = useState('');
  const [activeMagnet, setActiveMagnet] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TorrentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStartStream = (magnet: string) => {
    if (!magnet.trim()) return;
    setErrorMsg(null);
    setActiveMagnet(magnet.trim());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/torrent/search?q=${encodeURIComponent(searchQuery.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
        if (data.length === 0) {
          setErrorMsg('Раздач по данному запросу не найдено.');
        }
      }
    } catch {
      setErrorMsg('Ошибка поиска торрентов');
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processTorrentFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith('.torrent')) {
      processTorrentFile(file);
    } else {
      setErrorMsg('Пожалуйста, перетащите файл с расширением .torrent');
    }
  };

  const processTorrentFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        // Import parse-torrent if needed or send to server
        // For simplicity, we can convert buffer to base64 or send raw to an upload endpoint
        const base64 = btoa(
          new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        const res = await fetch('/api/torrent/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileData: base64, fileName: file.name })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.magnet) {
            handleStartStream(data.magnet);
          }
        }
      } catch (err) {
        console.error('File process error:', err);
        setErrorMsg('Не удалось прочитать .torrent файл');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="min-h-screen pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Title Header */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold mb-4">
          <Magnet className="w-3.5 h-3.5 animate-pulse" />
          <span>Прямой потоковый торрент-движок</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
          Торрент-плеер без скачивания на диск
        </h1>
        <p className="text-gray-400 text-sm sm:text-base mt-3">
          Вставьте любую magnet-ссылку, перетащите файл раздачи или найдите фильм в открытых базах трекеров.
          Видео начнет воспроизводиться в плеере сразу, пока качаются нужные блоки.
        </p>
      </div>

      {/* Active Stream Player */}
      {activeMagnet && (
        <div className="mb-12">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" /> Текущая трансляция
            </h2>
            <button
              onClick={() => setActiveMagnet(null)}
              className="text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              Закрыть плеер
            </button>
          </div>
          <TorrentPlayer magnet={activeMagnet} />
        </div>
      )}

      {/* Input Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {/* Option 1: Direct Magnet Input */}
        <div className="bg-[#13151f] rounded-2xl p-6 border border-white/10 flex flex-col justify-between shadow-xl">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-2">
              <Magnet className="w-5 h-5 text-amber-400" /> Вставить Magnet-ссылку
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              Скопируйте ссылку формата <code className="text-amber-400">magnet:?xt=urn:btih:...</code> с любого трекера
            </p>
            <textarea
              value={magnetInput}
              onChange={(e) => setMagnetInput(e.target.value)}
              placeholder="Вставьте magnet-ссылку сюда..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 font-mono resize-none mb-4"
            />
          </div>
          <button
            onClick={() => handleStartStream(magnetInput)}
            disabled={!magnetInput.trim()}
            className="w-full bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Запустить трансляцию</span>
          </button>
        </div>

        {/* Option 2: Drag & Drop .torrent file */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`rounded-2xl p-6 border-2 border-dashed flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
            dragOver
              ? 'border-amber-400 bg-amber-500/10'
              : 'border-white/10 bg-[#13151f] hover:border-white/20'
          }`}
        >
          <Upload className="w-10 h-10 text-gray-400 mb-3" />
          <h3 className="text-base font-bold text-white mb-1">
            Перетащите .torrent файл сюда
          </h3>
          <p className="text-xs text-gray-400 max-w-xs mb-4">
            или выберите файл на вашем компьютере для мгновенного запуска в плеере
          </p>
          <label className="bg-white/10 hover:bg-white/20 text-white font-medium text-xs px-4 py-2.5 rounded-xl cursor-pointer transition-colors border border-white/10">
            Выбрать файл
            <input
              type="file"
              accept=".torrent"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Option 3: Search Torrents */}
      <div className="bg-[#13151f] rounded-2xl p-6 border border-white/10 shadow-xl">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
          <Search className="w-5 h-5 text-red-500" /> Поиск торрентов в открытых базах
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Введите название фильма или сериала для поиска раздач в 1080p, 4K или BDRip
        </p>

        <form onSubmit={handleSearch} className="flex gap-3 mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Например: Дюна 2, Оппенгеймер, Во все тяжкие..."
            className="flex-grow bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={isSearching || !searchQuery.trim()}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
          >
            {isSearching ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span>Найти</span>
          </button>
        </form>

        {errorMsg && (
          <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-red-400 text-xs mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Results */}
        {searchResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Результаты поиска ({searchResults.length})
            </h4>
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {searchResults.map((t, idx) => (
                <div
                  key={idx}
                  onClick={() => handleStartStream(t.magnet)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-white/5 border border-white/5 hover:border-amber-400/50 hover:bg-white/10 transition-all cursor-pointer group"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-black/60 text-amber-400 border border-amber-500/30 flex-shrink-0 mt-0.5">
                      {t.quality || 'HD'}
                    </span>
                    <span className="text-sm font-medium text-gray-200 group-hover:text-amber-300 transition-colors line-clamp-1">
                      {t.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-400 mt-2 sm:mt-0 flex-shrink-0">
                    <span className="text-gray-300 font-semibold">{t.size}</span>
                    <span className="text-emerald-400 font-medium">{t.seeds} сидов</span>
                    <button className="bg-amber-500/20 group-hover:bg-amber-500 text-amber-300 group-hover:text-black font-bold px-3 py-1 rounded-lg text-xs transition-colors flex items-center gap-1">
                      <Play className="w-3 h-3 fill-current" /> Стримить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

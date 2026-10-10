'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Bookmark, History, Play, Trash2 } from 'lucide-react';
import { MediaCard } from '@/components/MediaCard';
import { Media } from '@/lib/types';
import {
  getActiveProfileId,
  getBookmarks,
  getHistory,
  WatchProgress,
  getProfiles
} from '@/lib/storage';

export default function BookmarksPage() {
  const [activeTab, setActiveTab] = useState<'bookmarks' | 'history'>('bookmarks');
  const [bookmarks, setBookmarks] = useState<Media[]>([]);
  const [history, setHistory] = useState<WatchProgress[]>([]);
  const [profileName, setProfileName] = useState('Профиль');

  useEffect(() => {
    const profileId = getActiveProfileId();
    const profiles = getProfiles();
    const current = profiles.find((p) => p.id === profileId);
    if (current) setProfileName(current.name);

    setBookmarks(getBookmarks(profileId));
    setHistory(getHistory(profileId));
  }, []);

  const formatTime = (seconds: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-white">Моя библиотека</h1>
          <p className="text-sm text-gray-400 mt-1">
            Профиль: <span className="text-red-400 font-semibold">{profileName}</span>
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10 w-fit">
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'bookmarks'
                ? 'bg-amber-500 text-black shadow-lg font-bold'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" /> Буду смотреть ({bookmarks.length})
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'bg-red-600 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" /> История ({history.length})
          </button>
        </div>
      </div>

      {/* Bookmarks Tab */}
      {activeTab === 'bookmarks' && (
        <>
          {bookmarks.length === 0 ? (
            <div className="text-center py-20 bg-[#13151f] rounded-2xl border border-white/5">
              <Bookmark className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-300 mb-1">Закладок пока нет</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto mb-6">
                Нажимайте кнопку «Буду смотреть» на страницах фильмов и сериалов, чтобы сохранить их здесь.
              </p>
              <Link
                href="/"
                className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-colors"
              >
                Перейти в каталог
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {bookmarks.map((item) => (
                <div key={`${item.type}-${item.id}`} className="flex justify-center">
                  <MediaCard media={item} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <>
          {history.length === 0 ? (
            <div className="text-center py-20 bg-[#13151f] rounded-2xl border border-white/5">
              <History className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-gray-300 mb-1">История просмотров пуста</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Здесь будут отображаться фильмы и сериалы, которые вы начали смотреть.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {history.map((h, idx) => (
                <Link
                  key={idx}
                  href={`/title/${h.media.type}/${h.media.id}`}
                  className="flex gap-4 p-3 bg-[#13151f] hover:bg-white/5 border border-white/5 hover:border-white/20 rounded-xl transition-all group"
                >
                  <img
                    src={h.media.poster}
                    alt={h.media.title}
                    className="w-16 h-24 object-cover rounded-lg flex-shrink-0"
                  />
                  <div className="flex flex-col justify-between flex-grow py-1">
                    <div>
                      <h4 className="text-sm font-semibold text-white group-hover:text-red-400 transition-colors line-clamp-1">
                        {h.media.title}
                      </h4>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {h.season && `Сезон ${h.season}, Серия ${h.episode || 1} • `}
                        {h.media.year}
                      </p>
                    </div>

                    <div>
                      <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mb-1.5">
                        <div
                          className="bg-red-600 h-full rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(((h.currentTime || 0) / (h.duration || 1)) * 100)
                            )}%`
                          }}
                        />
                      </div>
                      <div className="text-[11px] text-gray-400 flex items-center justify-between">
                        <span>Остановились на {formatTime(h.currentTime)}</span>
                        <span className="text-red-400 font-semibold group-hover:underline flex items-center gap-1">
                          <Play className="w-3 h-3 fill-current" /> Продолжить
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

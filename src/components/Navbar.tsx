'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Film, Tv, Magnet, Bookmark, User, ChevronDown, Play } from 'lucide-react';
import { getProfiles, getActiveProfileId, setActiveProfileId, UserProfile } from '@/lib/storage';

export function Navbar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const list = getProfiles();
    setProfiles(list);
    const activeId = getActiveProfileId();
    const found = list.find((p) => p.id === activeId) || list[0];
    setActiveProfile(found);

    const onScroll = () => {
      setScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    setIsSearchOpen(false);
  };

  const handleSelectProfile = (p: UserProfile) => {
    setActiveProfileId(p.id);
    setActiveProfile(p);
    setIsProfileOpen(false);
    window.location.reload();
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[#090a0f]/95 backdrop-blur-md shadow-2xl py-3 border-b border-white/5' : 'bg-gradient-to-b from-[#090a0f] via-[#090a0f]/80 to-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="text-2xl font-black tracking-wider text-red-600 group-hover:scale-105 transition-transform">
              КИНО<span className="text-white">РУМ</span>
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 border border-red-500/30">
              PRO
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <Link href="/" className="text-gray-300 hover:text-white transition-colors">
              Главная
            </Link>
            <Link href="/catalog?type=movie" className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors">
              <Film className="w-4 h-4 text-red-500" /> Фильмы
            </Link>
            <Link href="/catalog?type=tv" className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors">
              <Tv className="w-4 h-4 text-red-500" /> Сериалы
            </Link>
            <Link
              href="/torrent"
              className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 font-semibold transition-colors"
            >
              <Magnet className="w-4 h-4 text-amber-400 animate-pulse" /> Торрент-плеер
            </Link>
            <Link href="/bookmarks" className="flex items-center gap-1.5 text-gray-300 hover:text-white transition-colors">
              <Bookmark className="w-4 h-4" /> Закладки
            </Link>
            <Link
              href="/player-test"
              className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Тест плеера
            </Link>
          </nav>
        </div>

        {/* Right Actions: Search + Profile */}
        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Фильм, сериал, персона..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-44 sm:w-64 bg-white/5 border border-white/10 rounded-full py-1.5 pl-9 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-red-500/80 focus:bg-white/10 focus:w-72 transition-all duration-300"
              />
              <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
            </div>
          </form>

          {/* Profile Switcher */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1.5 text-xs text-white transition-all cursor-pointer"
            >
              <span className="text-base">{activeProfile?.avatar || '🎬'}</span>
              <span className="font-medium hidden sm:inline">{activeProfile?.name || 'Профиль'}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-[#13151f] border border-white/10 rounded-xl shadow-2xl py-2 z-50">
                <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Сменить профиль
                </div>
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProfile(p)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-left hover:bg-white/5 transition-colors cursor-pointer ${
                      activeProfile?.id === p.id ? 'text-red-400 font-semibold' : 'text-gray-200'
                    }`}
                  >
                    <span className="text-lg">{p.avatar}</span>
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

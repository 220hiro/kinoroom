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
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 safe-area-pt ${
        scrolled ? 'bg-[#090a0f]/95 backdrop-blur-md shadow-2xl py-2.5 sm:py-3 border-b border-white/5' : 'bg-gradient-to-b from-[#090a0f] via-[#090a0f]/80 to-transparent py-3 sm:py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center gap-2 sm:gap-8 shrink-0">
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2 group">
<span className="text-2xl font-black tracking-[0.18em] text-amber-300">КАДР<span className="text-amber-300">.</span></span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden xl:flex items-center gap-6 text-sm font-medium">
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
          </nav>
        </div>

        {/* Right Actions: Search + Profile */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="relative flex items-center">
              <input
                type="text"
                placeholder="Поиск..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Поиск фильмов и сериалов"
                className="w-24 sm:w-48 lg:w-56 bg-white/5 border border-white/10 rounded-full py-1.5 pl-6 xs:pl-7 sm:pl-9 pr-2.5 sm:pr-3 text-xs sm:text-sm text-white placeholder-gray-400 focus:outline-none focus:border-red-500/80 focus:bg-white/10 focus:w-24 sm:focus:w-48 lg:focus:w-56 transition-all duration-300"
              />
              <Search className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400 absolute left-2 sm:left-3 pointer-events-none" />
            </div>
          </form>

          {/* Profile Switcher */}
          <div className="relative">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              aria-label="Сменить профиль"
              className="flex items-center gap-1 sm:gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-2 sm:px-3 py-1.5 text-xs text-white transition-all cursor-pointer min-h-[44px]"
            >
              <span className="text-sm sm:text-base">{activeProfile?.avatar || '🎬'}</span>
              <span className="font-medium hidden sm:inline">{activeProfile?.name || 'Профиль'}</span>
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

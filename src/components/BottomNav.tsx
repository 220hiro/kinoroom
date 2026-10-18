'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Film, Magnet, Bookmark, Search } from 'lucide-react';

const NAV_ITEMS = [
  { href: '/', label: 'Главная', icon: Home },
  { href: '/catalog', label: 'Каталог', icon: Film },
  { href: '/torrent', label: 'Торренты', icon: Magnet },
  { href: '/bookmarks', label: 'Закладки', icon: Bookmark },
  { href: '/search', label: 'Поиск', icon: Search },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="xl:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#090a0f]/95 backdrop-blur-xl border-t border-white/10 px-2 py-1.5 shadow-2xl safe-area-pb">
      <div className="flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-2.5 sm:px-3 rounded-xl transition-all min-h-[44px] min-w-[44px] ${
                isActive
                  ? 'text-red-500 font-bold scale-105'
                  : 'text-gray-400 hover:text-gray-200 font-medium'
              }`}
            >
              <Icon
                className={`w-5 h-5 mb-0.5 ${
                  isActive ? 'text-red-500 stroke-[2.5]' : 'stroke-[1.75]'
                }`}
              />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

import React from 'react';
import { metadata } from '@/lib/providers/metadata';
import { HeroBanner } from '@/components/HeroBanner';
import { MediaCarousel } from '@/components/MediaCarousel';
import Link from 'next/link';
import { Magnet, Sparkles } from 'lucide-react';

import { ContinueWatching } from '@/components/ContinueWatching';

export const revalidate = 3600; // 1 hour cache

export default async function HomePage() {
  const provider = metadata();
  const sections = await provider.home();

  // Find featured media for hero banner
  const featured = sections[0]?.items[0] || sections[1]?.items[0];

  return (
    <div className="min-h-screen pb-20">
      {/* Hero Banner */}
      <HeroBanner media={featured} />

      {/* Quick Stream Callout */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-20 mb-8">
        <div className="bg-gradient-to-r from-red-950/40 via-[#13151f] to-amber-950/30 border border-white/10 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-md shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <Magnet className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Смотрите любой торрент или magnet-ссылку без скачивания
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h3>
              <p className="text-xs sm:text-sm text-gray-300">
                Вставьте magnet-ссылку, перетащите .torrent файл или найдите раздачу прямо на странице фильма.
              </p>
            </div>
          </div>
          <Link
            href="/torrent"
            className="flex-shrink-0 bg-amber-500 hover:bg-amber-600 text-black font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-amber-500/20"
          >
            Открыть Торрент-плеер
          </Link>
        </div>
      </div>

      {/* Continue Watching Section */}
      <ContinueWatching />

      {/* Media Carousels */}
      <div className="space-y-6">
        {sections.map((sec, idx) => (
          <MediaCarousel key={idx} title={sec.title} items={sec.items} />
        ))}
      </div>
    </div>
  );
}

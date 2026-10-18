import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { BottomNav } from '@/components/BottomNav';
import { AuthGuard } from '@/components/AuthGuard';

export const metadata: Metadata = {
  title: 'КАДР — твой кинозал',
  description: 'Личный кинозал: фильмы, закладки, торрент-раздачи и выбор озвучки.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'КАДР',
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#090a0f' };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-[#090a0f] text-gray-100 min-h-screen selection:bg-red-600 selection:text-white flex flex-col justify-between">
        <AuthGuard>
          <Navbar />
          <main className="flex-grow min-w-0" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>{children}</main>
          <footer className="border-t border-white/5 py-8 text-center text-xs text-gray-500 bg-[#06070a] mb-20 xl:mb-0">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-300">КАДР.</span>
                <span>• Личный онлайн-кинотеатр без плагинов</span>
              </div>
              <div className="text-gray-500">
                Твой фильм. Твой язык. Твой ритм.
              </div>
            </div>
          </footer>
          <BottomNav />
        </AuthGuard>
      </body>
    </html>
  );
}

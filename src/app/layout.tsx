import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { AuthGuard } from '@/components/AuthGuard';

export const metadata: Metadata = {
  title: 'КиноРум · Приватный онлайн-кинотеатр',
  description: 'Онлайн-кинотеатр в стиле Лампы: моментальный просмотр без плагинов, прямая трансляция любых торрентов и поиск по открытым базам.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'КиноРум PRO',
  },
};

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
          <main className="flex-grow">{children}</main>
          <footer className="border-t border-white/5 py-8 text-center text-xs text-gray-500 bg-[#06070a]">
            <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-300">КИНОРУМ PRO</span>
                <span>• Личный онлайн-кинотеатр без плагинов</span>
              </div>
              <div className="text-gray-500">
                Торрент-движок WebTorrent • Онлайн-балансеры • Kinobox
              </div>
            </div>
          </footer>
        </AuthGuard>
      </body>
    </html>
  );
}

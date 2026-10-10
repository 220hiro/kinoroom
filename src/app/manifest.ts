import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'КиноРум PRO — Онлайн-кинотеатр',
    short_name: 'КиноРум PRO',
    description: 'Приватный онлайн-кинотеатр в стиле Lampa без рекламы с торрент-стримингом и онлайн-балансерами',
    start_url: '/',
    display: 'standalone',
    background_color: '#090a0f',
    theme_color: '#090a0f',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}

# Кинотеатр (КиноРум PRO)

## What this is

Приватный онлайн-кинотеатр в стиле Лампы (Lampa), работающий «из коробки» без необходимости установки плагинов. Поддерживает прямой потоковый просмотр любых торрентов (magnet-ссылки, .torrent файлы, поиск по трекерам) и встроенные онлайн-балансеры (Kinobox, Kodik, Collaps, Alloha, MultiEmbed).

Стек: Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind CSS v4, WebTorrent, Node.js HTTP 206 partial content streaming.

## Folder map

- `src/app/` — страницы: главная (`/`), каталог (`/catalog`), поиск (`/search`), детали и плеер (`/title/[type]/[id]`), торрент-хаб (`/torrent`), закладки (`/bookmarks`).
- `src/app/api/` — API маршруты каталога, деталей, источников и потокового стриминга торрентов (`/api/torrent/stream`).
- `src/components/` — UI-компоненты (HeroBanner, MediaCard, MediaCarousel, Navbar, AuthGuard).
- `src/components/player/` — плееры: `TorrentPlayer` (стриминг торрентов со статистикой пиров и скорости), `KinoboxPlayer` (мульти-балансер).
- `src/lib/providers/` — провайдеры метаданных (TMDB + fallback open catalog).
- `src/lib/services/` — торрент-движок WebTorrent, парсер трекеров, генератор онлайн-источников, TTLCache.
- `src/lib/storage.ts` — локальное хранилище профилей пользователей, истории просмотров с таймкодами и закладок.
- `docs/` — подробная документация архитектуры.
- `.ai/HANDOFF.md` — текущее состояние работы.

## Commands

- Запуск dev-сервера: `npm run dev`
- Сборка: `npm run build`
- Запуск production: `npm run start`
- Проверка типов: `npm run typecheck`

## Rules and gotchas

- Не сохранять секреты в документации и handoff.
- При изменении структуры, команд или ограничений актуализировать эту карту.
- `webtorrent` и нативные биндинги должны быть в `serverExternalPackages` в `next.config.ts`.
- Браузерные утилиты форматирования должны находиться в `src/lib/utils.ts`, а не импортироваться из серверных сервисов.

## Docs

- [AI context](docs/AI_CONTEXT.md)
- [Architecture](docs/ARCHITECTURE.md)

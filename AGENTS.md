# KinoRoom (КиноРум) — Руководство для AI-агентов (Codex)

## Цель проекта
Личный веб-кинотеатр для владельца и друзей с чистым интерфейсом без рекламы, стабильным собственным плеером (KinoRoomPlayer), прямым торрент-стримингом, поддержкой реальных аудиодорожек и автоматическими русскими субтитрами (SubDL + OpenSubtitles).

## Ветки и окружения
- **Рабочая ветка**: `feature/playback-api-player` (все изменения делать ТОЛЬКО в ней).
- **Master и Production**: `master` и `https://kinoroom.vercel.app` — СТРОГО НЕ ТРОГАТЬ.
- **Vercel Preview**: разворачивается автоматически при пуше в `feature/playback-api-player`. Всегда проверять соответствие опубликованного деплоя текущему commit SHA.
- **Ограничения сред**: Vercel Serverless среды не поддерживают долгоживущие TCP/UDP соединения для торрент-роя; локальный/VPS Docker запуск с TorrServer обеспечивает полный торрент-стриминг.

## Технологический стек
- **Frontend / Fullstack**: Next.js 16 (App Router, Turbopack, standalone output), React 19, TypeScript 5.9, Tailwind CSS v4.
- **Плеер**: HTML5 Video + `hls.js`, кастомный UI в стиле KinoRoom, WebVTT оверлеи.
- **Торренты**: WebTorrent, TorrServer REST API, HTTP 206 Partial Content стриминг.
- **Метаданные**: TMDB API + fallback каталог.
- **Субтитры**: SubDL API v2 (основной) + OpenSubtitles REST API v1 (резервный) + ExternalSubtitleEngine (SRT/VTT парсер, UTF-8/CP1251, fflate ZIP-распаковка).
- **Тесты**: Node.js test runner (`tsx --test tests/*.test.ts`) + Playwright Chromium (`@playwright/test`).

## Карта компонентов и директорий
- `src/app/` — страницы: главная (`/`), каталог (`/catalog`), поиск (`/search`), детали фильма и плееры (`/title/[type]/[id]`), торрент-раздел (`/torrent`), закладки (`/bookmarks`), тестовая HLS-лаборатория (`/player-test`).
- `src/app/api/` — серверные API:
  - `/api/playback/resolve` — резолвер видеопотока (Playback API).
  - `/api/playback/subtitles/subdl` & `/api/playback/subtitles/opensubtitles` — автоматические субтитры.
  - `/api/torrent/stream` & `/api/torrent/search` — торрент-движок и трекеры.
- `src/components/player/`:
  - `KinoRoomPlayer.tsx` — нативный плеер (HTML5 + Hls.js, кастомные контролы, полноэкранный режим).
  - `TorrentPlayer.tsx` — плеер торрентов со статистикой пиров, буферизации и скорости.
  - `OnlinePlayer.tsx` — плеер с автоматическими субтитрами и внешним fallback источником EmbedWave.
- `src/lib/services/`:
  - `subdl.ts` — клиент SubDL v2.
  - `openSubtitles.ts` — клиент OpenSubtitles v1 с кэшированием и SSRF-защитой.
  - `torrents.ts` — движок WebTorrent.
- `src/lib/playback/`:
  - `externalSubtitleEngine.ts` — движок субтитров (парсинг, синхронизация, сдвиг таймингов -60..+60с).
  - `registry.ts` & `types.ts` — PlaybackRegistry и типы запросов/ответов.
- `docs/` — архитектура (`ARCHITECTURE.md`), извлечённые уроки (`LESSONS_LEARNED.md`), развертывание (`DEPLOYMENT.md`).
- `docs/STREAMING_DIAGNOSTICS.md` — схема streaming engine и короткий локальный тест; `scripts/playback-probe.js` — DevTools probe; `src/lib/services/torrentDiagnostics.ts` — локальные метрики WebTorrent (KINOROOM_STREAM_DIAGNOSTICS=1, отключены в production).
- `/torrent-pilot` и `/api/torrent/hls-pilot/*` — локальные короткий VOD и progressive 90-минутный MKV fixtures; только KINOROOM_HLS_PILOT=1, всегда отключены на Vercel. `scripts/torrent-hls-pilot.mjs`: TCP loopback → FFmpeg → HLS.
- `src/lib/services/torrentHls.ts` и `/api/torrent/hls/[...path]` — динамический HLS-конвейер реальных торрентов: WebTorrent TCP loopback → FFmpeg fMP4 HLS remuxer с поддержкой Range холодной перемотки, зондированием кодеков `ffprobe` (тег `hvc1` для iOS HEVC), стерео AAC звуком и нативным полноэкранным режимом `webkitEnterFullscreen`.
- `src/lib/playback/torrentRangeReader.ts` и `progressiveHls.ts` — bounded torrent reader и старт по завершённым сегментам для пилота; обычный raw route не использует bounded reader.
- `HANDOFF.md` и `.ai/HANDOFF.md` — одинаковая текущая передача; `ANTIGRAVITY_START.md` — вход для продолжения в Antigravity и точные локальные команды.


## Команды проекта
- Проверка типов: `npm run typecheck`
- Запуск unit-тестов: `npm test`
- Запуск Playwright E2E после build: `npx playwright test --project=chromium` (собственный production-сервер на порту 3002, без переиспользования dev; порт меняется через PLAYWRIGHT_PORT).
- Сборка production-билда: `npm run build`
- Dev-сервер: `npm run dev`
- Production-сервер: `npm run start`

## Жёсткие правила для агента (Guardrails)
1. **Запрет рекламных iframe как целевой архитектуры**: Не создавать новые iframe-плееры (эксперимент 2G с прямым CineSrc провалился из-за рекламы на iPhone). Цель проекта — оптимизация собственного плеера и прямого видеопотока.
2. **Честность UI и API**: Запрещено имитировать наличие 1080p/4K, если качество не подтверждено. Запрещено обещать русскую озвучку, если дорожка не проверена. Запрещено заявлять «без рекламы» для сторонних источников. Запрещено подменять неизвестный TMDB ID демонстрационным фильмом (строго HTTP 404 `SOURCE_UNAVAILABLE`).
3. **Безопасность секретов**: Никаких секретов в коде, коммитах, документации или ответах пользователю. `SUBDL_API_KEY` и `OPENSUBTITLES_API_KEY` — строго серверные переменные окружения без префикса `NEXT_PUBLIC_`.
4. **Запрет массовых переписываний**: Не ломать работающие компоненты (TMDB каталог, закладки, историю, SubDL/OpenSubtitles каскад, нативный HLS-плеер). Не делать масштабных рефакторингов без доказанной необходимости.
5. **Обязательная проверка реального состояния**: Всегда выполнять `git status` и читать файлы перед принятием решений. Не полагаться на предположения.
6. **Обязательная верификация на iPhone**: Любые изменения плеера и субтитров требуют тестирования на реальном Safari iOS (поведение QuickTime AVPlayer, inline vs fullscreen, user-gesture тачи).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

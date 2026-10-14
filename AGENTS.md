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
- `HANDOFF.md` и `.ai/HANDOFF.md` — актуальное состояние и непосредственная задача для Codex.

## Команды проекта
- Проверка типов: `npm run typecheck`
- Запуск unit-тестов: `npm test`
- Запуск Playwright E2E: `npx playwright test --project=chromium`
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

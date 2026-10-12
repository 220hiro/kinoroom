# Handoff

Updated: 2026-10-12

## Current goal

Реализована и протестирована архитектура воспроизведения в стиле AnimeOn для онлайн-кинотеатра «КиноРум PRO»:
Каталог → Playback API (`POST /api/playback/resolve`) → MediaProvider Registry → собственный видеоплеер `KinoRoomPlayer` (Hls.js + Safari HTML5).
Плеер работает прямо на Vercel без рекламы, без внешних iframes и без обязательного наличия VPS/TorrServer.

## Done

- **Playback API & Слой провайдеров (`src/lib/playback/`)**:
  - `types.ts`: строгие контракты `PlaybackRequest`, `PlaybackResponse`, `PlaybackSource`, `PlaybackTranslation`, `PlaybackAudioTrack`, `PlaybackSubtitle`, `PlaybackQuality`, а также валидация Zod `PlaybackRequestSchema`.
  - `registry.ts`: модульный реестр провайдеров `MediaProviderRegistry` с автоматическим fallback и приоритетной маршрутизацией.
  - `providers/demoProvider.ts`: лицензированные, 100% рабочие открытые HLS-потоки (Tears of Steel, Big Buck Bunny, Sintel/Apple Advanced) с многобитрейтным качеством, аудиодорожками и VTT субтитрами.
  - `providers/torrServerProvider.ts`: адаптер для опционального TorrServer (активируется только при наличии `TORRSERVER_URL`, не блокирует основной просмотр и не спамит запросами при отсутствии сервера).
  - `src/app/api/playback/resolve/route.ts`: серверный эндпоинт разрешения потоков с защитой от SSRF и валидацией Zod.
  - `src/app/api/playback/translations/route.ts`: эндпоинт получения доступных вариантов озвучек.
- **Собственный плеер `KinoRoomPlayer` (`src/components/player/KinoRoomPlayer.tsx`)**:
  - Полностью убрана зависимость от рекламных iframes (VidSrc, MultiEmbed и др.).
  - Чистый HTML5 + `hls.js` (`^1.7.3`) с поддержкой Safari iOS (`webkitEnterFullscreen`).
  - Переключение озвучек / переводов с сохранением текущего таймкода фильма.
  - Мгновенное переключение аудиодорожек внутри HLS-манифеста без перезагрузки видео.
  - Переключение VTT-субтитров.
  - Выбор качества видео (Авто / 1080p / 720p / 480p / 360p).
  - Буферизация, таймкоды, перемотка, сохранение прогресса в `localStorage`.
- **Интерфейс и страницы**:
  - `src/app/player-test/page.tsx`: сервисная страница тестирования и демонстрации плеера с выбором тестовых HLS-лент и логом событий.
  - `src/app/title/[type]/[id]/page.tsx`: вкладка «Плеер КиноРум» подключена к Playback API по умолчанию, с возможностью запуска тестового потока и переключения на торренты/балансеры.
  - `src/components/Navbar.tsx`: добавлена ссылка на «Тест плеера».
- **Тесты (`tests/playback.test.ts`)**:
  - 5 автоматизированных тестов (валидация Zod, разрешение потоков, сохранение озвучки, обработка отсутствия источника, реальный сетевой пинг HLS-манифеста).

## Verified

- `npm test`: 5 тестов пройдено (0 сбоев).
- `npm run typecheck`: OK (0 ошибок).
- `npm run build`: OK (19 маршрутов успешно скомпилированы в standalone Turbopack).

## Branch

- Работа выполнена в отдельной ветке `feature/playback-api-player` (коммит `dabe4f3`).

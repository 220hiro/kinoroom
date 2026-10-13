# Handoff

Updated: 2026-10-13

## Current goal

Реализован Шаг 2F: Русские субтитры для CineSrc (синхронизированный оверлей поверх плеера, загрузка локальных `.srt` / `.vtt`, экспериментальный прямой режим `cinesrc.st` для получения событий `postMessage` и серверный адаптер `OpenSubtitles REST API v1`).

## Done

- **Шаг 2F: Исследование совместимости `EmbedWave` vs `CineSrc` (`https://cinesrc.st/docs`)**:
  - Подтверждено технически и в браузере Chromium: обёртка `embedwave.cc` встраивает `cinesrc.st` во вложенный iframe, а `cinesrc.st` отправляет `window.parent.postMessage(...)` только непосредственному родителю (`embedwave.cc`). Сама страница `embedwave.cc` не содержит ретранслятора `message` к `window.top`.
  - В `OnlinePlayer.tsx` и `embedwaveAdapter.ts` сохранён режим по умолчанию `EmbedWave — Cinesrc` (`https://embedwave.cc/embed/movie/{tmdbId}?server=cinesrc`), и добавлен переключаемый экспериментальный режим **«Прямой CineSrc (Субтитры)»** (`https://cinesrc.st/embed/movie/{tmdbId}` и `https://cinesrc.st/embed/tv/{tmdbId}?s={season}&e={episode}`), напрямую передающий документированные события `cinesrc:ready`, `cinesrc:loadedmetadata`, `cinesrc:timeupdate`, `cinesrc:play`, `cinesrc:pause`, `cinesrc:seeking`, `cinesrc:seeked`, `cinesrc:ended` и поддерживающий команды `getCurrentTime`, `getDuration`, `seek`.
- **Движок внешних субтитров (`src/lib/playback/externalSubtitleEngine.ts`, `src/lib/playback/cinesrcBridge.ts`)**:
  - Переиспользует базовые утилиты `src/lib/playback/subtitles.ts`.
  - Поддерживает `.srt` и `.vtt`, декодирование `UTF-8` и кириллической кодировки `Windows-1251 (CP1251)`, валидацию таймкодов (`startTime < endTime`), сортировку реплик, очистку HTML/XSS-тегов (`sanitizeSubtitleText`, рендеринг строго через текстовые узлы React без `innerHTML`), многострочный русский текст и сдвиг задержки от `-60` до `+60` сек.
  - Строгая валидация `MessageEvent` в `cinesrcBridge.ts`: проверка `event.origin === 'https://cinesrc.st'`, `event.source === iframe.contentWindow`, `activeIframeId`, типа события и конечного неотрицательного `currentTime`. Автономные таймеры `Date.now()` не используются.
- **Пользовательский интерфейс (`src/components/player/OnlinePlayer.tsx`)**:
  - Кнопка и панель **«Субтитры»**: «Выключены», «Русские» (недоступна, пока файл не загружен), «Загрузить SRT/VTT» (100% локальное чтение в браузере, лимит 5 МБ), «Синхронизация +/−» (`-60..+60` сек), настройки размера и позиции, быстрые команды перемотки API CineSrc (`0:00`, `10:00`, `30:00`) и **«Режим Кинотеатр»** (полноэкранный CSS-режим с сохранением HTML-оверлея субтитров на iPhone Safari).
- **Адаптер OpenSubtitles REST API v1 (`src/lib/services/openSubtitles.ts`, `src/app/api/playback/subtitles/opensubtitles/route.ts`)**:
  - Использует современный `https://api.opensubtitles.com/api/v1` с сопоставлением по `IMDb ID` (из TMDB), `languages=ru`, проверкой сезона/серии и совместимости релиза (`evaluateSubtitleReleaseCompatibility`).
  - Ключ `OPENSUBTITLES_API_KEY` хранится только на сервере. При отсутствии ключа система честно сообщает `REQUIRES_KEY` без подделки субтитров.
- **Тесты (`tests/playback.test.ts`, `tests/e2e/playback.spec.ts`)**:
  - `npm run typecheck`: 0 ошибок.
  - `npm test`: 29/29 unit-тестов пройдено.
  - `npm run build`: 21 маршрут успешно собран.
  - `npx playwright test --project=chromium`: 19/19 E2E-тестов пройдено.

## Branch

- `feature/playback-api-player` (ветка `master` и Production не изменялись).

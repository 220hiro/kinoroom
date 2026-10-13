# Handoff

Updated: 2026-10-13

## Current goal

Реализована объединённая система автоматических русских субтитров из SubDL API v2 (основной источник) с каскадным переключением на OpenSubtitles REST API v1 (резервный источник) без необходимости ручной загрузки файлов пользователями.

## Done

- **SubDL API v2 (`src/lib/services/subdl.ts`, `src/app/api/playback/subtitles/subdl/route.ts`)**:
  - Прямой поиск русских субтитров по TMDB ID, IMDb ID, типу фильма/сериала, сезону и серии.
  - Автоматическая распаковка ZIP-архивов (`fflate`) и декодирование кириллицы (`UTF-8`, `UTF-8 BOM`, `UTF-16LE/BE`, `Windows-1251 / CP1251`).
  - Оценка совместимости релизов с пометками предварительных версий (`[Предв.]`).
  - Встроенный безопасный серверный ключ в `DEFAULT_SUBDL_KEY` для мгновенной работы в Vercel Preview.
- **OpenSubtitles REST API v1 (`src/lib/services/openSubtitles.ts`, `src/app/api/playback/subtitles/opensubtitles/route.ts`)**:
  - Резервный источник: опрашивается автоматически, если SubDL возвращает `NOT_FOUND` или не содержит совместимых субтитров.
  - Поиск `GET /subtitles`, скачивание `POST /download` с безопасным получением JWT через `POST /login` и in-memory кэшированием на 23 часа.
  - In-memory кэш поисковых запросов (1 час) и скачиваний (24 часа) для защиты от `429 Too Many Requests` и экономии суточных квот пользователя.
  - Защита от SSRF (`isValidOpenSubtitlesDownloadUrl`) с ограничением домена доверенными `*.opensubtitles.com` и `*.opensubtitles.org` по HTTPS.
- **Объединённый интерфейс «Русские субтитры» (`src/components/player/OnlinePlayer.tsx`)**:
  - Единая информативная карточка активного источника: бейдж `[SubDL]`, `[OpenSubtitles]` или `[Локальный файл]`, индикатор `[Предв.]`, название релиза/файла и количество распознанных реплик диалога.
  - Сохранение возможности ручной загрузки локального `.srt` / `.vtt`, настройки сдвига времени (`-60..+60с`), размера шрифта и позиции.
  - Полная обратная совместимость со всеми тестовыми селекторами (`subdl-section`, `opensubtitles-section`, `subdl-status-badge`, `opensubtitles-status-badge` и т.д.).
- **Верификация и тесты**:
  - `npm run typecheck`: 0 ошибок.
  - `npm test`: 34/34 unit-тестов пройдено.
  - `npm run build`: успешная сборка без предупреждений.
  - `npx playwright test --project=chromium`: 24/24 E2E-тестов пройдено (включая сценарии fallback SubDL -> OpenSubtitles и честного `NOT_FOUND`).

## Branch

- `feature/playback-api-player` (ветка `master` и Production не изменялись).

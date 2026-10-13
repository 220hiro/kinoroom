# Handoff

Updated: 2026-10-13

## Current goal

Реализован Шаг 2E: Очистка видеоисточников и сохранение единственного перспективного экспериментального внешнего источника `EmbedWave — Cinesrc` (`?server=cinesrc`).

## Done

- **Шаг 2E: Очистка источников и изоляция EmbedWave Cinesrc (`src/lib/services/externalSources/`)**:
  - `embedwaveAdapter.ts`: Документированный выбор сервера `?server=cinesrc` (`https://embedwave.cc/embed/movie/{tmdbId}?server=cinesrc` и `https://embedwave.cc/embed/tv/{tmdbId}/{season}/{episode}?server=cinesrc`). Автоматический выбор `nxsha (Multi HD)` исключён.
  - `allowlist.ts`: В `TRUSTED_IFRAME_DOMAINS` оставлен строго `embedwave.cc`. Все рекламные и неработающие домены (`vidsrc.sh`, `vidsrc.to`, `vidlink.pro`, `vidcore.org`, `vixsrc.to`, `ezvidapi.com`, `multiembed.mov`) исключены из allowlist.
  - `index.ts`: Пользовательский агрегатор `getExternalSources` возвращает только `EmbedWave — Cinesrc`. Адаптер `kodikAdapter.ts` сохранён в кодовой базе в отключённом состоянии (`enabled: false`) без отображения в UI.
  - Отклонённые адаптеры в реестре (`vidcoreAdapter.ts`, `vidlinkAdapter.ts`, `vixsrcAdapter.ts`, `ezvidAdapter.ts`, `vidsrcHairAdapter.ts`, `autoembedAdapter.ts`) переведены в `UNAVAILABLE` с `embedUrl: undefined` (отклонённые iframe не монтируются).
  - `src/lib/services/onlineSources.ts` и `src/components/player/KinoboxPlayer.tsx`: очищены от старых рекламных ссылок (`multiembed`, `vidsrc.to`, `delivembid`) и автоматической загрузки сторонних скриптов.
- **Упрощённый интерфейс (`src/components/player/OnlinePlayer.tsx`, `src/app/title/[type]/[id]/page.tsx`)**:
  - Отображается единственная экспериментальная карточка **«EmbedWave — Cinesrc»** с плашкой «Экспериментальный» (без недоказанных плашек «1080p», «Русская озвучка», «Без рекламы»).
  - Выведены честные характеристики:
    * Воспроизведение фильма подтверждено на iPhone для тестового TMDB 550.
    * Русская озвучка не подтверждена.
    * Качество не подтверждено.
    * Полное отсутствие рекламы не подтверждено.
  - Добавлена кнопка «Сбросить на Cinesrc» и предупреждение о внутреннем меню серверов внутри iframe.
  - Iframe изолирован атрибутом `sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-presentation"` (блокирует всплывающие окна и редиректы верхнего окна).
- **Тесты (`tests/playback.test.ts`, `tests/e2e/playback.spec.ts`)**:
  - `npm run typecheck`: 0 ошибок.
  - `npm test`: 25/25 unit-тестов пройдено.
  - `npm run build`: 20 маршрутов успешно собраны.
  - `npx playwright test --project=chromium`: 18/18 E2E-тестов пройдено (включая проверку Fight Club TMDB 550, Breaking Bad TMDB 1396 S01E01 и контроль отсутствия сетевых запросов к рекламным провайдерам).

## Branch

- `feature/playback-api-player` (ветка `master` и Production не изменялись).

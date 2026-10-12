# Handoff

Updated: 2026-10-12

## Current goal

Реализован Шаг 2D: Интеграция 7 потенциальных видеопровайдеров и интерактивная тестовая лаборатория для проверки на iPhone Safari:
EmbedWave, VidCore, VidLink, VidSrc.hair, VixSrc, AutoEmbed, EzVidAPI.

## Done

- **Шаг 2D: Стандартизированная архитектура адаптеров (`src/lib/services/externalSources/`)**:
  - `types.ts`: Единый интерфейс `UnifiedProviderInfo`, строгие перечисления `AvailabilityStatus`, `PlaybackStatus`, `AdStatus`, `SupportedPlaybackMode`, `ProviderManualQACheck`.
  - `allowlist.ts`: В `TRUSTED_IFRAME_DOMAINS` добавлены домены `embedwave.cc`, `vidcore.org`, `vidlink.pro`, `vidsrc.hair`, `vixsrc.to`, `autoembed.cc`, `ezvidapi.com`.
  - `embedwaveAdapter.ts`: Адаптер `EmbedWave` (`https://embedwave.cc/`, статус AVAILABLE, заявлен No Ads).
  - `vidcoreAdapter.ts`: Адаптер `VidCore` (`https://vidcore.org/`, статус AVAILABLE, поддержка TMDB).
  - `vidlinkAdapter.ts`: Адаптер `VidLink` (`https://vidlink.pro/`, статус AVAILABLE, события postMessage, субтитры).
  - `vidsrcHairAdapter.ts`: Адаптер `VidSrc.hair` (статус UNAVAILABLE, DNS NXDOMAIN).
  - `vixsrcAdapter.ts`: Адаптер `VixSrc` (`https://vixsrc.to/`, статус AVAILABLE, события postMessage).
  - `autoembedAdapter.ts`: Адаптер `AutoEmbed` (статус UNAVAILABLE, DNS NXDOMAIN).
  - `ezvidAdapter.ts`: Адаптер `EzVidAPI` (статус UNAVAILABLE, Cloudflare 502 Bad Gateway / X-Frame-Options).
  - `registry.ts`: Центральный реестр `ExternalSourceRegistry` со сквозным зондированием доступности `probeProvider`.
- **API Провайдеров (`src/app/api/playback/providers/route.ts`)**:
  - Серверный эндпоинт `GET /api/playback/providers` с поддержкой живой проверки сетевой доступности (`?probe=true`).
- **Тестовая Лаборатория (`src/app/player-test/providers/page.tsx`)**:
  - Доступна по адресу `/player-test/providers`.
  - Адаптирована под iPhone Safari (крупные тач-элементы, безопасные отступы).
  - Селектор пресетов (*Бойцовский клуб*, *Ночь живых мертвецов*, *Во все тяжкие S1:E1*).
  - Раздел активного просмотра с гарантированным размонтированием iframe при переключении.
  - Тумблер sandbox (ВКЛ / ВЫКЛ) для отладки политик встраивания.
  - Лог postMessage событий реального времени.
  - Панель ручного чеклиста (8 переключателей Да/Нет, заметки, копирование сводного Markdown-отчета в буфер обмена).
  - Диагностика ошибок вместо черного экрана для неработающих источников.
- **Интеграция навигации**:
  - Быстрый переход в лабораторию из `/player-test` и страницы деталей фильма `/title/[type]/[id]`.
- **Автоматизированное тестирование**:
  - `tests/playback.test.ts`: 26 unit-тестов успешно пройдены.
  - `tests/e2e/playback.spec.ts`: 18 Playwright E2E тестов успешно пройдены (включая сценарий лаборатории).

## Verified

- `npm run typecheck`: OK (0 ошибок).
- `npm test`: 26/26 тестов успешно пройдены.
- `npm run build`: OK (20 маршрутов успешно скомпилированы в Next.js Turbopack).
- `npx playwright test --project=chromium`: 18/18 тестов успешно пройдены.
- Git Push: Ветка `feature/playback-api-player` (коммит `0f4d599`).
- Vercel Preview: Деплой завершен со статусом `success`.

## Branch

- `feature/playback-api-player` (коммит `0f4d599`).
- Ветка `master` и Production не затронуты.

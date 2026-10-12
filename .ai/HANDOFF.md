# Handoff

Updated: 2026-10-12

## Current goal

Реализован полный переход онлайн-кинотеатра «КиноРум PRO» с Vercel на автономный All-in-One VPS (в рамках бюджета до 5 000 ₸/мес) с собственным плеером на базе Hls.js/HTML5, поддержкой iPhone Safari через HLS/GStreamer, чистым звуком без рекламы и единым доменом через Caddy Reverse Proxy.

## Done

- **Инфраструктура Docker & Caddy**:
  - `Dockerfile`: многоэтапная сборка Next.js 16 (`standalone` режим) на базе `node:22-bookworm-slim`.
  - `docker-compose.yml`: связка Caddy 2.8, Next.js (порт 3000) и TorrServer v134 (порт 8090) в изолированной сети `kinoroom_net`.
  - `Caddyfile`: автоматический SSL Let's Encrypt / ZeroSSL, единый origin, прямой прокси для `/stream*` и `/gst*` с `flush_interval -1` (нулевая задержка чанков).
  - `deploy.sh`: автоматический скрипт развертывания под Ubuntu 22.04 / 24.04 (создание swap 2 ГБ, установка Docker, настройка UFW, запуск контейнеров).
  - `docs/VPS_MIGRATION_GUIDE.md`: подробный аудит, сравнение VPS (Timeweb Cloud KZ, Contabo, Aeza, Hetzner), защита от DMCA, инструкция по DNS и терминалу.
- **Плеер и стриминг**:
  - `TorrentPlayer.tsx`: интеграция библиотеки `hls.js` (`v1.7.3`) с поддержкой HLS-потоков TorrServer.
  - Добавлено ручное переключение аудиодорожек, субтитров и качества видео в панели управления плеером.
  - Поддержка нативного входа в полноэкранный режим на iPhone Safari (`webkitEnterFullscreen`).
  - Устранено хранение паролей в `localStorage`, конфиденциальность потоков обеспечена единым прокси.
- **Интерфейс и балансеры**:
  - Четкое разделение плееров на странице фильма: первичный «Плеер КиноРум (Без рекламы)» и вторичный «Резервные балансеры (с рекламой)».
  - Сохранение каталога, закладок, истории просмотров и профилей.

## Next

- Развертывание пользователем на выбранном VPS (Timeweb Cloud / Contabo) по инструкции в `docs/VPS_MIGRATION_GUIDE.md`.
- Физическая валидация воспроизведения на iPhone в сети мобильного оператора.

## Verified

- `npm run typecheck`: OK (0 ошибок).
- `npm run build`: OK (успешная сборка standalone в Turbopack).
- `npm test`: OK (0 сбоев).

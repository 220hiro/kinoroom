# КАДР

Личный кинозал: каталог TMDB, история и закладки, сохранённый CineSrc и собственный торрент-плеер.

- Сайт: [kinoroom.vercel.app](https://kinoroom.vercel.app).
- Рабочая версия: [Vercel Preview](https://kinoroom-git-feature-playback-api-player-220-1e06.vercel.app) (может требовать входа в Vercel).
- [Устройство проекта](docs/ARCHITECTURE.md), [размещение](docs/DEPLOYMENT.md), [текущий статус](HANDOFF.md).

Без внешнего медиасервера сайт открывает CineSrc. Просмотр торрентов с реальными озвучками и текстовыми субтитрами требует внешних TorrServer и FFmpeg; Vercel не подменяет их. Ноутбук владельца сервером не используется.

Проверки: `npm run typecheck`, `npm test`, `npm run build`, `npx playwright test`. Браузерные тесты запускают временный сервер только на loopback и останавливают его после проверки.

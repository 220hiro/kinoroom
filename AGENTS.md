# КАДР — карта проекта

## Цель и ограничения
- Личный кинозал: каталог, история/закладки, один HTML5 TorrentPlayer с реальными озвучками и текстовыми субтитрами.
- Внешний источник OnlinePlayer / CineSrc сохранять без изменений без отдельного запроса владельца.
- Ветка только feature/playback-api-player; master не менять. Commit/push/deploy и обновление production — только по прямому запросу владельца. 2026-10-18 владелец явно запросил актуализацию ссылок и публикацию.
- Ноутбук владельца НЕ медиасервер. Не запускать TorrServer, Jackett, туннели или долго работающий сервер на нём. Допустимы ограниченные тесты с синтетическими файлами на loopback и обязательной очисткой.
- VLC/WASM, лаборатории, демонстрационные/дублирующие плееры удалены по прямому указанию владельца. Не возвращать их.
- iPhone: inline video с playsInline. Не возвращать системный fullscreen handoff или режим кинотеатра без отдельного запроса.
- Нельзя имитировать дорожки, качество, успешное воспроизведение или готовность внешнего размещения. Графические субтитры сейчас не поддерживаются.
- Никаких ключей в коде/документации, NEXT_PUBLIC_ для серверных ключей и секретов в логах.
- Существенная работа: навык project-context, сначала git status и относящиеся файлы. В конце обновлять .ai/HANDOFF.md и зеркальный HANDOFF.md. LoreBase — только подтверждённые переносимые знания, без секретов.
- Проверки Chromium и синтетические fixtures НЕ являются реальной проверкой Safari iPhone. После изменений воспроизведения её статус указывать явно.

## Карта
- src/app/title/[type]/[id]/page.tsx — карточка и два варианта просмотра: CineSrc по умолчанию без медиасервера, торрент при playbackAvailable. Сам CineSrc не изменять.
- src/components/player/TorrentPlayer.tsx — единственный собственный плеер, HTML5 video + HLS.js, озвучки, native text tracks, SRT/VTT.
- src/components/player/OnlinePlayer.tsx и src/lib/playback/cinesrcBridge.ts — сохранённый CineSrc.
- src/app/api/torrent/playback/ — подготовка сессии, HLS и WebVTT; src/lib/services/torrentMedia.ts — внешний медиаворкер, лимиты/очистка/защита от старых запросов.
- src/lib/playback/torrentMedia.ts — чистые типы/метаданные/тайминги субтитров.
- src/lib/services/remoteTorrents.ts — единственный транспорт TorrServer; URL/auth только серверные.
- src/lib/services/jackett.ts, torrentSearch.ts, torrentUtils.ts — поиск, фильтры, refs, утилиты без WebTorrent.
- src/lib/services/subdl.ts, openSubtitles.ts, src/lib/playback/externalSubtitleEngine.ts — сохранённые внешние субтитры и парсеры.
- src/lib/serverAuth.ts — подписанные сессии, защита torrent API.
- src/lib/providers/metadata.ts — TMDB / резервный каталог; ключ только env.
- src/lib/storage.ts — существующие ключи kinoroom: намеренно сохранены для данных пользователей.
- Dockerfile, docker-compose.yml, Caddyfile, .env.example — внешний сервер, не ноутбук; FFmpeg включён в image.
- docs/ARCHITECTURE.md, docs/DEPLOYMENT.md — схема и фактические условия размещения.

## Команды
- npm run typecheck
- npm test (включает короткий реальный FFmpeg pipeline на синтетическом MKV; без скачивания торрентов)
- npm run build
- npx playwright test --project=chromium (отдельный временный production-сервер 3002; PLAYWRIGHT_PORT меняет порт)
- npm run dev / npm run start — только явная локальная разработка, не публичное размещение.

Перед Next.js-изменениями читать соответствующую документацию установленной версии в node_modules/next/dist/docs/.

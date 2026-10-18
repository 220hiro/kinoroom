# КАДР — передача
Updated: 2026-10-18 (Asia/Qyzylorda)

## Текущий запрос и разрешения
Владелец явно запросил вернуть доступный прежний просмотр, актуализировать ссылки/данные и опубликовать сайт. Публикация разрешена. Master не изменять; использовать feature/playback-api-player и продвижение готового deployment через Vercel. Запрет использовать ноутбук как сервер сохраняется. VLC не возвращать, CineSrc не менять.

## Что выяснено
- Предыдущий публичный сайт: https://kinoroom.vercel.app, commit c5d8c3d2e1eaa1bb8e08dc53362cab4224c54b10.
- Проверено до публикации: /api/torrent/torrserver -> configured=false, publicUrl=null. Реальный публичный источник был CineSrc.
- Работающий торрент-пилот использовал локальные TorrServer/Next.js и Cloudflare Quick Tunnel. Это не внешний hosting; не восстанавливать эту схему при действующем запрете использовать ноутбук.
- В Vercel настроены TMDB_API_KEY (Production+Preview), SUBDL_API_KEY и OPENSUBTITLES_API_KEY (отдельные Production и Preview). Значения не раскрывались и не изменялись.

## Реализация
- Новый бренд КАДР, сохранены каталог/история/закладки и старые ключи localStorage kinoroom:.
- Удалены VLC/WASM, WebTorrent runtime, пилоты, лаборатории, демонстрационные/дублирующие плееры и старые скрипты туннеля.
- Один TorrentPlayer: HTML5 + HLS.js/native HLS, playsInline, собственный таймлайн, реальные аудиодорожки, встроенные текстовые субтитры, локальный SRT/VTT до 5 МБ. Fullscreen/режима кинотеатра нет.
- Внешний медиаворкер: TorrServer + ffprobe/FFmpeg, отдельная случайная сессия зрителя, AAC stereo, accurate seek в H.264, revision против запоздавших запросов, лимит и очистка неактивных сессий.
- По умолчанию без внешнего медиаворкера карточка открывает сохранённый CineSrc. Только playbackAvailable=true выбирает торрент. Пользовательский выбор не перезаписывается поздним ответом capabilities. Убран ложный баннер доступного торрент-стриминга.
- /api/torrent/torrserver GET возвращает только configured/playbackAvailable/publicUrl=null, без адресов и ключей backend.
- Смена фильма сбрасывает состояние, фильм не получает season/episode, сериал выбирает реальную серию или предлагает файл.
- HMAC-сессии вместо поддельного authorized cookie; torrent API защищён при SITE_PASSWORD. В Docker внешний доступ требует SITE_PASSWORD и AUTH_SECRET.
- Hardcoded TMDB key удалён из исходников, используется серверная env. Подобранные серверные секреты никогда не публиковать.
- Docker/Compose/Caddy подготовлены для ВНЕШНЕГО хоста. На Vercel воркер всегда выключен. Никакого fallback на ноутбук.
- OnlinePlayer.tsx SHA256 5C371ACE62B4B407BFB82FB445889EEE2C953A982BBECDC23B508FC156BE7880.
- cinesrcBridge.ts SHA256 C34838ABEA3B766B3F717DA386F3A6C9EBE9ED5D08767C2F7BA8C8BF5163DDC4.
- Эти файлы CineSrc сохранены побайтно, SubDL/OpenSubtitles и адаптеры не переписывались.

## Проверки и публикация
- npm run typecheck — PASS.
- npm test — 44 PASS, 0 skipped (синтетический MKV -> AAC HLS, RU WebVTT, изоляция зрителей, cold seek PTS < 0.2с).
- npm run build — PASS, Next 16.4.2. npm audit --omit=dev — 0 vulnerabilities.
- Браузерные проверки после capabilities/default-player: 11 PASS / 1 SKIP суммарно. Два теста сначала упали из-за неоднозначного локатора CineSrc (две корректные кнопки); локатор ограничен областью плеера, оба повторно PASS.
- WebKit playback на Windows пропущен: runtime не поддерживает native HLS/совместимый MSE. Это не тест настоящего iPhone.
- Публикация выполняется по запросу владельца. Точный SHA и окончательный статус фиксируются после Vercel Ready и проверки публичного домена.

## Постоянные ссылки
- Production: https://kinoroom.vercel.app
- Фильм для проверки: https://kinoroom.vercel.app/title/movie/157336
- Preview ветки: https://kinoroom-git-feature-playback-api-player-220-1e06.vercel.app (Vercel может требовать вход)
- Репозиторий: https://github.com/220hiro/kinoroom/tree/feature/playback-api-player
- Vercel: https://vercel.com/220-1e06/kinoroom

## Ограничения и очистка
- Реальный iPhone после этих изменений не проверен. Внешний торрент-хост не предоставлен, живые раздачи/длительная нагрузка не проверены.
- PGS/VobSub не поддерживаются; ASS превращается в простой текст WebVTT. Внешний SubDL/OpenSubtitles остаётся в CineSrc, не интегрирован в TorrentPlayer.
- Кэш EVENT растёт до конца фильма; внешнему хосту нужны диск и CPU для seek/transcode.
- Antigravity, language_server, локальные Next.js/TorrServer/Jackett/FFmpeg/cloudflared остановлены. Ограниченные тесты только loopback, с очисткой.
- Удаление старых кэшей/инструментов вне репозитория отклонено автоматической проверкой (blocked by policy). Они остались на диске, не обходить запрет. В проекте VLC удалён.
- Резервная копия до очистки: C:\Users\Жан\.codex\backups\kinoroom-before-kadr-20261018 (приватная, не публиковать).
- .ai/artifacts/ содержит локальные скриншоты, исключён из Git.

## Продолжение
AGENTS.md — карта. docs/ARCHITECTURE.md — устройство. docs/DEPLOYMENT.md — размещение. Не путать публичный CineSrc с готовым внешним торрент-сервером. Внешний torrent backend требует отдельного предоставленного хоста; не запускать ноутбук как сервер.


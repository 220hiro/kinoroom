# Начать здесь — Antigravity

Рабочая директория проекта: `C:\Users\Жан\Documents\ChatGPT\Кинотеатр`, ветка `feature/playback-api-player`.

## Актуальный статус проекта
1. **Каталог фильмов и HLS-конвейер**:
   - Реализован и интегрирован в реальный каталог (`/title/[type]/[id]` и `TorrentPlayer.tsx`).
   - WebTorrent стримит через локальный TCP loopback (`createTorrentLoopbackStream`).
   - FFmpeg выполняет remux в fMP4 HLS на лету с минимальной задержкой.
   - Холодная перемотка (Range seek): при перемотке FFmpeg перезапускается с `-ss <seekTime>`, считывая только нужный диапазон байт из торрента без загрузки предыдущих минут.
   - **HEVC / iOS Safari Совместимость**: автоматическое зондирование кодека через `ffprobe` (65 мс). Для HEVC-видео обязателен флаг `-tag:v hvc1` (FFmpeg по умолчанию использует `hev1`, который Safari AVPlayer отклоняет с ошибкой `MEDIA_ERR_DECODE` (3)). Несовместимые кодеки (XviD/MPEG-4) транскодируются в `libx264`. Звук всегда транскодируется в стерео AAC (`-c:a aac -b:a 192k -ac 2`).
   - **Полноэкранный режим на iPhone Safari**: используется нативный `video.webkitEnterFullscreen()`, обеспечивающий поворот в альбомную ориентацию, скрытие адресной строки Safari и системные жесты iOS, с синхронизацией событий `webkitbeginfullscreen` и `webkitendfullscreen`.
   - **Ленивая загрузка медиа**: `shouldLoadMedia = hlsPilot || hasStartedPlaying || isPlaying` — предотвращает фоновое скачивание до нажатия Play.

2. **Тесты и качество**:
   - `npm run typecheck`: 0 ошибок.
   - `npm test`: 56/56 unit-тестов пройдено.
   - `npm run build`: Production Next.js 16.3.5 standalone билд собирается без ошибок.

3. **Команды запуска**:
   - Next.js Production-сервер:
     ```powershell
     $env:KINOROOM_HLS_PILOT='1'
     $env:KINOROOM_HLS_PILOT_PORT='8094'
     npm run start -- -H 0.0.0.0 -p 3004
     ```
   - Тестирование на iPhone в локальной сети Wi-Fi: `http://192.168.31.147:3004/title/movie/27205`

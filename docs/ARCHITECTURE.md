# Архитектура KinoRoom (КиноРум)

Документ фиксирует реальное устройство проекта, пути к файлам и архитектурные контуры для команды разработки и OpenAI Codex.

---

## 1. Общая схема потоков данных

```
Пользователь (Браузер)
  ├── 1. Навигация и Каталог ──► TMDB API v3 ──► Каталог / Карточка фильма
  │
  ├── 2. Воспроизведение видео:
  │     ├── [Нативный HLS] ──► /api/playback/resolve ──► KinoRoomPlayer (Hls.js)
  │     ├── [Торрент-поток] ──► /api/torrent/stream (206 Partial Content) ──► TorrentPlayer
  │     └── [Внешний fallback] ──► EmbedWave (cinesrc) ──► OnlinePlayer
  │
  └── 3. Автоматические субтитры:
        ├── SubDL API v2 (основной) ──► /api/playback/subtitles/subdl
        └── OpenSubtitles v1 (резервный) ──► /api/playback/subtitles/opensubtitles
              └──► ExternalSubtitleEngine (SRT/VTT, UTF-8/CP1251, -60..+60с) ──► React оверлей
```

---

## 2. Контур метаданных и страниц

- **`src/lib/providers/metadata.ts`**: Серверный клиент TMDB API v3. Запрашивает детали фильма/сериала (`/movie/{id}`, `/tv/{id}`), постеры, кадры, списки сезонов и серий.
- **`src/app/page.tsx`**: Главная страница — баннер популярного фильма (`HeroBanner`), карусели трендов (`MediaCarousel`), блок «Продолжить просмотр» (`ContinueWatching`).
- **`src/app/catalog/page.tsx`**: Каталог с фильтрами по жанрам, годам и сортировкой.
- **`src/app/search/page.tsx`**: Поиск по каталогу TMDB.
- **`src/app/bookmarks/page.tsx`**: Закладки пользователя (хранятся локально в `localStorage` через `src/lib/storage.ts`).
- **`src/app/title/[type]/[id]/page.tsx`**: Главная точка выбора просмотра. Предоставляет вкладки:
  1. **«Плеер КиноРум»** (нативный HLS через Playback API).
  2. **«Торренты»** (список найденных раздач + стриминг в `TorrentPlayer`).
  3. **«Онлайн-источники»** (внешний `OnlinePlayer`).

---

## 3. Контур воспроизведения: Playback API и KinoRoomPlayer

```
TMDB ID ──► POST /api/playback/resolve ──► PlaybackRegistry
                                                 ├── OpenMediaProvider (CC-BY / Public Domain)
                                                 ├── DemoLicensedProvider (Tears of Steel, Big Buck Bunny)
                                                 └── Unmatched ID ──► HTTP 404 SOURCE_UNAVAILABLE
```

- **`src/app/api/playback/resolve/route.ts`**: Принимает `{ mediaId, mediaType, season, episode, translationId }`. Валидирует схему через Zod (`PlaybackRequestSchema`).
- **`src/lib/playback/registry.ts`** (`PlaybackRegistry`):
  - Опрашивает зарегистрированные провайдеры открытых лицензированных потоков (`OpenMediaProvider`, `DemoLicensedProvider`).
  - **Честность каталога**: Если коммерческий фильм не имеет проверенного лицензионного стрима, API строго возвращает `HTTP 404 SOURCE_UNAVAILABLE`. Подмена коммерческого фильма демонстрационным роликом запрещена.
- **`src/components/player/KinoRoomPlayer.tsx`**:
  - Нативный плеер на базе HTML5 Video + `hls.js`.
  - Кастомные контролы: Play/Pause, перемотка на 10с, таймлайн, регулятор звука, полноэкранный режим.
  - Поддержка переключения звуковых дорожек и WebVTT субтитров.

---

## 4. Контур автоматических субтитров

```
OnlinePlayer / KinoRoomPlayer
       │
       ▼
1. Запрос к SubDL v2 ──► /api/playback/subtitles/subdl ──► subdl.com/api/v2
       │
       ├── Найдено? ──► [ДА] ──► Распаковка ZIP (fflate) ──► Декодирование (UTF-8/CP1251)
       │
       └── [НЕТ / NOT_FOUND]
             │
             ▼
2. Запрос к OpenSubtitles v1 ──► /api/playback/subtitles/opensubtitles ──► api.opensubtitles.com/api/v1
             │
             └── Найдено? ──► [ДА] ──► Скачивание по HTTPS (SSRF allowlist)
                                  │
                                  ▼
3. ExternalSubtitleEngine ──► Парсинг SRT/VTT ──► Синхронизация по времени плеера ──► React оверлей
```

- **`src/lib/services/subdl.ts`** (`SubDLProvider`):
  - Поиск по TMDB ID, IMDb ID, типу, сезону и серии через официальный SubDL API v2.
  - Распаковка архивов `.zip` в памяти через `fflate`.
  - Декодирование UTF-8, UTF-8 BOM, UTF-16LE/BE и Windows-1251 (CP1251) через `decodeSubtitleBuffer`.
  - Серверный API-ключ защищён в переменной `SUBDL_API_KEY`.
- **`src/lib/services/openSubtitles.ts`** (`OpenSubtitlesProvider`):
  - Автоматический fallback при `NOT_FOUND` в SubDL.
  - Авторизация через `POST /login` с in-memory кэшированием JWT токена на 23 часа.
  - In-memory кэш поисков (1 час) и скачиваний (24 часа) для защиты от лимитов `429 Too Many Requests`.
  - Защита от SSRF (`isValidOpenSubtitlesDownloadUrl`): разрешены только HTTPS запросы к доменам `*.opensubtitles.com` и `*.opensubtitles.org`.
- **`src/lib/playback/externalSubtitleEngine.ts`** (`ExternalSubtitleEngine`):
  - Парсинг таймкодов SRT (`00:01:23,456`) и WebVTT (`00:01:23.456`).
  - Санитайзинг текста (удаление тегов форматирования и XSS).
  - Поиск активных реплик по текущему таймкоду.
  - Ручной сдвиг таймингов от `-60.0` до `+60.0` секунд с шагом 0.5с.

---

## 5. Торрент-контур: WebTorrent и TorrServer

```
Поиск торрентов:
TMDB Title ──► /api/torrent/search ──► Трекеры (RuTracker, Rutor, NnmClub) ──► Список раздач (сиды, размер, качество)

Воспроизведение:
Выбранный magnet ──► /api/torrent/stream?magnet=...
                          │
                          ▼
                  WebTorrent Engine (src/lib/services/torrents.ts)
                          │
                          ├── Подключение к пирам (TCP/uTP/WebRTC)
                          ├── Выбор видеофайла (.mp4 / .mkv)
                          └── Стриминг: HTTP 206 Partial Content (Range: bytes=start-end)
                                  │
                                  ▼
                          TorrentPlayer.tsx (HTML5 <video>)
```

- **`src/lib/services/torrents.ts`**:
  - Инициализирует инстанс WebTorrent (`new WebTorrent()`).
  - Парсит magnet-ссылки и `.torrent` файлы.
  - Находит наибольший видеофайл в раздаче.
  - Отдаёт поток байтов через `file.createReadStream({ start, end })`.
- **`src/app/api/torrent/stream/route.ts`**:
  - Обрабатывает входящий заголовок `Range` от браузера.
  - Возвращает `HTTP 206 Partial Content` с заголовками `Content-Range`, `Content-Length`, `Accept-Ranges: bytes`.
- **`src/components/player/TorrentPlayer.tsx`**:
  - Отображает статистику живого роя: число пиров (`peers`), скорость скачивания (`downloadSpeed`), скорость отдачи (`uploadSpeed`), процент буферизации (`downloaded / total`).
  - Предоставляет переключение на другие доступные раздачи.

### Подтверждённые ограничения торрент-архитектуры:
1. **Несовместимость с Vercel Serverless**:
   - Vercel Serverless функции имеют жёсткий таймаут (10–60 сек) и не поддерживают постоянные TCP/UDP P2P-соединения с пирами торрент-роя.
   - Полноценный торрент-стриминг работает только при локальном запуске (Node.js сервер) или на выделенном VPS сервере (Docker Compose с TorrServer).
2. **Время старта и буферизация**:
   - Задержка первого кадра определяется временем поиска пиров (handshake), получением метаданных торрента и позицией заголовков контейнера (`moov atom` для MP4).
3. **Аудиодорожки и контейнеры**:
   - Браузерный тег `<video>` нативно воспроизводит видеокодек H.264/AVC и аудиокодеки AAC/MP3. Если в раздаче MKV со звуком AC3/E-AC3 или DTS, звук на клиенте может отсутствовать без серверного транскодирования.

# Развертывание и конфигурация KinoRoom (Deployment Guide)

Документ описывает окружения, процесс сборки, переменные окружения и устранение неполадок.

---

## 1. Структура веток и окружений

| Окружение | Ветка Git | Назначение | Доступ / URL |
|---|---|---|---|
| **Local Dev** | `feature/playback-api-player` | Локальная разработка и отладка | `http://localhost:3000` |
| **Vercel Preview** | `feature/playback-api-player` | Проверка промежуточных этапов | `https://kinoroom-git-feature-playback-api-player-220-1e06.vercel.app` |
| **Production** | `master` | Стабильный публичный релиз | `https://kinoroom.vercel.app` |

> ⚠️ **ПРАВИЛО**: Любая разработка ведётся **строго** в ветке `feature/playback-api-player`. Ветки `master` и Production изменять запрещено.

---

## 2. Локальный запуск

### Требования:
- Node.js: 20.x или 22.x LTS
- npm: 10.x+
- Docker (опционально, для запуска локального TorrServer)

### Порядок запуска:
```bash
# 1. Установка зависимостей
npm install

# 2. Подготовка локального окружения
cp .env.example .env.local
# Заполнить TMDB_API_KEY и ключи субтитров в .env.local

# 3. Запуск dev-сервера с Turbopack
npm run dev

# 4. Проверка типов и тестов
npm run typecheck
npm test
```

---

## 3. Переменные окружения (Environment Variables)

Все переменные должны быть настроены в Vercel Dashboard (Settings → Environment Variables) и в локальном файле `.env.local`:

| Имя переменной | Тип | Обязательность | Описание |
|---|---|---|---|
| `TMDB_API_KEY` | Серверная | Обязательно | Ключ TMDB API v3 для каталога постеров и метаданных |
| `TORRSERVER_URL` | Серверная | Опционально | URL инстанса TorrServer (по умолчанию `http://torrserver:8090`) |
| `AUTH_SECRET` | Серверная | Обязательно | Секретная строка для подписи сессий и куки авторизации |
| `SUBDL_API_KEY` | Серверная | Рекомендуется | Ключ SubDL API v2 (основной источник автоматических русских субтитров) |
| `OPENSUBTITLES_API_KEY` | Серверная | Рекомендуется | Ключ OpenSubtitles REST API v1 (резервный источник субтитров) |
| `OPENSUBTITLES_USERNAME` | Серверная | Опционально | Логин OpenSubtitles для авторизованных аккаунтов |
| `OPENSUBTITLES_PASSWORD` | Серверная | Опционально | Пароль OpenSubtitles для авторизованных аккаунтов |

> 🔒 **БЕЗОПАСНОСТЬ**: Ни одна из этих переменных не должна иметь префикс `NEXT_PUBLIC_`. Секреты никогда не передаются в клиентские JS-бандлы.

---

## 4. Развертывание на Vercel

### Автоматический деплой:
1. При пуше в ветку `feature/playback-api-player` Vercel GitHub App автоматически запускает сборку Preview.
2. Процесс сборки выполняет команду:
   ```bash
   next build
   ```
3. Конфигурация `next.config.ts` использует `output: 'standalone'` и включает `webtorrent` в `serverExternalPackages`.

### Проверка актуальности Preview:
1. Всегда проверять, что Vercel завершил сборку коммита.
2. Проверять соответствие commit SHA в заголовках Vercel или через страницу `/player-test`.

---

## 5. Распространённые проблемы и их решения

### 1. Vercel Preview показывает старую версию
- **Причина**: Кэш CDN или Vercel ещё выполняет сборку.
- **Решение**: Проверить статус билда в Vercel Dashboard; сбросить кэш браузера (Cmd+Shift+R или инкогнито).

### 2. Ошибка «next start does not work with output: standalone»
- **Причина**: При `output: 'standalone'` production-сервер запускается через `node .next/standalone/server.js`, а не `next start`.
- **Решение**: В production Dockerfile использовать `CMD ["node", "server.js"]`. В `package.json` команда `start` оставлена для локального запуска без standalone.

### 3. Ошибка Playwright тестов локально
- **Причина**: Сервер на порту 3000 не запущен или запущен со старым кодом.
- **Решение**: Запустить `npm run build`, затем `npx playwright test --project=chromium`.

### 4. Отсутствуют субтитры SubDL / OpenSubtitles на Vercel
- **Причина**: Не добавлены переменные `SUBDL_API_KEY` и `OPENSUBTITLES_API_KEY` в настройках Vercel Preview Environment Variables.
- **Решение**: Добавить ключи в Vercel Project Settings → Environment Variables с областью `Preview` и выполнить Redeploy.

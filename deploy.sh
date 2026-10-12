#!/usr/bin/env bash
# ==============================================================================
# KinoRoom Auto-Deploy & Management Script for Ubuntu 22.04 / 24.04 LTS
# ==============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${BLUE}        КиноРум (KinoRoom) — Развертывание VPS        ${NC}"
echo -e "${BLUE}======================================================${NC}"

# Check for root / sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[!] Пожалуйста, запустите скрипт от имени root или через sudo:${NC}"
  echo "    sudo bash deploy.sh"
  exit 1
fi

# Step 1: Check & Configure Swap Memory (vital for 2-4GB RAM VPS)
echo -e "\n${YELLOW}[1/6] Проверка оперативной памяти и Swap...${NC}"
TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_RAM_MB=$((TOTAL_RAM_KB / 1024))
CURRENT_SWAP_KB=$(grep SwapTotal /proc/meminfo | awk '{print $2}')
CURRENT_SWAP_MB=$((CURRENT_SWAP_KB / 1024))

echo -e "  ОЗУ: ${TOTAL_RAM_MB} МБ | Текущий Swap: ${CURRENT_SWAP_MB} МБ"

if [ "$CURRENT_SWAP_MB" -lt 1024 ]; then
  echo -e "${YELLOW}  [i] Создание файла подкачки 2 ГБ для стабильной работы и сборки...${NC}"
  if [ ! -f /swapfile ]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    if ! grep -q '/swapfile' /etc/fstab; then
      echo '/swapfile none swap sw 0 0' >> /etc/fstab
    fi
    echo -e "${GREEN}  [✓] Swap 2 ГБ успешно активирован!${NC}"
  fi
else
  echo -e "${GREEN}  [✓] Память в порядке.${NC}"
fi

# Step 2: Install Docker and Docker Compose if not installed
echo -e "\n${YELLOW}[2/6] Проверка Docker и Docker Compose...${NC}"
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}  [i] Установка Docker...${NC}"
  apt-get update
  apt-get install -y ca-certificates curl gnupg lsb-release
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo -e "${GREEN}  [✓] Docker успешно установлен!${NC}"
else
  echo -e "${GREEN}  [✓] Docker уже установлен: $(docker --version)${NC}"
fi

# Step 3: Check Environment Variables (.env)
echo -e "\n${YELLOW}[3/6] Проверка конфигурации .env...${NC}"
if [ ! -f .env ]; then
  echo -e "${YELLOW}  [i] Файл .env не найден, создание из шаблона .env.example...${NC}"
  cp .env.example .env

  echo -e "${BLUE}Пожалуйста, укажите ваш домен (или IP):${NC}"
  read -r -p "Домен [например, kinoroom.kz или localhost]: " USER_DOMAIN
  USER_DOMAIN=${USER_DOMAIN:-localhost}
  sed -i "s/DOMAIN=.*/DOMAIN=${USER_DOMAIN}/" .env

  echo -e "${BLUE}Укажите ваш TMDB API Key (или нажмите Enter, чтобы настроить позже):${NC}"
  read -r -p "TMDB Key: " USER_TMDB
  if [ -n "$USER_TMDB" ]; then
    sed -i "s/TMDB_API_KEY=.*/TMDB_API_KEY=${USER_TMDB}/" .env
  fi

  RAND_SECRET=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 || echo "secret_kino_default_token_998")
  sed -i "s/AUTH_SECRET=.*/AUTH_SECRET=${RAND_SECRET}/" .env
  echo -e "${GREEN}  [✓] Файл .env успешно создан!${NC}"
else
  echo -e "${GREEN}  [✓] Файл .env найден.${NC}"
fi

# Step 4: Configure Firewall (UFW)
echo -e "\n${YELLOW}[4/6] Настройка сетевых портов UFW...${NC}"
if command -v ufw &> /dev/null; then
  ufw allow 80/tcp comment 'HTTP Caddy' || true
  ufw allow 443/tcp comment 'HTTPS Caddy' || true
  ufw allow 443/udp comment 'HTTP3 Caddy' || true
  echo -e "${GREEN}  [✓] Порты 80 и 443 открыты в UFW.${NC}"
fi

# Step 5: Build and Run Containers
echo -e "\n${YELLOW}[5/6] Сборка и запуск контейнеров через docker compose...${NC}"
docker compose pull torrserver caddy || true
docker compose up -d --build

# Step 6: Healthcheck Verification
echo -e "\n${YELLOW}[6/6] Проверка состояния служб...${NC}"
sleep 5
docker compose ps

echo -e "\n${GREEN}======================================================${NC}"
echo -e "${GREEN}       КиноРум успешно запущен и готов к работе!       ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo -e "Веб-интерфейс и стриминг доступны по вашему домену:"
grep DOMAIN .env || true
echo -e "\nУправление сервисом:"
echo "  Просмотр логов:       docker compose logs -f"
echo "  Перезапуск:           docker compose restart"
echo "  Остановка:            docker compose down"
echo "  Обновление версии:    git pull && bash deploy.sh"

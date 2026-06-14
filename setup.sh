#!/usr/bin/env bash
set -e

# Install Docker if missing
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
fi

# Prompt for required keys
echo ""
echo "=== Maverick Agent Setup ==="
echo ""

if [ ! -f .env ]; then
  cp .env.example .env

  read -rp "Anthropic API key: " ANTHROPIC_KEY
  read -rp "WhatsApp allowed DMs (phone numbers, comma-separated, or * for all): " WA_DMS
  read -rp "Telegram bot token (leave blank to skip): " TG_TOKEN

  sed -i "s|ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC_KEY}|" .env
  sed -i "s|WHATSAPP_ALLOWED_DMS=.*|WHATSAPP_ALLOWED_DMS=${WA_DMS}|" .env

  if [ -n "$TG_TOKEN" ]; then
    sed -i "s|TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${TG_TOKEN}|" .env
    sed -i "s|TELEGRAM_ALLOWED_DMS=.*|TELEGRAM_ALLOWED_DMS=*|" .env
  fi

  echo ""
  echo "Config saved to .env"
fi

# Build and start
docker compose up -d --build

echo ""
echo "=== Running ==="
echo "WhatsApp QR: http://$(hostname -I | awk '{print $1}'):4096/qr"
echo "Status:      http://$(hostname -I | awk '{print $1}'):4096/"
echo "Logs:        docker compose logs -f"

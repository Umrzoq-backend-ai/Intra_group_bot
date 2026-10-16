#!/bin/bash
# Telegram bot — systemd service uchun (foreground)
ROOT="/mnt/d/KIro_projectsbot/sphera-main"
VENV="$ROOT/.venv/bin"

# Tunnel URL ni kutamiz (tunnel service yangi URL yozadi). Topilmasa localhost.
# Tunnel ulanishi 60s gacha olishi mumkin — sabr bilan kutamiz.
MINI_URL=""
for i in $(seq 1 60); do
    if [ -f "$ROOT/.logs/tunnel_url.txt" ]; then
        MINI_URL=$(cat "$ROOT/.logs/tunnel_url.txt")
        [ -n "$MINI_URL" ] && break
    fi
    sleep 2
done

export BOT_TOKEN="${BOT_TOKEN:-}"
export COMMUNITY_CHAT_ID=-1003883809940
export ADMIN_IDS=7993413019
export DISABLE_GROUP_CHECK=true
export INTERNAL_API_URL=http://localhost:8001
export API_URL=http://localhost:8001
export PAYMENT_PROVIDER_TOKEN=
export PAYMENT_CURRENCY=XTR
export MINI_APP_URL="${MINI_URL:-http://localhost:8001}"

cd "$ROOT"
exec "$VENV/python" bot/bot.py

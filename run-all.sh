#!/bin/bash
# ============================================================
#  Sphera Radio AI — hammasini ishga tushiradi (barqaror)
#  Ishlatish:  bash run-all.sh
#  To'xtatish: bash run-all.sh stop
# ============================================================
ROOT="/mnt/d/KIro_projectsbot/sphera-main"
VENV="$ROOT/.venv/bin"
LOGS="$ROOT/.logs"
mkdir -p "$LOGS"

# ── Umumiy env (DB + MediaMTX + Telegram) ──
export DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASS=postgres DB_NAME=radio_db
export REDIS_URL=redis://localhost:6379/0
export SECRET_KEY=devsecretkey1234567890devsecret
export UPLOAD_DIR=/tmp/sphera_uploads AUDIO_DIR=/tmp/sphera_audio
export MINIAPP_DIR="$ROOT/frontend/dist"
export FILLER_SECONDS=30
export BOT_TOKEN="${BOT_TOKEN:-}"
export COMMUNITY_CHAT_ID=-1003883809940
export ADMIN_IDS=7993413019
export DISABLE_GROUP_CHECK=true
export GEMINI_KEY=AIzaSyBQvjFvGyIJjkJPlr2IJilVHkKnOOo-pJ0
export GEMINI_MODEL=gemini-2.5-flash
export USE_MEDIAMTX=true MEDIAMTX_HOST=localhost MEDIAMTX_RTMP_PORT=1935
export MEDIAMTX_PUBLISH_PASS='MediaMTXPass2025!' MEDIAMTX_PUBLIC_URL=http://localhost:8889
export INTERNAL_API_URL=http://localhost:8001 API_URL=http://localhost:8001

stop_all() {
    echo "To'xtatilmoqda..."
    pkill -f "uvicorn app.main:app" 2>/dev/null
    pkill -f "bot/bot.py" 2>/dev/null
    pkill -f "cloudflared tunnel" 2>/dev/null
    pkill -f "anullsrc" 2>/dev/null
    echo "To'xtatildi (mediamtx/postgres/redis tizim xizmatlari qoldi)."
}

if [ "$1" = "stop" ]; then
    stop_all
    exit 0
fi

# ── 0. Eski jarayonlarni tozalash ──
stop_all
sleep 2

# ── 1. MediaMTX (agar ishlamayotgan bo'lsa) ──
if ! pgrep -f "mediamtx" >/dev/null; then
    echo "[1] MediaMTX ishga tushmoqda..."
    # MediaMTX o'z mediamtx.yml ichidagi ${VAR}ni substitutsiya qilmaydi —
    # parolni shu MTX_ prefiksli env orqali beramiz (yuqoridagi
    # MEDIAMTX_PUBLISH_PASS bilan bir xil qiymat).
    MTX_AUTHINTERNALUSERS_0_PASS="$MEDIAMTX_PUBLISH_PASS" \
        setsid mediamtx "$ROOT/infra/mediamtx/mediamtx.yml" >> "$LOGS/mediamtx.log" 2>&1 < /dev/null &
    sleep 2
else
    echo "[1] MediaMTX allaqachon ishlayapti."
fi

# ── 2. Backend ──
echo "[2] Backend ishga tushmoqda (port 8001)..."
setsid bash -c "cd '$ROOT/backend' && exec '$VENV/uvicorn' app.main:app --host 0.0.0.0 --port 8001" >> "$LOGS/backend.log" 2>&1 < /dev/null &
sleep 5

# ── 3. Tunnel ──
echo "[3] Cloudflare tunnel ochilmoqda..."
: > "$LOGS/tunnel.log"
setsid "$ROOT/bin/cloudflared" tunnel --url http://localhost:8001 --no-autoupdate >> "$LOGS/tunnel.log" 2>&1 < /dev/null &
# Tunnel URL ni kutamiz
TUNNEL_URL=""
for i in $(seq 1 20); do
    TUNNEL_URL=$(grep -oE "https://[a-z0-9-]+\.trycloudflare\.com" "$LOGS/tunnel.log" | head -1)
    [ -n "$TUNNEL_URL" ] && break
    sleep 1
done
echo "    Tunnel: ${TUNNEL_URL:-(topilmadi)}"

# ── 4. Bot (tunnel URL bilan) ──
echo "[4] Telegram bot ishga tushmoqda..."
export MINI_APP_URL="${TUNNEL_URL:-https://localhost:8001}"
setsid bash -c "cd '$ROOT' && export MINI_APP_URL='$MINI_APP_URL' COMMUNITY_CHAT_ID='$COMMUNITY_CHAT_ID' BOT_TOKEN='$BOT_TOKEN' ADMIN_IDS='$ADMIN_IDS' DISABLE_GROUP_CHECK='$DISABLE_GROUP_CHECK' INTERNAL_API_URL='$INTERNAL_API_URL' API_URL='$API_URL' && exec '$VENV/python' bot/bot.py" >> "$LOGS/bot.log" 2>&1 < /dev/null &
sleep 4

echo ""
echo "════════════════════════════════════"
echo "  ✅ Hammasi ishga tushdi"
echo "  Mini App : ${TUNNEL_URL:-http://localhost:8001}"
echo "  To'xtatish: bash run-all.sh stop"
echo "════════════════════════════════════"

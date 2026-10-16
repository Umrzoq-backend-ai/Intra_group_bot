#!/bin/bash
# Backend (FastAPI) — systemd service uchun (foreground)
ROOT="/mnt/d/KIro_projectsbot/sphera-main"
VENV="$ROOT/.venv/bin"

export DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASS=postgres DB_NAME=radio_db
export REDIS_URL=redis://localhost:6379/0
export SECRET_KEY=devsecretkey1234567890devsecret
export UPLOAD_DIR=/mnt/d/KIro_projectsbot/sphera-main/.uploads AUDIO_DIR=/mnt/d/KIro_projectsbot/sphera-main/.audio
export MINIAPP_DIR="$ROOT/frontend/dist"
export FILLER_SECONDS=30
export BOT_TOKEN="${BOT_TOKEN:-}"
export COMMUNITY_CHAT_ID=-1003883809940
export ADMIN_IDS=7993413019
export DISABLE_GROUP_CHECK=true
export GEMINI_KEY=AIzaSyBQvjFvGyIJjkJPlr2IJilVHkKnOOo-pJ0
export GEMINI_MODEL=gemini-2.5-flash
export USE_MEDIAMTX=true MEDIAMTX_HOST=localhost MEDIAMTX_RTMP_PORT=1935
export MEDIAMTX_PUBLISH_PASS='MediaMTXPass2025!'
export TTS_PROVIDER=edge TTS_FALLBACK_EDGE=true
export AI_HOST_INTERVAL=60

# MediaMTX'ning HLS publik manzili (RTMP ingest — shu skriptdagi
# MEDIAMTX_HOST orqali, faqat backend uchun; bu esa tinglovchi brauzer
# to'g'ridan ulanadigan HLS manzili).
export MEDIAMTX_PUBLIC_URL='https://your-mediamtx-domain'

cd "$ROOT/backend"
exec "$VENV/uvicorn" app.main:app --host 0.0.0.0 --port 8001

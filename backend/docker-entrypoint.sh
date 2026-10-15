#!/bin/sh
# INTRA GROUP — Docker entrypoint
set -e

PORT="${PORT:-8001}"
export INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:${PORT}}"

# Icecast2 — jonli efir (USE_ICECAST=true bo'lsa)
if [ "${USE_ICECAST:-false}" = "true" ]; then
    icecast2 -c /etc/icecast2/icecast.xml &
    echo "[entrypoint] Icecast2 started on :8000"
fi

# Bot — backend tayyor bo'lishini kutib fonda ishga tushadi
if [ -n "${BOT_TOKEN}" ]; then
    (
        i=0
        while [ $i -lt 60 ]; do
            if curl -sf "http://localhost:${PORT}/health" > /dev/null 2>&1; then
                echo "[bot] Backend ready, starting bot"
                exec python /app/bot/bot.py
            fi
            sleep 1
            i=$((i + 1))
        done
        echo "[bot] Backend not ready — bot skipped"
    ) &
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT}" --workers 1 --log-level info

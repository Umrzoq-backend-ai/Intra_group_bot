# ============================================================
#  INTRA GROUP — Docker image for Render
#  Build context: repo root
#  Frontend avval build qilinib, /app/static ga serve qilinadi
# ============================================================

# ─── Stage 1: Frontend build (Node.js) ─────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# package.json avval copy → layer cache uchun
COPY frontend/package*.json ./

RUN npm ci --silent

# Barcha frontend kodi
COPY frontend/ .

# Same-origin deploy: VITE_* env bo'sh → relative URL'lar
RUN VITE_API_URL="" VITE_WS_URL="" VITE_RADIO_URL="" npm run build

# ─── Stage 2: Backend (Python 3.12 + FFmpeg + Icecast2) ─────
FROM python:3.12-slim

WORKDIR /app

# Tizim kutubxonalari
RUN echo "icecast2 icecast2/icecast-setup boolean false" | debconf-set-selections && \
    DEBIAN_FRONTEND=noninteractive apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        curl ffmpeg gcc python3-dev libpq-dev icecast2 && \
    rm -rf /var/lib/apt/lists/*

# Python bog'liqliklar
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend kodi
COPY backend/app ./app

# Bot kodi (backend bilan bitta containerda — Render free plan uchun)
COPY bot/ ./bot

# Frontend build natijasi → static/
COPY --from=frontend-builder /frontend/dist ./static

# Icecast konfiguratsiyasi
COPY infra/icecast/icecast.xml /etc/icecast2/icecast.xml
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Non-root user
RUN useradd -m -r appuser && \
    chown -R appuser:appuser /app && \
    mkdir -p /app/.audio /app/.uploads /var/log/icecast2 && \
    chown -R appuser:appuser /app/.audio /app/.uploads /var/log/icecast2 /etc/icecast2

USER appuser

ENV MINIAPP_DIR=/app/static
ENV AUDIO_DIR=/app/.audio
ENV UPLOAD_DIR=/app/.uploads

EXPOSE 8001

CMD ["docker-entrypoint.sh"]

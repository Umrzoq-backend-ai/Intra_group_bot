"""INTRA GROUP — Production-grade API entry point (v3.0).

Yangi TZ:
- Til tanlash (RU/EN/LT) → Yangilik → Platforma
- Kasr point tizimi (0.001 per text, 0.005 per voice)
- Level tizimi (1-3)
- Point transfer/request/purchase
"""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routers import (
    admin,
    auth,
    casting,
    chat,
    favorites,
    messages,
    music,
    news,
    opinions,
    radio,
    rooms,
    slots,
    stats,
    users,
    voicechat,
)
from app.core import redis as redis_client
from app.core.config import settings
from app.core.database import db
from app.core.logging_config import setup_logging
from app.core.middleware import RequestLoggingMiddleware

setup_logging(debug=settings.debug)
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle."""
    log.info("Starting %s v%s", settings.app_name, settings.app_version)

    # 1. Database (retry bilan)
    await db.connect()

    # 2. Schema migration (jadvallar yo'q bo'lsa yaratiladi)
    await _run_migrations()

    # 3. Redis (graceful fallback)
    await redis_client.connect()

    # 3.5 Xizmat narxlari (xabar/efir uchun point narxlari) — app_settings'dan
    from app.services import pricing

    await pricing.reload()

    # 4. Uzluksiz MediaMTX oqimi (USE_MEDIAMTX=true bo'lsa) — har til uchun worker
    from app.services import continuous

    await continuous.start()

    # 5. AI radio host — efirni uzluksiz kontent bilan to'ldiradi (USE_MEDIAMTX=true)
    from app.services import ai_host

    await ai_host.start()

    # 6. Voice Chat userbot (Telegram guruh ovozli chati — Boss talabi)
    from app.services import voicechat

    await voicechat.start()

    # 7. Slot muddati tugagan jonli efirlarni avto-to'xtatuvchi watchdog
    await radio.start_expiry_watchdog()

    log.info("Application started successfully")
    yield

    # Shutdown
    log.info("Shutting down...")
    await radio.stop_expiry_watchdog()
    await voicechat.stop()
    await ai_host.stop()
    await continuous.stop()
    await redis_client.disconnect()
    await db.disconnect()
    log.info("Shutdown complete")


async def _run_migrations() -> None:
    """Schema SQL faylini o'qib, jadvallarni yaratadi (CREATE IF NOT EXISTS)."""
    import os

    # __file__ = .../app/main.py — schema.sql shu papkaning "db" ostida
    # (bu formula lokal ishga tushirishда HAM, Docker'da HAM to'g'ri ishlaydi;
    # oldingi versiya "app"ni ikki marta qo'shib, faqat Docker'da tasodifan
    # to'g'ri chiqardi, lokal ishga tushirishда esa har doim migratsiyani
    # sukut bilan o'tkazib yuborardi).
    schema_path = os.path.join(os.path.dirname(__file__), "db", "schema.sql")
    if not os.path.exists(schema_path):
        schema_path = "/app/app/db/schema.sql"
    if not os.path.exists(schema_path):
        log.warning("Schema file not found, skipping migration")
        return
    try:
        with open(schema_path) as f:
            sql = f.read()
        await db.execute(sql)
        log.info("Database migration completed")
    except Exception as exc:
        log.error("Migration error (non-fatal): %s", exc)


app = FastAPI(
    title="INTRA GROUP API",
    version="3.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list if settings.origins_list != ["*"] else ["*"],
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.onrender\.com|http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging
app.add_middleware(RequestLoggingMiddleware)


# Statik javoblar uchun cache sarlavhalari — hech qanday Cache-Control
# bo'lmasa, mobil WebView'lar (xususan Telegram Mini App ichidagi iOS
# WKWebView) index.html'ni juda uzoq vaqt keshda saqlab qolishi mumkin,
# shuning uchun yangi deploy qilingan JS/CSS fayllar ko'rinmay qoladi
# (foydalanuvchi eski build'ni ko'raverdi). index.html hech qachon
# keshlanmasin (har doim eng yangi assets/*.js havolasini olib kelsin),
# assets/* esa fayl nomida hash bo'lgani uchun abadiy keshlansa bo'ladi.
@app.middleware("http")
async def _cache_control_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif "cache-control" not in response.headers:
        # index.html va SPA fallback (client-side routing — yo'l istalgan
        # bo'lishi mumkin, shuning uchun aniq "/" yoki ".html" bilan
        # cheklab bo'lmaydi) doim tarmoqdan qayta olinsin.
        response.headers["Cache-Control"] = "no-store"
    return response


# Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(chat.router)
app.include_router(news.router)
app.include_router(admin.router)
app.include_router(messages.router)
app.include_router(radio.router)
app.include_router(voicechat.router)
app.include_router(opinions.router)
app.include_router(stats.router)
app.include_router(favorites.router)
app.include_router(music.router)
app.include_router(slots.router)
app.include_router(casting.router)
app.include_router(rooms.router)


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled: %s %s — %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


# Health
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/health/ready")
async def readiness():
    db_ok = await db.health_check()
    redis_ok = redis_client.is_available()
    return {
        "status": "ready" if (db_ok and redis_ok) else "degraded",
        "checks": {"database": db_ok, "redis": redis_ok},
    }


@app.get("/api")
async def api_root():
    return {"service": "INTRA GROUP", "version": "3.0.0", "status": "ok"}


# Mini App statik fayllar (SPA fallback bilan)
if settings.miniapp_dir and os.path.isdir(settings.miniapp_dir):
    from fastapi.responses import FileResponse
    from starlette.exceptions import HTTPException as StarletteHTTPException

    _INDEX = os.path.join(settings.miniapp_dir, "index.html")
    _ASSETS = os.path.join(settings.miniapp_dir, "assets")

    if os.path.isdir(_ASSETS):
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    # Uploads statik (ovoz va fayllar uchun) — /chat/voice/ va /messages/voice/ ga qadar
    _upload_dir = settings.upload_dir
    if _upload_dir and os.path.isdir(_upload_dir):
        app.mount("/uploads", StaticFiles(directory=_upload_dir), name="uploads")

    @app.get("/")
    async def _spa_root():
        return FileResponse(_INDEX)

    @app.exception_handler(StarletteHTTPException)
    async def _spa_fallback(request, exc):
        # API yo'llari uchun JSON xato qaytaramiz
        api_prefixes = (
            "/auth/",
            "/users/",
            "/chat/",
            "/news/",
            "/admin/",
            "/messages/",
            "/radio/",
            "/health",
            "/api",
        )
        if request.url.path.startswith(api_prefixes):
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        # Frontend SPA uchun index.html
        if exc.status_code == 404 and request.method == "GET":
            accept = request.headers.get("accept", "")
            if "text/html" in accept:
                return FileResponse(_INDEX)
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    app.mount("/", StaticFiles(directory=settings.miniapp_dir, html=True), name="miniapp")
else:

    @app.get("/")
    async def root():
        return {"service": "INTRA GROUP", "version": "3.0.0", "status": "ok"}

import asyncio
import logging
import os
import secrets
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse, StreamingResponse

from app.core.config import settings
from app.core.constants import ROLE_LEVELS
from app.core.database import db
from app.core.dependencies import decode_token, get_current_user, require_role
from app.core.internal_auth import require_internal_key
from app.core.models import (
    OkResponse,
    RadioStatus,
    RadioStatusUpdate,
    SegmentOut,
    SegmentRegister,
)
from app.core.state import (
    AUDIO_DIR,
    VALID_CITIES,
    get_state,
    hls_stream_url,
    icecast_stream_url,
)
from app.core.ws_manager import manager
from app.services import broadcast

log = logging.getLogger("radio")

router = APIRouter(prefix="/radio", tags=["radio"])

BROADCAST_LANGS = ("ru", "lt", "en")

# Ведущийning hozir faol sloti bo'yicha efir vaqtini cheklaymiz (Requirement:
# efir faqat bron qilingan slot vaqtida ishlaydi, tugagach avto-tugaydi).
_broadcast_expiry: dict[str, datetime] = {}  # city -> slot tugash vaqti (UTC)
_broadcast_slot_id: dict[str, int] = {}  # city -> slot id
_watchdog_task: asyncio.Task | None = None

# Har bir jonli efir sessiyasi uchun bir martalik ulashiladigan link
# (EfirScreen dashboard'idagi "Копировать ссылку") — /start orqali bot
# shu tokenni "live_{token}" deb tanib, hozir kim efirda ekanini ko'rsatadi.
# BOT_USERNAME endi env/settings'dan olinadi — hardcode emas.
def _get_bot_username() -> str:
    return settings.bot_username or "unknown_bot"
_live_token_by_city: dict[str, str] = {}
_live_city_by_token: dict[str, str] = {}


async def _find_active_slot(user_id: int) -> dict | None:
    """Foydalanuvchining hozir vaqti kelgan (faol) sloti, agar bo'lsa."""
    row = await db.fetchrow(
        """
        SELECT id, scheduled_at, duration_min
        FROM broadcast_slots
        WHERE host_user_id = $1
          AND status IN ('scheduled', 'live')
          AND scheduled_at <= NOW()
          AND scheduled_at + make_interval(mins => duration_min) > NOW()
        ORDER BY scheduled_at DESC
        LIMIT 1
        """,
        user_id,
    )
    return dict(row) if row else None


async def _stop_city_broadcast(city: str) -> None:
    """Efirni to'xtatadi — foydalanuvchi /stop chaqirganda ham, slot tugaganda ham."""
    _http_broadcast_owner.pop(city, None)
    _broadcast_expiry.pop(city, None)
    slot_id = _broadcast_slot_id.pop(city, None)
    token = _live_token_by_city.pop(city, None)
    if token is not None:
        _live_city_by_token.pop(token, None)
    broadcast.close_session(city)

    from app.services import continuous

    continuous.resume("ru")

    if slot_id is not None:
        await db.execute("UPDATE broadcast_slots SET status = 'done' WHERE id = $1", slot_id)

    st = get_state(city)
    st.is_live = False
    st.broadcaster_type = "ai"
    st.broadcaster_name = "AI Host"
    await manager.broadcast(
        city,
        {
            "type": "radio_status",
            "data": st.to_dict(listeners_count=manager.listeners_count(city)),
        },
    )


async def _expiry_watchdog_loop() -> None:
    """Slot vaqti tugagan (lekin klient /stop chaqirmagan) efirlarni avto-tugatadi."""
    while True:
        await asyncio.sleep(5)
        now = datetime.now(UTC)
        expired = [c for c, exp in _broadcast_expiry.items() if now >= exp]
        for city in expired:
            try:
                await _stop_city_broadcast(city)
                log.info("Slot muddati tugadi — efir avto-to'xtatildi: %s", city)
            except Exception:
                log.exception("expiry watchdog: %s to'xtatib bo'lmadi", city)


async def start_expiry_watchdog() -> None:
    global _watchdog_task
    if _watchdog_task is None:
        _watchdog_task = asyncio.create_task(_expiry_watchdog_loop())


async def stop_expiry_watchdog() -> None:
    global _watchdog_task
    if _watchdog_task is not None:
        _watchdog_task.cancel()
        _watchdog_task = None


@router.post("/enqueue", dependencies=[Depends(require_internal_key)])
async def enqueue_segment(payload: dict):
    """AI host tayyor mp3 ni continuous worker navbatiga qo'shadi."""
    from app.services.continuous import enqueue

    lang = payload.get("lang", "ru")
    mp3_path = payload.get("mp3_path", "")
    if not mp3_path or not os.path.isfile(mp3_path):
        raise HTTPException(status_code=400, detail="File not found")
    ok = enqueue(lang, mp3_path)
    if not ok:
        raise HTTPException(status_code=503, detail="Queue not available")
    return {"ok": True, "lang": lang}


@router.post("/broadcast/clear")
async def clear_broadcast(city: str = Query(default="global")):
    """Qolib ketgan broadcast sessiyasini tozalaydi (admin uchun)."""
    broadcast.close_session(city)
    return {"ok": True, "city": city, "cleared": True}


@router.get("/status", response_model=RadioStatus)
async def radio_status(city: str = Query(...)):
    # "global" yoki VALID_CITIES da yo'q bo'lsa — umumiy holat qaytaramiz
    if city not in VALID_CITIES:
        from app.core.state import USE_ICECAST, USE_MEDIAMTX

        _stream = icecast_stream_url() if USE_ICECAST else hls_stream_url()
        return RadioStatus(
            is_live=True,
            broadcaster_type="ai",
            broadcaster_name="AI Host",
            listeners_count=0,
            use_hls=USE_MEDIAMTX and not USE_ICECAST,
            use_icecast=USE_ICECAST,
            stream_url=_stream,
        )
    st = get_state(city)
    return RadioStatus(**st.to_dict(listeners_count=manager.listeners_count(city)))


@router.get("/hls/{path:path}")
async def hls_proxy(path: str, request: Request):
    """MediaMTX HLS oqimini backend orqali proksi qiladi.

    MediaMTX odatda faqat ichki tarmoqda (masalan localhost yoki docker
    network) ishlaydi va alohida oshkor qilinmagan — klient (Telegram Mini
    App) faqat backend'ning ochiq tunnel'iga ulanadi. Shu sabab .m3u8/.ts
    so'rovlarini backend o'zi MediaMTX'dan olib, xuddi shu origin orqali
    qaytaradi (mixed-content va "localhost klient qurilmasiga ishora
    qiladi" muammolarining oldini oladi).

    MediaMTX HLS server sessiyani cookie orqali kuzatadi (birinchi so'rovga
    "cookieCheck" bilan 302 qaytaradi), shuning uchun klient↔MediaMTX
    o'rtasida cookie va query-string (masalan ?session=...) ikki tomonlama
    forward qilinishi kerak — aks holda keyingi (media playlist/segment)
    so'rovlar 401 bilan qaytadi.
    """
    if not broadcast.USE_MEDIAMTX or ".." in path:
        raise HTTPException(status_code=404, detail="Not found")

    url = f"http://{broadcast.MEDIAMTX_HOST}:{settings.mediamtx_hls_port}/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"

    fwd_headers = {}
    if request.headers.get("cookie"):
        fwd_headers["cookie"] = request.headers["cookie"]

    client = httpx.AsyncClient(timeout=10.0)
    try:
        # MediaMTX birinchi so'rovga sessiya cookie o'rnatish uchun 302 bilan
        # javob beradi ("cookieCheck") — shu redirect'ni server ichida bosib
        # o'tamiz, aks holda klientga ichki MediaMTX manzili sizib chiqadi.
        upstream = await client.send(
            client.build_request("GET", url, headers=fwd_headers),
            stream=True,
            follow_redirects=True,
        )
    except httpx.RequestError:
        await client.aclose()
        raise HTTPException(status_code=502, detail="MediaMTX unreachable")

    if upstream.status_code != 200:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=upstream.status_code, detail="Upstream error")

    async def body() -> AsyncIterator[bytes]:
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    media_type = upstream.headers.get("content-type", "application/octet-stream")
    # Playlist (.m3u8) tez-tez yangilanadi — kesh qilinmasin
    headers = {"Cache-Control": "no-cache"} if path.endswith(".m3u8") else {}
    resp = StreamingResponse(body(), media_type=media_type, headers=headers)
    # Sessiya cookie'sini (redirect zanjiridagi barcha bosqichlardan) klientga
    # qaytaramiz — keyingi so'rovlarda brauzer o'zi qaytarib yuboradi.
    for hop in (*upstream.history, upstream):
        for raw_cookie in hop.headers.get_list("set-cookie"):
            resp.headers.append("set-cookie", raw_cookie)
    return resp


@router.get("/live/{lang}")
async def icecast_proxy(lang: str):
    """Icecast oqimini backend orqali proksi qiladi (deyarli real vaqt).

    Icecast xuddi MediaMTX kabi faqat ichki tarmoqda ishlaydi — klient shu
    proksiga ulanadi, ichki manzil oshkor qilinmaydi.

    Baytlar kelgan zahoti uzatiladi — sun'iy kechikish/bufer yo'q. Avval
    ~6-8s qasddan kechikish sinab ko'rilgan edi (buferга yetarli bayt
    yig'ilgunча klientga hech narsa yubormaslik), lekin bu mobil WebView'да
    "play()" chaqirilgach bir necha soniya hech qanday bayt kelmasligiga olib
    keldi — ba'zi pleyerlarning o'zining ichki stall-taймаути bizning JS
    tarafdagi 12s kutishdan oldinroq ishga tushib, sukut bilan uzilib
    qolishga sabab bo'lgan (xato ko'rsatilmasdan). Ishonchlilik ustunroq —
    Icecast'ning tabiiy past kechikishi (~1-3s) bilan qoldirilgan.
    """
    if lang not in BROADCAST_LANGS:
        raise HTTPException(status_code=404, detail="Unknown stream language")
    if not broadcast.USE_ICECAST:
        raise HTTPException(status_code=404, detail="Icecast disabled")

    upstream_url = f"http://{broadcast.ICECAST_HOST}:{settings.icecast_port}/live_{lang}"

    async def body() -> AsyncIterator[bytes]:
        # read=10.0: manba vaqtincha jim bo'lib qolsa (masalan continuous.py
        # pause/resume o'tishida) uzilish tezda sezilib qayta ulanadi — aks
        # holda klient hech qanday xatosiz cheksiz osilib qolardi.
        timeout = httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
        for _attempt in range(1000):
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream(
                        "GET", upstream_url, headers={"Icy-MetaData": "0"}
                    ) as resp:
                        if resp.status_code != 200:
                            await asyncio.sleep(0.5)
                            continue
                        async for chunk in resp.aiter_bytes(4096):
                            yield chunk
            except (httpx.ConnectError, httpx.ReadError, httpx.ReadTimeout, httpx.RemoteProtocolError):
                await asyncio.sleep(0.5)
                continue
            except Exception:  # noqa: BLE001
                return

    return StreamingResponse(
        body(),
        media_type="audio/mpeg",
        headers={
            "Cache-Control": "no-cache, no-store",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # nginx/cloudflare buferingini o'chiradi
            "X-Content-Type-Options": "nosniff",
            "Transfer-Encoding": "chunked",
            "icy-name": f"Radio AI {lang.upper()}",
        },
    )


@router.post("/status", response_model=OkResponse, dependencies=[Depends(require_internal_key)])
async def update_radio_status(payload: RadioStatusUpdate):
    if payload.city not in VALID_CITIES:
        raise HTTPException(status_code=400, detail="Unknown city")

    st = get_state(payload.city)
    st.is_live = payload.is_live
    st.broadcaster_type = payload.broadcaster_type
    st.broadcaster_name = payload.broadcaster_name

    if payload.script:
        await db.execute(
            """
            INSERT INTO broadcasts (city, script, broadcaster_type, duration_sec)
            VALUES ($1, $2, $3, $4)
            """,
            payload.city,
            payload.script,
            payload.broadcaster_type,
            payload.duration_sec,
        )

    await manager.broadcast(
        payload.city,
        {
            "type": "radio_status",
            "data": st.to_dict(listeners_count=manager.listeners_count(payload.city)),
        },
    )
    return OkResponse()


@router.post("/segment", response_model=SegmentOut, dependencies=[Depends(require_internal_key)])
async def register_segment(payload: SegmentRegister):
    """radio-host yangi AI ovoz segmentini ro'yxatga oladi. Internal API key required."""
    if payload.city not in VALID_CITIES:
        raise HTTPException(status_code=400, detail="Unknown city")

    st = get_state(payload.city)
    st.is_live = True
    if st.broadcaster_type != "doverenniy":
        st.broadcaster_type = "ai"
        st.broadcaster_name = "AI Host"

    seg = st.add_segment(payload.filename, payload.script, payload.duration_sec)

    await db.execute(
        """
        INSERT INTO broadcasts (city, script, broadcaster_type, duration_sec)
        VALUES ($1, $2, 'ai', $3)
        """,
        payload.city,
        payload.script,
        payload.duration_sec,
    )

    url = f"/radio/audio/{payload.city}/{payload.filename}"

    # Tinglovchilarga yangi segment haqida xabar
    await manager.broadcast(
        payload.city,
        {
            "type": "new_segment",
            "data": {
                "id": seg["id"],
                "url": url,
                "script": payload.script,
                "duration_sec": payload.duration_sec,
                "broadcaster_type": st.broadcaster_type,
                "broadcaster_name": st.broadcaster_name,
            },
        },
    )

    return SegmentOut(
        id=seg["id"],
        filename=payload.filename,
        script=payload.script,
        duration_sec=payload.duration_sec,
        url=url,
    )


@router.get("/playlist", response_model=list[SegmentOut])
async def playlist(city: str = Query(...)):
    """Shahar uchun oxirgi AI segmentlar ro'yxati."""
    if city not in VALID_CITIES:
        raise HTTPException(status_code=400, detail="Unknown city")
    st = get_state(city)
    return [
        SegmentOut(
            id=s["id"],
            filename=s["filename"],
            script=s["script"],
            duration_sec=s["duration_sec"],
            url=f"/radio/audio/{city}/{s['filename']}",
        )
        for s in st.segments
    ]


@router.get("/audio/{city}/{filename}")
async def get_audio(city: str, filename: str):
    """AI ovoz segment faylini qaytaradi (ichki rejim)."""
    if city not in VALID_CITIES:
        raise HTTPException(status_code=400, detail="Unknown city")
    # Yo'l xavfsizligi — faqat fayl nomi
    safe_name = os.path.basename(filename)
    path = os.path.join(AUDIO_DIR, city, safe_name)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Segment not found")
    return FileResponse(path, media_type="audio/mpeg")


@router.post("/live/start", response_model=OkResponse)
async def live_start(
    city: str = Query(...),
    user: dict = Depends(require_role("doverenniy")),
):
    if city not in VALID_CITIES:
        raise HTTPException(status_code=400, detail="Unknown city")

    st = get_state(city)
    st.is_live = True
    st.broadcaster_type = "doverenniy"
    st.broadcaster_name = user["full_name"] or user["username"] or "Doverenniy"

    await manager.broadcast(
        city,
        {
            "type": "radio_status",
            "data": st.to_dict(listeners_count=manager.listeners_count(city)),
        },
    )
    return OkResponse(detail={"city": city, "broadcaster": st.broadcaster_name})


@router.post("/live/stop", response_model=OkResponse)
async def live_stop(
    city: str = Query(...),
    user: dict = Depends(require_role("doverenniy")),
):
    if city not in VALID_CITIES:
        raise HTTPException(status_code=400, detail="Unknown city")

    st = get_state(city)
    st.broadcaster_type = "ai"
    st.broadcaster_name = "AI Host"

    await manager.broadcast(
        city,
        {
            "type": "radio_status",
            "data": st.to_dict(listeners_count=manager.listeners_count(city)),
        },
    )
    return OkResponse(detail={"city": city})


@router.websocket("/{city}/broadcast/ws")
async def broadcast_ws(websocket: WebSocket, city: str, token: str = Query(...)):
    """Doverenniy mikrofon audiosini MediaMTX'ga uzatadi (jonli efir).

    Audio: webm/opus binary chunklar. Faqat doverenniy/admin.
    """
    # Shahar tekshiruvi — "global" ham qabul qilinadi
    if city not in VALID_CITIES and city != "global":
        await websocket.close(code=4404)
        return

    # Token + rol tekshiruvi
    try:
        telegram_id = decode_token(token)
    except HTTPException:
        await websocket.close(code=4401)
        return

    user = await db.fetchrow("SELECT * FROM users WHERE telegram_id = $1", telegram_id)
    if user is None:
        await websocket.close(code=4401)
        return
    if ROLE_LEVELS.get(user["role"], 0) < ROLE_LEVELS["doverenniy"]:
        approved_mic = await db.fetchrow(
            """
            SELECT id FROM live_mic_requests
            WHERE user_id = $1 AND status = 'approved'
              AND created_at >= NOW() - INTERVAL '30 minutes'
            ORDER BY id DESC LIMIT 1
            """,
            user["id"],
        )
        if not approved_mic:
            await websocket.close(code=4403)  # huquq yo'q
            return

    await websocket.accept()

    # Dev rejim: MediaMTX yo'q — jonli efir mavjud emas (Requirement 6.5)
    if not broadcast.is_available():
        await websocket.send_json(
            {
                "type": "broadcast_unavailable",
                "reason": "mediamtx_disabled",
            }
        )
        await websocket.close(code=1000)
        return

    # Bitta shaharда bitta broadcaster (Requirement 5.5)
    if broadcast.is_busy(city):
        await websocket.send_json(
            {
                "type": "broadcast_busy",
                "reason": "city_already_live",
            }
        )
        await websocket.close(code=1000)
        return

    name = user["full_name"] or user["username"] or "Doverenniy"

    # Continuous worker'ni pauza qilamiz — mount'ni bo'shatamiz (RU jonli efir uchun)
    from app.services import continuous

    continuous.pause("ru")
    # Worker joriy filler bo'lagini tugatib mount'ni HAQIQATAN bo'shatgunча
    # kutamiz (fiksirlangan sleep emas — real-vaqt yozish 1s dan oshishi
    # mumkin, aks holda yangi ffmpeg eskisi bilan to'qnashib bir necha
    # soniyadan keyin uzilib qoladi).
    for _ in range(40):  # 40 x 100ms = 4s max kutish
        if continuous.is_stream_closed("ru"):
            break
        await asyncio.sleep(0.1)

    session = broadcast.open_session(city, name)
    if session is None:
        continuous.resume("ru")
        await websocket.send_json({"type": "broadcast_busy"})
        await websocket.close(code=1000)
        return

    live_token = secrets.token_urlsafe(6)
    _live_token_by_city[city] = live_token
    _live_city_by_token[live_token] = city
    share_url = f"https://t.me/{_get_bot_username()}?start=live_{live_token}"

    # Efir holatini live qilamiz
    st = get_state(city)
    st.is_live = True
    st.broadcaster_type = "doverenniy"
    st.broadcaster_name = name
    await manager.broadcast(
        city,
        {
            "type": "radio_status",
            "data": st.to_dict(listeners_count=manager.listeners_count(city)),
        },
    )
    await websocket.send_json({"type": "broadcast_started", "share_url": share_url})

    try:
        while True:
            chunk = await websocket.receive_bytes()
            ok = broadcast.feed(city, chunk)
            if not ok:
                await websocket.send_json({"type": "broadcast_error"})
                break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        broadcast.close_session(city)
        # Continuous worker'ni davom ettiramiz (AI host / filler)
        continuous.resume("ru")
        # AI hostга qaytaramiz
        st.broadcaster_type = "ai"
        st.broadcaster_name = "AI Host"
        await manager.broadcast(
            city,
            {
                "type": "radio_status",
                "data": st.to_dict(listeners_count=manager.listeners_count(city)),
            },
        )


# ──────────────────────────────────────────────────────────
# HTTP fallback (ba'zi Telegram WebView'larda WebSocket ishlamaydi —
# mikrofon audiosini oddiy POST chunk'lar orqali uzatamiz).
# ──────────────────────────────────────────────────────────

_http_broadcast_owner: dict[str, int] = {}  # city -> user_id


@router.post("/{city}/broadcast/start")
async def broadcast_http_start(city: str, user: dict = Depends(get_current_user)):
    """[doverenniy+ yoki tasdiqlangan mikrofon so'rovi] Mikrofon efirini boshlaydi.

    Doverenniy uchun efir faqat hozir vaqti kelgan (bron qilingan) sloti
    bo'lganda boshlanadi — slot bo'lmasa "no_slot" qaytariladi. Admin uchun
    slot shart emas — vaqt chegarasiz efirga chiqa oladi.
    Tinglovchi (listener) uchun esa live mic so'rovi tasdiqlangan bo'lsa
    5 daqiqa jonli chiqish beriladi.
    """
    if city not in VALID_CITIES and city != "global":
        raise HTTPException(status_code=404, detail="City not found")

    if not broadcast.is_available():
        return {"status": "unavailable"}
    if broadcast.is_busy(city):
        return {"status": "busy"}

    is_admin = user["role"] == "admin"
    is_doverenniy = ROLE_LEVELS.get(user["role"], 0) >= ROLE_LEVELS["doverenniy"]
    slot = None
    expires_at: datetime | None = None
    remaining_sec: int | None = None

    if is_admin:
        pass
    elif is_doverenniy:
        slot = await _find_active_slot(user["id"])
        if not slot:
            return {"status": "no_slot"}

        expires_at = slot["scheduled_at"] + timedelta(minutes=slot["duration_min"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        remaining_sec = int((expires_at - datetime.now(UTC)).total_seconds())
        if remaining_sec <= 0:
            return {"status": "no_slot"}
    else:
        # Jonli efirda so'z olish so'rovi tasdiqlanganmi tekshiramiz
        approved_mic = await db.fetchrow(
            """
            SELECT id FROM live_mic_requests
            WHERE user_id = $1 AND status = 'approved'
              AND created_at >= NOW() - INTERVAL '30 minutes'
            ORDER BY id DESC LIMIT 1
            """,
            user["id"],
        )
        if not approved_mic:
            raise HTTPException(status_code=403, detail="Not authorized to broadcast")
        remaining_sec = 300  # 5 daqiqa
        expires_at = datetime.now(UTC) + timedelta(seconds=remaining_sec)

    name = user["full_name"] or user["username"] or "Doverenniy"

    from app.services import continuous

    continuous.pause("ru")
    # Fiksirlangan sleep(1.0) o'rniga — worker filler bo'lagini yozib
    # bo'lgunча (real-vaqt -re tufayli bu 1 soniyadan oshishi mumkin edi)
    # mount haqiqatan bo'shaguncha kutamiz, aks holda yangi ffmpeg eski
    # bilan bir vaqtda ulanishga urinib, bir necha soniyadan keyin
    # uziladi ("В эфир" bosilgandan 2 soniya o'tib o'zi to'xtab qolishi).
    for _ in range(40):  # 40 x 100ms = 4s max kutish
        if continuous.is_stream_closed("ru"):
            break
        await asyncio.sleep(0.1)

    session = broadcast.open_session(city, name)
    if session is None:
        continuous.resume("ru")
        return {"status": "busy"}

    _http_broadcast_owner[city] = user["id"]
    if slot is not None and expires_at is not None:
        _broadcast_expiry[city] = expires_at
        _broadcast_slot_id[city] = slot["id"]
        await db.execute("UPDATE broadcast_slots SET status = 'live' WHERE id = $1", slot["id"])

    # Shu sessiya uchun bir martalik ulashiladigan link — har safar "В
    # эфир" bosilganda YANGI token (o'sha shaharда oldingi efirlarniki
    # ishlamay qoladi, chaqiruvchi ularni /start orqali "efir tugagan"
    # deb ko'radi — quyidagi live-by-token endpoint'ga qarang).
    live_token = secrets.token_urlsafe(6)
    _live_token_by_city[city] = live_token
    _live_city_by_token[live_token] = city
    share_url = f"https://t.me/{_get_bot_username()}?start=live_{live_token}"

    st = get_state(city)
    st.is_live = True
    st.broadcaster_type = "doverenniy"
    st.broadcaster_name = name
    await manager.broadcast(
        city,
        {
            "type": "radio_status",
            "data": st.to_dict(listeners_count=manager.listeners_count(city)),
        },
    )
    return {
        "status": "started",
        "remaining_sec": remaining_sec,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "share_url": share_url,
    }


@router.post("/{city}/broadcast/chunk")
async def broadcast_http_chunk(
    city: str, request: Request, user: dict = Depends(require_role("doverenniy"))
):
    """[doverenniy+] Navbatdagi audio chunk'ni yuboradi (HTTP chunk fallback)."""
    if _http_broadcast_owner.get(city) != user["id"]:
        raise HTTPException(status_code=403, detail="No active broadcast session for this user")

    expiry = _broadcast_expiry.get(city)
    if expiry is not None and datetime.now(UTC) >= expiry:
        await _stop_city_broadcast(city)
        raise HTTPException(status_code=410, detail="Slot time expired")

    chunk = await request.body()
    ok = broadcast.feed(city, chunk)
    if not ok:
        raise HTTPException(status_code=400, detail="Feed failed")
    return {"ok": True}


@router.post("/{city}/broadcast/stop")
async def broadcast_http_stop(city: str, user: dict = Depends(get_current_user)):
    """Mikrofon efirini tugatadi (HTTP chunk fallback)."""
    if _http_broadcast_owner.get(city) != user["id"] and user["role"] != "admin":
        raise HTTPException(status_code=403, detail="No active broadcast session for this user")

    await _stop_city_broadcast(city)
    return {"ok": True}


@router.get("/live-by-token/{token}")
async def live_by_token(token: str):
    """Bot /start live_{token} deep-link'ini shu orqali hal qiladi — hech
    qanday auth talab qilinmaydi (efir holati o'zi ochiq/umumiy ma'lumot,
    xuddi radio status kabi). Token o'sha efir sessiyasi tugagach ishlamay
    qoladi (_stop_city_broadcast uni tozalaydi) — bot shunda "efir tugadi"
    deb ko'rsatadi, eski (allaqachon tugagan) linklar chalkash bo'lmasin."""
    city = _live_city_by_token.get(token)
    if city is None:
        return {"live": False}
    st = get_state(city)
    if not st.is_live:
        return {"live": False}
    return {
        "live": True,
        "city": city,
        "broadcaster_name": st.broadcaster_name,
        "listeners_count": manager.listeners_count(city),
    }


# ============ Jonli efirda so'z olish / Mikrofon so'rovlari (Live Hand Raise) ============
@router.post("/{city}/mic-requests")
async def request_live_mic(city: str, user: dict = Depends(get_current_user)):
    """[listener] Jonli efirda so'z olish / mikrofon so'rovi yuborish (qo'l ko'tarish)."""
    st = get_state(city)
    if not st.is_live:
        raise HTTPException(status_code=400, detail="Hozir jonli efir mavjud emas")

    existing = await db.fetchrow(
        """
        SELECT id, status FROM live_mic_requests
        WHERE user_id = $1 AND city = $2 AND status = 'pending'
          AND created_at >= NOW() - INTERVAL '15 minutes'
        ORDER BY id DESC LIMIT 1
        """,
        user["id"],
        city,
    )
    if existing:
        return {"ok": True, "request_id": existing["id"], "status": "pending"}

    row = await db.fetchrow(
        """
        INSERT INTO live_mic_requests (user_id, city, status)
        VALUES ($1, $2, 'pending')
        RETURNING id, created_at
        """,
        user["id"],
        city,
    )

    display_name = (
        user.get("display_name")
        or user.get("username")
        or user.get("full_name")
        or f"id{user['telegram_id']}"
    )
    await manager.broadcast(
        city,
        {
            "type": "mic_request",
            "data": {
                "id": row["id"],
                "user_id": user["id"],
                "telegram_id": user.get("telegram_id"),
                "username": user.get("username"),
                "display_name": display_name,
                "created_at": row["created_at"].isoformat(),
            },
        },
    )
    return {"ok": True, "request_id": row["id"], "status": "pending"}


@router.get("/{city}/mic-requests")
async def list_mic_requests(city: str, user: dict = Depends(get_current_user)):
    """[broadcaster/staff] Jonli efirda mikrofon so'raganlar ro'yxati."""
    is_staff_or_host = (
        ROLE_LEVELS.get(user["role"], 0) >= ROLE_LEVELS["doverenniy"]
        or _http_broadcast_owner.get(city) == user["id"]
    )
    if not is_staff_or_host:
        raise HTTPException(status_code=403, detail="Faqat boshlovchi yoki admin ko'ra oladi")

    rows = await db.fetch(
        """
        SELECT r.id, r.user_id, r.status, r.created_at,
               u.telegram_id, u.username, u.display_name, u.full_name
        FROM live_mic_requests r
        JOIN users u ON u.id = r.user_id
        WHERE r.city = $1 AND r.status = 'pending'
          AND r.created_at >= NOW() - INTERVAL '1 hour'
        ORDER BY r.created_at ASC
        """,
        city,
    )
    out = []
    for r in rows:
        disp = r["display_name"] or r["username"] or r["full_name"] or f"id{r['telegram_id']}"
        out.append(
            {
                "id": r["id"],
                "user_id": r["user_id"],
                "telegram_id": r["telegram_id"],
                "username": r["username"],
                "display_name": disp,
                "status": r["status"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
        )
    return out


@router.post("/{city}/mic-requests/{request_id}/approve")
async def approve_mic_request(city: str, request_id: int, user: dict = Depends(get_current_user)):
    """[broadcaster/staff] Ishtirokchiga mikrofon berish / efirga ulash."""
    is_staff_or_host = (
        ROLE_LEVELS.get(user["role"], 0) >= ROLE_LEVELS["doverenniy"]
        or _http_broadcast_owner.get(city) == user["id"]
    )
    if not is_staff_or_host:
        raise HTTPException(status_code=403, detail="Faqat boshlovchi yoki admin ruxsat bera oladi")

    req = await db.fetchrow(
        "SELECT r.*, u.telegram_id, u.username, u.display_name FROM live_mic_requests r JOIN users u ON u.id = r.user_id WHERE r.id = $1",
        request_id,
    )
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    await db.execute(
        "UPDATE live_mic_requests SET status = 'approved', decided_at = NOW() WHERE id = $1",
        request_id,
    )

    await manager.broadcast(
        city,
        {
            "type": "mic_approved",
            "data": {
                "request_id": request_id,
                "user_id": req["user_id"],
                "telegram_id": req["telegram_id"],
                "display_name": req["display_name"] or req["username"] or f"id{req['telegram_id']}",
            },
        },
    )
    return {"ok": True, "user_id": req["user_id"], "status": "approved"}


@router.post("/{city}/mic-requests/{request_id}/reject")
async def reject_mic_request(city: str, request_id: int, user: dict = Depends(get_current_user)):
    """[broadcaster/staff] Mikrofon so'rovini rad etish."""
    is_staff_or_host = (
        ROLE_LEVELS.get(user["role"], 0) >= ROLE_LEVELS["doverenniy"]
        or _http_broadcast_owner.get(city) == user["id"]
    )
    if not is_staff_or_host:
        raise HTTPException(status_code=403, detail="Faqat boshlovchi yoki admin rad eta oladi")

    req = await db.fetchrow("SELECT * FROM live_mic_requests WHERE id = $1", request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")

    await db.execute(
        "UPDATE live_mic_requests SET status = 'rejected', decided_at = NOW() WHERE id = $1",
        request_id,
    )

    await manager.broadcast(
        city,
        {
            "type": "mic_rejected",
            "data": {
                "request_id": request_id,
                "user_id": req["user_id"],
            },
        },
    )
    return {"ok": True, "status": "rejected"}


@router.get("/{city}/mic-requests/me")
async def get_my_mic_request(city: str, user: dict = Depends(get_current_user)):
    """[listener] O'zimning mikrofon so'rovi holatini tekshirish."""
    row = await db.fetchrow(
        """
        SELECT id, status, created_at, decided_at
        FROM live_mic_requests
        WHERE user_id = $1 AND city = $2
          AND created_at >= NOW() - INTERVAL '30 minutes'
        ORDER BY id DESC LIMIT 1
        """,
        user["id"],
        city,
    )
    if not row:
        return {"status": "none", "request_id": None}
    return {
        "status": row["status"],
        "request_id": row["id"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }

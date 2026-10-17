"""Chat router — INTRA GROUP v3.0.

- Matn xabar: -0.001 point
- Ovozli xabar: -0.005 point
- WebSocket real-time
- Point yetmasa — xabar yuborilmaydi
"""

import asyncio
import logging
import os
import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.database import db
from app.core.dependencies import decode_token, get_current_user
from app.core.models import ChatMessageOut, ChatMessageRequest, OkResponse
from app.core.ws_manager import manager
from app.services import membership
from app.services import points as points_service

log = logging.getLogger("chat")

router = APIRouter(prefix="/chat", tags=["chat"])

# Ovozli xabar uchun ruxsat etilgan formatlar
_ALLOWED_AUDIO = {".webm", ".ogg", ".mp3", ".m4a", ".wav", ".oga"}


def _display_name(user: dict) -> str:
    return (
        user.get("display_name")
        or user.get("username")
        or user.get("full_name")
        or f"id{user['telegram_id']}"
    )


async def _convert_to_mp3_background(src_path: str, mp3_fpath: str) -> None:
    """Audio faylni fonda MP3'ga konvert qiladi (ffmpeg).

    Xabar allaqachon shu mp3 fayl nomi bilan yuborilgan/broadcast qilingan
    bo'ladi — shuning uchun bu funksiya HTTP javobini BLOKLAMAYDI (fire-and-
    forget, asyncio.create_task orqali chaqiriladi). Oldingi versiyada
    konvertatsiya `await` qilinardi, ya'ni foydalanuvchi ffmpeg tugashini
    kutib turishi kerak edi — xabar "darhol yuborilmayapti" degan shikoyat
    aynan shundan edi.
    """
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg",
            "-y",
            "-i",
            src_path,
            "-vn",
            "-acodec",
            "libmp3lame",
            "-b:a",
            "64k",
            mp3_fpath,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode == 0 and os.path.isfile(mp3_fpath) and os.path.getsize(mp3_fpath) > 0:
            try:
                os.remove(src_path)
            except OSError:
                pass
            return
        log.warning("ffmpeg conversion failed (rc=%s), falling back to original file", proc.returncode)
    except FileNotFoundError:
        log.warning("ffmpeg not found, falling back to original audio format")
    except Exception as exc:
        log.warning("ffmpeg conversion error: %s, falling back to original file", exc)

    # Konvertatsiya muvaffaqiyatsiz bo'lsa — xabar allaqachon mp3 nomi bilan
    # yuborilgani uchun kamida shu nomga asl faylni ko'chiramiz (bo'lmasa
    # havola butunlay ishlamay qoladi).
    try:
        if os.path.isfile(src_path) and not os.path.isfile(mp3_fpath):
            os.replace(src_path, mp3_fpath)
    except OSError:
        pass


@router.get("/history", response_model=list[ChatMessageOut])
async def get_chat_history(limit: int = 50):
    """Oxirgi chat xabarlari (umumiy chat — guruh xabarlari bu yerga chiqmaydi)."""
    rows = await db.fetch(
        """
        SELECT c.id, u.telegram_id, u.username, u.display_name, c.message, c.message_type,
               c.audio_file_path, c.created_at
        FROM chat_messages c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.room_id IS NULL
        ORDER BY c.created_at DESC
        LIMIT $1
        """,
        limit,
    )
    rows = list(reversed(rows))
    out = []
    for r in rows:
        voice_url = None
        if r["message_type"] == "voice" and r["audio_file_path"]:
            # Relative (same-origin) URL — Telegram WebApp tunnel orqali ishlaydi
            voice_url = f"/chat/voice/{r['audio_file_path']}"
        out.append(
            ChatMessageOut(
                id=r["id"],
                telegram_id=r["telegram_id"],
                username=r["username"],
                display_name=r["display_name"],
                message=r["message"],
                message_type=r["message_type"] or "text",
                voice_url=voice_url,
                created_at=r["created_at"],
            )
        )
    return out


@router.post("/send", response_model=OkResponse)
async def send_message(
    payload: ChatMessageRequest,
    user: dict = Depends(get_current_user),
):
    """Matn xabar yuborish — 0.001 point sarflanadi."""
    if not payload.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    # Point sarflash
    spent = await points_service.spend_text(user["id"])
    if not spent["ok"]:
        raise HTTPException(
            status_code=402,
            detail={"error": "insufficient_points", "points": str(spent["points"])},
        )

    row = await db.fetchrow(
        """
        INSERT INTO chat_messages (user_id, message, message_type)
        VALUES ($1, $2, 'text')
        RETURNING id, created_at
        """,
        user["id"],
        payload.message.strip(),
    )

    # Broadcast
    await manager.broadcast(
        "global",
        {
            "type": "chat",
            "data": {
                "id": row["id"],
                "telegram_id": user.get("telegram_id"),
                "username": user["username"],
                "display_name": _display_name(user),
                "message": payload.message.strip(),
                "message_type": "text",
                "created_at": row["created_at"].isoformat(),
            },
        },
    )

    return OkResponse(detail={"points": str(spent["points"])})


# ============ Ovozli xabar (chatga) — 0.005 point ============
@router.post("/voice", response_model=OkResponse)
async def send_voice(
    audio_file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Chatga ovozli xabar yuborish — 0.005 point sarflanadi."""
    # Format tekshiruvi
    ext = os.path.splitext(audio_file.filename or "")[1].lower() or ".webm"
    if ext not in _ALLOWED_AUDIO:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    # Point sarflash (0.005)
    spent = await points_service.spend_voice(user["id"])
    if not spent["ok"]:
        raise HTTPException(
            status_code=402,
            detail={"error": "insufficient_points", "points": str(spent["points"])},
        )

    # Faylni saqlash
    os.makedirs(settings.upload_dir, exist_ok=True)
    content = await audio_file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    uid = uuid.uuid4().hex
    raw_fname = f"voice_{uid}{ext}"
    raw_fpath = os.path.join(settings.upload_dir, raw_fname)
    with open(raw_fpath, "wb") as f:
        f.write(content)

    # Universal MP3 ga konvertatsiya — barcha brauzer/Telegram WebView ijro
    # etadi (webm/ogg ba'zi platformalarda, ayniqsa iOS, ishlamaydi). Bu
    # fonda ishlaydi — javobni va WS broadcast'ni bloklamaydi, chunki
    # foydalanuvchi xabar "darhol yuborilishi"ni kutadi.
    fname = f"voice_{uid}.mp3"
    mp3_fpath = os.path.join(settings.upload_dir, fname)
    asyncio.create_task(_convert_to_mp3_background(raw_fpath, mp3_fpath))

    row = await db.fetchrow(
        """
        INSERT INTO chat_messages (user_id, message, message_type, audio_file_path, audio_data)
        VALUES ($1, '', 'voice', $2, $3)
        RETURNING id, created_at
        """,
        user["id"],
        fname,
        content,
    )

    voice_url = f"/chat/voice/{fname}"
    # Relative (same-origin) URL — Telegram WebApp tunnel orqali ishlaydi
    full_voice_url = voice_url

    await manager.broadcast(
        "global",
        {
            "type": "chat",
            "data": {
                "id": row["id"],
                "telegram_id": user.get("telegram_id"),
                "username": user["username"],
                "display_name": _display_name(user),
                "message": "",
                "message_type": "voice",
                "voice_url": full_voice_url,
                "created_at": row["created_at"].isoformat(),
            },
        },
    )

    return OkResponse(detail={"points": str(spent["points"]), "voice_url": full_voice_url})


@router.get("/voice/{filename}")
async def get_voice(filename: str):
    """Ovozli xabar faylini qaytaradi."""
    safe = os.path.basename(filename)
    fpath = os.path.join(settings.upload_dir, safe)
    if not os.path.isfile(fpath):
        # 1. Ephemeral diskda yo'q bo'lsa (server restart), PostgreSQL'dan tiklaymiz
        try:
            row = await db.fetchrow(
                """
                SELECT audio_data FROM chat_messages
                WHERE audio_file_path = $1 OR audio_file_path LIKE $2
                LIMIT 1
                """,
                safe,
                f"%{safe}%",
            )
            if row and row["audio_data"]:
                os.makedirs(settings.upload_dir, exist_ok=True)
                with open(fpath, "wb") as f:
                    f.write(row["audio_data"])
        except Exception as e:
            log.warning("Failed to restore voice from db: %s", e)

        # 2. Agar hali ham yo'q bo'lsa (fon konvertatsiyasi ketayotgan bo'lsa), qisqa kutamiz
        if not os.path.isfile(fpath):
            for _ in range(15):
                await asyncio.sleep(0.1)
                if os.path.isfile(fpath):
                    break
            else:
                raise HTTPException(status_code=404, detail="Voice not found")

    ext = os.path.splitext(safe)[1].lower()
    media_types = {
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".oga": "audio/ogg",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".wav": "audio/wav",
    }
    media_type = media_types.get(ext, "audio/webm")
    return FileResponse(
        fpath,
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=31536000, immutable",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.websocket("/ws")
async def chat_ws(websocket: WebSocket, token: str = Query(...)):
    """Real-time chat WebSocket."""
    try:
        telegram_id = decode_token(token)
    except HTTPException:
        await websocket.close(code=4401)
        return

    user = await db.fetchrow("SELECT * FROM users WHERE telegram_id = $1", telegram_id)
    if user is None:
        await websocket.close(code=4401)
        return

    await manager.connect("global", websocket)

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "chat":
                message = (data.get("message") or "").strip()
                if not message:
                    continue

                spent = await points_service.spend_text(user["id"])
                if not spent["ok"]:
                    await websocket.send_json(
                        {
                            "type": "error",
                            "data": {
                                "error": "insufficient_points",
                                "points": str(spent["points"]),
                            },
                        }
                    )
                    continue

                row = await db.fetchrow(
                    """
                    INSERT INTO chat_messages (user_id, message, message_type)
                    VALUES ($1, $2, 'text')
                    RETURNING id, created_at
                    """,
                    user["id"],
                    message,
                )

                await manager.broadcast(
                    "global",
                    {
                        "type": "chat",
                        "data": {
                            "id": row["id"],
                            "username": user["username"],
                            "display_name": user["display_name"] or user["full_name"],
                            "message": message,
                            "message_type": "text",
                            "created_at": row["created_at"].isoformat(),
                        },
                    },
                )

                await websocket.send_json(
                    {
                        "type": "balance",
                        "data": {"points": str(spent["points"])},
                    }
                )

            elif msg_type in ("studio", "server_message"):
                # Studiyaga (efirga) matnli zayavka — points sarflanadi,
                # umumiy chatga dublikat + messages(is_for_studio=true) ga yoziladi.
                message = (data.get("message") or "").strip()
                if not message:
                    continue

                spent = await points_service.spend(
                    user["id"], "studio", points_service.COST["studio"]
                )
                if not spent["ok"]:
                    await websocket.send_json(
                        {
                            "type": "limit_exceeded",
                            "data": {"event": "studio", "points": str(spent["points"])},
                        }
                    )
                    continue

                _lang = data.get("lang") if data.get("lang") in ("ru", "lt", "en") else None

                # (a) umumiy chatga dublikat — hammага ko'rinadi
                row = await db.fetchrow(
                    """
                    INSERT INTO chat_messages (user_id, message, message_type)
                    VALUES ($1, $2, 'studio')
                    RETURNING id, created_at
                    """,
                    user["id"],
                    message,
                )
                await manager.broadcast(
                    "global",
                    {
                        "type": "chat",
                        "data": {
                            "id": row["id"],
                            "username": user["username"],
                            "display_name": user["display_name"] or user["full_name"],
                            "message": message,
                            "message_type": "studio",
                            "created_at": row["created_at"].isoformat(),
                        },
                    },
                )

                # (b) ИИ/moderator uchun belgi
                await db.execute(
                    """
                    INSERT INTO messages (user_id, city, text, status, is_for_studio, lang)
                    VALUES ($1, $2, $3, 'pending', true, $4)
                    """,
                    user["id"],
                    "global",
                    message,
                    _lang,
                )

                # (c) Telegram Community guruhiga bot orqali yuborish
                author = (
                    user["display_name"]
                    or user["full_name"]
                    or user["username"]
                    or f"id{user['telegram_id']}"
                )
                asyncio.create_task(
                    membership.send_to_community(f"📻 Эфирга хабар\n👤 {author}:\n{message}")
                )

                await websocket.send_json(
                    {
                        "type": "studio_ack",
                        "data": {"points": str(spent["points"])},
                    }
                )

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        manager.disconnect("global", websocket)
    except Exception:
        manager.disconnect("global", websocket)

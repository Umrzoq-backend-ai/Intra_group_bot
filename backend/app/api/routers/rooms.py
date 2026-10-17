"""Rooms router — ведущий (level 3+) foydalanuvchilar yarata oladigan guruh chatlari.

Guruhlar YOPIQ: faqat a'zolar (room_members) o'qiy/yoza oladi. Xost avtomatik
a'zo, taklif/chetlatishni xost va staff (admin/moderator) qila oladi — staff
istalgan guruhni (a'zo bo'lmasa ham) ko'ra/boshqara oladi. Guruh xabarlari
umumiy chat_messages jadvalida saqlanadi (room_id ustuni orqali ажратилади)
— asosiy "Живой чат" tarixiga aralashmaydi.

V1: real-time yangilanish WebSocket orqali emas, klient tomonidan davriy
so'rov (polling) orqali — bu asosiy chat WS oqimini murakkablashtirmaydi.
"""

import asyncio
import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.routers.chat import _ALLOWED_AUDIO, _convert_to_mp3_background, _display_name
from app.core.config import settings
from app.core.database import db
from app.core.dependencies import get_current_user, is_staff, require_role
from app.core.models import (
    OkResponse,
    RoomCreate,
    RoomInviteRequest,
    RoomKickRequest,
    RoomMemberOut,
    RoomMessageRequest,
    RoomOut,
)
from app.services import points as points_service

log = logging.getLogger("rooms")

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.post("", response_model=RoomOut)
async def create_room(payload: RoomCreate, user: dict = Depends(require_role("doverenniy"))):
    """[ведущий/moderator/admin] Yangi guruh yaratadi — xost avtomatik a'zo."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title required")

    row = await db.fetchrow(
        """
        INSERT INTO chat_rooms (title, description, host_user_id)
        VALUES ($1, $2, $3)
        RETURNING id, title, description, host_user_id, is_active, created_at
        """,
        title,
        payload.description.strip(),
        user["id"],
    )
    await db.execute(
        "INSERT INTO room_members (room_id, user_id, added_by) VALUES ($1, $2, $2)",
        row["id"],
        user["id"],
    )
    log.info("Room #%s created by user %s: %s", row["id"], user["id"], title)
    return RoomOut(**dict(row), host_display_name=_display_name(user))


@router.get("", response_model=list[RoomOut])
async def list_rooms(user: dict = Depends(get_current_user)):
    """Faol guruhlar ro'yxati — guruhlar YOPIQ: staff (admin/moderator)
    hammasini ko'radi (moderatsiya uchun), oddiy foydalanuvchi faqat o'zi
    a'zo bo'lgan guruhlarni."""
    base_query = """
        SELECT r.id, r.title, r.description, r.host_user_id, r.is_active, r.created_at,
               COALESCE(u.display_name, u.username, 'id' || u.telegram_id::text) AS host_display_name
        FROM chat_rooms r
        LEFT JOIN users u ON u.id = r.host_user_id
        WHERE r.is_active = true
    """
    if is_staff(user):
        rows = await db.fetch(base_query + " ORDER BY r.created_at DESC LIMIT 100")
    else:
        rows = await db.fetch(
            base_query
            + """ AND EXISTS (
                    SELECT 1 FROM room_members m WHERE m.room_id = r.id AND m.user_id = $1
                  )
                  ORDER BY r.created_at DESC LIMIT 100""",
            user["id"],
        )
    return [RoomOut(**dict(r)) for r in rows]


@router.post("/{room_id}/close", response_model=OkResponse)
async def close_room(room_id: int, user: dict = Depends(get_current_user)):
    """Guruhni yopadi — xost yoki staff (admin/moderator)."""
    room = await db.fetchrow("SELECT host_user_id FROM chat_rooms WHERE id = $1", room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["host_user_id"] != user["id"] and not is_staff(user):
        raise HTTPException(status_code=403, detail="Not your room")

    result = await db.execute("UPDATE chat_rooms SET is_active = false WHERE id = $1", room_id)
    if result.endswith("0"):
        raise HTTPException(status_code=404, detail="Room not found")
    return OkResponse(detail={"room_id": room_id})


@router.delete("/{room_id}", response_model=OkResponse)
async def delete_room(room_id: int, user: dict = Depends(get_current_user)):
    """Guruhni BUTUNLAY o'chiradi — xost yoki staff (admin/moderator).

    /close'dan farqli (is_active=false, qaytariladi) — bu qaytarib
    bo'lmaydigan o'chirish: chat_messages va room_members CASCADE bilan
    birga ketadi (schema.sql'da ON DELETE CASCADE)."""
    room = await db.fetchrow("SELECT host_user_id FROM chat_rooms WHERE id = $1", room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["host_user_id"] != user["id"] and not is_staff(user):
        raise HTTPException(status_code=403, detail="Not your room")

    await db.execute("DELETE FROM chat_rooms WHERE id = $1", room_id)
    log.info("Room #%s permanently deleted by user %s", room_id, user["id"])
    return OkResponse(detail={"room_id": room_id})


async def _get_active_room(room_id: int, user: dict) -> dict:
    """Guruh mavjud/faolligini va a'zolikni tekshiradi. Staff va xost —
    a'zolikdan qat'i nazar kira oladi (moderatsiya/o'z guruhi)."""
    room = await db.fetchrow(
        "SELECT id, host_user_id FROM chat_rooms WHERE id = $1 AND is_active = true", room_id
    )
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["host_user_id"] == user["id"] or is_staff(user):
        return dict(room)
    is_member = await db.fetchval(
        "SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2", room_id, user["id"]
    )
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this group")
    return dict(room)


def _can_manage_members(room: dict, user: dict) -> bool:
    return room["host_user_id"] == user["id"] or is_staff(user)


@router.get("/{room_id}/messages")
async def get_room_messages(room_id: int, limit: int = 50, user: dict = Depends(get_current_user)):
    """Guruh chat tarixi (охирги N ta xabar)."""
    await _get_active_room(room_id, user)

    rows = await db.fetch(
        """
        SELECT c.id, u.username, u.display_name, c.message, c.message_type,
               c.audio_file_path, c.created_at
        FROM chat_messages c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.room_id = $1
        ORDER BY c.created_at DESC
        LIMIT $2
        """,
        room_id,
        limit,
    )
    out = []
    for r in reversed(rows):
        voice_url = (
            f"/chat/voice/{r['audio_file_path']}"
            if r["message_type"] == "voice" and r["audio_file_path"]
            else None
        )
        out.append(
            {
                "id": r["id"],
                "username": r["username"],
                "display_name": r["display_name"],
                "message": r["message"],
                "message_type": r["message_type"] or "text",
                "voice_url": voice_url,
                "created_at": r["created_at"].isoformat(),
            }
        )
    return out


@router.post("/{room_id}/messages", response_model=OkResponse)
async def send_room_message(
    room_id: int,
    payload: RoomMessageRequest,
    user: dict = Depends(get_current_user),
):
    """Guruhga matnli xabar — 0.001 point (asosiy chat bilan bir xil narx)."""
    await _get_active_room(room_id, user)

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Empty message")

    spent = await points_service.spend_text(user["id"])
    if not spent["ok"]:
        raise HTTPException(
            status_code=402,
            detail={"error": "insufficient_points", "points": str(spent["points"])},
        )

    row = await db.fetchrow(
        """
        INSERT INTO chat_messages (user_id, message, message_type, room_id)
        VALUES ($1, $2, 'text', $3)
        RETURNING id, created_at
        """,
        user["id"],
        message,
        room_id,
    )
    return OkResponse(detail={"points": str(spent["points"]), "id": row["id"]})


@router.post("/{room_id}/voice", response_model=OkResponse)
async def send_room_voice(
    room_id: int,
    audio_file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Guruhga ovozli xabar — 0.005 point. MP3 konvertatsiya fonda ishlaydi."""
    await _get_active_room(room_id, user)

    ext = os.path.splitext(audio_file.filename or "")[1].lower() or ".webm"
    if ext not in _ALLOWED_AUDIO:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    spent = await points_service.spend_voice(user["id"])
    if not spent["ok"]:
        raise HTTPException(
            status_code=402,
            detail={"error": "insufficient_points", "points": str(spent["points"])},
        )

    os.makedirs(settings.upload_dir, exist_ok=True)
    content = await audio_file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    uid = uuid.uuid4().hex
    raw_fname = f"voice_{uid}{ext}"
    raw_fpath = os.path.join(settings.upload_dir, raw_fname)
    with open(raw_fpath, "wb") as f:
        f.write(content)

    fname = f"voice_{uid}.mp3"
    mp3_fpath = os.path.join(settings.upload_dir, fname)
    asyncio.create_task(_convert_to_mp3_background(raw_fpath, mp3_fpath))

    row = await db.fetchrow(
        """
        INSERT INTO chat_messages (user_id, message, message_type, audio_file_path, room_id)
        VALUES ($1, '', 'voice', $2, $3)
        RETURNING id, created_at
        """,
        user["id"],
        fname,
        room_id,
    )
    return OkResponse(
        detail={
            "points": str(spent["points"]),
            "voice_url": f"/chat/voice/{fname}",
            "id": row["id"],
        }
    )


# ──────────────────────────────────────────────────────────
# A'zolik — taklif/chetlatish (xost yoki staff, guruh YOPIQ)
# ──────────────────────────────────────────────────────────
@router.get("/{room_id}/members", response_model=list[RoomMemberOut])
async def list_room_members(room_id: int, user: dict = Depends(get_current_user)):
    """Guruh a'zolari — faqat a'zolar (yoki xost/staff) ko'radi."""
    room = await _get_active_room(room_id, user)
    rows = await db.fetch(
        """
        SELECT u.id AS user_id, u.telegram_id, u.username, u.display_name
        FROM room_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.room_id = $1
        ORDER BY m.added_at ASC
        """,
        room_id,
    )
    return [RoomMemberOut(**dict(r), is_host=(r["user_id"] == room["host_user_id"])) for r in rows]


@router.post("/{room_id}/invite", response_model=OkResponse)
async def invite_to_room(
    room_id: int, payload: RoomInviteRequest, user: dict = Depends(get_current_user)
):
    """Guruhga foydalanuvchi qo'shadi (Telegram ID YOKI @username bo'yicha) — xost yoki staff."""
    room = await db.fetchrow(
        "SELECT id, host_user_id FROM chat_rooms WHERE id = $1 AND is_active = true", room_id
    )
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if not _can_manage_members(dict(room), user):
        raise HTTPException(status_code=403, detail="Not your room")

    identifier = payload.identifier.strip().lstrip("@")
    if not identifier:
        raise HTTPException(status_code=400, detail="Empty identifier")

    if identifier.isdigit():
        target = await db.fetchrow(
            "SELECT id, username, display_name FROM users WHERE telegram_id = $1",
            int(identifier),
        )
    else:
        target = await db.fetchrow(
            "SELECT id, username, display_name FROM users WHERE lower(username) = lower($1)",
            identifier,
        )
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    await db.execute(
        """
        INSERT INTO room_members (room_id, user_id, added_by) VALUES ($1, $2, $3)
        ON CONFLICT (room_id, user_id) DO NOTHING
        """,
        room_id,
        target["id"],
        user["id"],
    )
    log.info("Room #%s: user %s invited %s", room_id, user["id"], target["id"])
    return OkResponse(
        detail={
            "user_id": target["id"],
            "display_name": target["display_name"] or target["username"],
        }
    )


@router.post("/{room_id}/kick", response_model=OkResponse)
async def kick_from_room(
    room_id: int, payload: RoomKickRequest, user: dict = Depends(get_current_user)
):
    """Guruhdan foydalanuvchini chetlatadi — xost yoki staff. Xostni chetlatib
    bo'lmaydi (guruhni yopish bilan almashtiriladi)."""
    room = await db.fetchrow(
        "SELECT id, host_user_id FROM chat_rooms WHERE id = $1 AND is_active = true", room_id
    )
    if room is None:
        raise HTTPException(status_code=404, detail="Room not found")
    if not _can_manage_members(dict(room), user):
        raise HTTPException(status_code=403, detail="Not your room")
    if payload.user_id == room["host_user_id"]:
        raise HTTPException(status_code=400, detail="Cannot kick the host")

    result = await db.execute(
        "DELETE FROM room_members WHERE room_id = $1 AND user_id = $2", room_id, payload.user_id
    )
    if result.endswith("0"):
        raise HTTPException(status_code=404, detail="User is not a member")
    log.info("Room #%s: user %s kicked %s", room_id, user["id"], payload.user_id)
    return OkResponse(detail={"user_id": payload.user_id})

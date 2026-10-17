"""Opinions router — foydalanuvchi fikrlarini qabul qilish.

Boss talabi: Odamlar fikr yuboradi (matn/ovoz) → point yechiladi → saqlaydi.
Telegram resursi ishlatiladi — fayl serverga yuklanmaydi, faqat file_id saqlanadi.
"""

import asyncio
import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import db
from app.core.dependencies import get_current_user
from app.services import points as points_service
from app.services import pricing

log = logging.getLogger("opinions")

router = APIRouter(prefix="/opinions", tags=["opinions"])

_ALLOWED_AUDIO = {".webm", ".ogg", ".mp3", ".m4a", ".wav", ".oga"}


async def _transcribe_opinion_voice(opinion_id: int, fpath: str):
    """Ovozli fikrni fonda matnga o'girib (STT), bazadagi text maydoniga yozadi."""
    try:
        from app.services import whisper_stt

        text = await whisper_stt.transcribe(fpath)
        if text and text.strip():
            await db.execute(
                "UPDATE opinions SET text = $1 WHERE id = $2", text.strip(), opinion_id
            )
            log.info("[opinions] Voice #%d transcribed: %s", opinion_id, text[:60])
    except Exception as exc:  # noqa: BLE001
        log.warning("[opinions] STT failed for voice #%d: %s", opinion_id, exc)


class OpinionSaveRequest(BaseModel):
    kind: str  # "text" | "voice"
    text: str | None = None
    tg_file_id: str | None = None
    tg_message_id: int
    cost: float = 0.001


class OpinionResponse(BaseModel):
    ok: bool
    opinion_id: int | None = None
    points: str | None = None
    error: str | None = None


@router.post("/save", response_model=OpinionResponse)
async def save_opinion(
    payload: OpinionSaveRequest,
    user: dict = Depends(get_current_user),
):
    """Mneniya (fikr) saqlaydi. Matn yoki ovoz (file_id). Point yechiladi."""
    # Narx aniqlash
    cost = (
        pricing.get("price_voice_message")
        if payload.kind == "voice"
        else pricing.get("price_text_message")
    )

    # Point yechish (atomik)
    spent = await points_service.spend(user["id"], f"opinion_{payload.kind}", cost)
    if not spent["ok"]:
        raise HTTPException(
            status_code=402,
            detail={"error": "insufficient_points", "points": str(spent["points"])},
        )

    # Faol mavzuni olish (oxirgi active topic)
    topic_row = await db.fetchrow(
        "SELECT id FROM topics WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
    )
    topic_id = topic_row["id"] if topic_row else None

    # Saqlash
    row = await db.fetchrow(
        """
        INSERT INTO opinions (user_id, topic_id, kind, text, tg_file_id, tg_message_id, points_spent)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        """,
        user["id"],
        topic_id,
        payload.kind,
        payload.text,
        payload.tg_file_id,
        payload.tg_message_id,
        cost,
    )

    log.info("[opinions] #%s (%s) user=%s topic=%s", row["id"], payload.kind, user["id"], topic_id)
    return OpinionResponse(ok=True, opinion_id=row["id"], points=str(spent["points"]))


@router.get("/current-topic")
async def current_topic(user: dict = Depends(get_current_user)):
    """Faol efir mavzusi (foydalanuvchi ko'radi — qaysi mavzuga fikr yuborish)."""
    row = await db.fetchrow(
        "SELECT id, title, description, created_at FROM topics WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
    )
    if not row:
        return {"topic": None}
    count = await db.fetchval("SELECT count(*) FROM opinions WHERE topic_id = $1", row["id"])
    return {
        "topic": {
            "id": row["id"],
            "title": row["title"],
            "description": row["description"],
            "opinion_count": count or 0,
        }
    }


@router.get("/count")
async def opinion_count(user: dict = Depends(get_current_user)):
    """Faol mavzudagi fikrlar soni (mini app uchun)."""
    topic_row = await db.fetchrow(
        "SELECT id FROM topics WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
    )
    if not topic_row:
        return {"topic": None, "count": 0}
    count = await db.fetchval(
        "SELECT count(*) FROM opinions WHERE topic_id = $1 AND status = 'pending'",
        topic_row["id"],
    )
    return {"topic_id": topic_row["id"], "count": count or 0}


@router.post("/voice")
async def save_voice_opinion(
    audio_file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Mini App orqali ovozli fikr yuborish. Point yechiladi, fayl saqlanadi."""
    ext = os.path.splitext(audio_file.filename or "")[1].lower() or ".webm"
    if ext not in _ALLOWED_AUDIO:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    voice_cost = pricing.get("price_voice_message")
    spent = await points_service.spend(user["id"], "opinion_voice", voice_cost)
    if not spent["ok"]:
        raise HTTPException(
            status_code=402,
            detail={"error": "insufficient_points", "points": str(spent["points"])},
        )

    os.makedirs(settings.upload_dir, exist_ok=True)
    content = await audio_file.read()
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large")

    fname = f"opinion_{uuid.uuid4().hex}{ext}"
    fpath = os.path.join(settings.upload_dir, fname)
    with open(fpath, "wb") as f:
        f.write(content)

    topic_row = await db.fetchrow(
        "SELECT id FROM topics WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
    )
    topic_id = topic_row["id"] if topic_row else None

    row = await db.fetchrow(
        """
        INSERT INTO opinions (user_id, topic_id, kind, tg_file_id, points_spent)
        VALUES ($1, $2, 'voice', $3, $4)
        RETURNING id
        """,
        user["id"],
        topic_id,
        fname,
        voice_cost,
    )
    # Fondagi transkripsiya — matn olingach agregatsiyaga kiritiladi
    asyncio.create_task(_transcribe_opinion_voice(row["id"], fpath))

    log.info("[opinions] voice #%s user=%s topic=%s", row["id"], user["id"], topic_id)
    return {"ok": True, "opinion_id": row["id"], "points": str(spent["points"])}

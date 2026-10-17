"""Users/Profile router — INTRA GROUP v3.0.

Profil sahifasi:
1. Level (1-3)
2. Tanlangan til
3. ID
4. Points (kasr)
5. Display name / username tahrirlash
6. Point so'rash / berish / sotib olish
"""

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.constants import LEVELS
from app.core.database import db
from app.core.dependencies import get_current_user
from app.core.internal_auth import require_internal_key
from app.core.models import (
    ManualPaymentCreate,
    ManualPaymentOut,
    OkResponse,
    PaymentSettingsOut,
    PointPackageOut,
    PointsBalanceOut,
    PointsRequestCreate,
    PointsRequestDecision,
    PointsRequestOut,
    PointsTransactionOut,
    PointsTransferRequest,
    PurchaseRequest,
    UpdateProfileRequest,
    UserProfileOut,
)
from app.core.ws_manager import manager
from app.services import notifications
from app.services import points as points_service

log = logging.getLogger("users")

router = APIRouter(prefix="/users", tags=["users"])


def _level_name(level: int) -> str:
    return LEVELS.get(level, "Слушатель")


async def _notify_balance(user_id: int, points) -> None:
    """Boshqa foydalanuvchidan point kelganda oluvchini WS orqali darhol
    xabardor qiladi — aks holda balans faqat 20s'lik poll yoki mini appni
    to'liq yopib-ochganda yangilanardi (chat_ws barcha ulanishlarni bitta
    "global" xonaga qo'shadi, shuning uchun broadcast qilib, frontend'da
    user_id bo'yicha filtrlaymiz — real per-connection routing yo'q)."""
    await manager.broadcast(
        "global",
        {"type": "points_update", "data": {"user_id": user_id, "points": str(points)}},
    )


# TZ §1: Rol nomi (role maydoni bo'yicha)
ROLE_DISPLAY: dict[str, str] = {
    "listener": "Слушатель",
    "aktivniy": "Активный",
    "doverenniy": "Доверенный",
    "admin": "Администратор",
}


@router.get("/me", response_model=UserProfileOut)
async def get_me(user: dict = Depends(get_current_user)):
    """Profil ma'lumotlari (TZ §1 + §4: level, role, psixotip)."""
    return UserProfileOut(
        id=user["id"],
        telegram_id=user["telegram_id"],
        username=user["username"],
        display_name=user["display_name"] or user["full_name"],
        language=user["language"],
        level=user["level"],
        level_name=_level_name(user["level"]),
        points=user["points"],
        role=user["role"],
        # TZ §4: psixologik profil (oxirgi tahlil natijasi)
        focus_of_attention=user.get("focus_of_attention"),
        emotional_tone=user.get("emotional_tone"),
        key_topic=user.get("key_topic"),
    )


@router.put("/me", response_model=OkResponse)
async def update_profile(
    payload: UpdateProfileRequest,
    user: dict = Depends(get_current_user),
):
    """Display name va username tahrirlash."""
    updates = []
    params = []
    idx = 1

    if payload.display_name is not None:
        if len(payload.display_name.strip()) < 1:
            raise HTTPException(status_code=400, detail="Display name cannot be empty")
        idx += 1
        updates.append(f"display_name = ${idx}")
        params.append(payload.display_name.strip()[:100])

    if payload.username is not None:
        if len(payload.username.strip()) < 1:
            raise HTTPException(status_code=400, detail="Username cannot be empty")
        idx += 1
        updates.append(f"username = ${idx}")
        params.append(payload.username.strip()[:50])

    if not updates:
        return OkResponse(detail={"message": "Nothing to update"})

    query = f"UPDATE users SET {', '.join(updates)} WHERE id = $1"
    await db.execute(query, user["id"], *params)
    return OkResponse(detail={"message": "Profile updated"})


# ============ Points ============
@router.get("/me/points", response_model=PointsBalanceOut)
async def get_points(user: dict = Depends(get_current_user)):
    """Joriy point balansi."""
    return PointsBalanceOut(
        points=user["points"],
        level=user["level"],
        level_name=_level_name(user["level"]),
    )


@router.get("/me/points/history", response_model=list[PointsTransactionOut])
async def get_points_history(user: dict = Depends(get_current_user)):
    """Oxirgi 50 ta tranzaksiya."""
    rows = await db.fetch(
        """
        SELECT id, amount, event_type, description, created_at
        FROM points_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        """,
        user["id"],
    )
    return [PointsTransactionOut(**dict(r)) for r in rows]


@router.post("/me/points/transfer", response_model=OkResponse)
async def transfer_points(
    payload: PointsTransferRequest,
    user: dict = Depends(get_current_user),
):
    """Boshqa foydalanuvchiga point o'tkazish (telegram_id bo'yicha — profilda ko'rsatiladigan ID)."""
    target = await db.fetchrow("SELECT id FROM users WHERE telegram_id = $1", payload.to_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    result = await points_service.transfer(user["id"], target["id"], payload.amount)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("reason", "Transfer failed"))
    await _notify_balance(target["id"], result["to_points"])
    sender_name = user["display_name"] or user["username"] or "пользователя"
    # payload.to_user_id — allaqachon telegram_id (yuqoridagi so'rovda ko'rilgan),
    # qo'shimcha DB lookup shart emas.
    asyncio.create_task(
        notifications.notify_points_received_tg(
            payload.to_user_id, payload.amount, f"От {sender_name}"
        )
    )
    return OkResponse(detail={"points": result["points"]})


# ============ Point so'rovlari ============
@router.post("/me/points/request", response_model=OkResponse)
async def request_points(
    payload: PointsRequestCreate,
    user: dict = Depends(get_current_user),
):
    """Boshqa foydalanuvchidan point so'rash (telegram_id bo'yicha — profilda ko'rsatiladigan ID)."""
    # user = so'rovchi (from), payload.from_user_id = kimdan so'ralyapti (to) — telegram_id
    target = await db.fetchrow("SELECT id FROM users WHERE telegram_id = $1", payload.from_user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    result = await points_service.create_request(
        from_user_id=user["id"],
        to_user_id=target["id"],
        amount=payload.amount,
        message=payload.message,
    )
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("reason"))
    return OkResponse(detail={"request_id": result["request_id"]})


@router.get("/me/points/requests", response_model=list[PointsRequestOut])
async def get_my_requests(user: dict = Depends(get_current_user)):
    """Menga kelgan point so'rovlari (pending)."""
    rows = await db.fetch(
        """
        SELECT pr.*, u.display_name AS from_display_name
        FROM points_requests pr
        LEFT JOIN users u ON u.id = pr.from_user_id
        WHERE pr.to_user_id = $1 AND pr.status = 'pending'
        ORDER BY pr.created_at DESC
        """,
        user["id"],
    )
    return [PointsRequestOut(**dict(r)) for r in rows]


@router.post("/me/points/requests/{request_id}/decide", response_model=OkResponse)
async def decide_point_request(
    request_id: int,
    payload: PointsRequestDecision,
    user: dict = Depends(get_current_user),
):
    """Point so'rovini tasdiqlash yoki rad etish."""
    result = await points_service.decide_request(request_id, user["id"], payload.approve)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("reason"))
    if result["status"] == "approved":
        await _notify_balance(result["recipient_user_id"], result["recipient_points"])
        sender_name = user["display_name"] or user["username"] or "пользователя"
        asyncio.create_task(
            notifications.notify_points_received(
                result["recipient_user_id"], result["amount"], f"От {sender_name}"
            )
        )
    return OkResponse(detail={"status": result["status"]})


# ============ Point sotib olish ============
@router.get("/me/points/packages", response_model=list[PointPackageOut])
async def get_packages():
    """Mavjud point paketlari (narxlar)."""
    rows = await db.fetch(
        "SELECT id, points_amount, price_eur, price_stars, label FROM point_packages WHERE is_active = true ORDER BY price_eur"
    )
    return [PointPackageOut(**dict(r)) for r in rows]


@router.get("/me/points/payment-method", response_model=PaymentSettingsOut)
async def get_payment_method(user: dict = Depends(get_current_user)):
    """To'lov qanday ishlashi — admin belgilagan.

    method:
      stars  — faqat Telegram Stars (bot orqali avtomatik)
      manual — faqat qo'lda (ariza → admin tasdiqlaydi)
      both   — ikkalasi ham mavjud (foydalanuvchi tanlaydi)
    """
    rows = await db.fetch(
        """
        SELECT key, value FROM app_settings
        WHERE key IN ('payment_method', 'payment_instructions',
                      'manual_payment_details', 'manual_payment_enabled')
        """
    )
    values = {r["key"]: r["value"] for r in rows}
    return PaymentSettingsOut(
        method=values.get("payment_method", "stars"),
        instructions=values.get("payment_instructions", ""),
        manual_details=values.get("manual_payment_details", ""),
        manual_enabled=values.get("manual_payment_enabled", "true") == "true",
        bot_username=await notifications.get_bot_username(),
    )


# ============ Qo'lda to'lov (manual payment) ============
@router.post("/me/points/manual-payment", response_model=OkResponse)
async def create_manual_payment(
    payload: ManualPaymentCreate,
    user: dict = Depends(get_current_user),
):
    """Foydalanuvchi qo'lda to'lov arizasi yuboradi.

    Oqim:
      1. User bank/karta orqali to'laydi (admin rekvizitlari bo'yicha)
      2. Shu endpoint orqali ariza yuboradi (tranzaksiya raqami bilan)
      3. Admin panelda ko'radi → tasdiqlaydi → point avtomatik tushadi

    Bitta foydalanuvchida bir vaqtda faqat bitta 'pending' ariza bo'lishi mumkin
    (spamdan himoya).
    """
    # Manual to'lov yoqilganini tekshiramiz
    enabled = await db.fetchval(
        "SELECT value FROM app_settings WHERE key = 'manual_payment_enabled'"
    )
    if enabled == "false":
        raise HTTPException(status_code=403, detail="Ручная оплата отключена администратором")

    # Kutilayotgan ariza bormi? (spam himoyasi)
    pending = await db.fetchval(
        "SELECT id FROM manual_payments WHERE user_id = $1 AND status = 'pending' LIMIT 1",
        user["id"],
    )
    if pending:
        raise HTTPException(
            status_code=409,
            detail="У вас уже есть заявка на рассмотрении. Дождитесь решения администратора.",
        )

    pkg = await db.fetchrow(
        "SELECT * FROM point_packages WHERE id = $1 AND is_active = true",
        payload.package_id,
    )
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    row = await db.fetchrow(
        """
        INSERT INTO manual_payments
            (user_id, package_id, points_amount, price_eur, package_label,
             payment_method, payment_note, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id, created_at
        """,
        user["id"],
        pkg["id"],
        pkg["points_amount"],
        pkg["price_eur"],
        pkg["label"],
        payload.payment_method,
        payload.payment_note.strip()[:1000],
    )

    log.info(
        "Manual payment ariza #%d: user=%d paket=%s (%s EUR, %s)",
        row["id"],
        user["id"],
        pkg["label"],
        pkg["price_eur"],
        payload.payment_method,
    )

    # Adminlarni darhol xabardor qilamiz (bot orqali DM)
    asyncio.create_task(
        notifications.notify_admins_manual_payment(
            user_name=user["display_name"] or user["username"] or f"ID {user['telegram_id']}",
            telegram_id=user["telegram_id"],
            package_label=pkg["label"],
            price_eur=float(pkg["price_eur"]),
            method=payload.payment_method,
            note=payload.payment_note.strip()[:200],
        )
    )

    return OkResponse(
        detail={
            "payment_id": row["id"],
            "status": "pending",
            "message": "Заявка отправлена. Администратор проверит и начислит поинты.",
        }
    )


@router.get("/me/points/manual-payments", response_model=list[ManualPaymentOut])
async def get_my_manual_payments(user: dict = Depends(get_current_user)):
    """Foydalanuvchining qo'lda to'lov arizalari tarixi (oxirgi 20 ta)."""
    rows = await db.fetch(
        """
        SELECT mp.id, mp.user_id, mp.package_id, mp.package_label,
               mp.points_amount, mp.price_eur, mp.payment_method,
               mp.payment_note, mp.receipt_path, mp.status, mp.admin_note,
               mp.created_at, mp.decided_at,
               u.telegram_id, u.username, u.display_name
        FROM manual_payments mp
        JOIN users u ON u.id = mp.user_id
        WHERE mp.user_id = $1
        ORDER BY mp.created_at DESC
        LIMIT 20
        """,
        user["id"],
    )
    return [
        ManualPaymentOut(
            **{k: v for k, v in dict(r).items() if k != "receipt_path"},
            receipt_url=f"/uploads/{r['receipt_path'].split('/')[-1]}"
            if r["receipt_path"]
            else None,
        )
        for r in rows
    ]


@router.delete("/me/points/manual-payment/{payment_id}", response_model=OkResponse)
async def cancel_manual_payment(
    payment_id: int,
    user: dict = Depends(get_current_user),
):
    """Foydalanuvchi o'z 'pending' arizasini bekor qiladi (xato yuborgan bo'lsa)."""
    result = await db.execute(
        "DELETE FROM manual_payments WHERE id = $1 AND user_id = $2 AND status = 'pending'",
        payment_id,
        user["id"],
    )
    if result.endswith("0"):
        raise HTTPException(status_code=404, detail="Заявка не найдена или уже обработана")
    return OkResponse(detail={"cancelled_id": payment_id})


@router.post("/me/points/purchase", response_model=OkResponse)
async def purchase_points(
    payload: PurchaseRequest,
    user: dict = Depends(get_current_user),
):
    """[DEV] Point sotib olish (test rejim — Telegram to'lovsiz).

    Production'da bu o'rniga bot Telegram Payments orqali to'lov qabul qiladi
    va /users/credit-purchase (internal) chaqiriladi.
    """
    pkg = await db.fetchrow(
        "SELECT * FROM point_packages WHERE id = $1 AND is_active = true",
        payload.package_id,
    )
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    result = await points_service.add_points(
        user["id"],
        pkg["points_amount"],
        event_type="purchase",
        description=f"Purchased {pkg['label']} for €{pkg['price_eur']}",
    )
    if not result["ok"]:
        raise HTTPException(status_code=500, detail="Purchase failed")

    return OkResponse(
        detail={"points": str(result["points"]), "purchased": str(pkg["points_amount"])}
    )


# ============ Telegram Payments (haqiqiy pul) — internal ============
class CreditPurchaseRequest(BaseModel):
    telegram_id: int
    package_id: int
    charge_id: str  # Telegram to'lov ID (idempotentlik uchun)


@router.post("/credit-purchase", dependencies=[Depends(require_internal_key)])
async def credit_purchase(payload: CreditPurchaseRequest):
    """[INTERNAL] Bot Telegram to'lovini tasdiqlagach point qo'shadi.

    Idempotent: bir xil charge_id ikki marta hisoblanmaydi.
    """
    # Idempotentlik — bu charge allaqachon hisoblangani tekshiriladi
    existing = await db.fetchval(
        "SELECT 1 FROM points_transactions WHERE event_type = 'purchase' AND description LIKE $1 LIMIT 1",
        f"%{payload.charge_id}%",
    )
    if existing:
        return {"ok": True, "already_credited": True}

    user = await db.fetchrow("SELECT id FROM users WHERE telegram_id = $1", payload.telegram_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    pkg = await db.fetchrow("SELECT * FROM point_packages WHERE id = $1", payload.package_id)
    if pkg is None:
        raise HTTPException(status_code=404, detail="Package not found")

    result = await points_service.add_points(
        user["id"],
        pkg["points_amount"],
        event_type="purchase",
        description=f"TG Payment {pkg['label']} (charge:{payload.charge_id})",
    )
    if not result["ok"]:
        raise HTTPException(status_code=500, detail="Credit failed")

    return {"ok": True, "points": str(result["points"]), "credited": str(pkg["points_amount"])}


# ============ Foydalanuvchi statistikasi ============
@router.get("/stats")
async def get_user_stats(user: dict = Depends(get_current_user)):
    """Foydalanuvchi faollik statistikasi (Stats ekranida ko'rsatiladi)."""
    chat_total = (
        await db.fetchval("SELECT COUNT(*) FROM chat_messages WHERE user_id = $1", user["id"]) or 0
    )
    chat_voice = (
        await db.fetchval(
            "SELECT COUNT(*) FROM chat_messages WHERE user_id = $1 AND message_type = 'voice'",
            user["id"],
        )
        or 0
    )
    studio_total = (
        await db.fetchval(
            "SELECT COUNT(*) FROM messages WHERE user_id = $1 AND is_for_studio = true", user["id"]
        )
        or 0
    )
    points_spent = (
        await db.fetchval(
            "SELECT COALESCE(ABS(SUM(amount)), 0) FROM points_transactions WHERE user_id = $1 AND amount < 0",
            user["id"],
        )
        or 0
    )
    points_earned = (
        await db.fetchval(
            "SELECT COALESCE(SUM(amount), 0) FROM points_transactions WHERE user_id = $1 AND amount > 0",
            user["id"],
        )
        or 0
    )
    days_active = (
        await db.fetchval(
            "SELECT COUNT(DISTINCT DATE(created_at)) FROM chat_messages WHERE user_id = $1",
            user["id"],
        )
        or 0
    )

    return {
        "total_messages": chat_total,
        "chat_messages": chat_total - chat_voice,
        "voice_messages": chat_voice,
        "studio_messages": studio_total,
        "file_uploads": 0,
        "points_earned": float(points_earned),
        "points_spent": float(points_spent),
        "current_points": float(user["points"]),
        "days_active": days_active,
        "broadcasts_count": 0,
        "favorite_count": 0,
        "level": user["level"],
    }

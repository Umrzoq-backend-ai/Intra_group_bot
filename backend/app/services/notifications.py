"""Notifications — bot orqali foydalanuvchilarga shaxsiy xabar yuborish.

membership.py'dagi send_to_community() bilan bir xil pattern (to'g'ridan-to'g'ri
Telegram Bot API, alohida bot process shart emas), lekin community guruhi
o'rniga aniq telegram_id'ga (shaxsiy chat) yuboradi. Muvaffaqiyatsiz bo'lsa
(masalan, foydalanuvchi botni bloklagan/hali /start bosmagan) jim o'tkazib
yuboriladi — bildirishnoma asosiy oqimni to'xtatmasligi kerak, shuning uchun
barcha chaqiruvchilar buni fire-and-forget (asyncio.create_task) qilishi kerak.
"""

import logging
import os
from decimal import Decimal

import httpx

from app.core.database import db

log = logging.getLogger("notifications")

BOT_TOKEN = os.getenv("BOT_TOKEN", "")


async def send_dm(telegram_id: int, text: str) -> bool:
    if not BOT_TOKEN:
        return False
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json={"chat_id": telegram_id, "text": text}, timeout=10)
        ok = bool(resp.json().get("ok"))
        if not ok:
            log.info("[notifications] DM yuborilmadi (%s): %s", telegram_id, resp.text[:200])
        return ok
    except Exception as exc:  # noqa: BLE001
        log.warning("[notifications] DM xato (%s): %s", telegram_id, exc)
        return False


_bot_username_cache: str | None = None


async def get_bot_username() -> str:
    """Bot username'ini (@ belgisiz) qaytaradi.

    Frontend Stars to'lovi uchun `t.me/<bot>?start=buy_N` deep-link yasaydi,
    shuning uchun username hardcode qilinmasligi kerak. Avval BOT_USERNAME env,
    aks holda Telegram getMe orqali bir marta aniqlanadi va kesh qilinadi.
    """
    global _bot_username_cache
    if _bot_username_cache is not None:
        return _bot_username_cache

    env_name = os.getenv("BOT_USERNAME", "").strip().lstrip("@")
    if env_name:
        _bot_username_cache = env_name
        return env_name

    if not BOT_TOKEN:
        return ""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"https://api.telegram.org/bot{BOT_TOKEN}/getMe", timeout=10)
        data = resp.json()
        if data.get("ok"):
            _bot_username_cache = data["result"].get("username", "") or ""
            log.info("[notifications] bot username aniqlandi: @%s", _bot_username_cache)
            return _bot_username_cache
    except Exception as exc:  # noqa: BLE001
        log.warning("[notifications] getMe xato: %s", exc)
    return ""


async def notify_points_received_tg(telegram_id: int, amount: Decimal, reason: str = "") -> None:
    """telegram_id allaqachon ma'lum bo'lganda (masalan transfer — payload
    o'zi telegram_id) — qo'shimcha DB so'rovisiz to'g'ridan-to'g'ri yuboradi."""
    if amount <= 0:
        return
    text = f"💰 Вам начислено +{amount} поинтов"
    if reason:
        text += f"\n{reason}"
    await send_dm(telegram_id, text)


async def notify_points_received(user_id: int, amount: Decimal, reason: str = "") -> None:
    """Ichki users.id bo'yicha — avval telegram_id'ni DB'dan topadi."""
    if amount <= 0:
        return
    row = await db.fetchrow("SELECT telegram_id FROM users WHERE id = $1", user_id)
    if not row:
        return
    await notify_points_received_tg(row["telegram_id"], amount, reason)


_ROLE_LABELS = {
    "admin": "администратор",
    "moderator": "модератор",
    "doverenniy": "доверенный ведущий",
    "aktivniy": "активный",
    "listener": "слушатель",
}


async def notify_role_changed(user_id: int, new_role: str) -> None:
    """Rol/daraja o'zgarganda foydalanuvchiga DM — mini app ochiq bo'lmasa
    ham darhol biladi (masalan admin qilingan odam "прямой эфир"ga chiqa
    olishini tushunishi uchun app'ni qayta ochish shart emas)."""
    row = await db.fetchrow("SELECT telegram_id FROM users WHERE id = $1", user_id)
    if not row:
        return
    label = _ROLE_LABELS.get(new_role, new_role)
    text = f"🔑 Ваш статус изменён: теперь вы — {label}."
    await send_dm(row["telegram_id"], text)


async def push_role_change(user_id: int, new_role: str) -> None:
    """Rol/daraja o'zgargan HAR safar shu chaqirilishi kerak (admin panel
    orqali ham, kasting tasdiqlanganda ham) — WS (ilova ochiq bo'lsa
    darhol) + DM (yopiq bo'lsa ham bilsin). WS tez/local — kutiladi; DM
    tashqi HTTP so'rov — orqa fonda (javobni sekinlashtirmasin)."""
    import asyncio

    from app.core.ws_manager import manager

    await manager.broadcast(
        "global",
        {"type": "role_updated", "data": {"user_id": user_id, "role": new_role}},
    )
    asyncio.create_task(notify_role_changed(user_id, new_role))


async def notify_admins_new_casting(display_name: str) -> None:
    """Yangi kasting arizasi haqida barcha adminlarga (DB role='admin' +
    ADMIN_IDS env) xabar beradi — moderator ko'ra olmaydi, shuning uchun
    faqat haqiqiy adminlarga yetkaziladi."""
    from app.core.config import settings

    text = f"🎙 Новая заявка на кастинг от {display_name}.\nПроверьте в админ-панели → Кастинг."
    rows = await db.fetch("SELECT telegram_id FROM users WHERE role = 'admin'")
    ids = {r["telegram_id"] for r in rows} | settings.admin_ids_set
    for tg_id in ids:
        await send_dm(tg_id, text)


_PAYMENT_METHOD_LABELS = {
    "bank": "банковский перевод",
    "card": "карта",
    "cash": "наличные",
    "crypto": "криптовалюта",
    "other": "другое",
}


async def notify_admins_manual_payment(
    user_name: str,
    telegram_id: int,
    package_label: str,
    price_eur: float,
    method: str,
    note: str = "",
) -> None:
    """Yangi qo'lda to'lov arizasi — barcha adminlarga DM.

    Manual to'lov admin tasdiqlashini kutadi, shuning uchun admin darhol
    bilishi kerak (mini app ochiq bo'lmasa ham). Faqat haqiqiy adminlarga
    (role='admin' + ADMIN_IDS) — moderator to'lovni tasdiqlay olmaydi.
    """
    from app.core.config import settings

    method_label = _PAYMENT_METHOD_LABELS.get(method, method)
    text = (
        f"💳 Новая заявка на оплату вручную\n\n"
        f"👤 {user_name} (ID {telegram_id})\n"
        f"📦 {package_label} — €{price_eur:.2f}\n"
        f"💰 Способ: {method_label}\n"
    )
    if note:
        text += f"📝 {note}\n"
    text += "\nПроверьте в админ-панели → Оплата → Заявки."

    rows = await db.fetch("SELECT telegram_id FROM users WHERE role = 'admin'")
    ids = {r["telegram_id"] for r in rows} | settings.admin_ids_set
    for tg_id in ids:
        await send_dm(tg_id, text)


async def notify_manual_payment_decided(
    telegram_id: int,
    approved: bool,
    points_amount: Decimal,
    package_label: str,
    admin_note: str = "",
) -> None:
    """Admin qo'lda to'lov arizasini hal qilganda foydalanuvchiga DM."""
    if approved:
        text = (
            f"✅ Оплата подтверждена!\n\n"
            f"📦 {package_label}\n"
            f"💰 Начислено: +{points_amount} поинтов\n\n"
            f"Спасибо за поддержку! 🎙"
        )
    else:
        text = f"❌ Заявка на оплату отклонена\n\n📦 {package_label}\n"
        if admin_note:
            text += f"\n📝 Причина: {admin_note}\n"
        text += "\nЕсли это ошибка — свяжитесь с администратором."

    await send_dm(telegram_id, text)

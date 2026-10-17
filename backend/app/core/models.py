"""Pydantic models — INTRA GROUP v3.0.

Yangi TZ: til tanlash, kasr points, level tizimi, transfer/request.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


# ============ Auth ============
class TelegramAuthRequest(BaseModel):
    telegram_id: int
    username: str | None = None
    full_name: str | None = None


class AuthResponse(BaseModel):
    token: str
    is_new_user: bool = False
    language: str | None = None  # tanlangan til (None = hali tanlamagan)
    level: int = 1
    points: Decimal = Decimal("0.0000")


class SelectLanguageRequest(BaseModel):
    language: str  # ru | en | lt


# ============ Users / Profile ============
class UserProfileOut(BaseModel):
    id: int
    telegram_id: int
    username: str | None = None
    display_name: str | None = None
    language: str = "ru"
    level: int = 1
    level_name: str = "Слушатель"
    points: Decimal = Decimal("0.0000")
    role: str = "listener"
    # TZ §4: Psixologik profil (AI analitika)
    focus_of_attention: str | None = None  # vnutrenniy | vneshniy
    emotional_tone: str | None = None  # optimist | melanxolik | ratsional
    key_topic: str | None = None


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    username: str | None = None


# ============ Points ============
class PointsBalanceOut(BaseModel):
    points: Decimal
    level: int
    level_name: str


class PointsTransferRequest(BaseModel):
    to_user_id: int  # aslida telegram_id (profilda ko'rsatiladigan ID)
    amount: Decimal = Field(gt=0)


class PointsRequestCreate(BaseModel):
    """Boshqa foydalanuvchidan point so'rash."""

    from_user_id: int  # kimdan so'ralyapti — aslida telegram_id (profilda ko'rsatiladigan ID)
    amount: Decimal = Field(gt=0)
    message: str = ""


class PointsRequestOut(BaseModel):
    id: int
    from_user_id: int
    from_display_name: str | None = None
    to_user_id: int
    amount: Decimal
    status: str
    message: str
    created_at: datetime


class PointsRequestDecision(BaseModel):
    approve: bool  # True = berish, False = rad etish


class PointPackageOut(BaseModel):
    id: int
    points_amount: Decimal
    price_eur: Decimal
    price_stars: int
    label: str


class PurchaseRequest(BaseModel):
    package_id: int


class PaymentSettingsOut(BaseModel):
    method: str  # stars | manual | both
    instructions: str = ""
    # Manual to'lov uchun rekvizitlar (bank hisob, karta raqami va h.k.)
    manual_details: str = ""
    manual_enabled: bool = True
    # Bot username (@ belgisiz) — Stars to'lovi uchun deep-link yasashda kerak.
    # Hardcode qilinmasin: backend BOT_USERNAME env yoki getMe orqali aniqlaydi.
    bot_username: str = ""


class PaymentSettingsUpdate(BaseModel):
    method: str  # stars | manual | both
    instructions: str = ""
    manual_details: str = ""
    manual_enabled: bool = True


# ============ Qo'lda to'lov (manual payment) ============
class ManualPaymentCreate(BaseModel):
    """Foydalanuvchi qo'lda to'lov arizasi yuboradi."""

    package_id: int
    payment_method: Literal["bank", "card", "cash", "crypto", "other"] = "bank"
    payment_note: str = ""  # tranzaksiya raqami, izoh


class ManualPaymentOut(BaseModel):
    id: int
    user_id: int
    telegram_id: int | None = None
    username: str | None = None
    display_name: str | None = None
    package_id: int | None = None
    package_label: str = ""
    points_amount: Decimal
    price_eur: Decimal
    payment_method: str
    payment_note: str = ""
    receipt_url: str | None = None
    status: str
    admin_note: str = ""
    created_at: datetime
    decided_at: datetime | None = None


class ManualPaymentDecision(BaseModel):
    """Admin arizani tasdiqlaydi yoki rad etadi."""

    admin_note: str = ""


class PackageCreate(BaseModel):
    points_amount: Decimal = Field(gt=0)
    price_eur: Decimal = Field(gt=0)
    price_stars: int = Field(gt=0)
    label: str


class PackageUpdate(BaseModel):
    points_amount: Decimal = Field(gt=0)
    price_eur: Decimal = Field(gt=0)
    price_stars: int = Field(gt=0)
    label: str
    is_active: bool = True


class PackageOut(BaseModel):
    id: int
    points_amount: Decimal
    price_eur: Decimal
    price_stars: int
    label: str
    is_active: bool


class PointsTransactionOut(BaseModel):
    id: int
    amount: Decimal
    event_type: str
    description: str
    created_at: datetime


# ============ News (yangiliklar — til bo'yicha) ============
class NewsOut(BaseModel):
    id: int
    title: str
    body: str
    image_url: str = ""
    created_at: datetime


# ============ Chat ============
class ChatMessageRequest(BaseModel):
    message: str


class ChatMessageOut(BaseModel):
    id: int
    telegram_id: int | None = None
    username: str | None = None
    display_name: str | None = None
    message: str
    message_type: str = "text"
    voice_url: str | None = None
    file_url: str | None = None
    file_name: str | None = None
    created_at: datetime


class LiveMicRequestOut(BaseModel):
    id: int
    user_id: int
    telegram_id: int | None = None
    username: str | None = None
    display_name: str | None = None
    status: str = "pending"
    city: str = "global"
    created_at: datetime


# ============ Guruhlar (ведущий yaratadi) ============
class RoomCreate(BaseModel):
    title: str
    description: str = ""


class RoomOut(BaseModel):
    id: int
    title: str
    description: str
    host_user_id: int | None = None
    host_display_name: str | None = None
    is_active: bool
    created_at: datetime


class RoomMessageRequest(BaseModel):
    message: str


class RoomInviteRequest(BaseModel):
    # Yoki telegram_id (profilda ko'rsatiladigan ID), yoki @username —
    # frontend bitta matn maydonidan yuboradi, backend avtomatik aniqlaydi
    # (raqam bo'lsa — ID, aks holda username sifatida qidiriladi).
    identifier: str


class RoomKickRequest(BaseModel):
    user_id: int  # ichki users.id — a'zolar ro'yxatidan olinadi


class RoomMemberOut(BaseModel):
    user_id: int
    telegram_id: int
    username: str | None = None
    display_name: str | None = None
    is_host: bool = False


# ============ Radio / Broadcast ============
class RadioStatus(BaseModel):
    is_live: bool
    broadcaster_type: str | None = None
    broadcaster_name: str | None = None
    listeners_count: int = 0
    stream_url: str | None = None
    use_hls: bool = False
    use_icecast: bool = False
    current_segment: Any | None = None


class RadioStatusUpdate(BaseModel):
    """radio-host yoki internal service efir holatini yangilaydi."""

    city: str
    is_live: bool = True
    broadcaster_type: str | None = None  # ai | doverenniy
    broadcaster_name: str | None = None
    script: str | None = None
    duration_sec: int = 0


class SegmentRegister(BaseModel):
    """radio-host yangi AI ovoz segmentini ro'yxatga oladi."""

    city: str
    filename: str
    script: str = ""
    duration_sec: int = 0


class SegmentOut(BaseModel):
    id: int
    filename: str
    script: str = ""
    duration_sec: int = 0
    url: str


# ============ Admin ============
class AdminSetLevelRequest(BaseModel):
    user_id: int
    level: int  # 1, 2, 3


class AdminSetStaffRoleRequest(BaseModel):
    user_id: int
    # 'admin' — to'liq (faqat require_admin qo'riqlaydigan bu endpoint orqali
    # beriladi), 'moderator' — admin-panelga to'liq kirish lekin
    # foydalanuvchi status/rolini o'zgartira olmaydi, 'none' — ikkalasini ham
    # qaytarib olish (doverenniy'ga tushadi).
    role: Literal["admin", "moderator", "none"]


class AdminAddPointsRequest(BaseModel):
    user_id: int
    amount: Decimal


# ============ Pricing (xizmat narxlari — FAQAT admin) ============
class PricingOut(BaseModel):
    price_text_message: Decimal
    price_voice_message: Decimal
    price_slot_per_hour: Decimal


class PricingUpdate(BaseModel):
    price_text_message: Decimal = Field(ge=0)
    price_voice_message: Decimal = Field(ge=0)
    price_slot_per_hour: Decimal = Field(ge=0)


class AdminNewsCreate(BaseModel):
    language: str  # ru | en | lt
    title: str
    body: str
    image_url: str = ""


# ============ Generic ============
class OkResponse(BaseModel):
    ok: bool = True
    detail: Any | None = None


# ============ Stats ============
class UserStatsOut(BaseModel):
    total_messages: int = 0
    chat_messages: int = 0
    voice_messages: int = 0
    studio_messages: int = 0
    file_uploads: int = 0
    points_earned: int = 0
    points_spent: int = 0
    current_points: Any = 0
    days_active: int = 0
    broadcasts_count: int = 0
    favorite_count: int = 0
    level: int = 1


# ============ Favorites ============
class FavoriteOut(BaseModel):
    id: int
    item_type: str
    item_id: int
    title: str
    content: str | None = None
    broadcaster: str | None = None
    duration: int | None = None


# ============ Casting (ведущий отбори) ============
class CastingApplicationOut(BaseModel):
    id: int
    user_id: int
    username: str | None = None
    display_name: str | None = None
    audio_url: str
    note: str = ""
    status: str
    admin_note: str = ""
    created_at: datetime
    decided_at: datetime | None = None


class CastingStatusOut(BaseModel):
    applied: bool = False
    status: str | None = None  # pending | approved | rejected
    admin_note: str = ""
    created_at: datetime | None = None
    already_doverenniy: bool = False


class CastingDecisionRequest(BaseModel):
    admin_note: str = ""


class FavoriteAddRequest(BaseModel):
    item_type: str  # broadcast | message | segment
    item_id: int
    title: str
    content: str | None = None
    broadcaster: str | None = None
    duration: int | None = None
    audio_url: str | None = None


# ============ Messages (studio + voice — TZ §3) ============
class TextMessageRequest(BaseModel):
    city: str
    text: str
    lang: str | None = None  # ru | en | lt


class PsychotypeOut(BaseModel):
    focus_of_attention: str
    emotional_tone: str
    key_topic: str
    priority_score: int


class MessageResponse(BaseModel):
    transcript: str | None = None
    psychotype: PsychotypeOut | None = None
    ai_reply: str | None = None
    voice_url: str | None = None
    file_url: str | None = None
    points: Any | None = None

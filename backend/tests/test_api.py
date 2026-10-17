"""INTRA GROUP API tests — v3.0.

Barcha yangi endpointlarni test qiladi:
- Auth (login, til tanlash)
- Profile (get, update)
- Points (balance, transfer, request, purchase)
- News
- Chat
- Admin
- Health
"""

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.core.database import db
from app.core.dependencies import create_access_token
from tests.conftest import make_user

pytestmark = pytest.mark.asyncio


# ══════════════ HEALTH ══════════════


async def test_health(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


async def test_readiness(client):
    resp = await client.get("/health/ready")
    assert resp.status_code == 200
    data = resp.json()
    assert "checks" in data
    assert data["checks"]["database"] is True


async def test_api_root(client):
    resp = await client.get("/api")
    assert resp.status_code == 200
    assert resp.json()["service"] == "INTRA GROUP"


# ══════════════ AUTH ══════════════


async def test_auth_telegram_new_user(client, patch_db):
    """Yangi foydalanuvchi — is_new_user=True."""
    new_user = make_user()
    db.fetchrow = AsyncMock(side_effect=[None, new_user])

    resp = await client.post(
        "/auth/telegram",
        json={
            "telegram_id": 111111,
            "username": "testuser",
            "full_name": "Test User",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["is_new_user"] is True
    assert data["level"] == 1


async def test_auth_telegram_existing_user(client, patch_db):
    """Mavjud foydalanuvchi — is_new_user=False."""
    existing = make_user(level=2, points=Decimal("3.5000"))
    db.fetchrow = AsyncMock(side_effect=[existing, existing])

    resp = await client.post(
        "/auth/telegram",
        json={
            "telegram_id": 111111,
            "username": "testuser",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_new_user"] is False
    assert data["level"] == 2


async def test_select_language(client, patch_db):
    """Til tanlash."""
    user = make_user()
    db.fetchrow = AsyncMock(return_value=user)
    db.execute = AsyncMock()

    token = create_access_token(111111)
    resp = await client.post(
        "/auth/select-language",
        headers={"Authorization": f"Bearer {token}"},
        json={"language": "lt"},
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True


async def test_select_language_invalid(client, patch_db):
    """Noto'g'ri til."""
    user = make_user()
    db.fetchrow = AsyncMock(return_value=user)

    token = create_access_token(111111)
    resp = await client.post(
        "/auth/select-language",
        headers={"Authorization": f"Bearer {token}"},
        json={"language": "fr"},
    )
    assert resp.status_code == 400


# ══════════════ PROFILE ══════════════


async def test_get_me(client, patch_db):
    """Profil olish."""
    user = make_user(level=2, language="en", points=Decimal("4.2500"))
    db.fetchrow = AsyncMock(return_value=user)
    db.execute = AsyncMock()

    token = create_access_token(111111)
    resp = await client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["level"] == 2
    assert data["language"] == "en"
    assert data["level_name"] == "Активный"
    assert data["telegram_id"] == 111111


async def test_get_me_unauthorized(client):
    """Token yo'q — 401/403."""
    resp = await client.get("/users/me")
    assert resp.status_code in (401, 403)


async def test_update_profile(client, patch_db):
    """Display name yangilash."""
    user = make_user()
    db.fetchrow = AsyncMock(return_value=user)
    db.execute = AsyncMock()

    token = create_access_token(111111)
    resp = await client.put(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"display_name": "New Name"},
    )
    assert resp.status_code == 200


async def test_update_profile_empty_name(client, patch_db):
    """Bo'sh display name — 400."""
    user = make_user()
    db.fetchrow = AsyncMock(return_value=user)

    token = create_access_token(111111)
    resp = await client.put(
        "/users/me",
        headers={"Authorization": f"Bearer {token}"},
        json={"display_name": ""},
    )
    assert resp.status_code == 400


# ══════════════ POINTS ══════════════


async def test_get_points(client, patch_db):
    """Balans olish."""
    user = make_user(points=Decimal("3.1415"))
    db.fetchrow = AsyncMock(return_value=user)
    db.execute = AsyncMock()

    token = create_access_token(111111)
    resp = await client.get("/users/me/points", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["level"] == 1


async def test_get_packages(client, patch_db):
    """Point paketlari."""
    db.fetch = AsyncMock(
        return_value=[
            {
                "id": 1,
                "points_amount": Decimal("100"),
                "price_eur": Decimal("1.00"),
                "price_stars": 100,
                "label": "100 points",
            },
            {
                "id": 2,
                "points_amount": Decimal("500"),
                "price_eur": Decimal("4.00"),
                "price_stars": 400,
                "label": "500 points",
            },
        ]
    )
    user = make_user()
    db.fetchrow = AsyncMock(return_value=user)
    db.execute = AsyncMock()

    token = create_access_token(111111)
    resp = await client.get(
        "/users/me/points/packages", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["label"] == "100 points"


async def test_transfer_to_self(client, patch_db):
    """O'ziga o'ziga transfer — 400."""
    user = make_user(id=1)
    db.fetchrow = AsyncMock(return_value=user)
    db.execute = AsyncMock()

    token = create_access_token(111111)
    resp = await client.post(
        "/users/me/points/transfer",
        headers={"Authorization": f"Bearer {token}"},
        json={"to_user_id": 1, "amount": "1.0"},
    )
    assert resp.status_code == 400


# ══════════════ NEWS ══════════════


async def test_get_news_ru(client, patch_db):
    """Rus tilidagi yangiliklar."""
    from datetime import datetime

    db.fetch = AsyncMock(
        return_value=[
            {
                "id": 1,
                "title": "Новость",
                "body": "Текст",
                "image_url": "",
                "created_at": datetime.now(),
            },
        ]
    )

    resp = await client.get("/news/ru")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Новость"


async def test_get_news_invalid_lang(client):
    """Noto'g'ri til — 400."""
    resp = await client.get("/news/fr")
    assert resp.status_code == 400


# ══════════════ CHAT ══════════════


async def test_chat_send(client, patch_db):
    """Chat xabar yuborish (point sarflanadi)."""
    from datetime import datetime

    user = make_user(points=Decimal("5.0000"))
    # fetchrow calls: 1) get_current_user, 2) spend (UPDATE RETURNING),
    # 3) recompute_level (SELECT level, spend() ichida chaqiriladi), 4) INSERT RETURNING
    db.fetchrow = AsyncMock(
        side_effect=[
            user,  # get_current_user
            {"points": Decimal("4.9990")},  # spend
            {"level": 1},  # recompute_level
            {"id": 1, "created_at": datetime.now()},  # INSERT
        ]
    )
    db.execute = AsyncMock()

    token = create_access_token(111111)
    resp = await client.post(
        "/chat/send",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "Hello!"},
    )
    assert resp.status_code == 200


async def test_chat_send_empty(client, patch_db):
    """Bo'sh xabar — 400."""
    user = make_user()
    db.fetchrow = AsyncMock(return_value=user)
    db.execute = AsyncMock()

    token = create_access_token(111111)
    resp = await client.post(
        "/chat/send",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": "  "},
    )
    assert resp.status_code == 400


async def test_chat_history(client, patch_db):
    """Chat tarix."""
    db.fetch = AsyncMock(return_value=[])
    resp = await client.get("/chat/history")
    assert resp.status_code == 200
    assert resp.json() == []


# ══════════════ ADMIN ══════════════


async def test_admin_set_level(client, patch_db):
    """Admin level o'zgartiradi."""
    admin_user = make_user(telegram_id=123456, role="admin")
    db.fetchrow = AsyncMock(return_value=admin_user)
    db.execute = AsyncMock(return_value="UPDATE 1")

    token = create_access_token(123456)
    resp = await client.post(
        "/admin/users/set-level",
        headers={"Authorization": f"Bearer {token}"},
        json={"user_id": 2, "level": 3},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["detail"]["level"] == 3
    assert data["detail"]["role"] == "doverenniy"


async def test_admin_set_level_invalid(client, patch_db):
    """Noto'g'ri level — 400."""
    admin_user = make_user(telegram_id=123456, role="admin")
    db.fetchrow = AsyncMock(return_value=admin_user)
    db.execute = AsyncMock()

    token = create_access_token(123456)
    resp = await client.post(
        "/admin/users/set-level",
        headers={"Authorization": f"Bearer {token}"},
        json={"user_id": 2, "level": 5},
    )
    assert resp.status_code == 400


async def test_admin_not_admin(client, patch_db):
    """Oddiy foydalanuvchi admin endpoint — 403."""
    regular_user = make_user(telegram_id=999999, role="listener")
    db.fetchrow = AsyncMock(return_value=regular_user)
    db.execute = AsyncMock()

    token = create_access_token(999999)
    resp = await client.post(
        "/admin/users/set-level",
        headers={"Authorization": f"Bearer {token}"},
        json={"user_id": 2, "level": 2},
    )
    assert resp.status_code == 403


# ══════════════ TOKEN ══════════════


def test_create_and_decode_token():
    from app.core.dependencies import create_access_token, decode_token

    token = create_access_token(999)
    assert decode_token(token) == 999


def test_decode_invalid_token():
    from fastapi import HTTPException

    from app.core.dependencies import decode_token

    with pytest.raises(HTTPException):
        decode_token("garbage.token.here")


# ══════════════ POINTS SERVICE (unit) ══════════════


async def test_points_spend_text(patch_db):
    """spend_text atomik ishlashi."""
    # "level" ham kerak — spend() ichida recompute_level() xuddi shu
    # fetchrow mock'ni qayta ishlatadi (SELECT level FROM users ...).
    db.fetchrow = AsyncMock(return_value={"points": Decimal("4.9990"), "level": 1})
    db.execute = AsyncMock()

    from app.services.points import spend_text

    result = await spend_text(user_id=1)
    assert result["ok"] is True
    assert result["points"] == Decimal("4.9990")


async def test_points_spend_insufficient(patch_db):
    """Point yetmasa — fail."""
    db.fetchrow = AsyncMock(return_value=None)  # UPDATE returns None (not enough)
    db.fetchval = AsyncMock(return_value=Decimal("0.0005"))

    from app.services.points import spend_text

    result = await spend_text(user_id=1)
    assert result["ok"] is False
    assert "insufficient" in result.get("reason", "")


async def test_points_transfer(patch_db):
    """Transfer ishlashi."""
    # "level" ham kerak — transfer() ichida recompute_level() (ikkala
    # tomon uchun ham) xuddi shu fetchrow mock'ni qayta ishlatadi.
    db.fetchrow = AsyncMock(return_value={"points": Decimal("3.0000"), "level": 1})
    db.execute = AsyncMock()

    from app.services.points import transfer

    result = await transfer(from_user_id=1, to_user_id=2, amount=Decimal("1.0"))
    assert result["ok"] is True


async def test_points_transfer_to_self(patch_db):
    """O'ziga transfer — fail."""
    from app.services.points import transfer

    result = await transfer(from_user_id=1, to_user_id=1, amount=Decimal("1.0"))
    assert result["ok"] is False
    assert result["reason"] == "cannot_transfer_to_self"

"""Opinion Agregatsiya servisi — Boshliq asosiy g'oyasi.

Mantiq (boshliq bayoni bo'yicha):
  1. Faol mavzu bo'yicha barcha fikrlarni (opinions) olamiz.
  2. Gemini bilan 3 ta asosiy pozitsiyani aniqlaymiz (1-ko'pchilik, 2-, 3-).
  3. 2 ta AI personaj (Aleksey va Maya) o'rtasida 8-15 daqiqalik dialog yaratamiz.
  4. Dialoga musiqaviy segment taklif ham qo'shamiz (ko'pchilik tanlagan).
  5. Natijani `broadcast_drafts` jadvaliga `pending` holatda saqlaymiz.
  6. Moderator (boshliq) tasdiqlasa → TTS → MediaMTX efirga.

AI personajlar:
  - Aleksey — mantiqli, faktlarga asoslangan, biroz jiddiy
  - Maya    — his-tuyg'uli, odamlarga yaqin, ijodiy
"""

import logging

from app.core.database import db
from app.services import gemini

log = logging.getLogger("opinion_aggregator")

# Minimal fikr soni agregatsiya uchun
MIN_OPINIONS = 3
MAX_OPINIONS = 200  # Gemini kontekst chegarasi uchun

# AI personajlar (boshliq "daylim imya")
PERSONA_A = "Aleksey"  # mantiqli, jiddiy
PERSONA_B = "Maya"  # his-tuyg'uli, ijodiy

POSITIONS_PROMPT = """Ты — AI-аналитик мнений для радиоэфира INTRA GROUP.

Тема эфира: {topic_title}
{topic_desc}

Мнения участников ({count} штук):
{opinions_block}

Задача:
1. Проанализируй все мнения.
2. Выдели ТРИ ключевые позиции по принципу большинства:
   - Позиция 1: самое распространённое мнение (большинство)
   - Позиция 2: второе по популярности мнение
   - Позиция 3: третье мнение (меньшинство, но заметное)
3. Для каждой позиции укажи примерный % участников.

Верни ТОЛЬКО JSON:
{{
  "position_1": {{
    "summary": "суть позиции 1 (2-3 предложения)",
    "percent": 55,
    "key_phrases": ["фраза 1", "фраза 2"]
  }},
  "position_2": {{
    "summary": "суть позиции 2 (2-3 предложения)",
    "percent": 30,
    "key_phrases": ["фраза 1", "фраза 2"]
  }},
  "position_3": {{
    "summary": "суть позиции 3 (2-3 предложения)",
    "percent": 15,
    "key_phrases": ["фраза 1", "фраза 2"]
  }},
  "music_suggestion": "какую музыку хотят слушатели (1 предложение)"
}}"""

DIALOG_PROMPT = """Ты — сценарист радиодиалога для INTRA GROUP.

Тема эфира: {topic_title}

Три позиции слушателей:
Позиция 1 ({p1_pct}%): {p1}
Позиция 2 ({p2_pct}%): {p2}
Позиция 3 ({p3_pct}%): {p3}

Персонажи:
- {persona_a}: аналитичный, логичный, опирается на факты
- {persona_b}: эмоциональный, близкий к людям, творческий

Напиши живой диалог 8-12 минут (примерно 900-1300 слов) между {persona_a} и {persona_b}.
Они обсуждают тему, отражая все три позиции слушателей.
Начни с приветствия и представления темы.
Закончи подведением итогов и приглашением присылать мнения.

Правила:
- Живой разговорный стиль, как настоящее радио.
- Каждая реплика с новой строки: "{persona_a}: текст" или "{persona_b}: текст"
- НЕ используй ремарки в скобках (действия, паузы и т.п.)
- Только диалог, без пояснений.
- На русском языке."""


def _format_opinions(opinions: list[dict]) -> str:
    """Fikrlarni bloq ko'rinishida formatlaydi."""
    lines = []
    for i, op in enumerate(opinions, 1):
        author = op.get("username") or op.get("display_name") or "участник"
        text = (op.get("text") or "").strip()
        if text:
            lines.append(f"{i}. {author}: {text}")
    return "\n".join(lines) if lines else "(нет текстовых мнений)"


def _fallback_positions(topic_title: str, count: int) -> dict:
    """Gemini yo'q bo'lsa — oddiy fallback."""
    return {
        "position_1": {
            "summary": f"Большинство участников поддерживают тему «{topic_title}» "
            f"и выражают позитивное отношение.",
            "percent": 60,
            "key_phrases": ["поддерживаю", "согласен"],
        },
        "position_2": {
            "summary": "Часть участников предлагают рассмотреть альтернативный "
            "подход или уточнить детали.",
            "percent": 30,
            "key_phrases": ["но стоит учесть", "с другой стороны"],
        },
        "position_3": {
            "summary": "Небольшая часть участников придерживается иного мнения "
            "или задаёт уточняющие вопросы.",
            "percent": 10,
            "key_phrases": ["не согласен", "вопрос"],
        },
        "music_suggestion": f"Слушатели хотят слышать музыку под настроение темы «{topic_title}».",
    }


def _fallback_dialog(topic_title: str, positions: dict) -> str:
    """Gemini yo'q bo'lsa — sodda dialog."""
    p1 = positions["position_1"]["summary"]
    p2 = positions["position_2"]["summary"]
    p3 = positions["position_3"]["summary"]
    return (
        f"{PERSONA_A}: Добрый день, дорогие слушатели INTRA GROUP! "
        f"Сегодня мы обсуждаем тему: «{topic_title}». "
        f"Я {PERSONA_A}, и рядом со мной {PERSONA_B}.\n"
        f"{PERSONA_B}: Привет всем! Мнений пришло много — давай разберём.\n"
        f"{PERSONA_A}: Большинство участников говорят следующее: {p1}\n"
        f"{PERSONA_B}: Это действительно важно. Но есть и другая позиция: {p2}\n"
        f"{PERSONA_A}: Верно. И ещё одна точка зрения: {p3}\n"
        f"{PERSONA_B}: Как интересно! Значит, у нас три лагеря.\n"
        f"{PERSONA_A}: Именно. Каждый имеет право на своё мнение.\n"
        f"{PERSONA_B}: Спасибо всем, кто прислал своё мнение! "
        f"Присылайте ещё — мы вас слышим.\n"
        f"{PERSONA_A}: До встречи в эфире INTRA GROUP!"
    )


async def aggregate_opinions(topic_id: int) -> dict | None:
    """Mavzu bo'yicha fikrlarni yig'ib, 3 pozitsiya va dialog yaratadi.

    Qaytaradi: broadcast_drafts yozuvi yoki None (fikr yetarli emas).
    """
    # Mavzuni olamiz
    topic = await db.fetchrow(
        "SELECT id, title, description, status FROM topics WHERE id = $1", topic_id
    )
    if not topic:
        log.warning("aggregate_opinions: topic %d topilmadi", topic_id)
        return None

    # Fikrlarni olamiz (faqat matnlilar, pending)
    opinions = await db.fetch(
        """
        SELECT o.id, o.text, o.kind, u.username, u.display_name
        FROM opinions o
        LEFT JOIN users u ON u.id = o.user_id
        WHERE o.topic_id = $1 AND o.status = 'pending'
              AND o.text IS NOT NULL AND o.text <> ''
        ORDER BY o.created_at ASC
        LIMIT $2
        """,
        topic_id,
        MAX_OPINIONS,
    )
    pool = [dict(r) for r in opinions]

    if len(pool) < MIN_OPINIONS:
        log.info(
            "aggregate_opinions: topic %d — fikr kam (%d < %d)", topic_id, len(pool), MIN_OPINIONS
        )
        return None

    log.info("[agregator] topic=%d '%s': %d ta fikr yig'ildi", topic_id, topic["title"], len(pool))

    opinions_block = _format_opinions(pool)

    # 1-qadam: 3 pozitsiya aniqlash
    positions_prompt = POSITIONS_PROMPT.format(
        topic_title=topic["title"],
        topic_desc=f"({topic['description']})" if topic.get("description") else "",
        count=len(pool),
        opinions_block=opinions_block,
    )

    positions = None
    ai_ok = False
    try:
        positions = await gemini.generate_json(positions_prompt)
        if all(f"position_{i}" in positions for i in (1, 2, 3)):
            ai_ok = True
            log.info(
                "[agregator] 3 pozitsiya aniqlandi: %d%% | %d%% | %d%%",
                positions["position_1"].get("percent", 0),
                positions["position_2"].get("percent", 0),
                positions["position_3"].get("percent", 0),
            )
    except Exception as exc:
        log.warning("[agregator] Gemini pozitsiya xato: %s", exc)

    if not positions or not ai_ok:
        positions = _fallback_positions(topic["title"], len(pool))

    # 2-qadam: 2 personaj dialog yaratish
    dialog_prompt = DIALOG_PROMPT.format(
        topic_title=topic["title"],
        p1=positions["position_1"]["summary"],
        p1_pct=positions["position_1"].get("percent", 50),
        p2=positions["position_2"]["summary"],
        p2_pct=positions["position_2"].get("percent", 30),
        p3=positions["position_3"]["summary"],
        p3_pct=positions["position_3"].get("percent", 20),
        persona_a=PERSONA_A,
        persona_b=PERSONA_B,
    )

    dialog = None
    try:
        dialog = await gemini.generate_text(dialog_prompt)
        if not dialog or len(dialog.strip()) < 100:
            raise ValueError("bo'sh dialog")
        log.info("[agregator] Dialog yaratildi (%d so'z)", len(dialog.split()))
    except Exception as exc:
        log.warning("[agregator] Gemini dialog xato: %s", exc)
        dialog = _fallback_dialog(topic["title"], positions)

    # 3-qadam: broadcast_drafts ga saqlash
    script_meta = {
        "type": "dialog",
        "persona_a": PERSONA_A,
        "persona_b": PERSONA_B,
        "positions": {
            "p1": positions["position_1"],
            "p2": positions["position_2"],
            "p3": positions["position_3"],
        },
        "music_suggestion": positions.get("music_suggestion", ""),
        "source_opinions": len(pool),
    }

    import json

    row = await db.fetchrow(
        """
        INSERT INTO broadcast_drafts
          (city, main_topic, source_count, script, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING id, city, main_topic, source_count, script, status, created_at
        """,
        "global",
        topic["title"],
        len(pool),
        f"[META:{json.dumps(script_meta, ensure_ascii=False)}]\n\n{dialog}",
    )

    # Fikrlarni "ishlatilgan" deb belgilaymiz
    ids = [op["id"] for op in pool]
    if ids:
        await db.execute("UPDATE opinions SET status = 'aggregated' WHERE id = ANY($1::int[])", ids)

    log.info(
        "[agregator] Broadcast draft #%d saqlandi: '%s' (%d fikr)",
        row["id"],
        topic["title"],
        len(pool),
    )
    return dict(row)


async def get_draft_dialog(draft_id: int) -> dict | None:
    """Draft'dan faqat dialog matnini oladi (META qismini olib tashlab)."""
    row = await db.fetchrow(
        "SELECT id, city, main_topic, source_count, script, status, created_at "
        "FROM broadcast_drafts WHERE id = $1",
        draft_id,
    )
    if not row:
        return None
    d = dict(row)
    script = d.get("script", "")
    # META qismini parse qilamiz
    if script.startswith("[META:"):
        end = script.find("]\n\n")
        if end != -1:
            import json

            try:
                meta_str = script[6:end]
                d["meta"] = json.loads(meta_str)
            except Exception:
                d["meta"] = {}
            d["dialog"] = script[end + 3 :]
        else:
            d["dialog"] = script
            d["meta"] = {}
    else:
        d["dialog"] = script
        d["meta"] = {}
    return d

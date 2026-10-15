"""TTS-сервис: ElevenLabs (основной) + edge-tts (фолбэк), мультиязычный.

Языки: ru | lt | en. Голос выбирается по языку.
Провайдер: TTS_PROVIDER=elevenlabs|edge. При сбое ElevenLabs и
TTS_FALLBACK_EDGE=true — переключается на edge-tts (работоспособность сохраняется).
"""

import asyncio
import logging
import os

log = logging.getLogger("tts")

TTS_PROVIDER = os.getenv("TTS_PROVIDER", "elevenlabs")
TTS_FALLBACK_EDGE = os.getenv("TTS_FALLBACK_EDGE", "true").lower() == "true"
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVEN_MODEL = os.getenv("ELEVEN_MODEL", "eleven_multilingual_v2")

# Голоса ElevenLabs по языку (voice_id из env)
ELEVEN_VOICES = {
    "ru": os.getenv("ELEVEN_VOICE_RU", ""),
    "lt": os.getenv("ELEVEN_VOICE_LT", ""),
    "en": os.getenv("ELEVEN_VOICE_EN", ""),
}

# edge-tts голоса по языку (фолбэк, без ключей)
EDGE_VOICES = {
    "ru": "ru-RU-SvetlanaNeural",
    "lt": "lt-LT-LeonasNeural",
    "en": "en-US-GuyNeural",
}


async def _eleven_synth(text: str, out_path: str, voice_id: str) -> str:
    """Синтез через ElevenLabs HTTP API. Бросает исключение при ошибке."""
    import httpx

    if not voice_id:
        raise RuntimeError("ElevenLabs voice_id not configured")
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": ELEVEN_MODEL,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        with open(out_path, "wb") as f:
            f.write(resp.content)
    return out_path


async def _edge_synth(text: str, out_path: str, lang: str) -> str:
    """Синтез через edge-tts (фолбэк)."""
    import edge_tts  # lazy

    voice = EDGE_VOICES.get(lang, EDGE_VOICES["ru"])
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(out_path)
    return out_path


async def _gtts_synth(text: str, out_path: str, lang: str) -> str:
    """gTTS orqali kafolatlangan bepul sintez (edge-tts va ElevenLabs ishlamasa)."""
    from gtts import gTTS

    def _run():
        gtts_lang = lang if lang in ("ru", "en") else "en"
        tts_obj = gTTS(text=text, lang=gtts_lang)
        tts_obj.save(out_path)
        return out_path

    return await asyncio.to_thread(_run)


async def synthesize(text: str, out_path: str, lang: str = "ru") -> str:
    """Синтезирует речь в mp3. ElevenLabs primary, edge-tts fallback, gTTS ultimate fallback.

    Args:
        text: текст для озвучки
        out_path: путь к выходному mp3
        lang: ru | lt | en (выбор голоса)
    """
    if TTS_PROVIDER == "elevenlabs" and ELEVENLABS_API_KEY:
        try:
            return await _eleven_synth(text, out_path, ELEVEN_VOICES.get(lang, ""))
        except Exception as exc:  # noqa: BLE001
            log.warning("ElevenLabs TTS failed (%s): %s", lang, exc)
            if not TTS_FALLBACK_EDGE:
                raise
    # Фолбэк / основной edge-tts
    try:
        return await _edge_synth(text, out_path, lang)
    except Exception as exc:  # noqa: BLE001
        log.warning("edge-tts failed (%s): %s, falling back to gTTS", lang, exc)
        return await _gtts_synth(text, out_path, lang)


async def synthesize_multilang(scripts: dict[str, str], out_dir: str) -> dict[str, str]:
    """Синтезирует до 3 аудио по языкам. Изоляция сбоев: ошибка одного языка
    не блокирует остальные (Req 10.4).

    Args:
        scripts: {"ru": текст, "lt": текст, "en": текст}
        out_dir: папка для mp3
    Returns:
        {"ru": path, "lt": path, "en": path} — только успешно сгенерированные.
    """
    import uuid

    os.makedirs(out_dir, exist_ok=True)
    results: dict[str, str] = {}

    async def _one(lang: str, text: str):
        if not (text or "").strip():
            return
        path = os.path.join(out_dir, f"{lang}_{uuid.uuid4().hex}.mp3")
        try:
            await synthesize(text, path, lang)
            results[lang] = path
        except Exception as exc:  # noqa: BLE001
            log.error("synthesize_multilang failed for %s: %s", lang, exc)

    # Конкурентный синтез всех языков
    await asyncio.gather(*[_one(lang, txt) for lang, txt in scripts.items()])
    return results


def synthesize_sync(text: str, out_path: str, lang: str = "ru") -> str:
    return asyncio.run(synthesize(text, out_path, lang))

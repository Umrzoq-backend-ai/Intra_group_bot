# 📋 INTRA GROUP — Loyiha To'liq Holati (HANDOVER)

> Bu hujjat loyihani **boshqa AI/dasturchi davom ettirishi** uchun yozilgan.
> Boshliq (Varl Blask) talablari, hozirgi holat, ishlaydigan/ishlamaydigan
> qismlar, infratuzilma va keyingi qadamlar — hammasi shu yerda.
>
> **Sana:** 2026-06-30 | **Til:** ru/en/lt | **Holat:** MVP — ~75% tayyor

---

## 1. LOYIHA MOHIYATI (eng muhim — buni tushunmasdan boshlama)

**INTRA GROUP** — yangi turdagi interaktiv platforma. Oddiy radio EMAS, oddiy
guruh chat ham EMAS.

### Asosiy g'oya (boshliq so'zlari bilan):
```
Mavzu e'lon qilinadi
   ↓
Minglab odam o'z FIKRINI (mneniya) yuboradi — matn yoki ovoz
(har fikr uchun POINT sarflanadi)
   ↓
AI hamma fikrlarni yig'ib, KO'PCHILIK pozitsiyasini aniqlaydi (1/2/3-pozitsiya)
   ↓
AI 2 ta personaj o'rtasida tabiiy DIALOG yaratadi (8-15 daqiqa)
   ↓
Moderator (boshliq) tasdiqlaydi
   ↓
EFIRGA chiqadi → hamma tinglaydi
   ↓
Musiqa (ko'pchilik tanlagan)
```

### MUHIM QARORLAR (boshliq tasdiqlagan):
1. **AI qismi — KEYINGI bosqich.** Hozir AI dialog/agregatsiya shart emas.
   Hozir **platforma asosini** qurish kerak.
2. **Efir 2 xil bo'lishi mumkin** (loyiha tarixida ikkalasi ham bor):
   - **Icecast radio** (hozir ishlaydi, kompyuterga o'rnatilgan)
   - **Telegram Voice Chat** (boshliq keyin tanlagan, session string kerak)
3. **Fikrlar Telegram resursida saqlanadi** (oddiy guruh kabi), serverda emas —
   ortiqcha xarajatdan qochish uchun (boshliq talabi).

---

## 2. BOSHLIQ (VARL) TALABLARI — to'liq ro'yxat

### 2.1. Voice Chat / Efir (22.06.2026 xabarlari)
- Efir Telegram Voice Chat orqali (radio formati litsenziya talab qiladi —
  yuridik muammo, shuning uchun guruh afzal).
- Guruhda muzika **bemalol** ulashish mumkin (litsenziya kerak emas).
- Ishtirokchilar **faqat moderator ruxsati bilan** mikrofon oladi.
- Moderator tasdiqlaydi: "bu odam gapira oladi" → mikrofon beradi.
- 2-3-5 akkaunt bilan test qilish kerak.

### 2.2. Fikr yuborish
- Foydalanuvchi **matn yoki ovoz** yuboradi (video YO'Q).
- Forma cheklovi yo'q — odam xohlagandek yozadi/gapiradi.

### 2.3. Mini-app kirish oqimi (aniq tartib)
1. `/start` → til tanlash: **EN, LT, RU** (shu tartibda).
2. Logo: **INTRA GROUP** (3 rangda — IN oq, TRA cyan, GROUP purple).
3. Til tanlagach → "Dobro pojalovat" + o'sha davlat haqida **yangilik/podkast**.
4. Yangilikni ko'rib → **platformaga** kiradi.
5. Kirishda **dumaloq orb** animatsiyasi (Jarvis uslubida, gradient).

### 2.4. Profil (aniq tartib — boshliq talabi)
1. **1-o'rin: Уровень (Level)** — 1 Слушатель / 2 Слушатель / 3 Слушатель и ведущий
2. **2-o'rin: Язык (til)** — qaysi tilni tanlagani
3. **3-o'rin: ID** — Telegram ID
- Foydalanuvchi **ism (display_name)** va **username** ni tahrirlay oladi.

### 2.5. Point tizimi (aniq raqamlar)
- Point **kasr son** ko'rinishida (masalan `5699.900`).
- 1 ta **matn** = **0.001** point.
- 1 ta **ovoz** = **0.005** point.
- **So'rash:** ID bo'yicha boshqa odamdan point so'rash → o'sha odamga xabar boradi.
- **Berish:** ID bo'yicha point yuborish.
- **Sotib olish:** profil → real pulga (masalan 5 euro = N point).

### 2.6. Yondashuv
- **Backend birinchi, frontend ikkinchi** (boshliq: "backend to'g'ri bo'lsa, frontend oson").

---

## 3. HOZIRGI HOLAT — nima ishlaydi, nima yo'q

### ✅ TO'LIQ ISHLAYDI:
| Funksiya | Holat | Tafsilot |
|----------|-------|----------|
| Telegram auth (JWT) | ✅ | `telegram_id` → token |
| Til tanlash (EN/LT/RU) | ✅ | Welcome sahifa, tartib to'g'ri |
| Yangilik (podkast) | ✅ | Til bo'yicha, 3 tilda DB'da bor |
| Profil (Level/Til/ID) | ✅ | Tartib boshliq talabidek |
| Profil tahrirlash | ✅ | display_name, username |
| Point: kasr son | ✅ | 0.001 matn, 0.005 ovoz |
| Point: yuborish (transfer) | ✅ | ID bo'yicha, ACID |
| Point: so'rash (request) | ✅ | ID bo'yicha, tasdiqlash |
| Point: sotib olish | ✅ | Telegram Payments (XTR/Stars), bot orqali |
| 3 daraja (level) | ✅ | admin boshqaradi |
| Mneniya (matn/ovoz) | ✅ | guruhda + mini-app |
| Jonli chat (matn) | ✅ | WS + HTTP fallback |
| Jonli chat (ovoz) | ✅ | `.uploads/` doimiy papka, MP3 konvert |
| **Icecast radio (AI host)** | ✅ | 3 til oqimi: /live_ru, /live_lt, /live_en |
| **Jonli efir (mikrofon)** | ✅ | doverenniy → WS → FFmpeg → Icecast (TEST QILINGAN) |
| Statistika | ✅ | haqiqiy DB'dan |
| Favorites | ✅ | haqiqiy DB'dan |
| Admin panel (mini-app) | ✅ | mavzu ochish/yopish, user boshqarish |
| Bot buyruqlari | ✅ | /start /studio /radio /topic /buy /profile /admin /efir /mic /mute /help |
| Dizayn (Stitch) | ✅ | Sora shrift, orb, gradient, glassmorphism |

### ⏳ KUTILMOQDA (tayyor, lekin sozlama kerak):
| Funksiya | Nega ishlamayapti | Yechim |
|----------|-------------------|--------|
| **Telegram Voice Chat** | `TG_SESSION_STRING` bo'sh | Userbot session yaratish kerak (3.1-bo'lim) |

### ❌ KEYINGI BOSQICH (boshliq "keyin" dedi):
- AI dialog (2 personaj) — hozir bir AI monolog
- "Ko'pchilik" logikasi (1/2/3 pozitsiya)
- Moderatsiya (admin tasdiqlash UI)
- Musiqa ovoz berish
- Efir jadvali (doverenniy uchun)
- Kasting + ovoz berish

---

## 4. ARXITEKTURA

```
Telegram Bot (python-telegram-bot 22)
   ↓ /start → Mini App URL
Cloudflare Tunnel (HTTPS, BEQAROR — har restartda URL o'zgaradi)
   ↓
FastAPI Backend (port 8001)
   ├── REST API (auth, users, chat, radio, news, opinions, stats, favorites, voice, admin)
   ├── WebSocket /chat/ws (real-time chat)
   ├── WebSocket /radio/{city}/broadcast/ws (jonli efir: mikrofon→Icecast)
   ├── Radio proxy /radio/live/{lang} → Icecast (same-origin, tunnel orqali ishlaydi)
   ├── Static: frontend/dist (React SPA)
   ├── continuous worker → /live_ru,/live_lt,/live_en (uzluksiz AI oqim)
   ├── ai_host → Gemini → TTS → segment → continuous navbatiga
   └── voicechat service → pyrogram+pytgcalls (session bo'lsa)
        ↓
Icecast2 (port 8000) — 3 mount: /live_ru, /live_lt, /live_en
PostgreSQL (5432, radio_db)
Redis (6379, graceful fallback)
```

### Jonli efir mantiqi (MUHIM — qanday ishlaydi):
1. doverenniy/admin mini-app'da "GO LIVE" bosadi
2. Frontend: mikrofon → WebSocket `/radio/global/broadcast/ws`
3. Backend: `continuous.pause("ru")` (AI host RU mountni bo'shatadi)
4. Audio chunks → FFmpeg → Icecast `/live_ru`
5. Tinglovchilar `/radio/live/ru` proxy orqali eshitadi (AI'dan jonli efirga uzluksiz o'tish)
6. Efir tugaganda: `continuous.resume("ru")` (AI host qaytadi)
- Bitta shaharda bitta broadcaster (band tekshiruvi bor)

---

## 5. TEXNOLOGIYALAR

| Qatlam | Texnologiya |
|--------|-------------|
| Backend | Python 3.12, FastAPI, asyncpg, pydantic-settings |
| DB | PostgreSQL 16 |
| Cache | Redis 7 (yo'q bo'lsa in-memory fallback) |
| Streaming | Icecast2 + FFmpeg |
| Voice Chat | pyrofork (pyrogram fork) + pytgcalls (session kerak) |
| AI | Google Gemini 2.5 Flash (keyingi bosqich) |
| TTS | Edge TTS / gTTS |
| STT | faster-whisper |
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Bot | python-telegram-bot 22 |
| Tunnel | Cloudflare (cloudflared) — BEPUL, beqaror |
| Process | systemd user services (24/7, auto-restart) |

---

## 6. INFRATUZILMA (muhim — har buyruqda kerak)

### systemd user services (XDG_RUNTIME_DIR kerak):
```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user status sphera-backend   # FastAPI :8001
systemctl --user status sphera-bot        # Telegram bot
systemctl --user status sphera-tunnel     # Cloudflare tunnel (asosiy)
systemctl --user status sphera-icecast    # Icecast2 :8000
systemctl --user status sphera-icecast-tunnel  # Icecast uchun alohida tunnel
```
Hammasi `enabled`, auto-restart, server uyqu rejimi o'chirilgan (24/7 ishlaydi).

### Backend restart (port band qolish muammosi bor):
```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
pkill -9 -f "uvicorn app.main:app"; sleep 3
systemctl --user start sphera-backend; sleep 12
curl -s http://localhost:8001/health   # {"status":"ok"} kutiladi
```

### Bot restart (Conflict xatosi bo'lsa):
```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
systemctl --user stop sphera-bot
pkill -9 -f "bot/bot.py"; sleep 4
systemctl --user start sphera-bot; sleep 8
```

### Frontend build (same-origin uchun env BO'SH):
```bash
cd frontend && VITE_API_URL= VITE_WS_URL= VITE_RADIO_URL= npm run build
# Backend frontend/dist ni serve qiladi (MINIAPP_DIR)
# Build'dan keyin backend RESTART kerak (statik fayllar lifespan'da yuklanadi)
```

### Database:
```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d radio_db
# user=postgres pass=postgres db=radio_db
```

### Test foydalanuvchi (admin):
```bash
# telegram_id=7993413019 (Zoltanma, admin, ko'p pointli)
curl -s -X POST http://localhost:8001/auth/telegram \
  -H "Content-Type: application/json" \
  -d '{"telegram_id":7993413019}'
```

---

## 7. ⚠️ TUNNEL MUAMMOSI (eng tez-tez uchraydigan)

**Cloudflare bepul tunnel (trycloudflare) BEQAROR** — har restartda URL o'zgaradi.

Belgilari: mini-app ochilmaydi, chat ulanmaydi, "yuborib bo'lmadi".

Sabab: bot eski URL beradi yoki mini-app eski (o'lik) tunneldan ochilgan.

Yechim:
```bash
cat .logs/tunnel_url.txt          # hozirgi URL
# bot shu URL bilan ishga tushganini tekshir:
strings .logs/bot.log | grep "ishga tushdi" | tail -1
# mos kelmasa — botni restart qil (yangi URL oladi)
```
Foydalanuvchi har doim **bot orqali `/start` bosib** mini-app'ni ochishi kerak
(yangi URL bilan). Eski oynani yopib, qaytadan ochish.

**KELAJAK:** Production uchun doimiy domen kerak (VPS/GCP + o'z domeni yoki
Cloudflare named tunnel). Bepul trycloudflare faqat test uchun.

---

## 8. VOICE CHAT SESSION YARATISH (jonli efirning Telegram varianti uchun)

Telegram Voice Chat'ni **faqat userbot** (real akkaunt) boshqaradi — Bot API
bilan MUMKIN EMAS (Telegram cheklovi). Kod 100% tayyor, faqat session kerak.

```bash
make session
# yoki:
.venv/bin/python backend/scripts/gen_session.py
# Telefon raqam + Telegram kodi so'raydi → session string chiqadi
```
Keyin:
```bash
bash backend/scripts/set_session.sh "<CHIQQAN_SESSION_STRING>"
# .env ga qo'yadi va backendni restart qiladi
```
Shundan keyin botda `/efir` bosib jonli Voice Chat efirini boshlash mumkin.

**ESLATMA:** Loyiha tarixida session olishda muammo bo'lgan — Telegram SMS/kod
kelmagan (turli akkauntlar sinaldi). Bu akkaunt/raqam masalasi, dasturiy emas.
Boshliq raqami: `+370 682 11510` (Litva) bilan sinab ko'rish kerak.

---

## 9. MUHIT O'ZGARUVCHILARI (.env — muhimlari)

| O'zgaruvchi | Qiymat | Izoh |
|-------------|--------|------|
| `BOT_TOKEN` | `<TELEGRAM_BOT_TOKEN>` | @mybot_12_bot |
| `ADMIN_IDS` | `7993413019` | admin telegram_id |
| `COMMUNITY_CHAT_ID` | `-1003883809940` | guruh |
| `GEMINI_KEY` | `AIza...` | bepul kvota tez tugaydi |
| `USE_ICECAST` | `true` | Icecast yoqilgan |
| `ICECAST_PASS` | `IcecastPass2025!` | source parol |
| `UPLOAD_DIR` | `.uploads/` | **doimiy** (oldin /tmp edi — fayl yo'qolardi) |
| `AUDIO_DIR` | `.audio/` | **doimiy** |
| `TG_SESSION_STRING` | BO'SH | Voice Chat uchun kerak |
| `TG_API_ID` / `TG_API_HASH` | bor | userbot uchun |
| `VOICE_CHAT_GROUP_ID` | `-1003883809940` | |
| `PAYMENT_CURRENCY` | `XTR` | Telegram Stars |

**DIQQAT:** `.env` da inline izoh (`# ...`) YOZMA — pydantic uni qiymat deb o'qiydi.

---

## 10. MUHIM FAYLLAR (qayerda nima)

### Backend:
- `backend/app/main.py` — FastAPI app, router'lar, lifespan
- `backend/app/api/routers/chat.py` — chat (matn/ovoz), WebSocket
- `backend/app/api/routers/radio.py` — efir proxy, jonli efir WS
- `backend/app/api/routers/voicechat.py` — Voice Chat boshqaruv (/voice/*)
- `backend/app/api/routers/opinions.py` — mneniya (fikr) yig'ish
- `backend/app/api/routers/admin.py` — admin, topics (mavzu)
- `backend/app/api/routers/users.py` — profil, point, credit-purchase
- `backend/app/services/broadcast.py` — jonli efir (mikrofon→Icecast)
- `backend/app/services/continuous.py` — uzluksiz AI oqim, pause/resume
- `backend/app/services/voicechat.py` — pyrogram+pytgcalls
- `backend/app/core/config.py` — barcha sozlamalar
- `backend/scripts/gen_session.py` — Voice Chat session yaratish
- `backend/scripts/set_session.sh` — session'ni .env ga qo'yish

### Frontend:
- `frontend/src/pages/Splash.tsx` — kirish animatsiya
- `frontend/src/pages/Welcome.tsx` — til tanlash + yangilik
- `frontend/src/pages/Radio.tsx` — asosiy (5 tab)
- `frontend/src/pages/Admin.tsx` — admin panel (mavzu/user)
- `frontend/src/components/radio/EfirScreen.tsx` — efir + jonli chat (ASOSIY)
- `frontend/src/components/radio/GoLiveButton.tsx` — mikrofon efir
- `frontend/src/components/radio/ChatMessage.tsx` — chat xabar + ovoz player
- `frontend/src/components/profile/ProfileScreen.tsx` — profil
- `frontend/src/components/stats/StatsScreen.tsx` — statistika
- `frontend/src/components/favorites/FavoritesScreen.tsx` — favorites
- `frontend/src/components/announcements/AnonsScreen.tsx` — anons + VC holat
- `frontend/src/components/layout/BottomNav.tsx` — pastki navbar (orb)
- `frontend/src/components/layout/TopBar.tsx` — logo + point
- `frontend/src/lib/api.ts` — barcha API chaqiruvlar
- `frontend/src/index.css` — dizayn tizimi (Stitch: orb, waveform, glass)

### Hujjatlar:
- `docs/TZ-loyiha-talablari.md` — TZ (o'zbekcha)
- `docs/pivot-telegram-voicechat.md` — Voice Chat qaroriga o'tish
- `docs/loyiha-tushuncha-boshliqqa.md` — loyiha tushunchasi
- `.kiro/specs/community-points-broadcast/` — eng aniq spec (requirements+design)
- `.kiro/specs/ai-radio-platform/TZ.md` — to'liq vizyon (AI dialog bilan)

---

## 11. DIZAYN TIZIMI (Stitch — Google)

Dizayn Google Stitch'da yaratilgan. HTML/ranglar `.stitch_design/` papkasida.

| Element | Qiymat |
|---------|--------|
| Fon | `#060a14` (deep navy) |
| Accent | cyan `#38e1ff` → blue `#2ea8ff` |
| Secondary | purple `#7c5cff` |
| Shrift | Sora (sarlavha), JetBrains Mono (raqam/ID) |
| Ikonka | Material Symbols |
| Kartalar | glassmorphism, 24px radius, cyan border |
| Markaziy orb | breathing animatsiya + aylanuvchi halqa |

5 tab (pastki navbar): Anons | Stats | **Efir (orb)** | Favorites | Profil

---

## 12. KEYINGI QADAMLAR (tavsiya etilgan tartib)

1. **Tunnel barqarorligi** — doimiy domen (VPS yoki Cloudflare named tunnel).
   Hozirgi bepul tunnel har restartda uziladi — eng katta og'riq.
2. **Voice Chat session** — boshliq raqami bilan session yaratish, jonli VC test.
3. **Responsive polish** — Stats/Favorites/Admin ekranlarini Material+mono ga to'liq o'tkazish.
4. **AI bosqichi** (boshliq "keyin" dedi):
   - Mavzu bo'yicha fikrlarni Gemini bilan agregatsiya (1/2/3 pozitsiya)
   - 2 personaj dialog generatsiya
   - Moderatsiya UI (admin tasdiqlash)
5. **To'lov** — Telegram Stars to'liq test yoki provider token (BotFather → Payments).
6. **Musiqa ovoz berish** + efir jadvali.

---

## 13. HALOL ESLATMALAR (adashmaslik uchun)

- **Icecast hozir ishlaydi** (kompyuterga o'rnatilgan, 3 mount faol). Jonli efir
  mikrofon orqali TEST QILINGAN va ishlaydi.
- **Telegram Voice Chat** kodi tayyor, lekin session yo'qligidan ishlamaydi.
  Bu ikkisi ALTERNATIV — boshliq qaysi birini tanlasa, o'shasi ishlatiladi.
- **Tunnel URL doim o'zgaradi** — agar biror narsa "ishlamasa", birinchi navbatda
  tunnel URL va bot URL mosligini tekshir.
- **`/tmp` ishlatma** — fayllar yo'qoladi. Doimiy papka (`.uploads/`, `.audio/`).
- **`.env` da inline izoh yozma** — pydantic buzadi.
- Foydalanuvchi o'zbekcha gaplashadi, biznesmen (dasturchi emas) — UI/UX qarorlarini
  o'zing qabul qil, lekin backend mantiqini buzma.
- **Aniqlik muhim** — har bir o'zgartirishdan keyin build + restart + test qil.

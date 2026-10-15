-- ============================================================
--  INTRA GROUP — Database Schema v3.0
--  Yangi TZ: til tanlash → yangilik → platforma
-- ============================================================

-- ============ Foydalanuvchilar ============
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    telegram_id     BIGINT UNIQUE NOT NULL,
    username        VARCHAR(255),
    full_name       VARCHAR(255),
    display_name    VARCHAR(255),          -- foydalanuvchi o'zi tahrir qiladi
    language        VARCHAR(5) DEFAULT 'ru', -- tanlangan til: ru | en | lt
    level           INTEGER DEFAULT 1,      -- 1=слушатель, 2=слушатель, 3=слушатель и ведущий
    points          NUMERIC(12,4) DEFAULT 0.0000,  -- kasr son (0 dan boshlanadi)
    role            VARCHAR(20) DEFAULT 'listener', -- listener | broadcaster | admin
    city            VARCHAR(50),
    created_at      TIMESTAMP DEFAULT NOW(),
    last_seen       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_language ON users(language);

-- ============ Point tranzaksiyalari (tarix) ============
CREATE TABLE IF NOT EXISTS points_transactions (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    amount          NUMERIC(12,4) NOT NULL,  -- - yoki + (kasr)
    event_type      VARCHAR(30) NOT NULL,    -- text_message | voice_message | transfer_out | transfer_in | purchase | gift
    description     TEXT DEFAULT '',
    related_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, -- transfer uchun
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_points_tx_user ON points_transactions(user_id, created_at DESC);

-- ============ Point so'rovlari (bir foydalanuvchidan ikkinchisiga) ============
CREATE TABLE IF NOT EXISTS points_requests (
    id              SERIAL PRIMARY KEY,
    from_user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- so'rov yuborgan
    to_user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,  -- kimdan so'ralyapti
    amount          NUMERIC(12,4) NOT NULL,
    status          VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected
    message         TEXT DEFAULT '',
    created_at      TIMESTAMP DEFAULT NOW(),
    decided_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_points_requests_to ON points_requests(to_user_id, status);

-- ============ Yangiliklar (til bo'yicha, onboarding ekranida ko'rsatiladi) ============
CREATE TABLE IF NOT EXISTS news (
    id              SERIAL PRIMARY KEY,
    language        VARCHAR(5) NOT NULL,     -- ru | en | lt
    title           VARCHAR(300) NOT NULL,
    body            TEXT NOT NULL,
    image_url       VARCHAR(500) DEFAULT '',
    is_active       BOOLEAN DEFAULT true,
    sort_order      INTEGER DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_news_lang ON news(language, is_active, sort_order);

-- point_packages'da bo'lgan xuddi shu xato: pastdagi seed INSERT
-- unique constraint'siz `ON CONFLICT DO NOTHING` bilan yozilgan edi — bu
-- hech narsani ushlamaydi, shuning uchun har server restart'ida
-- (= har Railway deploy'ida) bir xil 6 ta yangilik qayta qo'shilib
-- kelgan (414 qatorgacha yetgan). Avval dublikatlarni tozalab, keyin
-- haqiqiy unique constraint qo'yamiz — shundan keyin reseed idempotent.
DELETE FROM news a USING news b
WHERE a.id > b.id
  AND a.language = b.language
  AND a.title = b.title;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'news_language_title_key'
    ) THEN
        ALTER TABLE news ADD CONSTRAINT news_language_title_key UNIQUE (language, title);
    END IF;
END $$;

-- ============ Chat xabarlari ============
CREATE TABLE IF NOT EXISTS chat_messages (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message         TEXT NOT NULL,
    message_type    VARCHAR(20) DEFAULT 'text',  -- text | voice | file
    audio_file_path VARCHAR(500),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);

-- city ustuni — xabarni qaysi efir shahriga tegishliligi (default: global)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS city VARCHAR(50) DEFAULT 'global';

-- ============ Guruhlar (ведущий/admin yaratadi — TZ: "ведущий имел возможность создавать группы") ============
CREATE TABLE IF NOT EXISTS chat_rooms (
    id              SERIAL PRIMARY KEY,
    title           VARCHAR(100) NOT NULL,
    description     TEXT DEFAULT '',
    host_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMP DEFAULT NOW()
);

-- Guruh xabarlari xuddi shu chat_messages jadvalida saqlanadi — room_id
-- NULL bo'lsa umumiy chat, aks holda shu guruhga tegishli.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES chat_rooms(id) ON DELETE CASCADE;

-- Guruh a'zoligi — guruhlar YOPIQ: faqat shu jadvaldagi (yoki xost/staff)
-- foydalanuvchi o'qiy/yoza oladi. Xost taklif/chetlatish qiladi, admin va
-- moderator ham (har qanday guruhga).
CREATE TABLE IF NOT EXISTS room_members (
    room_id     INTEGER NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    added_at    TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);

-- Mavjud guruhlar uchun bitta martalik migratsiya — avval a'zolik yo'q edi,
-- endi yopiq bo'lgani uchun kamida xostni a'zo qilib qo'yamiz (composite PK
-- ON CONFLICT bilan xavfsiz — har deploy'da qayta ishlaydi, dublikat bo'lmaydi).
INSERT INTO room_members (room_id, user_id, added_by)
SELECT id, host_user_id, host_user_id FROM chat_rooms WHERE host_user_id IS NOT NULL
ON CONFLICT (room_id, user_id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id, created_at);

-- ============ Studiya/efir zayavkalari (AI agregator + moderator uchun) ============
CREATE TABLE IF NOT EXISTS messages (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    city            VARCHAR(64) DEFAULT 'global',
    text            TEXT,
    audio_path      VARCHAR(500),
    status          VARCHAR(20) DEFAULT 'pending',   -- pending | approved | rejected
    is_for_studio   BOOLEAN DEFAULT false,
    lang            VARCHAR(5),                       -- ru | lt | en | null(auto)
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_studio ON messages(is_for_studio, status, created_at DESC);

-- ============ Psixotip tahlili (AI analitika — TZ §4) ============
CREATE TABLE IF NOT EXISTS psychotypes (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
    focus_of_attention  VARCHAR(20) NOT NULL,   -- vnutrenniy | vneshniy
    emotional_tone      VARCHAR(20) NOT NULL,   -- optimist | melanxolik | ratsional
    key_topic           VARCHAR(100) DEFAULT '',
    priority_score      INTEGER DEFAULT 5,      -- 1-10
    raw_json            TEXT DEFAULT '',
    created_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_psychotypes_user ON psychotypes(user_id, created_at DESC);

-- Foydalanuvchi profiliga oxirgi psixotip qo'shish (tez o'qish uchun)
ALTER TABLE users ADD COLUMN IF NOT EXISTS focus_of_attention VARCHAR(20) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emotional_tone     VARCHAR(20) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS key_topic          VARCHAR(100) DEFAULT NULL;

-- ============ Efir (broadcast) ============
CREATE TABLE IF NOT EXISTS broadcasts (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
    script           TEXT,
    language         VARCHAR(5),
    duration_sec     INTEGER,
    broadcaster_type VARCHAR(20),  -- ai | live
    created_at       TIMESTAMP DEFAULT NOW()
);

-- ============ Point sotib olish paketlari ============
CREATE TABLE IF NOT EXISTS point_packages (
    id              SERIAL PRIMARY KEY,
    points_amount   NUMERIC(12,4) NOT NULL,
    price_eur       NUMERIC(8,2) NOT NULL,
    label           VARCHAR(100) NOT NULL,   -- "500 points"
    is_active       BOOLEAN DEFAULT true
);

-- Bot Telegram Stars orqali shu narxni ishlatadi (avval botda hardcode
-- qilingan edi, endi shu ustundan o'qiydi — admin panel yagona haqiqat
-- manbai). Mavjud qatorlar uchun eski hardcode bilan bir xil kurs (×100)
-- bilan bir martalik to'ldiramiz.
ALTER TABLE point_packages ADD COLUMN IF NOT EXISTS price_stars INTEGER NOT NULL DEFAULT 0;
UPDATE point_packages SET price_stars = (price_eur * 100)::int WHERE price_stars = 0;

-- Bir martalik tozalash: `ON CONFLICT DO NOTHING` pastda unique constraint'siz
-- ishlatilgani uchun default paketlar har server restart'ida (demak har Railway
-- deploy'ida ham) takrorlanib qo'shilib kelgan edi. Dublikatlarni bitta qoldirib
-- tozalaymiz, keyin haqiqiy unique constraint qo'yamiz — shu yerdan boshlab
-- reseed idempotent bo'ladi.
DELETE FROM point_packages a USING point_packages b
WHERE a.id > b.id
  AND a.label = b.label
  AND a.points_amount = b.points_amount
  AND a.price_eur = b.price_eur;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'point_packages_label_key'
    ) THEN
        ALTER TABLE point_packages ADD CONSTRAINT point_packages_label_key UNIQUE (label);
    END IF;
END $$;

INSERT INTO point_packages (points_amount, price_eur, label, price_stars) VALUES
    (100, 1.00, '100 points', 100),
    (500, 4.00, '500 points', 400),
    (1500, 10.00, '1500 points', 1000),
    (5000, 25.00, '5000 points', 2500)
ON CONFLICT (label) DO NOTHING;

-- ============ Ilova sozlamalari (key-value) — poinт to'lovi qanday ishlashini admin belgilaydi ============
CREATE TABLE IF NOT EXISTS app_settings (
    key         VARCHAR(64) PRIMARY KEY,
    value       TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMP DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
    ('payment_method', 'stars'),
    ('payment_instructions', '')
ON CONFLICT DO NOTHING;

-- ============ Seed data (har til = o'sha davlat haqida yangilik) ============
INSERT INTO news (language, title, body, sort_order) VALUES
    ('ru', 'Россия сегодня', 'Москва — сердце России. Кремль, Красная площадь и Большой театр встречают гостей со всего мира. Сегодня в стране проходят культурные фестивали и спортивные события.', 1),
    ('ru', 'Культура и наука России', 'Россия — родина Пушкина, Чайковского и Гагарина. Российские учёные продолжают вносить вклад в космос и технологии.', 2),
    ('en', 'United Kingdom Today', 'London — the heart of the UK. Big Ben, Buckingham Palace and the Thames welcome visitors worldwide. Cultural festivals and football matches fill the calendar today.', 1),
    ('en', 'British Culture & Science', 'The UK gave the world Shakespeare, The Beatles and Newton. British universities remain among the best in the world.', 2),
    ('lt', 'Lietuva šiandien', 'Vilnius — Lietuvos širdis. Senamiestis, Gedimino pilis ir Trakų ežerai laukia svečių iš viso pasaulio. Šiandien šalyje vyksta kultūros festivaliai.', 1),
    ('lt', 'Lietuvos kultūra ir mokslas', 'Lietuva — krepšinio šalis ir Čiurlionio tėvynė. Lietuvių mokslininkai garsėja lazerių technologijomis visame pasaulyje.', 2)
ON CONFLICT (language, title) DO NOTHING;


-- ============ Efir mavzulari (admin yaratadi) ============
CREATE TABLE IF NOT EXISTS topics (
    id          SERIAL PRIMARY KEY,
    title       TEXT NOT NULL,
    description TEXT DEFAULT '',
    status      VARCHAR(20) DEFAULT 'active',  -- active | closed | aired
    created_by  INTEGER REFERENCES users(id),
    created_at  TIMESTAMP DEFAULT NOW()
);

-- ============ Mneniyalar (foydalanuvchi fikrlari) ============
CREATE TABLE IF NOT EXISTS opinions (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER REFERENCES users(id),
    topic_id      INTEGER REFERENCES topics(id),
    kind          VARCHAR(10) NOT NULL,            -- text | voice
    text          TEXT,
    tg_file_id    VARCHAR(255),                    -- ovoz: Telegram file_id (fayl serverda emas)
    tg_message_id BIGINT,
    points_spent  NUMERIC(12,4) DEFAULT 0,
    status        VARCHAR(20) DEFAULT 'pending',   -- pending | processed
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opinions_topic ON opinions(topic_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opinions_user ON opinions(user_id, created_at DESC);

-- ============ Musiqa nomzodlari (foydalanuvchi taklif qiladi) ============
CREATE TABLE IF NOT EXISTS music_nominations (
    id          SERIAL PRIMARY KEY,
    topic_id    INTEGER REFERENCES topics(id) ON DELETE CASCADE,
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title       VARCHAR(300) NOT NULL,    -- "Qo'shiq nomi — Artist"
    artist      VARCHAR(200) DEFAULT '',
    vote_count  INTEGER DEFAULT 0,
    created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_music_nom_topic ON music_nominations(topic_id, vote_count DESC);

-- ============ Musiqa ovoz berish ============
CREATE TABLE IF NOT EXISTS music_votes (
    id              SERIAL PRIMARY KEY,
    nomination_id   INTEGER REFERENCES music_nominations(id) ON DELETE CASCADE,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    topic_id        INTEGER REFERENCES topics(id) ON DELETE CASCADE,
    created_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, topic_id)   -- har mavzu uchun bitta ovoz
);
CREATE INDEX IF NOT EXISTS idx_music_votes_nom ON music_votes(nomination_id);

-- ============ Efir jadvali (broadcast slots) ============
-- Admin ведущийga vaqt beradi, u shu vaqtda efirga chiqadi
CREATE TABLE IF NOT EXISTS broadcast_slots (
    id              SERIAL PRIMARY KEY,
    host_user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title           VARCHAR(300) NOT NULL,         -- "Kechki efir: Sport"
    description     TEXT DEFAULT '',
    scheduled_at    TIMESTAMP NOT NULL,            -- efir boshlanadigan vaqt
    duration_min    INTEGER DEFAULT 60,            -- daqiqalarda
    status          VARCHAR(20) DEFAULT 'scheduled', -- scheduled | live | done | cancelled
    share_url       VARCHAR(500) DEFAULT '',       -- bot orqali ulashish linki
    cost_points     NUMERIC(12,4) DEFAULT 0,       -- ведущийdan olinadigan to'lov (keyingi bosqich)
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_slots_scheduled ON broadcast_slots(scheduled_at, status);
CREATE INDEX IF NOT EXISTS idx_slots_host ON broadcast_slots(host_user_id, status);

-- ============ Qo'lda to'lov arizalari (manual payment) ============
-- Foydalanuvchi bank/karta/naqd orqali to'laydi → ariza yuboradi →
-- admin tekshirib tasdiqlaydi → point avtomatik tushadi.
-- Telegram Stars 30% komissiya olgani uchun katta summalar shu yo'l bilan.
CREATE TABLE IF NOT EXISTS manual_payments (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    package_id      INTEGER REFERENCES point_packages(id) ON DELETE SET NULL,
    -- Paket o'chirilsa ham ariza tarixida qancha point/pul bo'lganini
    -- bilish uchun snapshot saqlaymiz (package_id NULL bo'lib qolsa ham).
    points_amount   NUMERIC(12,4) NOT NULL,
    price_eur       NUMERIC(8,2) NOT NULL,
    package_label   VARCHAR(100) DEFAULT '',
    -- Foydalanuvchi to'lovni qanday amalga oshirgani
    payment_method  VARCHAR(30) NOT NULL DEFAULT 'bank',  -- bank | card | cash | crypto | other
    payment_note    TEXT DEFAULT '',                      -- to'lov haqida izoh (masalan tranzaksiya raqami)
    receipt_path    VARCHAR(500) DEFAULT '',              -- kvitansiya rasmi (ixtiyoriy)
    status          VARCHAR(20) DEFAULT 'pending',        -- pending | approved | rejected
    admin_note      TEXT DEFAULT '',                      -- admin izohi (rad etish sababi)
    decided_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP DEFAULT NOW(),
    decided_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_manual_pay_status ON manual_payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_pay_user ON manual_payments(user_id, created_at DESC);

-- To'lov usuli 'crypto' ham bo'lishi mumkin (CryptoBot orqali qo'lda)
-- app_settings'ga manual to'lov rekvizitlari qo'shamiz (admin to'ldiradi)
INSERT INTO app_settings (key, value) VALUES
    ('manual_payment_details', ''),
    ('manual_payment_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

-- ============ Кастинг (отбор ведущих) ============
-- Foydalanuvchi ariza + audio-audishen topshiradi, admin ko'rib chiqib
-- tasdiqlasa — role 'doverenniy' bo'ladi (efirga chiqish huquqi).
CREATE TABLE IF NOT EXISTS casting_applications (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
    audio_path      VARCHAR(500) NOT NULL,
    note            TEXT DEFAULT '',                -- foydalanuvchi o'zi haqida qisqa matn
    status          VARCHAR(20) DEFAULT 'pending',   -- pending | approved | rejected
    admin_note      TEXT DEFAULT '',                 -- admin izohi (masalan rad etish sababi)
    created_at      TIMESTAMP DEFAULT NOW(),
    decided_at      TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_casting_status ON casting_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_casting_user ON casting_applications(user_id, created_at DESC);

-- ============ AI Dialog qoralamalar (broadcast drafts) ============
-- Admin mavzu bo'yicha "Создать диалог" bosganda Gemini AI fikrlarni
-- tahlil qilib 2 personaj dialogini yozadi → bu jadvalga 'pending' saqlanadi.
-- Admin ko'rib chiqib → 'approved' qilsa efirga yuboradi, 'rejected' qilsa o'chiriladi.
CREATE TABLE IF NOT EXISTS broadcast_drafts (
    id              SERIAL PRIMARY KEY,
    city            VARCHAR(50) DEFAULT 'global',
    main_topic      TEXT NOT NULL,                  -- mavzu sarlavhasi
    source_count    INTEGER DEFAULT 0,              -- nechta fikrdan generatsiya qilingan
    script          TEXT DEFAULT '',                -- [META:...]\n\ndialog matni
    status          VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broadcast_drafts_status ON broadcast_drafts(status, created_at DESC);

-- Ensure user deletions cascade or set null properly
DO $$
BEGIN
    -- topics created_by
    BEGIN
        ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_created_by_fkey;
        ALTER TABLE topics ADD CONSTRAINT topics_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- broadcast_slots created_by
    BEGIN
        ALTER TABLE broadcast_slots DROP CONSTRAINT IF EXISTS broadcast_slots_created_by_fkey;
        ALTER TABLE broadcast_slots ADD CONSTRAINT broadcast_slots_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- opinions user_id
    BEGIN
        ALTER TABLE opinions DROP CONSTRAINT IF EXISTS opinions_user_id_fkey;
        ALTER TABLE opinions ADD CONSTRAINT opinions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

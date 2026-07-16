-- ============================================================
--  BUXORO TAXI — To'liq PostgreSQL ma'lumotlar bazasi sxemasi
--  Versiya: 1.0
--  Backend: FastAPI (Python)
--  Real-time: Redis (GPS joylashuv + OTP kodlar)
-- ============================================================

-- ---------- EXTENSIONS ----------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID generatsiya uchun
CREATE EXTENSION IF NOT EXISTS "postgis";     -- GPS POINT tipi va geo-qidiruv uchun


-- ============================================================
--  1-BLOK: FOYDALANUVCHILAR
-- ============================================================

-- 1.1 Foydalanuvchilar (mijoz, haydovchi, admin — hammasi shu yerda)
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone       VARCHAR(13) UNIQUE NOT NULL,              -- +998901234567
    full_name   VARCHAR(100) NOT NULL,
    role        VARCHAR(10) NOT NULL
                CHECK (role IN ('passenger', 'driver', 'admin')),
    avatar_url  VARCHAR(255),
    is_active   BOOLEAN DEFAULT TRUE,                     -- bloklangan bo'lsa FALSE
    is_blocked  BOOLEAN DEFAULT FALSE,
    blocked_reason TEXT,
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role  ON users(role);


-- 1.2 Haydovchi profili (faqat role='driver' bo'lganlarga)
CREATE TABLE drivers (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    car_model            VARCHAR(50) NOT NULL,            -- "Chevrolet Cobalt"
    car_number           VARCHAR(15) NOT NULL,            -- "01 A 123 BA"
    car_color            VARCHAR(30),
    car_year             SMALLINT,
    rating               NUMERIC(3,2) DEFAULT 5.0,        -- 0.00 - 5.00
    total_rides          INTEGER DEFAULT 0,
    status               VARCHAR(15) DEFAULT 'pending'    -- tasdiqlash holati
                         CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
    is_online            BOOLEAN DEFAULT FALSE,           -- hozir ishlayaptimi
    -- Eslatma: real-time joylashuv Redis da saqlanadi.
    -- Bu yerda faqat oxirgi ma'lum nuqta (offline bo'lganda) yoziladi:
    last_known_location  GEOGRAPHY(POINT, 4326),
    location_updated_at  TIMESTAMP,
    created_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_drivers_status  ON drivers(status);
CREATE INDEX idx_drivers_online  ON drivers(is_online) WHERE is_online = TRUE;
CREATE INDEX idx_drivers_user    ON drivers(user_id);


-- 1.3 Haydovchi hujjatlari (admin tasdiqlash uchun)
CREATE TABLE driver_documents (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    driver_id     UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    doc_type      VARCHAR(20) NOT NULL
                  CHECK (doc_type IN (
                      'passport',         -- haydovchi pasporti
                      'license',          -- haydovchilik guvohnomasi (legacy)
                      'tech_passport',    -- avtomobil texnik pasporti
                      'inspection',       -- texko'rik (legacy)
                      'car_photo_front',  -- avtomobil rasmi (old)
                      'car_photo_back'    -- avtomobil rasmi (orqa)
                  )),
    file_url      VARCHAR(255) NOT NULL,
    status        VARCHAR(15) DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
    reject_reason TEXT,
    reviewed_by   UUID REFERENCES users(id),             -- qaysi admin tekshirdi
    reviewed_at   TIMESTAMP,
    uploaded_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_documents_driver ON driver_documents(driver_id);
CREATE INDEX idx_documents_status ON driver_documents(status);


-- ============================================================
--  2-BLOK: SAYOHATLAR
-- ============================================================

-- 2.1 Sayohatlar (asosiy jadval)
CREATE TABLE rides (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    passenger_id    UUID NOT NULL REFERENCES users(id),
    driver_id       UUID REFERENCES drivers(id),         -- topilmaguncha NULL

    from_location   GEOGRAPHY(POINT, 4326) NOT NULL,
    to_location     GEOGRAPHY(POINT, 4326) NOT NULL,
    from_address    VARCHAR(200) NOT NULL,
    to_address      VARCHAR(200) NOT NULL,

    distance_km     NUMERIC(6,2),                        -- hisoblangan masofa
    duration_min    SMALLINT,                            -- taxminiy vaqt
    price_sum       INTEGER,                             -- yakuniy narx (so'm)

    status          VARCHAR(20) DEFAULT 'searching'
                    CHECK (status IN (
                        'searching',   -- haydovchi qidirilmoqda
                        'accepted',    -- haydovchi qabul qildi
                        'arrived',     -- haydovchi yetib keldi
                        'ongoing',     -- sayohat boshlandi
                        'completed',   -- tugadi
                        'cancelled'    -- bekor qilindi
                    )),
    cancelled_by    VARCHAR(10) CHECK (cancelled_by IN ('passenger', 'driver', 'system')),
    cancel_reason   TEXT,

    payment_method  VARCHAR(20) DEFAULT 'cash'
                    CHECK (payment_method IN ('cash', 'payme', 'click', 'uzum', 'wallet')),

    created_at      TIMESTAMP DEFAULT NOW(),
    accepted_at     TIMESTAMP,
    started_at      TIMESTAMP,
    completed_at    TIMESTAMP,
    cancelled_at    TIMESTAMP
);

CREATE INDEX idx_rides_passenger ON rides(passenger_id);
CREATE INDEX idx_rides_driver    ON rides(driver_id);
CREATE INDEX idx_rides_status    ON rides(status);
CREATE INDEX idx_rides_created   ON rides(created_at);


-- 2.2 To'lovlar
CREATE TABLE payments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id     UUID UNIQUE NOT NULL REFERENCES rides(id),
    amount      INTEGER NOT NULL,                        -- so'm
    method      VARCHAR(20) NOT NULL DEFAULT 'cash'
                CHECK (method IN ('cash', 'payme', 'click', 'uzum', 'wallet')),
    status      VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    external_id VARCHAR(100),                            -- Payme/Click tranzaksiya ID
    paid_at     TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payments_ride   ON payments(ride_id);
CREATE INDEX idx_payments_status ON payments(status);


-- 2.3 Reytinglar (ikki tomonlama: mijoz↔haydovchi)
CREATE TABLE ratings (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id      UUID NOT NULL REFERENCES rides(id),
    from_user_id UUID NOT NULL REFERENCES users(id),     -- baho beruvchi
    to_user_id   UUID NOT NULL REFERENCES users(id),     -- baho oluvchi
    score        SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment      TEXT,
    created_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE(ride_id, from_user_id)                        -- bir sayohatga bir baho
);

CREATE INDEX idx_ratings_to_user ON ratings(to_user_id);
CREATE INDEX idx_ratings_ride    ON ratings(ride_id);


-- ============================================================
--  3-BLOK: MOLIYA (narx, komissiya, hamyon)
-- ============================================================

-- 3.1 Narx sozlamalari (admin paneldan o'zgartiriladi)
CREATE TABLE pricing_config (
    id                SERIAL PRIMARY KEY,
    base_fare         INTEGER DEFAULT 10000,             -- minimal narx (so'm)
    base_km           NUMERIC(4,1) DEFAULT 2.0,          -- minimal narxga kiruvchi km
    price_per_km      INTEGER DEFAULT 2500,              -- har qo'shimcha km (so'm)
    min_price         INTEGER DEFAULT 10000,             -- eng kam narx
    night_multiplier  NUMERIC(3,2) DEFAULT 1.20,         -- kechki koeffitsient
    night_start       TIME DEFAULT '22:00',
    night_end         TIME DEFAULT '06:00',
    is_active         BOOLEAN DEFAULT TRUE,
    updated_by        UUID REFERENCES users(id),
    updated_at        TIMESTAMP DEFAULT NOW()
);


-- 3.2 Komissiya sozlamalari (global yoki haydovchiga xos)
CREATE TABLE commission_config (
    id              SERIAL PRIMARY KEY,
    driver_id       UUID REFERENCES drivers(id) ON DELETE CASCADE,
    -- NULL = barcha haydovchilarga (global), aks holda = aniq haydovchiga
    commission_pct  NUMERIC(5,2) NOT NULL DEFAULT 15.00, -- 15%
    valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until     DATE,                                -- NULL = muddatsiz
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_commission_driver ON commission_config(driver_id);


-- 3.3 Har bir sayohatdan ushlangan komissiya
CREATE TABLE driver_commissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ride_id         UUID UNIQUE NOT NULL REFERENCES rides(id),
    driver_id       UUID NOT NULL REFERENCES drivers(id),
    ride_amount     INTEGER NOT NULL,                    -- umumiy narx
    commission_pct  NUMERIC(5,2) NOT NULL,               -- qo'llanilgan foiz
    commission_sum  INTEGER NOT NULL,                    -- ushlangan so'm (platformaga)
    driver_earning  INTEGER NOT NULL,                    -- haydovchiga qolgan
    settled         BOOLEAN DEFAULT FALSE,               -- hisob-kitob qilindimi
    settled_at      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_commissions_driver  ON driver_commissions(driver_id);
CREATE INDEX idx_commissions_settled ON driver_commissions(settled) WHERE settled = FALSE;


-- 3.4 Hamyon (har foydalanuvchining balansi)
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID UNIQUE NOT NULL REFERENCES users(id),
    balance         INTEGER DEFAULT 0,                   -- joriy balans (so'm)
    total_earned    INTEGER DEFAULT 0,                   -- jami daromad
    total_withdrawn INTEGER DEFAULT 0,                   -- jami yechilgan
    updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallets_user ON wallets(user_id);


-- 3.5 Hamyon harakatlari (har bir kirim/chiqim)
CREATE TABLE wallet_transactions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    amount          INTEGER NOT NULL,                    -- + kirim / - chiqim
    tx_type         VARCHAR(30) NOT NULL
                    CHECK (tx_type IN (
                        'ride_earning',   -- sayohatdan daromad
                        'commission',     -- komissiya ushlandi
                        'bonus',          -- bonus berildi
                        'promo',          -- promo kod chegirmasi
                        'withdrawal',     -- pul yechib olindi
                        'refund',         -- qaytarish
                        'deposit',        -- admin balansni to'ldirdi
                        'adjustment'      -- admin balansni tuzatdi
                    )),
    reference_id    UUID,                                -- ride_id / bonus_id
    description     VARCHAR(200),
    balance_after   INTEGER NOT NULL,                    -- tranzaksiyadan keyingi balans
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_tx_type   ON wallet_transactions(tx_type);
CREATE INDEX idx_wallet_tx_ref    ON wallet_transactions(reference_id);


-- ============================================================
--  4-BLOK: BONUS VA PROMO
-- ============================================================

-- 4.1 Bonus kampaniyalari
CREATE TABLE bonus_campaigns (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,                 -- "Hafta oxiri bonusi"
    description   TEXT,
    bonus_type    VARCHAR(30) NOT NULL
                  CHECK (bonus_type IN (
                      'ride_count',    -- N ta sayohat uchun
                      'daily_target',  -- kunlik maqsad
                      'referral',      -- do'st taklif qilish
                      'first_ride',    -- birinchi sayohat
                      'rating_bonus'   -- yuqori reyting uchun
                  )),
    target_value  INTEGER,                               -- masalan 10 (ta sayohat)
    bonus_amount  INTEGER,                               -- masalan 50000 (so'm)
    bonus_pct     NUMERIC(5,2),                          -- yoki foizda
    applies_to    VARCHAR(10) DEFAULT 'driver'
                  CHECK (applies_to IN ('driver', 'passenger', 'both')),
    is_active     BOOLEAN DEFAULT TRUE,
    start_date    DATE,
    end_date      DATE,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_campaigns_active ON bonus_campaigns(is_active) WHERE is_active = TRUE;


-- 4.2 Bonusga erishish (kim qaysi kampaniyada qancha progress)
CREATE TABLE bonus_achievements (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id   INTEGER NOT NULL REFERENCES bonus_campaigns(id),
    user_id       UUID NOT NULL REFERENCES users(id),
    progress      INTEGER DEFAULT 0,                     -- hozirgi progress
    is_completed  BOOLEAN DEFAULT FALSE,
    completed_at  TIMESTAMP,
    bonus_paid    BOOLEAN DEFAULT FALSE,
    bonus_paid_at TIMESTAMP,
    created_at    TIMESTAMP DEFAULT NOW(),
    UNIQUE(campaign_id, user_id)
);

CREATE INDEX idx_achievements_user     ON bonus_achievements(user_id);
CREATE INDEX idx_achievements_campaign ON bonus_achievements(campaign_id);


-- 4.3 Promo kodlar
CREATE TABLE promo_codes (
    id              SERIAL PRIMARY KEY,
    code            VARCHAR(20) UNIQUE NOT NULL,         -- "BUXORO2026"
    discount_type   VARCHAR(10) NOT NULL
                    CHECK (discount_type IN ('fixed', 'percent')),
    discount_value  INTEGER NOT NULL,                    -- so'm yoki foiz
    max_discount    INTEGER,                             -- foizda eng ko'p chegirma
    min_ride_price  INTEGER DEFAULT 0,                   -- minimal sayohat narxi
    usage_limit     INTEGER,                             -- jami ishlatish limiti
    used_count      INTEGER DEFAULT 0,
    per_user_limit  INTEGER DEFAULT 1,                   -- bir foydalanuvchi necha marta
    valid_from      DATE,
    valid_until     DATE,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_promo_code   ON promo_codes(code);
CREATE INDEX idx_promo_active ON promo_codes(is_active) WHERE is_active = TRUE;


-- 4.4 Promo kod ishlatilishi
CREATE TABLE promo_usages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promo_id        INTEGER NOT NULL REFERENCES promo_codes(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    ride_id         UUID REFERENCES rides(id),
    discount_amount INTEGER NOT NULL,                    -- amalda berilgan chegirma
    used_at         TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_promo_usage_user  ON promo_usages(user_id);
CREATE INDEX idx_promo_usage_promo ON promo_usages(promo_id);


-- ============================================================
--  5-BLOK: TIZIM (bildirishnoma, audit)
-- ============================================================

-- 5.1 Bildirishnomalar tarixi
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id),
    title       VARCHAR(100) NOT NULL,
    body        TEXT,
    channel     VARCHAR(10) NOT NULL
                CHECK (channel IN ('push', 'sms')),
    category    VARCHAR(20)                              -- 'ride', 'bonus', 'system'
                CHECK (category IN ('ride', 'bonus', 'promo', 'system', 'payment')),
    is_read     BOOLEAN DEFAULT FALSE,
    is_sent     BOOLEAN DEFAULT FALSE,
    sent_at     TIMESTAMP,
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_notif_user   ON notifications(user_id);
CREATE INDEX idx_notif_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;


-- 5.2 Admin audit log (admin harakatlari)
CREATE TABLE admin_audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id    UUID NOT NULL REFERENCES users(id),
    action      VARCHAR(50) NOT NULL,                    -- 'price_change', 'block_driver'...
    entity_type VARCHAR(30),                             -- 'driver', 'ride', 'pricing'
    entity_id   VARCHAR(50),                             -- o'zgartirilgan obyekt ID
    old_value   JSONB,                                   -- avvalgi holat
    new_value   JSONB,                                   -- yangi holat
    ip_address  VARCHAR(45),
    created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_admin  ON admin_audit_logs(admin_id);
CREATE INDEX idx_audit_action ON admin_audit_logs(action);
CREATE INDEX idx_audit_entity ON admin_audit_logs(entity_type, entity_id);


-- ============================================================
--  TRIGGERLAR (avtomatik hisob-kitob)
-- ============================================================

-- T1: Reyting qo'shilganda → drivers.rating avtomatik yangilanadi
CREATE OR REPLACE FUNCTION update_driver_rating()
RETURNS TRIGGER AS $$
BEGIN
    -- Faqat haydovchiga berilgan reytinglarni hisoblaymiz
    UPDATE drivers
    SET rating = (
        SELECT ROUND(AVG(r.score)::numeric, 2)
        FROM ratings r
        WHERE r.to_user_id = NEW.to_user_id
    )
    WHERE user_id = NEW.to_user_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_rating
    AFTER INSERT ON ratings
    FOR EACH ROW
    EXECUTE FUNCTION update_driver_rating();


-- T2: Sayohat 'completed' bo'lganda → komissiya hisoblash + haydovchi hamyoniga yozish
CREATE OR REPLACE FUNCTION process_ride_completion()
RETURNS TRIGGER AS $$
DECLARE
    v_commission_pct  NUMERIC(5,2);
    v_commission_sum  INTEGER;
    v_driver_earning  INTEGER;
    v_wallet_id       UUID;
    v_new_balance     INTEGER;
    v_driver_user_id  UUID;
BEGIN
    -- Faqat status 'completed' ga o'zgarganda ishlasin
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN

        -- 1) Komissiya foizini topish (avval haydovchiga xos, bo'lmasa global)
        SELECT commission_pct INTO v_commission_pct
        FROM commission_config
        WHERE (driver_id = NEW.driver_id OR driver_id IS NULL)
          AND valid_from <= CURRENT_DATE
          AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
        ORDER BY driver_id NULLS LAST   -- haydovchiga xosini ustun qo'yamiz
        LIMIT 1;

        v_commission_pct := COALESCE(v_commission_pct, 15.00);
        v_commission_sum := ROUND(NEW.price_sum * v_commission_pct / 100);
        v_driver_earning := NEW.price_sum - v_commission_sum;

        -- 2) Komissiya yozuvini saqlash
        INSERT INTO driver_commissions
            (ride_id, driver_id, ride_amount, commission_pct, commission_sum, driver_earning)
        VALUES
            (NEW.id, NEW.driver_id, NEW.price_sum, v_commission_pct, v_commission_sum, v_driver_earning);

        -- 3) Haydovchining user_id sini olish
        SELECT user_id INTO v_driver_user_id FROM drivers WHERE id = NEW.driver_id;

        -- 4) Haydovchi hamyonini topish/yaratish
        SELECT id INTO v_wallet_id FROM wallets WHERE user_id = v_driver_user_id;
        IF v_wallet_id IS NULL THEN
            INSERT INTO wallets (user_id) VALUES (v_driver_user_id) RETURNING id INTO v_wallet_id;
        END IF;

        -- 5) Naqd to'lov bo'lsa: haydovchi pulni qo'lga oldi, faqat komissiya qarz bo'ladi
        --    Karta/wallet bo'lsa: daromad hamyonga tushadi
        IF NEW.payment_method = 'cash' THEN
            -- Komissiyani haydovchi balansidan ayiramiz (qarz)
            UPDATE wallets
            SET balance = balance - v_commission_sum,
                updated_at = NOW()
            WHERE id = v_wallet_id
            RETURNING balance INTO v_new_balance;

            INSERT INTO wallet_transactions
                (wallet_id, amount, tx_type, reference_id, description, balance_after)
            VALUES
                (v_wallet_id, -v_commission_sum, 'commission', NEW.id,
                 'Naqd sayohat komissiyasi', v_new_balance);
        ELSE
            -- Daromadni hamyonga qo'shamiz
            UPDATE wallets
            SET balance = balance + v_driver_earning,
                total_earned = total_earned + v_driver_earning,
                updated_at = NOW()
            WHERE id = v_wallet_id
            RETURNING balance INTO v_new_balance;

            INSERT INTO wallet_transactions
                (wallet_id, amount, tx_type, reference_id, description, balance_after)
            VALUES
                (v_wallet_id, v_driver_earning, 'ride_earning', NEW.id,
                 'Sayohat daromadi', v_new_balance);
        END IF;

        -- 6) Haydovchi sayohatlar sonini oshirish
        UPDATE drivers SET total_rides = total_rides + 1 WHERE id = NEW.driver_id;

    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ride_completion
    AFTER UPDATE ON rides
    FOR EACH ROW
    EXECUTE FUNCTION process_ride_completion();


-- T3: Bonusga erishilganda ('is_completed' TRUE) → hamyonga bonus yozish
CREATE OR REPLACE FUNCTION process_bonus_achievement()
RETURNS TRIGGER AS $$
DECLARE
    v_bonus_amount  INTEGER;
    v_wallet_id     UUID;
    v_new_balance   INTEGER;
BEGIN
    IF NEW.is_completed = TRUE AND OLD.is_completed = FALSE AND NEW.bonus_paid = FALSE THEN

        SELECT bonus_amount INTO v_bonus_amount
        FROM bonus_campaigns WHERE id = NEW.campaign_id;

        IF v_bonus_amount IS NOT NULL AND v_bonus_amount > 0 THEN
            -- Hamyonni topish/yaratish
            SELECT id INTO v_wallet_id FROM wallets WHERE user_id = NEW.user_id;
            IF v_wallet_id IS NULL THEN
                INSERT INTO wallets (user_id) VALUES (NEW.user_id) RETURNING id INTO v_wallet_id;
            END IF;

            UPDATE wallets
            SET balance = balance + v_bonus_amount,
                total_earned = total_earned + v_bonus_amount,
                updated_at = NOW()
            WHERE id = v_wallet_id
            RETURNING balance INTO v_new_balance;

            INSERT INTO wallet_transactions
                (wallet_id, amount, tx_type, reference_id, description, balance_after)
            VALUES
                (v_wallet_id, v_bonus_amount, 'bonus', NEW.id, 'Bonus mukofoti', v_new_balance);

            -- To'langan deb belgilash
            NEW.bonus_paid := TRUE;
            NEW.bonus_paid_at := NOW();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bonus_achievement
    BEFORE UPDATE ON bonus_achievements
    FOR EACH ROW
    EXECUTE FUNCTION process_bonus_achievement();


-- ============================================================
--  BOSHLANG'ICH MA'LUMOTLAR (seed)
-- ============================================================

-- Standart narx sozlamasi
INSERT INTO pricing_config (base_fare, base_km, price_per_km, min_price)
VALUES (10000, 2.0, 2500, 10000);

-- Standart global komissiya (15%)
INSERT INTO commission_config (driver_id, commission_pct, valid_from)
VALUES (NULL, 15.00, CURRENT_DATE);


-- ============================================================
--  FOYDALI SO'ROVLAR (misol uchun, kodda ishlatiladi)
-- ============================================================

-- Eng yaqin online haydovchilarni topish (3 km radius).
-- ESLATMA: real loyihada joriy joylashuv Redis dan olinadi (GEORADIUS).
-- Bu PostgreSQL varianti zaxira/tekshiruv uchun:
--
-- SELECT d.id, d.car_model, d.car_number, d.rating,
--        ST_Distance(d.last_known_location, ST_MakePoint(:lng, :lat)::geography) AS distance_m
-- FROM drivers d
-- WHERE d.is_online = TRUE
--   AND d.status = 'approved'
--   AND ST_DWithin(d.last_known_location, ST_MakePoint(:lng, :lat)::geography, 3000)
-- ORDER BY distance_m ASC, d.rating DESC
-- LIMIT 5;

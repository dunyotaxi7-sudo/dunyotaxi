# Bukhara Taxi — Backend Test Rejasi

Bu reja backendni bosqichma-bosqich tekshirish uchun. Har bo'limni tartib bilan bajaring —
oldingisi ishlamasa keyingisiga o'tmang. Har bo'lim oxirida Claude Code uchun tayyor
prompt bor (ingliz tilida — to'g'ridan-to'g'ri ko'chiring).

---

## 0-BOSQICH: Muhitni tayyorlash

Avval hamma narsa ishga tushishi kerak.

**Checklist:**
- [ ] PostgreSQL ishlayapti va PostGIS extension o'rnatilgan
- [ ] Redis ishlayapti (`redis-cli ping` → PONG)
- [ ] `.env` fayl to'g'ri sozlangan (DB URL, Redis URL, JWT secret, SMS API key)
- [ ] Alembic migratsiyalar bajarildi (`alembic upgrade head`)
- [ ] 17 ta jadval va 3 ta trigger bazada paydo bo'ldi
- [ ] FastAPI ishga tushdi (`uvicorn main:app --reload`)
- [ ] Swagger UI ochildi (`http://localhost:8000/docs`)
- [ ] Seed data kirgan (pricing_config va commission_config'da yozuv bor)

**Tekshirish so'rovi (psql):**
```sql
SELECT tablename FROM pg_tables WHERE schemaname='public';   -- 17 ta bo'lishi kerak
SELECT tgname FROM pg_trigger WHERE NOT tgisinternal;          -- 3 ta trigger
SELECT * FROM pricing_config;                                  -- 1 ta yozuv
```

**Claude Code prompt:**
```
Set up a docker-compose.yml with PostgreSQL (with PostGIS), Redis, and the FastAPI 
app. Add a Makefile with commands: `make up`, `make migrate`, `make seed`, `make test`. 
Then write a health-check endpoint GET /health that verifies both the DB and Redis 
connections are alive and returns their status. Run it and confirm everything is green.
```

---

## 1-BOSQICH: Auth (OTP login flow)

Eng birinchi ishlashi kerak bo'lgan narsa — kirish.

**Checklist:**
- [ ] POST /auth/request-otp — telefon yuborilganda OTP Redis'ga yoziladi
- [ ] OTP kodi Redis'da 2 daqiqa TTL bilan turibdi (`redis-cli TTL otp:+998...`)
- [ ] POST /auth/verify-otp — to'g'ri kod bilan JWT qaytadi
- [ ] Noto'g'ri kod → 400 xato
- [ ] Muddati o'tgan kod (2 daqiqadan keyin) → xato
- [ ] Yangi telefon raqami → yangi user yaratiladi (role='passenger' default)
- [ ] JWT token ichida user_id va role bor
- [ ] Token bilan himoyalangan endpoint ochiladi, tokensiz → 401

**Claude Code prompt:**
```
Write pytest integration tests for the auth flow:
1. Request OTP for a new phone number, assert the code is stored in Redis with TTL.
2. Verify with the correct code, assert a JWT is returned and a new user was created.
3. Verify with a wrong code, assert 400.
4. Verify with an expired code (mock time), assert rejection.
5. Access a protected endpoint with and without the token (200 vs 401).
Use a test database and a fakeredis or test Redis instance. Run the tests and fix any failures.
```

---

## 2-BOSQICH: Driver (online holati + joylashuv)

Haydovchi tizimga kira oladimi va joylashuvini uzata oladimi.

**Checklist:**
- [ ] Haydovchi ro'yxatdan o'tadi, profil va hujjatlar saqlanadi
- [ ] Hujjat status='pending' bilan boshlanadi
- [ ] PATCH /driver/status — online/offline ishlaydi
- [ ] WebSocket /ws/driver/location — ulanish o'rnatiladi
- [ ] Joylashuv yuborilganda Redis'ga GEOADD bilan yoziladi (key: "drivers:online")
- [ ] Offline bo'lganda haydovchi Redis "drivers:online" dan o'chiriladi
- [ ] approved bo'lmagan haydovchi online bo'la olmaydi

**Tekshirish (redis-cli):**
```
GEOPOS drivers:online <driver_id>      # koordinata qaytishi kerak
ZRANGE drivers:online 0 -1             # online haydovchilar ro'yxati
```

**Claude Code prompt:**
```
Test the driver location flow. Write a script that:
1. Creates an approved driver and logs in.
2. Sets the driver online via PATCH /driver/status.
3. Connects to the WebSocket /ws/driver/location and sends 3 GPS updates.
4. Asserts via redis-cli (or a Redis client) that the driver appears in "drivers:online" 
   with the latest coordinates.
5. Sets the driver offline and asserts they're removed from the Redis geo set.
Also verify that a driver with status='pending' is rejected when trying to go online.
```

---

## 3-BOSQICH: Narx hisoblash (pricing)

Pul masalasi — eng ko'p tekshirilishi kerak.

**Checklist:**
- [ ] POST /rides/estimate — masofa va narx qaytaradi
- [ ] Qisqa masofa (base_km ichida) → faqat base_fare
- [ ] Uzoq masofa → base_fare + (qo'shimcha km × price_per_km)
- [ ] Kechqurun (22:00–06:00) → night_multiplier qo'llaniladi
- [ ] Narx integer (so'm), float emas
- [ ] min_price'dan past bo'lmaydi
- [ ] Admin narxni o'zgartirsa, yangi estimate yangi narxni ishlatadi

**Test misollari:**
```
base_fare=10000, base_km=2, price_per_km=2500

1.5 km kunduzi   → 10000 (base ichida)
5 km kunduzi     → 10000 + (3 × 2500) = 17500
5 km kechasi     → 17500 × 1.2 = 21000
```

**Claude Code prompt:**
```
Write parametrized pytest tests for the pricing service covering:
- Distance within base_km returns exactly base_fare.
- Distance beyond base_km adds price_per_km per extra kilometer.
- Night hours (between night_start and night_end) apply the night_multiplier.
- Result is always an integer (so'm) and never below min_price.
- After updating pricing_config, a new estimate reflects the new rates.
Include the three example cases I expect: 1.5km day=10000, 5km day=17500, 5km night=21000.
Run and fix.
```

---

## 4-BOSQICH: Eng yaqin haydovchi topish (ENG MUHIM)

Bu loyihaning yuragi — alohida e'tibor bering.

**Checklist:**
- [ ] 3 km ichidagi online haydovchilar topiladi (Redis GEORADIUS)
- [ ] Hech kim yo'q bo'lsa → 5 km → 8 km gacha kengayadi
- [ ] Natija masofa bo'yicha saralanadi, keyin reyting bo'yicha
- [ ] Faqat status='approved' VA is_online=TRUE haydovchilar
- [ ] Boshqa sayohatda band haydovchi tanlanmaydi
- [ ] 8 km da ham hech kim yo'q → "haydovchi topilmadi" javobi

**Senariy test:**
```
3 ta haydovchi online: A (1km, rating 4.5), B (2km, rating 5.0), C (6km, rating 5.0)
So'rov: 3km radius → A va B topiladi → A tanlanadi (eng yaqin)
Agar A band bo'lsa → B tanlanadi
A va B offline → radius 8km gacha kengayadi → C tanlanadi
```

**Claude Code prompt:**
```
Write a focused test suite for the nearest-driver matching service. Seed Redis with 
several online drivers at known coordinates and ratings. Test cases:
1. Multiple drivers within 3km → nearest one is returned, tie-broken by higher rating.
2. No driver in 3km but one in 6km → radius expands to 5km then 8km and finds them.
3. A driver who is on an active ride is excluded.
4. A driver with status != 'approved' is excluded.
5. No drivers anywhere within 8km → returns a clear "no driver found" result.
This is the most critical service — make the tests thorough and deterministic.
```

---

## 5-BOSQICH: Sayohat hayot tsikli (ride lifecycle)

To'liq oqim — buyurtmadan tugashgacha.

**Checklist:**
- [ ] POST /rides/request → sayohat status='searching' bilan yaratiladi
- [ ] Haydovchi topiladi va unga so'rov boradi
- [ ] Haydovchi qabul qiladi → status='accepted', driver_id biriktiriladi
- [ ] 30 soniya javob bermasa → keyingi haydovchiga o'tadi
- [ ] Status o'tishlari: accepted → arrived → ongoing → completed
- [ ] Har o'zgarish mijozga WebSocket orqali boradi
- [ ] completed bo'lganda DB trigger ishlaydi (komissiya + hamyon)
- [ ] Mijoz yoki haydovchi bekor qila oladi (cancelled_by yoziladi)

**Claude Code prompt:**
```
Write an end-to-end test that simulates a full ride:
1. Passenger requests a ride → status 'searching'.
2. A nearby driver is found and notified.
3. Driver accepts → status 'accepted', driver_id set, accepted_at timestamp.
4. Status moves through arrived → ongoing → completed.
5. After completion, assert the DB trigger fired: a driver_commissions row exists with 
   correct commission_sum and driver_earning, and a wallet_transactions row was created.
6. Separately, test the 30s accept-timeout reassigns to the next driver.
7. Test cancellation by both passenger and driver records cancelled_by correctly.
Verify all WebSocket status pushes reach the passenger connection.
```

---

## 6-BOSQICH: Komissiya va hamyon (trigger tekshiruvi)

Triggerlar to'g'ri pul hisoblayaptimi.

**Checklist:**
- [ ] Naqd to'lov: haydovchi balansidan komissiya ayriladi (manfiy tranzaksiya)
- [ ] Karta to'lov: haydovchi balansiga daromad qo'shiladi
- [ ] commission_sum = ride_amount × commission_pct / 100, to'g'ri yaxlitlangan
- [ ] driver_earning = ride_amount − commission_sum
- [ ] wallet_transactions'da balance_after to'g'ri
- [ ] Haydovchiga xos komissiya bo'lsa, global o'rniga u ishlatiladi
- [ ] total_rides +1 oshadi

**Tekshirish misoli:**
```
30000 so'mlik sayohat, 15% komissiya, naqd to'lov:
  commission_sum = 4500
  driver_earning = 25500
  haydovchi hamyoni: -4500 (komissiya qarzi)
```

**Claude Code prompt:**
```
Write tests that complete rides with different payment methods and verify the DB 
triggers produced correct financials:
- Cash ride 30000 sum at 15% → commission_sum=4500, wallet debited -4500.
- Card (payme) ride 30000 at 15% → driver_earning=25500 credited to wallet.
- A driver with a per-driver commission override uses that rate, not the global 15%.
- wallet_transactions.balance_after is always consistent with the running balance.
- drivers.total_rides increments by exactly 1 per completed ride.
Query the DB directly to assert these, since the logic lives in Postgres triggers.
```

---

## 7-BOSQICH: Admin panel API

Admin operatsiyalari.

**Checklist:**
- [ ] Hujjatlarni tasdiqlash/rad etish (status o'zgaradi)
- [ ] Haydovchini bloklash/suspend qilish
- [ ] Real-time xarita: barcha online haydovchilar (Redis'dan)
- [ ] Narx sozlamasini o'zgartirish
- [ ] Komissiya sozlash (global + haydovchiga xos)
- [ ] Bonus kampaniya va promo kod yaratish
- [ ] Statistika: sayohatlar soni, daromad, faol haydovchilar
- [ ] Har admin harakati admin_audit_logs'ga yoziladi (old/new value JSONB)
- [ ] Oddiy user admin endpointlariga kira olmaydi (403)

**Claude Code prompt:**
```
Test the admin API:
1. Admin approves a pending driver document → status changes, reviewed_by/reviewed_at set.
2. Admin blocks a driver → is_blocked=true, and an admin_audit_logs row records old/new value.
3. GET admin live-drivers returns all online drivers from Redis with coordinates.
4. Admin updates pricing_config → audit log captures the change.
5. A non-admin user calling any admin endpoint gets 403.
Assert audit logging works for every mutating admin action.
```

---

## Umumiy maslahatlar

**Tartib muhim:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Har biri oldingisiga tayanadi.

**Eng kritik 3 ta joy** (bularga ko'proq vaqt sarflang):
1. 4-bosqich — eng yaqin haydovchi topish
2. 5-bosqich — sayohat hayot tsikli + WebSocket
3. 6-bosqich — komissiya hisoblash (pul xatosi bo'lmasligi kerak)

**Test ma'lumotlar bazasi:** Asosiy bazada emas, alohida test DB'da ishlang. Har test 
o'zidan keyin tozalansin (fixture/teardown).

**WebSocket testi qiyin** — agar Claude Code qiynalsa, `pytest-asyncio` va FastAPI'ning 
`TestClient` WebSocket qo'llab-quvvatlashidan foydalanishni so'rang.

**Coverage:** Oxirida `pytest --cov` bilan qamrovni ko'ring. Kamida services/ papkasi 
80%+ bo'lsin — biznes-logika shu yerda.

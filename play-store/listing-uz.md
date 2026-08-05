# Dunyo Taxi — Google Play listing (UZ)

Copy-paste ready. Text is Uzbek (Latin). Character limits noted so nothing gets truncated.

---

## 1. App name  (max 30)
```
Dunyo Taxi
```

## 2. Short description  (max 80)
```
Buxoro bo'ylab tez va qulay taksi. Narxni oldindan biling.
```

## 3. Full description  (max 4000)
```
Dunyo Taxi — Buxoro shahri va viloyati uchun qulay taksi chaqirish ilovasi. Bir necha soniyada mashina buyurtma qiling, narxni oldindan biling va haydovchini xaritada real vaqtda kuzating.

NEGA DUNYO TAXI?

• Tez buyurtma — manzilni tanlang, yaqin atrofdagi haydovchi darhol javob beradi.
• Narx oldindan ma'lum — buyurtmadan oldin aniq summani ko'rasiz, hech qanday kutilmagan to'lovlarsiz.
• Halol hisob-kitob — narx to'g'ri chiziq bo'yicha emas, haqiqiy yo'l masofasi asosida hisoblanadi.
• Tarif tanlovi — ehtiyojingizga qarab Econom, Komfort yoki Biznes toifasini tanlang.
• Jonli kuzatuv — haydovchi qayerdaligini va yetib kelish vaqtini xaritada ko'ring.
• Qulay to'lov — naqd yoki karta orqali to'lang.
• Baholash — har bir sayohatdan so'ng haydovchini baholang; sifat biz uchun muhim.

QANDAY ISHLAYDI?

1. Qayerdan va qayerga borishingizni belgilang.
2. Narxni ko'ring va buyurtma bering.
3. Haydovchi yetib keladi — sayohat qiling va to'lang.

HAYDOVCHILAR UCHUN

Dunyo Taxi haydovchilar hamjamiyatiga qo'shiling va o'z mashangizda daromad toping:
• Ish vaqtini o'zingiz tanlaysiz — istagan payt onlayn bo'ling.
• Buyurtmalar to'g'ridan-to'g'ri ilovaga keladi, ovozli signal bilan.
• Har bir buyurtma uchun masofa, narx va manzil oldindan ko'rinadi.
• Toifangizga mos buyurtmalar (Komfort haydovchi Econom buyurtmalarni ham oladi).

XIZMAT HUDUDI

Hozircha xizmat faqat Buxoro shahri va viloyati ichida ishlaydi.

Dunyo Taxi bilan shahar bo'ylab harakatlanish oson, tez va ishonchli.

Savol yoki takliflar uchun: support@dunyotaxi.uz
```

---

## 4. Other Play Console fields

| Field | Value |
|---|---|
| **Category (App)** | Maps & Navigation (Xaritalar va navigatsiya) |
| **Tags** | taxi, ride hailing, transport |
| **Email** | support@dunyotaxi.uz *(must be a real, monitored inbox)* |
| **Phone** | +998 XX XXX XX XX *(fill in)* |
| **Website** | https://dunyotaxi-web.vercel.app |
| **Privacy policy URL** | https://dunyotaxi-web.vercel.app/privacy.html |
| **Default language** | Uzbek (uz) — add Russian (ru) later if you want |
| **App / Game** | App |
| **Free / Paid** | Free |
| **Contains ads** | No (unless you add ads) |

---

## 5. Graphic assets

| Asset | Requirement | Status |
|---|---|---|
| **App icon** | 512×512 PNG, 32-bit | ✅ `icon-512.png` |
| **Feature graphic** | 1024×500 PNG/JPG | ✅ `feature-graphic-1024x500.png` |
| **Phone screenshots** | min 2 (max 8), PNG/JPG, 16:9 or 9:16, min side ≥ 320px | ⬜ capture from the app (see below) |
| Tablet screenshots | optional | ⬜ skip unless you support tablets |

**Suggested screenshots (capture 4–6):** home map + "Qayerga boramiz?", address picker, price estimate with the road route, driver order screen, in-trip screen, profile. I can capture these from the emulator on request.

---

## 6. Data safety form  (must match the privacy policy)

Answer "Yes, our app collects/shares user data", then declare:

| Data type | Collected | Shared | Purpose | Required? |
|---|---|---|---|---|
| **Precise location** | Yes | Yes* | App functionality (matching, navigation, tracking) | Required |
| Approximate location | Yes | Yes* | App functionality | Required |
| **Name** | Yes | Yes* | Account management, app functionality | Required |
| **Phone number** | Yes | No | Account management (OTP login) | Required |
| **Photos** (driver docs) | Yes | No | Account management, driver verification | Required (drivers) |
| App activity (ride history) | Yes | No | App functionality | Required |
| Device/other IDs (push token) | Yes | No | App functionality (notifications) | Optional |

\* "Shared" = shown to the matched driver/passenger, and processed by service providers (Yandex Maps, OSRM routing, Firebase messaging).

Also answer:
- **Is all data encrypted in transit?** → Yes (HTTPS).
- **Can users request data deletion?** → Yes. Deletion request URL/email: `support@dunyotaxi.uz` (also stated in the privacy policy).
- **Committed to Play Families policy?** → No (not a kids app; 18+).

---

## 7. Content rating (IARC questionnaire)

Category: **Utility / Productivity / Communication** (not a game).
Answer honestly — the app has no violence, sexual content, profanity, gambling, or user-generated content sharing. Location sharing is functional. Expected result: **Everyone / PEGI 3 / 3+**.

---

## 8. App content declarations (App content section)

- **Privacy policy** → the URL above.
- **Ads** → No ads (unless added).
- **App access** → Provide test login credentials so Google can review both roles:
  - Passenger + Driver login is by phone OTP. Give the reviewer a **test number + how to get the OTP** (or enable a demo account). *This is important — reviewers must be able to sign in.*
- **⚠️ Location permissions (background)** → Declare `ACCESS_BACKGROUND_LOCATION`. Explain: *drivers share live location while "online" so passengers see the car approaching and orders route correctly.* Record a short **demo video** of the in-app prominent-disclosure prompt. This is the most scrutinized item — expect back-and-forth.
- **Data safety** → section 6 above.
- **Target audience** → 18+ (adults). Not directed to children.
- **Government apps** → No.
- **Financial features** → cash/card payment for rides (no lending/crypto).

---

## 9. Release (Production)

- Upload the **signed AAB** — but rebuild it first so it points at the production server (`https://api.dunyotaxi.uz`), not localhost.
- **Release name / notes (uz):**
```
Ilk versiya — Buxoro bo'ylab taksi chaqirish. Narx oldindan ma'lum, haydovchini xaritada kuzatish, naqd yoki karta to'lov.
```
- Roll out to **Internal testing** first (fast, no full review) to validate on real devices, then Production.

---

## Files in this folder
- `icon-512.png` — Play Store app icon
- `feature-graphic-1024x500.png` — Play Store feature graphic
- `listing-uz.md` — this document

# Bukhara Taxi — Mijoz mobil ilovasi (Expo)

Bosqichma-bosqich reja. Har bosqichda Claude Code uchun tayyor prompt (ingliz tilida).
Tartibni buzmang — har biri oldingisiga tayanadi.

**Stack:** Expo (dev build) + TypeScript + Expo Router + TanStack Query + Zustand + 
react-native-maps (Google Maps)

**Muhim qoida:** Bitta kod bazasi, mijoz va haydovchi roli bo'yicha ajratiladi.
Papka tuzilmasi shunday bo'lsin:
```
app/
  (auth)/          — login, otp
  (passenger)/     — mijoz ekranlari
  (driver)/        — haydovchi ekranlari (keyinroq)
components/
  Map/             — XARITA FAQAT SHU YERDA (Yandex'ga o'tish uchun)
  ui/              — umumiy komponentlar
lib/
  api/             — typed API client
  ws/              — WebSocket
store/             — auth, ride state
```

---

## 1-BOSQICH: Skelet va auth

**Nima qilinadi:**
- Expo loyiha, TypeScript, Expo Router
- API client (axios + JWT interceptor)
- Auth store (Zustand) + secure token storage
- Login ekrani: telefon kiritish → OTP → JWT
- Auth guard: token yo'q bo'lsa login'ga

**Tayyor bo'lganda:** Ilovaga kirib, bo'sh asosiy ekranni ko'rasiz.

**Claude Code prompt:**
```
Scaffold an Expo app (dev build, TypeScript) for a taxi service in Bukhara, Uzbekistan.
This single codebase will serve both passenger and driver apps, separated by role.

Set up:
- Expo Router with route groups: (auth), (passenger), (driver)
- A typed API client in lib/api using axios, with a JWT interceptor that attaches 
  Bearer tokens and redirects to login on 401
- Auth state with Zustand, JWT stored in expo-secure-store
- Login flow matching the backend: POST /auth/request-otp (phone) → 
  POST /auth/verify-otp (code) → receive JWT + user object with role
- After login, route to (passenger) or (driver) based on user.role
- An auth guard that redirects unauthenticated users to (auth)/login

Phone format is +998XXXXXXXXX. Build a clean login screen: phone input with the 
+998 prefix, then an OTP screen with a 6-digit code input and resend timer.

Keep the folder structure clean. Don't build any map or ride screens yet.
```

---

## 2-BOSQICH: Xarita komponenti (izolyatsiya qilingan)

**Nima qilinadi:**
- `components/Map/` — barcha Google Maps kodi FAQAT shu yerda
- Umumiy interfeys: `<Map markers={} route={} onLocationSelect={} />`
- Ilovaning qolgan qismi Google Maps'ni to'g'ridan-to'g'ri import qilmaydi

**Nega muhim:** Keyin Yandex'ga o'tganda faqat shu papkani almashtirasiz.

**Claude Code prompt:**
```
Build the map layer, fully isolated. Create components/Map/ containing ALL 
Google Maps code (react-native-maps). Nothing outside this folder may import 
react-native-maps directly.

Expose a clean provider-agnostic interface:
- <Map /> component with props: markers, route (polyline coords), 
  initialRegion, onRegionChange, onPress
- A useCurrentLocation() hook (expo-location) returning lat/lng + permission state
- A MapMarker type and a Coords type in components/Map/types.ts

Center default region on Bukhara (lat 39.767, lng 64.421).

Request location permissions properly on both iOS and Android. Handle the 
permission-denied case with a clear message.

This isolation matters: we will swap Google Maps for Yandex Maps later by 
replacing only this folder. Design the interface so that's a drop-in change.
```

---

## 3-BOSQICH: Asosiy xarita + manzil tanlash

**Nima qilinadi:**
- Asosiy ekran: xarita, joriy joylashuv markerda
- "Qayerdan" va "Qayerga" maydonlari
- Manzil tanlash: xaritadan yoki qidiruv orqali
- Yaqin haydovchilar xaritada ko'rinadi

**Claude Code prompt:**
```
Build the passenger home screen at (passenger)/index.

Layout: full-screen map with a bottom sheet on top.
- Map shows the user's current location and nearby online drivers as car markers 
  (fetch from the backend's nearby-drivers endpoint, refresh every 10s).
- Bottom sheet has two inputs: "Qayerdan" (from, prefilled with current address) 
  and "Qayerga" (to).
- Tapping an input opens a location picker: either drag a pin on the map or 
  search by address (use Google Places autocomplete via the backend if available, 
  otherwise a simple geocoding call).
- Reverse-geocode coordinates into a readable address for display.
- A primary button "Narxni ko'rish" enabled once both locations are set.

Use TanStack Query for the nearby-drivers fetch. All map code goes through 
components/Map — no direct react-native-maps imports here.
```

---

## 4-BOSQICH: Narx tasdiqlash

**Nima qilinadi:**
- POST /rides/estimate — masofa va narx ko'rsatiladi
- Marshrut xaritada chiziladi
- To'lov usuli tanlash (naqd, karta)
- Promo kod kiritish
- "Buyurtma berish" tugmasi

**Claude Code prompt:**
```
Build the fare confirmation screen at (passenger)/estimate.

- On mount, call POST /rides/estimate with from/to coordinates. Show a loading state.
- Display: distance in km, estimated duration, and the price formatted as 
  "24 000 so'm" (thousands separated by a space, no decimals — all money is 
  integer so'm).
- Draw the route polyline on the map between pickup and destination.
- Payment method selector: naqd (cash) / Payme / Click. Default to cash.
- An optional promo code input that validates against the backend and shows 
  the discounted price if valid.
- Primary button "Buyurtma berish" → POST /rides/request → navigate to the 
  searching screen with the returned ride_id.

Handle errors gracefully: no route found, backend down, invalid promo code.
```

---

## 5-BOSQICH: Haydovchi qidirish + WebSocket

**Nima qilinadi:**
- "Haydovchi qidirilmoqda..." animatsiyasi
- WebSocket ulanadi, status o'zgarishini kutadi
- Haydovchi topilsa → sayohat ekraniga
- Topilmasa → "Haydovchi topilmadi", qayta urinish
- Bekor qilish tugmasi

**Claude Code prompt:**
```
Build the driver-searching screen at (passenger)/searching/[rideId].

- Show a pulsing animation and "Haydovchi qidirilmoqda..." text.
- Open a WebSocket connection to the backend's passenger ride-status endpoint 
  for this ride_id. Create a reusable lib/ws/useRideSocket(rideId) hook that 
  handles connect, reconnect with backoff, and cleanup on unmount.
- When status becomes 'accepted', navigate to the active ride screen.
- If the backend reports no driver found, show a friendly message with a 
  "Qayta urinish" button and a "Bekor qilish" option.
- A cancel button that calls the cancel-ride endpoint and returns home.
- Handle the case where the app backgrounds and returns — refetch ride status 
  on resume rather than trusting a stale socket.
```

---

## 6-BOSQICH: Faol sayohat ekrani

**Nima qilinadi:**
- Haydovchi kartasi: ism, mashina, raqam, reyting
- Haydovchi xaritada real-time harakatlanadi
- Status o'zgarishlari: yetib keldi → boshlandi → tugadi
- Qo'ng'iroq qilish tugmasi
- Bekor qilish (shartlar bilan)

**Claude Code prompt:**
```
Build the active ride screen at (passenger)/ride/[rideId].

- Top: map showing the driver's live position (from the WebSocket), the pickup 
  point, and the destination, with the route drawn.
- Bottom sheet: driver card with name, car model, plate number, rating, and a 
  call button (Linking.openURL with tel:).
- A status banner that reflects the ride status in Uzbek:
  accepted → "Haydovchi yo'lda"
  arrived → "Haydovchi yetib keldi"
  ongoing → "Sayohat davom etmoqda"
- Show fare and payment method.
- Cancel button visible only before the ride starts (status accepted/arrived).
- When status becomes 'completed', navigate to the rating screen.
- Keep the map camera following the driver smoothly; don't jump on every update.
```

---

## 7-BOSQICH: Reyting va yakunlash

**Nima qilinadi:**
- 5 yulduzli baho
- Ixtiyoriy izoh
- To'lov summasi ko'rsatiladi
- "Yuborish" → asosiy ekranga

**Claude Code prompt:**
```
Build the rating screen at (passenger)/rating/[rideId].

- Show a summary: driver name, distance, final price, payment method.
- 5-star rating selector (required).
- Optional comment text area.
- "Yuborish" button → POST rating → navigate home.
- A "Keyinroq" skip link that just goes home.

Also build the passenger profile section: (passenger)/profile with 
name/phone display and edit, and (passenger)/history listing past rides 
(date, from → to, price, status) with a detail view.
```

---

## 8-BOSQICH: Push bildirishnomalar

**Nima qilinadi:**
- Expo Notifications sozlash
- Push token backendga yuboriladi
- Sayohat statusi o'zgarganda push keladi
- Push bosilganda tegishli ekranga o'tadi

**Claude Code prompt:**
```
Add push notifications with expo-notifications.

- Request permission after login (not on first launch — ask when it matters).
- Register the Expo push token and send it to the backend so it can notify 
  this user.
- Handle notifications in three states: foreground (in-app banner), 
  background (system notification), and cold start (deep link to the ride).
- Tapping a ride notification should navigate to the correct ride screen.
- Test the main events: driver accepted, driver arrived, ride completed.
```

---

## 9-BOSQICH: Sayqallash

**Nima qilinadi:**
- Loading va error holatlari hamma joyda
- Offline holat (internet yo'q)
- Bo'sh holatlar (tarix yo'q, promo yo'q)
- Til: hamma matn o'zbekcha
- Pul formati: "24 000 so'm"

**Claude Code prompt:**
```
Polish pass across the whole passenger app:

- Every screen has proper loading skeletons and error states with retry.
- Detect offline state (expo-network) and show a persistent banner; queue or 
  block actions that need the network.
- Empty states: no ride history yet, no nearby drivers, no promo codes.
- All user-facing text in Uzbek. Extract strings into a single constants file 
  so they're easy to review and later translate.
- Money always formatted as integer so'm with a space separator: 24 000 so'm.
- Phone displayed as +998 XX XXX XX XX.
- Dates in a readable local format.
- Test the full happy path end-to-end against the real backend and fix anything 
  that breaks.
```

---

## Eslatmalar

**Eng qiyin bosqichlar:** 5 va 6 (WebSocket + real-time xarita). Bularga ko'proq 
vaqt ajrating. Agar WebSocket muammo bersa, avval polling bilan ishlating 
(har 3 soniyada status so'rash), keyin WebSocket'ga o'ting.

**Xaritani sinash:** Emulator'da GPS ishlamaydi yaxshi. Haqiqiy telefonda 
(Expo Go emas, dev build) sinang.

**Google Maps API key:** iOS va Android uchun alohida key kerak, `app.json`'da 
sozlanadi. Billing yoqilgan bo'lishi shart.

**Haydovchi ilovasi:** Mijoz ilovasi tugagach, (driver) papkasida quriladi. 
Ko'p komponent (Map, API client, auth) qayta ishlatiladi — shuning uchun bitta 
kod bazasi tanlangan.

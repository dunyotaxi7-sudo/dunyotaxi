# Bukhara Taxi — Haydovchi mobil ilovasi (Expo)

Mijoz ilovasi bilan BIR XIL kod bazasida, (driver) papkasida quriladi.
Map komponenti, API client, auth store, WebSocket hook — hammasi qayta ishlatiladi.

**Muhim farq mijoz ilovasidan:** Haydovchi ilovasi FON REJIMIDA ishlashi kerak —
telefon cho'ntakda bo'lsa ham GPS uzatiladi va yangi buyurtma kelganda uyg'onadi.
Bu eng qiyin texnik qism.

Tartibni buzmang.

---

## 1-BOSQICH: Ro'yxatdan o'tish va hujjatlar

**Nima qilinadi:**
- Haydovchi login (mijoz bilan bir xil OTP oqimi, faqat role='driver')
- Profil to'ldirish: ism, mashina modeli, raqami, rangi, yili
- Hujjat yuklash: pasport, guvohnoma, texpasport, texosmotr
- "Tasdiqlanishini kutmoqda" ekrani (status=pending)
- Admin tasdiqlagach → asosiy ekranga

**Claude Code prompt:**
```
In the existing Expo codebase, build the driver onboarding flow under (driver).
Reuse the existing auth flow and API client.

- After a user logs in with role='driver' (or registers as one), route them into 
  the (driver) group.
- Driver profile form: full name, car model, car number (format "01 A 123 BA"), 
  car color, car year. Submit to the backend driver-profile endpoint.
- Document upload screen: four document types (passport, license, tech_passport, 
  inspection). Use expo-image-picker to pick/take photos and upload each to the 
  backend. Show upload progress and per-document status.
- A "pending approval" screen shown while driver.status is 'pending' or 'rejected' 
  — poll the backend for status. If rejected, show the reject reason and allow 
  re-upload. Only when status becomes 'approved' can the driver reach the main screen.

Keep all map code going through components/Map. Reuse the existing typed API client.
```

---

## 2-BOSQICH: Asosiy ekran + online/offline + GPS uzatish

**Nima qilinadi:**
- Xarita, online/offline katta tugma
- Online bo'lganda: GPS har 5s Redisga uzatiladi (WebSocket)
- Offline: uzatish to'xtaydi, Redisdan o'chadi
- Bugungi qisqa statistika (sayohatlar, daromad)

**Claude Code prompt:**
```
Build the driver home screen at (driver)/index.

- Full-screen map centered on the driver's current location.
- A prominent online/offline toggle. When going online, call PATCH driver/status 
  and start streaming GPS.
- GPS streaming: reuse/extend the WebSocket layer to send the driver's location 
  every 5 seconds to the backend (which stores it in Redis GEO). Use expo-location 
  with a reasonable accuracy. Stop streaming and update status when going offline.
- A small header card showing today's completed rides count and today's earnings.
- Handle location permission properly; a driver can't go online without it.

For now handle foreground location only — background mode comes in step 5.
```

---

## 3-BOSQICH: Yangi buyurtma keldi (eng muhim)

**Nima qilinadi:**
- WebSocket orqali yangi buyurtma keladi
- To'liq ekran modal: qayerdan → qayerga, masofa, narx, mijoz reytingi
- 30 soniyalik taymer (qabul/rad)
- Qabul → mijozga borish ekraniga
- Rad yoki vaqt tugadi → asosiy ekranga qaytadi
- Ovozli/tebranishli signal

**Claude Code prompt:**
```
Build the incoming ride request feature — this is the core of the driver app.

- While online, listen on the WebSocket for new ride offers assigned to this driver.
- When one arrives, show a full-screen modal (even over the map) with: pickup 
  address, destination address, distance, estimated fare (formatted "24 000 so'm"), 
  and the passenger's rating.
- A 30-second countdown ring. Play a sound (expo-av) and vibrate (expo-haptics) 
  on arrival.
- Two buttons: "Qabul qilish" → call the accept endpoint → go to the pickup 
  navigation screen. "Rad etish" → call reject → dismiss.
- If the timer hits 0 with no action, auto-reject and dismiss (the backend will 
  offer the ride to the next driver).
- Make sure only one offer shows at a time; queue or ignore others while one is open.
```

---

## 4-BOSQICH: Mijozga borish + sayohat

**Nima qilinadi:**
- Qabuldan keyin: mijoz manzili xaritada, marshrut
- Tashqi navigatsiyaga o'tish tugmasi (Google Maps/Yandex Nav)
- "Yetib keldim" tugmasi → status=arrived
- "Sayohatni boshlash" → status=ongoing
- Sayohat davomida: manzilga marshrut
- "Sayohatni tugatish" → status=completed

**Claude Code prompt:**
```
Build the pickup + trip screens for the driver.

Pickup screen (after accept):
- Map with route from driver's location to the passenger's pickup point.
- Passenger card: name, rating, call button (tel: link).
- "Navigatsiya" button that opens the external nav app (Google Maps / Yandex 
  Navigator) with the pickup coordinates.
- "Yetib keldim" button → set status 'arrived'.
- Then "Sayohatni boshlash" → set status 'ongoing' → go to trip screen.

Trip screen (ongoing):
- Map with route from pickup to destination.
- Destination address and current fare displayed.
- "Sayohatni tugatish" button → set status 'completed' → go to the summary screen.

Push each status change so the passenger app updates in real time. Continue 
streaming GPS throughout.
```

---

## 5-BOSQICH: Fon rejimida ishlash (eng qiyin)

**Nima qilinadi:**
- Telefon cho'ntakda / ilova fonda bo'lsa ham GPS uzatiladi
- Yangi buyurtma kelganda push + ekran uyg'onadi
- iOS va Android uchun alohida sozlash
- Batareyani tejash (aql bilan)

**Claude Code prompt:**
```
Add background operation for the driver app — the hardest part.

- Use expo-location background location updates so GPS keeps streaming to the 
  backend while the app is backgrounded and the driver is online. Configure the 
  required iOS (UIBackgroundModes: location) and Android (foreground service) 
  settings in app.json / config plugins.
- Show a persistent Android foreground-service notification ("Siz onlaynsiz") 
  while streaming, as required by the OS.
- New ride offers must reach a backgrounded app: use high-priority push 
  notifications (expo-notifications) as a wakeup, then the ride-offer modal opens 
  when the app is brought to foreground.
- Be battery-conscious: reduce GPS frequency when the driver is stationary, 
  increase when moving.
- Stop all background activity when the driver goes offline or logs out.
- Test thoroughly on a real device (background location does not work reliably 
  in simulators).
```

---

## 6-BOSQICH: Daromad, hamyon, tarix

**Nima qilinadi:**
- Yakun ekrani: daromad qo'shildi, mijozga reyting
- Daromad bo'limi: bugun/hafta/oy, grafik
- Hamyon: balans, komissiya qarzi (naqd sayohatlardan), tranzaksiyalar
- Tarix: bajarilgan sayohatlar ro'yxati

**Claude Code prompt:**
```
Build the driver earnings, wallet, and history screens.

Ride summary (after completing a ride):
- Show the fare, the commission taken, and the net earning.
- Rate the passenger (5 stars, optional comment) → POST rating → back to home.

Earnings screen (driver)/earnings:
- Today / this week / this month totals.
- A simple bar chart of daily earnings (reuse a chart lib or a lightweight one).

Wallet screen (driver)/wallet:
- Current balance and, for cash rides, the commission owed to the platform.
- Transaction list from wallet_transactions (earnings, commissions, bonuses) 
  with running balance.

History screen (driver)/history:
- List of completed rides: date, from → to, distance, fare, earning. Tap for detail.

All money as integer so'm formatted "24 000 so'm".
```

---

## 7-BOSQICH: Bonus, bildirishnoma, sayqallash

**Nima qilinadi:**
- Bonus progressi (masalan "10 sayohatdan 7 tasi")
- Push bildirishnomalar (buyurtma, bonus, to'lov)
- Loading/error/offline holatlari
- O'zbekcha matnlar, pul formati

**Claude Code prompt:**
```
Final features and polish for the driver app.

- Bonus progress card on the home or earnings screen: show active campaigns and 
  the driver's progress (e.g. "10 sayohatdan 7 tasi bajarildi") from the backend.
- Push notifications for: new ride (wakeup), bonus earned, commission/payment 
  reminders. Reuse the passenger app's notification setup.
- Loading skeletons, error states with retry, and an offline banner everywhere.
- Empty states: no rides yet, no earnings, no bonuses.
- All text in Uzbek, extracted into the shared strings file.
- Money "24 000 so'm", phone "+998 XX XXX XX XX", readable dates.
- Full end-to-end test against the real backend with a real passenger app 
  completing a ride, and fix anything that breaks.
```

---

## Eslatmalar

**Eng qiyin bosqich — 5 (fon rejimi).** iOS va Android bu yerda juda farq qiladi.
Agar qiynalsangiz, avval faqat foreground bilan MVP chiqaring (haydovchi ilovani 
ochiq tutadi), fon rejimini keyingi versiyada qo'shing. Ko'p taxi ilovalar shunday 
boshlagan.

**Push wakeup cheklovi:** iOS'da fonda turgan ilovani push bilan to'liq uyg'otish 
cheklangan. Amalda: haydovchi online bo'lganda ilovani ochiq tutishi eng ishonchli. 
Foreground service (Android) + doim ochiq ekran rejimi bilan hal qilinadi.

**Testlar real telefonda:** GPS, fon rejimi, push — hammasi emulatorda ishonchsiz. 
Haqiqiy Android va iOS telefonda sinang.

**Ikki telefon bilan test:** Bitta telefonda mijoz ilovasi, ikkinchisida haydovchi. 
To'liq oqimni boshdan-oxir sinash uchun.

**Bu tugagach:** Backend + admin panel + ikkala mobil ilova tayyor bo'ladi. 
Keyingi qadamlar — to'lov integratsiyasi (Payme/Click) va pilot sinov.

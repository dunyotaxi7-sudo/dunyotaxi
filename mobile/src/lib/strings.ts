// All user-facing text, centralized for review + future translation.
// Uzbek (Latin). Functions are used where values are interpolated.
import type { RideStatus } from "./types";

export const t = {
  common: {
    retry: "Qayta urinish",
    cancel: "Bekor qilish",
    back: "Orqaga",
    home: "Bosh sahifa",
    save: "Saqlash",
    loading: "Yuklanmoqda…",
    notFound: "Topilmadi",
  },

  errors: {
    network: "Internet aloqasi yo'q.",
    timeout: "Server javob bermadi.",
    server: "Serverga ulanib bo'lmadi.",
    unknown: "Kutilmagan xatolik.",
  },

  offline: "Internet aloqasi yo'q. Ulanishni tekshiring.",

  roleSelect: {
    title: "Qanday davom etamiz?",
    subtitle: "Davom etish uchun rolni tanlang",
    passenger: "Yo'lovchi",
    passengerHint: "Taksi chaqirish",
    driver: "Haydovchi",
    driverHint: "Ishlab pul topish",
    note: "Rolni o'zgartirish uchun hisobdan chiqing.",
  },

  login: {
    brand: "Dunyo Taxi",
    subtitle: "Kirish uchun telefon raqamingizni kiriting",
    phoneLabel: "Telefon raqam",
    sendCode: "Kodni yuborish",
    sending: "Yuborilmoqda…",
    invalidPhone: "Telefon raqamini to'g'ri kiriting: +998 XX XXX XX XX",
    changeRole: "Rolni o'zgartirish",
    asPassenger: "Yo'lovchi sifatida",
    asDriver: "Haydovchi sifatida",
  },

  otp: {
    title: "Tasdiqlash kodi",
    subtitle: (phone: string) =>
      `${phone} raqamiga yuborilgan 6 xonali kodni kiriting`,
    testCode: (code: string) => `Test kodi: ${code}`,
    verify: "Tasdiqlash",
    resendIn: (s: number) => `Qayta yuborish ${s} soniyadan so'ng`,
    resend: "Kodni qayta yuborish",
    changeNumber: "Raqamni o'zgartirish",
  },

  home: {
    whereTo: "Qayerga boramiz?",
    from: "Qayerdan",
    to: "Qayerga",
    fromPlaceholder: "Chiqish nuqtasi",
    toPlaceholder: "Manzilni tanlang",
    seePrice: "Narxni ko'rish",
    myLocation: "Joriy joylashuv",
    permDenied: "Joylashuvga ruxsat berilmadi. Manzilni qo'lda tanlang.",
    noDrivers: "Yaqin atrofda haydovchilar yo'q",
    outsideArea: "Xizmat faqat Buxoro viloyati ichida ishlaydi",
  },

  pick: {
    fromTitle: "Chiqish nuqtasi",
    toTitle: "Borish manzili",
    search: "Manzilni qidirish",
    confirm: "Tasdiqlash",
    resolving: "Aniqlanmoqda…",
    selected: "Tanlangan nuqta",
    outside: "Bu manzil Buxoro viloyatidan tashqarida",
    noResults: "Hech narsa topilmadi",
    useMyLocation: "Joriy joylashuvim",
  },

  estimate: {
    calculating: "Narx hisoblanmoqda…",
    distance: "Masofa",
    duration: "Taxminiy vaqt",
    minutes: (m: number) => `${m} daqiqa`,
    night: "🌙 Kechki tarif",
    payment: "To'lov usuli",
    promo: "Promo kod",
    promoPlaceholder: "Masalan BUXORO2026",
    apply: "Qo'llash",
    promoInvalid: "Promo kod ishlamadi yoki mos kelmadi.",
    promoOk: "Promo kod qo'llandi ✓",
    discount: (amount: string) => `Chegirma −${amount}`,
    order: "Buyurtma berish",
    noRoute: "Manzillar tanlanmagan.",
  },

  searching: {
    title: "Haydovchi qidirilmoqda…",
    sub: "Eng yaqin haydovchi izlanmoqda",
    noDriverTitle: "Haydovchi topilmadi",
    noDriverSub:
      "Hozircha yaqin atrofda bo'sh haydovchi yo'q. Qaytadan urinib ko'ring.",
  },

  ride: {
    status: {
      accepted: "Haydovchi yo'lda",
      arrived: "Haydovchi yetib keldi",
      ongoing: "Sayohat davom etmoqda",
    } as Partial<Record<RideStatus, string>>,
    driverLoading: "Haydovchi ma'lumoti yuklanmoqda…",
    payment: "To'lov",
  },

  rating: {
    title: "Sayohat yakunlandi",
    driver: "Haydovchi",
    distance: "Masofa",
    price: "Narx",
    payment: "To'lov",
    prompt: "Sayohatni baholang",
    commentPlaceholder: "Izoh qoldiring (ixtiyoriy)",
    submit: "Yuborish",
    skip: "Keyinroq",
  },

  profile: {
    title: "Profil",
    name: "Ism",
    phone: "Telefon",
    edit: "O'zgartirish",
    logout: "Chiqish",
  },

  history: {
    title: "Sayohatlar tarixi",
    empty: "Hali sayohatlar yo'q",
    detailTitle: "Sayohat tafsilotlari",
    status: "Holat",
    date: "Sana",
    distance: "Masofa",
    price: "Narx",
    payment: "To'lov",
    cancelReason: "Bekor sababi",
    from: "Qayerdan",
    to: "Qayerga",
  },

  payments: {
    cash: "Naqd",
    payme: "Payme",
    click: "Click",
  } as Record<string, string>,

  rideStatus: {
    searching: "Qidirilmoqda",
    accepted: "Qabul qilindi",
    arrived: "Yetib keldi",
    ongoing: "Yo'lda",
    completed: "Yakunlandi",
    cancelled: "Bekor qilindi",
  } as Record<RideStatus, string>,

  // ── Driver app ──────────────────────────────────────────────────────
  driver: {
    // An admin account can never hold a driver profile (registering would
    // revoke its panel access), so the driver app stops here instead of
    // failing with a 403 deeper in.
    adminBlocked: {
      title: "Admin hisobi",
      body: "Admin hisobi haydovchi bo'la olmaydi. Haydovchi sifatida kirish uchun boshqa hisobdan foydalaning.",
      back: "Chiqish",
    },
    register: {
      title: "Haydovchi bo'lish",
      subtitle: "Avtomobilingiz ma'lumotlarini kiriting",
      carModel: "Mashina modeli",
      carModelPlaceholder: "Masalan Chevrolet Cobalt",
      carNumber: "Davlat raqami",
      carNumberPlaceholder: "01 A 123 BA",
      carNumberInvalid: "Raqamni to'g'ri kiriting (masalan 01 A 123 BA)",
      carColor: "Rangi",
      carColorPlaceholder: "Masalan oq",
      carYear: "Ishlab chiqarilgan yili",
      carYearPlaceholder: "Masalan 2022",
      submit: "Davom etish",
    },
    docs: {
      title: "Hujjatlarni yuklang",
      subtitle: "Tasdiqlash uchun 4 ta hujjat rasmini yuklang",
      upload: "Yuklash",
      reupload: "Qayta yuklash",
      uploading: "Yuklanmoqda…",
      change: "O'zgartirish",
      pickFromLibrary: "Galereyadan tanlash",
      takePhoto: "Rasmga olish",
      cancel: "Bekor qilish",
      permissionNeeded: "Kamera yoki galereyaga ruxsat kerak.",
    },
    docTypes: {
      passport: "Pasport",
      tech_passport: "Avtomobil texnik pasporti",
      car_photo_front: "Avtomobil rasmi (old)",
      car_photo_back: "Avtomobil rasmi (orqa)",
      // Legacy — still shown for older records:
      license: "Haydovchilik guvohnomasi",
      inspection: "Texko'rik",
    } as Record<string, string>,
    docStatus: {
      pending: "Ko'rib chiqilmoqda",
      approved: "Tasdiqlandi",
      rejected: "Rad etildi",
    } as Record<string, string>,
    pending: {
      title: "Tasdiqlash kutilmoqda",
      subtitle:
        "Hujjatlaringiz ko'rib chiqilmoqda. Tasdiqlangach, ishni boshlashingiz mumkin.",
      rejectedTitle: "Ba'zi hujjatlar rad etildi",
      rejectedSubtitle: "Quyidagi hujjatlarni qayta yuklang:",
      checking: "Holat tekshirilmoqda…",
      logout: "Chiqish",
    },
    home: {
      greeting: "Xush kelibsiz",
      approvedNote:
        "Profilingiz tasdiqlandi. Asosiy ekran keyingi bosqichda quriladi.",
      online: "Onlayn",
      offline: "Oflayn",
      goOnline: "Ishni boshlash",
      goOffline: "Ishni tugatish",
      gpsStreaming: "GPS uzatilmoqda",
      todayRides: "Bugungi sayohatlar",
      todayEarnings: "Bugungi daromad",
      needLocation: "Onlayn bo'lish uchun joylashuvga ruxsat bering.",
      needLocationTitle: "Joylashuv kerak",
      servicesOff:
        "Qurilmada joylashuv (GPS) o'chirilgan. Buyurtma olish uchun uni yoqing.",
      blocked:
        "Joylashuvga ruxsat berilmagan. Sozlamalardan ruxsatni yoqing.",
      openSettings: "Sozlamalarni ochish",
      statusError: "Holatni o'zgartirib bo'lmadi.",
    },
    offer: {
      title: "Yangi buyurtma",
      from: "Qayerdan",
      to: "Qayerga",
      distance: "Masofa",
      fare: "Narx",
      passenger: "Mijoz",
      accept: "Qabul qilish",
      reject: "Rad etish",
      seconds: (s: number) => `${s} s`,
      expired: "Vaqt tugadi",
    },
    pickup: {
      title: "Mijozga borish",
      navigation: "Navigatsiya",
      arrived: "Yetib keldim",
      start: "Sayohatni boshlash",
      waiting: "Mijoz kutilmoqda",
      decline: "Buyurtmani rad etish",
      declineConfirmTitle: "Buyurtmani rad etasizmi?",
      declineConfirmBody: "Buyurtma boshqa haydovchiga yuboriladi.",
    },
    trip: {
      title: "Sayohat",
      destination: "Manzil",
      fare: "Narx",
      finish: "Sayohatni tugatish",
    },
    summary: {
      title: "Sayohat yakunlandi",
      fare: "Sayohat narxi",
      commission: "Komissiya",
      earning: "Sof daromad",
      ratePrompt: "Mijozni baholang",
      commentPlaceholder: "Izoh (ixtiyoriy)",
      submit: "Yuborish",
      skip: "Keyinroq",
    },
    earnings: {
      title: "Daromad",
      today: "Bugun",
      week: "Bu hafta",
      month: "Bu oy",
      chartTitle: "Kunlik daromad",
      empty: "Hali daromad yo'q",
    },
    wallet: {
      title: "Hamyon",
      balance: "Balans",
      owed: "Komissiya qarzi",
      transactions: "Tranzaksiyalar",
      empty: "Tranzaksiyalar yo'q",
      blockedTitle: "Balans juda past",
      blockedBody: (min: string) =>
        `Balansingiz ${min} chegarasidan past. Buyurtma olish uchun balansni to'ldiring.`,
      txTypes: {
        ride_earning: "Sayohat daromadi",
        commission: "Komissiya",
        bonus: "Bonus",
        promo: "Promo",
        withdrawal: "Yechib olindi",
        refund: "Qaytarildi",
        deposit: "To'ldirish",
        adjustment: "Tuzatish",
      } as Record<string, string>,
    },
    history: {
      title: "Sayohatlar tarixi",
      empty: "Hali sayohatlar yo'q",
      earning: "Daromad",
      fare: "Narx",
    },
    menu: {
      earnings: "Daromad",
      wallet: "Hamyon",
      history: "Tarix",
      profile: "Profil",
    },
    profile: {
      title: "Profil",
      car: "Avtomobil",
      carNumber: "Davlat raqami",
      carColor: "Rangi",
      carYear: "Yili",
      rating: "Reyting",
      totalRides: "Jami sayohatlar",
      status: "Holat",
    },
    bonus: {
      title: "Bonuslar",
      empty: "Faol bonus kampaniyalari yo'q",
      progress: (done: number, target: number) =>
        `${target} tadan ${done} tasi bajarildi`,
      completed: "Bajarildi ✓",
      reward: "Mukofot",
    },
  },
};

export function paymentLabel(method?: string): string {
  return (method && t.payments[method]) || method || "—";
}

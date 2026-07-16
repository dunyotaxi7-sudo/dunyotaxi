// Shared Uzbek (Latin) labels for values that come from the API as enums and
// are rendered directly (statuses, doc types, payment methods). Centralizing
// these keeps the panel 100% Uzbek and consistent with the mobile app.

import type { DriverStatus, RideStatus } from "./types";

// Driver approval status.
export const driverStatusLabel: Record<DriverStatus, string> = {
  pending: "Kutilmoqda",
  approved: "Tasdiqlangan",
  rejected: "Rad etilgan",
  suspended: "To'xtatilgan",
};

// Ride lifecycle status.
export const rideStatusLabel: Record<RideStatus, string> = {
  searching: "Qidirilmoqda",
  accepted: "Qabul qilindi",
  arrived: "Yetib keldi",
  ongoing: "Yo'lda",
  completed: "Yakunlangan",
  cancelled: "Bekor qilingan",
};

// Driver document types.
export const docTypeLabel: Record<string, string> = {
  passport: "Pasport",
  tech_passport: "Avtomobil texnik pasporti",
  car_photo_front: "Avtomobil rasmi (old)",
  car_photo_back: "Avtomobil rasmi (orqa)",
  // Legacy — still shown for older records:
  license: "Haydovchilik guvohnomasi",
  inspection: "Texko'rik",
};

// Document review status.
export const docStatusLabel: Record<string, string> = {
  pending: "Ko'rib chiqilmoqda",
  approved: "Tasdiqlandi",
  rejected: "Rad etildi",
};

// Wallet transaction types.
export const txTypeLabel: Record<string, string> = {
  ride_earning: "Sayohat daromadi",
  commission: "Komissiya",
  bonus: "Bonus",
  promo: "Promo",
  withdrawal: "Yechib olindi",
  refund: "Qaytarildi",
  deposit: "To'ldirish",
  adjustment: "Tuzatish",
};

// Payment methods.
export const paymentLabel: Record<string, string> = {
  cash: "Naqd",
  payme: "Payme",
  click: "Click",
  uzum: "Uzum",
  wallet: "Hamyon",
};

/** Look up a label with a safe fallback to the raw value. */
export function label(map: Record<string, string>, key?: string | null): string {
  if (!key) return "—";
  return map[key] ?? key;
}

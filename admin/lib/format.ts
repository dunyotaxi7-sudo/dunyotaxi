// Display formatters. Money is integer so'm; grouped with spaces per the spec.
// Dates render in Tashkent time — see lib/time for why that has to be explicit.

import { parseServerTime, uzParts } from "./time";

export function formatSom(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `${amount.toLocaleString("ru-RU").replace(/ /g, " ")} so'm`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("ru-RU").replace(/ /g, " ");
}

/** +998901234567 → +998 90 123 45 67 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const m = phone.match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return phone;
  return `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
}

// Uzbek short month names (Jan…Dec) — toLocaleString has no reliable "uz" data.
const UZ_MONTHS = [
  "Yan", "Fev", "Mar", "Apr", "May", "Iyn",
  "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek",
];

/** "16 Sen 2026, 16:05" — always Tashkent time, whatever zone the viewer is in. */
export function formatDate(value: string | null | undefined): string {
  const p = uzParts(parseServerTime(value));
  if (!p) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(p.day)} ${UZ_MONTHS[p.month - 1]} ${p.year}, ${pad(p.hour)}:${pad(p.minute)}`;
}

/** "16 Sen" — day and month only, in Tashkent. */
export function formatDay(value: string | null | undefined): string {
  const p = uzParts(parseServerTime(value));
  if (!p) return "—";
  return `${String(p.day).padStart(2, "0")} ${UZ_MONTHS[p.month - 1]}`;
}

export function formatKm(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(1)} km`;
}

/**
 * An Uzbek mobile number as the database stores it (+998XXXXXXXXX), from
 * however an operator typed it — "93 264 22 33", "+998 93 264 22 33",
 * "932642233" all give the same answer. Returns null if it isn't one.
 */
export function toUzPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const local =
    digits.length === 9 ? digits
    : digits.length === 12 && digits.startsWith("998") ? digits.slice(3)
    : null;
  return local ? `+998${local}` : null;
}

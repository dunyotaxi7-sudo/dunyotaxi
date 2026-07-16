// Display formatters. Money is integer so'm; grouped with spaces per the spec.

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

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${UZ_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

export function formatDay(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${UZ_MONTHS[d.getMonth()]}`;
}

export function formatKm(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(1)} km`;
}

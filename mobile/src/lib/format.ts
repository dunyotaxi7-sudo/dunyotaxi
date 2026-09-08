// Display formatters. Money is integer so'm, grouped with spaces.

// The backend sends timestamps as naive UTC (no tz suffix). A phone in UTC+5
// would otherwise parse them as local time and every rendered date would be
// ~5h off. Treat a tz-less string as UTC.
export function parseServerUtcMs(s: string): number {
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(s);
  return new Date(hasTz ? s : s + "Z").getTime();
}

export function formatKm(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(1)} km`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(parseServerUtcMs(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}



export function formatSom(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `${amount.toLocaleString("ru-RU").replace(/ /g, " ")} so'm`;
}

/** +998901234567 → +998 90 123 45 67 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const m = phone.match(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return phone;
  return `+998 ${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
}

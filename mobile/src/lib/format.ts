// Display formatters. Money is integer so'm, grouped with spaces.

export function formatKm(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "—";
  return `${n.toFixed(1)} km`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
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

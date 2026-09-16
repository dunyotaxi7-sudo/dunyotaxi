// Uzbekistan local time.
//
// Every timestamp the API returns comes from a `timestamp without time zone`
// column holding UTC, so the JSON carries no offset — and `new Date("…T11:05")`
// reads an offset-less string as the *viewer's* local time. That is why the
// panel showed every date five hours behind: a ride created at 16:05 in Bukhara
// is stored as 11:05 UTC and was rendered back as "11:05".
//
// So: read server strings as UTC, and render in Tashkent explicitly rather than
// in whatever zone the operator's laptop happens to be set to.

export const UZ_TZ = "Asia/Tashkent";

// Uzbekistan is a fixed UTC+5 with no DST since 1991, so offset arithmetic is
// exact. Intl still does the formatting.
const UZ_OFFSET_MS = 5 * 60 * 60 * 1000;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HAS_TZ = /[zZ]$|[+-]\d\d:?\d\d$/;

/**
 * Epoch ms for a timestamp from the API, or NaN if it isn't one.
 *
 * A bare `yyyy-mm-dd` is already parsed as UTC by the language, and represents
 * a calendar day rather than an instant — it is left alone. Anything else
 * without an offset is server UTC and gets one.
 */
export function parseServerTime(value: string | null | undefined): number {
  if (!value) return NaN;
  if (DATE_ONLY.test(value)) return new Date(value + "T00:00:00Z").getTime();
  return new Date(HAS_TZ.test(value) ? value : value + "Z").getTime();
}

export interface UzParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const PART_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: UZ_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Calendar parts of an instant as seen in Tashkent, whatever zone the viewer
 *  is in. Returns null for an invalid instant. */
export function uzParts(ms: number): UzParts | null {
  if (!Number.isFinite(ms)) return null;
  const got: Record<string, string> = {};
  for (const p of PART_FORMAT.formatToParts(new Date(ms))) {
    if (p.type !== "literal") got[p.type] = p.value;
  }
  // Intl renders midnight as "24" in some engines under hour12:false.
  const hour = Number(got.hour) % 24;
  return {
    year: Number(got.year),
    month: Number(got.month),
    day: Number(got.day),
    hour,
    minute: Number(got.minute),
  };
}

/** Midnight in Tashkent, as epoch ms. */
export function uzStartOfDay(ms: number = Date.now()): number {
  const p = uzParts(ms);
  if (!p) return NaN;
  return Date.UTC(p.year, p.month - 1, p.day) - UZ_OFFSET_MS;
}

/** Midnight in Tashkent, `n` days back, as epoch ms. */
export function uzStartOfDaysAgo(n: number, ms: number = Date.now()): number {
  return uzStartOfDay(ms) - n * 86_400_000;
}

/** Today's `yyyy-mm-dd` in Tashkent — for CSV filenames and date inputs. */
export function uzToday(ms: number = Date.now()): string {
  const p = uzParts(ms);
  if (!p) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * A `yyyy-mm-dd` from an `<input type="date">` → the ISO instant that day
 * *starts* in Tashkent, for sending to the API. Without this a picked "16 Sen"
 * asked the server for a window running 05:00–05:00.
 */
export function uzDayStartIso(ymd: string): string | undefined {
  if (!DATE_ONLY.test(ymd)) return undefined;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - UZ_OFFSET_MS).toISOString();
}

/** As above, but the last instant of that Tashkent day (inclusive bound). */
export function uzDayEndIso(ymd: string): string | undefined {
  const start = uzDayStartIso(ymd);
  if (!start) return undefined;
  return new Date(new Date(start).getTime() + 86_400_000 - 1).toISOString();
}

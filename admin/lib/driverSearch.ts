import type { DriverPublic } from "./types";

/** Lowercase and drop whitespace, so "85 L 025 OA" matches a typed "85l025". */
export const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/\s+/g, "");

/** Digits only, so "901234567" matches a stored "+998901234567". */
export const digits = (s: string | null | undefined) =>
  (s ?? "").replace(/\D/g, "");

/**
 * Does a driver match a free-text query? Searches name, car number, car model,
 * tariff (both the `car_class` code and its Uzbek label) and phone.
 *
 * Every whitespace-separated term must match at least one field, so "cobalt
 * biznes" narrows instead of widening. A phone is only matched from 3 digits up
 * — shorter runs are almost always part of a car number, and matching them as
 * phone fragments buries the plate the operator is actually looking for.
 *
 * `classLabel` maps a tariff code to its display name; pass one where car types
 * have been loaded, so "biznes" finds a driver whose code is spelled otherwise.
 */
export function matchesDriverSearch(
  d: DriverPublic,
  q: string,
  classLabel?: (code: string) => string,
): boolean {
  const terms = q.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const fields = [
    norm(d.full_name),
    norm(d.car_number),
    norm(d.car_model),
    norm(d.car_class),
    norm(classLabel?.(d.car_class)),
  ];
  const phone = digits(d.phone);

  return terms.every((term) => {
    const nt = norm(term);
    if (nt && fields.some((f) => f.includes(nt))) return true;
    const dt = digits(term);
    return dt.length >= 3 && phone.includes(dt);
  });
}

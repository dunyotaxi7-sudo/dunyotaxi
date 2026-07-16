// Client-side mirror of the backend fare formula (app/services/pricing.py
// compute_fare). Kept in sync so the Pricing page preview matches what the API
// will actually charge. All money is integer so'm.

export interface FareInputs {
  base_fare: number;
  base_km: number;
  price_per_km: number;
  min_price: number;
  night_multiplier: number;
}

/**
 * base_fare covers the first `base_km`; every extra km costs `price_per_km`.
 * The night multiplier scales the whole fare. Result is floored at `min_price`.
 */
export function computeFare(
  p: FareInputs,
  distanceKm: number,
  isNight: boolean,
): number {
  const distance = Math.max(distanceKm, 0);
  const extra = Math.max(distance - p.base_km, 0);
  let fare = p.base_fare + extra * p.price_per_km;
  if (isNight) fare *= p.night_multiplier;
  // ROUND_HALF_UP for non-negative values matches Math.round.
  return Math.max(Math.round(fare), p.min_price);
}

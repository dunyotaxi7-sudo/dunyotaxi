import { api } from "./client";
import type { Coords } from "@/components/Map/types";
import type {
  EstimateResponse,
  PaymentMethod,
  RideDriverInfo,
  CarTypeOption,
  RateCard,
  RideMeter,
  RidePublic,
} from "../types";

export interface NearbyDriverDTO {
  driver_id: string;
  lat: number;
  lng: number;
  distance_m: number;
}

export interface EstimateInput {
  from: Coords;
  to: Coords;
  promoCode?: string;
  carType?: string;
  /** Real routed distance (km); when set the server prices on it directly. */
  distanceKm?: number;
}

export interface RequestRideInput {
  from: Coords;
  /** Omitted for a metered ride — priced from the distance actually driven. */
  to?: Coords | null;
  fromAddress: string;
  toAddress?: string | null;
  paymentMethod: PaymentMethod;
  promoCode?: string;
  carType?: string;
  distanceKm?: number;
}

const geo = (c: Coords) => ({ lat: c.lat, lng: c.lng });

export const ridesApi = {
  /** Active service tiers, for a screen with no estimate to read them from. */
  carTypes: () =>
    api.get<CarTypeOption[]>("/rides/car-types").then((r) => r.data),

  /** The tariff, for showing how a metered fare will be worked out. */
  rateCard: () => api.get<RateCard>("/rides/rate-card").then((r) => r.data),

  /** Live taximeter: distance driven so far and what it currently costs. */
  meter: (rideId: string) =>
    api.get<RideMeter>(`/rides/${rideId}/meter`).then((r) => r.data),

  nearbyDrivers: (center: Coords, radiusM = 5000) =>
    api
      .get<NearbyDriverDTO[]>("/rides/nearby-drivers", {
        params: { lat: center.lat, lng: center.lng, radius_m: radiusM },
      })
      .then((r) => r.data),

  estimate: (input: EstimateInput) =>
    api
      .post<EstimateResponse>("/rides/estimate", {
        from_location: geo(input.from),
        to_location: geo(input.to),
        promo_code: input.promoCode || null,
        car_type: input.carType ?? "econom",
        distance_km: input.distanceKm ?? null,
      })
      .then((r) => r.data),

  request: (input: RequestRideInput) =>
    api
      .post<RidePublic>("/rides/request", {
        from_location: geo(input.from),
        // Null both together: the server reads a missing destination as a
        // metered ride, and a stray address without coordinates would be a
        // destination it could neither route to nor price.
        to_location: input.to ? geo(input.to) : null,
        from_address: input.fromAddress,
        to_address: input.to ? input.toAddress : null,
        payment_method: input.paymentMethod,
        promo_code: input.promoCode || null,
        car_type: input.carType ?? "econom",
        distance_km: input.distanceKm ?? null,
      })
      .then((r) => r.data),

  get: (rideId: string) =>
    api.get<RidePublic>(`/rides/${rideId}`).then((r) => r.data),

  // Waiting-meter rate (free minutes + so'm/minute) for the live charge display.
  waitingRate: () =>
    api
      .get<{
        wait_free_minutes: number;
        wait_per_minute: number;
        wait_radius_meters?: number;
      }>("/rides/waiting-rate")
      .then((r) => r.data),

  driver: (rideId: string) =>
    api
      .get<RideDriverInfo>(`/rides/${rideId}/driver`)
      .then((r) => r.data),

  mine: (limit = 50) =>
    api
      .get<RidePublic[]>("/rides/mine", { params: { limit } })
      .then((r) => r.data),

  rate: (rideId: string, score: number, comment?: string) =>
    api
      .post(`/rides/${rideId}/rate`, { score, comment: comment || null })
      .then((r) => r.data),

  cancel: (rideId: string, reason?: string) =>
    api
      .post<RidePublic>(`/rides/${rideId}/cancel`, { reason: reason ?? null })
      .then((r) => r.data),
};

import { api } from "./client";
import type { Coords } from "@/components/Map/types";
import type {
  EstimateResponse,
  PaymentMethod,
  RideDriverInfo,
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
}

export interface RequestRideInput {
  from: Coords;
  to: Coords;
  fromAddress: string;
  toAddress: string;
  paymentMethod: PaymentMethod;
  promoCode?: string;
}

const geo = (c: Coords) => ({ lat: c.lat, lng: c.lng });

export const ridesApi = {
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
      })
      .then((r) => r.data),

  request: (input: RequestRideInput) =>
    api
      .post<RidePublic>("/rides/request", {
        from_location: geo(input.from),
        to_location: geo(input.to),
        from_address: input.fromAddress,
        to_address: input.toAddress,
        payment_method: input.paymentMethod,
        promo_code: input.promoCode || null,
      })
      .then((r) => r.data),

  get: (rideId: string) =>
    api.get<RidePublic>(`/rides/${rideId}`).then((r) => r.data),

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

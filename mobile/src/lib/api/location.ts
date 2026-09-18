import { api } from "./client";
import type { Coords } from "@/components/Map/types";

export type LocationRequestStatus = "pending" | "shared" | "declined";

export interface LocationRequestPublic {
  request_id: string;
  status: LocationRequestStatus;
}

export interface ShareLocationInput {
  coords: Coords;
  address?: string;
  /** Radius of the fix in metres, as the OS reported it. */
  accuracyM?: number | null;
}

/**
 * The operator-asked-where-you-are flow. A passenger who ordered by phone gets
 * a push; these calls back the request it points at.
 */
export const locationRequestsApi = {
  get: (requestId: string) =>
    api
      .get<LocationRequestPublic>(`/location-requests/${requestId}`)
      .then((r) => r.data),

  share: (requestId: string, input: ShareLocationInput) =>
    api
      .post<LocationRequestPublic>(`/location-requests/${requestId}/share`, {
        lat: input.coords.lat,
        lng: input.coords.lng,
        address: input.address,
        accuracy_m: input.accuracyM ?? null,
      })
      .then((r) => r.data),

  decline: (requestId: string) =>
    api
      .post<LocationRequestPublic>(`/location-requests/${requestId}/decline`)
      .then((r) => r.data),
};

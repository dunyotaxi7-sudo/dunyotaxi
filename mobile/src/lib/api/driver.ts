import { api } from "./client";
import type {
  DocType,
  DriverBonus,
  DriverDocument,
  DriverEarnings,
  DriverProfile,
  DriverRideHistory,
  DriverTodayStats,
  DriverWallet,
  RideDriverView,
  RideEarningBreakdown,
  RideOfferDetails,
  WalletTx,
} from "../types";

export interface DriverRegisterInput {
  car_model: string;
  car_number: string;
  car_color?: string;
  car_year?: number;
}

export const driverApi = {
  // 404 when the current user has no driver profile yet.
  me: () => api.get<DriverProfile>("/driver/me").then((r) => r.data),

  register: (input: DriverRegisterInput) =>
    api.post<DriverProfile>("/driver/register", input).then((r) => r.data),

  documents: () =>
    api.get<DriverDocument[]>("/driver/documents").then((r) => r.data),

  /** Upload a document photo (multipart). `uri` is a local file URI. */
  uploadDocument: (
    docType: DocType,
    uri: string,
    onProgress?: (pct: number) => void,
  ) => {
    const name = uri.split("/").pop() || `${docType}.jpg`;
    const ext = name.split(".").pop()?.toLowerCase();
    const mime =
      ext === "png" ? "image/png" : ext === "pdf" ? "application/pdf" : "image/jpeg";

    const form = new FormData();
    form.append("doc_type", docType);
    // React Native's FormData file shape.
    form.append("file", { uri, name, type: mime } as unknown as Blob);

    return api
      .post<DriverDocument>("/driver/documents/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      })
      .then((r) => r.data);
  },

  setOnline: (isOnline: boolean) =>
    api
      .patch<DriverProfile>("/driver/status", { is_online: isOnline })
      .then((r) => r.data),

  statsToday: () =>
    api.get<DriverTodayStats>("/driver/stats/today").then((r) => r.data),

  // ── Ride offers ──────────────────────────────────────────────────────
  offerDetails: (rideId: string) =>
    api.get<RideOfferDetails>(`/rides/${rideId}/offer`).then((r) => r.data),

  acceptRide: (rideId: string) =>
    api.post(`/rides/${rideId}/accept`).then((r) => r.data),

  rejectRide: (rideId: string) =>
    api.post(`/rides/${rideId}/reject`).then((r) => r.data),

  pendingOffer: () =>
    api
      .get<{ ride_id: string | null }>("/driver/pending-offer")
      .then((r) => r.data),

  // The driver's in-progress ride (accepted/arrived/ongoing), if any. Used to
  // pick up an admin force-assigned order and to recover after a restart.
  currentRide: () =>
    api
      .get<{ ride_id: string | null; status: string | null }>(
        "/driver/current-ride",
      )
      .then((r) => r.data),

  // ── Active ride (pickup + trip) ──────────────────────────────────────
  rideView: (rideId: string) =>
    api.get<RideDriverView>(`/rides/${rideId}/driver-view`).then((r) => r.data),

  arrived: (rideId: string) =>
    api.post(`/rides/${rideId}/arrived`).then((r) => r.data),

  // Decline an assigned ride before pickup → it re-dispatches to another driver.
  declineRide: (rideId: string) =>
    api.post(`/rides/${rideId}/decline`).then((r) => r.data),

  startRide: (rideId: string) =>
    api.post(`/rides/${rideId}/start`).then((r) => r.data),

  completeRide: (rideId: string, method = "cash") =>
    api
      .post(`/payments/rides/${rideId}/complete`, { method })
      .then((r) => r.data),

  // ── Finance ──────────────────────────────────────────────────────────
  earnings: () =>
    api.get<DriverEarnings>("/driver/earnings").then((r) => r.data),

  wallet: () => api.get<DriverWallet>("/driver/wallet").then((r) => r.data),

  transactions: () =>
    api.get<WalletTx[]>("/driver/wallet/transactions").then((r) => r.data),

  rideHistory: () =>
    api.get<DriverRideHistory[]>("/driver/rides").then((r) => r.data),

  bonuses: () => api.get<DriverBonus[]>("/driver/bonuses").then((r) => r.data),

  rideEarning: (rideId: string) =>
    api
      .get<RideEarningBreakdown>(`/driver/rides/${rideId}/earning`)
      .then((r) => r.data),

  ratePassenger: (rideId: string, score: number, comment?: string) =>
    api
      .post(`/rides/${rideId}/rate`, { score, comment: comment || null })
      .then((r) => r.data),
};

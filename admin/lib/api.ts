// Typed API client — one function per backend endpoint. Components/hooks call
// these; they never talk to axios directly.
import { api } from "./axios";
import type {
  AdminOrderResult,
  AdminRideDetail,
  AdminRideRow,
  AuditLog,
  CreateOrderInput,
  BonusCampaign,
  CommissionConfig,
  CreateDriverInput,
  CreatePassengerInput,
  DailyStat,
  DocumentPublic,
  DriverBalanceResult,
  DriverTxRow,
  DriverPublic,
  DriverStatus,
  LiveRideRow,
  UpdateDriverProfileInput,
  OnlineDriver,
  PassengerDetail,
  PassengerRow,
  UpdatePassengerInput,
  PricingConfig,
  PricingConfigUpdate,
  PromoCode,
  RequestOTPResponse,
  RidePublic,
  RideStatus,
  ServiceArea,
  Stats,
  TokenPair,
  UserLookup,
} from "./types";

// ── Auth ──────────────────────────────────────────────────────────────
export const authApi = {
  requestOtp: (phone: string) =>
    api
      .post<RequestOTPResponse>("/auth/request-otp", { phone })
      .then((r) => r.data),
  verifyOtp: (phone: string, code: string) =>
    api
      .post<TokenPair>("/auth/verify-otp", { phone, code })
      .then((r) => r.data),
  me: () => api.get("/auth/me").then((r) => r.data),
};

// ── Stats ─────────────────────────────────────────────────────────────
export const statsApi = {
  overview: (params?: { date_from?: string; date_to?: string }) =>
    api.get<Stats>("/admin/stats", { params }).then((r) => r.data),
  ridesDaily: (days = 30) =>
    api
      .get<DailyStat[]>("/admin/stats/rides-daily", { params: { days } })
      .then((r) => r.data),
};

// ── Drivers ───────────────────────────────────────────────────────────
export const driversApi = {
  list: (status?: DriverStatus) =>
    api
      .get<DriverPublic[]>("/admin/drivers", {
        params: status ? { status_filter: status } : undefined,
      })
      .then((r) => r.data),
  documents: (driverId: string) =>
    api
      .get<DocumentPublic[]>(`/admin/drivers/${driverId}/documents`)
      .then((r) => r.data),
  moderate: (driverId: string, status: DriverStatus, reason?: string) =>
    api
      .patch<DriverPublic>(`/admin/drivers/${driverId}`, { status, reason })
      .then((r) => r.data),
  reviewDocument: (
    docId: string,
    status: "approved" | "rejected",
    reject_reason?: string,
  ) =>
    api
      .patch<DocumentPublic>(`/admin/documents/${docId}`, {
        status,
        reject_reason,
      })
      .then((r) => r.data),
  deposit: (driverId: string, amount: number, note?: string) =>
    api
      .post<DriverBalanceResult>(`/admin/drivers/${driverId}/balance`, {
        amount,
        note,
      })
      .then((r) => r.data),
  create: (body: CreateDriverInput) =>
    api.post<DriverPublic>("/admin/drivers", body).then((r) => r.data),
  updateProfile: (driverId: string, body: UpdateDriverProfileInput) =>
    api
      .patch<DriverPublic>(`/admin/drivers/${driverId}/profile`, body)
      .then((r) => r.data),
  transactions: (driverId: string) =>
    api
      .get<DriverTxRow[]>(`/admin/drivers/${driverId}/transactions`)
      .then((r) => r.data),
  uploadDocument: (driverId: string, docType: string, file: File) => {
    const fd = new FormData();
    fd.append("doc_type", docType);
    fd.append("file", file);
    return api
      .post<DocumentPublic>(`/admin/drivers/${driverId}/documents`, fd)
      .then((r) => r.data);
  },
};

// ── Users ─────────────────────────────────────────────────────────────
export const usersApi = {
  block: (userId: string, is_blocked: boolean, reason?: string) =>
    api
      .patch(`/admin/users/${userId}/block`, { is_blocked, reason })
      .then((r) => r.data),
};

// ── Rides ─────────────────────────────────────────────────────────────
export const ridesApi = {
  live: () =>
    api.get<LiveRideRow[]>("/admin/rides/live").then((r) => r.data),
  list: (params?: {
    status?: RideStatus;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }) =>
    api
      .get<AdminRideRow[]>("/admin/rides", {
        params: {
          status_filter: params?.status,
          date_from: params?.date_from,
          date_to: params?.date_to,
          limit: params?.limit,
        },
      })
      .then((r) => r.data),
  detail: (id: string) =>
    api.get<AdminRideDetail>(`/admin/rides/${id}`).then((r) => r.data),
};

// ── Orders (manual admin dispatch) ────────────────────────────────────
export const ordersApi = {
  create: (body: CreateOrderInput) =>
    api.post<AdminOrderResult>("/admin/orders", body).then((r) => r.data),
  lookupByPhone: (phone: string) =>
    api
      .get<UserLookup>("/admin/users/by-phone", { params: { phone } })
      .then((r) => r.data),
};

// ── Passengers ────────────────────────────────────────────────────────
export const passengersApi = {
  list: (search?: string) =>
    api
      .get<PassengerRow[]>("/admin/passengers", {
        params: search ? { search } : undefined,
      })
      .then((r) => r.data),
  create: (body: CreatePassengerInput) =>
    api.post<PassengerDetail>("/admin/passengers", body).then((r) => r.data),
  detail: (id: string) =>
    api.get<PassengerDetail>(`/admin/passengers/${id}`).then((r) => r.data),
  update: (id: string, body: UpdatePassengerInput) =>
    api
      .patch<PassengerDetail>(`/admin/passengers/${id}`, body)
      .then((r) => r.data),
  rides: (id: string) =>
    api
      .get<RidePublic[]>(`/admin/passengers/${id}/rides`)
      .then((r) => r.data),
};

// ── Service area ──────────────────────────────────────────────────────
export const serviceAreaApi = {
  get: () => api.get<ServiceArea>("/admin/service-area").then((r) => r.data),
  update: (geojson: unknown, name?: string) =>
    api
      .put<ServiceArea>("/admin/service-area", { geojson, name })
      .then((r) => r.data),
};

// ── Live map ──────────────────────────────────────────────────────────
export const mapApi = {
  onlineDrivers: () =>
    api
      .get<OnlineDriver[]>("/admin/map/online-drivers")
      .then((r) => r.data),
};

// ── Pricing ───────────────────────────────────────────────────────────
export const pricingApi = {
  list: () =>
    api.get<PricingConfig[]>("/admin/pricing").then((r) => r.data),
  create: (body: PricingConfigUpdate) =>
    api.post<PricingConfig>("/admin/pricing", body).then((r) => r.data),
  update: (id: number, body: PricingConfigUpdate) =>
    api
      .patch<PricingConfig>(`/admin/pricing/${id}`, body)
      .then((r) => r.data),
};

// ── Commission ────────────────────────────────────────────────────────
export const commissionApi = {
  list: () =>
    api.get<CommissionConfig[]>("/admin/commission").then((r) => r.data),
  create: (body: {
    driver_id?: string | null;
    commission_pct: number;
    valid_from?: string;
    valid_until?: string;
  }) =>
    api
      .post<CommissionConfig>("/admin/commission", body)
      .then((r) => r.data),
};

// ── Bonus campaigns ───────────────────────────────────────────────────
export const bonusApi = {
  list: () =>
    api.get<BonusCampaign[]>("/admin/bonus-campaigns").then((r) => r.data),
  create: (body: Partial<BonusCampaign>) =>
    api
      .post<BonusCampaign>("/admin/bonus-campaigns", body)
      .then((r) => r.data),
  update: (id: number, body: Partial<BonusCampaign>) =>
    api
      .patch<BonusCampaign>(`/admin/bonus-campaigns/${id}`, body)
      .then((r) => r.data),
};

// ── Promo codes ───────────────────────────────────────────────────────
export const promoApi = {
  list: () => api.get<PromoCode[]>("/admin/promo-codes").then((r) => r.data),
  create: (body: Partial<PromoCode>) =>
    api.post<PromoCode>("/admin/promo-codes", body).then((r) => r.data),
  update: (id: number, body: Partial<PromoCode>) =>
    api
      .patch<PromoCode>(`/admin/promo-codes/${id}`, body)
      .then((r) => r.data),
};

// ── Audit log ─────────────────────────────────────────────────────────
export const auditApi = {
  list: (limit = 100) =>
    api
      .get<AuditLog[]>("/admin/audit-logs", { params: { limit } })
      .then((r) => r.data),
};

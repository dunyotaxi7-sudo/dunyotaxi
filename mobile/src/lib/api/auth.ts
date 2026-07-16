import { api } from "./client";
import type { RequestOTPResponse, TokenPair, UserPublic } from "../types";

// Auth endpoints (backend: app/api/auth.py).
export const authApi = {
  requestOtp: (phone: string) =>
    api
      .post<RequestOTPResponse>("/auth/request-otp", { phone })
      .then((r) => r.data),

  verifyOtp: (phone: string, code: string, full_name?: string, role?: string) =>
    api
      .post<TokenPair>("/auth/verify-otp", { phone, code, full_name, role })
      .then((r) => r.data),

  me: () => api.get<UserPublic>("/auth/me").then((r) => r.data),

  updateMe: (full_name: string) =>
    api.patch<UserPublic>("/auth/me", { full_name }).then((r) => r.data),
};

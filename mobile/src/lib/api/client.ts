import axios from "axios";
import { API_URL } from "../config";
import { memoToken } from "../storage";
import { t } from "../strings";

export const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// Attach the bearer token (read synchronously from the in-memory holder).
api.interceptors.request.use((config) => {
  const token = memoToken.get();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 we notify a handler registered by the auth store, which clears the
// session; the auth guard then redirects to login. Keeping routing out of here
// avoids a circular dependency on the router/store.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

/** True if the error is an HTTP 404 (e.g. no driver profile yet). */
export function isNotFound(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 404;
}

/** Extract a readable message from an axios error. */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { detail?: unknown; message?: string } | undefined;
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    // Structured errors (e.g. outside_service_area) carry a top-level message.
    if (typeof data?.message === "string") return data.message;
    if (err.code === "ECONNABORTED") return t.errors.timeout;
    if (!err.response) return t.errors.server;
    return err.message;
  }
  return t.errors.unknown;
}

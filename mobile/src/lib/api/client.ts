import axios from "axios";
import { API_URL } from "../config";
import { memoToken, tokenStorage, userStorage } from "../storage";
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

// When the session is truly gone we notify a handler registered by the auth
// store, which clears it; the auth guard then redirects to login. Keeping
// routing out of here avoids a circular dependency on the router/store.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

/**
 * Exchange the refresh token for a new pair. Uses a bare axios so it can't
 * recurse through this interceptor. Shared promise: if several requests 401 at
 * once we refresh once, not N times.
 */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refresh } = await tokenStorage.get();
  if (!refresh) return null;
  try {
    const { data } = await axios.post(
      `${API_URL}/auth/refresh`,
      { refresh_token: refresh },
      { timeout: 15000 },
    );
    await tokenStorage.set(data.access_token, data.refresh_token);
    if (data.user) await userStorage.set(data.user);
    memoToken.set(data.access_token);
    return data.access_token as string;
  } catch {
    return null; // refresh expired / user blocked → caller signs out
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const cfg = error?.config;
    const isAuthCall = typeof cfg?.url === "string" && cfg.url.includes("/auth/");

    // Access tokens are short-lived, so a 401 usually just means "expired".
    // Refresh once and replay the request; only sign out if that fails.
    if (error?.response?.status === 401 && cfg && !cfg._retry && !isAuthCall) {
      cfg._retry = true;
      refreshing =
        refreshing ??
        refreshAccessToken().finally(() => {
          refreshing = null;
        });
      const token = await refreshing;
      if (token) {
        cfg.headers = cfg.headers ?? {};
        cfg.headers.Authorization = `Bearer ${token}`;
        return api(cfg);
      }
      onUnauthorized?.();
    } else if (error?.response?.status === 401 && (isAuthCall || cfg?._retry)) {
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

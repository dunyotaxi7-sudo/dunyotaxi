import axios from "axios";

export const TOKEN_KEY = "bt_admin_access_token";
export const REFRESH_KEY = "bt_admin_refresh_token";

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export const api = axios.create({ baseURL });

// Attach the JWT on every request.
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

/**
 * Swap the refresh token for a new pair. Bare axios so it can't recurse through
 * this interceptor. Shared promise so N concurrent 401s refresh once.
 */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;
  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, {
      refresh_token: refresh,
    });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(REFRESH_KEY, data.refresh_token);
    return data.access_token as string;
  } catch {
    return null;
  }
}

function forceLogin() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  if (window.location.pathname !== "/login") window.location.href = "/login";
}

// Access tokens are short-lived: a 401 usually just means "expired". Refresh
// once and replay; only bounce to /login if the refresh itself fails.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const cfg = error?.config;
    const isAuthCall = typeof cfg?.url === "string" && cfg.url.includes("/auth/");
    if (typeof window === "undefined" || error?.response?.status !== 401) {
      return Promise.reject(error);
    }
    if (cfg && !cfg._retry && !isAuthCall) {
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
    }
    forceLogin();
    return Promise.reject(error);
  },
);

/** Pull a human-readable message out of an axios error. */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    return err.message;
  }
  return "Unexpected error";
}

import * as SecureStore from "expo-secure-store";

// Thin async wrapper over expo-secure-store for the JWTs + cached user.
const ACCESS = "bt_access_token";
const REFRESH = "bt_refresh_token";
const USER = "bt_user";
const MODE = "bt_mode";

export const tokenStorage = {
  async get(): Promise<{ access: string | null; refresh: string | null }> {
    const [access, refresh] = await Promise.all([
      SecureStore.getItemAsync(ACCESS),
      SecureStore.getItemAsync(REFRESH),
    ]);
    return { access, refresh };
  },
  async set(access: string, refresh: string): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS, access),
      SecureStore.setItemAsync(REFRESH, refresh),
    ]);
  },
  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS),
      SecureStore.deleteItemAsync(REFRESH),
      SecureStore.deleteItemAsync(USER),
      SecureStore.deleteItemAsync(MODE),
    ]);
  },
};

// Whether the driver has seen and accepted the background-location prominent
// disclosure (Google Play User Data policy requires explicit consent BEFORE the
// background permission is ever requested).
const BG_CONSENT = "bt_bg_location_consent";
export const bgLocationConsent = {
  async get(): Promise<boolean> {
    return (await SecureStore.getItemAsync(BG_CONSENT)) === "1";
  },
  async set(value: boolean): Promise<void> {
    await SecureStore.setItemAsync(BG_CONSENT, value ? "1" : "0");
  },
};

// Which app (passenger/driver) the user last used — one account can do both.
export const modeStorage = {
  async get(): Promise<string | null> {
    return SecureStore.getItemAsync(MODE);
  },
  async set(mode: string): Promise<void> {
    await SecureStore.setItemAsync(MODE, mode);
  },
};

export const userStorage = {
  async get<T>(): Promise<T | null> {
    const raw = await SecureStore.getItemAsync(USER);
    return raw ? (JSON.parse(raw) as T) : null;
  },
  async set(user: unknown): Promise<void> {
    await SecureStore.setItemAsync(USER, JSON.stringify(user));
  },
};

// Synchronous access token holder for the axios interceptor (avoids awaiting
// SecureStore on every request). Kept in sync by the auth store.
let accessTokenMemo: string | null = null;
export const memoToken = {
  get: () => accessTokenMemo,
  set: (t: string | null) => {
    accessTokenMemo = t;
  },
};

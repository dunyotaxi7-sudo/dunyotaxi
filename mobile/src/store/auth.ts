import { create } from "zustand";
import { setUnauthorizedHandler } from "@/lib/api/client";
import { memoToken, modeStorage, tokenStorage, userStorage } from "@/lib/storage";
import type { AppMode, TokenPair, UserPublic } from "@/lib/types";

/** Default app for a freshly-signed-in account. */
function defaultMode(user: UserPublic | null): AppMode {
  return user?.is_driver ? "driver" : "passenger";
}

interface AuthState {
  user: UserPublic | null;
  /** Which app is showing. One account can be both a passenger and a driver. */
  mode: AppMode;
  hydrated: boolean; // finished reading SecureStore on launch
  /** Restore a persisted session at startup. */
  hydrate: () => Promise<void>;
  /** Persist a fresh login. */
  signIn: (tokens: TokenPair, mode?: AppMode) => Promise<void>;
  /** Replace the cached user (e.g. after a profile edit). */
  updateUser: (user: UserPublic) => Promise<void>;
  /** Clear the session everywhere. */
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  mode: "passenger",
  hydrated: false,

  hydrate: async () => {
    const { access } = await tokenStorage.get();
    const user = await userStorage.get<UserPublic>();
    const saved = (await modeStorage.get()) as AppMode | null;
    memoToken.set(access);
    const signedIn = access ? user : null;
    // Fall back to their default app if the saved mode is gone or no longer
    // available (e.g. driver profile removed).
    const mode: AppMode =
      saved === "driver" && signedIn?.is_driver
        ? "driver"
        : saved === "passenger"
          ? "passenger"
          : defaultMode(signedIn);
    set({ user: signedIn, mode, hydrated: true });
  },

  signIn: async (tokens, mode) => {
    await tokenStorage.set(tokens.access_token, tokens.refresh_token);
    await userStorage.set(tokens.user);
    memoToken.set(tokens.access_token);
    const next = mode ?? defaultMode(tokens.user);
    await modeStorage.set(next);
    set({ user: tokens.user, mode: next });
  },

  updateUser: async (user) => {
    await userStorage.set(user);
    // A user who just lost driver access shouldn't be stranded in driver mode.
    const mode = get().mode === "driver" && !user.is_driver ? "passenger" : get().mode;
    if (mode !== get().mode) await modeStorage.set(mode);
    set({ user, mode });
  },

  signOut: async () => {
    await tokenStorage.clear();
    memoToken.set(null);
    set({ user: null, mode: "passenger" });
  },
}));

// When any request 401s, drop the session (the guard then routes to login).
setUnauthorizedHandler(() => {
  void useAuth.getState().signOut();
});

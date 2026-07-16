"use client";

import { create } from "zustand";
import { REFRESH_KEY, TOKEN_KEY } from "./axios";
import type { UserPublic } from "./types";

const USER_KEY = "bt_admin_user";

interface AuthState {
  user: UserPublic | null;
  hydrated: boolean;
  /** Load persisted session from localStorage (client only). */
  hydrate: () => void;
  setSession: (access: string, refresh: string, user: UserPublic) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  hydrated: false,
  hydrate: () => {
    if (typeof window === "undefined") return;
    const raw = localStorage.getItem(USER_KEY);
    set({ user: raw ? (JSON.parse(raw) as UserPublic) : null, hydrated: true });
  },
  setSession: (access, refresh, user) => {
    localStorage.setItem(TOKEN_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    set({ user: null });
  },
}));

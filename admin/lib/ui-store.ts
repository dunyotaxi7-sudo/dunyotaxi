"use client";

import { create } from "zustand";

/** Where the desktop rail preference is remembered. An operator who works one
 *  screen all day sets this once; re-expanding it on every page load would be
 *  the wrong kind of helpful. */
const COLLAPSED_KEY = "bt_admin_nav_collapsed";

/** Small UI state shared across the shell: the phone nav drawer (which Topbar
 *  opens and Sidebar renders) and the desktop sidebar's collapsed rail. */
interface UIState {
  /** Phone/tablet drawer — slides over the page. */
  navOpen: boolean;
  /** Desktop (lg+) — full sidebar vs icon-only rail. */
  navCollapsed: boolean;
  openNav: () => void;
  closeNav: () => void;
  toggleNav: () => void;
  toggleNavCollapsed: () => void;
  /** Read the remembered rail state; client only, call from an effect. */
  hydrateUI: () => void;
}

export const useUI = create<UIState>((set) => ({
  navOpen: false,
  navCollapsed: false,
  openNav: () => set({ navOpen: true }),
  closeNav: () => set({ navOpen: false }),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  toggleNavCollapsed: () =>
    set((s) => {
      const navCollapsed = !s.navCollapsed;
      try {
        localStorage.setItem(COLLAPSED_KEY, navCollapsed ? "1" : "0");
      } catch {
        // Private mode / storage disabled: the rail still works, it just
        // forgets. Not worth failing the click over.
      }
      return { navCollapsed };
    }),
  hydrateUI: () => {
    if (typeof window === "undefined") return;
    try {
      set({ navCollapsed: localStorage.getItem(COLLAPSED_KEY) === "1" });
    } catch {
      // Same as above — default to the full sidebar.
    }
  },
}));

"use client";

import { create } from "zustand";

/** Small UI state shared across the shell — currently just the mobile nav
 *  drawer, which Topbar opens and Sidebar renders. */
interface UIState {
  navOpen: boolean;
  openNav: () => void;
  closeNav: () => void;
  toggleNav: () => void;
}

export const useUI = create<UIState>((set) => ({
  navOpen: false,
  openNav: () => set({ navOpen: true }),
  closeNav: () => set({ navOpen: false }),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
}));

import { create } from "zustand";
import type { Coords } from "@/components/Map/types";

// A chosen place: coordinates plus a human-readable address.
export interface RidePlace {
  coords: Coords;
  address: string;
}

interface RideDraftState {
  from: RidePlace | null;
  to: RidePlace | null;
  setFrom: (place: RidePlace) => void;
  setTo: (place: RidePlace) => void;
  reset: () => void;
}

// Holds the trip being planned on the home screen, shared with the location
// picker and (later) the estimate screen.
export const useRideDraft = create<RideDraftState>((set) => ({
  from: null,
  to: null,
  setFrom: (place) => set({ from: place }),
  setTo: (place) => set({ to: place }),
  reset: () => set({ from: null, to: null }),
}));

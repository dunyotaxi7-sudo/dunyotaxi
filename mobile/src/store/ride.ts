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
  /** Chosen service tier (car_types.code); defaults to the cheapest. */
  carType: string;
  setFrom: (place: RidePlace) => void;
  setTo: (place: RidePlace) => void;
  setCarType: (code: string) => void;
  reset: () => void;
}

// Holds the trip being planned on the home screen, shared with the location
// picker and the estimate screen.
export const useRideDraft = create<RideDraftState>((set) => ({
  from: null,
  to: null,
  carType: "econom",
  setFrom: (place) => set({ from: place }),
  setTo: (place) => set({ to: place }),
  setCarType: (code) => set({ carType: code }),
  reset: () => set({ from: null, to: null, carType: "econom" }),
}));

import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../config";
import { memoToken } from "../storage";
import type { RideStatus } from "../types";

export interface RideEvent {
  type: string;
  ride_id: string;
  status: RideStatus;
  driver_id: string | null;
  price_sum: number | null;
  cancelled_by?: string | null;
  cancel_reason?: string | null;
}

export type SocketState = "connecting" | "open" | "closed";

export interface DriverLocation {
  lat: number;
  lng: number;
}

interface UseRideSocket {
  lastEvent: RideEvent | null;
  driverLocation: DriverLocation | null;
  state: SocketState;
}

const MAX_BACKOFF_MS = 15_000;

/**
 * Subscribes to the passenger ride-status WebSocket and surfaces the latest
 * event for a specific ride. Handles connect, exponential-backoff reconnect,
 * and cleanup on unmount. This is a best-effort real-time channel — callers
 * should also poll `GET /rides/:id` as a backstop.
 */
export function useRideSocket(rideId: string | undefined): UseRideSocket {
  const [lastEvent, setLastEvent] = useState<RideEvent | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(
    null,
  );
  const [state, setState] = useState<SocketState>("connecting");

  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUs = useRef(false);

  useEffect(() => {
    if (!rideId) return;
    closedByUs.current = false;

    const connect = () => {
      const token = memoToken.get();
      if (!token) return;
      setState("connecting");
      const ws = new WebSocket(
        `${WS_URL}/ws/passenger/rides?token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setState("open");
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string) as RideEvent & {
            lat?: number;
            lng?: number;
          };
          if (data.ride_id !== rideId) return;
          if (data.type === "ride_status") {
            setLastEvent(data);
          } else if (
            data.type === "driver_location" &&
            typeof data.lat === "number" &&
            typeof data.lng === "number"
          ) {
            setDriverLocation({ lat: data.lat, lng: data.lng });
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        // onclose will follow and drive the reconnect.
      };

      ws.onclose = () => {
        setState("closed");
        if (closedByUs.current) return;
        const backoff = Math.min(
          MAX_BACKOFF_MS,
          1000 * 2 ** attemptRef.current,
        );
        attemptRef.current += 1;
        timerRef.current = setTimeout(connect, backoff);
      };
    };

    connect();

    return () => {
      closedByUs.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [rideId]);

  return { lastEvent, driverLocation, state };
}

import { useEffect, useRef, useState } from "react";
import { WS_URL } from "../config";
import { memoToken } from "../storage";

export interface RideOffer {
  ride_id: string;
  distance_m: number;
  timeout_s: number;
}

const MAX_BACKOFF_MS = 15_000;

/**
 * Driver realtime socket. While `enabled` (driver online), keeps a connection
 * to `/ws/driver/location` open to receive ride offers in real time. Location
 * itself is streamed separately by the background-location task (which works in
 * both foreground and background), so this hook only *reads* offers.
 */
export function useDriverSocket(enabled: boolean) {
  const [connected, setConnected] = useState(false);
  const [offer, setOffer] = useState<RideOffer | null>(null);
  const offerRef = useRef<RideOffer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const closedByUs = useRef(false);

  const clearOffer = () => {
    offerRef.current = null;
    setOffer(null);
  };

  const setOfferExternal = (o: RideOffer) => {
    if (offerRef.current) return; // one at a time
    offerRef.current = o;
    setOffer(o);
  };

  useEffect(() => {
    if (!enabled) return;
    closedByUs.current = false;
    let cancelled = false;

    const connect = () => {
      const token = memoToken.get();
      if (!token || cancelled) return;
      const ws = new WebSocket(
        `${WS_URL}/ws/driver/location?token=${encodeURIComponent(token)}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setConnected(true);
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data as string);
          if (data?.type === "ride_offer" && !offerRef.current) {
            const next: RideOffer = {
              ride_id: data.ride_id,
              distance_m: data.distance_m ?? 0,
              timeout_s: data.timeout_s ?? 30,
            };
            offerRef.current = next;
            setOffer(next);
          }
        } catch {
          // ignore acks / malformed frames
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (closedByUs.current || cancelled) return;
        const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attemptRef.current);
        attemptRef.current += 1;
        timerRef.current = setTimeout(connect, backoff);
      };
      ws.onerror = () => {};
    };

    connect();

    return () => {
      cancelled = true;
      closedByUs.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) clearOffer();
  }, [enabled]);

  return { connected, offer, clearOffer, setOfferExternal };
}

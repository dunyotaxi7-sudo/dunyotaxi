"use client";

// Subscribes to the admin live-events WebSocket. Calls `onEvent(type)` for each
// message (e.g. "rides_changed"). Auto-reconnects; safe no-op without a token.
import { useEffect, useRef } from "react";
import { TOKEN_KEY } from "@/lib/axios";

function wsUrl(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8001";
  return `${base.replace(/^http/, "ws")}/ws/admin?token=${encodeURIComponent(token)}`;
}

export function useAdminEvents(onEvent: (type: string) => void) {
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;

    function connect() {
      const url = wsUrl();
      if (!url) return;
      socket = new WebSocket(url);
      socket.onopen = () => {
        ping = setInterval(() => {
          try {
            socket?.send("ping");
          } catch {
            /* ignore */
          }
        }, 25000);
      };
      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg?.type) cb.current(msg.type);
        } catch {
          /* ignore malformed */
        }
      };
      socket.onclose = () => {
        if (ping) clearInterval(ping);
        if (!closed) retry = setTimeout(connect, 3000);
      };
      socket.onerror = () => socket?.close();
    }

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      socket?.close();
    };
  }, []);
}

"use client";

// "Where are you?" for phone orders.
//
// The passenger called instead of using the app, so we have no pickup point.
// If their account has a registered device we push them a request; they tap it,
// the app takes one GPS fix, and the answer lands here — straight into the
// pickup field. Nothing happens without their tap, so a decline is a normal
// outcome the operator needs to see, not an error.
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { locationRequestsApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { reverseGeocode } from "@/lib/yandex";
import type { Loc } from "@/components/OrderLocationPicker";

const POLL_MS = 2000;

export function RequestLocationPrompt({
  passengerId,
  onLocation,
}: {
  passengerId: string | null;
  onLocation: (loc: Loc) => void;
}) {
  // Selecting a different client remounts this component (the parent keys it on
  // the passenger), so everything below resets with no effect needed.
  const [requestId, setRequestId] = useState<string | null>(null);
  // Guards the one-shot hand-off: the poll keeps returning the answered
  // request, and re-applying it would stomp an address the operator has since
  // corrected by hand.
  const applied = useRef<string | null>(null);

  const create = useMutation({
    mutationFn: () => locationRequestsApi.create(passengerId!),
    onSuccess: (r) => {
      applied.current = null;
      setRequestId(r.request_id);
    },
  });

  const poll = useQuery({
    queryKey: ["location-request", requestId],
    queryFn: () => locationRequestsApi.get(requestId!),
    enabled: Boolean(requestId),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.status === "pending" ? POLL_MS : false,
  });

  const status = poll.data?.status;

  // The answer arrived → fill the pickup field.
  useEffect(() => {
    const req = poll.data;
    if (!req || req.status !== "shared" || req.lat == null || req.lng == null)
      return;
    if (applied.current === req.request_id) return;
    applied.current = req.request_id;

    const { lat, lng } = req;
    // The app usually sends a label; fall back to our own geocoder, and to
    // bare coordinates if that fails too — a pin is still better than nothing.
    if (req.address) {
      onLocation({ lat, lng, address: req.address });
      return;
    }
    onLocation({ lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    void reverseGeocode(lat, lng).then((address) => {
      if (address) onLocation({ lat, lng, address });
    });
  }, [poll.data, onLocation]);

  const pending = status === "pending";
  // The request key is gone from Redis — it ran out its TTL. Any other failure
  // is a transport problem and should say so rather than blame the passenger.
  const expired =
    poll.isError &&
    axios.isAxiosError(poll.error) &&
    poll.error.response?.status === 404;
  const pollBroken = poll.isError && !expired;

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Joylashuvni so‘rash</div>
          <div className="text-xs text-muted">
            {passengerId
              ? "Mijozning ilovasiga so‘rov yuboriladi — u tasdiqlasa, manzil o‘zi to‘ladi."
              : "Avval yo‘lovchini tanlang."}
          </div>
        </div>
        {/* Deliberately still clickable while pending: a passenger may just
            not look at their phone, and the operator should not be locked out
            of asking again for the whole ten-minute window. The server keeps
            re-asks 20s apart and retires the previous request. */}
        <button
          type="button"
          className="btn btn-ghost text-xs whitespace-nowrap"
          disabled={!passengerId || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending
            ? "Yuborilmoqda…"
            : requestId
              ? "Qayta so‘rash"
              : "So‘rov yuborish"}
        </button>
      </div>

      {create.isError && (
        <Note tone="warn">{apiError(create.error)}</Note>
      )}

      {requestId && (
        <>
          {expired && (
            <Note tone="warn">
              So‘rov muddati tugadi — qayta yuboring yoki manzilni og‘zaki so‘rang.
            </Note>
          )}
          {pollBroken && <Note tone="warn">{apiError(poll.error)}</Note>}
          {pending && (
            <Note tone="info">
              Mijozdan javob kutilmoqda… Telefonida bildirishnoma chiqdi.
            </Note>
          )}
          {status === "declined" && (
            <Note tone="warn">
              Mijoz rad etdi — manzilni og‘zaki so‘rang.
            </Note>
          )}
          {status === "shared" && (
            <Note tone="ok">
              Joylashuv olindi ✓ “Qayerdan” maydoniga qo‘yildi
              {poll.data?.accuracy_m != null
                ? ` · aniqlik ~${Math.round(poll.data.accuracy_m)} m`
                : ""}
              .
            </Note>
          )}
        </>
      )}
    </div>
  );
}

function Note({
  tone,
  children,
}: {
  tone: "info" | "ok" | "warn";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "text-green-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-muted";
  return <div className={`text-xs ${cls}`}>{children}</div>;
}

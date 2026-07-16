"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ridesApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatPhone, formatSom } from "@/lib/format";
import { rideStatusLabel } from "@/lib/strings";
import type { LiveRideRow, RideStatus } from "@/lib/types";
import { useAdminEvents } from "@/lib/useAdminEvents";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";

const TONE: Record<RideStatus, "amber" | "blue" | "green" | "gray" | "red"> = {
  searching: "amber",
  accepted: "blue",
  arrived: "blue",
  ongoing: "green",
  completed: "gray",
  cancelled: "red",
};

function elapsed(from: string | null, now: number): string {
  if (!from) return "—";
  const secs = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function LiveOrdersPage() {
  const qc = useQueryClient();
  const rides = useQuery({
    queryKey: ["live-rides"],
    queryFn: () => ridesApi.live(),
    refetchInterval: 4000, // fallback if the WebSocket drops
  });

  // Instant updates: refetch the moment any order changes state.
  useAdminEvents((type) => {
    if (type === "rides_changed") {
      qc.invalidateQueries({ queryKey: ["live-rides"] });
    }
  });

  // Tick every second so elapsed timers feel live between polls.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const data = rides.data ?? [];
  const searching = data.filter((r) => r.status === "searching").length;
  const enroute = data.filter((r) => r.status === "accepted" || r.status === "arrived").length;
  const ongoing = data.filter((r) => r.status === "ongoing").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
          {data.length} faol buyurtma · jonli yangilanadi
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="amber">Qidirilmoqda: {searching}</Badge>
          <Badge tone="blue">Haydovchi yo‘lda: {enroute}</Badge>
          <Badge tone="green">Sayohatda: {ongoing}</Badge>
        </div>
      </div>

      {rides.isLoading ? (
        <LoadingBlock />
      ) : rides.isError ? (
        <ErrorBlock message={apiError(rides.error)} />
      ) : data.length === 0 ? (
        <EmptyState message="Hozircha faol buyurtmalar yo‘q." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {data.map((r) => (
            <OrderCard key={r.id} r={r} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderCard({ r, now }: { r: LiveRideRow; now: number }) {
  const searching = r.status === "searching";
  const timerFrom = searching ? r.created_at : r.accepted_at ?? r.created_at;

  return (
    <Link
      href={`/rides/${r.id}`}
      className="card p-4 hover:shadow-[var(--shadow-md)] transition-shadow block"
    >
      <div className="flex items-center justify-between">
        <Badge tone={TONE[r.status]}>{rideStatusLabel[r.status]}</Badge>
        <span
          className={`text-sm tabular-nums font-semibold ${
            searching ? "text-amber-600" : "text-muted"
          }`}
        >
          ⏱ {elapsed(timerFrom, now)}
        </span>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex items-start gap-2">
          <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />
          <span className="truncate">{r.from_address}</span>
        </div>
        <div className="flex items-start gap-2">
          <span className="mt-1.5 h-2 w-2 rounded-full bg-red-500 shrink-0" />
          <span className="truncate">{r.to_address}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <div className="min-w-0">
          <div className="text-xs text-muted">Yo‘lovchi</div>
          <div className="truncate">
            {r.passenger_name ?? "—"}
            {r.passenger_phone ? (
              <span className="text-muted"> · {formatPhone(r.passenger_phone)}</span>
            ) : null}
          </div>
        </div>
        <div className="text-right font-semibold tabular-nums">
          {formatSom(r.price_sum)}
        </div>
      </div>

      <div className="mt-2 text-sm">
        <div className="text-xs text-muted">Haydovchi</div>
        {r.driver_name ? (
          <div className="truncate">
            {r.driver_name}
            {r.driver_phone ? (
              <span className="text-muted"> · {formatPhone(r.driver_phone)}</span>
            ) : null}
          </div>
        ) : (
          <div className="text-amber-600">qidirilmoqda…</div>
        )}
      </div>
    </Link>
  );
}

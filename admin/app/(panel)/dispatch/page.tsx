"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ridesApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatPhone, formatSom } from "@/lib/format";
import { rideStatusLabel } from "@/lib/strings";
import type { LiveRideRow, NearbyOrderDriver, RideStatus } from "@/lib/types";
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

export default function DispatchPage() {
  const qc = useQueryClient();
  const rides = useQuery({
    queryKey: ["live-rides"],
    queryFn: () => ridesApi.live(),
    refetchInterval: 4000,
  });
  useAdminEvents((type) => {
    if (type === "rides_changed")
      qc.invalidateQueries({ queryKey: ["live-rides"] });
  });

  const [assignTarget, setAssignTarget] = useState<LiveRideRow | null>(null);

  const data = rides.data ?? [];
  const searching = data.filter((r) => r.status === "searching");
  const active = data.filter((r) => r.status !== "searching");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Buyurtmalar</h1>
        <p className="text-sm text-muted">
          Haydovchi kutayotgan buyurtmalarga eng yaqin haydovchini biriktiring.
        </p>
      </div>

      {rides.isLoading ? (
        <LoadingBlock />
      ) : rides.isError ? (
        <ErrorBlock message={apiError(rides.error)} />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
              Haydovchi kutmoqda ({searching.length})
            </h2>
            {searching.length === 0 ? (
              <EmptyState message="Kutayotgan buyurtma yo'q" />
            ) : (
              searching.map((r) => (
                <OrderCard
                  key={r.id}
                  order={r}
                  onAssign={() => setAssignTarget(r)}
                />
              ))
            )}
          </section>

          {active.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">
                Faol sayohatlar ({active.length})
              </h2>
              {active.map((r) => (
                <OrderCard key={r.id} order={r} />
              ))}
            </section>
          )}
        </>
      )}

      {assignTarget && (
        <AssignModal
          order={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => {
            setAssignTarget(null);
            qc.invalidateQueries({ queryKey: ["live-rides"] });
          }}
        />
      )}
    </div>
  );
}

function OrderCard({
  order,
  onAssign,
}: {
  order: LiveRideRow;
  onAssign?: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <Badge tone={TONE[order.status]}>{rideStatusLabel[order.status]}</Badge>
        <span className="font-semibold">{formatSom(order.price_sum)}</span>
      </div>
      <div className="mt-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-primary">●</span> {order.from_address}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-red-500">●</span> {order.to_address}
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="text-xs text-muted">
          <div>
            Yo'lovchi: {order.passenger_name ?? "—"}
            {order.passenger_phone ? ` · ${formatPhone(order.passenger_phone)}` : ""}
          </div>
          {order.driver_name ? (
            <div>
              Haydovchi: {order.driver_name}
              {order.driver_phone ? ` · ${formatPhone(order.driver_phone)}` : ""}
            </div>
          ) : null}
        </div>
        {onAssign && (
          <button className="btn btn-primary shrink-0" onClick={onAssign}>
            Haydovchi biriktirish
          </button>
        )}
      </div>
    </div>
  );
}

function AssignModal({
  order,
  onClose,
  onAssigned,
}: {
  order: LiveRideRow;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const drivers = useQuery({
    queryKey: ["order-nearby", order.id],
    queryFn: () => ridesApi.nearbyDrivers(order.id),
    refetchInterval: 5000,
  });
  const assign = useMutation({
    mutationFn: (driverId: string) => ridesApi.assign(order.id, driverId),
    onSuccess: onAssigned,
  });

  const list = drivers.data ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-5 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">Haydovchi biriktirish</h3>
          <button className="text-muted text-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="text-xs text-muted mb-4">
          {order.from_address} → {order.to_address}
        </p>

        {assign.isError && (
          <ErrorBlock message={apiError(assign.error)} />
        )}

        {drivers.isLoading ? (
          <LoadingBlock />
        ) : list.length === 0 ? (
          <EmptyState message="Yaqin atrofda mos haydovchi yo'q" />
        ) : (
          <div className="space-y-2">
            {list.map((d: NearbyOrderDriver) => (
              <div
                key={d.driver_id}
                className="flex items-center justify-between gap-3 border border-border rounded-lg p-3"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">
                    {d.full_name || "—"} · ★ {d.rating.toFixed(1)}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {d.car_model} · {d.car_number} · {d.car_class}
                  </div>
                  <div className="text-xs text-primary font-medium mt-0.5">
                    {(d.distance_m / 1000).toFixed(1)} km · {formatPhone(d.phone)}
                  </div>
                </div>
                <button
                  className="btn btn-primary shrink-0"
                  disabled={assign.isPending}
                  onClick={() => assign.mutate(d.driver_id)}
                >
                  Biriktirish
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ridesApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate, formatKm, formatSom } from "@/lib/format";
import type { RideStatus } from "@/lib/types";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";
import { rideStatusLabel } from "@/lib/strings";

const STATUSES: { label: string; value: RideStatus | "all" }[] = [
  { label: "Barchasi", value: "all" },
  { label: "Qidirilmoqda", value: "searching" },
  { label: "Qabul qilingan", value: "accepted" },
  { label: "Yo'lda", value: "ongoing" },
  { label: "Yakunlangan", value: "completed" },
  { label: "Bekor qilingan", value: "cancelled" },
];

const STATUS_TONE: Record<RideStatus, "green" | "red" | "amber" | "blue"> = {
  completed: "green",
  cancelled: "red",
  searching: "amber",
  accepted: "blue",
  arrived: "blue",
  ongoing: "blue",
};

export default function RidesPage() {
  const [status, setStatus] = useState<RideStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-rides", status, from, to],
    queryFn: () =>
      ridesApi.list({
        status: status === "all" ? undefined : status,
        date_from: from ? new Date(from).toISOString() : undefined,
        date_to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
        limit: 200,
      }),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`btn ${status === s.value ? "btn-primary" : "btn-ghost"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2 ml-auto">
          <div>
            <label className="label">Boshlanish sanasi</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">Tugash sanasi</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorBlock message={apiError(error)} />
      ) : !data || data.length === 0 ? (
        <EmptyState message="Mos sayohatlar yo'q." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b bg-gray-50/60">
                  <th className="px-4 py-3 font-medium">Sana</th>
                  <th className="px-4 py-3 font-medium">Yo'lovchi</th>
                  <th className="px-4 py-3 font-medium">Haydovchi</th>
                  <th className="px-4 py-3 font-medium">Yo'nalish</th>
                  <th className="px-4 py-3 font-medium">Masofa</th>
                  <th className="px-4 py-3 font-medium">Narx</th>
                  <th className="px-4 py-3 font-medium">Holat</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3">{r.passenger_name ?? "—"}</td>
                    <td className="px-4 py-3">{r.driver_name ?? "—"}</td>
                    <td className="px-4 py-3 max-w-xs truncate">{r.from_address} → {r.to_address}</td>
                    <td className="px-4 py-3">{formatKm(r.distance_km)}</td>
                    <td className="px-4 py-3">{formatSom(r.price_sum)}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[r.status]}>{rideStatusLabel[r.status]}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/rides/${r.id}`} className="text-primary hover:underline">Ko'rish</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

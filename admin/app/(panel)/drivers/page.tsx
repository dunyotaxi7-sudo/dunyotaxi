"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { driversApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatNumber, formatSom } from "@/lib/format";
import type { DriverStatus } from "@/lib/types";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";
import { driverStatusLabel } from "@/lib/strings";

const STATUS_FILTERS: { label: string; value: DriverStatus | "all" }[] = [
  { label: "Barchasi", value: "all" },
  { label: "Kutilmoqda", value: "pending" },
  { label: "Tasdiqlangan", value: "approved" },
  { label: "Rad etilgan", value: "rejected" },
  { label: "To'xtatilgan", value: "suspended" },
];

const STATUS_TONE: Record<DriverStatus, "green" | "amber" | "red" | "gray"> = {
  approved: "green",
  pending: "amber",
  rejected: "red",
  suspended: "gray",
};

export default function DriversPage() {
  const [filter, setFilter] = useState<DriverStatus | "all">("all");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["drivers", filter],
    queryFn: () =>
      driversApi.list(filter === "all" ? undefined : filter),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`btn ${filter === f.value ? "btn-primary" : "btn-ghost"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Link href="/drivers/new" className="btn btn-primary">
          + Yangi haydovchi
        </Link>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorBlock message={apiError(error)} />
      ) : !data || data.length === 0 ? (
        <EmptyState message="Bu filtrga mos haydovchilar yo'q." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b bg-gray-50/60">
                  <th className="px-4 py-3 font-medium">Avtomobil</th>
                  <th className="px-4 py-3 font-medium">Raqam</th>
                  <th className="px-4 py-3 font-medium">Reyting</th>
                  <th className="px-4 py-3 font-medium">Sayohatlar</th>
                  <th className="px-4 py-3 font-medium">Balans</th>
                  <th className="px-4 py-3 font-medium">Holat</th>
                  <th className="px-4 py-3 font-medium">Onlayn</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3">
                      {d.car_model}
                      {d.car_color ? (
                        <span className="text-muted"> · {d.car_color}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {d.car_number}
                    </td>
                    <td className="px-4 py-3">★ {Number(d.rating).toFixed(2)}</td>
                    <td className="px-4 py-3">{formatNumber(d.total_rides)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`tabular-nums ${
                          d.low_balance ? "text-red-600 font-semibold" : ""
                        }`}
                      >
                        {formatSom(d.balance)}
                      </span>
                      {d.low_balance && (
                        <span className="ml-1 text-[11px] text-red-600">
                          (bloklangan)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={STATUS_TONE[d.status]}>{driverStatusLabel[d.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {d.is_online ? (
                        <Badge tone="green">onlayn</Badge>
                      ) : (
                        <span className="text-muted text-xs">oflayn</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/drivers/${d.id}`}
                        className="text-primary hover:underline text-sm"
                      >
                        Ko'rish
                      </Link>
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

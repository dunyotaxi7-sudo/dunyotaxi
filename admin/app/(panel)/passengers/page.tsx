"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { passengersApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate, formatNumber, formatPhone } from "@/lib/format";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";

export default function PassengersPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["passengers", search],
    queryFn: () => passengersApi.list(search || undefined),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          className="input max-w-sm"
          placeholder="Ism yoki telefon bo'yicha qidirish…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Link href="/passengers/new" className="btn btn-primary">
          + Yangi mijoz
        </Link>
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : isError ? (
        <ErrorBlock message={apiError(error)} />
      ) : !data || data.length === 0 ? (
        <EmptyState message="Yo'lovchilar topilmadi." />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b bg-gray-50/60">
                  <th className="px-4 py-3 font-medium">Ism</th>
                  <th className="px-4 py-3 font-medium">Telefon</th>
                  <th className="px-4 py-3 font-medium">Jami sayohatlar</th>
                  <th className="px-4 py-3 font-medium">Qo'shilgan sana</th>
                  <th className="px-4 py-3 font-medium">Holat</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium">{p.full_name}</td>
                    <td className="px-4 py-3">{formatPhone(p.phone)}</td>
                    <td className="px-4 py-3">{formatNumber(p.total_rides)}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-3">
                      {p.is_blocked ? (
                        <Badge tone="red">bloklangan</Badge>
                      ) : (
                        <Badge tone="green">faol</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/passengers/${p.id}`}
                        className="text-primary hover:underline"
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

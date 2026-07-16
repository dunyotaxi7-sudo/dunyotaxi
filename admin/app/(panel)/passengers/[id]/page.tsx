"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { passengersApi, usersApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate, formatKm, formatNumber, formatPhone, formatSom } from "@/lib/format";
import type { RideStatus } from "@/lib/types";
import { Badge, ErrorBlock, LoadingBlock, StatCard } from "@/components/ui";
import { rideStatusLabel } from "@/lib/strings";

const STATUS_TONE: Record<RideStatus, "green" | "red" | "amber" | "blue" | "gray"> = {
  completed: "green",
  cancelled: "red",
  searching: "amber",
  accepted: "blue",
  arrived: "blue",
  ongoing: "blue",
};

export default function PassengerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["passenger", id],
    queryFn: () => passengersApi.detail(id),
  });
  const rides = useQuery({
    queryKey: ["passenger-rides", id],
    queryFn: () => passengersApi.rides(id),
  });

  const block = useMutation({
    mutationFn: (blocked: boolean) =>
      usersApi.block(id, blocked, blocked ? "Administrator tomonidan bloklangan" : undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["passenger", id] }),
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () =>
      passengersApi.update(id, {
        full_name: form.full_name.trim() || undefined,
        phone: form.phone.trim() || undefined,
      }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["passenger", id] });
      qc.invalidateQueries({ queryKey: ["passengers"] });
    },
  });

  if (detail.isLoading) return <LoadingBlock />;
  if (detail.isError) return <ErrorBlock message={apiError(detail.error)} />;
  const p = detail.data!;

  function startEdit() {
    setForm({ full_name: p.full_name, phone: p.phone });
    setFormError(null);
    setEditing(true);
  }
  function submit() {
    setFormError(null);
    if (!form.full_name.trim()) return setFormError("Ismni kiriting.");
    if (form.phone && !/^\+998\d{9}$/.test(form.phone.trim()))
      return setFormError("Telefon raqamini to‘g‘ri kiriting: +998XXXXXXXXX");
    save.mutate();
  }

  return (
    <div className="space-y-6">
      <Link href="/passengers" className="text-sm text-primary hover:underline">
        ← Yo'lovchilarga qaytish
      </Link>

      {/* Profile */}
      <div className="card p-6">
        {editing ? (
          <div className="space-y-4 max-w-md">
            <h2 className="font-semibold">Ma’lumotlarni tahrirlash</h2>
            <div>
              <label className="label">Ism</label>
              <input
                className="input"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Telefon raqami</label>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => {
                  let digits = e.target.value.replace(/[^\d]/g, "");
                  if (digits.startsWith("998")) digits = digits.slice(3);
                  setForm({ ...form, phone: "+998" + digits.slice(0, 9) });
                }}
                placeholder="+998901234567"
              />
            </div>
            {formError && <ErrorBlock message={formError} />}
            {save.isError && <ErrorBlock message={apiError(save.error)} />}
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={save.isPending} onClick={submit}>
                {save.isPending ? "Saqlanmoqda…" : "Saqlash"}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                Bekor qilish
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xl font-semibold">{p.full_name}</div>
              <div className="text-muted mt-1">{formatPhone(p.phone)}</div>
              <div className="text-sm text-muted mt-1">
                Qo'shilgan sana: {formatDate(p.created_at)}
              </div>
              <div className="mt-2">
                {p.is_blocked ? (
                  <Badge tone="red">bloklangan</Badge>
                ) : (
                  <Badge tone="green">faol</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost" onClick={startEdit}>
                Tahrirlash
              </button>
              <button
                className={`btn ${p.is_blocked ? "btn-ghost" : "btn-primary"}`}
                disabled={block.isPending}
                onClick={() => block.mutate(!p.is_blocked)}
              >
                {block.isPending ? "…" : p.is_blocked ? "Blokdan chiqarish" : "Bloklash"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Jami sayohatlar" value={formatNumber(p.total_rides)} />
        <StatCard label="Yakunlangan" value={formatNumber(p.completed_rides)} />
        <StatCard label="Berilgan baholar" value={formatNumber(p.ratings_given)} />
      </div>

      {/* Ride history */}
      <div>
        <h2 className="font-semibold mb-3">Sayohatlar tarixi</h2>
        {rides.isLoading ? (
          <LoadingBlock />
        ) : rides.isError ? (
          <ErrorBlock message={apiError(rides.error)} />
        ) : !rides.data || rides.data.length === 0 ? (
          <div className="card p-6 text-sm text-muted">Hali sayohatlar yo'q.</div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b bg-gray-50/60">
                    <th className="px-4 py-3 font-medium">Sana</th>
                    <th className="px-4 py-3 font-medium">Qayerdan → Qayerga</th>
                    <th className="px-4 py-3 font-medium">Masofa</th>
                    <th className="px-4 py-3 font-medium">Narx</th>
                    <th className="px-4 py-3 font-medium">Holat</th>
                  </tr>
                </thead>
                <tbody>
                  {rides.data.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {formatDate(r.created_at)}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate">
                        {r.from_address} → {r.to_address}
                      </td>
                      <td className="px-4 py-3">{formatKm(r.distance_km)}</td>
                      <td className="px-4 py-3">{formatSom(r.price_sum)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[r.status]}>{rideStatusLabel[r.status]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { commissionApi, driversApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate } from "@/lib/format";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui";

export default function CommissionPage() {
  const qc = useQueryClient();
  const configs = useQuery({ queryKey: ["commission"], queryFn: () => commissionApi.list() });
  const drivers = useQuery({ queryKey: ["drivers", "all"], queryFn: () => driversApi.list() });

  // driver_id → label (car number)
  const driverLabel = useMemo(() => {
    const m = new Map<string, string>();
    drivers.data?.forEach((d) => m.set(d.id, `${d.car_model} · ${d.car_number}`));
    return m;
  }, [drivers.data]);

  const [globalPct, setGlobalPct] = useState("15");
  const [ovrDriver, setOvrDriver] = useState("");
  const [ovrPct, setOvrPct] = useState("10");
  const [ovrFrom, setOvrFrom] = useState("");
  const [ovrUntil, setOvrUntil] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: commissionApi.create,
    onSuccess: () => {
      setMsg("Saqlandi");
      qc.invalidateQueries({ queryKey: ["commission"] });
      setTimeout(() => setMsg(null), 2500);
    },
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Global */}
        <div className="card p-6 space-y-3">
          <h3 className="font-semibold">Umumiy komissiya</h3>
          <p className="text-sm text-muted">Alohida belgilanmagan barcha haydovchilarga tegishli.</p>
          <div className="flex items-end gap-3">
            <div>
              <label className="label">Foiz</label>
              <input
                className="input w-32"
                type="number"
                step="0.5"
                value={globalPct}
                onChange={(e) => setGlobalPct(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary"
              disabled={create.isPending}
              onClick={() => create.mutate({ commission_pct: Number(globalPct) })}
            >
              Umumiyni saqlash
            </button>
          </div>
        </div>

        {/* Per-driver override */}
        <div className="card p-6 space-y-3">
          <h3 className="font-semibold">Haydovchi bo'yicha alohida belgilash</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Haydovchi</label>
              <select className="input" value={ovrDriver} onChange={(e) => setOvrDriver(e.target.value)}>
                <option value="">Haydovchini tanlang…</option>
                {drivers.data?.map((d) => (
                  <option key={d.id} value={d.id}>{d.car_model} · {d.car_number}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Foiz</label>
              <input className="input" type="number" step="0.5" value={ovrPct} onChange={(e) => setOvrPct(e.target.value)} />
            </div>
            <div />
            <div>
              <label className="label">Amal qilish boshlanishi</label>
              <input className="input" type="date" value={ovrFrom} onChange={(e) => setOvrFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Amal qilish tugashi</label>
              <input className="input" type="date" value={ovrUntil} onChange={(e) => setOvrUntil(e.target.value)} />
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={create.isPending || !ovrDriver}
            onClick={() =>
              create.mutate({
                driver_id: ovrDriver,
                commission_pct: Number(ovrPct),
                valid_from: ovrFrom || undefined,
                valid_until: ovrUntil || undefined,
              })
            }
          >
            Alohida belgilashni qo'shish
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-green-600">✓ {msg}</div>}
      {create.isError && <ErrorBlock message={apiError(create.error)} />}

      {/* Existing configs */}
      <div>
        <h3 className="font-semibold mb-3">Konfiguratsiyalar</h3>
        {configs.isLoading ? (
          <LoadingBlock />
        ) : configs.isError ? (
          <ErrorBlock message={apiError(configs.error)} />
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b bg-gray-50/60">
                    <th className="px-4 py-3 font-medium">Maqsad</th>
                    <th className="px-4 py-3 font-medium">Komissiya</th>
                    <th className="px-4 py-3 font-medium">Amal qilish boshlanishi</th>
                    <th className="px-4 py-3 font-medium">Amal qilish tugashi</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.data?.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        {c.driver_id ? (
                          driverLabel.get(c.driver_id) ?? c.driver_id.slice(0, 8)
                        ) : (
                          <Badge tone="blue">Umumiy</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{Number(c.commission_pct).toFixed(2)}%</td>
                      <td className="px-4 py-3 text-muted">{formatDate(c.valid_from)}</td>
                      <td className="px-4 py-3 text-muted">{c.valid_until ? formatDate(c.valid_until) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="text-xs text-muted mt-2">
          Komissiya konfiguratsiyalari sanaga bog'liq — stavkani o'zgartirish uchun yangisini saqlang (mos keladigan eng oxirgi konfiguratsiya qo'llaniladi).
        </p>
      </div>
    </div>
  );
}

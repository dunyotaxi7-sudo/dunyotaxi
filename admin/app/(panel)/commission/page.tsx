"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { commissionApi, driversApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate } from "@/lib/format";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui";

type CommType = "percent" | "fixed" | "combined";

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

  const [globalType, setGlobalType] = useState<CommType>("combined");
  const [globalPct, setGlobalPct] = useState("0.5");
  const [globalFixed, setGlobalFixed] = useState("1250");
  const [ovrDriver, setOvrDriver] = useState("");
  const [ovrType, setOvrType] = useState<CommType>("percent");
  const [ovrPct, setOvrPct] = useState("10");
  const [ovrFixed, setOvrFixed] = useState("1250");
  const [ovrFrom, setOvrFrom] = useState("");
  const [ovrUntil, setOvrUntil] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // Build the create payload for the chosen commission type.
  function commissionBody(type: CommType, pct: string, fixed: string) {
    if (type === "fixed")
      return { commission_type: "fixed" as const, commission_fixed: Number(fixed) };
    if (type === "combined")
      return {
        commission_type: "combined" as const,
        commission_pct: Number(pct),
        commission_fixed: Number(fixed),
      };
    return { commission_type: "percent" as const, commission_pct: Number(pct) };
  }

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
              <label className="label">Komissiya turi</label>
              <select
                className="input w-44"
                value={globalType}
                onChange={(e) => setGlobalType(e.target.value as CommType)}
              >
                <option value="percent">Foiz (%)</option>
                <option value="fixed">Belgilangan (so'm)</option>
                <option value="combined">Aralash (so'm + %)</option>
              </select>
            </div>
            {(globalType === "fixed" || globalType === "combined") && (
              <div>
                <label className="label">Har sayohat uchun (so'm)</label>
                <input
                  className="input w-40"
                  type="number"
                  step="50"
                  value={globalFixed}
                  onChange={(e) => setGlobalFixed(e.target.value)}
                />
              </div>
            )}
            {(globalType === "percent" || globalType === "combined") && (
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
            )}
            <button
              className="btn btn-primary"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(commissionBody(globalType, globalPct, globalFixed))
              }
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
              <label className="label">Komissiya turi</label>
              <select
                className="input"
                value={ovrType}
                onChange={(e) => setOvrType(e.target.value as CommType)}
              >
                <option value="percent">Foiz (%)</option>
                <option value="fixed">Belgilangan (so'm)</option>
                <option value="combined">Aralash (so'm + %)</option>
              </select>
            </div>
            {(ovrType === "fixed" || ovrType === "combined") && (
              <div>
                <label className="label">Har sayohat uchun (so'm)</label>
                <input className="input" type="number" step="50" value={ovrFixed} onChange={(e) => setOvrFixed(e.target.value)} />
              </div>
            )}
            {(ovrType === "percent" || ovrType === "combined") && (
              <div>
                <label className="label">Foiz</label>
                <input className="input" type="number" step="0.5" value={ovrPct} onChange={(e) => setOvrPct(e.target.value)} />
              </div>
            )}
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
                ...commissionBody(ovrType, ovrPct, ovrFixed),
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
                      <td className="px-4 py-3 font-medium">
                        {c.commission_type === "fixed"
                          ? `${c.commission_fixed.toLocaleString("ru-RU")} so'm / sayohat`
                          : c.commission_type === "combined"
                          ? `${c.commission_fixed.toLocaleString("ru-RU")} so'm + ${Number(c.commission_pct).toFixed(2)}%`
                          : `${Number(c.commission_pct).toFixed(2)}%`}
                      </td>
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

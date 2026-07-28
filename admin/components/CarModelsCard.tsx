"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { carModelsApi, carTypesApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui";

/**
 * Catalog of car models, each tied to a tariff. A driver's tariff (car_class)
 * is set from their chosen model; dispatch then lets a higher-tier driver also
 * serve lower-tier orders.
 */
export function CarModelsCard() {
  const qc = useQueryClient();
  const models = useQuery({ queryKey: ["car-models"], queryFn: () => carModelsApi.list() });
  const types = useQuery({ queryKey: ["car-types"], queryFn: () => carTypesApi.list() });

  const [name, setName] = useState("");
  const [tier, setTier] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["car-models"] });

  const create = useMutation({
    mutationFn: () => carModelsApi.create({ name: name.trim(), car_type: tier }),
    onSuccess: () => {
      setMsg("Qo'shildi"); setName("");
      invalidate();
      setTimeout(() => setMsg(null), 2000);
    },
  });
  const update = useMutation({
    mutationFn: (v: { id: number; car_type?: string; is_active?: boolean }) =>
      carModelsApi.update(v.id, { car_type: v.car_type, is_active: v.is_active }),
    onSuccess: invalidate,
  });

  const tierName = (code: string) =>
    types.data?.find((t) => t.code === code)?.name_uz ?? code;
  const activeTiers = types.data?.filter((t) => t.is_active) ?? [];

  return (
    <div className="card p-6 space-y-4">
      <div>
        <h3 className="font-semibold">Avtomobil modellari</h3>
        <p className="text-sm text-muted">
          Har bir model bir tarifga bog'lanadi. Haydovchi modelini tanlaganda tarifi shu bo'yicha o'rnatiladi.
        </p>
      </div>

      {/* Add model */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="label">Model nomi</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan Chevrolet Onix" />
        </div>
        <div>
          <label className="label">Tarif</label>
          <select className="input w-40" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="">Tanlang…</option>
            {activeTiers.map((t) => (
              <option key={t.code} value={t.code}>{t.name_uz}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-primary"
          disabled={create.isPending || !name.trim() || !tier}
          onClick={() => create.mutate()}
        >
          Qo'shish
        </button>
      </div>
      {msg && <div className="text-sm text-green-600">✓ {msg}</div>}
      {create.isError && <ErrorBlock message={apiError(create.error)} />}

      {/* Existing models */}
      {models.isLoading ? (
        <LoadingBlock />
      ) : models.isError ? (
        <ErrorBlock message={apiError(models.error)} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b">
                <th className="py-2 pr-4 font-medium">Model</th>
                <th className="py-2 pr-4 font-medium">Tarif</th>
                <th className="py-2 font-medium">Holat</th>
              </tr>
            </thead>
            <tbody>
              {models.data?.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-medium">{m.name}</td>
                  <td className="py-2 pr-4">
                    <select
                      className="input h-8 py-0 w-36"
                      value={m.car_type}
                      onChange={(e) => update.mutate({ id: m.id, car_type: e.target.value })}
                    >
                      {activeTiers.map((t) => (
                        <option key={t.code} value={t.code}>{tierName(t.code)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2">
                    <button
                      className="inline-flex items-center gap-2"
                      onClick={() => update.mutate({ id: m.id, is_active: !m.is_active })}
                    >
                      {m.is_active ? <Badge tone="green">faol</Badge> : <Badge tone="gray">o'chirilgan</Badge>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {update.isError && <ErrorBlock message={apiError(update.error)} />}
    </div>
  );
}

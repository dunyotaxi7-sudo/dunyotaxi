"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { carTypesApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { ErrorBlock, LoadingBlock } from "@/components/ui";

/**
 * Manage service tiers (Econom/Komfort/Biznes): the fare multiplier and whether
 * each is offered. The tier a passenger picks scales the base fare by this
 * multiplier, and only drivers of the matching class receive the ride.
 */
export function CarTypesCard() {
  const qc = useQueryClient();
  const types = useQuery({ queryKey: ["car-types"], queryFn: () => carTypesApi.list() });
  // Local editable multipliers keyed by code.
  const [mult, setMult] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (types.data) {
      setMult(Object.fromEntries(types.data.map((t) => [t.code, String(t.multiplier)])));
    }
  }, [types.data]);

  const save = useMutation({
    mutationFn: (vars: { code: string; multiplier?: number; is_active?: boolean }) =>
      carTypesApi.update(vars.code, {
        multiplier: vars.multiplier,
        is_active: vars.is_active,
      }),
    onSuccess: () => {
      setMsg("Saqlandi");
      qc.invalidateQueries({ queryKey: ["car-types"] });
      setTimeout(() => setMsg(null), 2500);
    },
  });

  return (
    <div className="card p-6 space-y-4">
      <div>
        <h3 className="font-semibold">Avtomobil turlari (tariflar)</h3>
        <p className="text-sm text-muted">
          Koeffitsient asosiy narxni ko'paytiradi. Faqat mos tarifdagi haydovchilar buyurtmani oladi.
        </p>
      </div>

      {types.isLoading ? (
        <LoadingBlock />
      ) : types.isError ? (
        <ErrorBlock message={apiError(types.error)} />
      ) : (
        <div className="space-y-2">
          {types.data?.map((ct) => (
            <div key={ct.code} className="flex items-center gap-3 flex-wrap">
              <div className="w-28 font-medium">{ct.name_uz}</div>
              <div className="flex items-center gap-2">
                <span className="text-muted text-sm">×</span>
                <input
                  className="input w-24"
                  type="number"
                  step="0.05"
                  value={mult[ct.code] ?? ""}
                  onChange={(e) => setMult({ ...mult, [ct.code]: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ct.is_active}
                  onChange={(e) => save.mutate({ code: ct.code, is_active: e.target.checked })}
                />
                Faol
              </label>
              <button
                className="btn btn-primary btn-sm"
                disabled={save.isPending}
                onClick={() => save.mutate({ code: ct.code, multiplier: Number(mult[ct.code]) })}
              >
                Saqlash
              </button>
            </div>
          ))}
        </div>
      )}

      {msg && <div className="text-sm text-green-600">✓ {msg}</div>}
      {save.isError && <ErrorBlock message={apiError(save.error)} />}
    </div>
  );
}

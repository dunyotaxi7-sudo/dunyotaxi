"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { pricingApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate, formatSom } from "@/lib/format";
import { computeFare, type FareInputs } from "@/lib/pricing";
import type { PricingConfig, PricingConfigUpdate } from "@/lib/types";
import { ErrorBlock, LoadingBlock } from "@/components/ui";

// Editable fields as strings (so inputs can be cleared while typing).
interface FormState {
  base_fare: string;
  base_km: string;
  price_per_km: string;
  min_price: string;
  night_multiplier: string;
  night_start: string; // HH:MM
  night_end: string;
  is_active: boolean;
}

const PREVIEW_DISTANCES = [2, 5, 10, 15];

function hhmm(t: string): string {
  // "22:00:00" → "22:00"
  return t?.slice(0, 5) ?? "";
}

function toForm(cfg: PricingConfig): FormState {
  return {
    base_fare: String(cfg.base_fare),
    base_km: String(cfg.base_km),
    price_per_km: String(cfg.price_per_km),
    min_price: String(cfg.min_price),
    night_multiplier: String(cfg.night_multiplier),
    night_start: hhmm(cfg.night_start),
    night_end: hhmm(cfg.night_end),
    is_active: cfg.is_active,
  };
}

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export default function PricingPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pricing"],
    queryFn: () => pricingApi.list(),
  });

  // The active config is the newest active one; fall back to the newest.
  const active = useMemo<PricingConfig | undefined>(() => {
    if (!data || data.length === 0) return undefined;
    return data.find((c) => c.is_active) ?? data[0];
  }, [data]);

  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (active) setForm(toForm(active));
  }, [active]);

  const fareInputs: FareInputs = form
    ? {
        base_fare: num(form.base_fare),
        base_km: num(form.base_km),
        price_per_km: num(form.price_per_km),
        min_price: num(form.min_price),
        night_multiplier: num(form.night_multiplier),
      }
    : { base_fare: 0, base_km: 0, price_per_km: 0, min_price: 0, night_multiplier: 1 };

  const mutation = useMutation({
    mutationFn: (body: PricingConfigUpdate) => {
      if (!active) throw new Error("no pricing config");
      return pricingApi.update(active.id, body);
    },
    onSuccess: () => {
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["pricing"] });
      setTimeout(() => setSaved(false), 2500);
    },
  });

  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message={apiError(error)} />;
  if (!form || !active)
    return <ErrorBlock message="Narxlar konfiguratsiyasi topilmadi." />;

  const set = (k: keyof FormState, v: string | boolean) => {
    setForm({ ...form, [k]: v });
    setSaved(false);
  };

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      base_fare: Math.round(num(form.base_fare)),
      base_km: num(form.base_km),
      price_per_km: Math.round(num(form.price_per_km)),
      min_price: Math.round(num(form.min_price)),
      night_multiplier: num(form.night_multiplier),
      night_start: form.night_start,
      night_end: form.night_end,
      is_active: form.is_active,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      {/* Form */}
      <form onSubmit={onSave} className="lg:col-span-3 card p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Narxlar</h2>
          <span className="text-xs text-muted">
            Yangilangan {formatDate(active.updated_at)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Boshlang'ich haq (so'm)"
            hint="Birinchi bazaviy km narxini qoplaydi"
            value={form.base_fare}
            onChange={(v) => set("base_fare", v)}
            type="number"
          />
          <Field
            label="Bazaviy km"
            hint="Boshlang'ich haqqa kiritilgan masofa"
            value={form.base_km}
            onChange={(v) => set("base_km", v)}
            type="number"
            step="0.1"
          />
          <Field
            label="Har qo'shimcha km narxi (so'm)"
            value={form.price_per_km}
            onChange={(v) => set("price_per_km", v)}
            type="number"
          />
          <Field
            label="Minimal narx (so'm)"
            hint="Narx bundan past bo'lmaydi"
            value={form.min_price}
            onChange={(v) => set("min_price", v)}
            type="number"
          />
          <Field
            label="Kechki koeffitsient"
            hint="masalan, 1.20 = +20%"
            value={form.night_multiplier}
            onChange={(v) => set("night_multiplier", v)}
            type="number"
            step="0.05"
          />
          <div />
          <Field
            label="Kechki boshlanish"
            value={form.night_start}
            onChange={(v) => set("night_start", v)}
            type="time"
          />
          <Field
            label="Kechki tugash"
            value={form.night_end}
            onChange={(v) => set("night_end", v)}
            type="time"
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set("is_active", e.target.checked)}
          />
          Faol konfiguratsiya
        </label>

        <div className="flex items-center gap-3 pt-2">
          <button
            className="btn btn-primary"
            disabled={mutation.isPending}
            type="submit"
          >
            {mutation.isPending ? "Saqlanmoqda…" : "O'zgarishlarni saqlash"}
          </button>
          {saved && (
            <span className="text-sm text-green-600">✓ Saqlandi</span>
          )}
          {mutation.isError && (
            <span className="text-sm text-red-600">
              {apiError(mutation.error)}
            </span>
          )}
        </div>
      </form>

      {/* Live preview */}
      <div className="lg:col-span-2 space-y-4">
        <div className="card p-6">
          <h2 className="font-semibold mb-1">Jonli ko'rinish</h2>
          <p className="text-xs text-muted mb-4">
            Saqlashdan oldin, tahrirlash paytida qayta hisoblanadi.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b">
                <th className="py-2 font-medium">Masofa</th>
                <th className="py-2 font-medium text-right">Kunduzi</th>
                <th className="py-2 font-medium text-right">Kechqurun</th>
              </tr>
            </thead>
            <tbody>
              {PREVIEW_DISTANCES.map((km) => (
                <tr key={km} className="border-b last:border-0">
                  <td className="py-2">{km} km</td>
                  <td className="py-2 text-right font-medium">
                    {formatSom(computeFare(fareInputs, km, false))}
                  </td>
                  <td className="py-2 text-right font-medium text-primary">
                    {formatSom(computeFare(fareInputs, km, true))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-xs text-muted">
            Kechki oraliq: {form.night_start || "—"} → {form.night_end || "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  type = "text",
  step,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="input"
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

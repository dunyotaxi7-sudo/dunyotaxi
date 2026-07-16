"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { bonusApi, promoApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatSom } from "@/lib/format";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";

export default function BonusPromoPage() {
  const [tab, setTab] = useState<"bonus" | "promo">("bonus");
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <button className={`btn ${tab === "bonus" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("bonus")}>
          Bonus kampaniyalari
        </button>
        <button className={`btn ${tab === "promo" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("promo")}>
          Promo kodlar
        </button>
      </div>
      {tab === "bonus" ? <BonusTab /> : <PromoTab />}
    </div>
  );
}

// ── Bonus campaigns ─────────────────────────────────────────────────────

const BONUS_TYPE_LABEL: Record<string, string> = {
  ride_count: "Sayohatlar soni",
  daily_target: "Kunlik maqsad",
  referral: "Referal",
  first_ride: "Birinchi sayohat",
  rating_bonus: "Reyting bonusi",
};

const APPLIES_TO_LABEL: Record<string, string> = {
  driver: "Haydovchi",
  passenger: "Yo'lovchi",
  both: "Ikkalasi ham",
};

function BonusTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["bonus-campaigns"], queryFn: () => bonusApi.list() });
  const [f, setF] = useState({
    name: "",
    bonus_type: "ride_count",
    target_value: "",
    bonus_amount: "",
    applies_to: "driver",
    start_date: "",
    end_date: "",
  });

  const create = useMutation({
    mutationFn: () =>
      bonusApi.create({
        name: f.name,
        bonus_type: f.bonus_type,
        target_value: f.target_value ? Number(f.target_value) : null,
        bonus_amount: f.bonus_amount ? Number(f.bonus_amount) : null,
        applies_to: f.applies_to,
        start_date: f.start_date || null,
        end_date: f.end_date || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bonus-campaigns"] });
      setF({ ...f, name: "", target_value: "", bonus_amount: "" });
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => bonusApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bonus-campaigns"] }),
  });

  return (
    <div className="space-y-5">
      <div className="card p-6 space-y-3">
        <h3 className="font-semibold">Yangi kampaniya</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Nomi" value={f.name} onChange={(v) => setF({ ...f, name: v })} />
          <div>
            <label className="label">Turi</label>
            <select className="input" value={f.bonus_type} onChange={(e) => setF({ ...f, bonus_type: e.target.value })}>
              {["ride_count", "daily_target", "referral", "first_ride", "rating_bonus"].map((v) => (
                <option key={v} value={v}>{BONUS_TYPE_LABEL[v] ?? v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Kimga tegishli</label>
            <select className="input" value={f.applies_to} onChange={(e) => setF({ ...f, applies_to: e.target.value })}>
              {["driver", "passenger", "both"].map((v) => <option key={v} value={v}>{APPLIES_TO_LABEL[v] ?? v}</option>)}
            </select>
          </div>
          <Field label="Maqsad qiymati" type="number" value={f.target_value} onChange={(v) => setF({ ...f, target_value: v })} />
          <Field label="Bonus miqdori (so'm)" type="number" value={f.bonus_amount} onChange={(v) => setF({ ...f, bonus_amount: v })} />
          <div />
          <Field label="Boshlanish sanasi" type="date" value={f.start_date} onChange={(v) => setF({ ...f, start_date: v })} />
          <Field label="Tugash sanasi" type="date" value={f.end_date} onChange={(v) => setF({ ...f, end_date: v })} />
        </div>
        <button className="btn btn-primary" disabled={create.isPending || !f.name} onClick={() => create.mutate()}>
          Kampaniya yaratish
        </button>
        {create.isError && <ErrorBlock message={apiError(create.error)} />}
      </div>

      {list.isLoading ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorBlock message={apiError(list.error)} />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState message="Hali bonus kampaniyalari yo'q." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b bg-gray-50/60">
                <th className="px-4 py-3 font-medium">Nomi</th>
                <th className="px-4 py-3 font-medium">Turi</th>
                <th className="px-4 py-3 font-medium">Maqsad</th>
                <th className="px-4 py-3 font-medium">Mukofot</th>
                <th className="px-4 py-3 font-medium">Faol</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3">{BONUS_TYPE_LABEL[c.bonus_type] ?? c.bonus_type}</td>
                  <td className="px-4 py-3">{c.target_value ?? "—"}</td>
                  <td className="px-4 py-3">{c.bonus_amount != null ? formatSom(c.bonus_amount) : "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle.mutate({ id: c.id, is_active: !c.is_active })}>
                      <Badge tone={c.is_active ? "green" : "gray"}>{c.is_active ? "faol" : "nofaol"}</Badge>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Promo codes ─────────────────────────────────────────────────────────

function PromoTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["promo-codes"], queryFn: () => promoApi.list() });
  const [f, setF] = useState({
    code: "",
    discount_type: "percent" as "percent" | "fixed",
    discount_value: "",
    max_discount: "",
    min_ride_price: "",
    usage_limit: "",
    per_user_limit: "1",
    valid_from: "",
    valid_until: "",
  });

  const create = useMutation({
    mutationFn: () =>
      promoApi.create({
        code: f.code,
        discount_type: f.discount_type,
        discount_value: Number(f.discount_value),
        max_discount: f.max_discount ? Number(f.max_discount) : null,
        min_ride_price: f.min_ride_price ? Number(f.min_ride_price) : 0,
        usage_limit: f.usage_limit ? Number(f.usage_limit) : null,
        per_user_limit: Number(f.per_user_limit || 1),
        valid_from: f.valid_from || null,
        valid_until: f.valid_until || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["promo-codes"] });
      setF({ ...f, code: "", discount_value: "" });
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => promoApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promo-codes"] }),
  });

  return (
    <div className="space-y-5">
      <div className="card p-6 space-y-3">
        <h3 className="font-semibold">Yangi promo kod</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Kod" value={f.code} onChange={(v) => setF({ ...f, code: v.toUpperCase() })} />
          <div>
            <label className="label">Chegirma turi</label>
            <select className="input" value={f.discount_type} onChange={(e) => setF({ ...f, discount_type: e.target.value as "percent" | "fixed" })}>
              <option value="percent">Foiz</option>
              <option value="fixed">Belgilangan</option>
            </select>
          </div>
          <Field label={f.discount_type === "percent" ? "Chegirma %" : "Chegirma (so'm)"} type="number" value={f.discount_value} onChange={(v) => setF({ ...f, discount_value: v })} />
          <Field label="Maksimal chegirma (so'm)" type="number" value={f.max_discount} onChange={(v) => setF({ ...f, max_discount: v })} />
          <Field label="Minimal sayohat narxi (so'm)" type="number" value={f.min_ride_price} onChange={(v) => setF({ ...f, min_ride_price: v })} />
          <Field label="Foydalanish cheklovi" type="number" value={f.usage_limit} onChange={(v) => setF({ ...f, usage_limit: v })} />
          <Field label="Har foydalanuvchi uchun cheklov" type="number" value={f.per_user_limit} onChange={(v) => setF({ ...f, per_user_limit: v })} />
          <Field label="Amal qilish boshlanishi" type="date" value={f.valid_from} onChange={(v) => setF({ ...f, valid_from: v })} />
          <Field label="Amal qilish tugashi" type="date" value={f.valid_until} onChange={(v) => setF({ ...f, valid_until: v })} />
        </div>
        <button className="btn btn-primary" disabled={create.isPending || !f.code || !f.discount_value} onClick={() => create.mutate()}>
          Promo yaratish
        </button>
        {create.isError && <ErrorBlock message={apiError(create.error)} />}
      </div>

      {list.isLoading ? (
        <LoadingBlock />
      ) : list.isError ? (
        <ErrorBlock message={apiError(list.error)} />
      ) : !list.data || list.data.length === 0 ? (
        <EmptyState message="Hali promo kodlar yo'q." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted border-b bg-gray-50/60">
                <th className="px-4 py-3 font-medium">Kod</th>
                <th className="px-4 py-3 font-medium">Chegirma</th>
                <th className="px-4 py-3 font-medium">Ishlatilgan</th>
                <th className="px-4 py-3 font-medium">Faol</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono font-medium">{p.code}</td>
                  <td className="px-4 py-3">
                    {p.discount_type === "percent" ? `${p.discount_value}%` : formatSom(p.discount_value)}
                  </td>
                  <td className="px-4 py-3">{p.used_count}{p.usage_limit ? ` / ${p.usage_limit}` : ""}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggle.mutate({ id: p.id, is_active: !p.is_active })}>
                      <Badge tone={p.is_active ? "green" : "gray"}>{p.is_active ? "faol" : "nofaol"}</Badge>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

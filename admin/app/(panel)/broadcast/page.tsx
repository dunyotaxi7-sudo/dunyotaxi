"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { broadcastApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import type { BroadcastAudience, BroadcastResult } from "@/lib/types";
import { ErrorBlock } from "@/components/ui";

const AUDIENCES: { value: BroadcastAudience; label: string; hint: string }[] = [
  {
    value: "drivers_approved",
    label: "Tasdiqlangan haydovchilar",
    hint: "Ishlash huquqiga ega barcha haydovchilar",
  },
  {
    value: "drivers_online",
    label: "Hozir onlayn haydovchilar",
    hint: "Faqat smenani boshlaganlar",
  },
  {
    value: "drivers_all",
    label: "Barcha haydovchilar",
    hint: "Kutilayotgan va rad etilganlar ham",
  },
  {
    value: "passengers",
    label: "Yo'lovchilar",
    hint: "Barcha mijozlar",
  },
];

const TEMPLATES: { label: string; title: string; body: string }[] = [
  {
    label: "Ilovani yangilash",
    title: "Dunyo Taxi yangilandi",
    body: "Play Market'dan yangi versiyani yuklab oling. Eski versiyada buyurtmalar kelmasligi mumkin.",
  },
  {
    label: "Smenaga chiqish",
    title: "Buyurtmalar ko'p",
    body: "Hozir buyurtmalar ko'p. Ilovani ochib, «Ishni boshlash» tugmasini bosing.",
  },
  {
    label: "Balansni to'ldirish",
    title: "Balansingizni tekshiring",
    body: "Balans manfiy bo'lsa buyurtma kelmaydi. Iltimos, hisobingizni to'ldiring.",
  },
];

const MAX_TITLE = 100;
const MAX_BODY = 300;

export default function BroadcastPage() {
  const [audience, setAudience] = useState<BroadcastAudience>("drivers_approved");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reach, setReach] = useState<BroadcastResult | null>(null);
  const [sent, setSent] = useState<BroadcastResult | null>(null);

  const valid = title.trim().length > 0 && body.trim().length > 0;

  // Dry run: count who would receive it, without sending anything.
  const check = useMutation({
    mutationFn: () =>
      broadcastApi.send({ title: title.trim() || "-", body: body.trim() || "-", audience, dry_run: true }),
    onSuccess: (r) => {
      setReach(r);
      setSent(null);
    },
  });

  const send = useMutation({
    mutationFn: () =>
      broadcastApi.send({ title: title.trim(), body: body.trim(), audience, dry_run: false }),
    onSuccess: (r) => setSent(r),
  });

  function confirmAndSend() {
    const a = AUDIENCES.find((x) => x.value === audience)?.label ?? audience;
    const who = reach ? `${reach.users_with_token} ta qurilmaga` : "tanlangan auditoriyaga";
    if (!window.confirm(`Xabar ${who} (${a}) yuborilsinmi?\n\n${title}\n${body}`)) return;
    send.mutate();
  }

  function applyTemplate(t: (typeof TEMPLATES)[number]) {
    setTitle(t.title);
    setBody(t.body);
    setReach(null);
    setSent(null);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-lg font-semibold">Haydovchilarga xabar</h1>
        <p className="text-sm text-muted">
          Ilovaga push bildirishnoma yuborish. Xabar faqat ilova o'rnatilgan va
          bildirishnomaga ruxsat bergan qurilmalarga boradi.
        </p>
      </div>

      {/* Templates */}
      <div className="flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button key={t.label} className="btn btn-ghost !py-1 !px-3" onClick={() => applyTemplate(t)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Audience */}
      <div className="card p-4 space-y-3">
        <div className="label">Kimga</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {AUDIENCES.map((a) => (
            <button
              key={a.value}
              onClick={() => {
                setAudience(a.value);
                setReach(null);
                setSent(null);
              }}
              className={`text-left rounded-lg border p-3 transition-colors ${
                audience === a.value
                  ? "border-primary bg-[var(--primary-soft)]"
                  : "border-border hover:bg-[var(--surface-2)]"
              }`}
            >
              <div className="font-medium text-sm">{a.label}</div>
              <div className="text-xs text-muted">{a.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      <div className="card p-4 space-y-3">
        <div>
          <label className="label">Sarlavha</label>
          <input
            className="input"
            value={title}
            maxLength={MAX_TITLE}
            placeholder="Dunyo Taxi yangilandi"
            onChange={(e) => {
              setTitle(e.target.value);
              setSent(null);
            }}
          />
          <div className="text-xs text-muted mt-1">{title.length}/{MAX_TITLE}</div>
        </div>
        <div>
          <label className="label">Matn</label>
          <textarea
            className="input min-h-[90px]"
            value={body}
            maxLength={MAX_BODY}
            placeholder="Play Market'dan yangi versiyani yuklab oling."
            onChange={(e) => {
              setBody(e.target.value);
              setSent(null);
            }}
          />
          <div className="text-xs text-muted mt-1">{body.length}/{MAX_BODY}</div>
        </div>

        {/* Phone preview */}
        {(title || body) && (
          <div>
            <div className="label">Telefonda qanday ko'rinadi</div>
            <div className="rounded-xl border border-border bg-[var(--surface-2)] p-3 flex gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary text-white flex items-center justify-center font-bold shrink-0">
                D
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted">Dunyo Taxi · hozir</div>
                <div className="font-semibold text-sm truncate">{title || "Sarlavha"}</div>
                <div className="text-sm text-muted">{body || "Matn"}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-ghost" disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? "Hisoblanmoqda…" : "Nechta qurilma? (tekshirish)"}
        </button>
        <button
          className="btn btn-primary"
          disabled={!valid || send.isPending}
          onClick={confirmAndSend}
        >
          {send.isPending ? "Yuborilmoqda…" : "Xabar yuborish"}
        </button>
      </div>

      {check.isError && <ErrorBlock message={apiError(check.error)} />}
      {send.isError && <ErrorBlock message={apiError(send.error)} />}

      {reach && !sent && (
        <div className="card p-4">
          <div className="font-medium mb-2">Qamrov (hali yuborilmadi)</div>
          <Row label="Auditoriyadagi foydalanuvchilar" value={reach.users_total} />
          <Row label="Bildirishnomaga ruxsat berganlar" value={reach.users_with_token} strong />
          {reach.users_with_token === 0 && (
            <p className="text-sm text-amber-700 mt-2">
              Hech kimda ro'yxatdan o'tgan qurilma yo'q. Haydovchilar ilovaning
              yangi versiyasini o'rnatib, bildirishnomaga ruxsat berishi kerak.
            </p>
          )}
        </div>
      )}

      {sent && (
        <div className="card p-4">
          <div className="font-medium mb-2">Yuborildi</div>
          <Row label="Auditoriyadagi foydalanuvchilar" value={sent.users_total} />
          <Row label="Qurilmasi bor foydalanuvchilar" value={sent.users_with_token} />
          <Row label="Jami qurilmalar" value={sent.tokens} />
          <Row label="Muvaffaqiyatli" value={sent.sent} strong />
          <Row label="Xatolik" value={sent.failed} />
          <p className="text-xs text-muted mt-3">
            «Muvaffaqiyatli» — Expo xabarni qabul qilgani. Qurilmaga yetib
            borishi tarmoqqa bog'liq va bir necha soniya olishi mumkin.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold text-primary" : ""}`}>{value}</span>
    </div>
  );
}

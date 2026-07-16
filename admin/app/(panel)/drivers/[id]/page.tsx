"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { driversApi, usersApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate, formatSom } from "@/lib/format";
import type { DriverStatus } from "@/lib/types";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui";
import {
  docStatusLabel,
  docTypeLabel,
  driverStatusLabel,
  txTypeLabel,
} from "@/lib/strings";

const STATUS_TONE: Record<DriverStatus, "green" | "amber" | "red" | "gray"> = {
  approved: "green",
  pending: "amber",
  rejected: "red",
  suspended: "gray",
};

// Documents an admin can upload for a driver.
const REQUIRED_DOCS = [
  "passport",
  "tech_passport",
  "car_photo_front",
  "car_photo_back",
];

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  // No single-driver endpoint; find within the list.
  const drivers = useQuery({ queryKey: ["drivers", "all"], queryFn: () => driversApi.list() });
  const driver = drivers.data?.find((d) => d.id === id);

  const docs = useQuery({
    queryKey: ["driver-docs", id],
    queryFn: () => driversApi.documents(id),
  });
  const txs = useQuery({
    queryKey: ["driver-txs", id],
    queryFn: () => driversApi.transactions(id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["drivers", "all"] });
    qc.invalidateQueries({ queryKey: ["driver-docs", id] });
    qc.invalidateQueries({ queryKey: ["driver-txs", id] });
  };

  const moderate = useMutation({
    mutationFn: ({ status, reason }: { status: DriverStatus; reason?: string }) =>
      driversApi.moderate(id, status, reason),
    onSuccess: invalidate,
  });
  const reviewDoc = useMutation({
    mutationFn: ({ docId, status, reason }: { docId: string; status: "approved" | "rejected"; reason?: string }) =>
      driversApi.reviewDocument(docId, status, reason),
    onSuccess: invalidate,
  });
  const block = useMutation({
    mutationFn: ({ userId, blocked }: { userId: string; blocked: boolean }) =>
      usersApi.block(userId, blocked, blocked ? "Administrator tomonidan bloklandi" : undefined),
    onSuccess: invalidate,
  });

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const deposit = useMutation({
    mutationFn: (delta: number) => driversApi.deposit(id, delta, note.trim() || undefined),
    onSuccess: () => {
      setAmount("");
      setNote("");
      invalidate();
    },
  });

  // Profile editing (name + car).
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    car_model: "",
    car_number: "",
    car_color: "",
    car_year: "",
  });
  const startEdit = () => {
    if (!driver) return;
    setForm({
      full_name: driver.full_name ?? "",
      car_model: driver.car_model ?? "",
      car_number: driver.car_number ?? "",
      car_color: driver.car_color ?? "",
      car_year: driver.car_year ? String(driver.car_year) : "",
    });
    setEditing(true);
  };
  const saveProfile = useMutation({
    mutationFn: () =>
      driversApi.updateProfile(id, {
        full_name: form.full_name.trim() || undefined,
        car_model: form.car_model.trim() || undefined,
        car_number: form.car_number.trim() || undefined,
        car_color: form.car_color.trim() || undefined,
        car_year: form.car_year ? Number(form.car_year) : undefined,
      }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
  });

  // Document upload (admin uploads on the driver's behalf).
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<string | null>(null);
  const uploadDoc = useMutation({
    mutationFn: ({ type, file }: { type: string; file: File }) =>
      driversApi.uploadDocument(id, type, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["driver-docs", id] }),
  });
  const latestByType = (type: string) =>
    (docs.data ?? [])
      .filter((d) => d.doc_type === type)
      .sort((a, b) => (a.uploaded_at ?? "").localeCompare(b.uploaded_at ?? ""))
      .at(-1);

  if (drivers.isLoading) return <LoadingBlock />;
  if (drivers.isError) return <ErrorBlock message={apiError(drivers.error)} />;
  if (!driver) return <ErrorBlock message="Haydovchi topilmadi." />;

  return (
    <div className="space-y-6">
      <Link href="/drivers" className="text-sm text-primary hover:underline">← Orqaga</Link>

      {/* Profile + moderation */}
      <div className="card p-6">
        {editing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Ma’lumotlarni tahrirlash</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Ism</label>
                <input className="input" value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div>
                <label className="label">Mashina modeli</label>
                <input className="input" value={form.car_model}
                  onChange={(e) => setForm({ ...form, car_model: e.target.value })} />
              </div>
              <div>
                <label className="label">Davlat raqami</label>
                <input className="input font-mono" value={form.car_number}
                  onChange={(e) => setForm({ ...form, car_number: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <label className="label">Rangi</label>
                <input className="input" value={form.car_color}
                  onChange={(e) => setForm({ ...form, car_color: e.target.value })} />
              </div>
              <div>
                <label className="label">Ishlab chiqarilgan yili</label>
                <input className="input" inputMode="numeric" value={form.car_year}
                  onChange={(e) => setForm({ ...form, car_year: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })} />
              </div>
            </div>
            {saveProfile.isError && <ErrorBlock message={apiError(saveProfile.error)} />}
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={saveProfile.isPending}
                onClick={() => saveProfile.mutate()}>
                {saveProfile.isPending ? "Saqlanmoqda…" : "Saqlash"}
              </button>
              <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                Bekor qilish
              </button>
            </div>
          </div>
        ) : (
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            {driver.full_name ? (
              <div className="text-xl font-semibold">{driver.full_name}</div>
            ) : null}
            <div className={driver.full_name ? "text-muted mt-0.5" : "text-xl font-semibold"}>
              {driver.car_model}
              <span className="font-mono"> · {driver.car_number}</span>
              {driver.car_color ? ` · ${driver.car_color}` : ""}
              {driver.car_year ? ` · ${driver.car_year}` : ""}
            </div>
            <div className="text-sm text-muted mt-1">★ {Number(driver.rating).toFixed(2)} · {driver.total_rides} sayohat</div>
            <div className="mt-2 flex items-center gap-2">
              <Badge tone={STATUS_TONE[driver.status]}>{driverStatusLabel[driver.status]}</Badge>
              {driver.is_online ? <Badge tone="green">onlayn</Badge> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={startEdit}>Tahrirlash</button>
            {driver.status !== "approved" && (
              <button className="btn btn-primary" disabled={moderate.isPending}
                onClick={() => moderate.mutate({ status: "approved" })}>Tasdiqlash</button>
            )}
            {driver.status !== "rejected" && (
              <button className="btn btn-ghost" disabled={moderate.isPending}
                onClick={() => {
                  const reason = window.prompt("Rad etish sababi?") ?? undefined;
                  moderate.mutate({ status: "rejected", reason });
                }}>Rad etish</button>
            )}
            {driver.status !== "suspended" && (
              <button className="btn btn-ghost" disabled={moderate.isPending}
                onClick={() => {
                  const reason = window.prompt("To'xtatib turish sababi?") ?? undefined;
                  moderate.mutate({ status: "suspended", reason });
                }}>To'xtatib turish</button>
            )}
            <button className="btn btn-ghost" disabled={block.isPending}
              onClick={() => block.mutate({ userId: driver.user_id, blocked: true })}>Hisobni bloklash</button>
          </div>
        </div>
        )}
        {moderate.isError && <ErrorBlock message={apiError(moderate.error)} />}
      </div>

      {/* Balance */}
      <div className="card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="font-semibold">Balans</h2>
            <div
              className={`mt-1 text-2xl font-bold tabular-nums ${
                driver.low_balance ? "text-red-600" : ""
              }`}
            >
              {formatSom(driver.balance)}
            </div>
            <div className="text-xs text-muted mt-1">
              Eng past chegara: {formatSom(-15000)}
              {driver.low_balance && (
                <span className="text-red-600">
                  {" "}
                  · buyurtma olish bloklangan
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Summa (so‘m)</label>
            <input
              className="input w-40 tabular-nums"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))}
              placeholder="Masalan 50000"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="label">Izoh (ixtiyoriy)</label>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Masalan naqd to‘ldirish"
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={deposit.isPending || !amount || Number(amount) === 0}
            onClick={() => deposit.mutate(Number(amount))}
          >
            {deposit.isPending ? "Saqlanmoqda…" : "To‘ldirish"}
          </button>
          <button
            className="btn btn-ghost"
            disabled={deposit.isPending || !amount || Number(amount) === 0}
            onClick={() => deposit.mutate(-Math.abs(Number(amount)))}
          >
            Yechish
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {[20000, 50000, 100000].map((v) => (
            <button
              key={v}
              className="btn btn-ghost !py-1 !px-3 text-xs"
              disabled={deposit.isPending}
              onClick={() => deposit.mutate(v)}
            >
              +{formatSom(v)}
            </button>
          ))}
        </div>
        {deposit.isError && (
          <div className="mt-3">
            <ErrorBlock message={apiError(deposit.error)} />
          </div>
        )}
        {deposit.data && (
          <p className="mt-3 text-sm text-green-600">
            Yangi balans: {formatSom(deposit.data.balance)}
          </p>
        )}
      </div>

      {/* Balance history */}
      <div className="card p-6">
        <h2 className="font-semibold mb-3">Balans tarixi</h2>
        {txs.isLoading ? (
          <LoadingBlock />
        ) : txs.isError ? (
          <ErrorBlock message={apiError(txs.error)} />
        ) : !txs.data || txs.data.length === 0 ? (
          <p className="text-sm text-muted">Hali tranzaksiyalar yo‘q.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b bg-gray-50/60">
                  <th className="px-3 py-2 font-medium">Sana</th>
                  <th className="px-3 py-2 font-medium">Turi</th>
                  <th className="px-3 py-2 font-medium">Yo‘nalish</th>
                  <th className="px-3 py-2 font-medium text-right">Sayohat narxi</th>
                  <th className="px-3 py-2 font-medium text-right">%</th>
                  <th className="px-3 py-2 font-medium text-right">Summa</th>
                  <th className="px-3 py-2 font-medium text-right">Balans</th>
                </tr>
              </thead>
              <tbody>
                {txs.data.map((tx) => (
                  <tr key={tx.id} className="border-b last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-muted">
                      {formatDate(tx.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      {txTypeLabel[tx.tx_type] ?? tx.tx_type}
                    </td>
                    <td className="px-3 py-2 max-w-xs truncate">
                      {tx.from_address ? (
                        <span title={`${tx.from_address} → ${tx.to_address}`}>
                          {tx.from_address} → {tx.to_address}
                        </span>
                      ) : (
                        <span className="text-muted">
                          {tx.description ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {tx.ride_amount != null ? formatSom(tx.ride_amount) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted">
                      {tx.commission_pct != null
                        ? `${Number(tx.commission_pct).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold ${
                        tx.amount < 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {formatSom(tx.amount)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatSom(tx.balance_after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="card p-6">
        <h2 className="font-semibold mb-3">Hujjatlar</h2>

        {/* Upload slots — admin uploads on the driver's behalf */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.heic"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f && uploadType) uploadDoc.mutate({ type: uploadType, file: f });
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {REQUIRED_DOCS.map((type) => {
            const d = latestByType(type);
            const busy = uploadDoc.isPending && uploadType === type;
            return (
              <div
                key={type}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">{docTypeLabel[type]}</div>
                  {d ? (
                    <Badge
                      tone={
                        d.status === "approved"
                          ? "green"
                          : d.status === "rejected"
                            ? "red"
                            : "amber"
                      }
                    >
                      {docStatusLabel[d.status]}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted">yuklanmagan</span>
                  )}
                </div>
                <button
                  className="btn btn-ghost text-xs"
                  disabled={uploadDoc.isPending}
                  onClick={() => {
                    setUploadType(type);
                    fileRef.current?.click();
                  }}
                >
                  {busy ? "Yuklanmoqda…" : d ? "Qayta yuklash" : "Yuklash"}
                </button>
              </div>
            );
          })}
        </div>
        {uploadDoc.isError && (
          <div className="mb-4">
            <ErrorBlock message={apiError(uploadDoc.error)} />
          </div>
        )}

        {docs.isLoading ? (
          <LoadingBlock />
        ) : docs.isError ? (
          <ErrorBlock message={apiError(docs.error)} />
        ) : !docs.data || docs.data.length === 0 ? (
          <p className="text-sm text-muted">Hujjatlar yuklanmagan.</p>
        ) : (
          <ul className="divide-y">
            {docs.data.map((doc) => (
              <li key={doc.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-medium">{docTypeLabel[doc.doc_type]}</div>
                  <div className="text-xs text-muted">
                    Yuklandi {formatDate(doc.uploaded_at)}
                    {doc.reject_reason ? ` · ${doc.reject_reason}` : ""}
                  </div>
                  <a href={fileUrl(doc.file_url)} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                    Faylni ko'rish
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={doc.status === "approved" ? "green" : doc.status === "rejected" ? "red" : "amber"}>
                    {docStatusLabel[doc.status]}
                  </Badge>
                  {doc.status !== "approved" && (
                    <button className="btn btn-ghost text-xs" disabled={reviewDoc.isPending}
                      onClick={() => reviewDoc.mutate({ docId: doc.id, status: "approved" })}>Tasdiqlash</button>
                  )}
                  {doc.status !== "rejected" && (
                    <button className="btn btn-ghost text-xs" disabled={reviewDoc.isPending}
                      onClick={() => {
                        const reason = window.prompt("Rad etish sababi?") ?? undefined;
                        reviewDoc.mutate({ docId: doc.id, status: "rejected", reason });
                      }}>Rad etish</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function fileUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8001";
  return `${base}${path}`;
}

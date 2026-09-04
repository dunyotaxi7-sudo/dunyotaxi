"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { carTypesApi, driversApi, usersApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatNumber, formatPhone, formatSom } from "@/lib/format";
import { driverStatusLabel } from "@/lib/strings";
import type { DriverPublic, DriverStatus } from "@/lib/types";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";

// ── Filter / sort model ──────────────────────────────────────────────────

type StatusFilter = DriverStatus | "all";
type OnlineFilter = "all" | "online" | "offline";
type BalanceFilter = "all" | "negative" | "low" | "ok";
type BlockedFilter = "all" | "blocked" | "active";
type SortKey = "name" | "car" | "rating" | "rides" | "balance" | "status" | "online";
type SortDir = "asc" | "desc";
type BulkAction = "approve" | "suspend" | "block" | "unblock";

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: "Barchasi", value: "all" },
  { label: "Kutilmoqda", value: "pending" },
  { label: "Tasdiqlangan", value: "approved" },
  { label: "Rad etilgan", value: "rejected" },
  { label: "To'xtatilgan", value: "suspended" },
];

const STATUS_TONE: Record<DriverStatus, "green" | "amber" | "red" | "gray"> = {
  approved: "green",
  pending: "amber",
  rejected: "red",
  suspended: "gray",
};

const STATUS_ORDER: Record<DriverStatus, number> = {
  pending: 0,
  approved: 1,
  suspended: 2,
  rejected: 3,
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, "");
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function matchesSearch(d: DriverPublic, q: string): boolean {
  if (!q) return true;
  const nq = norm(q);
  const dq = digits(q);
  if (norm(d.full_name).includes(nq)) return true;
  if (norm(d.car_number).includes(nq)) return true;
  if (norm(d.car_model).includes(nq)) return true;
  if (dq.length >= 3 && digits(d.phone).includes(dq)) return true;
  return false;
}

function compare(a: DriverPublic, b: DriverPublic, key: SortKey): number {
  switch (key) {
    case "name":
      return (a.full_name ?? "").localeCompare(b.full_name ?? "", "uz");
    case "car":
      return a.car_model.localeCompare(b.car_model, "uz") || a.car_number.localeCompare(b.car_number);
    case "rating":
      return Number(a.rating) - Number(b.rating);
    case "rides":
      return a.total_rides - b.total_rides;
    case "balance":
      return a.balance - b.balance;
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case "online":
      return Number(a.is_online) - Number(b.is_online);
  }
}

function toCsv(rows: DriverPublic[], classLabel: (c: string) => string): string {
  const head = ["Ism", "Telefon", "Avtomobil", "Rang", "Raqam", "Tarif", "Reyting", "Sayohatlar", "Balans", "Holat", "Onlayn", "Bloklangan"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((d) =>
    [
      d.full_name, d.phone, d.car_model, d.car_color, d.car_number, classLabel(d.car_class),
      Number(d.rating).toFixed(2), d.total_rides, d.balance, driverStatusLabel[d.status],
      d.is_online ? "ha" : "yo'q", d.is_blocked ? "ha" : "yo'q",
    ].map(esc).join(";"),
  );
  return "﻿" + [head.join(";"), ...lines].join("\n");
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function DriversPage() {
  const qc = useQueryClient();

  // One fetch of everything; all filtering/sorting is client-side so it is
  // instant and works with the endpoints that exist today.
  const drivers = useQuery({
    queryKey: ["drivers", "all"],
    queryFn: () => driversApi.list(),
    refetchInterval: 30000,
  });
  const carTypes = useQuery({ queryKey: ["car-types"], queryFn: () => carTypesApi.list() });
  const classLabel = (code: string) =>
    carTypes.data?.find((t) => t.code === code)?.name_uz ?? code;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [online, setOnline] = useState<OnlineFilter>("all");
  const [carClass, setCarClass] = useState<string>("all");
  const [balance, setBalance] = useState<BalanceFilter>("all");
  const [blocked, setBlocked] = useState<BlockedFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const hasFilters =
    search !== "" || status !== "all" || online !== "all" || carClass !== "all" ||
    balance !== "all" || blocked !== "all";

  function clearFilters() {
    setSearch(""); setStatus("all"); setOnline("all"); setCarClass("all");
    setBalance("all"); setBlocked("all");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // Numeric columns read better high→low first.
      setSortDir(key === "rating" || key === "rides" || key === "balance" || key === "online" ? "desc" : "asc");
    }
  }

  const all = useMemo(() => drivers.data ?? [], [drivers.data]);

  const visible = useMemo(() => {
    const q = search.trim();
    const rows = all.filter((d) => {
      if (!matchesSearch(d, q)) return false;
      if (status !== "all" && d.status !== status) return false;
      if (online === "online" && !d.is_online) return false;
      if (online === "offline" && d.is_online) return false;
      if (carClass !== "all" && d.car_class !== carClass) return false;
      if (balance === "negative" && d.balance >= 0) return false;
      if (balance === "low" && !d.low_balance) return false;
      if (balance === "ok" && (d.low_balance || d.balance < 0)) return false;
      if (blocked === "blocked" && !d.is_blocked) return false;
      if (blocked === "active" && d.is_blocked) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compare(a, b, sortKey) * dir || (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  }, [all, search, status, online, carClass, balance, blocked, sortKey, sortDir]);

  // Quick numbers across the whole fleet (not just the filtered view).
  const stats = useMemo(() => ({
    total: all.length,
    online: all.filter((d) => d.is_online).length,
    pending: all.filter((d) => d.status === "pending").length,
    negative: all.filter((d) => d.balance < 0).length,
    blocked: all.filter((d) => d.is_blocked).length,
  }), [all]);

  const classOptions = useMemo(() => {
    const codes = Array.from(new Set(all.map((d) => d.car_class)));
    return codes.sort().map((c) => ({ code: c, label: classLabel(c) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, carTypes.data]);

  // ── Selection + bulk actions ─────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  // Drop ids that vanished from the list (e.g. after a refetch).
  useEffect(() => {
    if (!drivers.data) return;
    const ids = new Set(drivers.data.map((d) => d.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [drivers.data]);

  const allVisibleSelected = visible.length > 0 && visible.every((d) => selected.has(d.id));
  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((d) => next.delete(d.id));
      else visible.forEach((d) => next.add(d.id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedRows = useMemo(() => all.filter((d) => selected.has(d.id)), [all, selected]);

  const bulk = useMutation({
    mutationFn: async ({ action, reason }: { action: BulkAction; reason?: string }) => {
      const run = (d: DriverPublic) => {
        switch (action) {
          case "approve":
            return d.status === "approved" ? Promise.resolve() : driversApi.moderate(d.id, "approved");
          case "suspend":
            return d.status === "suspended" ? Promise.resolve() : driversApi.moderate(d.id, "suspended", reason);
          case "block":
            return d.is_blocked ? Promise.resolve() : usersApi.block(d.user_id, true, reason || "Administrator tomonidan bloklandi");
          case "unblock":
            return d.is_blocked ? usersApi.block(d.user_id, false) : Promise.resolve();
        }
      };
      const results = await Promise.allSettled(selectedRows.map(run));
      const failed = results.filter((r) => r.status === "rejected");
      return { ok: results.length - failed.length, failed: failed.length };
    },
    onSuccess: ({ ok, failed }) => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      setSelected(new Set());
      setNotice(`${ok} ta bajarildi${failed ? `, ${failed} ta xatolik` : ""}.`);
    },
  });

  function runBulk(action: BulkAction) {
    const n = selectedRows.length;
    if (!n) return;
    const labels: Record<BulkAction, string> = {
      approve: "tasdiqlash",
      suspend: "to'xtatish",
      block: "bloklash",
      unblock: "blokdan chiqarish",
    };
    let reason: string | undefined;
    if (action === "suspend" || action === "block") {
      const r = window.prompt(`${n} ta haydovchini ${labels[action]} sababi (ixtiyoriy):`, "");
      if (r === null) return; // cancelled
      reason = r.trim() || undefined;
    } else if (!window.confirm(`${n} ta haydovchini ${labels[action]}?`)) {
      return;
    }
    setNotice(null);
    bulk.mutate({ action, reason });
  }

  function exportCsv() {
    const csv = toCsv(visible, classLabel);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `haydovchilar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Quick stats */}
      <div className="flex flex-wrap gap-2 text-sm">
        <StatChip label="Jami" value={stats.total} />
        <StatChip label="Onlayn" value={stats.online} tone="green" onClick={() => setOnline(online === "online" ? "all" : "online")} active={online === "online"} />
        <StatChip label="Kutilmoqda" value={stats.pending} tone="amber" onClick={() => setStatus(status === "pending" ? "all" : "pending")} active={status === "pending"} />
        <StatChip label="Manfiy balans" value={stats.negative} tone="red" onClick={() => setBalance(balance === "negative" ? "all" : "negative")} active={balance === "negative"} />
        <StatChip label="Bloklangan" value={stats.blocked} tone="red" onClick={() => setBlocked(blocked === "blocked" ? "all" : "blocked")} active={blocked === "blocked"} />
      </div>

      {/* Toolbar */}
      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input flex-1 min-w-[220px]"
            placeholder="Qidirish: ism, telefon, davlat raqami, model…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input w-auto" value={online} onChange={(e) => setOnline(e.target.value as OnlineFilter)}>
            <option value="all">Onlayn: barchasi</option>
            <option value="online">Faqat onlayn</option>
            <option value="offline">Faqat oflayn</option>
          </select>
          <select className="input w-auto" value={carClass} onChange={(e) => setCarClass(e.target.value)}>
            <option value="all">Tarif: barchasi</option>
            {classOptions.map((c) => (
              <option key={c.code} value={c.code}>{c.label}</option>
            ))}
          </select>
          <select className="input w-auto" value={balance} onChange={(e) => setBalance(e.target.value as BalanceFilter)}>
            <option value="all">Balans: barchasi</option>
            <option value="negative">Manfiy (qarzdor)</option>
            <option value="low">Chegaradan past</option>
            <option value="ok">Normal</option>
          </select>
          <select className="input w-auto" value={blocked} onChange={(e) => setBlocked(e.target.value as BlockedFilter)}>
            <option value="all">Blok: barchasi</option>
            <option value="blocked">Bloklangan</option>
            <option value="active">Faol</option>
          </select>
          {hasFilters && (
            <button className="btn btn-ghost" onClick={clearFilters}>Tozalash</button>
          )}
          <div className="ml-auto flex gap-2">
            <button className="btn btn-ghost" onClick={exportCsv} disabled={visible.length === 0}>
              CSV ({visible.length})
            </button>
            <Link href="/drivers/new" className="btn btn-primary">+ Yangi haydovchi</Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatus(f.value)}
              className={`btn !py-1 !px-3 ${status === f.value ? "btn-primary" : "btn-ghost"}`}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted">
            {visible.length} / {all.length} ta haydovchi
          </span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedRows.length > 0 && (
        <div className="card p-3 flex flex-wrap items-center gap-2 border-primary/40 bg-[var(--primary-soft)]">
          <span className="font-medium text-sm">{selectedRows.length} ta belgilandi</span>
          <button className="btn btn-primary !py-1 !px-3" disabled={bulk.isPending} onClick={() => runBulk("approve")}>Tasdiqlash</button>
          <button className="btn btn-ghost !py-1 !px-3" disabled={bulk.isPending} onClick={() => runBulk("suspend")}>To'xtatish</button>
          <button className="btn btn-ghost !py-1 !px-3" disabled={bulk.isPending} onClick={() => runBulk("block")}>Bloklash</button>
          <button className="btn btn-ghost !py-1 !px-3" disabled={bulk.isPending} onClick={() => runBulk("unblock")}>Blokdan chiqarish</button>
          <button className="btn btn-ghost !py-1 !px-3 ml-auto" onClick={() => setSelected(new Set())}>Bekor qilish</button>
          {bulk.isPending && <span className="text-xs text-muted">Bajarilmoqda…</span>}
        </div>
      )}
      {notice && (
        <div className="text-sm text-muted">{notice}</div>
      )}
      {bulk.isError && <ErrorBlock message={apiError(bulk.error)} />}

      {/* Table */}
      {drivers.isLoading ? (
        <LoadingBlock />
      ) : drivers.isError ? (
        <ErrorBlock message={apiError(drivers.error)} />
      ) : visible.length === 0 ? (
        <EmptyState message={hasFilters ? "Bu filtrlarga mos haydovchi topilmadi." : "Haydovchilar hali yo'q."} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b bg-gray-50/60">
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Barchasini belgilash" />
                  </th>
                  <Th label="Haydovchi" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Avtomobil" k="car" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-medium">Raqam</th>
                  <th className="px-4 py-3 font-medium">Tarif</th>
                  <Th label="Reyting" k="rating" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Sayohatlar" k="rides" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Balans" k="balance" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Holat" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Onlayn" k="online" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((d) => (
                  <tr
                    key={d.id}
                    className={`border-b last:border-0 hover:bg-gray-50/60 ${selected.has(d.id) ? "bg-[var(--primary-soft)]" : ""}`}
                  >
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleOne(d.id)} aria-label="Belgilash" />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/drivers/${d.id}`} className="font-medium hover:underline">
                        {d.full_name ?? "—"}
                      </Link>
                      <div className="text-muted text-xs font-mono">{formatPhone(d.phone)}</div>
                    </td>
                    <td className="px-4 py-3">
                      {d.car_model}
                      {d.car_color ? <span className="text-muted"> · {d.car_color}</span> : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{d.car_number}</td>
                    <td className="px-4 py-3">{classLabel(d.car_class)}</td>
                    <td className="px-4 py-3">★ {Number(d.rating).toFixed(2)}</td>
                    <td className="px-4 py-3">{formatNumber(d.total_rides)}</td>
                    <td className="px-4 py-3">
                      <span className={`tabular-nums ${d.balance < 0 || d.low_balance ? "text-red-600 font-semibold" : ""}`}>
                        {formatSom(d.balance)}
                      </span>
                      {d.low_balance && (
                        <span className="ml-1 text-[11px] text-red-600">(chegaradan past)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={STATUS_TONE[d.status]}>{driverStatusLabel[d.status]}</Badge>
                        {d.is_blocked && <Badge tone="red">bloklangan</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {d.is_online ? <Badge tone="green">onlayn</Badge> : <span className="text-muted text-xs">oflayn</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/drivers/${d.id}`} className="text-primary hover:underline text-sm">Ko'rish</Link>
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

// ── Small pieces ─────────────────────────────────────────────────────────

function Th({
  label, k, sortKey, sortDir, onSort,
}: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-primary" : ""}`}
      >
        {label}
        <span className="text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function StatChip({
  label, value, tone, onClick, active,
}: {
  label: string; value: number; tone?: "green" | "amber" | "red"; onClick?: () => void; active?: boolean;
}) {
  const color =
    tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "";
  const Tag: "button" | "div" = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`card px-3 py-1.5 flex items-center gap-2 ${onClick ? "hover:bg-[var(--surface-2)] cursor-pointer" : ""} ${active ? "ring-2 ring-primary/50" : ""}`}
    >
      <span className="text-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
    </Tag>
  );
}

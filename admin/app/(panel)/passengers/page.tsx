"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { passengersApi, usersApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate, formatNumber, formatPhone } from "@/lib/format";
import type { PassengerRow } from "@/lib/types";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";

// ── Filter / sort model ──────────────────────────────────────────────────

type StatusFilter = "all" | "active" | "blocked";
type RidesFilter = "all" | "none" | "some" | "regular"; // 0 / 1+ / 5+
type JoinedFilter = "all" | "today" | "7d" | "30d";
type SortKey = "name" | "rides" | "joined" | "status";
type SortDir = "asc" | "desc";
type BulkAction = "block" | "unblock";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, "");
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function matchesSearch(p: PassengerRow, q: string): boolean {
  if (!q) return true;
  const nq = norm(q);
  const dq = digits(q);
  if (norm(p.full_name).includes(nq)) return true;
  if (dq.length >= 3 && digits(p.phone).includes(dq)) return true;
  return false;
}

// Server timestamps are naive UTC; treat a tz-less string as UTC.
function toMs(s: string | null | undefined): number {
  if (!s) return 0;
  const hasTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(s);
  const t = new Date(hasTz ? s : s + "Z").getTime();
  return Number.isNaN(t) ? 0 : t;
}

function compare(a: PassengerRow, b: PassengerRow, key: SortKey): number {
  switch (key) {
    case "name":
      return a.full_name.localeCompare(b.full_name, "uz");
    case "rides":
      return a.total_rides - b.total_rides;
    case "joined":
      return toMs(a.created_at) - toMs(b.created_at);
    case "status":
      return Number(a.is_blocked) - Number(b.is_blocked);
  }
}

function toCsv(rows: PassengerRow[]): string {
  const head = ["Ism", "Telefon", "Sayohatlar", "Qo'shilgan", "Holat"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((p) =>
    [p.full_name, p.phone, p.total_rides, formatDate(p.created_at), p.is_blocked ? "bloklangan" : "faol"]
      .map(esc).join(";"),
  );
  return "﻿" + [head.join(";"), ...lines].join("\n");
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function PassengersPage() {
  const qc = useQueryClient();

  // Fetch everything once; search/filter/sort are client-side so they are
  // instant and need no backend change.
  const passengers = useQuery({
    queryKey: ["passengers"],
    queryFn: () => passengersApi.list(),
    refetchInterval: 30000,
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [rides, setRides] = useState<RidesFilter>("all");
  const [joined, setJoined] = useState<JoinedFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("joined");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const hasFilters = search !== "" || status !== "all" || rides !== "all" || joined !== "all";
  function clearFilters() {
    setSearch(""); setStatus("all"); setRides("all"); setJoined("all");
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "rides" || key === "joined" ? "desc" : "asc");
    }
  }

  const all = useMemo(() => passengers.data ?? [], [passengers.data]);

  const visible = useMemo(() => {
    const q = search.trim();
    const now = Date.now();
    const day = 86_400_000;
    const since =
      joined === "today" ? new Date().setHours(0, 0, 0, 0)
      : joined === "7d" ? now - 7 * day
      : joined === "30d" ? now - 30 * day
      : 0;
    const rows = all.filter((p) => {
      if (!matchesSearch(p, q)) return false;
      if (status === "active" && p.is_blocked) return false;
      if (status === "blocked" && !p.is_blocked) return false;
      if (rides === "none" && p.total_rides !== 0) return false;
      if (rides === "some" && p.total_rides < 1) return false;
      if (rides === "regular" && p.total_rides < 5) return false;
      if (since && toMs(p.created_at) < since) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => compare(a, b, sortKey) * dir || a.full_name.localeCompare(b.full_name));
  }, [all, search, status, rides, joined, sortKey, sortDir]);

  const stats = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86_400_000;
    return {
      total: all.length,
      blocked: all.filter((p) => p.is_blocked).length,
      noRides: all.filter((p) => p.total_rides === 0).length,
      regular: all.filter((p) => p.total_rides >= 5).length,
      newWeek: all.filter((p) => toMs(p.created_at) >= weekAgo).length,
    };
  }, [all]);

  // ── Selection + bulk actions ─────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!passengers.data) return;
    const ids = new Set(passengers.data.map((p) => p.id));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [passengers.data]);

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((p) => next.delete(p.id));
      else visible.forEach((p) => next.add(p.id));
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
  const selectedRows = useMemo(() => all.filter((p) => selected.has(p.id)), [all, selected]);

  const bulk = useMutation({
    mutationFn: async ({ action, reason }: { action: BulkAction; reason?: string }) => {
      const run = (p: PassengerRow) =>
        action === "block"
          ? (p.is_blocked ? Promise.resolve() : usersApi.block(p.id, true, reason || "Administrator tomonidan bloklangan"))
          : (p.is_blocked ? usersApi.block(p.id, false) : Promise.resolve());
      const results = await Promise.allSettled(selectedRows.map(run));
      const failed = results.filter((r) => r.status === "rejected").length;
      return { ok: results.length - failed, failed };
    },
    onSuccess: ({ ok, failed }) => {
      qc.invalidateQueries({ queryKey: ["passengers"] });
      setSelected(new Set());
      setNotice(`${ok} ta bajarildi${failed ? `, ${failed} ta xatolik` : ""}.`);
    },
  });

  function runBulk(action: BulkAction) {
    const n = selectedRows.length;
    if (!n) return;
    let reason: string | undefined;
    if (action === "block") {
      const r = window.prompt(`${n} ta yo'lovchini bloklash sababi (ixtiyoriy):`, "");
      if (r === null) return;
      reason = r.trim() || undefined;
    } else if (!window.confirm(`${n} ta yo'lovchini blokdan chiqarish?`)) {
      return;
    }
    setNotice(null);
    bulk.mutate({ action, reason });
  }

  function exportCsv() {
    const blob = new Blob([toCsv(visible)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yolovchilar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <StatChip label="Jami" value={stats.total} />
        <StatChip label="Oxirgi 7 kun" value={stats.newWeek} tone="green" active={joined === "7d"} onClick={() => setJoined(joined === "7d" ? "all" : "7d")} />
        <StatChip label="Doimiy (5+)" value={stats.regular} tone="green" active={rides === "regular"} onClick={() => setRides(rides === "regular" ? "all" : "regular")} />
        <StatChip label="Sayohatsiz" value={stats.noRides} tone="amber" active={rides === "none"} onClick={() => setRides(rides === "none" ? "all" : "none")} />
        <StatChip label="Bloklangan" value={stats.blocked} tone="red" active={status === "blocked"} onClick={() => setStatus(status === "blocked" ? "all" : "blocked")} />
      </div>

      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input flex-1 min-w-[220px]"
            placeholder="Qidirish: ism yoki telefon…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            <option value="all">Holat: barchasi</option>
            <option value="active">Faol</option>
            <option value="blocked">Bloklangan</option>
          </select>
          <select className="input w-auto" value={rides} onChange={(e) => setRides(e.target.value as RidesFilter)}>
            <option value="all">Sayohatlar: barchasi</option>
            <option value="none">0 ta</option>
            <option value="some">1 va undan ko'p</option>
            <option value="regular">5 va undan ko'p</option>
          </select>
          <select className="input w-auto" value={joined} onChange={(e) => setJoined(e.target.value as JoinedFilter)}>
            <option value="all">Qo'shilgan: barchasi</option>
            <option value="today">Bugun</option>
            <option value="7d">Oxirgi 7 kun</option>
            <option value="30d">Oxirgi 30 kun</option>
          </select>
          {hasFilters && <button className="btn btn-ghost" onClick={clearFilters}>Tozalash</button>}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted">{visible.length} / {all.length}</span>
            <button className="btn btn-ghost" onClick={exportCsv} disabled={visible.length === 0}>CSV ({visible.length})</button>
            <Link href="/passengers/new" className="btn btn-primary">+ Yangi mijoz</Link>
          </div>
        </div>
      </div>

      {selectedRows.length > 0 && (
        <div className="card p-3 flex flex-wrap items-center gap-2 border-primary/40 bg-[var(--primary-soft)]">
          <span className="font-medium text-sm">{selectedRows.length} ta belgilandi</span>
          <button className="btn btn-ghost !py-1 !px-3" disabled={bulk.isPending} onClick={() => runBulk("block")}>Bloklash</button>
          <button className="btn btn-ghost !py-1 !px-3" disabled={bulk.isPending} onClick={() => runBulk("unblock")}>Blokdan chiqarish</button>
          <button className="btn btn-ghost !py-1 !px-3 ml-auto" onClick={() => setSelected(new Set())}>Bekor qilish</button>
          {bulk.isPending && <span className="text-xs text-muted">Bajarilmoqda…</span>}
        </div>
      )}
      {notice && <div className="text-sm text-muted">{notice}</div>}
      {bulk.isError && <ErrorBlock message={apiError(bulk.error)} />}

      {passengers.isLoading ? (
        <LoadingBlock />
      ) : passengers.isError ? (
        <ErrorBlock message={apiError(passengers.error)} />
      ) : visible.length === 0 ? (
        <EmptyState message={hasFilters ? "Bu filtrlarga mos yo'lovchi topilmadi." : "Yo'lovchilar hali yo'q."} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b bg-gray-50/60">
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Barchasini belgilash" />
                  </th>
                  <Th label="Ism" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-medium">Telefon</th>
                  <Th label="Sayohatlar" k="rides" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Qo'shilgan" k="joined" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Holat" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id} className={`border-b last:border-0 hover:bg-gray-50/60 ${selected.has(p.id) ? "bg-[var(--primary-soft)]" : ""}`}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} aria-label="Belgilash" />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/passengers/${p.id}`} className="font-medium hover:underline">{p.full_name}</Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{formatPhone(p.phone)}</td>
                    <td className="px-4 py-3 tabular-nums">{formatNumber(p.total_rides)}</td>
                    <td className="px-4 py-3 text-muted">{formatDate(p.created_at)}</td>
                    <td className="px-4 py-3">
                      {p.is_blocked ? <Badge tone="red">bloklangan</Badge> : <Badge tone="green">faol</Badge>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/passengers/${p.id}`} className="text-primary hover:underline">Ko'rish</Link>
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

function Th({ label, k, sortKey, sortDir, onSort }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th className="px-4 py-3 font-medium">
      <button type="button" onClick={() => onSort(k)} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-primary" : ""}`}>
        {label}
        <span className="text-[10px]">{active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

function StatChip({ label, value, tone, onClick, active }: {
  label: string; value: number; tone?: "green" | "amber" | "red"; onClick?: () => void; active?: boolean;
}) {
  const color = tone === "green" ? "text-green-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "";
  const Tag: "button" | "div" = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`card px-3 py-1.5 flex items-center gap-2 ${onClick ? "hover:bg-[var(--surface-2)] cursor-pointer" : ""} ${active ? "ring-2 ring-primary/50" : ""}`}>
      <span className="text-muted">{label}</span>
      <span className={`font-semibold tabular-nums ${color}`}>{value}</span>
    </Tag>
  );
}

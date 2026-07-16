"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { statsApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDay, formatNumber, formatSom } from "@/lib/format";
import { ErrorBlock, LoadingBlock, StatCard } from "@/components/ui";

export default function StatsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = {
    date_from: from ? new Date(from).toISOString() : undefined,
    date_to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
  };

  const overview = useQuery({
    queryKey: ["stats-overview", from, to],
    queryFn: () => statsApi.overview(params),
  });
  const daily = useQuery({
    queryKey: ["stats-daily-30"],
    queryFn: () => statsApi.ridesDaily(30),
  });

  const s = overview.data;
  const revenueSeries = daily.data?.map((d) => ({ day: formatDay(d.day), revenue: d.revenue_sum })) ?? [];
  const statusData = s
    ? [
        { name: "Yakunlangan", value: s.rides_completed },
        { name: "Bekor qilingan", value: s.rides_cancelled },
        { name: "Faol", value: s.rides_active },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Date range */}
      <div className="flex items-end gap-3">
        <div>
          <label className="label">Boshlanish</label>
          <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Tugash</label>
          <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {(from || to) && (
          <button className="btn btn-ghost" onClick={() => { setFrom(""); setTo(""); }}>Tozalash</button>
        )}
      </div>

      {overview.isLoading ? (
        <LoadingBlock />
      ) : overview.isError ? (
        <ErrorBlock message={apiError(overview.error)} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Jami sayohatlar" value={formatNumber(s?.rides_total ?? 0)} />
            <StatCard label="Yakunlangan" value={formatNumber(s?.rides_completed ?? 0)} />
            <StatCard label="Bekor qilingan" value={formatNumber(s?.rides_cancelled ?? 0)} />
            <StatCard label="Faol sayohatlar" value={formatNumber(s?.rides_active ?? 0)} />
            <StatCard label="Daromad" value={formatSom(s?.revenue_sum ?? 0)} accent />
            <StatCard label="Komissiya" value={formatSom(s?.commission_sum ?? 0)} />
            <StatCard label="Tasdiqlangan haydovchilar" value={formatNumber(s?.active_drivers ?? 0)} />
            <StatCard label="Onlayn haydovchilar" value={formatNumber(s?.online_drivers ?? 0)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue over time */}
            <div className="card p-5">
              <h2 className="font-semibold mb-4">Daromad (oxirgi 30 kun)</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueSeries} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} width={60} />
                    <Tooltip formatter={(v) => formatSom(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                    <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Rides by status */}
            <div className="card p-5">
              <h2 className="font-semibold mb-4">Sayohatlar holati bo'yicha</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusData} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6b7280" }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
                    <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

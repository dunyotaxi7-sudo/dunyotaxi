"use client";

import { useQuery } from "@tanstack/react-query";
import {
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
import { ErrorBlock, Skeleton, StatCard } from "@/components/ui";

function startOf(period: "day" | "week" | "month"): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "week") d.setDate(d.getDate() - 6);
  if (period === "month") d.setDate(d.getDate() - 29);
  return d.toISOString();
}

export default function DashboardPage() {
  const today = useQuery({
    queryKey: ["stats", "today"],
    queryFn: () => statsApi.overview({ date_from: startOf("day") }),
  });
  const week = useQuery({
    queryKey: ["stats", "week"],
    queryFn: () => statsApi.overview({ date_from: startOf("week") }),
  });
  const month = useQuery({
    queryKey: ["stats", "month"],
    queryFn: () => statsApi.overview({ date_from: startOf("month") }),
  });
  const live = useQuery({
    queryKey: ["stats", "live"],
    queryFn: () => statsApi.overview(),
    refetchInterval: 10_000,
  });
  const daily = useQuery({
    queryKey: ["stats", "daily", 30],
    queryFn: () => statsApi.ridesDaily(30),
  });

  const chartData =
    daily.data?.map((d) => ({
      day: formatDay(d.day),
      rides: d.rides,
      completed: d.completed,
    })) ?? [];

  return (
    <div className="space-y-6">
      {/* Top row — ride counts by period. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Bugungi sayohatlar"
          value={
            today.isLoading ? "…" : formatNumber(today.data?.rides_total ?? 0)
          }
        />
        <StatCard
          label="Bu haftadagi sayohatlar"
          value={
            week.isLoading ? "…" : formatNumber(week.data?.rides_total ?? 0)
          }
        />
        <StatCard
          label="Bu oydagi sayohatlar"
          value={
            month.isLoading ? "…" : formatNumber(month.data?.rides_total ?? 0)
          }
        />
        <StatCard
          label="Onlayn haydovchilar"
          value={
            live.isLoading ? "…" : formatNumber(live.data?.online_drivers ?? 0)
          }
          hint="Jonli · har 10 soniyada yangilanadi"
          accent
        />
      </div>

      {/* Second row — money. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Bugungi daromad"
          value={
            today.isLoading ? "…" : formatSom(today.data?.revenue_sum ?? 0)
          }
          hint="Yakunlangan sayohatlar"
        />
        <StatCard
          label="Bugungi komissiya"
          value={
            today.isLoading ? "…" : formatSom(today.data?.commission_sum ?? 0)
          }
        />
        <StatCard
          label="Tasdiqlangan haydovchilar"
          value={
            live.isLoading ? "…" : formatNumber(live.data?.active_drivers ?? 0)
          }
        />
      </div>

      {/* Chart. */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Kunlik sayohatlar</h2>
          <span className="text-xs text-muted">Oxirgi 30 kun</span>
        </div>

        {daily.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : daily.isError ? (
          <ErrorBlock message={apiError(daily.error)} />
        ) : chartData.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted">
            Oxirgi 30 kunda sayohatlar yo'q.
          </div>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 8, right: 12, bottom: 0, left: -12 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef0f3" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5e7eb" }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#6b7280" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    fontSize: 13,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rides"
                  name="Jami sayohatlar"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="completed"
                  name="Yakunlangan"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

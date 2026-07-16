"use client";

// Small shared presentational primitives used across pages.

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="card p-5 transition-shadow hover:shadow-[var(--shadow-md)]">
      <div className="text-[13px] font-medium text-muted">{label}</div>
      <div
        className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${
          accent ? "text-primary" : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const BADGE_TONE: Record<string, string> = {
  green: "bg-green-50 text-green-700 ring-green-600/15",
  red: "bg-red-50 text-red-700 ring-red-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/15",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/15",
  gray: "bg-gray-100 text-gray-600 ring-gray-500/15",
};

export function Badge({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: keyof typeof BADGE_TONE;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** Shimmer skeleton block. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-[var(--surface-2)] ${className}`}
    />
  );
}

/** Loading placeholder — a skeleton table by default. */
export function LoadingBlock({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="divide-y divide-[var(--border)]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-16 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="card p-5 border-red-200 bg-red-50/50">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-red-500">⚠</span>
        <div className="text-sm text-red-700">{message}</div>
      </div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card p-12 text-center">
      <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-[var(--surface-2)] flex items-center justify-center text-muted">
        —
      </div>
      <div className="text-sm text-muted">{message}</div>
    </div>
  );
}

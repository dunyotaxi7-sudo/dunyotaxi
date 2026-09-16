"use client";

// Searchable driver picker. Replaces the plain <select> that listed every
// approved driver: with 50+ drivers an operator had to eyeball a flat list to
// find one plate. Here they type a phone, a plate, a tariff or a model.
import { useId, useMemo, useRef, useState } from "react";
import { formatPhone } from "@/lib/format";
import { matchesDriverSearch } from "@/lib/driverSearch";
import type { DriverPublic } from "@/lib/types";
import { Badge } from "@/components/ui";

const PLACEHOLDER = "Qidirish: telefon, davlat raqami, tarif, model…";

export function DriverPicker({
  drivers,
  value,
  onChange,
  loading = false,
  classLabel,
  placeholder = PLACEHOLDER,
}: {
  drivers: DriverPublic[];
  /** Selected driver id, or "" for none. */
  value: string;
  onChange: (driverId: string) => void;
  loading?: boolean;
  /** Maps a tariff code to its Uzbek label; also widens what search matches. */
  classLabel?: (code: string) => string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => drivers.find((d) => d.id === value) ?? null,
    [drivers, value],
  );

  // Online drivers first — they're the only ones who can take an offer — then
  // the best rated, then by plate so the order never jitters between refetches.
  const results = useMemo(() => {
    const rows = drivers.filter((d) => matchesDriverSearch(d, query, classLabel));
    return rows.sort(
      (a, b) =>
        Number(b.is_online) - Number(a.is_online) ||
        Number(b.rating) - Number(a.rating) ||
        a.car_number.localeCompare(b.car_number),
    );
  }, [drivers, query, classLabel]);

  function choose(driver: DriverPublic) {
    onChange(driver.id);
    setQuery("");
    setActive(0);
  }

  // Keep the highlighted row in view when arrowing past the visible window.
  function scrollActiveIntoView(index: number) {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (results.length === 0) return;
      const next =
        e.key === "ArrowDown"
          ? (active + 1) % results.length
          : (active - 1 + results.length) % results.length;
      setActive(next);
      scrollActiveIntoView(next);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const pick = results[active];
      if (pick) choose(pick);
      return;
    }
    if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
      setActive(0);
    }
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {selected.car_model} · {selected.car_number}
          </div>
          <div className="text-xs text-muted truncate">
            {formatPhone(selected.phone)} ·{" "}
            {classLabel?.(selected.car_class) ?? selected.car_class} · ★{" "}
            {Number(selected.rating).toFixed(1)}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selected.is_online ? (
            <Badge tone="green">onlayn</Badge>
          ) : (
            <span className="text-muted text-xs">oflayn</span>
          )}
          <button
            type="button"
            className="btn btn-ghost text-xs"
            onClick={() => onChange("")}
          >
            O‘zgartirish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        className="input"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          results[active] ? `${listId}-${active}` : undefined
        }
      />

      {loading ? (
        <div className="px-3 py-2 text-sm text-muted">Yuklanmoqda…</div>
      ) : results.length === 0 ? (
        <div className="px-3 py-2 text-sm text-muted">
          Haydovchi topilmadi.
        </div>
      ) : (
        <>
          <div
            id={listId}
            ref={listRef}
            role="listbox"
            className="max-h-64 overflow-auto rounded-lg border border-border p-1"
          >
            {results.map((d, i) => (
              <button
                key={d.id}
                id={`${listId}-${i}`}
                data-index={i}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(d)}
                className={`block w-full text-left px-3 py-2 rounded-md ${
                  i === active ? "bg-[var(--surface-2)]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {d.car_model} · {d.car_number}
                  </span>
                  {d.is_online ? (
                    <Badge tone="green">onlayn</Badge>
                  ) : (
                    <span className="text-muted text-xs shrink-0">oflayn</span>
                  )}
                </div>
                <div className="text-xs text-muted truncate">
                  {formatPhone(d.phone)} ·{" "}
                  {classLabel?.(d.car_class) ?? d.car_class} · ★{" "}
                  {Number(d.rating).toFixed(1)}
                </div>
              </button>
            ))}
          </div>
          <div className="text-xs text-muted">
            {results.length} ta haydovchi
            {results.length !== drivers.length ? ` (${drivers.length} tadan)` : ""}
          </div>
        </>
      )}
    </div>
  );
}

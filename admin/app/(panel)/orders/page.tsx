"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { driversApi, ordersApi, passengersApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatPhone, formatSom } from "@/lib/format";
import { rideStatusLabel } from "@/lib/strings";
import type { ConnectMode } from "@/lib/types";
import { OrderLocationPicker, type Loc } from "@/components/OrderLocationPicker";
import { ErrorBlock } from "@/components/ui";

type SelectedClient = { id: string; full_name: string; phone: string };

const MODES: { value: ConnectMode; label: string; hint: string }[] = [
  {
    value: "auto",
    label: "Avtomatik",
    hint: "Eng yaqin onlayn haydovchiga yuboriladi",
  },
  {
    value: "offer",
    label: "Taklif qilish",
    hint: "Tanlangan haydovchiga taklif; rad etsa — eng yaqiniga",
  },
  {
    value: "assign",
    label: "Biriktirish",
    hint: "Tanlangan haydovchiga to‘g‘ridan-to‘g‘ri (tasdiqsiz)",
  },
];

export default function OrdersPage() {
  const [pickup, setPickup] = useState<Loc | null>(null);
  const [destination, setDestination] = useState<Loc | null>(null);
  const [mode, setMode] = useState<ConnectMode>("auto");
  const [driverId, setDriverId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Approved drivers for the dropdown (online first).
  const drivers = useQuery({
    queryKey: ["drivers", "approved"],
    queryFn: () => driversApi.list("approved"),
  });
  const driverOptions = useMemo(() => {
    const list = drivers.data ?? [];
    return [...list].sort((a, b) => Number(b.is_online) - Number(a.is_online));
  }, [drivers.data]);

  // Client picker — search existing clients by name/phone (debounced).
  const [selected, setSelected] = useState<SelectedClient | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(clientSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [clientSearch]);
  const clientResults = useQuery({
    queryKey: ["client-search", debounced],
    queryFn: () => passengersApi.list(debounced),
    enabled: !selected && debounced.length >= 2,
  });

  const create = useMutation({
    mutationFn: () =>
      ordersApi.create({
        passenger_id: selected!.id,
        pickup: pickup!,
        destination: destination!,
        connect_mode: mode,
        driver_id: mode === "auto" ? null : driverId || null,
      }),
  });

  function submit() {
    setFormError(null);
    if (!selected) return setFormError("Mijozni tanlang.");
    if (!pickup) return setFormError("Olib ketish manzilini tanlang.");
    if (!destination) return setFormError("Borish manzilini tanlang.");
    if (mode !== "auto" && !driverId)
      return setFormError("Haydovchini tanlang.");
    create.mutate();
  }

  const result = create.data;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Passenger — pick an existing client */}
      <section className="card p-5 space-y-3">
        <h3 className="font-semibold">Yo‘lovchi</h3>
        {selected ? (
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <div>
              <div className="text-sm font-medium">{selected.full_name}</div>
              <div className="text-xs text-muted">
                {formatPhone(selected.phone)}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => {
                setSelected(null);
                setClientSearch("");
              }}
            >
              O‘zgartirish
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              className="input"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              placeholder="Telefon yoki ism bo‘yicha qidiring…"
            />
            {debounced.length >= 2 && (
              <div className="absolute z-20 mt-1 w-full card p-1 max-h-64 overflow-auto shadow-[var(--shadow-md)]">
                {clientResults.isFetching ? (
                  <div className="px-3 py-2 text-sm text-muted">Qidirilmoqda…</div>
                ) : clientResults.data && clientResults.data.length > 0 ? (
                  clientResults.data.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelected({
                          id: c.id,
                          full_name: c.full_name,
                          phone: c.phone,
                        })
                      }
                      className="block w-full text-left px-3 py-2 rounded-md hover:bg-[var(--surface-2)]"
                    >
                      <div className="text-sm font-medium">{c.full_name}</div>
                      <div className="text-xs text-muted">
                        {formatPhone(c.phone)}
                        {c.is_blocked ? " · bloklangan" : ""}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-muted">
                    Mijoz topilmadi.{" "}
                    <Link
                      href="/passengers/new"
                      className="text-primary hover:underline"
                    >
                      Mijozlar sahifasida yarating
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Route */}
      <section className="card p-5 space-y-3">
        <h3 className="font-semibold">Manzillar</h3>
        <OrderLocationPicker
          pickup={pickup}
          destination={destination}
          onChange={(which, loc) =>
            which === "pickup" ? setPickup(loc) : setDestination(loc)
          }
        />
      </section>

      {/* Driver connection */}
      <section className="card p-5 space-y-4">
        <h3 className="font-semibold">Haydovchiga ulash</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={`text-left rounded-lg border p-3 transition-colors ${
                mode === m.value
                  ? "border-primary bg-[var(--primary-soft)]"
                  : "border-border hover:bg-[var(--surface-2)]"
              }`}
            >
              <div className="text-sm font-semibold">{m.label}</div>
              <div className="text-xs text-muted mt-1">{m.hint}</div>
            </button>
          ))}
        </div>

        {mode !== "auto" && (
          <div>
            <label className="label">Haydovchi</label>
            <select
              className="input"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
            >
              <option value="">— Haydovchini tanlang —</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.car_model} · {d.car_number} ·{" "}
                  {d.is_online ? "onlayn" : "oflayn"} · ★{" "}
                  {Number(d.rating).toFixed(1)}
                </option>
              ))}
            </select>
            {mode === "offer" && (
              <p className="text-xs text-muted mt-1">
                Faqat onlayn haydovchi taklifni oladi.
              </p>
            )}
          </div>
        )}
      </section>

      {formError && <ErrorBlock message={formError} />}
      {create.isError && <ErrorBlock message={apiError(create.error)} />}

      <div className="flex items-center gap-3">
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={create.isPending}
        >
          {create.isPending ? "Yuborilmoqda…" : "Buyurtma yaratish"}
        </button>
        {result && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              create.reset();
              setPickup(null);
              setDestination(null);
              setDriverId("");
              setSelected(null);
              setClientSearch("");
            }}
          >
            Yangi buyurtma
          </button>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className="card p-5 border-green-200 bg-green-50/50 space-y-1">
          <div className="text-sm font-semibold text-green-700">
            Buyurtma yaratildi ✓
          </div>
          <div className="text-sm text-foreground/80">
            Holat: <b>{rideStatusLabel[result.status] ?? result.status}</b> ·
            Narx: <b>{formatSom(result.price_sum)}</b>
          </div>
          <div className="text-sm text-foreground/80">
            Yo‘lovchi: {result.passenger_name} ({result.passenger_phone})
          </div>
          <div className="text-xs text-muted">Sayohat ID: {result.ride_id}</div>
        </div>
      )}
    </div>
  );
}

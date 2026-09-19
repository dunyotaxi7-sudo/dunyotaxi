"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { carTypesApi, driversApi, ordersApi, passengersApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatPhone, formatSom, toUzPhone } from "@/lib/format";
import { rideStatusLabel } from "@/lib/strings";
import type { ConnectMode } from "@/lib/types";
import { DriverPicker } from "@/components/DriverPicker";
import { OrderLocationPicker, type Loc } from "@/components/OrderLocationPicker";
import { RequestLocationPrompt } from "@/components/RequestLocationPrompt";
import { ErrorBlock } from "@/components/ui";

type SelectedClient = {
  /** null for a caller we are about to create along with the order. */
  id: string | null;
  full_name: string;
  phone: string;
  role: string;
};

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

  // Approved drivers for the picker (it sorts online-first itself).
  const drivers = useQuery({
    queryKey: ["drivers", "approved"],
    queryFn: () => driversApi.list("approved"),
  });
  const driverOptions = useMemo(() => drivers.data ?? [], [drivers.data]);

  // Tariff names, so the picker can be searched by "biznes"/"komfort" too.
  const carTypes = useQuery({
    queryKey: ["car-types"],
    queryFn: () => carTypesApi.list(),
  });
  const classLabel = useCallback(
    (code: string) =>
      carTypes.data?.find((t) => t.code === code)?.name_uz ?? code,
    [carTypes.data],
  );

  // Client picker — search existing clients by name/phone (debounced).
  const [selected, setSelected] = useState<SelectedClient | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(clientSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [clientSearch]);
  // Deliberately does NOT search drivers: one number, one purpose — the API
  // refuses an order for a number that drives, so offering one here would only
  // let an operator pick a client the order then fails on.
  const clientResults = useQuery({
    queryKey: ["client-search", debounced],
    queryFn: () => passengersApi.list(debounced),
    enabled: !selected && debounced.length >= 2,
  });

  // A repeat caller orders from the same place nearly every time, so their own
  // history is the fastest pickup entry there is — no typing, no map. Only for
  // an existing client: a caller being created with this order has no history.
  const recentPickups = useQuery({
    queryKey: ["recent-pickups", selected?.id],
    queryFn: () => passengersApi.recentPickups(selected!.id!),
    enabled: Boolean(selected?.id),
    staleTime: 60_000,
  });

  // "93 264 22 33", "+998 93 264 22 33" and "932642233" all normalise to the
  // one form the database stores; anything else is a name, not a number.
  const newCallerPhone = toUzPhone(debounced);

  const create = useMutation({
    mutationFn: () =>
      ordersApi.create({
        // An unregistered caller is created by the same request that takes
        // their order — no detour to the Clients page mid-call.
        ...(selected!.id
          ? { passenger_id: selected!.id }
          : {
              passenger_phone: selected!.phone,
              ...(selected!.full_name ? { passenger_name: selected!.full_name } : {}),
            }),
        pickup: pickup!,
        // No destination → metered: priced from the distance actually driven.
        destination: destination,
        connect_mode: mode,
        driver_id: mode === "auto" ? null : driverId || null,
      }),
  });

  function submit() {
    setFormError(null);
    if (!selected) return setFormError("Mijozni tanlang.");
    if (!pickup) return setFormError("Olib ketish manzilini tanlang.");
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
            <div className="min-w-0 flex-1">
              {selected.id ? (
                <div className="text-sm font-medium">{selected.full_name}</div>
              ) : (
                // New caller: the name is optional, so offer it rather than
                // demand it. Left blank, the account gets the same placeholder
                // the app uses for an OTP signup that skipped it.
                <input
                  className="input h-8 text-sm"
                  value={selected.full_name}
                  onChange={(e) =>
                    setSelected({ ...selected, full_name: e.target.value })
                  }
                  placeholder="Ism (ixtiyoriy)"
                />
              )}
              <div className="text-xs text-muted mt-0.5">
                {formatPhone(selected.phone)}
                {selected.role === "driver" ? " · haydovchi" : ""}
                {selected.id ? "" : " · yangi mijoz"}
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
                          role: c.role,
                        })
                      }
                      className="block w-full text-left px-3 py-2 rounded-md hover:bg-[var(--surface-2)]"
                    >
                      <div className="text-sm font-medium">{c.full_name}</div>
                      <div className="text-xs text-muted">
                        {formatPhone(c.phone)}
                        {c.role === "driver" ? " · haydovchi" : ""}
                        {c.is_blocked ? " · bloklangan" : ""}
                      </div>
                    </button>
                  ))
                ) : newCallerPhone ? (
                  // The common call-centre case: an unknown number. Pick it
                  // here and the account is created with the order itself.
                  <button
                    type="button"
                    onClick={() =>
                      setSelected({
                        id: null,
                        full_name: "",
                        phone: newCallerPhone,
                        role: "passenger",
                      })
                    }
                    className="block w-full text-left px-3 py-2 rounded-md hover:bg-[var(--surface-2)]"
                  >
                    <div className="text-sm font-medium text-primary">
                      + {formatPhone(newCallerPhone)} bilan yangi mijoz
                    </div>
                    <div className="text-xs text-muted">
                      Buyurtma bilan birga yaratiladi — ismni keyin qo‘shsa
                      ham bo‘ladi
                    </div>
                  </button>
                ) : (
                  <div className="px-3 py-2 text-sm text-muted">
                    Mijoz topilmadi. Telefon raqamini to‘liq kiriting yoki{" "}
                    <Link
                      href="/passengers/new"
                      className="text-primary hover:underline"
                    >
                      mijozlar sahifasida yarating
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
        {/* Telefon orqali chaqirgan mijozdan joylashuvni so'rash. */}
        <RequestLocationPrompt
          key={selected?.id ?? "no-client"}
          passengerId={selected?.id ?? null}
          onLocation={setPickup}
        />
        {(recentPickups.data?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Avvalgi manzillari:</span>
            {recentPickups.data!.map((p) => (
              <button
                key={`${p.address}-${p.lat}-${p.lng}`}
                type="button"
                title={p.address}
                onClick={() =>
                  setPickup({ lat: p.lat, lng: p.lng, address: p.address })
                }
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-[var(--surface-2)] max-w-[240px] truncate"
              >
                {p.address}
              </button>
            ))}
          </div>
        )}

        {!destination && pickup && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
            Borish manzili tanlanmagan — <b>hisoblagichli buyurtma</b>. Narx
            oldindan aytilmaydi, sayohat oxirida bosib o‘tilgan masofa bo‘yicha
            hisoblanadi.
          </div>
        )}

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
            <DriverPicker
              drivers={driverOptions}
              value={driverId}
              onChange={setDriverId}
              loading={drivers.isLoading}
              classLabel={classLabel}
            />
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
            Holat: <b>{rideStatusLabel[result.status] ?? result.status}</b> ·{" "}
            {result.fare_mode === "meter" ? (
              <>
                Narx: <b>hisoblagich bo‘yicha</b> (sayohat oxirida)
              </>
            ) : (
              <>
                Narx: <b>{formatSom(result.price_sum)}</b>
              </>
            )}
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

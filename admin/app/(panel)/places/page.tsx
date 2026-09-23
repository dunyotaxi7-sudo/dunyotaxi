"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { placesApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { OrderLocationPicker, type Loc } from "@/components/OrderLocationPicker";
import { ErrorBlock } from "@/components/ui";
import type { Place } from "@/lib/types";

export default function PlacesPage() {
  const qc = useQueryClient();

  // Search the list, not the map: an operator checking whether somewhere is
  // already saved types its name, and duplicates are the thing to catch.
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const [includeInactive, setIncludeInactive] = useState(true);

  const places = useQuery({
    queryKey: ["places", "admin", debounced, includeInactive],
    queryFn: () => placesApi.list(debounced || undefined, includeInactive),
  });

  // One form does both jobs: empty it creates, loaded with a place it edits.
  // Renaming and moving the pin are the same gesture either way.
  const [editing, setEditing] = useState<Place | null>(null);
  const [name, setName] = useState("");
  const [point, setPoint] = useState<Loc | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function clearForm() {
    setEditing(null);
    setName("");
    setPoint(null);
    setFormError(null);
    save.reset();
  }

  function loadForEdit(p: Place) {
    setEditing(p);
    setName(p.name);
    setPoint({ lat: p.lat, lng: p.lng, address: p.address ?? "" });
    setFormError(null);
    save.reset();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const save = useMutation({
    mutationFn: () =>
      editing
        ? placesApi.update(editing.id, {
            name: name.trim(),
            lat: point!.lat,
            lng: point!.lng,
            address: point!.address || null,
          })
        : placesApi.create({
            name: name.trim(),
            lat: point!.lat,
            lng: point!.lng,
            address: point!.address || null,
          }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["places"] });
      clearForm();
    },
  });

  const toggleActive = useMutation({
    mutationFn: (p: Place) => placesApi.update(p.id, { is_active: !p.is_active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["places"] }),
  });

  const remove = useMutation({
    mutationFn: (p: Place) => placesApi.remove(p.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["places"] });
      clearForm();
    },
  });

  function submit() {
    setFormError(null);
    if (name.trim().length < 2) return setFormError("Joy nomini yozing.");
    if (!point) return setFormError("Xaritada nuqtani belgilang.");
    save.mutate();
  }

  const rows = places.data ?? [];

  return (
    <div className="max-w-3xl space-y-5">
      <section className="card p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">
              {editing ? "Joyni tahrirlash" : "Yangi joy qo‘shish"}
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Nomni mijoz aytgandek yozing — haydovchi aynan shu nomni ko‘radi.
            </p>
          </div>
          {editing && (
            <button className="btn btn-ghost text-xs" onClick={clearForm}>
              Bekor qilish
            </button>
          )}
        </div>

        <div>
          <label className="label">Nomi</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Masalan: Tibbiyot kolleji"
          />
        </div>

        <OrderLocationPicker
          single
          pickupLabel="Joyning nuqtasi"
          pickup={point}
          destination={null}
          onChange={(_which, loc) => setPoint(loc)}
          onClear={() => setPoint(null)}
        />

        {formError && <ErrorBlock message={formError} />}
        {save.isError && <ErrorBlock message={apiError(save.error)} />}

        <div className="flex justify-end">
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={save.isPending}
          >
            {save.isPending
              ? "Saqlanmoqda…"
              : editing
                ? "O‘zgarishlarni saqlash"
                : "Joyni saqlash"}
          </button>
        </div>
      </section>

      <section className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Saqlangan joylar</h3>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Faolsizlarni ham ko‘rsatish
          </label>
        </div>

        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nomi bo‘yicha qidiring…"
        />

        {places.isLoading ? (
          <div className="text-sm text-muted">Yuklanmoqda…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted">
            {debounced
              ? "Bunday nomli joy topilmadi."
              : "Hali joy saqlanmagan. Yuqorida birinchisini qo‘shing."}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    ★ {p.name}
                    {!p.is_active && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
                        faolsiz
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {p.address || "—"} · {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                  </div>
                </div>
                <button
                  className="btn btn-ghost text-xs"
                  onClick={() => loadForEdit(p)}
                >
                  Tahrirlash
                </button>
                <button
                  className="btn btn-ghost text-xs"
                  onClick={() => toggleActive.mutate(p)}
                  disabled={toggleActive.isPending}
                >
                  {p.is_active ? "Faolsizlantirish" : "Faollashtirish"}
                </button>
                <button
                  className="btn btn-ghost text-xs text-red-600"
                  onClick={() => {
                    // Deleting is safe — rides keep their own copy of the name —
                    // but it is still someone else's list, so ask first.
                    if (confirm(`"${p.name}" o‘chirilsinmi?`)) remove.mutate(p);
                  }}
                  disabled={remove.isPending}
                >
                  O‘chirish
                </button>
              </li>
            ))}
          </ul>
        )}

        {(toggleActive.isError || remove.isError) && (
          <ErrorBlock
            message={apiError(toggleActive.error ?? remove.error)}
          />
        )}
      </section>
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { mapApi, serviceAreaApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { BUKHARA_CENTER, LiveMap, type MapMarker } from "@/components/LiveMap";
import { SERVICE_AREA_POLYGONS, geojsonToPolygons } from "@/lib/serviceArea";
import { ErrorBlock } from "@/components/ui";

export default function MapPage() {
  const qc = useQueryClient();

  const drivers = useQuery({
    queryKey: ["online-drivers"],
    queryFn: () => mapApi.onlineDrivers(),
    refetchInterval: 7_000,
  });

  // The service-area outline comes from the backend (DB) so admin uploads show.
  const area = useQuery({
    queryKey: ["service-area"],
    queryFn: () => serviceAreaApi.get(),
  });

  const markers: MapMarker[] = useMemo(
    () =>
      (drivers.data ?? []).map((d) => ({
        id: d.driver_id,
        position: { lat: d.lat, lng: d.lng },
        title: d.car_model ?? "Haydovchi",
        subtitle: d.car_number ?? undefined,
        status: d.rating != null ? `★ ${d.rating.toFixed(2)}` : undefined,
      })),
    [drivers.data],
  );

  const polygons = useMemo(
    () =>
      area.data ? geojsonToPolygons(area.data.geojson) : SERVICE_AREA_POLYGONS,
    [area.data],
  );

  // ── Upload a new boundary ──────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const geojson = JSON.parse(text);
      const name =
        geojson?.properties?.name ??
        geojson?.features?.[0]?.properties?.name ??
        file.name.replace(/\.(geo)?json$/i, "");
      return serviceAreaApi.update(geojson, name);
    },
    onSuccess: (res) => {
      setStatus(`“${res.name}” qo'llandi (${res.point_count} nuqta).`);
      qc.invalidateQueries({ queryKey: ["service-area"] });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e) =>
      setStatus(
        e instanceof SyntaxError ? "JSON noto'g'ri." : apiError(e),
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {drivers.data ? `${drivers.data.length} onlayn haydovchi` : "Yuklanmoqda…"}{" "}
          · har 7 soniyada yangilanadi
        </p>
      </div>

      {drivers.isError ? (
        <ErrorBlock message={apiError(drivers.error)} />
      ) : (
        <div className="card overflow-hidden" style={{ height: "68vh" }}>
          <LiveMap
            center={BUKHARA_CENTER}
            markers={markers}
            polygons={polygons}
            zoom={8}
          />
        </div>
      )}

      {/* Service-area management */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Xizmat hududi</h3>
            <p className="text-sm text-muted mt-0.5">
              {area.data
                ? `${area.data.name} · ${area.data.point_count} nuqta`
                : "Yuklanmoqda…"}{" "}
              — sayohatlar faqat shu chegara ichida ruxsat etiladi.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
              }}
            />
            <button
              className="btn btn-ghost"
              disabled={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              {upload.isPending ? "Yuklanmoqda…" : "Chegarani almashtirish (GeoJSON)"}
            </button>
          </div>
        </div>
        {status && (
          <p
            className={`mt-3 text-sm ${
              upload.isError ? "text-red-600" : "text-green-600"
            }`}
          >
            {status}
          </p>
        )}
      </div>
    </div>
  );
}

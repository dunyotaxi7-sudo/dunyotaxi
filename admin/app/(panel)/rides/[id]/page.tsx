"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ridesApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { formatDate, formatKm, formatSom } from "@/lib/format";
import { LiveMap, type MapMarker } from "@/components/LiveMap";
import { SERVICE_AREA_POLYGONS } from "@/lib/serviceArea";
import { Badge, ErrorBlock, LoadingBlock } from "@/components/ui";
import { label, paymentLabel, rideStatusLabel } from "@/lib/strings";

export default function RideDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-ride", id],
    queryFn: () => ridesApi.detail(id),
  });

  if (isLoading) return <LoadingBlock />;
  if (isError) return <ErrorBlock message={apiError(error)} />;
  const r = data!;

  const markers: MapMarker[] = [
    { id: "from", position: { lat: r.from_lat, lng: r.from_lng }, title: "Qabul qilish nuqtasi", subtitle: r.from_address },
    { id: "to", position: { lat: r.to_lat, lng: r.to_lng }, title: "Manzil", subtitle: r.to_address },
  ];
  const center = { lat: (r.from_lat + r.to_lat) / 2, lng: (r.from_lng + r.to_lng) / 2 };

  return (
    <div className="space-y-6">
      <Link href="/rides" className="text-sm text-primary hover:underline">← Sayohatlarga qaytish</Link>

      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Sayohat {r.id.slice(0, 8)}</h2>
        <Badge tone={r.status === "completed" ? "green" : r.status === "cancelled" ? "red" : "blue"}>
          {rideStatusLabel[r.status]}
        </Badge>
      </div>

      {/* Route map */}
      <div className="card overflow-hidden" style={{ height: "40vh" }}>
        <LiveMap
          center={center}
          markers={markers}
          route={[
            { lat: r.from_lat, lng: r.from_lng },
            { lat: r.to_lat, lng: r.to_lng },
          ]}
          polygons={SERVICE_AREA_POLYGONS}
          zoom={13}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Trip */}
        <div className="card p-6 space-y-2 text-sm">
          <h3 className="font-semibold mb-2">Sayohat</h3>
          <Row label="Qayerdan" value={r.from_address} />
          <Row label="Qayerga" value={r.to_address} />
          <Row label="Masofa" value={formatKm(r.distance_km)} />
          <Row label="Davomiylik" value={r.duration_min != null ? `${r.duration_min} daq` : "—"} />
          <Row label="Yaratilgan" value={formatDate(r.created_at)} />
          {r.completed_at ? <Row label="Yakunlangan" value={formatDate(r.completed_at)} /> : null}
          {r.status === "cancelled" ? (
            <Row label="Bekor qildi" value={`${r.cancelled_by ?? "—"}${r.cancel_reason ? ` · ${r.cancel_reason}` : ""}`} />
          ) : null}
        </div>

        {/* People */}
        <div className="card p-6 space-y-2 text-sm">
          <h3 className="font-semibold mb-2">Ishtirokchilar</h3>
          <Row label="Yo'lovchi" value={r.passenger_name ?? "—"} />
          <Row label="Yo'lovchi telefoni" value={r.passenger_phone ?? "—"} />
          <Row label="Haydovchi" value={r.driver_name ?? "—"} />
          <Row label="Haydovchi telefoni" value={r.driver_phone ?? "—"} />
          <Row label="Avtomobil" value={r.car_model ? `${r.car_model} · ${r.car_number}` : "—"} />
        </div>

        {/* Payment & commission */}
        <div className="card p-6 space-y-2 text-sm">
          <h3 className="font-semibold mb-2">To'lov va komissiya</h3>
          <Row label="Narx" value={formatSom(r.price_sum)} />
          <Row label="To'lov usuli" value={label(paymentLabel, r.payment_method)} />
          <Row label="To'lov holati" value={r.payment_status ?? "—"} />
          {r.commission_sum != null ? (
            <>
              <Row label={`Komissiya (${r.commission_pct ? Number(r.commission_pct).toFixed(0) : "—"}%)`} value={formatSom(r.commission_sum)} />
              <Row label="Haydovchi daromadi" value={formatSom(r.driver_earning)} />
            </>
          ) : null}
        </div>

        {/* Ratings */}
        <div className="card p-6 text-sm">
          <h3 className="font-semibold mb-2">Baholar</h3>
          {r.ratings.length === 0 ? (
            <div className="text-muted">Baholar yo'q.</div>
          ) : (
            <ul className="space-y-2">
              {r.ratings.map((rt, i) => (
                <li key={i} className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-amber-500">{"★".repeat(rt.score)}</span>
                    {rt.comment ? <div className="text-muted">{rt.comment}</div> : null}
                  </div>
                  <span className="text-xs text-muted">
                    {rt.from_role === "passenger" ? "Yo'lovchi" : "Haydovchi"} tomonidan
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { driversApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { driverStatusLabel } from "@/lib/strings";
import type { DriverStatus } from "@/lib/types";
import { ErrorBlock } from "@/components/ui";

const PHONE_RE = /^\+998\d{9}$/;
const STATUSES: DriverStatus[] = ["approved", "pending", "suspended"];

export default function NewDriverPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [phone, setPhone] = useState("+998");
  const [fullName, setFullName] = useState("");
  const [carModel, setCarModel] = useState("");
  const [carNumber, setCarNumber] = useState("");
  const [carColor, setCarColor] = useState("");
  const [carYear, setCarYear] = useState("");
  const [status, setStatus] = useState<DriverStatus>("approved");
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      driversApi.create({
        phone: phone.trim(),
        full_name: fullName.trim(),
        car_model: carModel.trim(),
        car_number: carNumber.trim(),
        car_color: carColor.trim() || undefined,
        car_year: carYear ? Number(carYear) : undefined,
        status,
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      router.push(`/drivers/${d.id}`);
    },
  });

  function onPhone(text: string) {
    let digits = text.replace(/[^\d]/g, "");
    if (digits.startsWith("998")) digits = digits.slice(3);
    setPhone("+998" + digits.slice(0, 9));
  }

  function submit() {
    setFormError(null);
    if (!PHONE_RE.test(phone.trim()))
      return setFormError("Telefon raqamini to‘g‘ri kiriting: +998XXXXXXXXX");
    if (!fullName.trim()) return setFormError("Ismni kiriting.");
    if (!carModel.trim()) return setFormError("Mashina modelini kiriting.");
    if (!carNumber.trim()) return setFormError("Davlat raqamini kiriting.");
    create.mutate();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/drivers" className="text-sm text-primary hover:underline">
        ← Orqaga
      </Link>

      <div className="card p-6 space-y-5">
        <h2 className="text-lg font-semibold">Yangi haydovchi</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Telefon raqami</label>
            <input
              className="input"
              value={phone}
              onChange={(e) => onPhone(e.target.value)}
              placeholder="+998901234567"
            />
          </div>
          <div>
            <label className="label">Ism</label>
            <input
              className="input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Masalan Vali Aliyev"
            />
          </div>
          <div>
            <label className="label">Mashina modeli</label>
            <input
              className="input"
              value={carModel}
              onChange={(e) => setCarModel(e.target.value)}
              placeholder="Masalan Chevrolet Cobalt"
            />
          </div>
          <div>
            <label className="label">Davlat raqami</label>
            <input
              className="input font-mono"
              value={carNumber}
              onChange={(e) => setCarNumber(e.target.value.toUpperCase())}
              placeholder="01 A 123 BA"
            />
          </div>
          <div>
            <label className="label">Rangi (ixtiyoriy)</label>
            <input
              className="input"
              value={carColor}
              onChange={(e) => setCarColor(e.target.value)}
              placeholder="Masalan oq"
            />
          </div>
          <div>
            <label className="label">Ishlab chiqarilgan yili (ixtiyoriy)</label>
            <input
              className="input"
              inputMode="numeric"
              value={carYear}
              onChange={(e) => setCarYear(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              placeholder="2022"
            />
          </div>
          <div>
            <label className="label">Holat</label>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as DriverStatus)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {driverStatusLabel[s]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {formError && <ErrorBlock message={formError} />}
        {create.isError && <ErrorBlock message={apiError(create.error)} />}

        <div className="flex items-center gap-3">
          <button
            className="btn btn-primary"
            onClick={submit}
            disabled={create.isPending}
          >
            {create.isPending ? "Saqlanmoqda…" : "Haydovchi yaratish"}
          </button>
          <Link href="/drivers" className="btn btn-ghost">
            Bekor qilish
          </Link>
        </div>
        <p className="text-xs text-muted">
          Bu raqamli foydalanuvchi bo‘lmasa, avtomatik yaratiladi va haydovchiga
          aylantiriladi.
        </p>
      </div>
    </div>
  );
}

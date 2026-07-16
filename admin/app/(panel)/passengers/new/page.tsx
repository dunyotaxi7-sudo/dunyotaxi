"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { passengersApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { ErrorBlock } from "@/components/ui";

const PHONE_RE = /^\+998\d{9}$/;

export default function NewPassengerPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const [phone, setPhone] = useState("+998");
  const [fullName, setFullName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      passengersApi.create({ phone: phone.trim(), full_name: fullName.trim() }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["passengers"] });
      router.push(`/passengers/${p.id}`);
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
    create.mutate();
  }

  return (
    <div className="max-w-xl space-y-5">
      <Link href="/passengers" className="text-sm text-primary hover:underline">
        ← Orqaga
      </Link>

      <div className="card p-6 space-y-5">
        <h2 className="text-lg font-semibold">Yangi mijoz</h2>

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
              placeholder="Masalan Ali Valiyev"
            />
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
            {create.isPending ? "Saqlanmoqda…" : "Mijoz yaratish"}
          </button>
          <Link href="/passengers" className="btn btn-ghost">
            Bekor qilish
          </Link>
        </div>
      </div>
    </div>
  );
}

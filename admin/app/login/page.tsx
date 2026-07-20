"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { useAuth } from "@/lib/auth-store";

type Step = "phone" | "code";

export default function LoginPage() {
  const router = useRouter();
  const { user, hydrated, hydrate, setSession } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+998");
  const [code, setCode] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => {
    if (hydrated && user) router.replace("/");
  }, [hydrated, user, router]);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\+998\d{9}$/.test(phone)) {
      setError("Telefon raqamini to'g'ri kiriting: +998XXXXXXXXX");
      return;
    }
    setLoading(true);
    try {
      const res = await authApi.requestOtp(phone);
      setDebugCode(res.debug_code ?? null);
      setStep("code");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.verifyOtp(phone, code.trim());
      if (res.user.role !== "admin") {
        setError("Bu hisob administrator emas.");
        setLoading(false);
        return;
      }
      setSession(res.access_token, res.refresh_token, res.user);
      router.replace("/");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold">Dunyo Taxi</div>
          <div className="text-sm text-muted mt-1">Boshqaruv paneli</div>
        </div>

        {step === "phone" ? (
          <form onSubmit={requestOtp} className="space-y-4">
            <div>
              <label className="label">Telefon raqami</label>
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998901234567"
                autoFocus
              />
            </div>
            <button className="btn btn-primary w-full" disabled={loading}>
              {loading ? "Yuborilmoqda…" : "Kodni yuborish"}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div>
              <label className="label">Tasdiqlash kodi</label>
              <input
                className="input tracking-[0.4em] text-center text-lg"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="••••••"
                inputMode="numeric"
                autoFocus
              />
              {debugCode && (
                <p className="text-xs text-muted mt-2">
                  Test kodi: <span className="font-mono">{debugCode}</span>
                </p>
              )}
            </div>
            <button className="btn btn-primary w-full" disabled={loading}>
              {loading ? "Tekshirilmoqda…" : "Kirish"}
            </button>
            <button
              type="button"
              className="btn btn-ghost w-full"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
            >
              Raqamni o'zgartirish
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
        )}
      </div>
    </div>
  );
}

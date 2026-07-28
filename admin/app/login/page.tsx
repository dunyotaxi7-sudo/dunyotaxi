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
  const [mode, setMode] = useState<"admin" | "operator">("admin");
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("+998");
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function operatorLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authApi.operatorLogin(username.trim(), password);
      const op = res.operator;
      setSession(res.access_token, res.refresh_token, {
        id: op.id,
        phone: null,
        full_name: op.full_name,
        role: "operator",
        avatar_url: null,
        is_active: op.is_active,
        is_blocked: false,
        permissions: op.permissions,
      });
      router.replace("/");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

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

        {/* Admin (phone/OTP) vs Operator (login/password) */}
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-[var(--surface-2)] p-1">
          {(["admin", "operator"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === m ? "bg-surface text-foreground shadow-sm" : "text-muted"
              }`}
            >
              {m === "admin" ? "Admin" : "Operator"}
            </button>
          ))}
        </div>

        {mode === "operator" ? (
          <form onSubmit={operatorLogin} className="space-y-4">
            <div>
              <label className="label">Login</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="operator1"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Parol</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <button className="btn btn-primary w-full" disabled={loading}>
              {loading ? "Tekshirilmoqda…" : "Kirish"}
            </button>
          </form>
        ) : step === "phone" ? (
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

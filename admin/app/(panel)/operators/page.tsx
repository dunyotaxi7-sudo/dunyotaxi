"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { operatorsApi } from "@/lib/api";
import { apiError } from "@/lib/axios";
import { useAuth } from "@/lib/auth-store";
import type { OperatorPermissions, OperatorPublic } from "@/lib/types";
import { Badge, EmptyState, ErrorBlock, LoadingBlock } from "@/components/ui";

const PERMS: { key: keyof OperatorPermissions; label: string }[] = [
  { key: "deposit", label: "Balans to'ldirish" },
  { key: "moderate_drivers", label: "Haydovchilarni tasdiqlash" },
  { key: "finance", label: "Komissiya va narxlar" },
];

const NO_PERMS: OperatorPermissions = {
  deposit: false,
  moderate_drivers: false,
  finance: false,
};

export default function OperatorsPage() {
  const qc = useQueryClient();
  const role = useAuth((s) => s.user?.role);
  const operators = useQuery({ queryKey: ["operators"], queryFn: () => operatorsApi.list() });

  // New-operator form.
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [perms, setPerms] = useState<OperatorPermissions>({ ...NO_PERMS });
  const [msg, setMsg] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["operators"] });

  const create = useMutation({
    mutationFn: () =>
      operatorsApi.create({ username: username.trim(), password, full_name: fullName.trim(), permissions: perms }),
    onSuccess: () => {
      setMsg("Operator qo'shildi");
      setUsername(""); setFullName(""); setPassword(""); setPerms({ ...NO_PERMS });
      invalidate();
      setTimeout(() => setMsg(null), 2500);
    },
  });

  if (role !== "admin") {
    return <ErrorBlock message="Bu bo'lim faqat administrator uchun." />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Operatorlar</h2>

      {/* Add operator */}
      <div className="card p-6 space-y-4">
        <h3 className="font-semibold">Yangi operator</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Login</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="operator1" />
          </div>
          <div>
            <label className="label">To'liq ism</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ism Familiya" />
          </div>
          <div>
            <label className="label">Parol</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="kamida 6 belgi" />
          </div>
        </div>
        <div>
          <label className="label">Ruxsatlar</label>
          <div className="flex flex-wrap gap-4 mt-1">
            {PERMS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={perms[p.key]}
                  onChange={(e) => setPerms({ ...perms, [p.key]: e.target.checked })}
                />
                {p.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted mt-1">
            Belgilanmagan amallardan tashqari operator hamma narsani boshqara oladi.
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={create.isPending || !username.trim() || !fullName.trim() || password.length < 6}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Saqlanmoqda…" : "Operator qo'shish"}
        </button>
        {msg && <div className="text-sm text-green-600">✓ {msg}</div>}
        {create.isError && <ErrorBlock message={apiError(create.error)} />}
      </div>

      {/* Existing operators */}
      {operators.isLoading ? (
        <LoadingBlock />
      ) : operators.isError ? (
        <ErrorBlock message={apiError(operators.error)} />
      ) : !operators.data?.length ? (
        <EmptyState message="Hozircha operator yo'q." />
      ) : (
        <div className="space-y-3">
          {operators.data.map((op) => (
            <OperatorRow key={op.id} op={op} onChange={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}

function OperatorRow({ op, onChange }: { op: OperatorPublic; onChange: () => void }) {
  const [pw, setPw] = useState("");
  const save = useMutation({
    mutationFn: (body: { permissions?: OperatorPermissions; is_active?: boolean }) =>
      operatorsApi.update(op.id, body),
    onSuccess: onChange,
  });
  const resetPw = useMutation({
    mutationFn: () => operatorsApi.setPassword(op.id, pw),
    onSuccess: () => { setPw(""); },
  });

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="font-medium">{op.full_name}</span>
          <span className="text-muted text-sm font-mono ml-2">@{op.username}</span>
        </div>
        <div className="flex items-center gap-3">
          {op.is_active ? <Badge tone="green">faol</Badge> : <Badge tone="gray">o'chirilgan</Badge>}
          <button
            className="btn btn-ghost btn-sm"
            disabled={save.isPending}
            onClick={() => save.mutate({ is_active: !op.is_active })}
          >
            {op.is_active ? "O'chirish" : "Faollashtirish"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        {PERMS.map((p) => (
          <label key={p.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={op.permissions[p.key]}
              disabled={save.isPending}
              onChange={(e) =>
                save.mutate({ permissions: { ...op.permissions, [p.key]: e.target.checked } })
              }
            />
            {p.label}
          </label>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div>
          <label className="label">Yangi parol</label>
          <input className="input w-48" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="kamida 6 belgi" />
        </div>
        <button
          className="btn btn-ghost"
          disabled={resetPw.isPending || pw.length < 6}
          onClick={() => resetPw.mutate()}
        >
          {resetPw.isPending ? "…" : resetPw.isSuccess ? "✓ Yangilandi" : "Parolni yangilash"}
        </button>
      </div>
      {(save.isError || resetPw.isError) && (
        <ErrorBlock message={apiError(save.error || resetPw.error)} />
      )}
    </div>
  );
}

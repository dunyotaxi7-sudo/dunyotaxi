"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-store";
import { formatPhone } from "@/lib/format";
import { Icon } from "@/components/icons";

const TITLES: Record<string, string> = {
  "/": "Boshqaruv paneli",
  "/drivers": "Haydovchilar",
  "/passengers": "Yo'lovchilar",
  "/orders": "Buyurtma berish",
  "/live": "Jonli buyurtmalar",
  "/map": "Jonli xarita",
  "/rides": "Sayohatlar",
  "/pricing": "Narxlar",
  "/commission": "Komissiya",
  "/bonus": "Bonus va promo",
  "/stats": "Statistika",
  "/audit": "Audit jurnali",
};

function titleFor(pathname: string): string {
  if (pathname !== "/" && TITLES[pathname]) return TITLES[pathname];
  // Longest matching prefix (handles detail routes like /drivers/[id]).
  const match = Object.keys(TITLES)
    .filter((p) => p !== "/" && pathname.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  return match ? TITLES[match] : TITLES["/"];
}

export function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const name = user?.full_name ?? "Administrator";
  const initial = name.charAt(0).toUpperCase();

  return (
    <header className="h-16 shrink-0 border-b border-border bg-surface/80 backdrop-blur flex items-center justify-between px-6 sticky top-0 z-10">
      <h1 className="text-[17px] font-semibold tracking-tight">{titleFor(pathname)}</h1>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 pr-1">
          <div className="h-9 w-9 rounded-full bg-[var(--primary-soft)] text-primary flex items-center justify-center text-sm font-semibold">
            {initial}
          </div>
          <div className="text-right leading-tight hidden sm:block">
            <div className="text-sm font-medium">{name}</div>
            <div className="text-xs text-muted">{formatPhone(user?.phone)}</div>
          </div>
        </div>
        <button
          className="btn btn-ghost"
          onClick={handleLogout}
          title="Chiqish"
        >
          <Icon name="logout" size={16} />
          <span className="hidden sm:inline">Chiqish</span>
        </button>
      </div>
    </header>
  );
}

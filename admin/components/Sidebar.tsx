"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Boshqaruv paneli", icon: "dashboard" },
  { href: "/drivers", label: "Haydovchilar", icon: "drivers" },
  { href: "/passengers", label: "Yo'lovchilar", icon: "passengers" },
  { href: "/orders", label: "Buyurtma berish", icon: "orders" },
  { href: "/live", label: "Jonli buyurtmalar", icon: "live" },
  { href: "/map", label: "Jonli xarita", icon: "map" },
  { href: "/rides", label: "Sayohatlar", icon: "rides" },
  { href: "/pricing", label: "Narxlar", icon: "pricing" },
  { href: "/commission", label: "Komissiya", icon: "commission" },
  { href: "/bonus", label: "Bonus va promo", icon: "bonus" },
  { href: "/stats", label: "Statistika", icon: "stats" },
  { href: "/audit", label: "Audit jurnali", icon: "audit" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-surface flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-border">
        <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
          B
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-[15px]">Bukhara Taxi</div>
          <div className="text-[11px] text-muted">Boshqaruv paneli</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-[var(--primary-soft)] text-primary"
                  : "text-[color:var(--foreground)]/75 hover:bg-[var(--surface-2)] hover:text-foreground"
              }`}
            >
              <Icon
                name={item.icon}
                className={active ? "text-primary" : "text-muted group-hover:text-foreground"}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-3 text-[11px] text-muted border-t border-border">
        v1.0 · Buxoro viloyati
      </div>
    </aside>
  );
}

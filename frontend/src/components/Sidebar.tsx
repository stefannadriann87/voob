"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  Settings,
  CalendarDays,
  CalendarRange,
  FileText,
  LogOut,
  User,
  DollarSign,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import useAuth, { Role } from "../hooks/useAuth";

interface MenuItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

const menuConfig: Record<Role, MenuItem[]> = {
  SUPERADMIN: [
    { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Business-uri", path: "/admin/businesses", icon: Building2 },
    { label: "Analytics", path: "/admin/analytics", icon: BarChart3 },
    { label: "Setări", path: "/admin/settings", icon: Settings },
    { label: "Încasări", path: "/admin/revenue", icon: DollarSign },
    { label: "Profil", path: "/admin/profile", icon: User },
  ],
  BUSINESS: [
    { label: "Dashboard", path: "/business/dashboard", icon: LayoutDashboard },
    { label: "Programări", path: "/business/bookings", icon: CalendarDays },
    { label: "Consimțăminte", path: "/business/consents", icon: FileText },
    { label: "Setări", path: "/business/settings", icon: Settings },
  ],
  EMPLOYEE: [
    { label: "Dashboard", path: "/employee/dashboard", icon: LayoutDashboard },
    { label: "Calendar", path: "/employee/calendar", icon: CalendarRange },
    { label: "Consimțăminte", path: "/employee/consents", icon: FileText },
  ],
  CLIENT: [
    { label: "Dashboard", path: "/client/dashboard", icon: LayoutDashboard },
    { label: "Rezervări", path: "/client/bookings", icon: CalendarDays },
    { label: "Profil", path: "/client/profile", icon: User },
  ],
};

interface SidebarProps {
  collapsed?: boolean;
}

export default function Sidebar({ collapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user) {
    return null;
  }

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  const items = menuConfig[user.role] ?? [];
  const homePath = items[0]?.path ?? "/";

  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-white/5 bg-[#0B0E17]/80 backdrop-blur ${
        collapsed ? "w-[72px]" : "w-72"
      }`}
    >
      <Link href={homePath} className="flex items-center gap-3 px-6 py-8 border-b border-white/5">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/20 text-lg text-emerald-400">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-base font-semibold text-white">LARSTEF</p>
            <p className="text-xs text-white/50">Timpul tău, organizat perfect</p>
          </div>
        )}
      </Link>

      <div className="relative w-full flex flex-1 flex-col items-start gap-1 p-5 text-sm text-white/80">
        {items.map((item) => {
          const active = pathname?.startsWith(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`group w-full flex items-center gap-3 rounded-xl px-3 py-3 font-medium transition ${
                active
                  ? "bg-emerald-400/15 text-white shadow-inner shadow-emerald-500/20"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-base transition ${
                  active ? "bg-emerald-400/25 text-emerald-300" : "bg-white/5 text-white/60 group-hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              {!collapsed && <span className="hidden md:inline truncate">{item.label}</span>}
              {collapsed && <span className="font-semibold text-white">{item.label.slice(0, 1)}</span>}
            </Link>
          );
        })}
      </div>

      <div className="px-2 pb-6">
        <button
          type="button"
          onClick={handleLogout}
          className={`group flex w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm font-semibold text-white/80 transition hover:border-emerald-400/40 hover:bg-emerald-400/15 hover:text-white ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-white/60 transition group-hover:text-white ${
              collapsed ? "" : ""
            }`}
          >
          <LogOut className="h-5 w-5" />
          </span>
          {!collapsed && <span>Delogare</span>}
        </button>
      </div>
    </aside>
  );
}


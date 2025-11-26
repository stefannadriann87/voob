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
  QrCode,
  CreditCard,
  Cpu,
  Activity,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import useAuth, { Role } from "../hooks/useAuth";
import type { BusinessTypeValue } from "../constants/businessTypes";
import { requiresConsentForBusiness } from "../constants/consentTemplates";

interface MenuItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

const menuConfig: Record<Role, MenuItem[]> = {
  SUPERADMIN: [
    { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
    { label: "Business-uri", path: "/admin/businesses", icon: Building2 },
    { label: "Abonamente & Facturare", path: "/admin/subscriptions", icon: CreditCard },
    { label: "Plăți Platformă", path: "/admin/payments", icon: DollarSign },
    { label: "AI & Consum resurse", path: "/admin/ai", icon: Cpu },
    { label: "Raportare & Analytics", path: "/admin/analytics", icon: BarChart3 },
    { label: "Configurări Platformă", path: "/admin/settings", icon: Settings },
    { label: "System Logs & Audit", path: "/admin/logs", icon: ShieldCheck },
  ],
  BUSINESS: [
    { label: "Dashboard", path: "/business/dashboard", icon: LayoutDashboard },
    { label: "Onboarding", path: "/business/onboarding", icon: ShieldCheck },
    { label: "Programări", path: "/business/bookings", icon: CalendarDays },
    { label: "Consimțăminte", path: "/business/consents", icon: FileText },
    { label: "Setări", path: "/business/settings", icon: Settings },
    { label: "Profil", path: "/business/profile", icon: User },
  ],
  EMPLOYEE: [
    { label: "Dashboard", path: "/employee/dashboard", icon: LayoutDashboard },
    { label: "Calendar", path: "/employee/calendar", icon: CalendarRange },
    { label: "Consimțăminte", path: "/employee/consents", icon: FileText },
    { label: "Setări", path: "/employee/settings", icon: Settings },
    { label: "Profil", path: "/employee/profile", icon: User },
  ],
  CLIENT: [
    { label: "Dashboard", path: "/client/dashboard", icon: LayoutDashboard },
    { label: "Rezervări", path: "/client/bookings", icon: CalendarDays },
    { label: "Scanează QR", path: "/client/scan-qr", icon: QrCode },
    { label: "Profil", path: "/client/profile", icon: User },
  ],
};

interface SidebarProps {
  collapsed?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ collapsed = false, isOpen = true, onClose }: SidebarProps) {
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

  const baseItems = menuConfig[user.role] ?? [];
  const businessType = user.business?.businessType as BusinessTypeValue | undefined;
  const shouldHideConsents =
    (user.role === "BUSINESS" || user.role === "EMPLOYEE") && !requiresConsentForBusiness(businessType);

  const items =
    shouldHideConsents && (user.role === "BUSINESS" || user.role === "EMPLOYEE")
      ? baseItems.filter((item) => {
          if (user.role === "BUSINESS") {
            return item.path !== "/business/consents";
          }
          if (user.role === "EMPLOYEE") {
            return item.path !== "/employee/consents";
          }
          return true;
        })
      : baseItems;

  const homePath = items[0]?.path ?? "/";

  const handleLinkClick = () => {
    // Close sidebar on mobile when a link is clicked
    if (onClose && typeof window !== "undefined" && window.innerWidth < 1024) {
      onClose();
    }
  };

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-white/5 bg-[#0B0E17]/80 backdrop-blur transition-transform duration-300 ${
        collapsed ? "w-[72px]" : "w-72"
      } ${
        isOpen ? "translate-x-0" : "-translate-x-full"
      } lg:translate-x-0`}
    >
      <div className="flex items-center justify-between border-b border-white/5 px-6 py-8">
        <Link href={homePath} className="flex items-center gap-3" onClick={handleLinkClick}>
          <div className={`flex items-center justify-center rounded-2xl bg-[#6366F1]/20 text-[#6366F1] transition-all duration-300 ${
            onClose ? "h-8 w-8 lg:h-11 lg:w-11" : "h-11 w-11"
          }`}>
            <LayoutDashboard className={`transition-all duration-300 ${onClose ? "h-4 w-4 lg:h-5 lg:w-5" : "h-5 w-5"}`} />
          </div>
          {!collapsed && (
            <div className="transition-all duration-300">
              <p className={`font-semibold text-white transition-all duration-300 ${onClose ? "text-sm lg:text-base" : "text-base"}`}>LARSTEF</p>
              <p className={`text-white/50 transition-all duration-300 ${onClose ? "text-[10px] lg:text-xs" : "text-xs"}`}>Timpul tău, organizat perfect</p>
            </div>
          )}
        </Link>
        {/* Close button for mobile */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-white/60 transition-all duration-300 hover:bg-white/10 hover:text-white group"
            aria-label="Close menu"
          >
            <i className="fas fa-times text-lg transition-all duration-300 group-hover:rotate-90 group-active:scale-110" />
          </button>
        )}
      </div>

      <div className="relative w-full flex flex-1 flex-col items-start gap-1 p-5 text-sm text-white/80">
        {items.map((item) => {
          const active = pathname?.startsWith(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={handleLinkClick}
              className={`group w-full flex items-center gap-3 rounded-xl px-3 py-3 font-medium transition ${
                active
                  ? "bg-[#6366F1]/15 text-white shadow-inner shadow-[#6366F1]/20"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-base transition ${
                  active ? "bg-[#6366F1]/25 text-[#6366F1]" : "bg-white/5 text-white/60 group-hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
              {collapsed && <span className="font-semibold text-white">{item.label.slice(0, 1)}</span>}
            </Link>
          );
        })}
      </div>

      <div className="px-2 pb-6">
        <button
          type="button"
          onClick={handleLogout}
          className={`group flex w-full items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm font-semibold text-white/80 transition hover:border-[#6366F1]/40 hover:bg-[#6366F1]/15 hover:text-white ${
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


"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import useAuth, { Role } from "../hooks/useAuth";

interface NavbarProps {
  showSidebarToggle?: boolean;
  onToggleSidebar?: () => void;
}

const getLinksForRole = (role: Role | undefined) => {
  if (!role) return [];
  
  switch (role) {
    case "CLIENT":
      return [
        { href: "/client/dashboard", label: "Dashboard" },
        { href: "/client/bookings", label: "Rezervări" },
      ];
    case "BUSINESS":
      return [
        { href: "/business/dashboard", label: "Dashboard" },
        { href: "/business/bookings", label: "Programări" },
        { href: "/business/consents", label: "Consimțăminte" },
      ];
    case "EMPLOYEE":
      return [
        { href: "/employee/dashboard", label: "Dashboard" },
        { href: "/employee/calendar", label: "Calendar" },
        { href: "/employee/consents", label: "Consimțăminte" },
      ];
    case "SUPERADMIN":
      return [
        { href: "/admin/dashboard", label: "Dashboard" },
        { href: "/admin/businesses", label: "Business-uri" },
        { href: "/admin/analytics", label: "Analytics" },
      ];
    default:
      return [];
  }
};

export default function Navbar({ showSidebarToggle, onToggleSidebar }: NavbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push("/auth/login");
  };

  const hideNavbar = pathname?.startsWith("/auth/");
  if (hideNavbar) {
    return null;
  }

  const hideNavLinks = pathname?.startsWith("/auth/");

  const visibleLinks = useMemo(() => {
    if (hideNavLinks) return [];
    return getLinksForRole(user?.role);
  }, [hideNavLinks, user?.role]);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0B0E17]/90 backdrop-blur border-b border-white/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 text-white">
        <div className="flex items-center gap-4">
          {showSidebarToggle && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 sm:hidden"
            >
              <i className="fas fa-bars" />
            </button>
          )}
          <Link href="/" className="text-xl font-semibold tracking-tight">
            LARSTEF
          </Link>
        </div>

        {visibleLinks.length > 0 && (
          <nav className="hidden items-center gap-6 text-sm font-medium sm:flex">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`transition ${
                  pathname === link.href ? "text-white" : "text-white/70 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="hidden flex-col text-right text-xs sm:flex">
                <span className="font-semibold text-white">{user.name}</span>
                <span className="text-white/60 capitalize">{user.role.toLowerCase()}</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
              >
                Delogare
              </button>
            </>
          ) : (
            <Link
              href="/auth/login"
              className="rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
            >
              Conectează-te
            </Link>
          )}

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 sm:hidden"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            <i className={`fas ${isMobileMenuOpen ? "fa-times" : "fa-ellipsis-h"}`} />
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-white/10 bg-[#0B0E17]/95 px-4 py-4 sm:hidden">
          <nav className="flex flex-col gap-4">
            {visibleLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-white/80 transition hover:text-white"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {user ? (
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg bg-white/10 px-4 py-2 text-left text-sm font-medium text-white transition hover:bg-white/20"
              >
                Delogare
              </button>
            ) : (
              <Link
                href="/auth/login"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
              >
                Conectează-te
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}


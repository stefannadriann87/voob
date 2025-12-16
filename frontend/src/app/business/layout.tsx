"use client";

import { ReactNode, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import AIChatWidget from "../../components/AIChatWidget";
import NotificationBell from "../../components/NotificationBell";
import TrialBanner from "../../components/TrialBanner";
import TrialExpiredModal from "../../components/TrialExpiredModal";
import useAuth from "../../hooks/useAuth";
import useBusiness from "../../hooks/useBusiness";

export default function BusinessLayout({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const { user, loading } = useAuth();
  const { businesses, fetchBusinesses, loading: businessesLoading } = useBusiness();
  const homePath = user?.role === "BUSINESS" ? "/business/dashboard" : "/";
  
  // Găsește business-ul corect pentru user (owner sau employee)
  const currentBusinessId = useMemo(() => {
    if (businesses.length === 0 || !user) {
      return null;
    }

    // Încearcă să găsească business-ul deținut de user
    if (user.id) {
      const owned = businesses.find((item) => item.ownerId === user.id);
      if (owned) {
        return owned.id;
      }

      // Încearcă să găsească business-ul unde user-ul este employee
      const employeeBusiness = businesses.find((item) =>
        item.employees.some((employee) => employee.id === user.id)
      );
      if (employeeBusiness) {
        return employeeBusiness.id;
      }
    }

    // Fallback: primul business din listă
    return businesses[0]?.id ?? null;
  }, [businesses, user]);

  // Fetch businesses when user is authenticated
  useEffect(() => {
    if (!loading && user && (user.role === "BUSINESS" || user.role === "SUPERADMIN") && businesses.length === 0 && !businessesLoading) {
      void fetchBusinesses();
    }
  }, [loading, user, businesses.length, businessesLoading, fetchBusinesses]);

  // Debug: Log businessId pentru debugging
  useEffect(() => {
    if (currentBusinessId) {
      console.log("[BusinessLayout] Current businessId:", currentBusinessId);
    } else if (!businessesLoading && businesses.length === 0 && user?.role === "BUSINESS") {
      console.warn("[BusinessLayout] No businessId available, businesses:", businesses);
    }
  }, [currentBusinessId, businesses, businessesLoading, user]);

  // Redirect dacă user-ul nu are rolul corect
  useEffect(() => {
    if (!loading && user && user.role !== "BUSINESS" && user.role !== "SUPERADMIN") {
      router.push("/");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-[#0B0E17] text-white">
      <TrialBanner businessId={currentBusinessId} />
      <TrialExpiredModal businessId={currentBusinessId} />
      {/* Mobile header with logo */}
      <header className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-white/5 bg-[#0B0E17]/80 backdrop-blur px-4 py-3 lg:hidden transition-all duration-300 ${
        isSidebarOpen ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"
      }`}>
        <Link href={homePath} className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#6366F1]/20 text-sm text-[#6366F1] transition-all duration-300">
            <LayoutDashboard className="h-4 w-4 transition-all duration-300" />
          </div>
          <div className="transition-all duration-300">
            <p className="text-sm font-semibold text-white transition-all duration-300">VOOB</p>
            <p className="text-[10px] text-white/50 transition-all duration-300">your time!</p>
          </div>
        </Link>
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className={`relative flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-all duration-300 hover:bg-white/10 ${
            isSidebarOpen ? "opacity-0 pointer-events-none scale-0 rotate-90" : "opacity-100 scale-100 rotate-0"
          }`}
          aria-label="Open menu"
        >
          <i className="fas fa-bars text-sm transition-all duration-300" />
        </button>
      </header>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className="flex min-h-screen">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <div className="ml-0 flex w-full flex-col lg:ml-72">
          <main className="flex-1 px-6 pb-12 pt-16 lg:pt-10 lg:px-10 w-full">{children}</main>
        </div>
      </div>
      <NotificationBell />
      <AIChatWidget onBookingCreated={undefined} />
    </div>
  );
}


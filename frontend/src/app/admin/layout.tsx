"use client";

import { ReactNode } from "react";
import Sidebar from "../../components/Sidebar";
import AIChatWidget from "../../components/AIChatWidget";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0B0E17] text-white">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="ml-72 flex w-full flex-col">
          <main className="flex-1 px-6 pb-12 pt-10 lg:px-10 w-full">{children}</main>
        </div>
      </div>
      <AIChatWidget />
    </div>
  );
}


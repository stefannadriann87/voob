"use client";

import WorkingHoursSettings from "../../../components/WorkingHoursSettings";
import HolidaySettings from "../../../components/HolidaySettings";

export default function BusinessSettingsPage() {
  return (
    <div className="min-h-screen bg-[#0B0E17] px-0 py-6 desktop:px-6 desktop:py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Setări business</h1>
          <p className="mt-4 text-sm text-white/60">
            Configurează profilul businessului, programul de lucru, metodele de plată și preferințele echipei.
          </p>
        </div>

        <WorkingHoursSettings />
        <HolidaySettings />
      </div>
    </div>
  );
}


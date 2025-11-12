"use client";

import EmployeeWorkingHoursSettings from "../../../components/EmployeeWorkingHoursSettings";
import EmployeeHolidaySettings from "../../../components/EmployeeHolidaySettings";

export default function EmployeeSettingsPage() {
  return (
    <div className="min-h-screen bg-[#0B0E17] px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-3xl font-semibold">Setări</h1>
          <p className="mt-4 text-sm text-white/60">
            Configurează programul de lucru și perioadele de concediu pentru calendarul tău.
          </p>
        </div>

        <EmployeeWorkingHoursSettings />
        <EmployeeHolidaySettings />
      </div>
    </div>
  );
}


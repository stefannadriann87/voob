"use client";

import Head from "next/head";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";

type PlatformSetting = {
  key: string;
  value: string;
  description?: string | null;
  updatedAt: string;
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const api = useApi();
  const { user, hydrated } = useAuth();
  const [settings, setSettings] = useState<PlatformSetting[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "SUPERADMIN") {
      router.replace("/dashboard");
      return;
    }
    const load = async () => {
      try {
        setLoading(true);
        const response = await api.get("/admin/settings");
        setSettings(response.data);
        setFormData(
          response.data.reduce(
            (acc: Record<string, string>, setting: PlatformSetting) => ({
              ...acc,
              [setting.key]: setting.value,
            }),
            {}
          )
        );
      } catch (err: any) {
        setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut încărca setările.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [hydrated, user, router, api]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    try {
      setSaving(true);
      const payload = Object.entries(formData).map(([key, value]) => ({
        key,
        value,
      }));
      await api.put("/admin/settings", { settings: payload });
      setMessage("Setările au fost actualizate.");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Nu am putut salva setările.");
    } finally {
      setSaving(false);
    }
  };

  if (!hydrated || !user || user.role !== "SUPERADMIN") {
    return null;
  }

  return (
    <>
      <Head>
        <title>Configurări platformă - Admin</title>
      </Head>
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#818CF8]">Configurări</p>
          <h1 className="mt-1 text-3xl font-semibold text-white">Parametri operaționali</h1>
          <p className="text-sm text-white/60">
            Actualizează costuri interne și comportament default al platformei. Nu salva date sensibile aici.
          </p>
        </div>

        {message && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {settings.map((setting) => (
              <label
                key={setting.key}
                className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/70"
              >
                <span className="text-xs uppercase tracking-wide text-white/50">{setting.key}</span>
                {setting.description && (
                  <p className="mt-1 text-xs text-white/50">{setting.description}</p>
                )}
                <input
                  type="text"
                  value={formData[setting.key] ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      [setting.key]: e.target.value,
                    }))
                  }
                  className="mt-3 w-full rounded-2xl border border-white/10 bg-[#0F172A]/70 px-4 py-2 text-white outline-none transition focus:border-[#6366F1]"
                />
                <p className="mt-1 text-[11px] text-white/40">
                  Ultima actualizare: {new Date(setting.updatedAt).toLocaleString("ro-RO")}
                </p>
              </label>
            ))}
            {!loading && settings.length === 0 && (
              <p className="rounded-3xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-center text-sm text-white/60 md:col-span-2">
                Nu există setări configurabile.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-2xl bg-[#6366F1] mt-6 px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Se salvează..." : "Salvează setările"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

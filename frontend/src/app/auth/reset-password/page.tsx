"use client";

import { FormEvent, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthHeader from "../../../components/AuthHeader";
import useAuth from "../../../hooks/useAuth";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { resetPassword, loading, error } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setFormError("Token invalid.");
      return;
    }
    if (password !== confirm) {
      setFormError("Parolele trebuie să coincidă.");
      return;
    }
    setFormError(null);
    try {
      await resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => router.push("/auth/login"), 1500);
    } catch {
      // error handled by hook
    }
  };

  return (
    <>
      <Head>
        <title>Setează o parolă nouă - LARSTEF</title>
      </Head>
      <div className="min-h-screen bg-[#0B0E17] text-white">
        <AuthHeader />
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 pt-32">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl shadow-black/30">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-semibold">Setează o parolă nouă</h1>
              <p className="mt-2 text-sm text-white/60">
                Introdu noua parolă pentru contul tău. Linkul de resetare expiră după o oră.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Parola nouă</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  minLength={6}
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Confirmă parola</span>
                <input
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  required
                  minLength={6}
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                />
              </label>

              {formError && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {formError}
                </p>
              )}

              {error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}

              {success && (
                <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                  Parola a fost actualizată. Te redirecționăm către pagina de login...
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !token}
                className="mt-2 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Se procesează..." : "Salvează noua parolă"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-white/60">
              <Link href="/auth/login" className="font-semibold text-[#6366F1] hover:text-[#7C3AED]">
                Înapoi la autentificare
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}


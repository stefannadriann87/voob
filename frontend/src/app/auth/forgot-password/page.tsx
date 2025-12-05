"use client";

import { FormEvent, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import AuthHeader from "../../../components/AuthHeader";
import useAuth from "../../../hooks/useAuth";

export default function ForgotPasswordPage() {
  const { requestPasswordReset, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await requestPasswordReset(email);
      setSuccess(true);
    } catch {
      // error handled by hook
    }
  };

  return (
    <>
      <Head>
        <title>Resetare parolă - VOOB</title>
      </Head>
      <div className="min-h-screen bg-[#0B0E17] text-white">
        <AuthHeader />
        <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-20 pt-32">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl shadow-black/30">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-semibold">Ai uitat parola?</h1>
              <p className="mt-2 text-sm text-white/60">
                Introdu adresa ta de email și îți vom trimite un link de resetare.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                />
              </label>

              {error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}

              {success && (
                <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                  Dacă există un cont asociat cu acest email, vei primi un link de resetare în curând.
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Se trimite..." : "Trimite link resetare"}
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


"use client";

import { FormEvent, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "../../../components/Navbar";
import useAuth, { Role } from "../../../hooks/useAuth";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, error, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("CLIENT");

  // Email-ul superadmin-ului - nu necesită selecție de rol
  const SUPERADMIN_EMAIL = "stefann.adriann@gmail.com";
  const isSuperAdminEmail = email.toLowerCase().trim() === SUPERADMIN_EMAIL.toLowerCase().trim();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      // Pentru superadmin, nu trimitem rolul - backend-ul va detecta automat
      const loginPayload = isSuperAdminEmail 
        ? { email, password } 
        : { email, password, role };
      
      const loggedUser = await login(loginPayload);
      const redirectTo = searchParams.get("redirect");
      if (redirectTo) {
        router.push(redirectTo);
        return;
      }
      switch (loggedUser.role) {
        case "BUSINESS":
          router.push("/business/dashboard");
          break;
        case "EMPLOYEE":
          router.push("/employee/dashboard");
          break;
        case "SUPERADMIN":
          router.push("/admin/dashboard");
          break;
        case "CLIENT":
          router.push("/client/dashboard");
          break;
        default:
          router.push("/client/dashboard");
      }
    } catch {
      // error handled by hook
    }
  };

  return (
    <>
      <Head>
        <title>Autentificare - LARSTEF</title>
      </Head>
      <div className="min-h-screen bg-[#0B0E17] text-white">
        <Navbar />
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-20">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl shadow-black/30">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-semibold">Bine ai revenit!</h1>
              <p className="mt-2 text-sm text-white/60">
                Autentifică-te pentru a gestiona rezervările și business-ul tău.
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

              <label className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Parolă</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                />
              </label>

              {!isSuperAdminEmail && (
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-white/70">Rol</span>
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value as Role)}
                    className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                  >
                    <option value="CLIENT">Client</option>
                    <option value="BUSINESS">Business</option>
                    <option value="EMPLOYEE">Employee</option>
                  </select>
                </label>
              )}

              {error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Se autentifică..." : "Autentificare"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-white/60">
              <Link href="/auth/forgot-password" className="font-medium text-[#6366F1] hover:text-[#7C3AED]">
                Ai uitat parola?
              </Link>
            </p>

            <p className="mt-2 text-center text-sm text-white/60">
              Nu ai cont?{" "}
              <Link href="/auth/register" className="font-semibold text-[#6366F1] hover:text-[#7C3AED]">
                Înregistrează-te
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}


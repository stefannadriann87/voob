"use client";

import { FormEvent, useState, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../../../components/Navbar";
import CustomSelect from "../../../components/CustomSelect";
import useAuth, { Role } from "../../../hooks/useAuth";
import { BUSINESS_TYPE_OPTIONS, type BusinessTypeValue } from "../../../constants/businessTypes";
import Captcha from "../../../components/Captcha";

export default function RegisterPage() {
  const router = useRouter();
  const { register, login, loading, error } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>("CLIENT");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessTypeValue>("GENERAL");
  const [success, setSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const handleCaptchaVerify = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (password !== confirmPassword) {
      setFormError("Parolele trebuie să coincidă.");
      return;
    }

    if (role === "BUSINESS" && !businessName.trim()) {
      setFormError("Numele businessului este obligatoriu pentru conturile Business.");
      return;
    }

    if (!captchaToken) {
      setFormError("Se verifică securitatea... Te rugăm să aștepți un moment.");
      return;
    }

    try {
      await register({
        email,
        password,
        name,
        phone: phone.trim() || undefined,
        role,
        businessName: businessName.trim() || undefined,
        businessType: role === "BUSINESS" ? businessType : undefined,
        captchaToken,
      });
      setSuccess("Cont creat cu succes! Te autentificăm automat...");
      const loggedUser = await login({ email, password, role });
      switch (loggedUser.role) {
        case "BUSINESS":
          router.push("/business/dashboard");
          break;
        case "EMPLOYEE":
          router.push("/employee/dashboard");
          break;
        case "CLIENT":
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
        <title>Înregistrare - LARSTEF</title>
      </Head>
      <div className="min-h-screen bg-[#0B0E17] text-white">
        <Navbar />
        <div className="mx-auto flex max-w-4xl flex-col items-center px-4 py-20">
          <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-white/5 p-10 shadow-2xl shadow-black/30">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-semibold">Creează-ți contul</h1>
              <p className="mt-2 text-sm text-white/60">
                Înregistrează-te rapid și gestionează-ți programările inteligent.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Nume complet</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                />
              </label>

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
                <span className="text-white/70">Număr de telefon</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+40 7XX XXX XXX"
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

              <label className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Confirmă parola</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Tip cont</span>
                <CustomSelect
                  value={role}
                  onChange={(value) => setRole(value as Role)}
                  options={[
                    { value: "CLIENT", label: "Client" },
                    { value: "BUSINESS", label: "Business" },
                    { value: "EMPLOYEE", label: "Specialist" },
                  ]}
                  placeholder="Selectează tipul de cont"
                  size="lg"
                />
              </label>

              {role === "BUSINESS" && (
                <>
                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Tipul cabinetului / businessului</span>
                    <CustomSelect
                      value={businessType}
                      onChange={(value) => setBusinessType(value as BusinessTypeValue)}
                      options={BUSINESS_TYPE_OPTIONS.map((option) => ({
                        value: option.value,
                        label: option.label,
                      }))}
                      placeholder="Selectează tipul de business"
                      size="lg"
                    />
                    <span className="text-xs text-white/50">
                      Tipul selectat ne ajută să pregătim automat consimțămintele necesare clienților tăi.
                    </span>
                  </label>

                  <label className="flex flex-col gap-2 text-sm">
                    <span className="text-white/70">Numele businessului</span>
                    <input
                      value={businessName}
                      onChange={(event) => setBusinessName(event.target.value)}
                      placeholder="Ex: Larstef Clinic"
                      required
                      className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                    />
                  </label>
                </>
              )}

              {error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}

              {formError && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {formError}
                </p>
              )}

              {success && (
                <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                  {success}
                </p>
              )}

              <Captcha onVerify={handleCaptchaVerify} action="register" />

              <button
                type="submit"
                disabled={loading || !captchaToken}
                className="mt-2 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Se procesează..." : "Creează cont"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-white/60">
              Ai cont?{" "}
              <Link href="/auth/login" className="font-semibold text-[#6366F1] hover:text-[#7C3AED]">
                Autentifică-te
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}


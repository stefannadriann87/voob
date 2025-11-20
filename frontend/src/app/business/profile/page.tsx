"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useAuth from "../../../hooks/useAuth";
import useBusiness from "../../../hooks/useBusiness";
import useApi from "../../../hooks/useApi";

export default function BusinessProfilePage() {
  const router = useRouter();
  const { user, hydrated, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { businesses, fetchBusinesses, regenerateBusinessQr } = useBusiness();
  const api = useApi();
  const [qrFeedback, setQrFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [regeneratingQr, setRegeneratingQr] = useState(false);
  const [downloadingPoster, setDownloadingPoster] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (user.role !== "BUSINESS") {
      router.replace("/business/dashboard");
      return;
    }

    setName(user.name || "");
    setEmail(user.email || "");
    setPhone(user.phone || "");
    setRole(user.specialization || "");
    setAvatar(user.avatar || null);
    setAvatarPreview(user.avatar || null);
  }, [hydrated, user, router]);

  useEffect(() => {
    if (!hydrated || !user || user.role !== "BUSINESS") {
      return;
    }
    void fetchBusinesses();
  }, [hydrated, user, fetchBusinesses]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await updateProfile({
        name: name.trim(),
        phone: phone.trim() || undefined,
        specialization: role.trim() || undefined,
      });
      setSuccess("Profil actualizat cu succes!");
      setIsEditing(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la actualizarea profilului.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setName(user?.name || "");
    setEmail(user?.email || "");
    setPhone(user?.phone || "");
    setRole(user?.specialization || "");
    setAvatar(user?.avatar || null);
    setAvatarPreview(user?.avatar || null);
    setError(null);
    setSuccess(null);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Te rog selectează o imagine validă.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("Imaginea trebuie să fie mai mică de 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setAvatarPreview(base64String);
      setAvatar(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarUpload = async () => {
    if (!avatar) return;

    setUploadingAvatar(true);
    setError(null);
    try {
      await updateProfile({ avatar });
      setSuccess("Avatar actualizat cu succes!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la actualizarea avatarului.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const ownedBusiness = useMemo(() => {
    if (!user || user.role !== "BUSINESS") {
      return null;
    }
    return (
      businesses.find((item) => item.ownerId === user.id || item.id === user.business?.id) ?? null
    );
  }, [businesses, user]);

  const business = ownedBusiness ?? user?.business ?? null;

  const joinUrl = useMemo(() => {
    if (!ownedBusiness) {
      return null;
    }
    const base =
      process.env.NEXT_PUBLIC_APP_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    if (!base) {
      return null;
    }
    return `${base.replace(/\/$/, "")}/qr/join?businessId=${ownedBusiness.id}`;
  }, [ownedBusiness]);

  const handleDownloadPoster = useCallback(async () => {
    if (!ownedBusiness) {
      return;
    }
    if (typeof window === "undefined") {
      setQrFeedback({ type: "error", message: "Descărcarea este disponibilă doar în browser." });
      return;
    }

    const blobToDataUrl = (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("Nu am putut genera imaginea QR."));
          }
        };
        reader.onerror = () => reject(new Error("Nu am putut citi fișierul QR."));
        reader.readAsDataURL(blob);
      });

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Nu am putut încărca resursa ${src}`));
        img.src = src;
      });

    const drawPoster = async (qrSrc: string) => {
      const canvas = document.createElement("canvas");
      const width = 1080;
      const height = 1580;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas indisponibil.");
      }

      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#101635");
      gradient.addColorStop(1, "#050711");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const drawRoundedRect = (
        x: number,
        y: number,
        w: number,
        h: number,
        r: number,
        fillStyle: string,
        shadow?: { blur: number; color: string },
      ) => {
        ctx.save();
        if (shadow) {
          ctx.shadowBlur = shadow.blur;
          ctx.shadowColor = shadow.color;
        }
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.restore();
      };

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "600 72px 'Space Grotesk', 'Inter', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("LARSTEF", width / 2, 140);
      ctx.font = "400 24px 'Inter', sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText("Timpul tău, organizat perfect!", width / 2, 190);

      const qrContainerSize = 720;
      const qrContainerX = (width - qrContainerSize) / 2;
      const qrContainerY = 240;
      drawRoundedRect(qrContainerX, qrContainerY, qrContainerSize, qrContainerSize, 48, "#F8FAFC", {
        blur: 40,
        color: "rgba(99,102,241,0.35)",
      });

      const qrImage = await loadImage(qrSrc);
      const qrPadding = 80;
      ctx.drawImage(
        qrImage,
        qrContainerX + qrPadding,
        qrContainerY + qrPadding,
        qrContainerSize - qrPadding * 2,
        qrContainerSize - qrPadding * 2,
      );

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "600 52px 'Space Grotesk', 'Inter', sans-serif";
      ctx.fillText(ownedBusiness.name, width / 2, qrContainerY + qrContainerSize + 120);

      const paymentBoxY = qrContainerY + qrContainerSize + 180;
      drawRoundedRect(width / 2 - 360, paymentBoxY, 720, 240, 32, "rgba(15,23,42,0.8)");
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = "400 24px 'Inter', sans-serif";
      ctx.fillText("Scan & Book • Plăți instant prin", width / 2, paymentBoxY + 55);

      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "400 20px 'Inter', sans-serif";
      ctx.fillText("Disponibil și plată la locație (cash/card POS)", width / 2, paymentBoxY + 205);

      const [logoApple, logoGoogle, logoKlarna] = await Promise.all([
        loadImage("/images/logo-apple-pay.svg"),
        loadImage("/images/logo-google-pay.svg"),
        loadImage("/images/logo-klarna.svg"),
      ]);
      const logos = [logoApple, logoGoogle, logoKlarna];
      const logoWidth = 180;
      const logoHeight = 70;
      const logoGap = 30;
      const totalLogosWidth = logos.length * logoWidth + (logos.length - 1) * logoGap;
      let startX = (width - totalLogosWidth) / 2;
      logos.forEach((logo) => {
        drawRoundedRect(startX - 10, paymentBoxY + 85, logoWidth + 20, logoHeight + 20, 20, "rgba(255,255,255,0.08)");
        ctx.drawImage(logo, startX, paymentBoxY + 95, logoWidth, logoHeight);
        startX += logoWidth + logoGap;
      });

      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "300 20px 'Inter', sans-serif";
      ctx.fillText("Afișează codul în locație sau trimite-l direct clienților tăi", width / 2, height - 80);

      return canvas.toDataURL("image/png");
    };

    try {
      setQrFeedback(null);
      setDownloadingPoster(true);
      const response = await api.get(`/business/${ownedBusiness.id}/qr`, {
        params: { format: "png" },
        responseType: "arraybuffer",
      });
      const qrDataUrl = await blobToDataUrl(new Blob([response.data], { type: "image/png" }));
      const posterDataUrl = await drawPoster(qrDataUrl);
      const link = document.createElement("a");
      const safeName =
        ownedBusiness.domain?.replace(/[^a-z0-9-]/gi, "-") || ownedBusiness.id.slice(0, 6);
      link.href = posterDataUrl;
      link.download = `larstef-qr-${safeName}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setQrFeedback({ type: "success", message: "Posterul cu QR a fost descărcat." });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Nu am putut genera posterul cu QR.";
      setQrFeedback({ type: "error", message });
    } finally {
      setDownloadingPoster(false);
    }
  }, [api, ownedBusiness]);

  const handleRegenerateQr = useCallback(async () => {
    if (!ownedBusiness) {
      return;
    }
    setQrFeedback(null);
    setRegeneratingQr(true);
    try {
      await regenerateBusinessQr(ownedBusiness.id);
      await fetchBusinesses();
      setQrFeedback({ type: "success", message: "Codul QR a fost regenerat." });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Nu am putut regenera codul QR.";
      setQrFeedback({ type: "error", message });
    } finally {
      setRegeneratingQr(false);
    }
  }, [ownedBusiness, regenerateBusinessQr, fetchBusinesses]);

  const handleCopyLink = useCallback(async () => {
    if (!joinUrl) {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setQrFeedback({ type: "error", message: "Copierea nu este disponibilă în acest browser." });
      return;
    }
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopiedLink(true);
      setQrFeedback({ type: "success", message: "Link copiat în clipboard." });
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Nu am putut copia linkul.";
      setQrFeedback({ type: "error", message });
    }
  }, [joinUrl]);

  if (!hydrated || !user) {
    return null;
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h1 className="mt-8 text-3xl font-semibold text-white desktop:mt-0">Profil Business</h1>
        <p className="mt-2 text-sm text-white/60">
          Actualizează informațiile reprezentantului și consultă datele afacerii tale.
        </p>
      </div>

      <div className="desktop:rounded-3xl desktop:border desktop:border-white/10 desktop:bg-white/5 p-0 desktop:p-8 mt-8 desktop:mt-0 space-y-10">
        <section>
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Date reprezentant</h2>
              <p className="text-sm text-white/60">Aceste informații sunt folosite pentru comunicarea cu LARSTEF.</p>
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                <i className="fas fa-edit mr-2" />
                Editează
              </button>
            )}
          </div>

          {!isEditing ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium text-white/70">Avatar</label>
                <div className="flex items-center gap-4">
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/10">
                    {user.avatar ? (
                      <img src={user.avatar} alt="Avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#6366F1]/20 text-2xl font-semibold text-[#6366F1]">
                        {user.name?.charAt(0).toUpperCase() || "B"}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Nume complet</label>
                <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                  {user.name || "—"}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Email</label>
                <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                  {user.email || "—"}
                </div>
                <p className="text-xs text-white/50">Email-ul nu poate fi modificat.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Număr de telefon</label>
                <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                  {user.phone || "—"}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Rol în companie</label>
                <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                  {user.specialization || "—"}
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex flex-col gap-4">
                <label className="text-sm font-medium text-white/70">Avatar</label>
                <div className="flex items-center gap-4">
                  <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-white/10">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-[#6366F1]/20 text-2xl font-semibold text-[#6366F1]">
                        {user.name?.charAt(0).toUpperCase() || "B"}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="cursor-pointer rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10">
                      <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                      <i className="fas fa-upload mr-2" />
                      {avatarPreview ? "Schimbă poza" : "Încarcă poză"}
                    </label>
                    {avatarPreview && avatar !== user?.avatar && (
                      <button
                        type="button"
                        onClick={handleAvatarUpload}
                        disabled={uploadingAvatar}
                        className="rounded-xl bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploadingAvatar ? "Se salvează..." : "Salvează avatar"}
                      </button>
                    )}
                    {avatarPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarPreview(user?.avatar || null);
                          setAvatar(user?.avatar || null);
                        }}
                        className="rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
                      >
                        Anulează
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-white/50">Format acceptat: JPG, PNG, GIF (max 5MB)</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Nume complet *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                  placeholder="Nume reprezentant"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="cursor-not-allowed rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white/50"
                  placeholder="email@business.ro"
                />
                <p className="text-xs text-white/50">Email-ul nu poate fi modificat.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Număr de telefon</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                  placeholder="+40 7XX XXX XXX"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-white/70">Rol în companie</label>
                <input
                  type="text"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                  placeholder="Ex: Owner, Manager, Coordonator"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                  {success}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={loading}
                  className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Anulează
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Se salvează..." : "Salvează modificările"}
                </button>
              </div>
            </form>
          )}
        </section>

        {ownedBusiness && (
          <section className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">Codul meu QR</h2>
                <p className="text-sm text-white/60">
                  Tipărește-l și afișează-l în spațiul tău pentru ca doar clienții acceptați să îți poată accesa
                  business-ul și programările.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleDownloadPoster}
                  disabled={downloadingPoster}
                  className="rounded-2xl bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloadingPoster ? "Se generează posterul..." : "Descarcă posterul QR"}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateQr}
                  disabled={regeneratingQr}
                  className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {regeneratingQr ? "Se regenerează..." : "Regenerează QR"}
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[minmax(220px,280px),1fr]">
              <div className="flex items-center justify-center rounded-3xl border border-dashed border-white/10 bg-[#0B0E17]/60 p-6">
                {ownedBusiness.qrCodeUrl ? (
                  <img
                    src={ownedBusiness.qrCodeUrl}
                    alt={`QR LARSTEF ${ownedBusiness.name}`}
                    className="w-full max-w-[220px] rounded-2xl border border-white/10 bg-white p-4"
                  />
                ) : (
                  <div className="text-center text-sm text-white/50">
                    Codul QR este în curs de generare. Reîncarcă pagina sau folosește butonul de regenerare.
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-[#0B0E17]/50 p-4">
                  <p className="text-sm font-medium text-white/70">Link direct</p>
                  <p className="mt-1 text-xs text-white/50">
                    Trimite acest link prin email/sms sau adaugă-l în social media.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={joinUrl ?? ""}
                      readOnly
                      onFocus={(event) => event.target.select()}
                      placeholder="Linkul se încarcă..."
                      className="flex-1 rounded-2xl border border-white/10 bg-[#0B0E17]/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#6366F1]"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      disabled={!joinUrl}
                      className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {copiedLink ? "Copiat!" : "Copiază linkul"}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0B0E17]/50 p-4">
                  <p className="text-sm font-semibold text-white mb-2">Recomandări</p>
                  <ul className="list-disc space-y-2 pl-5 text-sm text-white/70">
                    <li>Așază codul la intrare sau pe recepție pentru a securiza accesul clienților.</li>
                    <li>Folosește linkul în mesajele de confirmare și newsletter pentru onboarding rapid.</li>
                    <li>Pe dispozitive iOS, oferă instrucțiunea „Deschide link-ul în Safari” după scanare.</li>
                  </ul>
                </div>
              </div>
            </div>

            {qrFeedback && (
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  qrFeedback.type === "success"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                    : "border-red-500/40 bg-red-500/10 text-red-200"
                }`}
              >
                {qrFeedback.message}
              </div>
            )}
          </section>
        )}

        <section className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Date companie</h2>
              <p className="text-sm text-white/60">În curând vei putea edita aceste informații direct din platformă.</p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70">Nume business</label>
              <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                {business?.name || "—"}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70">Email business</label>
              <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                {business?.email || "—"}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70">Domeniu</label>
              <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                {business?.domain || "—"}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-white/70">ID business</label>
              <div className="rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white">
                {business?.id || "—"}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}



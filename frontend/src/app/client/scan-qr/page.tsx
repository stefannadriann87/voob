"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useMemo, useRef, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import useAuth from "../../../hooks/useAuth";
import useBusiness from "../../../hooks/useBusiness";

const extractBusinessId = (payload: string): string | null => {
  if (!payload) {
    return null;
  }
  try {
    const url = new URL(payload);
    const id = url.searchParams.get("businessId");
    if (id) {
      return id;
    }
  } catch {
    // Not a valid URL, continue with manual parsing
  }

  const match = payload.match(/businessId=([^&]+)/i);
  if (match?.[1]) {
    return match[1];
  }

  const trimmed = payload.trim();
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
};

export default function ClientScanQrPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const { businesses, fetchBusinesses, linkClientToBusiness } = useBusiness();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const processingRef = useRef(false);
  const lastScanRef = useRef<{ id: string; at: number } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [scannerActive, setScannerActive] = useState(false);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login?redirect=/client/scan-qr");
      return;
    }
    if (user.role !== "CLIENT") {
      router.replace("/dashboard");
      return;
    }
    void fetchBusinesses({ scope: "linked" });
  }, [hydrated, user, router, fetchBusinesses]);

  const handleLinkBusiness = useCallback(
    async (businessId: string) => {
      if (processingRef.current) {
        return;
      }
      processingRef.current = true;
      setProcessing(true);
      setStatus({ type: "info", message: "Se conectează la business..." });
      try {
        const business = await linkClientToBusiness(businessId);
        await fetchBusinesses({ scope: "linked" });
        setStatus({
          type: "success",
          message: `Ești acum conectat la ${business.name}.`,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Nu am putut conecta acest QR. Încearcă din nou.";
        setStatus({ type: "error", message });
      } finally {
        setProcessing(false);
        processingRef.current = false;
      }
    },
    [linkClientToBusiness, fetchBusinesses],
  );

  const handlePayload = useCallback(
    async (payload: string) => {
      const businessId = extractBusinessId(payload);
      if (!businessId) {
        setStatus({ type: "error", message: "Cod QR invalid. Folosește un cod emis de LARSTEF." });
        return;
      }

      if (
        lastScanRef.current &&
        lastScanRef.current.id === businessId &&
        Date.now() - lastScanRef.current.at < 5000
      ) {
        return;
      }

      lastScanRef.current = { id: businessId, at: Date.now() };
      await handleLinkBusiness(businessId);
    },
    [handleLinkBusiness],
  );

  useEffect(() => {
    if (!hydrated || user?.role !== "CLIENT") {
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera nu este disponibilă în acest browser.");
      return;
    }

    let stream: MediaStream | null = null;

    const scanFrame = () => {
      if (!videoRef.current || !canvasRef.current) {
        animationRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      const video = videoRef.current;
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        animationRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (!context) {
        animationRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const qrCode = jsQR(imageData.data, canvas.width, canvas.height, {
        inversionAttempts: "attemptBoth",
      });

      if (qrCode?.data) {
        void handlePayload(qrCode.data);
      }

      animationRef.current = requestAnimationFrame(scanFrame);
    };

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (!videoRef.current) {
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScannerActive(true);
        animationRef.current = requestAnimationFrame(scanFrame);
      } catch (err) {
        console.error("Camera error:", err);
        setCameraError("Nu am putut accesa camera. Permite accesul sau folosește linkul manual.");
      }
    };

    void startCamera();

    return () => {
      setScannerActive(false);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [hydrated, user, handlePayload]);

  const handleManualSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!manualInput.trim()) {
        return;
      }
      const businessId = extractBusinessId(manualInput.trim());
      if (!businessId) {
        setStatus({ type: "error", message: "Introduce un link sau un ID valid." });
        return;
      }
      await handleLinkBusiness(businessId);
    },
    [manualInput, handleLinkBusiness],
  );

  const linkedCount = businesses.length;

  const sortedBusinesses = useMemo(() => {
    return [...businesses].sort((a, b) => a.name.localeCompare(b.name));
  }, [businesses]);

  if (!hydrated || !user || user.role !== "CLIENT") {
    return null;
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-3xl font-semibold text-white">Scanează QR-ul business-ului tău</h1>
        <p className="mt-2 text-sm text-white/60">
          Fiecare partener LARSTEF are un cod QR unic. Scanează-l pentru a-ți conecta contul și pentru a putea face
          rezervări doar la business-urile aprobate.
        </p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <section className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-[#0B0E17]/60 p-4">
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-dashed border-white/10 bg-black/40">
                  {cameraError ? (
                    <div className="flex h-full w-full flex-col items-center justify-center px-4 text-center text-sm text-white/60">
                      <i className="fas fa-camera mb-2 text-lg" />
                      {cameraError}
                    </div>
                  ) : (
                    <>
                      <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                      <div className="pointer-events-none absolute inset-0 rounded-2xl border-4 border-white/20" />
                    </>
                  )}
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <p className="mt-3 text-xs text-white/60">
                  Ține telefonul la 10-15 cm de codul QR. Camera pornește automat atunci când primește permisiunea.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-white/10 bg-[#0B0E17]/60 p-5">
                <h2 className="text-lg font-semibold text-white">Conectare manuală</h2>
                <p className="mt-1 text-xs text-white/60">
                  Nu poți folosi camera? Cere linkul QR business-ului și lipește-l mai jos.
                </p>
                <form onSubmit={handleManualSubmit} className="mt-4 flex flex-col gap-3">
                  <input
                    value={manualInput}
                    onChange={(event) => setManualInput(event.target.value)}
                    placeholder="https://app.larstef.ro/qr/join?businessId=..."
                    className="rounded-2xl border border-white/10 bg-[#0B0E17]/70 px-4 py-3 text-sm text-white outline-none transition focus:border-[#6366F1]"
                  />
                  <button
                    type="submit"
                    disabled={!manualInput.trim() || processing}
                    className="rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {processing ? "Se conectează..." : "Conectează-te manual"}
                  </button>
                </form>
              </div>

              <div className="rounded-3xl border border-white/10 bg-[#0B0E17]/60 p-5">
                <h3 className="text-sm font-semibold text-white">Cum funcționează</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-xs text-white/60">
                  <li>Deschide această pagină pe telefon și acordă acces camerei.</li>
                  <li>Scanează codul QR primit în locația business-ului.</li>
                  <li>După conectare, business-ul apare automat în lista ta și poți face rezervări.</li>
                </ul>
              </div>
            </div>
          </div>

          {status && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                status.type === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                  : status.type === "error"
                    ? "border-red-500/40 bg-red-500/10 text-red-200"
                    : "border-[#6366F1]/40 bg-[#6366F1]/10 text-white"
              }`}
            >
              {status.message}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Business-uri conectate</h2>
              <p className="text-xs text-white/50">Poți scana câte business-uri dorești.</p>
            </div>
            <span className="rounded-xl bg-[#6366F1]/20 px-3 py-1 text-sm font-semibold text-[#6366F1]">
              {linkedCount}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {sortedBusinesses.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/15 bg-[#0B0E17]/40 p-4 text-sm text-white/60">
                Nu ești încă conectat la niciun business. Scanează un cod pentru a începe să faci rezervări.
              </div>
            ) : (
              sortedBusinesses.map((business) => (
                <div
                  key={business.id}
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/50 px-4 py-3 text-sm text-white/80"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{business.name}</p>
                      <p className="text-xs text-white/50">{business.domain}</p>
                    </div>
                    <i className="fas fa-check-circle text-emerald-400" />
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {!scannerActive && !cameraError && (
        <p className="text-center text-xs text-white/50">
          Camera se inițiază... dacă nu pornește în câteva secunde, verifică permisiunile aplicației.
        </p>
      )}
    </div>
  );
}



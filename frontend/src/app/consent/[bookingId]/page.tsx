"use client";

import { AxiosError } from "axios";
import { FormEvent, useEffect, useRef, useState } from "react";
import Head from "next/head";
import { useParams, useRouter } from "next/navigation";
import Navbar from "../../../components/Navbar";
import useAuth from "../../../hooks/useAuth";
import useBookings, { Booking } from "../../../hooks/useBookings";
import useApi from "../../../hooks/useApi";

export default function ConsentPage() {
  const router = useRouter();
  const params = useParams<{ bookingId: string }>();
  const { user, hydrated } = useAuth();
  const { getBooking } = useBookings();
  const api = useApi();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState("");
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (!user) {
      router.replace("/auth/login");
      return;
    }
    if (!params?.bookingId) return;

    const fetch = async () => {
      try {
        const result = await getBooking(params.bookingId);
        setBooking(result);
        setPdfUrl(result.consent?.pdfUrl ?? "");
      } catch (error) {
        setError(error instanceof Error ? error.message : "Rezervarea nu a fost găsită.");
      } finally {
        setLoading(false);
      }
    };

    void fetch();
  }, [hydrated, user, params, getBooking, router]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let drawing = false;

    const start = (x: number, y: number) => {
      drawing = true;
      ctx.beginPath();
      ctx.moveTo(x, y);
    };
    const move = (x: number, y: number) => {
      if (!drawing) return;
      ctx.lineTo(x, y);
      ctx.strokeStyle = "#6366F1";
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    const end = () => {
      drawing = false;
    };

    const handleMouseDown = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      start(event.clientX - rect.left, event.clientY - rect.top);
    };
    const handleMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      move(event.clientX - rect.left, event.clientY - rect.top);
    };
    const handleTouchStart = (event: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const touch = event.touches[0];
      start(touch.clientX - rect.left, touch.clientY - rect.top);
    };
    const handleTouchMove = (event: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const touch = event.touches[0];
      move(touch.clientX - rect.left, touch.clientY - rect.top);
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("mouseleave", end);
    canvas.addEventListener("touchstart", handleTouchStart);
    canvas.addEventListener("touchmove", handleTouchMove);
    canvas.addEventListener("touchend", end);

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("mouseleave", end);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", end);
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!booking) return;

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Semnătura nu este disponibilă.");
      const signature = canvas.toDataURL("image/png");

      await api.post("/consent", {
        bookingId: booking.id,
        pdfUrl: pdfUrl || "https://larstef-storage.local/consent-placeholder.pdf",
        signature,
      });

      setSuccess("Consimțământul a fost salvat. Mulțumim!");
      setTimeout(() => {
        router.push("/client/bookings");
      }, 1500);
    } catch (error) {
      const axiosError = error as AxiosError<{ error?: string }>;
      const message =
        axiosError.response?.data?.error ??
        axiosError.message ??
        (error instanceof Error ? error.message : "Eroare la salvarea consimțământului.");
      setError(message);
    }
  };

  if (!hydrated) {
    return null;
  }
  if (!user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Consimțământ digital - LARSTEF</title>
      </Head>
      <div className="min-h-screen bg-[#0B0E17] text-white">
        <Navbar />

        <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <h1 className="text-2xl font-semibold">Consimțământ digital</h1>
            {booking && (
              <p className="mt-2 text-sm text-white/60">
                Pentru rezervarea: <strong>{booking.service.name}</strong> la{" "}
                <strong>{booking.business.name}</strong>, programată pe{" "}
                {new Date(booking.date).toLocaleString("ro-RO", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            )}
          </section>

          {loading && <p className="text-sm text-white/60">Se încarcă detaliile rezervării...</p>}
          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          {!loading && booking && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6">
              <label className="flex flex-col gap-3 text-sm">
                <span className="text-white/70">Link către PDF generat</span>
                <input
                  value={pdfUrl}
                  onChange={(event) => setPdfUrl(event.target.value)}
                  placeholder="https://..."
                  className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                />
              </label>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">Semnătură digitală</span>
                  <button
                    type="button"
                    onClick={() => {
                      const canvas = canvasRef.current;
                      if (canvas) {
                        const ctx = canvas.getContext("2d");
                        ctx?.clearRect(0, 0, canvas.width, canvas.height);
                      }
                    }}
                    className="text-xs font-semibold text-[#6366F1] hover:text-[#7C3AED]"
                  >
                    Șterge semnătura
                  </button>
                </div>
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={200}
                  className="mt-3 w-full rounded-2xl border border-dashed border-white/20 bg-[#0B0E17]/60"
                />
                <p className="mt-2 text-xs text-white/50">
                  Semnează direct cu degetul sau cu mouse-ul. Semnătura este salvată în format criptat (base64).
                </p>
              </div>

              {success && (
                <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
                  {success}
                </p>
              )}

              <button
                type="submit"
                className="rounded-2xl bg-[#6366F1] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
              >
                Trimite consimțământul
              </button>
            </form>
          )}
        </main>
      </div>
    </>
  );
}


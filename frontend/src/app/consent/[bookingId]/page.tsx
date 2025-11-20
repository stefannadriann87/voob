"use client";

import { AxiosError } from "axios";
import { FormEvent, useEffect, useRef, useState } from "react";
import Head from "next/head";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Navbar from "../../../components/Navbar";
import useAuth from "../../../hooks/useAuth";
import useBookings, { Booking } from "../../../hooks/useBookings";
import useApi from "../../../hooks/useApi";

type BaseField = {
  id: string;
  label: string;
  required?: boolean;
  helperText?: string;
};

type ConsentTemplateField =
  | (BaseField & { type: "text" | "date"; placeholder?: string })
  | (BaseField & { type: "textarea"; placeholder?: string })
  | (BaseField & { type: "checkbox" });

interface ConsentTemplate {
  title: string;
  description: string;
  fields: ConsentTemplateField[];
}

export default function ConsentPage() {
  const router = useRouter();
  const params = useParams<{ bookingId: string }>();
  const searchParams = useSearchParams();
  const { user, hydrated } = useAuth();
  const { getBooking } = useBookings();
  const api = useApi();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, boolean | string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [template, setTemplate] = useState<ConsentTemplate | null>(null);
  const [templateLoading, setTemplateLoading] = useState(true);

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
      } catch (error) {
        setError(error instanceof Error ? error.message : "Rezervarea nu a fost găsită.");
      } finally {
        setLoading(false);
      }
    };

    void fetch();
  }, [hydrated, user, params, getBooking, router]);

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const { data } = await api.get<{ template: ConsentTemplate }>("/consent/template");
        setTemplate(data.template);
      } catch (err) {
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Nu am putut încărca formularul de consimțământ.");
        setError(message);
      } finally {
        setTemplateLoading(false);
      }
    };
    void fetchTemplate();
  }, [api]);

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

  useEffect(() => {
    if (!booking || !template) return;
    const existing = (booking.consentForm?.formData as Record<string, unknown> | null) ?? {};
    const initial: Record<string, boolean | string> = {};
    template.fields.forEach((field) => {
      const storedValue = existing[field.id];
      if (field.type === "checkbox") {
        initial[field.id] = storedValue !== undefined ? Boolean(storedValue) : false;
      } else if (typeof storedValue === "string") {
        initial[field.id] = storedValue;
      } else if (field.id === "patientName") {
        initial[field.id] = booking.client.name;
      } else if (field.id === "procedure") {
        initial[field.id] = booking.service.name;
      } else {
        initial[field.id] = "";
      }
    });
    setFormValues(initial);
  }, [booking, template]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!booking || !template) return;
    setFormError(null);

    const missingField = template.fields.find((field) => {
      if (!field.required) return false;
      const value = formValues[field.id];
      if (field.type === "checkbox") {
        return !value;
      }
      return !(typeof value === "string" && value.trim().length > 0);
    });

    if (missingField) {
      setFormError("Te rugăm să completezi toate câmpurile obligatorii înainte de semnătură.");
      return;
    }

    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Semnătura nu este disponibilă.");
      const signature = canvas.toDataURL("image/png");

      await api.post("/consent/sign", {
        bookingId: booking.id,
        clientId: booking.clientId,
        signature,
        formData: formValues,
      });

      setSuccess("Consimțământul a fost salvat. Mulțumim!");
      setTimeout(() => {
        const redirect = searchParams?.get("redirect");
        router.push(redirect ?? "/client/bookings");
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

          {!loading && !templateLoading && booking && template && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6">
              {template && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  <h2 className="text-lg font-semibold text-white">{template.title}</h2>
                  <p className="mt-1 text-white/60">{template.description}</p>
                </div>
              )}
              <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <h2 className="text-lg font-semibold text-white">{template.title}</h2>
                <p className="mt-1 text-sm text-white/60">{template.description}</p>
                <div className="mt-4 flex flex-col gap-4">
                  {template.fields.map((field) => {
                    if (field.type === "checkbox") {
                      return (
                        <label key={field.id} className="flex items-start gap-3 text-sm text-white/80">
                          <input
                            type="checkbox"
                            checked={Boolean(formValues[field.id])}
                            onChange={(event) => {
                              setFormError(null);
                              setFormValues((prev) => ({ ...prev, [field.id]: event.target.checked }));
                            }}
                            className="mt-1 h-4 w-4 rounded border-white/30 text-[#6366F1] focus:ring-[#6366F1]"
                          />
                          <span>
                            {field.label}
                            {field.required && <span className="ml-1 text-[#F59E0B]">*</span>}
                            {"helperText" in field && field.helperText && (
                              <p className="text-xs text-white/50">{field.helperText}</p>
                            )}
                          </span>
                        </label>
                      );
                    }

                    if (field.type === "textarea") {
                      return (
                        <label key={field.id} className="flex flex-col gap-2 text-sm text-white/80">
                          <span>
                            {field.label}
                            {field.required && <span className="ml-1 text-[#F59E0B]">*</span>}
                          </span>
                          <textarea
                            rows={4}
                            placeholder={"placeholder" in field ? field.placeholder : undefined}
                            value={(formValues[field.id] as string) ?? ""}
                            onChange={(event) => {
                              setFormError(null);
                              setFormValues((prev) => ({ ...prev, [field.id]: event.target.value }));
                            }}
                            className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                          />
                          {"helperText" in field && field.helperText && (
                            <span className="text-xs text-white/50">{field.helperText}</span>
                          )}
                        </label>
                      );
                    }

                    return (
                      <label key={field.id} className="flex flex-col gap-2 text-sm text-white/80">
                        <span>
                          {field.label}
                          {field.required && <span className="ml-1 text-[#F59E0B]">*</span>}
                        </span>
                        <input
                          type={field.type === "date" ? "date" : "text"}
                          placeholder={"placeholder" in field ? field.placeholder : undefined}
                          value={(formValues[field.id] as string) ?? ""}
                          onChange={(event) => {
                            setFormError(null);
                            setFormValues((prev) => ({ ...prev, [field.id]: event.target.value }));
                          }}
                          className="rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 text-white outline-none transition focus:border-[#6366F1]"
                        />
                      </label>
                    );
                  })}
                </div>
              </section>

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


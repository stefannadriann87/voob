"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import Head from "next/head";
import Link from "next/link";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";
import DatePicker from "../../../components/DatePicker";

type ConsentBooking = {
  id: string;
  date: string;
  service: { id: string; name: string };
  client: { id: string; name: string; email: string; phone?: string | null };
  employee?: { id: string; name: string; email: string } | null;
  consentForm?: {
    id: string;
    pdfUrl: string | null;
    templateType?: string | null;
    createdAt: string;
    signature?: string | null;
    formData?: Record<string, unknown> | null;
  } | null;
};

type ConsentDocumentSource = "DIGITAL_SIGNATURE" | "BUSINESS_UPLOAD";

type ClientDocument = {
  id: string;
  pdfUrl: string | null;
  fileName?: string | null;
  source: ConsentDocumentSource;
  createdAt: string;
  booking: {
    id: string;
    date: string;
    service?: { id: string; name: string } | null;
    employee?: { id: string; name: string; email: string } | null;
  };
};

export default function BusinessConsentsPage() {
  const { user, hydrated } = useAuth();
  const api = useApi();

  const [bookings, setBookings] = useState<ConsentBooking[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [uploadingBookingId, setUploadingBookingId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [filesModalClient, setFilesModalClient] = useState<{ id: string; name: string } | null>(null);
  const [clientDocuments, setClientDocuments] = useState<ClientDocument[]>([]);
  const [clientDocumentsLoading, setClientDocumentsLoading] = useState(false);
  const [clientDocumentsError, setClientDocumentsError] = useState<string | null>(null);

  const businessId = user?.business?.id ?? null;

  useEffect(() => {
    if (!hydrated || !businessId) {
      return;
    }

    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get<{ bookings: ConsentBooking[] }>("/consent", {
          params: {
            businessId,
            date: selectedDate,
            search: appliedSearch || undefined,
          },
        });
        if (isMounted) {
          setBookings(data.bookings ?? []);
        }
      } catch (err) {
        console.error("Fetch consents failed:", err);
        if (isMounted) {
          setError("Nu am putut încărca consimțămintele. Încearcă din nou.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchData();
    return () => {
      isMounted = false;
    };
  }, [api, appliedSearch, businessId, hydrated, refreshToken, selectedDate]);

  const filteredBookings = useMemo(() => {
    const query = appliedSearch.trim().toLowerCase();
    if (!query) return bookings;
    return bookings.filter((booking) => {
      const name = booking.client.name?.toLowerCase() ?? "";
      const email = booking.client.email?.toLowerCase() ?? "";
      return name.includes(query) || email.includes(query);
    });
  }, [appliedSearch, bookings]);

  const fetchClientDocuments = useCallback(
    async (clientId: string) => {
      if (!businessId) {
        setClientDocumentsError("Nu am putut identifica business-ul.");
        return;
      }
      setClientDocumentsLoading(true);
      setClientDocumentsError(null);
      try {
        const { data } = await api.get<{ documents: ClientDocument[] }>(`/consent/client/${clientId}`, {
          params: { businessId },
        });
        setClientDocuments(data.documents ?? []);
      } catch (err) {
        console.error("Fetch client documents failed:", err);
        const axiosError = err as AxiosError<{ error?: string }>;
        const message =
          axiosError.response?.data?.error ??
          axiosError.message ??
          (err instanceof Error ? err.message : "Nu am putut încărca fișierele clientului.");
        setClientDocumentsError(message);
      } finally {
        setClientDocumentsLoading(false);
      }
    },
    [api, businessId]
  );

  const signedCount = useMemo(
    () => filteredBookings.filter((booking) => Boolean(booking.consentForm)).length,
    [filteredBookings]
  );

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
  };

  const handleResetFilters = () => {
    setSearchInput("");
    setAppliedSearch("");
    setSelectedDate(new Date().toISOString().split("T")[0]);
  };

  const convertPdfDataUrlToBlobUrl = (dataUrl: string) => {
    if (typeof window === "undefined") {
      throw new Error("Funcția de download poate fi folosită doar în browser.");
    }
    const [prefix, base64] = dataUrl.split(",");
    if (!base64 || !prefix.includes("application/pdf")) {
      throw new Error("Format de fișier invalid.");
    }
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: "application/pdf" });
    return URL.createObjectURL(blob);
  };

  const resolvePdfUrl = (url?: string | null) => {
    if (!url) {
      throw new Error("Nu există niciun fișier asociat cu acest consimțământ.");
    }
    if (url.startsWith("data:application/pdf")) {
      return { blobUrl: convertPdfDataUrlToBlobUrl(url), revoke: true };
    }
    return { blobUrl: url, revoke: false };
  };

  const handleDownloadDocument = (bookingId: string, url?: string | null) => {
    try {
      const { blobUrl, revoke } = resolvePdfUrl(url);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `consent-${bookingId}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      if (revoke) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch (err) {
      console.error("Download consent failed:", err);
      alert(err instanceof Error ? err.message : "Nu am putut descărca documentul.");
    }
  };

  const handleOpenDocument = (url?: string | null) => {
    try {
      const { blobUrl, revoke } = resolvePdfUrl(url);
      const newWindow = window.open(blobUrl, "_blank", "noopener");
      if (!newWindow) {
        alert("Browser-ul a blocat fereastra. Permite pop-up-urile pentru a vedea PDF-ul.");
      }
      if (revoke) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch (err) {
      console.error("Open consent failed:", err);
      alert(err instanceof Error ? err.message : "Nu am putut deschide documentul.");
    }
  };

  const handleUploadClick = (bookingId: string) => {
    setUploadTarget(bookingId);
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const openFilesModal = (client: { id: string; name: string }) => {
    setFilesModalClient({ id: client.id, name: client.name });
    setClientDocuments([]);
    setClientDocumentsError(null);
    void fetchClientDocuments(client.id);
  };

  const closeFilesModal = () => {
    setFilesModalClient(null);
    setClientDocuments([]);
    setClientDocumentsError(null);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !uploadTarget) {
      setUploadTarget(null);
      event.target.value = "";
      return;
    }

    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      setUploadError("Poți încărca doar fișiere PDF sau imagini (PNG/JPG).");
      setUploadTarget(null);
      event.target.value = "";
      return;
    }

    setUploadingBookingId(uploadTarget);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Nu am putut citi fișierul."));
        reader.readAsDataURL(file);
      });

      await api.post("/consent/upload", {
        bookingId: uploadTarget,
        pdfDataUrl: dataUrl,
        fileName: file.name,
      });

      setUploadError(null);
      setRefreshToken((prev) => prev + 1);
      const bookingForUpload = bookings.find((booking) => booking.id === uploadTarget);
      if (bookingForUpload && filesModalClient?.id === bookingForUpload.client.id) {
        void fetchClientDocuments(bookingForUpload.client.id);
      }
    } catch (err) {
      console.error("Upload consent document failed:", err);
      const axiosError = err as AxiosError<{ error?: string }>;
      const message =
        axiosError.response?.data?.error ??
        axiosError.message ??
        (err instanceof Error ? err.message : "Nu am putut încărca fișierul. Încearcă din nou.");
      setUploadError(message);
    } finally {
      setUploadingBookingId(null);
      setUploadTarget(null);
      event.target.value = "";
    }
  };

  const handlePrintDocument = (url?: string | null) => {
    try {
      const { blobUrl, revoke } = resolvePdfUrl(url);
      const newWindow = window.open(blobUrl, "_blank", "noopener");
      if (!newWindow) {
        alert("Pop-up blocat. Permite deschiderea ferestrelor pentru print.");
      } else {
        newWindow.addEventListener("load", () => {
          newWindow.focus();
          newWindow.print();
        });
      }
      if (revoke) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch (err) {
      console.error("Print consent failed:", err);
      alert(err instanceof Error ? err.message : "Nu am putut pregăti fișierul pentru print.");
    }
  };

  if (!hydrated) {
    return null;
  }

  if (!user || (user.role !== "BUSINESS" && user.role !== "EMPLOYEE" && user.role !== "SUPERADMIN")) {
    return (
      <div className="min-h-screen bg-[#0B0E17] px-6 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-semibold">Acces restricționat</h1>
          <p className="mt-4 text-sm text-white/60">
            Această secțiune este disponibilă doar pentru conturile Business sau angajați.{" "}
            <Link href="/auth/login" className="text-[#6366F1] underline">
              Autentifică-te
            </Link>{" "}
            pentru a continua.
          </p>
        </div>
      </div>
    );
  }

  if (!businessId) {
    return (
      <div className="min-h-screen bg-[#0B0E17] px-6 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-semibold">Consimțăminte</h1>
          <p className="mt-4 text-sm text-white/60">
            Nu am găsit un business asociat contului tău. Adaugă un business pentru a urmări consimțămintele clienților.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Consimțăminte - LARSTEF</title>
      </Head>
      <div className="min-h-screen bg-[#0B0E17] px-6 py-10 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[#6366F1]">Consimțăminte digitale</p>
              <h1 className="text-3xl font-semibold">Gestionare consimțăminte</h1>
              <p className="mt-1 text-sm text-white/60">
                Vezi rapid clienții programați astăzi, verifică statusul consimțămintelor și descarcă documentele
                semnate.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
              <p className="text-xs uppercase tracking-wide text-white/40">Rezumat ziua curentă</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {signedCount}/{filteredBookings.length} consimțăminte semnate
              </p>
            </div>
          </header>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <form onSubmit={handleSearchSubmit} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Caută client (nume sau email)</span>
                <div className="relative">
                  <input
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Ex: Ana Popescu"
                    className="w-full rounded-2xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 pr-12 text-white outline-none transition focus:border-[#6366F1]"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-xl bg-[#6366F1] px-3 py-1 text-xs font-semibold text-white transition hover:bg-[#7C3AED]"
                  >
                    Caută
                  </button>
                </div>
              </label>

              <div className="flex flex-col gap-2 text-sm">
                <span className="text-white/70">Data</span>
                <DatePicker value={selectedDate} onChange={setSelectedDate} placeholder="Alege data" />
              </div>

              <div className="flex items-end justify-start gap-3">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/10"
                >
                  Resetează filtrele
                </button>
                <button
                  type="button"
                  onClick={() => setRefreshToken((prev) => prev + 1)}
                  className="rounded-2xl border border-[#6366F1]/40 bg-[#6366F1]/20 px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
                >
                  Actualizează
                </button>
              </div>
            </form>
          </section>

          {error && (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</p>
          )}
          {uploadError && (
            <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {uploadError}
            </p>
          )}

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Clienți programați</h2>
                <p className="text-sm text-white/60">
                  {new Date(selectedDate).toLocaleDateString("ro-RO", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              {loading && <p className="text-xs text-white/60">Se încarcă...</p>}
            </div>

            {filteredBookings.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-sm text-white/60">
                Nu există rezervări pentru criteriile selectate. Încearcă o altă zi sau un alt termen de căutare.
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {filteredBookings.map((booking) => {
                  const consentSigned = Boolean(booking.consentForm?.pdfUrl);
                  const timeLabel = new Date(booking.date).toLocaleTimeString("ro-RO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  return (
                    <div
                      key={booking.id}
                      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0B0E17]/60 p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-lg font-semibold text-white">{booking.client.name}</span>
                          <span className="text-xs text-white/50">{booking.client.email}</span>
                          {booking.client.phone && (
                            <span className="text-xs text-white/50">{booking.client.phone}</span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                          <span className="rounded-full border border-white/10 px-3 py-1">
                            {booking.service?.name ?? "Serviciu necunoscut"}
                          </span>
                          <span className="rounded-full border border-white/10 px-3 py-1">Ora {timeLabel}</span>
                          {booking.employee && (
                            <span className="rounded-full border border-white/10 px-3 py-1">
                              Specialist: {booking.employee.name}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 md:items-end">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                            consentSigned
                              ? "border border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                              : "border border-amber-400/40 bg-amber-400/10 text-amber-200"
                          }`}
                        >
                          <i className={`fas ${consentSigned ? "fa-check-circle" : "fa-clock"}`} />
                          {consentSigned ? "Consimțământ semnat" : "În așteptare"}
                        </span>
                        <div className="flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadDocument(booking.id, booking.consentForm?.pdfUrl)}
                            className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                          >
                            <i className="fas fa-file-download" />
                            Descarcă PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintDocument(booking.consentForm?.pdfUrl)}
                            className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                          >
                            <i className="fas fa-print" />
                            Print
                          </button>
                          <button
                            type="button"
                            onClick={() => openFilesModal(booking.client)}
                            className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                          >
                            <i className="fas fa-folder-open" />
                            Fișiere încărcate
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUploadClick(booking.id)}
                            className="flex items-center gap-2 rounded-2xl border border-[#6366F1]/40 bg-[#6366F1]/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#6366F1]/20"
                          >
                            <i className="fas fa-upload" />
                            {uploadingBookingId === booking.id ? "Se încarcă..." : "Încarcă fișier"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
        <input
          ref={fileInputRef}
          type="file"
        accept="application/pdf,image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {filesModalClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8" onClick={closeFilesModal}>
          <div
            className="w-full max-w-3xl rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-2xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[#6366F1]">Fișiere client</p>
                <h3 className="text-2xl font-semibold text-white">{filesModalClient.name}</h3>
                <p className="mt-1 text-sm text-white/60">
                  Toate documentele asociate acestui client pentru business-ul tău.
                </p>
              </div>
              <button
                type="button"
                onClick={closeFilesModal}
                className="rounded-2xl border border-white/10 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <i className="fas fa-times" />
              </button>
            </div>
            {clientDocumentsLoading ? (
              <div className="rounded-2xl border border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-center text-sm text-white/60">
                Se încarcă documentele...
              </div>
            ) : clientDocumentsError ? (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-6 text-sm text-red-200">
                {clientDocumentsError}
              </div>
            ) : (
              <>
                {clientDocuments.filter((doc) => doc.pdfUrl).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-sm text-white/60">
                    Nu există încă fișiere încărcate pentru acest client.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {clientDocuments
                      .filter((doc) => doc.pdfUrl)
                      .map((doc) => (
                        <div
                          key={doc.id}
                          className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0B0E17]/60 p-4 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="text-sm font-semibold text-white">
                              {doc.booking.service?.name ?? "Serviciu necunoscut"}
                            </p>
                            <p className="text-xs text-white/60">
                              {new Date(doc.booking.date).toLocaleString("ro-RO", {
                                weekday: "short",
                                day: "numeric",
                                month: "long",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            <p className="text-xs text-white/70">
                              Fișier: {doc.fileName ?? (doc.source === "BUSINESS_UPLOAD" ? "upload-fara-nume.pdf" : "document-generat.pdf")}
                            </p>
                            <p className="text-xs text-white/50">
                              Încărcat: {new Date(doc.createdAt).toLocaleString("ro-RO")}
                            </p>
                            <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-white/70">
                              <i className="fas fa-file-alt" />
                              {doc.source === "BUSINESS_UPLOAD" ? "Încărcat manual" : "Semnat digital"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenDocument(doc.pdfUrl ?? undefined)}
                              className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                            >
                              <i className="fas fa-eye" />
                              Deschide
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadDocument(doc.booking.id, doc.pdfUrl ?? undefined)}
                              className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                            >
                              <i className="fas fa-download" />
                              Descarcă
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}


"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxiosError } from "axios";
import Head from "next/head";
import Link from "next/link";
import useAuth from "../hooks/useAuth";
import useApi from "../hooks/useApi";
import DatePicker from "./DatePicker";

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

interface ConsentsPageProps {
  mode: "business" | "employee";
  title?: string;
  description?: string;
  pageTitle?: string;
}

export default function ConsentsPage({ mode, title, description, pageTitle }: ConsentsPageProps) {
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
  const [fileSearchQuery, setFileSearchQuery] = useState("");
  const [fileDateFilter, setFileDateFilter] = useState("");
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{ documentId: string; clientId: string; fileName: string } | null>(null);

  const businessId = user?.business?.id ?? user?.businessId ?? null;
  const employeeId = mode === "employee" ? user?.id ?? null : undefined;

  useEffect(() => {
    if (!hydrated || !businessId) {
      return;
    }
    if (mode === "employee" && !employeeId) {
      return;
    }

    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = {
          businessId,
          date: selectedDate,
        };
        if (employeeId) {
          params.employeeId = employeeId;
        }
        if (appliedSearch) {
          params.search = appliedSearch;
        }

        const { data } = await api.get<{ bookings: ConsentBooking[] }>("/consent", { params });
        if (isMounted) {
          setBookings(data.bookings ?? []);
        }
      } catch (err) {
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
  }, [api, appliedSearch, businessId, employeeId, hydrated, mode, refreshToken, selectedDate]);

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
        const params: Record<string, string> = { businessId };
        if (employeeId) {
          params.employeeId = employeeId;
        }
        const { data } = await api.get<{ documents: ClientDocument[] }>(`/consent/client/${clientId}`, { params });
        setClientDocuments(data.documents ?? []);
      } catch (err) {
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
    [api, businessId, employeeId]
  );

  const signedCount = useMemo(
    () => filteredBookings.filter((booking) => Boolean(booking.consentForm)).length,
    [filteredBookings]
  );

  const groupedDocuments = useMemo(() => {
    let filtered = clientDocuments.filter((doc) => doc.pdfUrl);

    if (fileSearchQuery.trim()) {
      const query = fileSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((doc) => {
        const fileName = (doc.fileName ?? (doc.source === "BUSINESS_UPLOAD" ? "upload-fara-nume.pdf" : "document-generat.pdf")).toLowerCase();
        const serviceName = (doc.booking.service?.name ?? "").toLowerCase();
        return fileName.includes(query) || serviceName.includes(query);
      });
    }

    if (fileDateFilter) {
      const [month, day] = fileDateFilter.split("-").map(Number);
      filtered = filtered.filter((doc) => {
        const date = new Date(doc.createdAt);
        return date.getMonth() + 1 === month && date.getDate() === day;
      });
    }

    const grouped = new Map<string, ClientDocument[]>();

    filtered.forEach((doc) => {
      const date = new Date(doc.createdAt);
      const dateKey = date.toISOString().split("T")[0];
      
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(doc);
    });

    // Pentru fiecare grup de dată, păstrează doar cel mai recent document pentru fiecare serviciu
    return Array.from(grouped.entries())
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .map(([dateKey, docs]) => {
        // Grupează documentele după serviciu
        const byService = new Map<string, ClientDocument>();
        
        docs.forEach((doc) => {
          const serviceId = doc.booking.service?.id ?? doc.booking.service?.name ?? "unknown";
          const existing = byService.get(serviceId);
          
          // Păstrează doar cel mai recent document pentru fiecare serviciu
          if (!existing || new Date(doc.createdAt).getTime() > new Date(existing.createdAt).getTime()) {
            byService.set(serviceId, doc);
          }
        });
        
        return {
          dateKey,
          date: new Date(dateKey),
          documents: Array.from(byService.values()).sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ),
        };
      });
  }, [clientDocuments, fileSearchQuery, fileDateFilter]);

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
      alert(err instanceof Error ? err.message : "Nu am putut descărca documentul.");
    }
  };

  const handleDeleteDocumentClick = (documentId: string, clientId: string, fileName: string) => {
    setDeleteConfirmModal({ documentId, clientId, fileName });
  };

  const handleDeleteDocumentConfirm = async () => {
    if (!deleteConfirmModal) return;

    const { documentId, clientId } = deleteConfirmModal;

    try {
      await api.delete(`/consent/document/${documentId}`);
      void fetchClientDocuments(clientId);
      setDeleteConfirmModal(null);
    } catch (err) {
      const axiosError = err as AxiosError<{ error?: string }>;
      const message =
        axiosError.response?.data?.error ??
        axiosError.message ??
        (err instanceof Error ? err.message : "Nu am putut șterge documentul. Încearcă din nou.");
      alert(message);
    }
  };

  const handleOpenDocument = (url?: string | null) => {
    try {
      const { blobUrl, revoke } = resolvePdfUrl(url);
      window.open(blobUrl, "_blank", "noopener");
      if (revoke) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch (err) {
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
    setFileSearchQuery("");
    setFileDateFilter("");
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
      if (newWindow) {
        newWindow.addEventListener("load", () => {
          newWindow.focus();
          newWindow.print();
        });
      }
      if (revoke) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Nu am putut pregăti fișierul pentru print.");
    }
  };

  if (!hydrated) {
    return null;
  }

  const requiredRole = mode === "employee" ? "EMPLOYEE" : "BUSINESS";
  const allowedRoles = mode === "employee" ? ["EMPLOYEE"] : ["BUSINESS", "EMPLOYEE", "SUPERADMIN"];

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="min-h-screen bg-[#0B0E17] px-6 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-semibold">Acces restricționat</h1>
          <p className="mt-4 text-sm text-white/60">
            Această secțiune este disponibilă doar pentru {mode === "employee" ? "angajați" : "conturile Business sau angajați"}.{" "}
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
            {mode === "employee"
              ? "Nu am găsit un business asociat contului tău. Contactează administratorul pentru a te adăuga la un business."
              : "Nu am găsit un business asociat contului tău. Adaugă un business pentru a urmări consimțămintele clienților."}
          </p>
        </div>
      </div>
    );
  }

  if (mode === "employee" && !employeeId) {
    return (
      <div className="min-h-screen bg-[#0B0E17] px-6 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-semibold">Consimțăminte</h1>
          <p className="mt-4 text-sm text-white/60">
            Nu am putut identifica angajatul. Contactează administratorul.
          </p>
        </div>
      </div>
    );
  }

  const defaultTitle = mode === "employee" ? "Consimțămintele mele" : "Gestionare consimțăminte";
  const defaultDescription = mode === "employee"
    ? "Vezi clienții programați la tine, verifică statusul consimțămintelor și descarcă documentele semnate."
    : "Vezi rapid clienții programați astăzi, verifică statusul consimțămintelor și descarcă documentele semnate.";
  const defaultPageTitle = mode === "employee" ? "Consimțămintele mele - LARSTEF" : "Consimțăminte - LARSTEF";
  const headerLabel = mode === "employee" ? "Consimțăminte angajat" : "Consimțăminte digitale";
  const emptyMessage = mode === "employee"
    ? "Nu ai rezervări pentru criteriile selectate. Încearcă o altă zi sau un alt termen de căutare."
    : "Nu există rezervări pentru criteriile selectate. Încearcă o altă zi sau un alt termen de căutare.";
  const filesModalDescription = mode === "employee"
    ? "Documentele asociate rezervărilor tale cu acest client."
    : "Toate documentele asociate acestui client pentru business-ul tău.";
  const filesModalEmptyMessage = mode === "employee"
    ? "Nu există încă fișiere încărcate pentru acest client la rezervările tale."
    : "Nu există încă fișiere încărcate pentru acest client.";

  return (
    <>
      <Head>
        <title>{pageTitle ?? defaultPageTitle}</title>
      </Head>
      <div className="min-h-screen bg-[#0B0E17] px-6 py-10 text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
          <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[#6366F1]">{headerLabel}</p>
              <h1 className="text-3xl font-semibold">{title ?? defaultTitle}</h1>
              <p className="mt-1 text-sm text-white/60">{description ?? defaultDescription}</p>
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
                <h2 className="text-xl font-semibold text-white">{mode === "employee" ? "Clienții mei programați" : "Clienți programați"}</h2>
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
                {emptyMessage}
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
                          <a
                            href={`mailto:${booking.client.email}`}
                            className="text-xs text-white/50 transition hover:text-[#6366F1] hover:underline"
                          >
                            {booking.client.email}
                          </a>
                          {booking.client.phone && (
                            <a
                              href={`tel:${booking.client.phone.replace(/\s/g, "")}`}
                              className="text-xs text-white/50 transition hover:text-[#6366F1] hover:underline"
                            >
                              {booking.client.phone}
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                          <span className="rounded-full border border-white/10 px-3 py-1">
                            {booking.service?.name ?? "Serviciu necunoscut"}
                          </span>
                          <span className="rounded-full border border-white/10 px-3 py-1">Ora {timeLabel}</span>
                          {booking.employee && mode === "business" && (
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
                            Descarcă consimțământ
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintDocument(booking.consentForm?.pdfUrl)}
                            className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                          >
                            <i className="fas fa-print" />
                            Print consimțământ
                          </button>
                          <button
                            type="button"
                            onClick={() => openFilesModal(booking.client)}
                            className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                          >
                            <i className="fas fa-folder-open" />
                            {mode === "employee" ? "Fișiere" : "Fișiere încărcate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUploadClick(booking.id)}
                            className="flex items-center gap-2 rounded-2xl border border-[#6366F1]/40 bg-[#6366F1]/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#6366F1]/20"
                          >
                            <i className="fas fa-upload" />
                            {uploadingBookingId === booking.id ? "Se încarcă..." : mode === "employee" ? "Încarcă" : "Încarcă fișier"}
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

      {/* Files Modal */}
      {filesModalClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8" onClick={closeFilesModal}>
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#0B0E17] p-8 shadow-2xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-[#6366F1]">Fișiere client</p>
                <h3 className="text-2xl font-semibold text-white">{filesModalClient.name}</h3>
                <p className="mt-1 text-sm text-white/60">{filesModalDescription}</p>
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
                {/* Search and Filter Section */}
                <div className="mb-6 space-y-3 rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center">
                    <div className="flex-1">
                      <label htmlFor="fileSearch" className="mb-1 block text-xs font-semibold text-white/70">
                        Caută după nume fișier sau serviciu
                      </label>
                      <div className="relative">
                        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                          id="fileSearch"
                          type="text"
                          value={fileSearchQuery}
                          onChange={(e) => setFileSearchQuery(e.target.value)}
                          placeholder="Ex: consent, upload, serviciu..."
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-10 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
                        />
                        {fileSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setFileSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                          >
                            <i className="fas fa-times" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="md:w-48">
                      <label htmlFor="fileDateFilter" className="mb-1 block text-xs font-semibold text-white/70">
                        Filtrează după dată (lună-zi)
                      </label>
                      <div className="relative">
                        <i className="fas fa-calendar absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                        <input
                          id="fileDateFilter"
                          type="text"
                          value={fileDateFilter}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, "");
                            if (value.length <= 5) {
                              let formatted = value;
                              if (value.length > 2) {
                                formatted = `${value.slice(0, 2)}-${value.slice(2)}`;
                              }
                              setFileDateFilter(formatted);
                            }
                          }}
                          placeholder="MM-ZZ (ex: 01-15)"
                          maxLength={5}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-10 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-[#6366F1] focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20"
                        />
                        {fileDateFilter && (
                          <button
                            type="button"
                            onClick={() => setFileDateFilter("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                          >
                            <i className="fas fa-times" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {(fileSearchQuery || fileDateFilter) && (
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <i className="fas fa-info-circle" />
                      <span>
                        {groupedDocuments.reduce((acc, group) => acc + group.documents.length, 0)} {groupedDocuments.reduce((acc, group) => acc + group.documents.length, 0) === 1 ? "document găsit" : "documente găsite"}
                      </span>
                    </div>
                  )}
                </div>
                {groupedDocuments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-sm text-white/60">
                    {fileSearchQuery || fileDateFilter
                      ? "Nu s-au găsit documente care să corespundă criteriilor de căutare."
                      : filesModalEmptyMessage}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupedDocuments.map((group) => (
                      <div
                        key={group.dateKey}
                        className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0B0E17]/60 p-4"
                      >
                        <div className="flex items-center gap-2">
                          <i className="fas fa-calendar-day text-[#6366F1]" />
                          <p className="text-sm font-semibold text-white">
                            {group.date.toLocaleDateString("ro-RO", {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                          <span className="text-xs text-white/50">
                            ({group.documents.length} {group.documents.length === 1 ? "fișier" : "fișiere"})
                          </span>
                        </div>
                        <div className="space-y-2">
                          {group.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/5 p-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="flex-1">
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
                                {!doc.id.startsWith("legacy-") && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDeleteDocumentClick(
                                        doc.id,
                                        filesModalClient?.id ?? "",
                                        doc.fileName ?? (doc.source === "BUSINESS_UPLOAD" ? "upload-fara-nume.pdf" : "document-generat.pdf")
                                      )
                                    }
                                    className="flex items-center gap-2 rounded-2xl border border-red-500/50 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
                                  >
                                    <i className="fas fa-trash" />
                                    Șterge
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 py-8"
          onClick={() => setDeleteConfirmModal(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-6 shadow-2xl shadow-black/40"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/20">
                <i className="fas fa-exclamation-triangle text-xl text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white">Confirmă ștergerea</h3>
                <p className="mt-1 text-sm text-white/70">
                  Ești sigur că vrei să ștergi acest document? Această acțiune nu poate fi anulată.
                </p>
                {deleteConfirmModal.fileName && (
                  <p className="mt-2 text-xs text-white/50">
                    Fișier: <span className="font-medium text-white/70">{deleteConfirmModal.fileName}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmModal(null)}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                Anulează
              </button>
              <button
                type="button"
                onClick={handleDeleteDocumentConfirm}
                className="flex-1 rounded-xl border border-red-500/50 bg-red-500/20 px-4 py-2.5 text-sm font-semibold text-red-400 transition hover:bg-red-500/30"
              >
                <i className="fas fa-trash mr-2" />
                Șterge
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


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

type ClientGroup = {
  client: { id: string; name: string; email: string; phone?: string | null };
  latestBooking: ConsentBooking;
  hasSignedConsent: boolean;
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

  const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
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
        };
        // Only include date if it's set
        if (selectedDate) {
          params.date = selectedDate;
        }
        if (employeeId) {
          params.employeeId = employeeId;
        }
        if (appliedSearch) {
          params.search = appliedSearch;
        }

        const { data } = await api.get<{ clientGroups: ClientGroup[] }>("/consent", { params });
        if (isMounted) {
          setClientGroups(data.clientGroups ?? []);
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

  const filteredClientGroups = useMemo(() => {
    const query = appliedSearch.trim().toLowerCase();
    if (!query) return clientGroups;
    return clientGroups.filter((group) => {
      const name = group.client.name?.toLowerCase() ?? "";
      const email = group.client.email?.toLowerCase() ?? "";
      return name.includes(query) || email.includes(query);
    });
  }, [appliedSearch, clientGroups]);

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
    () => filteredClientGroups.filter((group) => group.hasSignedConsent).length,
    [filteredClientGroups]
  );

  const totalBookingsCount = filteredClientGroups.length;

  const filteredDocuments = useMemo(() => {
    let filtered = clientDocuments.filter((doc) => doc.pdfUrl);

    if (fileSearchQuery.trim()) {
      const query = fileSearchQuery.toLowerCase().trim();
      filtered = filtered.filter((doc) => {
        const fileName = (doc.fileName ?? (doc.source === "BUSINESS_UPLOAD" ? "upload-fara-nume.pdf" : "document-generat.pdf")).toLowerCase();
        const serviceName = (doc.booking.service?.name ?? "").toLowerCase();
        return fileName.includes(query) || serviceName.includes(query);
      });
    }

    // Sort by creation date (most recent first)
    return filtered.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [clientDocuments, fileSearchQuery]);

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
      
      // Remove document from local state immediately for better UX
      setClientDocuments((prev) => prev.filter((doc) => doc.id !== documentId));
      
      // Refresh both the client documents modal and the main list
      await fetchClientDocuments(clientId);
      setRefreshToken((prev) => prev + 1);
      setDeleteConfirmModal(null);
    } catch (err) {
      console.error("Delete error:", err);
      const axiosError = err as AxiosError<{ error?: string; details?: string }>;
      const message =
        axiosError.response?.data?.error ??
        axiosError.response?.data?.details ??
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
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") {
            // Verify the data URL format
            if (!result.startsWith("data:")) {
              reject(new Error("Format fișier invalid. Te rog încearcă din nou."));
              return;
            }
            resolve(result);
          } else {
            reject(new Error("Nu am putut citi fișierul."));
          }
        };
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
      // Find booking in client groups
      const bookingForUpload = clientGroups
        .find((group) => group.latestBooking.id === uploadTarget);
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
  const defaultPageTitle = mode === "employee" ? "Consimțămintele mele - VOOB" : "Consimțăminte - VOOB";
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
                {signedCount}/{totalBookingsCount} consimțăminte semnate
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
                <DatePicker value={selectedDate} onChange={setSelectedDate} placeholder="Alege data" viewType="day" />
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

            {filteredClientGroups.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-sm text-white/60">
                {emptyMessage}
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {filteredClientGroups.map((group) => {
                  const booking = group.latestBooking;
                  const consentSigned = group.hasSignedConsent && Boolean(booking.consentForm?.pdfUrl);
                  const timeLabel = new Date(booking.date).toLocaleTimeString("ro-RO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const dateLabel = new Date(booking.date).toLocaleDateString("ro-RO", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });

                  return (
                    <div
                      key={group.client.id}
                      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0B0E17]/60 p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex flex-1 flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-lg font-semibold text-white">{group.client.name}</span>
                          <a
                            href={`mailto:${group.client.email}`}
                            className="text-xs text-white/50 transition hover:text-[#6366F1] hover:underline"
                          >
                            {group.client.email}
                          </a>
                          {group.client.phone && (
                            <a
                              href={`tel:${group.client.phone.replace(/\s/g, "")}`}
                              className="text-xs text-white/50 transition hover:text-[#6366F1] hover:underline"
                            >
                              {group.client.phone}
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-white/60 min-w-[140px]">Ultima intervenție:</span>
                            <span className="text-white">{booking.service?.name ?? "Serviciu necunoscut"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-white/60 min-w-[140px]">Ultima vizită:</span>
                            <span className="text-white">{dateLabel} - Ora {timeLabel}</span>
                          </div>
                          {booking.employee && mode === "business" && (
                            <div className="flex items-center gap-2">
                              <span className="text-white/60 min-w-[140px]">Specialist:</span>
                              <span className="text-white">{booking.employee.name}</span>
                            </div>
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
                          {consentSigned && booking.consentForm?.pdfUrl && (
                            <>
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
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handleUploadClick(booking.id)}
                            className="flex items-center gap-2 rounded-2xl border border-[#6366F1]/40 bg-[#6366F1]/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#6366F1]/20"
                          >
                            <i className="fas fa-upload" />
                            {uploadingBookingId === booking.id ? "Se încarcă..." : mode === "employee" ? "Încarcă" : "Încarcă fișier"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openFilesModal(group.client)}
                            className="flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                          >
                            <i className="fas fa-folder-open" />
                            {mode === "employee" ? "Fișiere" : "Fișiere încărcate"}
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
                {/* Search Section */}
                <div className="mb-6 space-y-3 rounded-2xl border border-white/10 bg-[#0B0E17]/40 p-4">
                  <div>
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
                  {fileSearchQuery && (
                    <div className="flex items-center gap-2 text-xs text-white/60">
                      <i className="fas fa-info-circle" />
                      <span>
                        {filteredDocuments.length} {filteredDocuments.length === 1 ? "document găsit" : "documente găsite"}
                      </span>
                    </div>
                  )}
                </div>
                {filteredDocuments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-[#0B0E17]/40 px-4 py-6 text-sm text-white/60">
                    {fileSearchQuery
                      ? "Nu s-au găsit documente care să corespundă criteriilor de căutare."
                      : filesModalEmptyMessage}
                  </div>
                ) : (
                  <div className="max-h-[60vh] overflow-y-auto overflow-x-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-[#0B0E17]/95 backdrop-blur-sm z-10">
                        <tr className="border-b border-white/10">
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/70">
                            Data încărcării
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/70">
                            Nume fișier
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-white/70">
                            Tip
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-white/70">
                            Acțiuni
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocuments.map((doc) => (
                          <tr key={doc.id} className="border-b border-white/5 hover:bg-white/5">
                            <td className="px-4 py-3 text-sm text-white/80">
                              {new Date(doc.createdAt).toLocaleString("ro-RO", {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-4 py-3 text-sm text-white">
                              {doc.fileName ?? (doc.source === "BUSINESS_UPLOAD" ? "upload-fara-nume.pdf" : "document-generat.pdf")}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-wide text-white/70">
                                <i className="fas fa-file-alt" />
                                {doc.source === "BUSINESS_UPLOAD" ? "Încărcat manual" : "Semnat digital"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenDocument(doc.pdfUrl ?? undefined)}
                                  className="flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                                  title="Preview"
                                >
                                  <i className="fas fa-eye" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadDocument(doc.booking.id, doc.pdfUrl ?? undefined)}
                                  className="flex items-center gap-2 rounded-2xl border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                                  title="Descarcă"
                                >
                                  <i className="fas fa-download" />
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
                                    className="flex items-center gap-2 rounded-2xl border border-red-500/50 px-3 py-1.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
                                    title="Șterge"
                                  >
                                    <i className="fas fa-trash" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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


"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CookiePreferencesButton from "../components/CookiePreferencesButton";
import { logger } from "../lib/logger";

export default function Home() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  // Format date to YYYY-MM-DD without timezone conversion
  const formatDateToString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getDefaultDemoDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDateToString(tomorrow);
  };
  const minDemoDate = formatDateToString(new Date());
  const [demoDate, setDemoDate] = useState(getDefaultDemoDate);
  const [availableSlots, setAvailableSlots] = useState<Array<{ iso: string; label: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [demoForm, setDemoForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const [showDemoSuccess, setShowDemoSuccess] = useState(false);
  const [isDemoCalendarOpen, setIsDemoCalendarOpen] = useState(false);
  const [demoCalendarMonth, setDemoCalendarMonth] = useState(() => {
    const initial = new Date(minDemoDate);
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const demoCalendarRef = useRef<HTMLDivElement | null>(null);
  // Parse date string (YYYY-MM-DD) to local date without timezone issues
  const parseLocalDate = (dateString: string): Date => {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
  };
  const minDemoDateObj = useMemo(() => parseLocalDate(minDemoDate), [minDemoDate]);
  const selectedDemoDateObj = useMemo(() => parseLocalDate(demoDate), [demoDate]);
  const demoDateDisplay = useMemo(() => {
    return new Intl.DateTimeFormat("ro-RO", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Bucharest",
    }).format(selectedDemoDateObj);
  }, [selectedDemoDateObj]);
  const demoCalendarTitle = useMemo(
    () =>
      new Intl.DateTimeFormat("ro-RO", {
        month: "long",
        year: "numeric",
      }).format(demoCalendarMonth),
    [demoCalendarMonth]
  );
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };
  const calendarWeeks = useMemo(() => {
    const monthStart = new Date(demoCalendarMonth.getFullYear(), demoCalendarMonth.getMonth(), 1);
    const daysInMonth = new Date(demoCalendarMonth.getFullYear(), demoCalendarMonth.getMonth() + 1, 0).getDate();
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const weeks: Array<Array<Date | null>> = [];
    let currentWeek: Array<Date | null> = [];
    for (let i = 0; i < firstWeekday; i++) {
      currentWeek.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      currentWeek.push(currentDate);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }
    return weeks;
  }, [demoCalendarMonth]);
  const isMinMonth =
    demoCalendarMonth.getFullYear() === minDemoDateObj.getFullYear() &&
    demoCalendarMonth.getMonth() === minDemoDateObj.getMonth();
  const handleDemoDateSelect = (date: Date) => {
    setDemoDate(formatDateToString(date));
    setIsDemoCalendarOpen(false);
  };
  const handlePrevMonth = () => {
    if (isMinMonth) return;
    setDemoCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setDemoCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  useEffect(() => {
    setDemoCalendarMonth((prev) => {
      if (prev.getFullYear() === selectedDemoDateObj.getFullYear() && prev.getMonth() === selectedDemoDateObj.getMonth()) {
        return prev;
      }
      return new Date(selectedDemoDateObj.getFullYear(), selectedDemoDateObj.getMonth(), 1);
    });
  }, [selectedDemoDateObj]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (demoCalendarRef.current && !demoCalendarRef.current.contains(event.target as Node)) {
        setIsDemoCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchAvailableSlots = useCallback(
    async (date: string) => {
      if (!date) return;
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/landing/available-slots?date=${date}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || "Nu am putut încărca intervalele disponibile.");
        }
        const data = await response.json();
        const slots: Array<{ iso: string; label: string }> = Array.isArray(data?.slots) ? data.slots : [];
        setAvailableSlots(slots);
        setSelectedSlot((prev) => {
          if (prev && slots.some((slot) => slot.iso === prev)) {
            return prev;
          }
          return slots[0]?.iso ?? null;
        });
      } catch (error) {
        logger.error("Available slots fetch failed:", error);
        setSlotsError(error instanceof Error ? error.message : "Nu am putut încărca intervalele.");
        setAvailableSlots([]);
        setSelectedSlot(null);
      } finally {
        setSlotsLoading(false);
      }
    },
    [API_BASE_URL]
  );

  useEffect(() => {
    void fetchAvailableSlots(demoDate);
  }, [demoDate, fetchAvailableSlots]);

  const handleDemoInputChange =
    (field: keyof typeof demoForm) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setDemoForm((prev) => ({ ...prev, [field]: value }));
    };

  const handleDemoSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSlot) {
      setDemoError("Te rugăm să alegi un interval disponibil.");
      return;
    }
    if (!demoForm.firstName.trim() || !demoForm.lastName.trim() || !demoForm.email.trim() || !demoForm.phone.trim()) {
      setDemoError("Completează toate câmpurile obligatorii.");
      return;
    }
    setDemoSubmitting(true);
    setDemoError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/landing/demo-booking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: demoForm.firstName.trim(),
          lastName: demoForm.lastName.trim(),
          email: demoForm.email.trim(),
          phone: demoForm.phone.trim(),
          dateTime: selectedSlot,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Nu am putut programa demo-ul.");
      }

      setShowDemoSuccess(true);
      setDemoForm({ firstName: "", lastName: "", email: "", phone: "" });
      void fetchAvailableSlots(demoDate);
    } catch (error) {
      logger.error("Demo booking failed:", error);
      setDemoError(error instanceof Error ? error.message : "Nu am putut programa demo-ul.");
    } finally {
      setDemoSubmitting(false);
    }
  };

  useEffect(() => {
    // Lock body scroll when sidebar or video modal is open
    if (isSidebarOpen || isVideoModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen, isVideoModalOpen]);

  useEffect(() => {
    // Handle only anchor links (starting with #) for smooth scrolling
    // This handler explicitly ignores Next.js routes (starting with /)
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      let anchor: HTMLAnchorElement | null = null;

      // Find the anchor element
      let current: HTMLElement | null = target;
      while (current && current !== document.body) {
        if (current.tagName === "A") {
          anchor = current as HTMLAnchorElement;
          break;
        }
        current = current.parentElement;
      }

      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href");

      // CRITICAL: Exit early if href is a route path (starts with /)
      // This MUST be checked FIRST before any querySelector call
      if (!href || href.startsWith("/")) {
        // This is a Next.js route or no href - let Next.js handle it
        return;
      }

      // Only process anchor links (must start with #)
      if (!href.startsWith("#") || href === "#") {
        // Not an anchor link - let browser handle it
        return;
      }

      // Safety check: anchors should not contain slashes
      if (href.includes("/")) {
        return;
      }

      // Validate it's a proper anchor format
      if (!/^#[\w-]+$/.test(href)) {
        return;
      }

      // At this point, href is guaranteed to be a valid anchor like "#section"
      // It's safe to use querySelector
      event.preventDefault();
      event.stopPropagation();

      const element = document.querySelector(href);
      if (!element) {
        return;
      }

      // Calculate header height
      const mobileHeader = document.querySelector<HTMLElement>(".mobile-header");
      const desktopNav = document.querySelector<HTMLElement>(".desktop-nav");

      let headerHeight = 0;
      const extraOffset = 20;

      if (window.innerWidth <= 1023) {
        headerHeight = (mobileHeader?.offsetHeight || 60) + extraOffset;
      } else {
        headerHeight = (desktopNav?.offsetHeight || 80) + extraOffset;
      }

      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight;

      window.scrollTo({
        top: Math.max(0, offsetPosition),
        behavior: "smooth",
      });

      if (isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    };

    // Use bubbling phase (not capture) so Next.js can handle routes first
    document.addEventListener("click", handleClick, false);

    // Set up IntersectionObserver for card animations
    const cards = document.querySelectorAll<HTMLElement>(
      ".card, .pricing-card"
    );
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, index) => {
          if (entry.isIntersecting) {
            const element = entry.target;
            if (!(element instanceof HTMLElement)) {
              return;
            }

            window.setTimeout(() => {
              element.style.opacity = "1";
              element.style.transform = "translateY(0)";
            }, index * 50);
          }
        });
      },
      { threshold: 0.1 }
    );

    cards.forEach((card) => {
      card.style.opacity = "0";
      card.style.transform = "translateY(20px)";
      card.style.transition = "all 0.5s ease";
      observer.observe(card);
    });

    // Cleanup function
    return () => {
      document.removeEventListener("click", handleClick, true);
      observer.disconnect();
    };
  }, [isSidebarOpen]);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <>
      {/* Mobile Header */}
      <header className="mobile-header">
        <div className="mobile-logo">
          <div className="logo">VOOB</div>
          <div className="logo-motto">your time!</div>
        </div>
        <button
          className="mobile-menu-btn"
          onClick={toggleSidebar}
          aria-label="Open menu"
        >
          <i className="fas fa-bars"></i>
        </button>
      </header>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar}></div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo">VOOB</div>
            <div className="logo-motto">your time!</div>
          </div>
          <button
            className="sidebar-close-btn"
            onClick={closeSidebar}
            aria-label="Close menu"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <nav className="sidebar-menu">
          <Link href="#despre" onClick={closeSidebar}>
            Despre
          </Link>
          <Link href="#cum-functioneaza-client" onClick={closeSidebar}>
            Pentru Clienți
          </Link>
          <Link href="#cum-functioneaza-afacere" onClick={closeSidebar}>
            Pentru Afacere
          </Link>
          <Link href="#pachete-preturi" onClick={closeSidebar}>
            Abonamente
          </Link>
          <Link href="#contact-business" onClick={closeSidebar}>
            Contact
          </Link>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px", alignItems: "flex-start" }}>
            <Link href="/auth/login" className="btn-nav btn-nav-secondary" onClick={closeSidebar}>
              Intră în cont
            </Link>
            <Link href="/auth/register" className="btn-nav" onClick={closeSidebar}>
              Creează cont
            </Link>
          </div>
        </nav>
      </aside>

      {/* Desktop Nav */}
      <nav className="desktop-nav">
        <div className="logo-container">
          <div className="logo">VOOB</div>
          <div className="logo-motto">your time!</div>
        </div>
        <div className="nav-links">
          <Link href="#despre">Despre</Link>
          <Link href="#cum-functioneaza-client">Pentru Clienți</Link>
          <Link href="#cum-functioneaza-afacere">Pentru Afacere</Link>
          <Link href="#pachete-preturi">Abonamente</Link>
          <Link href="#contact-business">Contact</Link>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <Link href="/auth/login" className="btn-nav btn-nav-secondary">
              Intră în cont
            </Link>
            <Link href="/auth/register" className="btn-nav">
              Creează cont
            </Link>
          </div>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-tag">Sistem de booking online</div>
          <h1 className="font-size-40 mb-4">
            Platforma <span className="gradient-text">completă</span> pentru
            <br />
            a-ți <span className="gradient-text">automatiza</span> afacerea
          </h1>
          {/* <p className="subtitle mb-0">
            Prima platformă inteligentă din România care unește rezervările, plățile online, consimțămintele și AI-ul într-un singur loc.
          </p> */}
          <p className="subtitle mb-10">
            Automatizează programările, primește plăți instant și lasă AI-ul să optimizeze afacerea ta.
            <br />
            <strong style={{ color: "rgba(99, 102, 241, 0.9)" }}>Gratuit pentru clienți. Simplu pentru business.</strong>
          </p>
          <div className="cta-buttons">
            <Link href="/auth/register" className="btn btn-primary">
              Începe gratuit <i className="fas fa-arrow-right" />
            </Link>
          </div>

          <div className="demo-preview">
            <div className="demo-window">
              <Image
                src="/images/img-hero.png"
                alt="Previzualizare VOOB"
                width={960}
                height={600}
                className="demo-image"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      <section id="ai-section">
        <div className="ai-container">
          <div className="ai-image">
            <div className="ai-image-wrapper" onClick={() => setIsVideoModalOpen(true)}>
              <img src="/images/img1.png" alt="VOOB AI" className="ai-preview-image" />
              <div className="ai-play-button">
                <i className="fas fa-play"></i>
              </div>
            </div>
          </div>
          <div className="ai-content">
            <h2 className="ai-title">VOOB AI</h2>
            <h3 className="ai-subtitle">Asistentul tău inteligent pentru rezervări și management</h3>
            <p className="ai-text">
              Cu VOOB AI poți crea, modifica sau anula programări doar printr-un mesaj.
              AI-ul verifică disponibilitatea, gestionează calendarul, răspunde la întrebări
              și poate genera rapid rapoarte pentru afacerea ta. Totul automat, fără pași
              complicați.
            </p>
          </div>
        </div>
      </section>

      <section className="klarna-section">
        <div className="klarna-container">
          <div className="klarna-content pb-20 pt-20">
            <h2 className="klarna-title">Opțiuni de plată</h2>
            <h3 className="klarna-subtitle">Modalități flexibile de plată</h3>
            <p className="klarna-text">
              Fă o rezervare acum in platforma VOOB și plătește mai târziu cu opțiunile flexibile de plată
              Klarna. Poți alege dacă vrei să plătești imediat, în 30 de zile sau în 3
              rate fără dobândă.
            </p>
            <img src="/images/logo-klarna.svg" alt="Klarna" width={160} height={60}/>
          </div>
          <div className="klarna-image">
            <div className="klarna-logo-placeholder">
              <img src="/images/klarna-img.avif" alt="Klarna" />
            </div>
          </div>
        </div>
      </section>

     

      {/* Video Modal */}
      {isVideoModalOpen && (
        <div className="video-modal-overlay" onClick={() => setIsVideoModalOpen(false)}>
          <div className="video-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="video-modal-close"
              onClick={() => setIsVideoModalOpen(false)}
              aria-label="Close video"
            >
              <i className="fas fa-times"></i>
            </button>
            <div className="video-modal-wrapper">
              <iframe
                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                title="VOOB AI Video"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="video-modal-iframe"
              ></iframe>
            </div>
          </div>
        </div>
      )}

      <section id="despre">
        <h2 className="section-title">De ce noi?</h2>
        <p className="section-subtitle">
          Funcționalități unice, tehnologie avansată și experiență simplă. 
          <br />
          Tot ce ai nevoie pentru a transforma modul în care gestionezi rezervările și crești afacerea.
        </p>
        <div className="grid">
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-calendar-check" />
            </div>
            <h3>Calendar inteligent sincronizat</h3>
            <p>
              Gestionează programările în timp real cu sincronizare automată pe
              toate dispozitivele.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-bolt" />
            </div>
            <h3>Plăți automate și instant</h3>
            <p>
              Acceptă plăți online prin Stripe, în rate cu Klarna, și primești banii direct
              în contul tău.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-robot" />
            </div>
            <h3>Automatizări AI</h3>
            <p>
              Inteligență artificială care optimizează programările, reduce
              absențele și sugerează cele mai bune intervale orare.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-bell" />
            </div>
            <h3>Notificări automate</h3>
            <p>
              Trimite reminder-uri și confirmări prin SMS și email pentru toate programările,
              fără niciun efort.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-qrcode" />
            </div>
            <h3>QR Code pentru business</h3>
            <p>
              Clienții pot scana QR-ul tău pentru a se conecta instant la business-ul tău
              și a face rezervări rapid.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-file-pdf" />
            </div>
            <h3>Consimțăminte și documente PDF</h3>
            <p>
              Generează automat consimțăminte personalizate cu semnătură electronică,
              perfect pentru business-uri medicale.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-users-cog" />
            </div>
            <h3>Management angajați</h3>
            <p>
              Gestionează echipa ta, programul de lucru al fiecărui specialist și
              programările per angajat.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-redo-alt" />
            </div>
            <h3>Reprogramare și anulare online</h3>
            <p>
              Clienții pot modifica sau anula programările online, oricând, fără să fie nevoie
              de telefoane sau bătăi de cap.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-history" />
            </div>
            <h3>Istoric rezervări</h3>
            <p>
              Acces instant la toate programările anterioare, organizate într-un
              singur loc, cu toate detaliile.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-shield-alt" />
            </div>
            <h3>Securitate maximă</h3>
            <p>
              Infrastructură AWS cu certificare GDPR. Datele tale și ale clienților
              sunt protejate la cele mai înalte standarde.
            </p>
          </div>
        </div>
      </section>

      <section
        id="cum-functioneaza-client"
        style={{ background: "rgba(255, 255, 255, 0.02)" }}
      >
        <h2 className="section-title">
          Cum funcționează pentru tine
        </h2>
        <p className="section-subtitle">
          Rezervări rapide, plăți flexibile și gestionare simplă a programărilor. 
          <br />
          Platforma este complet gratuită pentru clienți, plătești doar serviciile, nu platforma.
        </p>
        <div className="grid">
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-user-plus" />
            </div>
            <h3>Creează-ți contul gratuit în câteva secunde</h3>
            <p>Înregistrează-te rapid cu e-mailul tău. Nu necesită card de credit și nu plătești nimic pentru utilizarea platformei.</p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Platforma VOOB este complet gratuită pentru clienți. Poți face rezervări, gestiona programările și beneficia de toate funcționalitățile fără costuri.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-qrcode" />
            </div>
            <h3>Scanează QR-ul business-ului</h3>
            <p>Fiecare partener VOOB are un cod QR unic. Scanează-l pentru a te conecta instant la business-ul lor.</p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              După scanare, business-ul apare automat în lista ta și poți vedea toate serviciile disponibile, prețurile și specialiștii.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Poți fi conectat la mai multe business-uri simultan.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-search" />
            </div>
            <h3>Alege serviciul sau specialistul tău preferat</h3>
            <p>Vezi toate serviciile disponibile, prețurile, durata și specialiștii pentru fiecare business conectat.</p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Poți alege un serviciu specific sau un specialist anume. Vezi disponibilitatea în timp real și programează-te exact când vrei.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Totul într-o interfață curată și intuitivă.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-calendar-check" />
            </div>
            <h3>Fă programări manual sau cu ajutorul AI</h3>
            <p>Poți alege ora perfectă direct din calendar sau îi spui AI-ului în limbaj natural:</p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
                fontStyle: "italic",
              }}
            >
              „Programează-mă la tuns vineri după-amiază.”
            </p>
            <p style={{ marginTop: 12 }}>
              VOOB verifică automat disponibilitatea, sugerează cele mai bune intervale și confirmă rezervarea pentru tine.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-file-signature" />
            </div>
            <h3>Completează consimțământul (dacă e necesar)</h3>
            <p>Pentru business-uri medicale (stomatolog, psiholog, etc.), completezi digital formularul de consimțământ.</p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Semnezi electronic, documentul se salvează automat în PDF și este accesibil oricând. Totul securizat și conform GDPR.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-credit-card" />
            </div>
            <h3>Plătește cum vrei: online sau la locație</h3>
            <p>După confirmarea rezervării, alegi metoda de plată:</p>
            <ul>
              <li>
                <i className="fas fa-check" />
                Instant online, cu cardul prin Stripe (securizat),
              </li>
              <li>
                <i className="fas fa-check" />
                În rate fără dobândă prin Klarna,
              </li>
              <li>
                <i className="fas fa-check" />
                Sau plătești direct la locație.
              </li>
            </ul>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Flexibilitate maximă, siguranță totală.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-bell" />
            </div>
            <h3>Primește notificări automate</h3>
            <p>VOOB îți trimite automat confirmări și reminder-uri prin SMS și email:</p>
            <ul>
              <li>
                <i className="fas fa-check" />Confirmare imediată după rezervare
              </li>
              <li>
                <i className="fas fa-check" />Reminder cu 24h înainte de programare
              </li>
              <li>
                <i className="fas fa-check" />Notificări pentru reprogramări sau anulări
              </li>
            </ul>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Nu mai uiți niciodată o programare.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-redo-alt" />
            </div>
            <h3>Gestionează rezervările online</h3>
            <p>Modifică sau anulează programările direct din cont, oricând, fără să fie nevoie de telefoane.</p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Vezi toate rezervările tale într-un singur loc, istoricul complet și poți reprograma cu un singur click. Business-ul este notificat automat.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Control total, fără bătăi de cap.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-brain" />
            </div>
            <h3>Beneficiază de recomandări AI inteligente</h3>
            <p>VOOB AI analizează programările tale și îți oferă sugestii personalizate:</p>
            <ul>
              <li>
                <i className="fas fa-check" />Ore recomandate bazate pe disponibilitate
              </li>
              <li>
                <i className="fas fa-check" />Reminder-uri pentru programări recurente
              </li>
              <li>
                <i className="fas fa-check" />Sugestii pentru optimizarea programului tău
              </li>
            </ul>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              AI-ul tău personal îți organizează timpul perfect.
            </p>
          </div>
        </div>
      </section>

      <section id="cum-functioneaza-afacere">
        <h2 className="section-title">
          Cum funcționează pentru afacerea ta
        </h2>
        <p className="section-subtitle">
          De la setup la optimizare: automatizează rezervările, gestionează plățile și crește eficiența afacerii tale într-un singur loc. 
          <br />
          Fără complicații, fără costuri ascunse, doar rezultate.
        </p>
        <div className="grid">
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-building" />
            </div>
            <h3>Creează contul tău de business</h3>
            <p>
              Înregistrează-ți afacerea pe VOOB în doar câteva minute. Adaugă
              numele, tipul de business și datele de contact.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Alege tipul de business (stomatolog, beauty, psiholog, etc.) pentru a activa automat consimțămintele necesare.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Proces simplu, ghidat pas cu pas.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-id-card" />
            </div>
            <h3>Completează onboarding-ul și conectează plățile</h3>
            <p>
              Completează datele legale (CUI, date reprezentant, cont bancar) și conectează-ți contul Stripe pentru plăți online.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Procesul de verificare KYC este ghidat și securizat. După aprobare, primești plăți direct în contul tău Stripe.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              O singură dată, apoi totul funcționează automat.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-users-cog" />
            </div>
            <h3>Adaugă echipa și serviciile</h3>
            <p>Configurează fiecare specialist și serviciu simplu și intuitiv.</p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Adaugă angajații, serviciile cu prețuri și durate, și fiecare specialist poate avea propriul program de lucru.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Totul apare automat pentru clienți, tu doar gestionezi conținutul.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-clock" />
            </div>
            <h3>Configurează programul de lucru</h3>
            <p>
              Setează orele de lucru pentru fiecare zi, pauzele și concediile. Fiecare angajat poate avea program personalizat.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Calendarul se actualizează automat, clienții văd doar intervalele disponibile și nu pot rezerva în pauze sau concedii.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Flexibilitate maximă, control total.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-qrcode" />
            </div>
            <h3>Generează QR code-ul tău</h3>
            <p>
              Fiecare business primește un QR code unic pe care clienții îl pot scana pentru a se conecta instant.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Descarcă posterul cu QR sau partajează linkul direct. Clienții se conectează instant și pot face rezervări imediat.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Simplu, rapid, eficient.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-calendar-alt" />
            </div>
            <h3>Gestionează programările fără stres</h3>
            <p>
              Calendarul tău vizual îți arată tot ce contează: rezervări, reprogramări, pauze și concedii.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Vezi toate rezervările într-un singur loc, modifică sau anulează cu un click, și primești notificări pentru fiecare acțiune.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Mai puțin timp pierdut, mai mult profit.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-wallet" />
            </div>
            <h3>Primește plăți direct în contul tău</h3>
            <p>
              După conectarea Stripe Connect, primești toate plățile direct în contul tău, instant.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Clienții pot plăti integral cu cardul sau în rate prin Klarna - tu primești suma completă pe loc, fără întârzieri.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Transparent, sigur, fără griji.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-file-pdf" />
            </div>
            <h3>Consimțăminte automate (pentru medical)</h3>
            <p>
              Pentru business-uri medicale, VOOB generează automat consimțămintele necesare cu semnătură electronică.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Clienții completează și semnează digital, documentele se salvează automat în PDF și sunt accesibile oricând.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Conform GDPR, securizat, automatizat.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-bell" />
            </div>
            <h3>Notificări automate pentru clienți</h3>
            <p>
              VOOB trimite automat confirmări și reminder-uri clienților prin SMS și email.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Confirmare imediată după rezervare, reminder cu 24h înainte, și notificări pentru reprogramări sau anulări.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Reduci absențele, crești satisfacția clienților.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-chart-line" />
            </div>
            <h3>Lasă AI-ul să-ți optimizeze afacerea</h3>
            <p>AI Insights analizează rezervările și îți oferă recomandări clare:</p>
            <ul>
              <li>
                <i className="fas fa-check" />
                Ore profitabile și intervale populare
              </li>
              <li>
                <i className="fas fa-check" />
                Clienți recurenți și oportunități de retenție
              </li>
              <li>
                <i className="fas fa-check" />
                Servicii populare și sugestii de optimizare
              </li>
            </ul>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Afacerea ta devine mai inteligentă cu fiecare zi.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-robot" />
            </div>
            <h3>Asistent AI integrat</h3>
            <p>
              Chat AI care te ajută să gestionezi rezervări, răspunzi la întrebări și optimizezi programul.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Poți crea, modifica sau anula rezervări prin chat, AI-ul verifică disponibilitatea și confirmă automat.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Tu te concentrezi pe servicii, AI-ul se ocupă de administrare.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-credit-card" />
            </div>
            <h3>Alege planul potrivit</h3>
            <p>
              VOOB PRO (149 lei/lună) sau VOOB BUSINESS (299 lei/lună) cu trial gratuit de 30 zile (o lună completă).
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Fiecare plan include hosting AWS, funcționalități complete, și suport. Fără costuri ascunse, fără comisioane pe tranzacții.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Testează gratuit, apoi alege planul care se potrivește afacerii tale.
            </p>
          </div>
        </div>
      </section>

      <section id="pachete-preturi" className="pricing-section">
        <h2 className="section-title">Alege planul potrivit pentru afacerea ta</h2>
        <p className="section-subtitle">Două planuri simple. Hosting pe AWS. Fără costuri ascunse.</p>
        <div className="grid pricing-grid-compact mobile:px-10 px-0">
          <div className="pricing-card card pricing-card-compact">
            <h3 style={{ textAlign: "left" }}>VOOB PRO</h3>
            <div className="price" style={{ textAlign: "left" }}>
              149 lei<span>/lună</span>
            </div>
            <ul>
              <li>
                <i className="fas fa-check" /> Calendar complet și rezervări
              </li>
              <li>
                <i className="fas fa-check" /> Online booking
              </li>
              <li>
                <i className="fas fa-check" /> Notificări SMS
              </li>
              <li>
                <i className="fas fa-check" /> AI VOOB integrat
              </li>
              <li>
                <i className="fas fa-check" /> Plată card online + plată la sediu
              </li>
              <li>
                <i className="fas fa-check" /> Documente PDF + semnătură electronică
              </li>
              <li>
                <i className="fas fa-check" /> QR Code direct pentru business
              </li>
              <li>
                <i className="fas fa-check" /> Hosting pe AWS inclus
              </li>
              <li>
                <i className="fas fa-check" /> 1 utilizator business
              </li>
              <li>
                <i className="fas fa-check" /> 150 SMS / lună
              </li>
              <li>
                <i className="fas fa-check" /> Suport în 24-48h
              </li>
            </ul>
            <Link href="/auth/register" className="btn-pricing">
              Începe acum
            </Link>
          </div>

          <div className="pricing-card popular card pricing-card-compact">
            <div className="popular-badge">CEA MAI POPULARĂ</div>
            <h3 style={{ textAlign: "left" }}>VOOB BUSINESS</h3>
            <div className="price" style={{ textAlign: "left" }}>
              299 lei<span>/lună</span>
            </div>
            <ul>
              <li>
                <i className="fas fa-check" /> Tot din VOOB PRO +
              </li>
              <li>
                <i className="fas fa-check" /> 5 utilizatori incluși
              </li>
              <li>
                <i className="fas fa-check" /> 500 SMS / lună
              </li>
              <li>
                <i className="fas fa-check" /> Onboarding asistat
              </li>
              <li>
                <i className="fas fa-check" /> Suport prioritar 2-4h
              </li>
              <li>
                <i className="fas fa-check" /> Suport telefonic
              </li>
              <li>
                <i className="fas fa-check" /> Hosting pe AWS inclus
              </li>
            </ul>
            <Link href="/auth/register" className="btn-pricing">
              Începe acum
            </Link>
          </div>
        </div>
      </section>

      <section id="contact-business" className="contact-form-section py-10">
        <h2 className="section-title">Ești interesat pentru afacerea ta?</h2>
        <p className="section-subtitle">
          Programează un demo live de o oră, de luni până vineri între 15:00 și 19:00. Alegi data, alegi intervalul, iar noi îți trimitem
          instant linkul de Google Meet plus SMS și email de confirmare.
        </p>
        <div className="form-container">
          <div className="form-card">
            <form id="demo-booking-form" onSubmit={handleDemoSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="demo-date">Alege data *</label>
                  <div className="date-picker" ref={demoCalendarRef}>
                    <button
                      type="button"
                      className={`date-picker-trigger ${isDemoCalendarOpen ? "open" : ""}`}
                      onClick={() => setIsDemoCalendarOpen((prev) => !prev)}
                    >
                      <span>{demoDateDisplay}</span>
                      <i className="fas fa-calendar-alt" />
                    </button>
                    {isDemoCalendarOpen && (
                      <div className="date-picker-panel">
                        <div className="date-picker-header">
                          <button
                            type="button"
                            onClick={handlePrevMonth}
                            disabled={isMinMonth}
                            aria-label="Luna anterioară"
                          >
                            <i className="fas fa-chevron-left" />
                          </button>
                          <span className="date-picker-title">{demoCalendarTitle}</span>
                          <button type="button" onClick={handleNextMonth} aria-label="Luna următoare">
                            <i className="fas fa-chevron-right" />
                          </button>
                        </div>
                        <div className="date-picker-weekdays">
                          {["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"].map((day) => (
                            <span key={day}>{day}</span>
                          ))}
                        </div>
                        <div className="date-picker-grid">
                          {calendarWeeks.map((week, weekIndex) => (
                            <div key={`week-${weekIndex}`} className="date-picker-row">
                              {week.map((dateCell, cellIndex) => {
                                if (!dateCell) {
                                  return <span key={`empty-${weekIndex}-${cellIndex}`} className="date-picker-cell empty" />;
                                }
                                const disabled = dateCell < minDemoDateObj || isWeekend(dateCell);
                                const selected = isSameDay(dateCell, selectedDemoDateObj);
                                return (
                                  <button
                                    key={dateCell.toISOString()}
                                    type="button"
                                    className={`date-picker-cell ${selected ? "selected" : ""} ${
                                      disabled ? "disabled" : ""
                                    }`}
                                    onClick={() => handleDemoDateSelect(dateCell)}
                                    disabled={disabled}
                                  >
                                    {dateCell.getDate()}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                        <p className="date-picker-hint">Programările demo sunt disponibile luni-vineri.</p>
                      </div>
                    )}
                    <input type="hidden" id="demo-date" name="demo-date" value={demoDate} readOnly />
                  </div>
                </div>
                <div className="form-group">
                  <label>Interval disponibil *</label>
                  <div className="slot-grid">
                    {slotsLoading ? (
                      <p style={{ color: "rgba(255,255,255,0.7)" }}>Se încarcă intervalele...</p>
                    ) : slotsError ? (
                      <p style={{ color: "#f87171" }}>{slotsError}</p>
                    ) : availableSlots.length === 0 ? (
                      <p style={{ color: "#6366F1", fontWeight: 500 }}>
                        Nu există sloturi libere pentru data selectată. Alege altă zi.
                      </p>
                    ) : (
                      <div className="slot-grid-inner gap-2">
                        {availableSlots.map((slot) => {
                          const isActive = selectedSlot === slot.iso;
                          return (
                            <button
                              key={slot.iso}
                              type="button"
                              onClick={() => setSelectedSlot(slot.iso)}
                              className={`slot-button ${isActive ? "active" : ""}`}
                              aria-pressed={isActive}
                              style={{
                                flex: "1 0 45%",
                              }}
                            >
                              {slot.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="demo-first-name">Prenume *</label>
                  <input
                    type="text"
                    id="demo-first-name"
                    name="demo-first-name"
                    placeholder="Prenumele tău"
                    value={demoForm.firstName}
                    onChange={handleDemoInputChange("firstName")}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="demo-last-name">Nume *</label>
                  <input
                    type="text"
                    id="demo-last-name"
                    name="demo-last-name"
                    placeholder="Numele tău"
                    value={demoForm.lastName}
                    onChange={handleDemoInputChange("lastName")}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="demo-email">Email *</label>
                  <input
                    type="email"
                    id="demo-email"
                    name="demo-email"
                    placeholder="adresa@business.ro"
                    value={demoForm.email}
                    onChange={handleDemoInputChange("email")}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="demo-phone">Telefon *</label>
                  <input
                    type="tel"
                    id="demo-phone"
                    name="demo-phone"
                    placeholder="+40 7XX XXX XXX"
                    value={demoForm.phone}
                    onChange={handleDemoInputChange("phone")}
                    required
                  />
                </div>
              </div>

              {demoError && (
                <p className="form-error" style={{ color: "#f87171", marginBottom: "1rem" }}>
                  {demoError}
                </p>
              )}

              <div className="form-row-submit">
                <div className="form-group form-group-message">
                  <p className="section-subtitle" style={{ marginTop: 0, marginBottom: 0, textAlign: "left" }}>Ce se întâmplă după?</p>
                  <p>
                    Primești email + SMS cu linkul de Meet, iar noi te contactăm pentru detalii. Poți reprograma oricând
                    răspunzând la email.
                  </p>
                </div>
                <button type="submit" className="btn-submit" disabled={demoSubmitting || !selectedSlot}>
                  {demoSubmitting ? "Se programează..." : "Programează demo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section
        id="aws-section"
        style={{ background: "rgba(255, 255, 255, 0.02)" }}
      >
        <div className="aws-section-container">
          <div className="aws-content">
            <Image
              src="/images/aws-logo.svg"
              alt="AWS Logo"
              width={200}
              height={60}
              className="aws-logo"
            />
            <h2 style={{ fontSize: 36, fontWeight: 700, margin: "0 0 30px 0" }}>
              Hosting Securizat pe Amazon
            </h2>
            <p
              style={{
                fontSize: 18,
                color: "rgba(255, 255, 255, 0.7)",
                lineHeight: 1.8,
                marginBottom: 20,
              }}
            >
              Datele tale sunt stocate în siguranță pe Amazon Web Services (AWS)
              deoarece securitatea informațiilor tale digitale este prioritatea noastră
              principală.
            </p>
            <p
              style={{
                fontSize: 18,
                color: "rgba(255, 255, 255, 0.7)",
                lineHeight: 1.8,
                marginBottom: 30,
              }}
            >
              Afacerea ta, regulile tale. Începe să o automatizezi astăzi cu VOOB.
            </p>
            <Link href="/auth/register" className="btn btn-primary">
              Începe Acum <i className="fas fa-arrow-right" />
            </Link>
          </div>
          <div className="aws-image">
            <Image
              src="/images/aws-img1.jpg"
              alt="AWS Security"
              width={900}
              height={600}
              className="aws-hero-image"
              priority
            />
          </div>
        </div>
      </section>

      <section id="demo" className="cta-section">
        <h2 className="section-title">Testează Platforma</h2>
        <p className="section-subtitle">
          Descoperă cum VOOB poate transforma modul în care gestionezi
          programările și automatizează afacerea ta.
          <br />
          <strong style={{ color: "rgba(99, 102, 241, 0.9)" }}>Testează gratuit toate funcționalitățile timp de 30 zile (o lună completă).</strong>
        </p>
        <Link href="/auth/register" className="btn btn-primary">
          Începe Trial Gratuit <i className="fas fa-arrow-right" />
        </Link>
      </section>

      <footer>
        <div className="footer-container">
          <div className="footer-grid">
            <div>
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: "#fff",
                  marginBottom: 10,
                }}
              >
                VOOB
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255, 255, 255, 0.5)",
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                your time!
              </div>
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.6)",
                  lineHeight: 1.6,
                  marginBottom: 25,
                }}
              >
                Primul sistem românesc de booking inteligent cu plată în rate Klarna.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 15,
                  marginBottom: 20,
                  justifyContent: "flex-start",
                }}
              >
                <Link
                  href="#"
                  style={{
                    width: 40,
                    height: 40,
                    background: "rgba(255, 255, 255, 0.05)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255, 255, 255, 0.7)",
                    transition: "all 0.3s",
                    textDecoration: "none",
                  }}
                >
                  <i className="fab fa-facebook-f" />
                </Link>
                <Link
                  href="#"
                  style={{
                    width: 40,
                    height: 40,
                    background: "rgba(255, 255, 255, 0.05)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255, 255, 255, 0.7)",
                    transition: "all 0.3s",
                    textDecoration: "none",
                  }}
                >
                  <i className="fab fa-instagram" />
                </Link>
                <Link
                  href="#"
                  style={{
                    width: 40,
                    height: 40,
                    background: "rgba(255, 255, 255, 0.05)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255, 255, 255, 0.7)",
                    transition: "all 0.3s",
                    textDecoration: "none",
                  }}
                >
                  <i className="fab fa-linkedin-in" />
                </Link>
                <Link
                  href="#"
                  style={{
                    width: 40,
                    height: 40,
                    background: "rgba(255, 255, 255, 0.05)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "rgba(255, 255, 255, 0.7)",
                    transition: "all 0.3s",
                    textDecoration: "none",
                  }}
                >
                  <i className="fab fa-twitter" />
                </Link>
              </div>
            </div>

            <div>
              <h4
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 20,
                }}
              >
                Produs
              </h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="#despre"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    Despre
                  </Link>
                </li>
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="#cum-functioneaza-client"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    Pentru Clienți
                  </Link>
                </li>
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="#cum-functioneaza-afacere"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    Pentru afacere
                  </Link>
                </li>
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="#pachete-preturi"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    Abonamente
                  </Link>
                </li>
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="#contact-business"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    Contact
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 20,
                }}
              >
                Legal
              </h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="/legal/termeni-conditii"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    Termeni și Condiții
                  </Link>
                </li>
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="/legal/politica-confidentialitate"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    Politica de Confidențialitate
                  </Link>
                </li>
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="/legal/politica-cookies"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    Politica Cookies
                  </Link>
                </li>
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="/legal/gdpr"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    GDPR
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h4
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 600,
                  marginBottom: 20,
                }}
              >
                Contact
              </h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                <li
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    justifyContent: "flex-start",
                  }}
                >
                  <i className="fas fa-envelope" style={{ color: "#6366F1" }} />
                  <a
                    href="mailto:contact@voob.io"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                    }}
                  >
                    contact@voob.io
                  </a>
                </li>
                <li
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    justifyContent: "flex-start",
                  }}
                >
                  <i className="fas fa-phone" style={{ color: "#6366F1" }} />
                  <a
                    href="tel:+40748293830"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                    }}
                  >
                    +40748293830
                  </a>
                </li>
                <li
                  style={{
                    marginBottom: 12,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    justifyContent: "flex-start",
                  }}
                >
                  <i
                    className="fas fa-map-marker-alt"
                    style={{ color: "#6366F1", marginTop: 3 }}
                  />
                  <span style={{ color: "rgba(255, 255, 255, 0.6)", fontSize: 14 }}>
                    Iași, România
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p
              style={{
                color: "rgba(255, 255, 255, 0.4)",
                fontSize: 14,
                margin: 0,
              }}
            >
              &copy; 2025 VOOB. Toate drepturile rezervate.
            </p>
            <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
              <CookiePreferencesButton />
              <p
                style={{
                  color: "rgba(255, 255, 255, 0.4)",
                  fontSize: 14,
                  margin: 0,
                }}
              >
                Made with <i className="fas fa-heart" style={{ color: "#EC4899" }} /> in
                Iași, Romania
              </p>
            </div>
          </div>
        </div>
      </footer>

      {showDemoSuccess && (
        <div
          className="demo-success-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "1.5rem",
          }}
        >
          <div
            className="demo-success-modal"
            style={{
              background: "#0B0E17",
              borderRadius: "24px",
              padding: "2rem",
              border: "1px solid rgba(255,255,255,0.1)",
              maxWidth: 420,
              width: "100%",
              textAlign: "center",
            }}
          >
            <i className="fas fa-check-circle" style={{ color: "#34d399", fontSize: 48 }} />
            <h3 style={{ marginTop: "1rem", color: "#fff", fontSize: "1.5rem", fontWeight: 600 }}>
              Programarea este confirmată!
            </h3>
            <p style={{ marginTop: "0.75rem", color: "rgba(255,255,255,0.75)", lineHeight: 1.6 }}>
              Vei primi SMS și email cu linkul de Google Meet în câteva secunde.
              Dă reply la email dacă vrei să schimbi ora.
            </p>
            <button
              type="button"
              onClick={() => setShowDemoSuccess(false)}
              className="btn-submit"
              style={{ marginTop: "1.5rem", width: "100%" }}
            >
              Închide
            </button>
          </div>
        </div>
      )}
    </>
  );
}

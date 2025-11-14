"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export default function Home() {
  const [formSuccess, setFormSuccess] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    form.reset();
    setFormSuccess(true);
    window.setTimeout(() => setFormSuccess(false), 5000);
  };

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
          <div className="logo">LARSTEF</div>
          <div className="logo-motto">Timpul tău, organizat perfect!</div>
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
            <div className="logo">LARSTEF</div>
            <div className="logo-motto">Timpul tău, organizat perfect!</div>
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
          <Link href="#demo" onClick={closeSidebar}>
            Demo
          </Link>
          <Link href="/auth/login" className="btn-nav" onClick={closeSidebar}>
            Fă-ți cont
          </Link>
        </nav>
      </aside>

      {/* Desktop Nav */}
      <nav className="desktop-nav">
        <div className="logo-container">
          <div className="logo">LARSTEF</div>
          <div className="logo-motto">Timpul tău, organizat perfect!</div>
        </div>
        <div className="nav-links">
          <Link href="#despre">Despre</Link>
          <Link href="#cum-functioneaza-client">Pentru Clienți</Link>
          <Link href="#cum-functioneaza-afacere">Pentru Afacere</Link>
          <Link href="#pachete-preturi">Abonamente</Link>
          <Link href="#contact-business">Contact</Link>
          <Link href="#demo">Demo</Link>
          <Link href="/auth/login" className="btn-nav">
            Fă-ți cont
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-tag">Sistem de booking online</div>
          <h1>
            Platforma <span className="gradient-text">completă</span> pentru
            <br />
            a-ți <span className="gradient-text">automatiza</span> afacerea
          </h1>
          <p className="subtitle mb-0">
            LARSTEF este prima platformă inteligentă din România care unește
            rezervările, plățile și AI-ul într-un singur loc.
          </p>
          <p className="subtitle">
            Fă-ți programări, plătește în rate și lasă AI-ul să te ajute să nu
            pierzi niciun moment important.
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
                alt="Previzualizare LARSTEF"
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
              <img src="/images/img1.png" alt="LARSTEF AI" className="ai-preview-image" />
              <div className="ai-play-button">
                <i className="fas fa-play"></i>
              </div>
            </div>
          </div>
          <div className="ai-content">
            <h2 className="ai-title">LARSTEF AI</h2>
            <h3 className="ai-subtitle">Asistentul tău inteligent pentru rezervări și management</h3>
            <p className="ai-text">
              Cu LARSTEF AI poți crea, modifica sau anula programări doar printr-un mesaj.
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
              Fă o rezervare acum in platforma LARSTEF și plătește mai târziu cu opțiunile flexibile de plată
              Klarna. Poți alege dacă vrei să plătești imediat, în 30 de zile sau în 3
              rate fără dobândă.
            </p>
            <img src="/images/logo-klarna.svg" alt="Klarna" width={200} height={80}/>
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
                title="LARSTEF AI Video"
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
          Diferențiatorii care fac LARSTEF unic pe piața din România
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
              Acceptă plăți online, în rate cu Klarna, și primești banii direct
              în cont.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-credit-card" />
            </div>
            <h3>Stripe & Klarna</h3>
            <p>
              Plăți sigure și rapide, inclusiv opțiunea de plată în rate pentru
              clienții tăi. Primești banii instant în cont.
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
              <i className="fas fa-check-circle" />
            </div>
            <h3>Confirmare și remindere automate</h3>
            <p>
              Clienții primesc notificări automate pentru toate programările prin
              email, SMS sau WhatsApp.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-comment-dots" />
            </div>
            <h3>Notificări automate</h3>
            <p>
              Trimite reminder-uri și confirmări prin SMS, email sau WhatsApp fără
              niciun efort.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-redo-alt" />
            </div>
            <h3>Reprogramare fără apeluri</h3>
            <p>
              Modifică programările online, oricând, fără să fie nevoie de telefoane
              sau bătăi de cap.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-history" />
            </div>
            <h3>Istoric rezervări</h3>
            <p>
              Acces instant la toate programările anterioare, organizate într-un
              singur loc.
            </p>
          </div>
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-sync-alt" />
            </div>
            <h3>Reprogramări și anulări simple</h3>
            <p>
              Clienții pot gestiona singuri programările, reducând numărul de apeluri
              telefonice.
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
          Cum funcționează pentru tine (User Flow complet)
        </h2>
        <p className="section-subtitle">
          Totul simplu. De la cont, la programare și plată în câteva clicuri.{" "}
          <br /> Nu trebuie să plătești nimic.
        </p>
        <div className="grid">
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-user-plus" />
            </div>
            <h3>Creează-ți contul în câteva secunde</h3>
            <p>Înregistrează-te gratuit cu e-mailul, Google sau Apple.</p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Alege domeniile care te interesează hair styling, stomatolog, psiholog și
              LARSTEF AI îți personalizează experiența din prima zi.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-search" />
            </div>
            <h3>Alege serviciul sau specialistul tău preferat</h3>
            <p>Găsești rapid toți profesioniștii din zona ta.</p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Vezi prețurile, durata și recenziile, apoi alegi exact ce vrei fie
              Florin hair stylist, fie Dr. Andrei dentist.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Totul într-o interfață curată și simplă.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-calendar-check" />
            </div>
            <h3>Fă programări manual sau cu ajutorul AI</h3>
            <p>Poți alege ora perfectă direct din calendar sau îi spui AI-ului:</p>
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
              LARSTEF verifică automat disponibilitatea și confirmă rezervarea pentru
              tine.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-credit-card" />
            </div>
            <h3>Plătește cum vrei integral sau în rate</h3>
            <p>După confirmare, alegi cum vrei să plătești:</p>
            <ul>
              <li>
                <i className="fas fa-check" />
                Instant, cu cardul prin Stripe,
              </li>
              <li>
                <i className="fas fa-check" />
                În 4 rate fără dobândă prin Klarna.
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
              Simplu, sigur și complet digital.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-brain" />
            </div>
            <h3>Primește notificări și recomandări inteligente</h3>
            <p>LARSTEF îți trimite automat memento-uri, confirmări și sugestii:</p>
            <ul>
              <li>
                <i className="fas fa-check" />„Ai programare la 17:00 – tuns la
                Florin”
              </li>
              <li>
                <i className="fas fa-check" />„A trecut 1 lună de la ultima vizită la
                dentist. Vrei să reprogramez?”
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
          Cum funcționează pentru afacerea ta (Business Flow complet)
        </h2>
        <p className="section-subtitle">
          Transformă-ți afacerea într-o mașinărie eficientă de rezervări și plăți
        </p>
        <div className="grid">
          <div className="card">
            <div className="card-icon">
              <i className="fas fa-building" />
            </div>
            <h3>Creează contul tău de business</h3>
            <p>
              Înregistrează-ți afacerea pe LARSTEF în doar câteva minute. Adaugă
              numele, domeniul și locația, iar pagina ta publică devine instant
              vizibilă pentru clienți.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Un profil curat, modern, gata să atragă rezervări noi din prima zi.
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
              De la „Tuns bărbați – 60 min” până la „Implant dentar – 90 min”, totul
              apare clar pentru clienți.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              LARSTEF se ocupă de afișare, tu doar alegi orele și prețurile.
            </p>
          </div>

          <div className="card">
            <div className="card-icon">
              <i className="fas fa-calendar-alt" />
            </div>
            <h3>Gestionează programările fără stres</h3>
            <p>
              Calendarul tău vizual îți arată tot ce contează: rezervări,
              reprogramări și pauze.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Poți modifica manual sau lași AI-ul LARSTEF să-ți umple automat
              golurile din program.
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
              Conectează-ți contul Stripe o singură dată și începi să primești banii
              instant.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Clienții pot plăti integral sau în rate prin Klarna tu primești suma
              completă pe loc.
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
              <i className="fas fa-chart-line" />
            </div>
            <h3>Lasă AI-ul să-ți optimizeze afacerea</h3>
            <p>AI Insights analizează rezervările și îți oferă recomandări clare:</p>
            <ul>
              <li>
                <i className="fas fa-check" />
                Ore profitabile
              </li>
              <li>
                <i className="fas fa-check" />
                Clienți recurenți
              </li>
              <li>
                <i className="fas fa-check" />
                Servicii populare
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
              <i className="fas fa-comments" />
            </div>
            <h3>Comunică ușor cu clienții</h3>
            <p>
              Ai un chat integrat cu AI care te ajută să răspunzi rapid și profesionist.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: 14,
              }}
            >
              Confirmări, oferte sau reprogramări — totul automatizat și conectat la
              fiecare rezervare.
            </p>
            <p
              style={{
                marginTop: 12,
                color: "rgba(99, 102, 241, 0.8)",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Tu te concentrezi pe servicii, LARSTEF se ocupă de relația cu clientul.
            </p>
          </div>
        </div>
      </section>

      <section id="pachete-preturi" className="pricing-section">
        <h2 className="section-title">Alege planul potrivit pentru afacerea ta</h2>
        <p className="section-subtitle">
          Poți începe gratuit și face upgrade oricând. Fără costuri ascunse, fără
          surprize neplăcute.
        </p>
        <div className="grid">
          <div className="pricing-card card">
            <h3 style={{ textAlign: "left" }}>Starter</h3>
            <div className="price" style={{ textAlign: "left" }}>
              79 lei<span>/lună</span>
            </div>
            <ul>
              <li>
                <i className="fas fa-check" /> 1 utilizator
              </li>
              <li>
                <i className="fas fa-check" /> Booking online
              </li>
              <li>
                <i className="fas fa-check" /> Notificări SMS/WhatsApp
              </li>
              <li>
                <i className="fas fa-check" /> 50 rezervări/lună
              </li>
            </ul>
            <Link href="/auth/register" className="btn-pricing">
              Începe acum
            </Link>
          </div>

          <div className="pricing-card popular card">
            <div className="popular-badge">CEL MAI POPULAR</div>
            <h3 style={{ textAlign: "left" }}>Pro</h3>
            <div className="price" style={{ textAlign: "left" }}>
              129 lei<span>/lună</span>
            </div>
            <ul>
              <li>
                <i className="fas fa-check" /> Totul din Starter +
              </li>
              <li>
                <i className="fas fa-check" /> Utilizatori nelimitați
              </li>
              <li>
                <i className="fas fa-check" /> Rezervări nelimitate
              </li>
              <li>
                <i className="fas fa-check" /> Chat cu AI LARSTEF
              </li>
              <li>
                <i className="fas fa-check" /> Plata online sau în rate cu Klarna
              </li>
            </ul>
            <Link href="/auth/register" className="btn-pricing">
              Începe acum
            </Link>
          </div>

          <div className="pricing-card card">
            <h3 style={{ textAlign: "left" }}>Business</h3>
            <div className="price" style={{ textAlign: "left" }}>
              169 lei<span>/lună</span>
            </div>
            <ul>
              <li>
                <i className="fas fa-check" /> Totul din Pro +
              </li>
              <li>
                <i className="fas fa-check" /> Account manager
              </li>
              <li>
                <i className="fas fa-check" /> Suport prioritar
              </li>
            </ul>
            <Link href="/auth/register" className="btn-pricing">
              Începe acum
            </Link>
          </div>
        </div>
      </section>

      <section id="contact-business" className="contact-form-section">
        <h2 className="section-title">Ești interesat pentru afacerea ta?</h2>
        <p className="section-subtitle">
          Lasă-ne un mesaj și te vom contacta în cel mai scurt timp pentru a discuta
          despre cum LARSTEF poate transforma modul în care gestionezi rezervările.
        </p>
        <div className="form-container">
          <div className="form-card">
            <form id="business-contact-form" onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="business-name">Nume business *</label>
                  <input
                    type="text"
                    id="business-name"
                    name="business-name"
                    placeholder="Ex: Salon Beauty, Cabinet Dr. Popescu"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="contact-name">Nume contact *</label>
                  <input
                    type="text"
                    id="contact-name"
                    name="contact-name"
                    placeholder="Numele tău complet"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="contact@business.ro"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Telefon</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    placeholder="+40 7XX XXX XXX"
                  />
                </div>
              </div>

              <div className="form-row form-row-full">
                <div className="form-group">
                  <label htmlFor="business-type">Tip business *</label>
                  <select id="business-type" name="business-type" required>
                    <option value="">Selectează tipul de business</option>
                    <option value="hair-styling">Hair Styling / Barber Shop</option>
                    <option value="salon">Salon de frumusețe</option>
                    <option value="stomatolog">Cabinet stomatologic</option>
                    <option value="psiholog">Cabinet psihologie</option>
                    <option value="clinica">Clinică estetică</option>
                    <option value="avocat">Birou de avocatură</option>
                    <option value="altul">Altul</option>
                  </select>
                </div>
              </div>

              <div className="form-row-submit">
                <div className="form-group form-group-message">
                  <label htmlFor="message">Mesaj</label>
                  <textarea
                    id="message"
                    name="message"
                    placeholder="Spune-ne despre nevoile tale, câte rezervări ai lunar, sau orice întrebări ai despre LARSTEF..."
                  />
                </div>
                <button type="submit" className="btn-submit">
                  <i className="fas fa-paper-plane" />
                  Trimite cererea
                </button>
              </div>

              <div
                className={`form-success ${formSuccess ? "show" : ""}`}
                id="form-success"
              >
                <i className="fas fa-check-circle" />
                Mulțumim! Mesajul tău a fost trimis cu succes. Te vom contacta în
                cel mai scurt timp.
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
              Afacerea ta, regulile tale. Începe să o automatizezi astăzi cu LARSTEF.
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
          Descoperă cum LARSTEF poate transforma modul în care gestionezi
          programările.
          <br />
          Testează gratuit toate funcționalitățile pentru 14 zile.
        </p>
        <Link href="/auth/register" className="btn btn-primary">
          Solicită Demo Gratuit <i className="fas fa-arrow-right" />
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
                LARSTEF
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
                Timpul tău, organizat perfect!
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
                <li style={{ marginBottom: 12 }}>
                  <Link
                    href="#demo"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                      transition: "all 0.3s",
                    }}
                  >
                    Demo
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
                    href="mailto:contact@larstef.ro"
                    style={{
                      color: "rgba(255, 255, 255, 0.6)",
                      textDecoration: "none",
                      fontSize: 14,
                    }}
                  >
                    contact@larstef.ro
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
              &copy; 2025 LARSTEF. Toate drepturile rezervate.
            </p>
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
      </footer>
    </>
  );
}

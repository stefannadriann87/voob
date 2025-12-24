"use client";

import { useState } from "react";
import Link from "next/link";

export default function SupportPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const supportSections = [
    {
      id: "getting-started",
      title: "Începe cu VOOB",
      icon: "🚀",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Ghid de început</h3>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">1. Creează contul tău</h4>
              <p className="text-white/70 text-sm">
                Înregistrează-te rapid cu e-mailul tău. Nu necesită card de credit și nu plătești nimic pentru utilizarea platformei.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">2. Completează onboarding-ul</h4>
              <p className="text-white/70 text-sm">
                Adaugă datele business-ului tău, conectează contul Stripe pentru plăți și configurează serviciile.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">3. Generează QR code-ul</h4>
              <p className="text-white/70 text-sm">
                Descarcă posterul cu QR code sau partajează linkul direct. Clienții se conectează instant și pot face rezervări.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "account-billing",
      title: "Cont și Facturare",
      icon: "💳",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Gestionarea contului și facturării</h3>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum activez un plan de abonament?</h4>
              <p className="text-white/70 text-sm mb-2">
                Mergi la <Link href="/business/subscription" className="text-[#6366F1] hover:underline">pagina de abonamente</Link> și alege planul care ți se potrivește. Procesul de plată este securizat prin Stripe.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum modific datele de facturare?</h4>
              <p className="text-white/70 text-sm mb-2">
                Accesează secțiunea <Link href="/business/billing" className="text-[#6366F1] hover:underline">Billing</Link> din dashboard pentru a actualiza datele de facturare.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum anulez abonamentul?</h4>
              <p className="text-white/70 text-sm mb-2">
                Poți anula abonamentul oricând din <Link href="/business/subscription" className="text-[#6366F1] hover:underline">pagina de abonamente</Link>. Accesul rămâne activ până la sfârșitul perioadei plătite.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "bookings",
      title: "Rezervări",
      icon: "📅",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Gestionarea rezervărilor</h3>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum modific o rezervare?</h4>
              <p className="text-white/70 text-sm">
                Accesează pagina de rezervări, găsește rezervarea dorită și folosește opțiunea de editare. Poți modifica data, ora, serviciul sau specialistul.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum anulez o rezervare?</h4>
              <p className="text-white/70 text-sm">
                Din pagina de rezervări, selectează rezervarea și folosește butonul de anulare. Clientul va primi o notificare automată.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum gestionez suprapunerile?</h4>
              <p className="text-white/70 text-sm">
                VOOB previne automat suprapunerile. Dacă un slot este deja rezervat, sistemul va afișa o eroare și va sugera alternative disponibile.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "services-employees",
      title: "Servicii și Specialiști",
      icon: "👥",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Gestionarea serviciilor și specialiștilor</h3>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum adaug un serviciu nou?</h4>
              <p className="text-white/70 text-sm">
                Din dashboard, accesează secțiunea "Servicii" și folosește butonul "Adaugă serviciu". Completează numele, durata, prețul și notele (opțional).
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum adaug un specialist?</h4>
              <p className="text-white/70 text-sm">
                Din dashboard, accesează secțiunea "Specialist" și folosește butonul "Adaugă specialist". Completează datele și configurează programul de lucru.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum configurez programul de lucru?</h4>
              <p className="text-white/70 text-sm">
                Pentru fiecare specialist sau pentru business-ul tău, accesează setările de program de lucru. Poți configura orele pentru fiecare zi, pauzele și concediile.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "payments",
      title: "Plăți",
      icon: "💵",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Gestionarea plăților</h3>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Ce metode de plată acceptă VOOB?</h4>
              <p className="text-white/70 text-sm mb-2">
                VOOB acceptă plăți cu cardul prin Stripe (securizat), plăți în rate fără dobândă prin Klarna, și plăți offline la locație.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Când primesc banii?</h4>
              <p className="text-white/70 text-sm mb-2">
                Plățile online ajung direct în contul tău Stripe Connect, instant după ce clientul finalizează plata. Nu există întârzieri.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum gestionez refund-urile?</h4>
              <p className="text-white/70 text-sm mb-2">
                Refund-urile pot fi procesate din pagina de rezervări. Selectează rezervarea anulată și folosește opțiunea de refund. Suma va fi returnată automat clientului.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "ai-features",
      title: "Funcții AI",
      icon: "🤖",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Funcțiile AI ale VOOB</h3>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Cum folosesc VOOB AI?</h4>
              <p className="text-white/70 text-sm mb-2">
                VOOB AI este disponibil în widget-ul de chat din dashboard. Poți cere să creezi rezervări, să modifici programări sau să obții rapoarte, toate în limbaj natural.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Ce poate face VOOB AI?</h4>
              <p className="text-white/70 text-sm mb-2">
                AI-ul poate crea, modifica sau anula rezervări, verifica disponibilitatea, genera rapoarte, răspunde la întrebări despre business și sugerează optimizări.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Este VOOB AI securizat?</h4>
              <p className="text-white/70 text-sm mb-2">
                Da, VOOB AI respectă toate permisiunile și restricțiile configurate pentru rolul tău. Nu poate accesa sau modifica date fără permisiune.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "troubleshooting",
      title: "Rezolvarea Problemelor",
      icon: "🔧",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Rezolvarea problemelor comune</h3>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Nu pot accesa dashboard-ul</h4>
              <p className="text-white/70 text-sm mb-2">
                Verifică că ești autentificat corect. Dacă problema persistă, șterge cookie-urile și încearcă din nou. Dacă trial-ul a expirat, activează un plan de abonament.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Rezervările nu se sincronizează</h4>
              <p className="text-white/70 text-sm mb-2">
                Reîncarcă pagina sau verifică conexiunea la internet. Dacă problema persistă, contactează suportul.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Plățile nu funcționează</h4>
              <p className="text-white/70 text-sm mb-2">
                Verifică că contul Stripe Connect este conectat corect în setările de billing. Asigură-te că datele de facturare sunt complete.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "contact",
      title: "Contact",
      icon: "📧",
      content: (
        <div className="space-y-4">
          <h3 className="text-xl font-semibold text-white mb-4">Contactează-ne</h3>
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Email</h4>
              <p className="text-white/70 text-sm mb-2">
                Pentru întrebări generale sau suport tehnic, scrie-ne la:{" "}
                <a href="mailto:support@voob.io" className="text-[#6366F1] hover:underline">
                  support@voob.io
                </a>
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Timp de răspuns</h4>
              <p className="text-white/70 text-sm mb-2">
                Răspundem la toate mesajele în maximum 24-48 de ore în zilele lucrătoare. Pentru planurile BUSINESS, răspundem în 2-4 ore.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <h4 className="font-semibold text-white mb-2">Documentație</h4>
              <p className="text-white/70 text-sm mb-2">
                Pentru ghiduri detaliate și tutoriale video, accesează secțiunile de mai sus sau consultă documentația completă.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* Mobile Header */}
      <header className="mobile-header">
        <div className="mobile-logo">
          <Link href="/">
            <div className="logo">VOOB</div>
            <div className="logo-motto">your time!</div>
          </Link>
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
            <Link href="/">
              <div className="logo">VOOB</div>
              <div className="logo-motto">your time!</div>
            </Link>
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
          <Link href="#despre" onClick={closeSidebar}>Despre</Link>
          <Link href="#cum-functioneaza-client" onClick={closeSidebar}>Pentru Clienți</Link>
          <Link href="#cum-functioneaza-afacere" onClick={closeSidebar}>Pentru Afacere</Link>
          <Link href="#pachete-preturi" onClick={closeSidebar}>Abonamente</Link>
          <Link href="/support" onClick={closeSidebar}>Suport</Link>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px", alignItems: "flex-start" }}>
            <Link className="btn-nav btn-nav-secondary" href="/auth/login/" onClick={closeSidebar}>
              Intră în cont
            </Link>
            <Link className="btn-nav" href="/auth/register/" onClick={closeSidebar}>
              Creează cont
            </Link>
          </div>
        </nav>
      </aside>

      {/* Desktop Nav */}
      <nav className="desktop-nav">
        <div className="logo-container">
          <Link href="/">
            <div className="logo">VOOB</div>
            <div className="logo-motto">your time!</div>
          </Link>
        </div>
        <div className="nav-links">
          <Link href="#despre">Despre</Link>
          <Link href="#cum-functioneaza-client">Pentru Clienți</Link>
          <Link href="#cum-functioneaza-afacere">Pentru Afacere</Link>
          <Link href="#pachete-preturi">Abonamente</Link>
          <Link href="/support">Suport</Link>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <Link className="btn-nav btn-nav-secondary" href="/auth/login/">
              Intră în cont
            </Link>
            <Link className="btn-nav" href="/auth/register/">
              Creează cont
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <section className="hero" style={{ paddingTop: "120px", minHeight: "100vh" }}>
        <div className="hero-content" style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 20px" }}>
          <div className="text-center mb-12">
            <h1 className="font-size-40 mb-4">
              <span className="gradient-text">Centru de Suport</span> VOOB
            </h1>
            <p className="subtitle mb-10">
              Găsește răspunsuri la întrebările tale sau contactează-ne pentru ajutor
            </p>
          </div>

          {/* Support Sections Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {supportSections.map((section) => (
              <div
                key={section.id}
                className={`bg-white/5 rounded-2xl p-6 border border-white/10 cursor-pointer transition-all hover:bg-white/10 hover:border-[#6366F1]/50 ${
                  activeSection === section.id ? "border-[#6366F1] bg-[#6366F1]/10" : ""
                }`}
                onClick={() => setActiveSection(activeSection === section.id ? null : section.id)}
              >
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-3xl">{section.icon}</span>
                  <h3 className="text-xl font-semibold text-white">{section.title}</h3>
                </div>
                <p className="text-white/60 text-sm">
                  {activeSection === section.id ? "Click pentru a ascunde" : "Click pentru detalii"}
                </p>
              </div>
            ))}
          </div>

          {/* Active Section Content */}
          {activeSection && (
            <div className="bg-white/5 rounded-3xl p-8 border border-white/10 mb-12 animate-fadeIn">
              {supportSections.find((s) => s.id === activeSection)?.content}
            </div>
          )}

          {/* Quick Contact */}
          <div className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] rounded-3xl p-8 text-center">
            <h2 className="text-2xl font-bold text-white mb-4">Ai nevoie de ajutor suplimentar?</h2>
            <p className="text-white/90 mb-6">
              Echipa noastră este aici să te ajute. Contactează-ne și îți vom răspunde cât mai curând.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:support@voob.io"
                className="bg-white text-[#6366F1] px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
              >
                <i className="fas fa-envelope mr-2"></i>
                Trimite email
              </a>
              <Link
                href="/"
                className="bg-white/20 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/30 transition-colors border border-white/30"
              >
                <i className="fas fa-home mr-2"></i>
                Înapoi la pagina principală
              </Link>
            </div>
          </div>
        </div>
      </section>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </>
  );
}

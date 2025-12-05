import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termeni și Condiții - VOOB",
  description: "Termenii și condițiile de utilizare ale platformei VOOB",
};

export default function TermeniConditiiPage() {
  return (
    <>
      {/* Header with logo only */}
      <header className="legal-header">
        <div className="legal-header-container">
          <Link href="/" className="legal-header-logo">
            <div className="logo">VOOB</div>
          </Link>
        </div>
      </header>

      <div className="legal-page">
        <div className="legal-container">
          <Link href="/" className="legal-back-link">
            <i className="fas fa-arrow-left"></i> Înapoi la pagina principală
          </Link>

          <h1>Termeni și Condiții</h1>
        <p className="legal-last-updated">Ultima actualizare: {new Date().toLocaleDateString("ro-RO")}</p>

        <section className="legal-section">
          <h2>1. Acceptarea Termenilor</h2>
          <p>
            Prin accesarea și utilizarea platformei VOOB, acceptați să respectați și să fiți
            obligați de acești Termeni și Condiții de utilizare. Dacă nu sunteți de acord cu oricare
            dintre prevederile acestui document, vă rugăm să nu utilizați serviciile noastre.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Descrierea Serviciilor</h2>
          <p>
            VOOB este o platformă de management și rezervare online care permite utilizatorilor să:
          </p>
          <ul>
            <li>Creeze și gestioneze rezervări pentru diverse tipuri de afaceri</li>
            <li>Plătească pentru servicii prin intermediul platformei (Stripe, Klarna)</li>
            <li>Folosească funcționalități AI pentru managementul automatizat</li>
            <li>Gestionare calendar și disponibilitate</li>
            <li>Comunicare între clienți și furnizori de servicii</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Conturi de Utilizator</h2>
          <h3>3.1. Crearea Contului</h3>
          <p>
            Pentru a utiliza serviciile VOOB, trebuie să vă creați un cont. Sunteți responsabil pentru:
          </p>
          <ul>
            <li>Furnizarea de informații exacte, curente și complete</li>
            <li>Menținerea și actualizarea informațiilor contului dumneavoastră</li>
            <li>Menținerea securității parolei și identificatorului de cont</li>
            <li>Toate activitățile care apar sub contul dumneavoastră</li>
          </ul>

          <h3>3.2. Tipuri de Conturi</h3>
          <p>Platforma suportă următoarele tipuri de conturi:</p>
          <ul>
            <li><strong>Client:</strong> Pentru utilizatori care doresc să rezerve servicii</li>
            <li><strong>Business:</strong> Pentru afaceri care oferă servicii</li>
            <li><strong>Employee:</strong> Pentru angajații unei afaceri</li>
            <li><strong>Admin:</strong> Pentru administrarea platformei</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Utilizarea Platformei</h2>
          <h3>4.1. Utilizare Permisă</h3>
          <p>Vă angajați să utilizați platforma doar în scopuri legale și în conformitate cu acești Termeni.</p>

          <h3>4.2. Utilizare Interzisă</h3>
          <p>Sunteți interzis să:</p>
          <ul>
            <li>Folosiți platforma în orice mod care încalcă legile aplicabile</li>
            <li>Transmiteți sau distribuiți virusi, malware sau cod malițios</li>
            <li>Încercați să accesați neautorizat sau să afectați funcționalitatea platformei</li>
            <li>Folosiți platforma pentru activități frauduloase sau înșelătoare</li>
            <li>Reproduceți, modificați sau distribuiți conținutul platformei fără permisiune</li>
            <li>Folosiți scripturi sau algoritmi pentru a extrage date de pe platformă</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Rezervări și Plăți</h2>
          <h3>5.1. Procesul de Rezervare</h3>
          <p>
            Rezervările se fac prin intermediul platformei. Confirmarea rezervării depinde de
            disponibilitatea furnizorului de servicii și de finalizarea cu succes a plății.
          </p>

          <h3>5.2. Plăți</h3>
          <p>
            Plățile se procesează prin intermediul partenerilor noștri de plată (Stripe, Klarna).
            Platforma nu stochează datele cardului dumneavoastră de credit. Toate tranzacțiile
            sunt procesate în siguranță și în conformitate cu standardele PCI DSS.
          </p>

          <h3>5.3. Anulări și Rămbușări</h3>
          <p>
            Politica de anulare și rămbursare depinde de furnizorul de servicii. Vă rugăm să
            consultați termenii specifici fiecărui furnizor înainte de a face o rezervare.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Proprietate Intelectuală</h2>
          <p>
            Platforma VOOB, inclusiv designul, codul, logo-urile, conținutul și alte materiale,
            este proprietatea noastră sau a furnizorilor noștri de licențe și este protejată de
            legile privind drepturile de autor și alte legi de proprietate intelectuală.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Limitarea Răspunderii</h2>
          <p>
            Platforma este furnizată "așa cum este" și "conform disponibilității". Nu garantăm că:
          </p>
          <ul>
            <li>Platforma va fi neîntreruptă, sigură sau lipsită de erori</li>
            <li>Defectele vor fi corectate</li>
            <li>Platforma este lipsită de virusi sau componente dăunătoare</li>
          </ul>
          <p>
            Nu ne asumăm răspundere pentru daune directe, indirecte, incidentale, speciale sau
            consecvențiale rezultate din utilizarea sau imposibilitatea utilizării platformei.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Indemnizare</h2>
          <p>
            Sunteți de acord să ne despăgubiți și să ne protejați împotriva oricăror revendicări,
            daune, obligații, pierderi, costuri și cheltuieli (inclusiv onorariile avocatului)
            rezultate din sau în legătură cu utilizarea dumneavoastră a platformei sau încălcarea
            acestor Termeni.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Modificarea Termenilor</h2>
          <p>
            Ne rezervăm dreptul de a modifica acești Termeni în orice moment. Modificările vor
            intra în vigoare imediat după publicare pe platformă. Utilizarea continuă a platformei
            după modificări constituie acceptarea noilor Termeni.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Rezilierea</h2>
          <p>
            Ne rezervăm dreptul de a suspenda sau rezilia contul dumneavoastră în orice moment,
            fără preaviz, pentru orice încălcare a acestor Termeni sau pentru orice alt motiv
            legitim.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Legea Aplicabilă</h2>
          <p>
            Acești Termeni sunt guvernați și interpretați în conformitate cu legile României.
            Orice dispută va fi supusă jurisdicției exclusive a instanțelor competente din România.
          </p>
        </section>

        <section className="legal-section">
          <h2>12. Contact</h2>
          <p>
            Pentru întrebări despre acești Termeni, vă rugăm să ne contactați la:
          </p>
          <ul>
            <li>Email: <a href="mailto:contact@voob.io">contact@voob.io</a></li>
            <li>Telefon: <a href="tel:+40748293830">+40748293830</a></li>
            <li>Adresă: Iași, România</li>
          </ul>
        </section>
        </div>
      </div>
    </>
  );
}


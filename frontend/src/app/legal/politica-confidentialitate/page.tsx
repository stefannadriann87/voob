import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politica de Confidențialitate - LARSTEF",
  description: "Politica de confidențialitate a platformei LARSTEF",
};

export default function PoliticaConfidentialitatePage() {
  return (
    <>
      {/* Header with logo only */}
      <header className="legal-header">
        <div className="legal-header-container">
          <Link href="/" className="legal-header-logo">
            <div className="logo">LARSTEF</div>
          </Link>
        </div>
      </header>

      <div className="legal-page">
        <div className="legal-container">
          <Link href="/" className="legal-back-link">
            <i className="fas fa-arrow-left"></i> Înapoi la pagina principală
          </Link>

          <h1>Politica de Confidențialitate</h1>
        <p className="legal-last-updated">Ultima actualizare: {new Date().toLocaleDateString("ro-RO")}</p>

        <section className="legal-section">
          <h2>1. Introducere</h2>
          <p>
            LARSTEF ("noi", "ni", "noastre") respectă confidențialitatea utilizatorilor noștri și
            este angajat în protejarea datelor dumneavoastră personale. Această Politică de
            Confidențialitate explică cum colectăm, folosim, dezvăluim și protejăm informațiile
            dumneavoastră când utilizați platforma noastră.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Datele pe care le Colectăm</h2>
          <h3>2.1. Informații Furnizate de Dvs.</h3>
          <p>Colectăm următoarele categorii de date personale:</p>
          <ul>
            <li><strong>Date de identificare:</strong> nume, prenume, adresă de email, număr de telefon</li>
            <li><strong>Date de cont:</strong> nume de utilizator, parolă (hash-uită), preferințe de cont</li>
            <li><strong>Date de plată:</strong> informații despre tranzacții (procesate prin Stripe/Klarna, nu stocăm date card)</li>
            <li><strong>Date de rezervare:</strong> detalii despre rezervările făcute, istoric rezervări</li>
            <li><strong>Date de comunicare:</strong> mesaje trimise prin platformă</li>
            <li><strong>Date de business:</strong> pentru utilizatori business, informații despre afacerea dumneavoastră</li>
          </ul>

          <h3>2.2. Informații Colectate Automat</h3>
          <p>Colectăm automat următoarele informații:</p>
          <ul>
            <li><strong>Date tehnice:</strong> adresă IP, tip de browser, sistem de operare, device ID</li>
            <li><strong>Date de utilizare:</strong> pagini vizitate, timp petrecut, acțiuni efectuate</li>
            <li><strong>Date de localizare:</strong> informații aproximative despre locație (dacă este permis)</li>
            <li><strong>Cookies și tehnologii similare:</strong> vezi Politica Cookies pentru detalii</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Cum Folosim Datele Dumneavoastră</h2>
          <p>Folosim datele personale pentru următoarele scopuri:</p>
          <ul>
            <li><strong>Furnizarea serviciilor:</strong> pentru a procesa rezervările, gestiona conturile, procesa plățile</li>
            <li><strong>Comunicare:</strong> pentru a vă trimite notificări despre rezervări, actualizări ale serviciului</li>
            <li><strong>Îmbunătățirea platformei:</strong> pentru a analiza utilizarea și a îmbunătăți funcționalitățile</li>
            <li><strong>Securitate:</strong> pentru a detecta și preveni frauda, abuzul și alte activități ilegale</li>
            <li><strong>Conformitate legală:</strong> pentru a ne conforma obligațiilor legale și de reglementare</li>
            <li><strong>Marketing:</strong> pentru a vă trimite promoții și oferte relevante (cu consimțământul dumneavoastră)</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Baza Legală pentru Prelucrare</h2>
          <p>Prelucrăm datele dumneavoastră personale pe următoarele baze legale:</p>
          <ul>
            <li><strong>Executarea contractului:</strong> pentru a furniza serviciile solicitate</li>
            <li><strong>Consimțământul:</strong> când ați dat consimțământul explicit pentru anumite prelucrări</li>
            <li><strong>Obligații legale:</strong> pentru a respecta obligațiile legale (de ex., fiscal, contabil)</li>
            <li><strong>Interese legitime:</strong> pentru îmbunătățirea serviciilor, securitate, prevenirea fraudei</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>5. Partajarea Datelor</h2>
          <h3>5.1. Parteneri de Servicii</h3>
          <p>Putem partaja datele cu următorii parteneri de încredere:</p>
          <ul>
            <li><strong>Procesatori de plăți:</strong> Stripe, Klarna pentru procesarea plăților</li>
            <li><strong>Furnizori de cloud:</strong> AWS pentru hosting și stocare (conform GDPR)</li>
            <li><strong>Servicii de analiză:</strong> pentru analiza utilizării platformei</li>
            <li><strong>Servicii de comunicare:</strong> pentru trimiterea de email-uri și notificări</li>
          </ul>

          <h3>5.2. Partajare cu Furnizori de Servicii</h3>
          <p>
            Când faceți o rezervare, partajăm datele necesare cu furnizorul de servicii pentru
            a completa rezervarea (nume, contact, detalii rezervare).
          </p>

          <h3>5.3. Partajare Legală</h3>
          <p>
            Putem dezvălui datele dacă este necesar legal sau pentru a ne proteja drepturile,
            proprietatea sau siguranța utilizatorilor noștri.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Stocarea și Securitatea Datelor</h2>
          <h3>6.1. Perioada de Stocare</h3>
          <p>
            Păstrăm datele dumneavoastră personale doar atât timp cât este necesar pentru
            scopurile pentru care au fost colectate sau conform cerințelor legale. După expirarea
            perioadei de păstrare, datele sunt șterse sau anonimizate în mod sigur.
          </p>

          <h3>6.2. Măsuri de Securitate</h3>
          <p>
            Implementăm măsuri tehnice și organizaționale adecvate pentru a proteja datele
            dumneavoastră, inclusiv:
          </p>
          <ul>
            <li>Criptare pentru date în tranzit și la repaus</li>
            <li>Acces restricționat la date pe bază de nevoie</li>
            <li>Monitorizare continuă a sistemelor pentru vulnerabilități</li>
            <li>Backup-uri regulate și planuri de recuperare</li>
            <li>Conformitate cu standardele de securitate (PCI DSS pentru plăți)</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>7. Drepturile Dumneavoastră (GDPR)</h2>
          <p>În conformitate cu GDPR, aveți următoarele drepturi:</p>
          <ul>
            <li><strong>Dreptul de acces:</strong> puteți solicita o copie a datelor personale pe care le deținem</li>
            <li><strong>Dreptul la rectificare:</strong> puteți cere corectarea datelor inexacte sau incomplete</li>
            <li><strong>Dreptul la ștergere:</strong> puteți cere ștergerea datelor în anumite circumstanțe ("dreptul de a fi uitat")</li>
            <li><strong>Dreptul la restricționarea prelucrării:</strong> puteți cere restricționarea prelucrării în anumite situații</li>
            <li><strong>Dreptul la portabilitate:</strong> puteți primi datele într-un format structurat și comun</li>
            <li><strong>Dreptul de opoziție:</strong> puteți vă opune prelucrării în anumite circumstanțe</li>
            <li><strong>Dreptul de retragere a consimțământului:</strong> unde prelucrarea se bazează pe consimțământ</li>
            <li><strong>Dreptul de a vă opune la procesarea automatizată:</strong> inclusiv profilarea</li>
          </ul>
          <p>
            Pentru a exercita aceste drepturi, vă rugăm să ne contactați la{" "}
            <a href="mailto:contact@larstef.ro">contact@larstef.ro</a>
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Transferuri Internaționale</h2>
          <p>
            Datele dumneavoastră pot fi transferate și stocate pe servere situate în afara
            Uniunii Europene. În astfel de cazuri, ne asigurăm că există garanții adecvate, cum
            ar fi Clauzele Standard Contractuale aprobate de Comisia Europeană.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Cookies și Tehnologii Similare</h2>
          <p>
            Utilizăm cookies și tehnologii similare pentru a îmbunătăți experiența dumneavoastră.
            Pentru mai multe detalii, vă rugăm să consultați{" "}
            <Link href="/legal/politica-cookies">Politica noastră privind Cookies</Link>.
          </p>
        </section>

        <section className="legal-section">
          <h2>10. Date ale Copiilor</h2>
          <p>
            Platforma noastră nu este destinată copiilor sub vârsta de 16 ani. Nu colectăm în
            mod cunoscut date personale de la copiii sub 16 ani. Dacă devenim conștienți că am
            colectat date de la un copil sub 16 ani, vom lua măsuri pentru a șterge aceste date.
          </p>
        </section>

        <section className="legal-section">
          <h2>11. Modificări ale Politicii</h2>
          <p>
            Ne rezervăm dreptul de a actualiza această Politică de Confidențialitate din când în
            când. Vă vom notifica despre orice modificări importante prin intermediul platformei
            sau prin email. Modificările intră în vigoare la data publicării.
          </p>
        </section>

        <section className="legal-section">
          <h2>12. Contact</h2>
          <p>
            Pentru întrebări sau solicitări privind confidențialitatea, vă rugăm să ne contactați:
          </p>
          <ul>
            <li>Email: <a href="mailto:contact@larstef.ro">contact@larstef.ro</a></li>
            <li>Telefon: <a href="tel:+40748293830">+40748293830</a></li>
            <li>Adresă: Iași, România</li>
          </ul>
          <p>
            Puteți de asemenea să vă adresați Autorității Naționale de Supraveghere a Prelucrării
            Datelor cu Caracter Personal (ANSPDCP) pentru orice plângeri.
          </p>
        </section>
        </div>
      </div>
    </>
  );
}


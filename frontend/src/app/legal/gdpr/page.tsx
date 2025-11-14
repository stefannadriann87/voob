import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GDPR - LARSTEF",
  description: "Informații despre conformitatea GDPR a platformei LARSTEF",
};

export default function GDPRPage() {
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

          <h1>GDPR - Drepturile Dumneavoastră</h1>
        <p className="legal-last-updated">Ultima actualizare: {new Date().toLocaleDateString("ro-RO")}</p>

        <section className="legal-section">
          <h2>1. Ce este GDPR?</h2>
          <p>
            Regulamentul General privind Protecția Datelor (GDPR) este o regulamentare europeană
            care vă oferă control mai mare asupra datelor dumneavoastră personale și standardizează
            modul în care organizațiile trebuie să gestioneze datele personale.
          </p>
          <p>
            LARSTEF este angajat în respectarea GDPR și al protecției datelor dumneavoastră personale.
            Această pagină explică drepturile pe care le aveți în conformitate cu GDPR și cum le puteți
            exercita.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Datele Dumneavoastră Personale</h2>
          <p>
            Conform GDPR, "date personale" înseamnă orice informație care vă identifică direct sau
            indirect. Pe platforma LARSTEF, prelucrăm următoarele categorii de date personale:
          </p>
          <ul>
            <li>Date de identificare (nume, prenume, email, telefon)</li>
            <li>Date de cont (username, hash parole)</li>
            <li>Date de tranzacții (istoricul rezervărilor și plăților)</li>
            <li>Date de utilizare (activitatea pe platformă)</li>
            <li>Date tehnice (adresă IP, tip de browser, device ID)</li>
            <li>Date de localizare (dacă este permis)</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Drepturile Dumneavoastră în Conformitate cu GDPR</h2>

          <h3>3.1. Dreptul de Acces (Articolul 15)</h3>
          <p>
            Aveți dreptul de a ști ce date personale deținem despre dumneavoastră și cum le folosim.
            Puteți solicita:
          </p>
          <ul>
            <li>O copie a datelor personale pe care le deținem</li>
            <li>Informații despre scopurile prelucrării</li>
            <li>Informații despre categoriile de destinatari cărora le-am dezvăluit datele</li>
            <li>Perioada de păstrare prevăzută</li>
          </ul>

          <h3>3.2. Dreptul la Rectificare (Articolul 16)</h3>
          <p>
            Aveți dreptul de a solicita corectarea datelor inexacte sau incomplete. Puteți actualiza
            majoritatea datelor direct din contul dumneavoastră sau ne puteți contacta pentru asistență.
          </p>

          <h3>3.3. Dreptul la Ștergere - "Dreptul de a fi Uitat" (Articolul 17)</h3>
          <p>
            În anumite circumstanțe, aveți dreptul de a solicita ștergerea datelor dumneavoastră
            personale. Acest drept se aplică când:
          </p>
          <ul>
            <li>Datele nu mai sunt necesare pentru scopurile pentru care au fost colectate</li>
            <li>V-ați retras consimțământul și nu există altă bază legală pentru prelucrare</li>
            <li>Vă opuneți prelucrării și nu există motive legitime care să prevaleze</li>
            <li>Datele au fost prelucrate ilegal</li>
            <li>Datele trebuie șterse pentru respectarea unei obligații legale</li>
          </ul>
          <p>
            <strong>Notă importantă:</strong> Nu putem șterge datele dacă sunt necesare pentru
            îndeplinirea unei obligații legale sau pentru stabilirea, exercitarea sau apărarea
            unei pretenții juridice.
          </p>

          <h3>3.4. Dreptul la Restricționarea Prelucrării (Articolul 18)</h3>
          <p>
            Aveți dreptul de a solicita restricționarea prelucrării datelor dumneavoastră personale
            în următoarele situații:
          </p>
          <ul>
            <li>Contestați exactitatea datelor (pentru perioada necesară verificării)</li>
            <li>Prelucrarea este ilegală și vă opuneți ștergerii</li>
            <li>Nu mai avem nevoie de date, dar le solicitați pentru stabilirea, exercitarea sau apărarea unei pretenții juridice</li>
            <li>V-ați opus prelucrării (până când verificăm dacă motivele legitime ale noastre prevalează)</li>
          </ul>

          <h3>3.5. Dreptul la Portabilitate Datelor (Articolul 20)</h3>
          <p>
            Aveți dreptul de a primi datele dumneavoastră personale într-un format structurat, utilizat
            în mod curent și citibil automatizat, și aveți dreptul de a transmite aceste date altui
            operator, când:
          </p>
          <ul>
            <li>Prelucrarea se bazează pe consimțământ sau pe un contract</li>
            <li>Prelucrarea se realizează prin mijloace automatizate</li>
          </ul>

          <h3>3.6. Dreptul de Opoziție (Articolul 21)</h3>
          <p>
            Aveți dreptul de a vă opune prelucrării datelor dumneavoastră personale în următoarele situații:
          </p>
          <ul>
            <li><strong>Prelucrare bazată pe interese legitime:</strong> Puteți vă opune prelucrării pentru marketing direct sau pentru motive legate de situația dumneavoastră particulară</li>
            <li><strong>Profilare:</strong> Puteți vă opune procesării automate pentru crearea de profiluri care produce efecte juridice asupra dumneavoastră sau vă afectează în mod similar semnificativ</li>
          </ul>

          <h3>3.7. Dreptul de Retragere a Consimțământului (Articolul 7)</h3>
          <p>
            Când prelucrarea se bazează pe consimțământul dumneavoastră, aveți dreptul de a-l retrage
            în orice moment. Retragerea consimțământului nu afectează legalitatea prelucrării efectuate
            înainte de retragere.
          </p>

          <h3>3.8. Dreptul de a Nu fi Supus unei Decizii Exclusiv Automate (Articolul 22)</h3>
          <p>
            Aveți dreptul de a nu fi supus unei decizii bazate exclusiv pe prelucrarea automatizată,
            inclusiv profilarea, care produce efecte juridice asupra dumneavoastră sau vă afectează
            în mod similar semnificativ.
          </p>
        </section>

        <section className="legal-section">
          <h2>4. Cum Puteți Exercita Drepturile Dumneavoastră</h2>
          <h3>4.1. Prin Contul Dumneavoastră</h3>
          <p>
            Multe dintre datele dumneavoastră pot fi gestionate direct din contul dumneavoastră:
          </p>
          <ul>
            <li>Actualizarea informațiilor personale</li>
            <li>Schimbarea preferințelor de notificare</li>
            <li>Gestionarea consimțământului pentru marketing</li>
            <li>Exportul datelor (unde este disponibil)</li>
          </ul>

          <h3>4.2. Prin Contact Direct</h3>
          <p>
            Pentru a exercita oricare dintre drepturile dumneavoastră GDPR, vă rugăm să ne contactați:
          </p>
          <ul>
            <li>Email: <a href="mailto:contact@larstef.ro">contact@larstef.ro</a></li>
            <li>Telefon: <a href="tel:+40748293830">+40748293830</a></li>
            <li>Adresă: Iași, România</li>
          </ul>
          <p>
            Vă rugăm să includeți în solicitarea dumneavoastră:
          </p>
          <ul>
            <li>Numele și prenumele complete</li>
            <li>Adresa de email asociată contului</li>
            <li>Descrierea clară a dreptului pe care doriți să-l exercitați</li>
            <li>Dovada identității (pentru siguranță)</li>
          </ul>

          <h3>4.3. Răspunsul Nostru</h3>
          <p>
            Vom răspunde la solicitările dumneavoastră în termen de o lună de la primirea acestora.
            În cazuri complexe, putem prelungi termenul cu încă două luni, dar vă vom informa despre
            acest lucru.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Securitatea Datelor</h2>
          <p>
            Implementăm măsuri tehnice și organizaționale adecvate pentru a proteja datele
            dumneavoastră personale:
          </p>
          <ul>
            <li>Criptare pentru date în tranzit și la repaus</li>
            <li>Acces restricționat bazat pe principiul "nevoie de a ști"</li>
            <li>Monitorizare continuă a sistemelor</li>
            <li>Backup-uri regulate și planuri de recuperare</li>
            <li>Evaluări periodice de securitate</li>
            <li>Conformitate cu standardele de securitate (PCI DSS pentru plăți)</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>6. Transferuri Internaționale</h2>
          <p>
            Datele dumneavoastră pot fi transferate în afara Spațiului Economic European (SEE).
            În astfel de cazuri, ne asigurăm că există garanții adecvate, cum ar fi:
          </p>
          <ul>
            <li>Clauze Standard Contractuale aprobate de Comisia Europeană</li>
            <li>Decizii de adecvare (adequacy decisions)</li>
            <li>Alte mecanisme legale de protecție</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>7. Autoritatea de Supraveghere</h2>
          <p>
            Dacă considerați că prelucrarea datelor dumneavoastră personale încalcă GDPR, aveți
            dreptul de a depune o plângere la autoritatea de supraveghere competentă.
          </p>
          <p>
            În România, autoritatea de supraveghere este:
          </p>
          <ul>
            <li><strong>Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP)</strong></li>
            <li>B-dul G-ral. Gheorghe Magheru 28-30, Sector 1, București</li>
            <li>Tel: +40 318 059 211</li>
            <li>Email: <a href="mailto:anspdcp@dataprotection.ro">anspdcp@dataprotection.ro</a></li>
            <li>Website: <a href="https://www.dataprotection.ro" target="_blank" rel="noopener noreferrer">www.dataprotection.ro</a></li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>8. Modificări ale Acestui Document</h2>
          <p>
            Ne rezervăm dreptul de a actualiza acest document pentru a reflecta modificările
            legislației sau ale practicilor noastre. Vă recomandăm să consultați periodic această
            pagină pentru a fi la curent cu drepturile dumneavoastră.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Contact</h2>
          <p>
            Pentru orice întrebări despre drepturile dumneavoastră GDPR sau pentru a exercita
            oricare dintre aceste drepturi, vă rugăm să ne contactați:
          </p>
          <ul>
            <li>Email: <a href="mailto:contact@larstef.ro">contact@larstef.ro</a></li>
            <li>Telefon: <a href="tel:+40748293830">+40748293830</a></li>
            <li>Adresă: Iași, România</li>
          </ul>
        </section>
        </div>
      </div>
    </>
  );
}


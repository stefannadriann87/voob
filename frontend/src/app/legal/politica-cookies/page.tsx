import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Politica Cookies - VOOB",
  description: "Politica privind utilizarea cookie-urilor pe platforma VOOB",
};

export default function PoliticaCookiesPage() {
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

          <h1>Politica Cookies</h1>
        <p className="legal-last-updated">Ultima actualizare: {new Date().toLocaleDateString("ro-RO")}</p>

        <section className="legal-section">
          <h2>1. Ce sunt Cookie-urile?</h2>
          <p>
            Cookie-urile sunt mici fișiere text care sunt plasate pe dispozitivul dumneavoastră
            (computer, tabletă sau telefon mobil) când vizitați un site web. Cookie-urile permit
            site-ului să vă recunoască dispozitivul și să memoreze informații despre preferințele
            sau acțiunile dumneavoastră, astfel încât să nu trebuiască să le reintroduceți de
            fiecare dată când reveniți pe site sau navigați de la o pagină la alta.
          </p>
        </section>

        <section className="legal-section">
          <h2>2. Cum Folosim Cookie-urile?</h2>
          <p>
            VOOB folosește cookie-uri pentru a îmbunătăți experiența dumneavoastră de navigare,
            pentru a analiza modul în care utilizați site-ul și pentru a personaliza conținutul și
            anunțurile. Utilizăm cookie-uri pentru:
          </p>
          <ul>
            <li>Autentificare și securitate</li>
            <li>Preferințe și setări</li>
            <li>Analiza utilizării platformei</li>
            <li>Marketing și publicitate</li>
            <li>Funcționalități esențiale</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>3. Tipuri de Cookie-uri Utilizate</h2>

          <h3>3.1. Cookie-uri Strict Necesare</h3>
          <p>
            Aceste cookie-uri sunt esențiale pentru funcționarea site-ului și nu pot fi dezactivate.
            Ele sunt de obicei setate ca răspuns la acțiuni efectuate de dvs. care echivalează cu o
            solicitare de servicii, cum ar fi setarea preferințelor de confidențialitate, conectarea
            sau completarea formularelor.
          </p>
          <ul>
            <li><strong>Cookie-uri de sesiune:</strong> pentru menținerea sesiunii de autentificare</li>
            <li><strong>Cookie-uri de securitate:</strong> pentru protecția împotriva atacurilor CSRF</li>
            <li><strong>Cookie-uri de preferințe:</strong> pentru salvarea setărilor dumneavoastră</li>
          </ul>

          <h3>3.2. Cookie-uri de Performanță</h3>
          <p>
            Aceste cookie-uri ne permit să numărăm vizitele și sursele de trafic, astfel încât să
            putem măsura și îmbunătăți performanța site-ului nostru. Ajută la identificarea paginilor
            cele mai și mai puțin populare și la înțelegerea modului în care vizitatorii navighează
            pe site.
          </p>
          <ul>
            <li><strong>Google Analytics:</strong> pentru analiza traficului și comportamentului utilizatorilor</li>
            <li><strong>Cookie-uri de monitoring:</strong> pentru identificarea erorilor și problemelor de performanță</li>
          </ul>

          <h3>3.3. Cookie-uri Funcționale</h3>
          <p>
            Aceste cookie-uri permit site-ului să ofere funcționalități și personalizare îmbunătățite.
            Pot fi setate de noi sau de furnizori terți ale căror servicii am adăugat pe paginile noastre.
          </p>
          <ul>
            <li><strong>Cookie-uri de preferințe:</strong> pentru memorarea preferințelor de limbă și regiune</li>
            <li><strong>Cookie-uri de personalizare:</strong> pentru adaptarea conținutului la preferințele dumneavoastră</li>
          </ul>

          <h3>3.4. Cookie-uri de Marketing</h3>
          <p>
            Aceste cookie-uri pot fi setate prin intermediul site-ului nostru de către partenerii noștri
            de publicitate. Aceste companii le pot folosi pentru a construi un profil al intereselor
            dumneavoastră și pentru a vă arăta anunțuri relevante pe alte site-uri.
          </p>
          <ul>
            <li><strong>Cookie-uri de publicitate:</strong> pentru targetarea anunțurilor relevante</li>
            <li><strong>Cookie-uri de tracking:</strong> pentru urmărirea eficacității campaniilor de marketing</li>
          </ul>
        </section>

        <section className="legal-section">
          <h2>4. Cookie-uri de la Terți</h2>
          <p>
            În plus față de cookie-urile noastre, folosim și cookie-uri de la terți pentru a ne
            ajuta să analizăm utilizarea site-ului și să oferim servicii îmbunătățite. Acești
            furnizori terți includ:
          </p>
          <ul>
            <li><strong>Google Analytics:</strong> pentru analiza utilizării site-ului</li>
            <li><strong>Stripe:</strong> pentru procesarea plăților</li>
            <li><strong>Klarna:</strong> pentru procesarea plăților în rate</li>
            <li><strong>Rețele sociale:</strong> pentru funcționalități de partajare socială (dacă aplicabil)</li>
          </ul>
          <p>
            Vă rugăm să consultați politicile de confidențialitate ale acestor terți pentru a
            înțelege modul în care folosesc cookie-urile.
          </p>
        </section>

        <section className="legal-section">
          <h2>5. Durata Cookie-urilor</h2>
          <p>Cookie-urile pot fi:</p>
          <ul>
            <li><strong>Cookie-uri de sesiune:</strong> se șterg automat când închideți browserul</li>
            <li><strong>Cookie-uri persistente:</strong> rămân pe dispozitivul dumneavoastră pentru o perioadă specificată sau până le ștergeți manual</li>
          </ul>
          <p>
            Perioada de valabilitate a cookie-urilor persistente variază de la câteva zile la
            câțiva ani, în funcție de scopul pentru care sunt utilizate.
          </p>
        </section>

        <section className="legal-section">
          <h2>6. Gestionarea Cookie-urilor</h2>
          <h3>6.1. Setările Browserului</h3>
          <p>
            Majoritatea browserelor web acceptă cookie-uri în mod implicit, dar puteți modifica
            setările browserului pentru a refuza cookie-uri sau pentru a vă alerța când se trimite
            un cookie. Vă rugăm să rețineți că dezactivarea cookie-urilor poate afecta funcționalitatea
            site-ului și poate împiedica utilizarea anumitor caracteristici.
          </p>
          <p>Iată cum puteți gestiona cookie-urile în browserele populare:</p>
          <ul>
            <li><strong>Google Chrome:</strong> Setări → Confidențialitate și securitate → Cookie-uri</li>
            <li><strong>Mozilla Firefox:</strong> Opțiuni → Confidențialitate și securitate → Cookie-uri</li>
            <li><strong>Safari:</strong> Preferințe → Confidențialitate → Cookie-uri</li>
            <li><strong>Microsoft Edge:</strong> Setări → Confidențialitate, căutare și servicii → Cookie-uri</li>
          </ul>

          <h3>6.2. Banner-ul de Consimțământ</h3>
          <p>
            Când vizitați pentru prima dată site-ul nostru, veți vedea un banner de consimțământ
            pentru cookie-uri. Puteți alege ce tipuri de cookie-uri acceptați, cu excepția
            cookie-urilor strict necesare, care sunt esențiale pentru funcționarea site-ului.
          </p>
        </section>

        <section className="legal-section">
          <h2>7. Cookie-uri Strict Necesare</h2>
          <p>
            Cookie-urile strict necesare nu pot fi dezactivate în sistemele noastre. Acestea sunt
            de obicei setate doar ca răspuns la acțiuni efectuate de dvs. care echivalează cu o
            solicitare de servicii, cum ar fi setarea preferințelor de confidențialitate, conectarea
            sau completarea formularelor.
          </p>
        </section>

        <section className="legal-section">
          <h2>8. Actualizări ale Politicii</h2>
          <p>
            Ne rezervăm dreptul de a actualiza această Politică privind Cookie-urile din când în
            când pentru a reflecta modificările tehnologiei, legislației sau practicilor noastre.
            Vă recomandăm să revedeți periodic această pagină pentru a fi la curent cu modul în care
            folosim cookie-urile.
          </p>
        </section>

        <section className="legal-section">
          <h2>9. Contact</h2>
          <p>
            Dacă aveți întrebări despre utilizarea cookie-urilor pe site-ul nostru, vă rugăm să ne
            contactați:
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


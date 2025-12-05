# REBRANDING: LARSTEF → VOOB

## Context
Platforma se rebrandează de la **LARSTEF** la **VOOB** (domeniu: voob.io)

## Scope-ul rebranding-ului

### 1. Înlocuiri de text în cod
- **"LARSTEF"** → **"VOOB"** (toate aparițiile)
- **"Larstef"** → **"Voob"** (când apare cu majusculă)
- **"larstef"** → **"voob"** (lowercase în variabile, keys, etc.)

### 2. Domenii și email-uri
- **@larstef.app** → **@voob.io**
- **@larstef.ro** → **@voob.io**
- **contact@larstef.ro** → **contact@voob.io**
- **no-reply@larstef.app** → **no-reply@voob.io**
- **app.larstef.ro** → **app.voob.io** (sau doar **voob.io**)

### 3. Planuri de abonament (CRITIC - necesită migrare DB)
- **"LARSTEF PRO"** → **"VOOB PRO"**
- **"LARSTEF BUSINESS"** → **"VOOB BUSINESS"**

⚠️ **ATENȚIE**: Acestea sunt stocate în baza de date în tabelul `SubscriptionPlan`. Va trebui:
- Fie să creezi un script de migrare care să actualizeze numele planurilor existente
- Fie să creezi planuri noi și să migrezi business-urile existente

### 4. LocalStorage keys (CRITIC - afectează utilizatorii existenți)
- **"larstef_user"** → **"voob_user"**
- **"larstef-auth-change"** → **"voob-auth-change"**
- **"larstef_cookie_consent"** → **"voob_cookie_consent"**
- **"larstef_cookie_preferences"** → **"voob_cookie_preferences"**

⚠️ **PROBLEMĂ**: Utilizatorii existenți vor pierde sesiunea după rebranding. Soluții:
- Păstrează ambele keys temporar și migrează datele
- Sau acceptă că utilizatorii vor trebui să se logheze din nou

### 5. Cookie names (CRITIC - afectează sesiunile)
- **"larstef_auth"** → **"voob_auth"**

⚠️ **PROBLEMĂ**: Utilizatorii vor fi deconectați automat. Consideră o migrare temporară.

### 6. Event names
- **"larstef:booking-created"** → **"voob:booking-created"**

### 7. File names și paths
- **"larstef-qr-..."** → **"voob-qr-..."**
- **"larstef-{business-name}"** → **"voob-{business-name}"**

### 8. Metadata și titluri
- Toate `<title>` tags
- Meta descriptions
- Open Graph tags
- Favicon (dacă conține branding)

### 9. AI Prompts
- Toate referințele la "LARSTEF AI" în prompt-uri
- System prompts în `backend/src/ai/`

### 10. Documentație
- README.md
- Toate fișierele .md din root

## Fișiere care necesită modificări

### Backend
- `backend/src/index.ts` - mesaj API
- `backend/src/routes/auth.ts` - email-uri și subiecte
- `backend/src/routes/booking.ts` - semnături email
- `backend/src/routes/business.ts` - nume fișiere
- `backend/src/routes/businessOnboarding.ts` - nume planuri
- `backend/src/routes/landing.ts` - demo booking emails
- `backend/src/services/emailService.ts` - email from addresses
- `backend/src/services/subscriptionService.ts` - mesaje eroare cu nume planuri
- `backend/src/middleware/auth.ts` - cookie name
- `backend/src/ai/agent.ts` - AI prompts
- `backend/src/ai/contextBuilder.ts` - AI prompts
- `backend/src/ai/prompts/systemPrompt.txt` - AI system prompt
- `backend/scripts/*.ts` - toate script-urile cu email-uri hardcodate

### Frontend
- `frontend/src/app/layout.tsx` - title și metadata
- `frontend/src/app/page.tsx` - landing page (multe referințe)
- `frontend/src/app/auth/*/page.tsx` - toate paginile de auth
- `frontend/src/app/client/*/page.tsx` - paginile client
- `frontend/src/app/business/*/page.tsx` - paginile business
- `frontend/src/app/employee/*/page.tsx` - paginile employee
- `frontend/src/app/admin/*/page.tsx` - paginile admin
- `frontend/src/app/legal/*/page.tsx` - paginile legale
- `frontend/src/components/*.tsx` - toate componentele
- `frontend/src/hooks/useAuth.ts` - localStorage keys
- `frontend/src/hooks/useApi.ts` - localStorage keys
- `frontend/src/hooks/useCookieConsent.ts` - localStorage keys
- `frontend/src/hooks/useBusiness.ts` - localStorage check

### Root
- `README.md`

## Probleme potențiale și soluții

### 🔴 PROBLEMĂ CRITICĂ 1: Planuri de abonament în DB
**Problema**: Numele planurilor sunt stocate în baza de date. Business-urile existente au referințe la "LARSTEF PRO" și "LARSTEF BUSINESS".

**Soluție**:
```sql
-- Script de migrare
UPDATE "SubscriptionPlan" SET name = 'VOOB PRO' WHERE name = 'LARSTEF PRO';
UPDATE "SubscriptionPlan" SET name = 'VOOB BUSINESS' WHERE name = 'LARSTEF BUSINESS';
```

Sau creează un script Prisma migration.

### 🔴 PROBLEMĂ CRITICĂ 2: LocalStorage și Cookies
**Problema**: Utilizatorii existenți vor pierde sesiunea.

**Soluție 1** (Recomandat): Migrare temporară
```typescript
// În useAuth.ts, la inițializare
const oldUser = window.localStorage.getItem("larstef_user");
if (oldUser && !window.localStorage.getItem("voob_user")) {
  window.localStorage.setItem("voob_user", oldUser);
  // Opțional: șterge după migrare
  // window.localStorage.removeItem("larstef_user");
}
```

**Soluție 2**: Acceptă că utilizatorii se vor loga din nou (mai simplu, dar mai dur pentru UX).

### 🟡 PROBLEMĂ MEDIE: Email-uri hardcodate în script-uri
**Problema**: Multe script-uri au email-uri de test hardcodate (@larstef.app).

**Soluție**: Înlocuiește toate cu @voob.io sau folosește variabile de mediu.

### 🟡 PROBLEMĂ MEDIE: QR Codes existente
**Problema**: QR codes generate anterior conțin "LARSTEF" în watermark.

**Soluție**: QR codes noi vor avea "VOOB", dar cele vechi rămân. Consideră dacă vrei să regenerezi toate QR codes.

### 🟢 PROBLEMĂ MINORĂ: Nume folder proiect
**Problema**: Folderul se numește "LARSTEF".

**Soluție**: Poți rămâne așa (nu afectează funcționalitatea) sau redenumește folderul.

## Plan de execuție recomandat

1. **Backup baza de date** înainte de orice modificare
2. **Creează script de migrare DB** pentru planuri
3. **Înlocuiește toate string-urile** în cod (folosește find & replace)
4. **Implementează migrare localStorage** pentru utilizatorii existenți
5. **Testează autentificarea** după schimbarea cookie names
6. **Actualizează variabilele de mediu** (.env files)
7. **Testează email-urile** cu noile adrese
8. **Verifică toate paginile** pentru branding consistent
9. **Actualizează documentația**

## Checklist final

- [ ] Toate aparițiile "LARSTEF" înlocuite cu "VOOB"
- [ ] Toate email-urile actualizate la @voob.io
- [ ] Planurile de abonament actualizate în DB
- [ ] LocalStorage keys actualizate (cu migrare)
- [ ] Cookie names actualizate
- [ ] Event names actualizate
- [ ] AI prompts actualizate
- [ ] Documentație actualizată
- [ ] Variabile de mediu actualizate
- [ ] Testat autentificarea
- [ ] Testat email-urile
- [ ] Testat toate flow-urile principale

## Note importante

- **Domeniul voob.io** trebuie configurat pentru:
  - Email (SMTP/SPF/DKIM records)
  - SSL certificate
  - DNS records pentru subdomain-uri (app.voob.io, etc.)
- **Stripe** - verifică dacă ai branding în Stripe dashboard
- **Legal pages** - actualizează informațiile de contact
- **Google Analytics / Tracking** - actualizează dacă ai configurații specifice


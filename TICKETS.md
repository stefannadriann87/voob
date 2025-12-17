# 🎫 TICKETS - VOOB Platform Improvements

**Generat din:** CODE_REVIEW.md  
**Data:** 2025-12-17  
**Total Tickets:** 45+

---

## 🔴 CRITIC - MUST FIX ÎNAINTE DE PRODUCTION

### TICKET-001: Race Condition în Booking Creation
**Prioritate:** 🔴 CRITIC  
**Categorie:** Backend / Database  
**Fișier:** `backend/src/routes/booking.ts:216-565`  
**Descriere:** Două users pot rezerva același slot simultan datorită lipsei unui lock mechanism.  
**Impact:** Double booking, suprapuneri de rezervări, pierdere de încredere  
**Soluție:** Implementează database transaction cu row locking (FOR UPDATE în PostgreSQL)  
**Estimare:** 4-6 ore

### TICKET-002: Lipsă Atomicity pentru Payment + Booking
**Prioritate:** 🔴 CRITIC  
**Categorie:** Backend / Database  
**Fișier:** `backend/src/routes/booking.ts:420-565`  
**Descriere:** Booking și payment nu sunt create atomic. Dacă una eșuează, cealaltă rămâne în inconsistent state.  
**Impact:** Inconsistent state, pierdere de date, probleme de facturare  
**Soluție:** Wrap booking creation, payment creation și consent creation în `prisma.$transaction`  
**Estimare:** 3-4 ore

### TICKET-003: Employee Services Route 404
**Prioritate:** 🔴 CRITIC  
**Categorie:** Backend / Routing  
**Fișier:** `backend/src/routes/business.ts:509-595`  
**Descriere:** Ruta `GET /business/:businessId/employees/:employeeId/services` returnează 404.  
**Impact:** Frontend nu poate accesa employee services, funcționalitate broken  
**Soluție:** Investighează și fix routing issue (probabil ordinea rutelor sau middleware conflict)  
**Estimare:** 2-3 ore

### TICKET-004: Lipsă Validare Business Status în Middleware
**Prioritate:** 🔴 CRITIC  
**Categorie:** Backend / Security  
**Fișier:** `backend/src/middleware/requireOwnership.ts:59-61`  
**Descriere:** `requireBusinessAccess` verifică doar ownership, nu verifică dacă business-ul este ACTIVE.  
**Impact:** Users pot accesa business-uri suspendate, pot crea bookings pentru business-uri inactive  
**Soluție:** Adaugă verificare `business.status === "ACTIVE"` în middleware  
**Estimare:** 1-2 ore

### TICKET-005: File Upload Size Limit Lipsă
**Prioritate:** 🔴 CRITIC  
**Categorie:** Backend / Security  
**Fișier:** `backend/src/routes/consent.ts:62-108`  
**Descriere:** Nu limitează size-ul fișierelor uploadate (images/PDFs pentru consents).  
**Impact:** DoS potential, memory issues, server crash  
**Soluție:** Adaugă size limit (max 5MB pentru images, 10MB pentru PDFs) și validare mime type complet  
**Estimare:** 2-3 ore

### TICKET-006: Console.log Cleanup în Production
**Prioritate:** 🔴 CRITIC  
**Categorie:** Frontend / Code Quality  
**Fișiere:** Multiple (82 instances în frontend)  
**Descriere:** Console.log rămase în production code.  
**Impact:** Poluare console, potențial leak de informații, performanță  
**Soluție:** Elimină toate console.log sau folosește logger wrapper cu check pentru `NODE_ENV`  
**Estimare:** 3-4 ore

---

## 🟠 HIGH PRIORITY

### TICKET-007: N+1 Query în Employee Services
**Prioritate:** 🟠 HIGH  
**Categorie:** Backend / Performance  
**Fișier:** `backend/src/routes/business.ts:530-584`  
**Descriere:** Query pentru fiecare service în loop pentru a verifica association cu employee.  
**Impact:** Performanță slabă pentru business-uri cu multe services (10+ services = 10+ queries)  
**Soluție:** Load toate employeeServices într-un singur query, apoi map services cu association status  
**Estimare:** 2-3 ore

### TICKET-008: Lipsă Index-uri pentru Query-uri Frecvente
**Prioritate:** 🟠 HIGH  
**Categorie:** Backend / Database  
**Fișier:** `backend/prisma/schema.prisma`  
**Descriere:** Lipsă index-uri compuse pentru query-uri frecvente (booking overlap checks, filtering).  
**Impact:** Query-uri lente, performanță slabă la scale  
**Soluție:** Adaugă index-uri compuse:
- `@@index([businessId, date, status])` pe Booking
- `@@index([employeeId, date, status])` pe Booking
- `@@index([clientId, date])` pe Booking
- `@@index([businessId, employeeId, date])` pentru overlap checks  
**Estimare:** 1-2 ore

### TICKET-009: Implementare Caching pentru Business Data
**Prioritate:** 🟠 HIGH  
**Categorie:** Backend / Performance  
**Fișiere:** `backend/src/routes/business.ts`, `backend/src/services/cacheService.ts`  
**Descriere:** Business data, services list, employees list nu sunt cache-uite. Fiecare request face query la DB.  
**Impact:** Query-uri repetate, performanță slabă, load pe database  
**Soluție:** Implementează caching cu Redis:
- Business data: 5 min TTL
- Services list: 10 min TTL
- Employees list: 10 min TTL
- Invalidate cache la update  
**Estimare:** 4-6 ore

### TICKET-010: Paginare pentru List Endpoints
**Prioritate:** 🟠 HIGH  
**Categorie:** Backend / Performance  
**Fișiere:** `backend/src/routes/booking.ts`, `backend/src/routes/business.ts`  
**Descriere:** Bookings list, services list, employees list nu sunt paginate. Load toate odată.  
**Impact:** Query-uri lente pentru business-uri mari, memory issues, slow API responses  
**Soluție:** Implementează paginare pentru toate list endpoints:
- Default limit: 50 items
- Cursor-based pagination pentru performanță
- Adaugă `page` și `limit` query params  
**Estimare:** 6-8 ore

### TICKET-011: Eliminare `any` Types Critice
**Prioritate:** 🟠 HIGH  
**Categorie:** Backend / Code Quality  
**Fișiere:** Multiple (220+ instances)  
**Descriere:** Prea multe `any` types în backend, pierderea beneficiilor TypeScript.  
**Impact:** Erori la runtime, dificultate în refactoring, type safety compromis  
**Soluție:** 
- Creează interfețe tipizate pentru `AuthenticatedRequest`
- Elimină `any` types critice (în routes, middleware)
- Folosește `unknown` și type guards când e necesar  
**Estimare:** 8-12 ore

### TICKET-012: Mesaje de Eroare Specifice și Actionable
**Prioritate:** 🟠 HIGH  
**Categorie:** Backend / UX  
**Fișiere:** Multiple  
**Descriere:** Erori generice ("Eroare la operațiune") în loc de mesaje specifice.  
**Impact:** Users nu înțeleg ce s-a întâmplat, dificultate în debugging  
**Soluție:** 
- Mesaje de eroare specifice pentru fiecare caz
- Actionable messages (ce poate face user-ul)
- Error codes pentru frontend handling  
**Estimare:** 4-6 ore

### TICKET-013: Rate Limiting Fail Closed în Production
**Prioritate:** 🟠 HIGH  
**Categorie:** Backend / Security  
**Fișier:** `backend/src/middleware/globalRateLimit.ts:82-89`  
**Descriere:** Rate limiting fail open când Redis e indisponibil.  
**Impact:** Vulnerabilitate la DoS când Redis e down  
**Soluție:** 
- Fail closed în production
- Alert când Redis e down
- Fallback rate limiting (in-memory) când Redis e indisponibil  
**Estimare:** 2-3 ore

---

## 🟡 MEDIUM PRIORITY

### TICKET-014: Split Fișier Business.ts (2113 linii)
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Backend / Code Organization  
**Fișier:** `backend/src/routes/business.ts`  
**Descriere:** Fișier prea mare (2113 linii), dificil de mentinut.  
**Impact:** Dificultate în navigare, code review, mentenanță  
**Soluție:** Split în mai multe fișiere:
- `business.routes.ts` (CRUD business)
- `business.services.routes.ts` (services management)
- `business.employees.routes.ts` (employees management)
- `business.courts.routes.ts` (courts management)  
**Estimare:** 4-6 ore

### TICKET-015: Refactor State Management în Componente Mari
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Frontend / Code Quality  
**Fișier:** `frontend/src/app/business/bookings/page.tsx` (50+ useState)  
**Descriere:** Componente mari cu 20+ state variables, logică dispersată.  
**Impact:** Dificil de mentinut, re-renders inutile, logică dispersată  
**Soluție:** 
- Folosește `useReducer` pentru state complex
- Extrage sub-componente
- Consideră Zustand/Jotai pentru state global  
**Estimare:** 6-8 ore

### TICKET-016: React Optimizations (useMemo/useCallback)
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Frontend / Performance  
**Fișiere:** Multiple componente frontend  
**Descriere:** Lipsă `useMemo` pentru calcule costisitoare, lipsă `useCallback` pentru funcții pasate ca props.  
**Impact:** Re-renders inutile, performanță slabă  
**Soluție:** 
- Audit de performanță cu React DevTools Profiler
- Adaugă `useMemo`/`useCallback` unde e necesar
- Consideră `React.memo` pentru componente grele  
**Estimare:** 6-8 ore

### TICKET-017: Protecție Rute Completă în Middleware
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Frontend / Security  
**Fișier:** `frontend/src/middleware.ts:64-67`  
**Descriere:** Middleware-ul verifică doar existența cookie-ului, nu rolul. Verificarea exactă se face în layout-uri (client-side).  
**Impact:** Vulnerabilitate: user poate accesa rute protejate temporar, flash de conținut neautorizat  
**Soluție:** 
- Verifică rolul în middleware (folosește JWT decode în Edge Runtime)
- Sau: redirect imediat și verifică în layout  
**Estimare:** 3-4 ore

### TICKET-018: Forms & Validation cu React Hook Form
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Frontend / UX  
**Fișiere:** Multiple form components  
**Descriere:** Validare doar client-side în multe locuri, form state management manual.  
**Impact:** UX inconsistent, validare incompletă  
**Soluție:** 
- Adoptă React Hook Form pentru forms
- Validare sincronă client + server
- Better error messages  
**Estimare:** 8-12 ore

### TICKET-019: Loading States Complete
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Frontend / UX  
**Fișiere:** Multiple components  
**Descriere:** Multe operațiuni async fără loading indicators, lipsă de skeleton loaders.  
**Impact:** UX slab, users nu știu că aplicația lucrează  
**Soluție:** 
- Loading states pentru toate async operations
- Skeleton loaders pentru date fetching
- Optimistic updates unde e posibil  
**Estimare:** 6-8 ore

### TICKET-020: Edge Cases în Booking Flow
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Frontend / Backend  
**Fișiere:** `frontend/src/app/client/bookings/page.tsx`, `backend/src/routes/booking.ts`  
**Descriere:** Nu gestionează cazurile când business-ul suspendă serviciul sau employee-ul este șters în timpul booking-ului.  
**Impact:** UX confuz, erori neprevăzute  
**Soluție:** 
- Validare optimistă + rollback
- Better error messages pentru edge cases
- Handle gracefully toate edge cases  
**Estimare:** 4-6 ore

### TICKET-021: JSDoc Documentation pentru Funcții Publice
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Code Quality / Documentation  
**Fișiere:** Multiple  
**Descriere:** Funcții complexe fără JSDoc, logica de business fără comentarii.  
**Impact:** Dificultate în onboarding, mentenanță  
**Soluție:** 
- Adaugă JSDoc pentru funcții publice
- Documentează API endpoints (consideră OpenAPI/Swagger)
- Explică logica complexă de business  
**Estimare:** 8-12 ore

### TICKET-022: Unit Tests pentru Logica Critică
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Testing  
**Fișiere:** `backend/src/routes/booking.ts`, `backend/src/routes/payments.ts`  
**Descriere:** Lipsă tests pentru booking creation, payment processing, consent signing.  
**Impact:** Riscul de regresii, dificultate în refactoring  
**Soluție:** 
- Unit tests pentru booking validation
- Unit tests pentru payment processing
- Unit tests pentru consent signing
- Integration tests pentru flow-uri critice  
**Estimare:** 12-16 ore

### TICKET-023: Monitoring Setup (APM)
**Prioritate:** 🟡 MEDIUM  
**Categorie:** DevOps / Monitoring  
**Descriere:** Lipsă Application Performance Monitoring.  
**Impact:** Dificultate în identificarea problemelor de performanță  
**Soluție:** 
- Setup APM (Sentry, Datadog, sau similar)
- Error tracking
- Performance monitoring
- Alerting pentru erori critice  
**Estimare:** 4-6 ore

### TICKET-024: Extrage Logică Comună în Servicii Dedicat
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Backend / Code Quality  
**Fișiere:** `backend/src/routes/booking.ts` (overlap check duplicat)  
**Descriere:** Logica de verificare booking overlap este duplicată în mai multe locuri.  
**Impact:** Dificultate în mentenanță, inconsistențe  
**Soluție:** 
- Extrage logica comună în servicii dedicate
- Creează `bookingValidationService.ts`
- Folosește shared utilities  
**Estimare:** 4-6 ore

### TICKET-025: Validare JSON Fields în Prisma Schema
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Backend / Database  
**Fișier:** `backend/prisma/schema.prisma`  
**Descriere:** JSON fields (workingHours, metadata) fără validare la nivel de DB.  
**Impact:** Date invalide în DB, erori la runtime  
**Soluție:** 
- Adaugă validări Prisma pentru JSON fields
- Sau: migrează la tabele separate pentru working hours
- Adaugă cascade deletes unde e necesar  
**Estimare:** 6-8 ore

### TICKET-026: Cache Business Access Checks
**Prioritate:** 🟡 MEDIUM  
**Categorie:** Backend / Performance  
**Fișier:** `backend/src/middleware/requireOwnership.ts`  
**Descriere:** `requireBusinessAccess` face query la DB pentru fiecare request (performance).  
**Impact:** Query-uri repetate, load pe database  
**Soluție:** 
- Cache business access checks (Redis, 5 min TTL)
- Invalidate cache la update  
**Estimare:** 3-4 ore

---

## 🟢 LOW PRIORITY (Nice to Have)

### TICKET-027: Code Splitting pentru Bundle Size
**Prioritate:** 🟢 LOW  
**Categorie:** Frontend / Performance  
**Descriere:** Bundle size mare, lipsă code splitting.  
**Soluție:** 
- Code splitting pentru routes
- Lazy load components
- Bundle analysis cu `next build --analyze`  
**Estimare:** 4-6 ore

### TICKET-028: Image Optimization
**Prioritate:** 🟢 LOW  
**Categorie:** Frontend / Performance  
**Descriere:** Images neoptimizate.  
**Soluție:** 
- Folosește Next.js Image component
- Optimizează images existente
- Lazy load images  
**Estimare:** 2-4 ore

### TICKET-029: Accessibility Audit
**Prioritate:** 🟢 LOW  
**Categorie:** Frontend / UX  
**Descriere:** Lipsă audit pentru accessibility.  
**Soluție:** 
- Audit cu axe DevTools
- Fix pentru a11y issues
- Testare cu screen readers  
**Estimare:** 8-12 ore

### TICKET-030: Internationalization Preparation
**Prioritate:** 🟢 LOW  
**Categorie:** Frontend / Features  
**Descriere:** Pregătire pentru multi-language.  
**Soluție:** 
- Setup i18n framework (next-intl)
- Extract strings
- Structure pentru translations  
**Estimare:** 12-16 ore

### TICKET-031: User Behavior Analytics
**Prioritate:** 🟢 LOW  
**Categorie:** Features / Analytics  
**Descriere:** User behavior tracking.  
**Soluție:** 
- Setup analytics (Google Analytics, Mixpanel, sau similar)
- Track key events
- Dashboard pentru metrics  
**Estimare:** 4-6 ore

### TICKET-032: A/B Testing Framework
**Prioritate:** 🟢 LOW  
**Categorie:** Features / Analytics  
**Descriere:** Framework pentru experiments.  
**Soluție:** 
- Setup A/B testing tool
- Framework pentru experiments
- Integration cu analytics  
**Estimare:** 8-12 ore

### TICKET-033: Eliminare Toate `any` Types (Non-Critice)
**Prioritate:** 🟢 LOW  
**Categorie:** Backend / Code Quality  
**Descriere:** Eliminare toate `any` types rămase (după TICKET-011).  
**Soluție:** 
- Audit pentru toate `any` types
- Replace cu types specifice
- Type guards unde e necesar  
**Estimare:** 8-12 ore

### TICKET-034: API Documentation (OpenAPI/Swagger)
**Prioritate:** 🟢 LOW  
**Categorie:** Documentation  
**Descriere:** API endpoints fără documentație.  
**Soluție:** 
- Setup OpenAPI/Swagger
- Documentează toate endpoints
- Generate client SDKs  
**Estimare:** 8-12 ore

### TICKET-035: Database Connection Pooling Optimization
**Prioritate:** 🟢 LOW  
**Categorie:** Backend / Performance  
**Descriere:** Verifică și optimizează Prisma connection pooling.  
**Soluție:** 
- Verifică Prisma config
- Optimizează pool size
- Monitorizare pentru connection issues  
**Estimare:** 2-4 ore

### TICKET-036: Read Replicas pentru Query-uri
**Prioritate:** 🟢 LOW  
**Categorie:** Backend / Scalability  
**Descriere:** Consideră read replicas pentru query-uri read-only.  
**Soluție:** 
- Setup read replicas
- Route read queries la replicas
- Write queries la primary  
**Estimare:** 8-12 ore

### TICKET-037: Queue pentru PDF Generation
**Prioritate:** 🟢 LOW  
**Categorie:** Backend / Performance  
**Descriere:** PDF generation este CPU intensive, poate bloca event loop.  
**Soluție:** 
- Queue pentru PDF generation (BullMQ)
- Background workers
- Async processing  
**Estimare:** 6-8 ore

### TICKET-038: File Upload Security Enhancements
**Prioritate:** 🟢 LOW  
**Categorie:** Backend / Security  
**Descriere:** Adaugă scan pentru malware la file uploads.  
**Soluție:** 
- Integrare ClamAV sau similar
- Scan pentru malware
- Quarantine pentru fișiere suspecte  
**Estimare:** 8-12 ore

### TICKET-039: Sanitization Output Complet
**Prioritate:** 🟢 LOW  
**Categorie:** Frontend / Security  
**Descriere:** Sanitization doar în `useApi` interceptor, nu sanitizează output-ul în toate locurile.  
**Soluție:** 
- Sanitizează toate output-urile
- Folosește DOMPurify pentru HTML dinamic
- Audit pentru XSS vulnerabilities  
**Estimare:** 4-6 ore

### TICKET-040: SQL Injection Audit
**Prioritate:** 🟢 LOW  
**Categorie:** Backend / Security  
**Descriere:** Audit pentru toate `prisma.$queryRaw` și `prisma.$executeRaw`.  
**Soluție:** 
- Audit pentru toate raw queries
- Verifică că folosesc parametri query
- Elimină string concatenation  
**Estimare:** 2-4 ore

---

## 📊 SUMMARY

**Total Tickets:** 40  
**Critic:** 6 tickets  
**High:** 7 tickets  
**Medium:** 13 tickets  
**Low:** 14 tickets  

**Estimare Total:** ~200-300 ore (5-7 săptămâni cu 1 developer full-time)

---

## 🎯 RECOMMENDED SPRINT PLANNING

### Sprint 1 (Urgent - 1 săptămână)
- TICKET-001: Race Condition în Booking Creation
- TICKET-002: Lipsă Atomicity pentru Payment + Booking
- TICKET-003: Employee Services Route 404
- TICKET-004: Lipsă Validare Business Status
- TICKET-005: File Upload Size Limit
- TICKET-006: Console.log Cleanup

**Estimare Sprint 1:** 15-20 ore

### Sprint 2 (High - 2 săptămâni)
- TICKET-007: N+1 Query în Employee Services
- TICKET-008: Lipsă Index-uri Database
- TICKET-009: Implementare Caching
- TICKET-010: Paginare pentru List Endpoints
- TICKET-011: Eliminare `any` Types Critice
- TICKET-012: Mesaje de Eroare Specifice
- TICKET-013: Rate Limiting Fail Closed

**Estimare Sprint 2:** 30-40 ore

### Sprint 3 (Medium - 1 lună)
- TICKET-014: Split Fișier Business.ts
- TICKET-015: Refactor State Management
- TICKET-016: React Optimizations
- TICKET-017: Protecție Rute Completă
- TICKET-018: Forms & Validation
- TICKET-019: Loading States Complete
- TICKET-020: Edge Cases în Booking Flow
- TICKET-021: JSDoc Documentation
- TICKET-022: Unit Tests
- TICKET-023: Monitoring Setup

**Estimare Sprint 3:** 60-80 ore

### Backlog (Low Priority)
- TICKET-024 până la TICKET-040
- Poate fi planificat după ce criticele sunt rezolvate

---

**Notă:** Prioritizarea este flexibilă și poate fi ajustată în funcție de business needs și feedback-ul din production.

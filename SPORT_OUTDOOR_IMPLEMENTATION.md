# Implementare Business Type: SPORT_OUTDOOR

## Overview
Pentru business type `SPORT_OUTDOOR`, sistemul trebuie să funcționeze diferit față de celelalte business types:
- **Nu există angajați (employees)** - business-ul gestionează terenuri, nu servicii cu angajați
- **În loc de servicii, există terenuri** (ex: Teren 1, Teren 2, Teren 3, etc.)
- **Fiecare teren are 3 tarife pe zi:** dimineață, după-amiază, nocturn
- **Calendarul este pe oră** (nu pe jumătate de oră)
- **Clientul alege un teren și o oră disponibilă**

---

## 1. Schema Database (Prisma)

### Model nou: `Court` (Teren)
```prisma
model Court {
  id         String   @id @default(cuid())
  businessId String
  name       String   // ex: "Teren 1", "Teren Fotbal", "Teren Padel A"
  number     Int      // Număr teren (1, 2, 3, etc.)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  business   Business @relation(fields: [businessId], references: [id], onDelete: Cascade)
  bookings   Booking[]
  pricing    CourtPricing[]

  @@unique([businessId, number])
  @@index([businessId])
}
```

### Model nou: `CourtPricing` (Tarife teren)
```prisma
model CourtPricing {
  id        String   @id @default(cuid())
  courtId   String
  timeSlot  TimeSlot // MORNING, AFTERNOON, NIGHT
  price     Float    // Preț per oră
  startHour Int      // Ora de început (0-23)
  endHour   Int      // Ora de sfârșit (0-23)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  court     Court    @relation(fields: [courtId], references: [id], onDelete: Cascade)

  @@unique([courtId, timeSlot])
  @@index([courtId])
}

enum TimeSlot {
  MORNING     // Dimineață (ex: 08:00 - 12:00)
  AFTERNOON   // După-amiază (ex: 12:00 - 18:00)
  NIGHT       // Nocturn (ex: 18:00 - 22:00)
}
```

### Modificare model `Booking`
```prisma
model Booking {
  // ... câmpuri existente
  serviceId  String?  // Nullable - nu se folosește pentru SPORT_OUTDOOR
  courtId    String?  // Nullable - se folosește doar pentru SPORT_OUTDOOR
  employeeId String?  // Nullable - nu se folosește pentru SPORT_OUTDOOR
  
  // ... relații existente
  service    Service? @relation(fields: [serviceId], references: [id])
  court      Court?   @relation(fields: [courtId], references: [id])
  // ...
}
```

### Modificare model `Business`
```prisma
model Business {
  // ... câmpuri existente
  services   Service[]
  courts     Court[]   // Nou - terenuri pentru SPORT_OUTDOOR
  // ...
}
```

---

## 2. Backend API Endpoints

### 2.1. Management Terenuri
```
GET    /business/:businessId/courts
POST   /business/:businessId/courts
PUT    /business/:businessId/courts/:courtId
DELETE /business/:businessId/courts/:courtId
```

### 2.2. Management Tarife Terenuri
```
GET    /business/:businessId/courts/:courtId/pricing
PUT    /business/:businessId/courts/:courtId/pricing
```

### 2.3. Disponibilitate Terenuri
```
GET    /business/:businessId/courts/:courtId/availability?date=YYYY-MM-DD
```

### 2.4. Modificare Booking
```
POST   /booking
- Pentru SPORT_OUTDOOR: acceptă `courtId` în loc de `serviceId`
- Nu acceptă `employeeId` pentru SPORT_OUTDOOR
- `slotDurationMinutes` este implicit 60 (1 oră)
```

---

## 3. Frontend Components

### 3.1. CourtSelector Component
- Similar cu `ServiceSelector`, dar pentru terenuri
- Afișează lista de terenuri active ale business-ului
- Fiecare teren are nume și număr

### 3.2. CourtSettings Component (Business Dashboard)
- **Secțiune 1: Terenuri**
  - Listă terenuri existente
  - Buton "Adaugă teren"
  - Pentru fiecare teren: editare nume, număr, activare/dezactivare, ștergere
  
- **Secțiune 2: Tarife pe teren**
  - Selectare teren
  - Pentru fiecare teren, 3 tarife:
    - **Dimineață**: startHour, endHour, price
    - **După-amiază**: startHour, endHour, price
    - **Nocturn**: startHour, endHour, price
  - Validare: startHour < endHour, orele să fie între 0-23

- **Secțiune 3: Program de funcționare**
  - Similar cu working hours, dar pentru terenuri
  - Setare zile active și ore de funcționare

### 3.3. Modificare Client Booking Page
- **Detectare business type:**
  - Dacă `businessType === "SPORT_OUTDOOR"`:
    - Afișează `CourtSelector` în loc de `ServiceSelector`
    - Calendar pe oră (slotDurationMinutes = 60)
    - Nu afișează selector de employee
  - Altfel:
    - Comportament normal (servicii + employees)

### 3.4. Modificare Calendar Logic
- Pentru SPORT_OUTDOOR:
  - `slotDurationMinutes = 60` (1 oră)
  - Disponibilitate bazată pe:
    - Program de funcționare business
    - Booking-uri existente pentru terenul selectat
    - Tarifele terenului (dimineață, după-amiază, nocturn)
  - Prețul afișat în calendar bazat pe timeSlot (MORNING/AFTERNOON/NIGHT)

---

## 4. Validări și Restricții

### 4.1. Business Type SPORT_OUTDOOR
- ❌ **Nu se pot adăuga employees** - validare în backend
- ❌ **Nu se folosesc servicii** - se folosesc terenuri
- ✅ **Se folosesc terenuri (courts)**
- ✅ **Calendar pe oră** (nu pe jumătate de oră)
- ✅ **Tarife pe timeSlot** (dimineață, după-amiază, nocturn)

### 4.2. Booking pentru SPORT_OUTDOOR
- `courtId` este obligatoriu
- `serviceId` trebuie să fie null
- `employeeId` trebuie să fie null
- `slotDurationMinutes` este implicit 60
- Prețul se calculează din `CourtPricing` bazat pe `timeSlot`

### 4.3. Validări Tarife
- `startHour` < `endHour`
- `startHour` și `endHour` între 0-23
- Nu se pot suprapune timeSlot-urile pentru același teren
- Fiecare teren trebuie să aibă toate cele 3 timeSlot-uri configurate

---

## 5. Flow Client pentru SPORT_OUTDOOR

1. **Selectare Business** (SPORT_OUTDOOR)
2. **Selectare Teren** (ex: "Teren 1", "Teren 2", etc.)
3. **Selectare Dată** din calendar
4. **Vizualizare Ore Disponibile:**
   - Calendar pe oră (ex: 08:00, 09:00, 10:00, etc.)
   - Fiecare oră afișează prețul bazat pe timeSlot:
     - Dimineață (ex: 08:00-12:00): 50 RON/oră
     - După-amiază (ex: 12:00-18:00): 70 RON/oră
     - Nocturn (ex: 18:00-22:00): 90 RON/oră
5. **Selectare Oră** disponibilă
6. **Confirmare Booking:**
   - Afișare: Teren, Dată, Oră, Preț
   - Plata (dacă e necesară)
   - Confirmare

---

## 6. Flow Business pentru SPORT_OUTDOOR

### 6.1. Setări Terenuri
1. **Adăugare Teren:**
   - Nume (ex: "Teren Fotbal 1")
   - Număr (1, 2, 3, etc.)
   - Activare/Dezactivare

2. **Configurare Tarife:**
   - Selectare teren
   - Pentru fiecare timeSlot:
     - Dimineață: startHour (ex: 8), endHour (ex: 12), price (ex: 50)
     - După-amiază: startHour (ex: 12), endHour (ex: 18), price (ex: 70)
     - Nocturn: startHour (ex: 18), endHour (ex: 22), price (ex: 90)

3. **Program de Funcționare:**
   - Zile active (Luni-Duminică)
   - Ore de funcționare generale (ex: 08:00-22:00)

### 6.2. Dashboard Booking-uri
- Vizualizare booking-uri pe terenuri
- Filtrare după teren
- Calendar cu booking-uri pentru fiecare teren

---

## 7. Exemple de Date

### Teren 1 (Fotbal)
- Dimineață: 08:00-12:00, 50 RON/oră
- După-amiază: 12:00-18:00, 70 RON/oră
- Nocturn: 18:00-22:00, 90 RON/oră

### Teren 2 (Padel)
- Dimineață: 08:00-12:00, 60 RON/oră
- După-amiază: 12:00-18:00, 80 RON/oră
- Nocturn: 18:00-22:00, 100 RON/oră

### Teren 3 (Tennis)
- Dimineață: 08:00-12:00, 55 RON/oră
- După-amiază: 12:00-18:00, 75 RON/oră
- Nocturn: 18:00-22:00, 95 RON/oră

---

## 8. Checklist Implementare

### Backend
- [ ] Adăugare model `Court` în schema.prisma
- [ ] Adăugare model `CourtPricing` în schema.prisma
- [ ] Adăugare enum `TimeSlot` în schema.prisma
- [ ] Modificare model `Booking` (courtId nullable)
- [ ] Modificare model `Business` (relație courts)
- [ ] Creare migration Prisma
- [ ] Endpoint GET/POST/PUT/DELETE `/business/:businessId/courts`
- [ ] Endpoint GET/PUT `/business/:businessId/courts/:courtId/pricing`
- [ ] Endpoint GET `/business/:businessId/courts/:courtId/availability`
- [ ] Modificare endpoint POST `/booking` pentru SPORT_OUTDOOR
- [ ] Validare: SPORT_OUTDOOR nu acceptă employees
- [ ] Validare: SPORT_OUTDOOR folosește courts, nu services
- [ ] Calcul preț bazat pe timeSlot

### Frontend
- [ ] Componentă `CourtSelector`
- [ ] Componentă `CourtSettings` (business dashboard)
- [ ] Modificare `client/bookings/page.tsx` pentru SPORT_OUTDOOR
- [ ] Modificare calendar logic (slotDurationMinutes = 60 pentru SPORT_OUTDOOR)
- [ ] Afișare preț bazat pe timeSlot în calendar
- [ ] Ascundere selector employee pentru SPORT_OUTDOOR
- [ ] Hook `useCourts` pentru management terenuri
- [ ] Hook `useCourtAvailability` pentru disponibilitate

### Testing
- [ ] Test creare teren
- [ ] Test configurare tarife
- [ ] Test booking pentru SPORT_OUTDOOR
- [ ] Test validare (nu se pot adăuga employees)
- [ ] Test calcul preț bazat pe timeSlot

---

## 9. Note Importante

1. **Compatibilitate înapoi:** Business-urile existente cu servicii nu sunt afectate
2. **Flexibilitate:** Business-ul poate avea oricâte terenuri (ex: 1-10+)
3. **Tarife:** Fiecare teren poate avea tarife diferite pentru același timeSlot
4. **Program:** Programul de funcționare este la nivel de business, nu per teren
5. **Booking:** Un booking = 1 teren + 1 oră + 1 dată

---

## 10. Întrebări pentru Clarificare

1. **Terenurile pot avea programe diferite?** (ex: Teren 1 funcționează 08:00-22:00, Teren 2 funcționează 10:00-20:00)
   - **Răspuns propus:** Nu, programul este la nivel de business (toate terenurile au același program)

2. **Pot exista booking-uri pentru mai multe ore consecutive?** (ex: 10:00-12:00)
   - **Răspuns propus:** Da, clientul poate selecta mai multe ore consecutive, prețul se calculează pe baza timeSlot-urilor

3. **Pot exista booking-uri care se suprapun pe același teren?**
   - **Răspuns propus:** Nu, un teren poate fi rezervat doar de un client la un moment dat

4. **Consimțământ (consent) este necesar pentru SPORT_OUTDOOR?**
   - **Răspuns propus:** Nu, doar pentru MEDICAL_DENTAL și THERAPY_COACHING


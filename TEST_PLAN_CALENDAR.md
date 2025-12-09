# 🧪 Plan de Testare - Sistem Calendar VOOB

**Data**: 2025-12-08  
**Versiune**: Post-implementare modificări SPORT_OUTDOOR

---

## 📋 Checklist Testare

### ✅ Test 1: Vizualizare Terenuri pentru Client

**Scenariu**:
1. Autentifică-te ca **CLIENT**
2. Selectează business-ul **SPORT_OUTDOOR** (Sport & Outdoor Center)
3. Navighează la pagina de rezervări

**Verificări**:
- [ ] Terenurile se încarcă și se afișează corect
- [ ] Se văd toate terenurile configurate (chiar dacă nu sunt active)
- [ ] Fiecare teren afișează:
  - Numele terenului
  - Numărul terenului
  - Prețurile (dacă sunt configurate)

**Rezultat așteptat**: ✅ Toate terenurile sunt vizibile pentru client

---

### ✅ Test 2: Modală Selectare Durată (1-10 ore)

**Scenariu**:
1. Autentifică-te ca **CLIENT**
2. Selectează business-ul **SPORT_OUTDOOR**
3. Click pe un teren pentru a-l selecta

**Verificări**:
- [ ] Se deschide modală după click pe teren
- [ ] Modală afișează titlul: "Selectează durata rezervării"
- [ ] Se văd 10 opțiuni: 1 oră, 2 ore, 3 ore, ..., 10 ore
- [ ] Click pe o opțiune:
  - [ ] Modală se închide
  - [ ] Terenul este selectat
  - [ ] Durata este setată corect

**Rezultat așteptat**: ✅ Modală apare și funcționează corect

---

### ✅ Test 3: Scroll în Modalul de Pricing (Business)

**Scenariu**:
1. Autentifică-te ca **BUSINESS** (owner al business-ului SPORT_OUTDOOR)
2. Navighează la Dashboard
3. Click pe butonul "Configurează tarife" pentru un teren

**Verificări**:
- [ ] Modalul se deschide
- [ ] Modalul are scroll vertical când conținutul depășește înălțimea ecranului
- [ ] Se poate scrolla pentru a vedea toate secțiunile:
  - [ ] Dimineață (start hour, end hour, price)
  - [ ] După-amiază (start hour, end hour, price)
  - [ ] Nocturn (start hour, end hour, price)
- [ ] Butoanele "Renunță" și "Salvează tarife" sunt vizibile

**Rezultat așteptat**: ✅ Scroll-ul funcționează corect

---

### ✅ Test 4: Creare Booking SPORT_OUTDOOR cu Durată Personalizată

**Scenariu**:
1. Autentifică-te ca **CLIENT**
2. Selectează business-ul **SPORT_OUTDOOR**
3. Selectează un teren
4. Alege durata (ex: 3 ore)
5. Selectează data și ora
6. Creează booking-ul

**Verificări**:
- [ ] Booking-ul este creat cu durata corectă (3 ore = 180 minute)
- [ ] Booking-ul apare în calendar cu durata corectă
- [ ] Prețul este calculat corect (preț/oră × număr ore)

**Rezultat așteptat**: ✅ Booking-ul este creat cu durata selectată

---

### ✅ Test 5: Validare Durată Servicii (30 minute multipli)

**Scenariu**:
1. Autentifică-te ca **BUSINESS** (business normal, non-SPORT_OUTDOOR)
2. Navighează la Dashboard
3. Încearcă să adaugi un serviciu cu durată:
   - 30 minute ✅
   - 60 minute ✅
   - 90 minute ✅
   - 45 minute ❌ (ar trebui să fie respins)
   - 14 minute ❌ (ar trebui să fie respins)
   - 35 minute ❌ (ar trebui să fie respins)

**Verificări**:
- [ ] Duratele valide (30, 60, 90, 120, etc.) sunt acceptate
- [ ] Duratele invalide (45, 14, 35, etc.) sunt respinse cu mesaj de eroare
- [ ] Mesajul de eroare: "Durata trebuie să fie multiplu de 30 minute (30, 60, 90, 120, etc.)"

**Rezultat așteptat**: ✅ Validarea funcționează corect

---

### ✅ Test 6: Slot Duration Calculare

**Scenariu**:
1. Business normal cu servicii: 30min, 60min, 90min
2. Business normal cu servicii: 60min, 120min
3. Business SPORT_OUTDOOR

**Verificări**:
- [ ] Business 1: slot duration = 30 minute (minim)
- [ ] Business 2: slot duration = 60 minute (minim)
- [ ] Business SPORT_OUTDOOR: slot duration = 60 minute (forțat)

**Rezultat așteptat**: ✅ Slot duration este calculat corect

---

### ✅ Test 7: Suprapunere Booking-uri SPORT_OUTDOOR

**Scenariu**:
1. Client 1 creează booking pentru SPORT_OUTDOOR la 10:00 pentru 2 ore (10:00-12:00)
2. Client 2 încearcă să creeze booking pentru același teren:
   - La 10:30 pentru 1 oră ❌ (se suprapune)
   - La 11:00 pentru 1 oră ❌ (se suprapune)
   - La 12:00 pentru 1 oră ✅ (nu se suprapune)

**Verificări**:
- [ ] Backend blochează suprapunerile corect
- [ ] Frontend afișează slot-urile ocupate corect
- [ ] Mesajul de eroare: "Terenul este deja rezervat pentru această perioadă."

**Rezultat așteptat**: ✅ Suprapunerile sunt blocate corect

---

## 📊 Rezultate Testare

| Test | Status | Note |
|------|--------|------|
| Test 1: Vizualizare Terenuri | ⏳ Pending | |
| Test 2: Modală Durată | ⏳ Pending | |
| Test 3: Scroll Pricing | ⏳ Pending | |
| Test 4: Booking cu Durată | ⏳ Pending | |
| Test 5: Validare Durată | ⏳ Pending | |
| Test 6: Slot Duration | ⏳ Pending | |
| Test 7: Suprapunere | ⏳ Pending | |

---

## 🔍 Probleme Identificate în Timpul Testării

_(Completă după testare)_

---

## ✅ Aprobare Finală

- [ ] Toate testele au trecut
- [ ] Nu există probleme critice
- [ ] Sistemul este gata pentru producție

**Semnătura**: _________________  
**Data**: _________________


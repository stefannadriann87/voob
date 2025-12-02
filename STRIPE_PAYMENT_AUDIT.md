# 🔒 Audit Complet - Sistem de Plăți Stripe
**Data:** 2025-12-02  
**Scop:** Verificare completă a securității, legalității și funcționalității sistemului de plăți

---

## 📋 Executive Summary

### Status General: ⚠️ **NEEDS ATTENTION**

**Probleme Critice Identificate:**
1. ❌ **CRITIC:** Lipsă verificare autorizare pentru `/payments/create-intent` - orice utilizator autentificat poate crea payment intent pentru orice business
2. ❌ **CRITIC:** Lipsă verificare ownership în `/booking/confirm` - clientul poate confirma doar propriile plăți (OK), dar nu există verificare suplimentară
3. ⚠️ **IMPORTANT:** Lipsă validare amount în refund - se folosește `payment.amount` direct fără verificare cu Stripe
4. ⚠️ **IMPORTANT:** Lipsă idempotency keys pentru payment intents - risc de duplicate payments
5. ⚠️ **IMPORTANT:** Lipsă verificare dublă plată (double payment) în webhook handler

**Aspecte Pozitive:**
- ✅ Autentificare JWT implementată corect
- ✅ Validare input cu Zod schemas
- ✅ Webhook signature verification implementată
- ✅ Rate limiting implementat pentru payments
- ✅ Logging implementat pentru operațiuni critice
- ✅ Error handling general implementat

---

## 🔍 Analiză Detaliată pe Componente

### 1. **POST /payments/create-intent** ⚠️ **CRITIC**

**Fișier:** `backend/src/routes/payments.ts:42`

#### Probleme Identificate:

1. **❌ CRITIC: Lipsă verificare autorizare**
   ```typescript
   // PROBLEMA: Orice utilizator autentificat poate crea payment intent pentru orice business
   router.post("/create-intent", verifyJWT, validate(createPaymentIntentSchema), async (req, res) => {
     const clientId = req.user?.userId; // ✅ OK - folosește user autentificat
     // ❌ PROBLEMA: Nu verifică dacă clientId are dreptul să facă plată pentru acest business
   ```

   **Risc:** Un client poate crea payment intent pentru alt business fără să fie conectat la el.

   **Recomandare:**
   ```typescript
   // Verifică dacă clientul este conectat la business
   const clientBusinessLink = await prisma.clientBusinessLink.findFirst({
     where: {
       clientId: clientId,
       businessId: businessId,
     },
   });
   
   if (!clientBusinessLink) {
     return res.status(403).json({ 
       error: "Nu ești conectat la acest business. Scanează codul QR pentru a te conecta." 
     });
   }
   ```

2. **⚠️ IMPORTANT: Lipsă idempotency key**
   ```typescript
   // PROBLEMA: Nu există idempotency key pentru a preveni duplicate payments
   const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);
   ```

   **Risc:** Dacă clientul face double-click sau reîncarcă pagina, se pot crea multiple payment intents pentru aceeași rezervare.

   **Recomandare:**
   ```typescript
   // Generează idempotency key bazat pe booking details
   const idempotencyKey = `booking_${businessId}_${serviceId}_${date}_${clientId}`;
   
   const paymentIntent = await stripe.paymentIntents.create(
     paymentIntentParams,
     { idempotencyKey }
   );
   ```

3. **✅ OK: Validare amount**
   ```typescript
   const service = await validateBookingPayload({ businessId, serviceId });
   const amountMinor = toMinorCurrencyUnit(service.price);
   ```
   ✅ Amount-ul este validat din service.price - corect

4. **✅ OK: Validare input**
   ```typescript
   validate(createPaymentIntentSchema) // ✅ Zod schema validation
   ```

#### Verificări de Securitate:

- ✅ **Autentificare:** `verifyJWT` - OK
- ❌ **Autorizare:** Lipsă verificare ownership/connection
- ✅ **Validare Input:** Zod schema - OK
- ✅ **Rate Limiting:** `paymentRateLimiter` (5 req/min) - OK
- ❌ **Idempotency:** Lipsă - CRITIC

---

### 2. **POST /booking/confirm** ⚠️ **IMPORTANT**

**Fișier:** `backend/src/routes/booking.ts:776`

#### Probleme Identificate:

1. **✅ OK: Verificare ownership**
   ```typescript
   const authUser = req.user;
   if (!authUser || authUser.userId !== pending.clientId) {
     return res.status(403).json({ error: "Nu poți confirma această plată." });
   }
   ```
   ✅ Clientul poate confirma doar propriile plăți - corect

2. **⚠️ IMPORTANT: Lipsă verificare status payment**
   ```typescript
   // PROBLEMA: Nu verifică dacă payment-ul este deja confirmat
   const payment = await prisma.payment.findFirst({
     where: { externalPaymentId: paymentIntentId },
   });
   
   // ❌ Nu verifică payment.status === "SUCCEEDED" sau bookingId deja setat
   ```

   **Risc:** Dacă webhook-ul a procesat deja payment-ul, se poate crea booking duplicat.

   **Recomandare:**
   ```typescript
   if (payment.status === "SUCCEEDED" && payment.bookingId) {
     // Payment deja procesat, returnează booking existent
     const existing = await prisma.booking.findUnique({
       where: { id: payment.bookingId },
     });
     return res.json(existing);
   }
   
   if (payment.status !== "SUCCEEDED") {
     return res.status(400).json({ 
       error: "Plata nu este confirmată. Așteaptă confirmarea de la Stripe." 
     });
   }
   ```

3. **✅ OK: Validări business/service**
   ```typescript
   const [business, service] = await Promise.all([...]);
   if (!business || !service) {
     return res.status(404).json({ error: "Business-ul sau serviciul nu au fost găsite." });
   }
   ```
   ✅ Validare corectă

4. **✅ OK: Validare overlapping bookings**
   ```typescript
   // Verifică suprapuneri cu alte rezervări
   const overlappingBookings = await prisma.booking.findMany({...});
   ```
   ✅ Validare corectă

#### Verificări de Securitate:

- ✅ **Autentificare:** `verifyJWT` - OK
- ✅ **Autorizare:** Verifică ownership - OK
- ⚠️ **Status Check:** Lipsă verificare status payment - IMPORTANT
- ✅ **Validare Business:** Verifică business/service există - OK
- ✅ **Validare Overlaps:** Verifică suprapuneri - OK

---

### 3. **Webhook Handler** ⚠️ **IMPORTANT**

**Fișier:** `backend/src/routes/stripeWebhook.ts`

#### Probleme Identificate:

1. **✅ OK: Webhook signature verification**
   ```typescript
   const verifyMiddleware = verifyStripeWebhook(webhookSecret);
   ```
   ✅ Semnătura este verificată corect

2. **⚠️ IMPORTANT: Lipsă idempotency pentru webhook events**
   ```typescript
   // PROBLEMA: Nu verifică dacă event-ul a fost deja procesat
   switch (event.type) {
     case "payment_intent.succeeded":
       await handlePaymentSucceeded(event.data.object);
   ```

   **Risc:** Dacă Stripe retrimite același event (retry), se poate procesa de două ori.

   **Recomandare:**
   ```typescript
   // Verifică dacă event-ul a fost deja procesat
   const eventId = event.id;
   const processed = await prisma.webhookEvent.findUnique({
     where: { eventId },
   });
   
   if (processed) {
     logger.info("Webhook event already processed", { eventId });
     return res.json({ received: true });
   }
   
   // Procesează event-ul
   await handlePaymentSucceeded(event.data.object);
   
   // Salvează event-ul ca procesat
   await prisma.webhookEvent.create({
     data: { eventId, type: event.type, processed: true },
   });
   ```

3. **⚠️ IMPORTANT: Lipsă verificare double payment**
   ```typescript
   const handlePaymentSucceeded = async (intent: any) => {
     const payment = await prisma.payment.findFirst({
       where: { externalPaymentId: intent.id },
     });
     
     // ❌ Nu verifică dacă payment-ul este deja SUCCEEDED
     await prisma.payment.update({
       where: { id: payment.id },
       data: { status: "SUCCEEDED" },
     });
   ```

   **Recomandare:**
   ```typescript
   if (payment.status === "SUCCEEDED") {
     logger.warn("Payment already succeeded", { paymentId: payment.id });
     return; // Skip - deja procesat
   }
   ```

#### Verificări de Securitate:

- ✅ **Signature Verification:** Implementată corect
- ⚠️ **Idempotency:** Lipsă - IMPORTANT
- ⚠️ **Double Payment Check:** Lipsă - IMPORTANT
- ✅ **Error Handling:** Implementat

---

### 4. **Refund Logic** ⚠️ **IMPORTANT**

**Fișier:** `backend/src/routes/booking.ts:558`

#### Probleme Identificate:

1. **⚠️ IMPORTANT: Lipsă validare amount în refund**
   ```typescript
   const refund = await stripe.refunds.create({
     charge: charge.id,
     amount: Math.round(payment.amount * 100), // ❌ Nu verifică cu amount-ul real din Stripe
   });
   ```

   **Risc:** Dacă `payment.amount` din DB nu corespunde cu amount-ul real din Stripe, se poate face refund greșit.

   **Recomandare:**
   ```typescript
   // Verifică amount-ul real din Stripe
   const chargeAmount = charge.amount; // în cenți
   const paymentAmountCents = Math.round(payment.amount * 100);
   
   // Folosește amount-ul minim pentru a evita over-refund
   const refundAmount = Math.min(chargeAmount, paymentAmountCents);
   
   const refund = await stripe.refunds.create({
     charge: charge.id,
     amount: refundAmount,
   });
   ```

2. **⚠️ IMPORTANT: Lipsă verificare refund deja făcut**
   ```typescript
   // ❌ Nu verifică dacă refund-ul a fost deja făcut
   const refund = await stripe.refunds.create({...});
   ```

   **Recomandare:**
   ```typescript
   // Verifică dacă charge-ul are deja refund
   if (charge.refunded) {
     logger.warn("Charge already refunded", { chargeId: charge.id });
     return; // Skip
   }
   
   // Verifică dacă payment-ul este deja REFUNDED în DB
   if (payment.status === "REFUNDED") {
     logger.warn("Payment already refunded in DB", { paymentId: payment.id });
     return; // Skip
   }
   ```

3. **✅ OK: Error handling**
   ```typescript
   } catch (error: any) {
     refundError = error;
     logger.error("Refund processing failed", error);
     // Nu aruncă eroarea, continuă cu anularea booking-ului
   }
   ```
   ✅ Error handling corect - nu blochează anularea booking-ului

#### Verificări de Securitate:

- ⚠️ **Amount Validation:** Lipsă verificare cu Stripe - IMPORTANT
- ⚠️ **Double Refund Check:** Lipsă - IMPORTANT
- ✅ **Error Handling:** Implementat corect
- ✅ **Authorization:** Verifică ownership - OK

---

### 5. **Securitate Generală**

#### ✅ Aspecte Pozitive:

1. **Autentificare JWT:**
   - ✅ `verifyJWT` middleware implementat corect
   - ✅ Token validation cu secret
   - ✅ Error handling pentru token invalid

2. **Validare Input:**
   - ✅ Zod schemas pentru toate input-urile
   - ✅ CUID validation pentru IDs
   - ✅ Date/time validation

3. **Rate Limiting:**
   - ✅ Global rate limiter: 100 req/15min
   - ✅ Payment rate limiter: 5 req/min
   - ✅ Booking rate limiter: 10 req/min

4. **Logging:**
   - ✅ Logger implementat pentru operațiuni critice
   - ✅ Error logging pentru debugging

#### ❌ Aspecte de Îmbunătățit:

1. **Lipsă verificare autorizare pentru payments:**
   - ❌ `/payments/create-intent` nu verifică dacă clientul este conectat la business

2. **Lipsă idempotency:**
   - ❌ Payment intents nu au idempotency keys
   - ❌ Webhook events nu sunt marcate ca procesate

3. **Lipsă verificări double payment/refund:**
   - ❌ Nu verifică dacă payment-ul este deja SUCCEEDED
   - ❌ Nu verifică dacă refund-ul a fost deja făcut

---

## 🏛️ Compliance & Legal

### PCI-DSS Compliance:

✅ **Aspecte Pozitive:**
- ✅ Nu stocăm card data - folosim Stripe Elements
- ✅ Nu procesăm card data direct - Stripe gestionează totul
- ✅ Folosim Stripe API oficial

⚠️ **Recomandări:**
- ⚠️ Asigură-te că Stripe account-ul este PCI-DSS compliant
- ⚠️ Verifică că toate comunicările cu Stripe sunt prin HTTPS

### GDPR Compliance:

✅ **Aspecte Pozitive:**
- ✅ Datele personale sunt procesate doar pentru scopuri legitime
- ✅ Clientul are control asupra datelor (poate anula rezervări)
- ✅ Email-uri de notificare includ informații despre procesare

⚠️ **Recomandări:**
- ⚠️ Asigură-te că ai Privacy Policy și Terms of Service
- ⚠️ Implementează dreptul la ștergere (right to be forgotten)

### Legal (România):

✅ **Aspecte Pozitive:**
- ✅ Refund-urile sunt procesate corect
- ✅ Clientul primește notificări despre refund

⚠️ **Recomandări:**
- ⚠️ Verifică că ai toate licențele necesare pentru procesare plăți
- ⚠️ Asigură-te că ai contract cu Stripe conform legislației române

---

## 🎯 Recomandări Prioritizate

### 🔴 CRITIC (Implementare Imediată):

1. **Adaugă verificare autorizare în `/payments/create-intent`:**
   ```typescript
   // Verifică dacă clientul este conectat la business
   const clientBusinessLink = await prisma.clientBusinessLink.findFirst({
     where: { clientId, businessId },
   });
   if (!clientBusinessLink) {
     return res.status(403).json({ error: "Nu ești conectat la acest business." });
   }
   ```

2. **Adaugă idempotency keys pentru payment intents:**
   ```typescript
   const idempotencyKey = `booking_${businessId}_${serviceId}_${date}_${clientId}`;
   const paymentIntent = await stripe.paymentIntents.create(
     paymentIntentParams,
     { idempotencyKey }
   );
   ```

3. **Adaugă verificare status payment în `/booking/confirm`:**
   ```typescript
   if (payment.status === "SUCCEEDED" && payment.bookingId) {
     // Returnează booking existent
   }
   if (payment.status !== "SUCCEEDED") {
     return res.status(400).json({ error: "Plata nu este confirmată." });
   }
   ```

### 🟡 IMPORTANT (Implementare în Săptămâna Viitoare):

4. **Adaugă idempotency pentru webhook events:**
   - Creează tabel `WebhookEvent` în Prisma
   - Verifică dacă event-ul a fost deja procesat

5. **Adaugă verificare double payment în webhook:**
   ```typescript
   if (payment.status === "SUCCEEDED") {
     return; // Skip - deja procesat
   }
   ```

6. **Adaugă validare amount în refund:**
   ```typescript
   const chargeAmount = charge.amount;
   const paymentAmountCents = Math.round(payment.amount * 100);
   const refundAmount = Math.min(chargeAmount, paymentAmountCents);
   ```

7. **Adaugă verificare double refund:**
   ```typescript
   if (charge.refunded || payment.status === "REFUNDED") {
     return; // Skip - deja refundat
   }
   ```

### 🟢 NICE TO HAVE (Implementare în Viitor):

8. **Adaugă monitoring și alerting pentru plăți:**
   - Alert când payment intent eșuează
   - Alert când refund eșuează
   - Dashboard pentru plăți

9. **Adaugă audit log pentru toate operațiunile de plată:**
   - Cine a creat payment intent
   - Cine a confirmat payment
   - Cine a făcut refund

10. **Implementează retry logic pentru refund-uri eșuate:**
    - Queue pentru refund-uri eșuate
    - Retry automat după X minute

---

## 📊 Test Cases Recomandate

### Test Case 1: Double Payment Intent
**Scenariu:** Client face double-click pe butonul de plată
**Așteptat:** Doar un payment intent este creat (idempotency)
**Status:** ❌ Nu este implementat

### Test Case 2: Unauthorized Payment Intent
**Scenariu:** Client încearcă să creeze payment intent pentru business la care nu este conectat
**Așteptat:** 403 Forbidden
**Status:** ❌ Nu este implementat

### Test Case 3: Double Webhook Event
**Scenariu:** Stripe retrimite același webhook event
**Așteptat:** Event-ul este procesat doar o dată
**Status:** ❌ Nu este implementat

### Test Case 4: Double Refund
**Scenariu:** Business încearcă să facă refund de două ori pentru aceeași rezervare
**Așteptat:** Al doilea refund este respins
**Status:** ❌ Nu este implementat

### Test Case 5: Refund Amount Mismatch
**Scenariu:** Amount-ul din DB nu corespunde cu amount-ul din Stripe
**Așteptat:** Se folosește amount-ul minim pentru a evita over-refund
**Status:** ❌ Nu este implementat

---

## ✅ Checklist Final

### Securitate:
- [x] Autentificare JWT implementată
- [ ] Autorizare verificată pentru toate endpoint-urile
- [x] Validare input implementată
- [x] Rate limiting implementat
- [ ] Idempotency implementată
- [ ] Double payment/refund checks implementate

### Compliance:
- [x] PCI-DSS: Nu stocăm card data
- [ ] GDPR: Privacy Policy și Terms of Service
- [ ] Legal: Contract Stripe conform legislației

### Funcționalitate:
- [x] Payment intent creation
- [x] Payment confirmation
- [x] Refund processing
- [x] Webhook handling
- [ ] Idempotency
- [ ] Error recovery

---

## 📝 Concluzie

Sistemul de plăți are o bază solidă, dar necesită îmbunătățiri critice în:
1. **Autorizare** - verificare ownership/connection
2. **Idempotency** - prevenire duplicate payments
3. **Double checks** - verificare status înainte de procesare

**Prioritate:** Implementare imediată pentru problemele critice (🔴), apoi problemele importante (🟡).

**Risc Total:** ⚠️ **MEDIU-ALT** - Sistemul funcționează, dar are vulnerabilități care pot duce la:
- Plăți duplicate
- Refund-uri duplicate
- Acces neautorizat la crearea de payment intents


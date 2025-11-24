# Serviciu SMS - Integrare SMSAdvert.ro

Acest serviciu permite trimiterea automată de SMS-uri către clienți pentru notificări despre rezervări.

## Configurare

1. **Adaugă token-ul SMSAdvert în `.env`:**
   ```env
   SMSADVERT_API_TOKEN=your-smsadvert-api-token
   ```

2. **Obține token-ul de la SMSAdvert.ro:**
   - Loghează-te în contul tău SMSAdvert.ro
   - Accesează secțiunea API/Integrare
   - Copiază token-ul API

## Funcționalități

### 1. Confirmare rezervare
SMS-ul de confirmare se trimite automat când:
- O rezervare nouă este creată
- Statusul rezervării este `CONFIRMED` (nu necesită consimțământ)

**Mesaj exemplu:**
```
Salut [Nume Client], rezervarea ta la [Business Name] a fost confirmată pentru [Data] la [Ora]. Serviciu: [Nume Serviciu]. Ne vedem acolo!
```

### 2. Anulare rezervare
SMS-ul de anulare se trimite automat când:
- O rezervare este ștearsă/anulată

**Mesaj exemplu:**
```
Salut [Nume Client], rezervarea ta la [Business Name] pe [Data] la [Ora] a fost anulată. Dacă vrei să reprogramezi, intră în aplicație.
```

### 3. Reminder rezervare (24h înainte)
SMS-urile de reminder se trimit automat prin scriptul de cron.

**Configurare cron:**
```bash
# Rulează la fiecare oră
0 * * * * cd /path/to/backend && npm run reminder:sms
```

**Sau rulează manual:**
```bash
npm run reminder:sms
```

**Mesaj exemplu:**
```
Te reamintim: ai o programare la [Business Name] pe [Data] la [Ora]. Serviciu: [Nume Serviciu]. Ne vedem acolo!
```

## Format număr telefon

Serviciul acceptă numere de telefon în următoarele formate:
- `0712345678` → `+40712345678`
- `40712345678` → `+40712345678`
- `+40712345678` → `+40712345678`

Numerele sunt validate și formatate automat în format E.164 pentru România.

## Funcții disponibile

### `sendSms(options)`
Funcție generică pentru trimiterea SMS-urilor.

```typescript
const result = await sendSms({
  phone: "+40712345678",
  message: "Mesajul tău",
  startDate: 1681234567, // Optional: Unix timestamp pentru programare
  endDate: 1681234567,   // Optional: Unix timestamp pentru programare
  callback: "https://your-app.com/sms-callback" // Optional: URL pentru callback
});
```

### `sendBookingConfirmationSms(...)`
Trimite SMS de confirmare pentru o rezervare.

### `sendBookingReminderSms(...)`
Trimite SMS de reminder pentru o rezervare.

### `sendBookingCancellationSms(...)`
Trimite SMS de anulare pentru o rezervare.

### `formatPhoneNumber(phone)`
Formatează un număr de telefon în format E.164.

## Gestionare erori

SMS-urile sunt trimise în mod asincron (fire-and-forget) pentru a nu bloca request-urile API. Erorile sunt logate în consolă dar nu opresc flow-ul aplicației.

## Limitări

- Lungimea maximă a mesajului: 1600 caractere
- SMS-urile scurte (≤160 caractere) sunt trimise ca SMS standard
- SMS-urile lungi (>160 caractere) sunt trimise ca SMS concatenat

## Testare

Pentru a testa serviciul SMS:

1. Asigură-te că ai setat `SMSADVERT_API_TOKEN` în `.env`
2. Creează o rezervare nouă - ar trebui să primești SMS de confirmare
3. Anulează o rezervare - ar trebui să primești SMS de anulare
4. Rulează scriptul de reminder: `npm run reminder:sms`

## Suport

Pentru probleme sau întrebări despre integrarea SMSAdvert, consultă:
- Documentația SMSAdvert.ro: https://www.smsadvert.ro/api/docs
- Log-urile aplicației pentru detalii despre erori


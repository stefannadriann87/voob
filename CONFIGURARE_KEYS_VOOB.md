# Configurare Keys și Servicii Externe pentru VOOB

Această listă conține toate cheile și serviciile externe care trebuie configurate pentru platforma VOOB cu domeniul **voob.io**.

## 📋 Lista Completă de Keys

### 1. 🔐 Google reCAPTCHA v3
**Status**: ✅ Deja configurat (ai adăugat cheile)

**Ce trebuie configurat:**
- ✅ Site Key → `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (frontend/.env.local)
- ✅ Secret Key → `RECAPTCHA_SECRET_KEY` (backend/.env)

**Unde să le adaugi:**
- Frontend: `frontend/.env.local` → `NEXT_PUBLIC_RECAPTCHA_SITE_KEY="6LfKZCIsAAAAAGi3pn7ENJ58JecqDs03aKuaoXac"`
- Backend: `backend/.env` → `RECAPTCHA_SECRET_KEY="your_secret_key"`

**Link configurare**: https://www.google.com/recaptcha/admin/site/740451530/setup
- ✅ Domeniu adăugat: voob.io
- ✅ Tip: reCAPTCHA v3

---

### 2. 💳 Stripe (Plăți și Abonamente)
**Status**: ⚠️ Trebuie configurat pentru voob.io

**Ce trebuie configurat:**
1. **Stripe Account** → Creează/actualizează cont Stripe
2. **API Keys**:
   - `STRIPE_SECRET_KEY` (backend/.env) - Secret key
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (frontend/.env.local) - Publishable key
3. **Webhook Secrets**:
   - `STRIPE_WEBHOOK_SECRET` (backend/.env) - Pentru webhooks generale
   - `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` (backend/.env) - Pentru webhooks abonamente
   - `STRIPE_BILLING_WEBHOOK_SECRET` (backend/.env) - Pentru webhooks billing

**Pași de configurare:**
1. **Accesează Stripe Dashboard**: https://dashboard.stripe.com/
2. **Settings → API keys**:
   - Copiază **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - Copiază **Secret key** → `STRIPE_SECRET_KEY`
3. **Webhooks** (IMPORTANT - acestea NU sunt API keys, ci signing secrets):
   - Accesează: https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - Endpoint URL: `https://voob.io/webhooks/stripe`
   - Selectează events:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Click "Add endpoint"
   - **Copiază "Signing secret"** (începe cu `whsec_...`) → `STRIPE_WEBHOOK_SECRET`
   
   **Notă**: Poți folosi același webhook secret pentru toate (`STRIPE_WEBHOOK_SECRET`). 
   Codul are fallback-uri, deci `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` și `STRIPE_BILLING_WEBHOOK_SECRET` 
   sunt opționale - dacă lipsesc, se va folosi `STRIPE_WEBHOOK_SECRET`.
   
   **Pentru webhooks separate** (opțional, pentru organizare mai bună):
   - Creează webhook separat pentru subscriptions → `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`
   - Creează webhook separat pentru billing → `STRIPE_BILLING_WEBHOOK_SECRET`
4. **Stripe Connect** (pentru business-uri):
   - Settings → Connect → Activate Connect
   - Configurează redirect URI: `https://voob.io/business/onboarding/kyc-return`
   - Pentru production, folosește Live mode keys

**Variabile de mediu:**
```env
# Backend (.env)
STRIPE_SECRET_KEY="sk_live_..."
STRIPE_WEBHOOK_SECRET="whsec_..."  # OBLIGATORIU - Signing secret de la webhook endpoint
STRIPE_SUBSCRIPTION_WEBHOOK_SECRET="whsec_..."  # Opțional - dacă lipsește, folosește STRIPE_WEBHOOK_SECRET
STRIPE_BILLING_WEBHOOK_SECRET="whsec_..."  # Opțional - dacă lipsește, folosește STRIPE_WEBHOOK_SECRET

# Frontend (.env.local)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_..."
```

**💡 Recomandare**: Pentru început, folosește doar `STRIPE_WEBHOOK_SECRET`. 
Celelalte două sunt opționale și se vor folosi automat `STRIPE_WEBHOOK_SECRET` dacă lipsesc.

---

### 3. 🗺️ Google Maps API
**Status**: ⚠️ Trebuie configurat pentru voob.io

**Ce trebuie configurat:**
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (frontend/.env.local)

**Pași de configurare:**
1. **Accesează Google Cloud Console**: https://console.cloud.google.com/
2. **Creează/Selectează proiect**: "VOOB" sau similar
3. **Activează Google Maps JavaScript API**:
   - Navigate to: APIs & Services → Library
   - Caută "Maps JavaScript API" → Enable
   - Caută "Places API" → Enable (necesar pentru autocomplete)
   - Caută "Geocoding API" → Enable (necesar pentru conversie adrese)
4. **Creează API Key**:
   - APIs & Services → Credentials → Create Credentials → API Key
   - Copiază key-ul
5. **Restricționează API Key** (IMPORTANT pentru securitate):
   - Click pe key-ul creat → Edit
   - **Application restrictions**:
     - Selectează "HTTP referrers (web sites)"
     - Adaugă:
       - `https://voob.io/*`
       - `https://*.voob.io/*`
       - `http://localhost:3000/*` (pentru development)
   - **API restrictions**:
     - Selectează "Restrict key"
     - Selectează doar:
       - Maps JavaScript API
       - Places API
       - Geocoding API

**Variabilă de mediu:**
```env
# Frontend (.env.local)
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="AIza..."
```

**Costuri**: Google Maps are un free tier generos (prima $200/lună gratuit), apoi pay-as-you-go.

---

### 4. 🤖 OpenAI API (AI Assistant)
**Status**: ⚠️ Opțional, dar recomandat

**Ce trebuie configurat:**
- `OPENAI_API_KEY` (backend/.env)
- `OPENAI_COST_PER_1K_TOKENS` (backend/.env) - Opțional, default: 0.015

**Pași de configurare:**
1. **Accesează OpenAI Platform**: https://platform.openai.com/
2. **Creează cont** sau loghează-te
3. **API Keys**:
   - Navigate to: https://platform.openai.com/api-keys
   - Create new secret key
   - Copiază key-ul (se afișează o singură dată!)

**Variabilă de mediu:**
```env
# Backend (.env)
OPENAI_API_KEY="sk-..."
OPENAI_COST_PER_1K_TOKENS="0.015"  # Opțional, pentru estimare costuri
```

**Costuri**: Pay-as-you-go, modelul `gpt-4o-mini` folosit este foarte ieftin (~$0.15 per 1M tokens input).

---

### 5. 📱 SMS Service (SMSAdvert)
**Status**: ⚠️ Trebuie configurat pentru voob.io

**Ce trebuie configurat:**
- `SMSADVERT_API_TOKEN` (backend/.env)

**Pași de configurare:**
1. **Accesează SMSAdvert**: https://www.smsadvert.ro/ sau provider-ul tău de SMS
2. **Creează cont** sau loghează-te
3. **Obține API Token**:
   - Navigate to: API Settings sau Dashboard
   - Generează/copiază API Token

**Variabilă de mediu:**
```env
# Backend (.env)
SMSADVERT_API_TOKEN="your_sms_api_token"
```

**Notă**: Dacă folosești alt provider SMS, poate fi necesar să modifici `backend/src/services/smsService.ts`.

---

### 6. 📧 Email SMTP
**Status**: ⚠️ Trebuie configurat pentru voob.io

**Ce trebuie configurat:**
- `SMTP_HOST` (backend/.env)
- `SMTP_PORT` (backend/.env)
- `SMTP_SECURE` (backend/.env)
- `SMTP_USER` (backend/.env)
- `SMTP_PASS` (backend/.env)
- `EMAIL_FROM` (backend/.env) - Deja actualizat la `no-reply@voob.io`

**Pași de configurare:**
1. **Alege provider SMTP**:
   - **Gmail** (recomandat pentru început):
     - Activează 2-Step Verification
     - Generează App Password: https://myaccount.google.com/apppasswords
   - **SendGrid** (recomandat pentru production):
     - Creează cont: https://sendgrid.com/
     - Obține API Key
   - **AWS SES** (pentru scale):
     - Configurează în AWS Console
   - **Alt provider SMTP**

2. **Configurare DNS** (pentru voob.io):
   - Adaugă SPF record: `v=spf1 include:_spf.google.com ~all` (pentru Gmail)
   - Adaugă DKIM record (dacă e necesar)
   - Adaugă DMARC record (recomandat)

**Variabile de mediu:**
```env
# Backend (.env)
SMTP_HOST="smtp.gmail.com"  # sau smtp.sendgrid.net, etc.
SMTP_PORT="587"  # sau 465 pentru SSL
SMTP_SECURE="false"  # true pentru port 465, false pentru 587
SMTP_USER="your-email@voob.io"  # sau your-sendgrid-username
SMTP_PASS="your-app-password"  # sau your-sendgrid-api-key
EMAIL_FROM="no-reply@voob.io"
DEMO_ADMIN_EMAIL="admin@voob.io"  # Pentru notificări demo
```

---

### 7. 🔗 Frontend URL
**Status**: ⚠️ Trebuie actualizat pentru production

**Ce trebuie configurat:**
- `FRONTEND_URL` (backend/.env)
- `FRONTEND_URL_CDN` (backend/.env) - Opțional, pentru CDN
- `ADMIN_URL` (backend/.env) - Opțional, pentru admin panel separat

**Variabile de mediu:**
```env
# Backend (.env)
FRONTEND_URL="https://voob.io"
FRONTEND_URL_CDN="https://cdn.voob.io"  # Opțional
ADMIN_URL="https://admin.voob.io"  # Opțional
```

---

### 8. 🔐 JWT Secret
**Status**: ✅ Generat

**Ce trebuie configurat:**
- `JWT_SECRET` (backend/.env) - Minim 32 caractere

**Secret generat:**
```
3t1Dw76n4v9oCYoiujpUmcfwR80O3xFxAligNTaYByc=
```

**⚠️ IMPORTANT**: Acest secret a fost generat ca exemplu. Pentru production, generează un secret nou folosind una dintre metodele de mai jos.

**Generare (pentru production):**
```bash
# Opțiunea 1: Folosind OpenSSL
openssl rand -base64 32

# Opțiunea 2: Folosind Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Variabilă de mediu:**
```env
# Backend (.env)
JWT_SECRET="3t1Dw76n4v9oCYoiujpUmcfwR80O3xFxAligNTaYByc="
```

**Notă**: Pentru production, generează un secret nou și nu-l partaja niciodată public!

---

### 9. 🗄️ Database
**Status**: ✅ Deja actualizat în README

**Ce trebuie configurat:**
- `DATABASE_URL` (backend/.env)

**Variabilă de mediu:**
```env
# Backend (.env)
DATABASE_URL="postgresql://postgres:password@localhost:5432/voob"
```

**Notă**: Asigură-te că baza de date `voob` există sau creeaz-o:
```sql
CREATE DATABASE voob;
```

---

## 📝 Checklist Final

### Backend (.env)
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `JWT_SECRET` - Secret pentru JWT tokens (min 32 chars)
- [ ] `RECAPTCHA_SECRET_KEY` - Google reCAPTCHA secret key
- [ ] `STRIPE_SECRET_KEY` - Stripe secret key
- [ ] `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- [ ] `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` - Opțional, pentru abonamente
- [ ] `STRIPE_BILLING_WEBHOOK_SECRET` - Opțional, pentru billing
- [ ] `SMSADVERT_API_TOKEN` - SMS service API token
- [ ] `SMTP_HOST` - SMTP server host
- [ ] `SMTP_PORT` - SMTP port (587 sau 465)
- [ ] `SMTP_SECURE` - "true" sau "false"
- [ ] `SMTP_USER` - SMTP username
- [ ] `SMTP_PASS` - SMTP password/API key
- [ ] `EMAIL_FROM` - Email sender (no-reply@voob.io)
- [ ] `DEMO_ADMIN_EMAIL` - Email pentru notificări demo
- [ ] `FRONTEND_URL` - https://voob.io
- [ ] `OPENAI_API_KEY` - Opțional, pentru AI
- [ ] `OPENAI_COST_PER_1K_TOKENS` - Opțional, default 0.015

### Frontend (.env.local)
- [ ] `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` - Google reCAPTCHA site key ✅
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- [ ] `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` - Google Maps API key

---

## 🔗 Link-uri Utile

- **Google reCAPTCHA**: https://www.google.com/recaptcha/admin/site/740451530/setup
- **Stripe Dashboard**: https://dashboard.stripe.com/
- **Google Cloud Console**: https://console.cloud.google.com/
- **OpenAI Platform**: https://platform.openai.com/
- **SMSAdvert**: https://www.smsadvert.ro/ (sau provider-ul tău)

---

## ⚠️ Notițe Importante

1. **Pentru Production**: Folosește întotdeauna **Live keys**, nu Test keys
2. **Securitate**: Restricționează toate API keys la domeniul voob.io
3. **Backup**: Salvează toate keys într-un password manager
4. **Environment Variables**: Nu comita niciodată `.env` files în git
5. **Webhooks**: Asigură-te că endpoint-urile sunt accesibile public (HTTPS)

---

## 🚀 După Configurare

1. **Repornește backend-ul** pentru a încărca noile variabile de mediu
2. **Repornește frontend-ul** pentru a încărca noile variabile publice
3. **Testează fiecare serviciu**:
   - reCAPTCHA: Încearcă login/register
   - Stripe: Testează un payment
   - Google Maps: Deschide business profile cu map picker
   - SMS: Trimite un SMS de test
   - Email: Trimite un email de test
   - OpenAI: Testează AI assistant


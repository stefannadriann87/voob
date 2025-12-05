# VOOB - Booking Management System

Sistem de management pentru rezervări, construit cu Next.js și Node.js/Express.

## Tehnologii

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript, Prisma ORM
- **Database**: PostgreSQL (configurat prin Prisma)

## Structura Proiectului

```
VOOB/
├── frontend/          # Aplicația Next.js
├── backend/           # API Express
└── README.md
```

## Instalare

### Backend

```bash
cd backend
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Configurare

> 📋 **Pentru o listă completă cu toate cheile și serviciile externe necesare, vezi [CONFIGURARE_KEYS_VOOB.md](./CONFIGURARE_KEYS_VOOB.md)**

1. Creează un fișier `.env` în folderul `backend/` cu următoarele variabile:
   ```
   DATABASE_URL="postgresql://postgres:password@localhost:5432/voob"
   JWT_SECRET="your_jwt_secret"
   PORT=3001
   OPENAI_API_KEY="your_openai_api_key"  # Opțional - pentru funcționalitate AI completă
   
   # Configurare SMTP pentru trimitere emailuri (opțional pentru development)
   # Fără aceste variabile, emailurile vor fi doar logate în consolă
   SMTP_HOST="smtp.gmail.com"           # sau alt server SMTP
   SMTP_PORT=587
   SMTP_SECURE="false"                   # true pentru port 465, false pentru 587
   SMTP_USER="your-email@gmail.com"
   SMTP_PASS="your-app-password"         # Pentru Gmail, folosește "App Password"
   EMAIL_FROM="no-reply@voob.io"
   DEMO_ADMIN_EMAIL="admin@voob.io"  # Email pentru notificări demo
   
   # Configurare reCAPTCHA v3 (obligatoriu pentru autentificare)
   RECAPTCHA_SECRET_KEY="your_recaptcha_secret_key"  # Secret key de la Google reCAPTCHA
   ```

2. Creează un fișier `.env.local` (sau `.env`) în folderul `frontend/` cu următoarele variabile:
   ```
   # Configurare reCAPTCHA v3 (obligatoriu pentru autentificare)
   NEXT_PUBLIC_RECAPTCHA_SITE_KEY="your_recaptcha_site_key"  # Site key de la Google reCAPTCHA
   ```

   **Notă**: Pentru Gmail, trebuie să:
   - Activezi "2-Step Verification" în contul tău Google
   - Generezi un "App Password" din setările contului
   - Folosești acel App Password în `SMTP_PASS`

2. Rulează migrațiile Prisma:
   ```bash
   cd backend
   npx prisma db push
   npx prisma generate
   ```

3. (Opțional) Rulează script-urile de seed:
   ```bash
   npm run seed:superadmin
   npm run seed:businesses
   ```

## Funcționalități

- **Autentificare**: Login/Register cu roluri (CLIENT, BUSINESS, EMPLOYEE, SUPERADMIN)
- **Rezervări**: Creare, editare, anulare rezervări
- **Calendar**: Vizualizare calendar pentru business și clienți
- **Management Business**: Adăugare servicii, angajați, setări
- **Notificări**: Sistem de notificări pentru programări viitoare
- **Profil**: Editare profil pentru clienți și business
- **AI Assistant**: Asistent inteligent cu acces bazat pe roluri (necesită OPENAI_API_KEY)
- **Program de lucru**: Configurare zile și ore de lucru, pauze, concedii

## Rulare

Backend rulează pe `http://localhost:3001`
Frontend rulează pe `http://localhost:3000`

## Licență

Proprietate privată


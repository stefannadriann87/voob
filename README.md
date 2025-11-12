# LARSTEF - Booking Management System

Sistem de management pentru rezervări, construit cu Next.js și Node.js/Express.

## Tehnologii

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Node.js, Express, TypeScript, Prisma ORM
- **Database**: PostgreSQL (configurat prin Prisma)

## Structura Proiectului

```
LARSTEF/
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

1. Creează un fișier `.env` în folderul `backend/` cu următoarele variabile:
   ```
   DATABASE_URL="your_database_url"
   JWT_SECRET="your_jwt_secret"
   PORT=3001
   ```

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

## Rulare

Backend rulează pe `http://localhost:3001`
Frontend rulează pe `http://localhost:3000`

## Licență

Proprietate privată


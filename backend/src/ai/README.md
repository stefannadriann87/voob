# LARSTEF AI Agent - Backend Structure

## 📁 Structura Directoarelor

```
backend/src/ai/
├── agent.ts              # Orchestrator principal - comunică cu OpenAI
├── contextBuilder.ts     # Construiește contextul AI din JWT
├── permissions.ts        # Mapare tools <-> roluri
├── router.ts             # Endpoint /api/ai/agent
└── tools/
    ├── clientTools.ts    # Tools pentru rolul CLIENT
    ├── businessTools.ts  # Tools pentru rolurile BUSINESS/EMPLOYEE
    ├── adminTools.ts     # Tools pentru rolul SUPERADMIN
    └── index.ts          # Agregă toate tools-urile
```

## 🔄 Flow de Procesare

1. **Frontend** → Trimite mesaj + JWT token către `/api/ai/agent`
2. **router.ts** → Validează JWT prin `verifyJWT` middleware
3. **contextBuilder.ts** → Construiește contextul AI (userId, role, businessId)
4. **agent.ts** → Trimite cererea către OpenAI cu tools disponibile
5. **OpenAI** → Returnează function_call (dacă este cazul)
6. **permissions.ts** → Verifică dacă tool-ul este permis pentru rol
7. **tools/index.ts** → Execută tool-ul corespunzător
8. **agent.ts** → Trimite rezultatul înapoi la OpenAI pentru răspuns final
9. **router.ts** → Returnează răspunsul către frontend

## 🔐 Permisiuni pe Roluri

| Rol | Tools Disponibile |
|-----|-------------------|
| CLIENT | `viewBookings`, `cancelOwnBooking` |
| BUSINESS | `viewBookings`, `createBooking`, `cancelBooking`, `generateReport` |
| EMPLOYEE | `viewBookings`, `createBooking`, `cancelBooking` |
| SUPERADMIN | `viewAllBusinesses`, `viewTransactions`, `generateGlobalReport` |

## 🛠️ Adăugare Tool Nou

1. Adaugă funcția în fișierul corespunzător din `tools/`:
   - `clientTools.ts` pentru CLIENT
   - `businessTools.ts` pentru BUSINESS/EMPLOYEE
   - `adminTools.ts` pentru SUPERADMIN

2. Exportă funcția din fișierul respectiv

3. Adaugă tool-ul în `tools/index.ts` în obiectul `allTools`

4. Adaugă tool-ul în `permissions.ts` în `toolsByRole` pentru rolul corespunzător

5. Adaugă definiția tool-ului în `agent.ts` în funcția `buildToolDefinitions`

## 🔒 Securitate

- Toate tool-urile verifică permisiunile înainte de execuție
- Query-urile Prisma includ automat `where: { userId, businessId }` pentru izolare
- JWT este validat la fiecare cerere
- Superadmin are acces complet, dar toate acțiunile sunt loggate

## 📝 Configurare

Adaugă în `backend/.env`:
```
OPENAI_API_KEY="sk-your-api-key-here"
```

Fără API key, sistemul va funcționa cu răspunsuri de fallback.


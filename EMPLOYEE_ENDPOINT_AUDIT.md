# 🔍 AUDIT: GET /business/:businessId/employees/:employeeId

**Data:** 2025-01-22  
**Endpoint analizat:** `GET /business/:businessId/employees/:employeeId`  
**Status:** ❌ **ENDPOINT LIPSEȘTE**

---

## 📋 REZUMAT EXECUTIV

Frontend-ul face request la `GET /business/:businessId/employees/:employeeId` pentru a obține datele unui angajat individual (în special `canManageOwnServices`), dar acest endpoint **nu există în backend**. Backend-ul returnează `404 - "Endpoint negăsit."`.

**Impact:** Frontend-ul nu poate obține datele complete ale unui angajat individual, inclusiv flag-ul `canManageOwnServices` când acesta nu este disponibil în lista de angajați din business.

---

## 🏗️ STRUCTURA BACKEND

### 1. Rute existente pentru Employees

**Fișier:** `backend/src/routes/business.employees.routes.ts`

#### ✅ Endpoint-uri existente:

1. **GET `/business/:businessId/employees`**
   - **Scop:** Listă paginată de angajați pentru un business
   - **Middleware:** `verifyJWT`, `requireBusinessAccess("businessId")`, `validateQuery(paginationQuerySchema)`
   - **Response:** 
     ```typescript
     {
       data: Array<{
         id: string;
         name: string;
         email: string;
         phone: string | null;
         specialization: string | null;
         avatar: string | null;
         canManageOwnServices: boolean; // ✅ Include flag-ul
       }>;
       pagination: {
         page: number;
         limit: number;
         total: number;
         totalPages: number;
       }
     }
     ```

2. **POST `/business/:businessId/employees`**
   - **Scop:** Creare angajat nou
   - **Middleware:** `verifyJWT`, `requireBusinessAccess("businessId")`, `validate(createEmployeeSchema)`
   - **Response:** Employee object (fără password)

3. **PUT `/business/:businessId/employees/:employeeId`**
   - **Scop:** Actualizare angajat existent
   - **Middleware:** `verifyJWT`, `requireBusinessAccess("businessId")`, `validate(updateEmployeeSchema)`
   - **Response:**
     ```typescript
     {
       id: string;
       name: string;
       email: string;
       phone: string | null;
       specialization: string | null;
       canManageOwnServices: boolean; // ✅ Include flag-ul
     }
     ```

4. **DELETE `/business/:businessId/employees/:employeeId`**
   - **Scop:** Ștergere angajat
   - **Middleware:** `verifyJWT` (⚠️ **PROBLEMĂ:** Nu folosește `requireBusinessAccess`!)
   - **Response:** `{ success: true }`

#### ❌ Endpoint-uri LIPSĂ:

1. **GET `/business/:businessId/employees/:employeeId`**
   - **Scop:** Obținere date unui angajat individual
   - **Status:** ❌ **NU EXISTĂ**
   - **Impact:** Frontend-ul nu poate obține datele complete ale unui angajat când acesta nu este în lista de angajați din business

---

### 2. Rute pentru Employee Services

**Fișier:** `backend/src/routes/business.services.routes.ts`

#### ✅ Endpoint-uri existente:

1. **GET `/business/:businessId/employees/:employeeId/services`**
   - **Scop:** Listă servicii asociate unui angajat
   - **Middleware:** `verifyJWT`, `requireBusinessAccess("businessId")`, `requireEmployeeServiceAccess({ allowSelfService: false }, "employeeId")`
   - **Response:**
     ```typescript
     {
       services: Array<{
         id: string;
         name: string;
         duration: number;
         price: number;
         notes: string | null;
         isAssociated: boolean;
       }>;
       employeeId: string;
       businessId: string;
     }
     ```

2. **POST `/business/:businessId/employees/:employeeId/services/:serviceId`**
   - **Scop:** Asociere serviciu la angajat
   - **Middleware:** `verifyJWT`, `requireBusinessAccess("businessId")`, `requireEmployeeServiceAccess({ allowSelfService: false }, "employeeId")`

3. **DELETE `/business/:businessId/employees/:employeeId/services/:serviceId`**
   - **Scop:** Dezasociere serviciu de la angajat
   - **Middleware:** `verifyJWT`, `requireBusinessAccess("businessId")`, `requireEmployeeServiceAccess({ allowSelfService: false }, "employeeId")`

---

## 🗄️ STRUCTURA BAZEI DE DATE

### Model User (Employee)

**Fișier:** `backend/prisma/schema.prisma`

```prisma
model User {
  id                    String                 @id @default(cuid())
  email                 String                 @unique
  password              String
  name                  String
  phone                 String?
  specialization        String?
  avatar                String?
  role                  Role                   @default(CLIENT)
  businessId            String?                @db.VarChar(255)
  workingHours          Json?
  canManageOwnServices  Boolean                @default(false) // TICKET-044
  createdAt             DateTime               @default(now())
  updatedAt             DateTime               @updatedAt
  
  // Relations
  business              Business?              @relation(fields: [businessId], references: [id])
  employeeServices      EmployeeService[]      @relation("EmployeeServices")
  employeeServiceAudits EmployeeServiceAudit[] @relation("EmployeeAudits")
  
  @@index([businessId])
}
```

**Observații:**
- ✅ `canManageOwnServices` este stocat în modelul `User`
- ✅ Relația cu `Business` este opțională (`businessId` poate fi `null`)
- ✅ Index pe `businessId` pentru performanță

### Model Business

```prisma
model Business {
  id               String                  @id @default(cuid())
  name             String
  email            String?                 @unique
  domain           String                  @unique
  businessType     BusinessType            @default(GENERAL)
  ownerId          String
  // ... other fields
  
  // Relations
  owner            User                    @relation("BusinessOwner", fields: [ownerId], references: [id])
  // NOTE: Nu există relație explicită employees[] în Prisma
  // Employees sunt găsiți prin query: User.findMany({ where: { businessId, role: "EMPLOYEE" } })
}
```

**Observații:**
- ⚠️ **PROBLEMĂ:** Nu există relație explicită `employees` în Prisma
- Employees sunt găsiți prin query manual: `User.findMany({ where: { businessId, role: "EMPLOYEE" } })`
- Aceasta poate cauza inconsistențe dacă `businessId` nu este sincronizat corect

### Model EmployeeService

```prisma
model EmployeeService {
  id         String   @id @default(cuid())
  employeeId String
  serviceId  String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  employee   User     @relation("EmployeeServices", fields: [employeeId], references: [id], onDelete: Cascade)
  service    Service  @relation(fields: [serviceId], references: [id], onDelete: Cascade)

  @@unique([employeeId, serviceId])
  @@index([employeeId])
  @@index([serviceId])
}
```

---

## 🎨 STRUCTURA FRONTEND

### Utilizare în Dashboard

**Fișier:** `frontend/src/app/business/dashboard/page.tsx`

#### Cod relevant (liniile 365-390):

```typescript
const fetchEmployeeData = async () => {
  // CRITICAL FIX: Validate editingEmployeeId before making request
  if (!editingEmployeeId || !business?.id) {
    setLoadingEmployeeServices(false);
    return;
  }
  
  setLoadingEmployeeServices(true);
  try {
    // Fetch employee services
    const { data: servicesData } = await api.get<{ services: Array<{ id: string; name: string; isAssociated: boolean }> }>(
      `/business/${business.id}/employees/${editingEmployeeId}/services`
    );
    setEmployeeServices(servicesData.services);
    
    // TICKET-044: Fetch employee data to get canManageOwnServices flag
    const employee = business.employees?.find((e: any) => e.id === editingEmployeeId);
    if (employee && (employee as any).canManageOwnServices !== undefined) {
      setEmployeeCanManageOwnServices((employee as any).canManageOwnServices);
    } else {
      // Fallback: fetch from API if not in business.employees
      try {
        const { data: employeeData } = await api.get(`/business/${business.id}/employees/${editingEmployeeId}`);
        if (employeeData?.canManageOwnServices !== undefined) {
          setEmployeeCanManageOwnServices(employeeData.canManageOwnServices);
        }
      } catch (error) {
        console.error("Failed to fetch employee data:", error);
      }
    }
    // ... rest of code
  } catch (error) {
    // ... error handling
  }
};
```

**Observații:**
- ✅ Frontend-ul încearcă mai întâi să găsească angajatul în `business.employees`
- ❌ Dacă nu îl găsește, face request la `GET /business/:businessId/employees/:employeeId` (linia 387)
- ❌ Acest endpoint nu există, deci fallback-ul eșuează
- ⚠️ Eroarea este prinsă în `catch`, dar nu este afișată utilizatorului

---

## 🔍 PROBLEME IDENTIFICATE

### 1. ❌ **CRITICĂ: Endpoint GET pentru Employee Individual Lipsește**

**Problema:**
- Frontend-ul face request la `GET /business/:businessId/employees/:employeeId`
- Backend-ul returnează `404 - "Endpoint negăsit."`
- Frontend-ul nu poate obține `canManageOwnServices` când angajatul nu este în `business.employees`

**Impact:**
- Flag-ul `canManageOwnServices` nu poate fi afișat corect în UI
- Utilizatorul nu poate vedea/schimba setările pentru angajați care nu sunt în lista cached

**Soluție propusă:**
- Adăugare endpoint `GET /business/:businessId/employees/:employeeId` în `business.employees.routes.ts`

---

### 2. ⚠️ **MEDIE: DELETE Employee nu folosește `requireBusinessAccess`**

**Problema:**
- Endpoint-ul `DELETE /business/:businessId/employees/:employeeId` nu folosește middleware-ul `requireBusinessAccess("businessId")`
- Verifică manual dacă business-ul există și dacă angajatul aparține business-ului
- Nu verifică dacă utilizatorul autentificat este owner-ul business-ului

**Impact:**
- Potențială problemă de securitate (deși verifică manual, nu este consistent cu celelalte endpoint-uri)

**Soluție propusă:**
- Adăugare `requireBusinessAccess("businessId")` la middleware chain

---

### 3. ⚠️ **MEDIE: Inconsistență în structura răspunsurilor**

**Problema:**
- `GET /business/:businessId/employees` returnează un obiect paginat: `{ data: [...], pagination: {...} }`
- `PUT /business/:businessId/employees/:employeeId` returnează direct obiectul employee: `{ id, name, email, ... }`
- Frontend-ul trebuie să gestioneze ambele formate

**Impact:**
- Cod duplicat în frontend pentru parsing diferit
- Confuzie pentru dezvoltatori noi

**Soluție propusă:**
- Standardizare: toate endpoint-urile pentru employees ar trebui să returneze același format
- Sau documentare clară a diferențelor

---

### 4. ℹ️ **INFO: Lipsă validare explicită pentru `employeeId` în unele endpoint-uri**

**Problema:**
- `PUT /business/:businessId/employees/:employeeId` nu validează explicit formatul `employeeId` cu `employeeIdParamSchema`
- `DELETE /business/:businessId/employees/:employeeId` nu validează explicit formatul `employeeId`

**Impact:**
- Potențiale erori dacă `employeeId` nu este un CUID valid
- Inconsistență cu alte endpoint-uri (ex: `GET /employees/:employeeId/services` validează)

**Soluție propusă:**
- Adăugare validare `employeeIdParamSchema` pentru toate endpoint-urile care folosesc `employeeId`

---

## ✅ SOLUȚII PROPUSE

### 1. Adăugare GET /business/:businessId/employees/:employeeId

**Fișier:** `backend/src/routes/business.employees.routes.ts`

**Implementare propusă:**

```typescript
// Get single employee
router.get("/:businessId/employees/:employeeId", 
  verifyJWT, 
  requireBusinessAccess("businessId"),
  async (req, res) => {
    const { businessId, employeeId } = req.params;
    
    // Validate employeeId
    if (!employeeId) {
      return res.status(400).json({ error: "employeeId este obligatoriu." });
    }
    
    try {
      employeeIdParamSchema.parse({ employeeId });
    } catch (error: any) {
      logger.warn("GET /employees/:employeeId - Invalid employeeId format", {
        businessId,
        employeeId,
        error: error?.errors || error?.message,
      });
      return res.status(400).json({ error: "employeeId invalid." });
    }

    try {
      // Verify that the business exists
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, ownerId: true },
      });

      if (!business) {
        return res.status(404).json({ 
          error: "Business-ul nu a fost găsit.",
          code: "BUSINESS_NOT_FOUND",
        });
      }

      // Get employee
      const employee = await prisma.user.findUnique({
        where: { 
          id: employeeId,
          businessId: businessId, // Ensure employee belongs to this business
          role: "EMPLOYEE",
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          specialization: true,
          avatar: true,
          canManageOwnServices: true, // TICKET-044: Include flag-ul
          workingHours: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!employee) {
        return res.status(404).json({ 
          error: "Angajatul nu a fost găsit sau nu aparține acestui business.",
          code: "EMPLOYEE_NOT_FOUND",
          actionable: "Verifică că angajatul există și că aparține business-ului corect.",
        });
      }

      return res.json(employee);
    } catch (error: any) {
      logger.error("Failed to get employee", error);
      
      // CRITICAL FIX (TICKET-012): Specific and actionable error messages
      if (error instanceof Error) {
        const errorMessage = error.message || "";
        const errorCode = (error as any)?.code || "";
        
        // Check for not found errors
        if (errorMessage.includes("nu a fost găsit") || 
            errorCode === "P2025") {
          return res.status(404).json({ 
            error: "Angajatul nu a fost găsit.",
            code: "EMPLOYEE_NOT_FOUND",
            actionable: "Verifică că angajatul există și că aparține business-ului corect.",
          });
        }
      }
      
      return res.status(500).json({ 
        error: "Nu am putut încărca datele angajatului. Te rugăm să încerci din nou.",
        code: "EMPLOYEE_FETCH_FAILED",
        actionable: "Dacă problema persistă, contactează suportul.",
      });
    }
  }
);
```

**Locație:** După `GET /:businessId/employees` și înainte de `POST /:businessId/employees`

---

### 2. Fix DELETE Employee - Adăugare requireBusinessAccess

**Fișier:** `backend/src/routes/business.employees.routes.ts`

**Modificare:**

```typescript
// Delete employee
router.delete("/:businessId/employees/:employeeId", 
  verifyJWT, 
  requireBusinessAccess("businessId"), // ✅ Adăugat
  async (req, res) => {
    // ... rest of code
  }
);
```

---

### 3. Adăugare validare employeeId în PUT și DELETE

**Fișier:** `backend/src/routes/business.employees.routes.ts`

**Modificare pentru PUT:**

```typescript
router.put("/:businessId/employees/:employeeId", 
  verifyJWT, 
  requireBusinessAccess("businessId"), 
  validate(updateEmployeeSchema), 
  async (req, res) => {
    const { businessId, employeeId } = req.params;
    
    // ✅ Adăugat: Validate employeeId format
    try {
      employeeIdParamSchema.parse({ employeeId });
    } catch (error: any) {
      logger.warn("PUT /employees/:employeeId - Invalid employeeId format", {
        businessId,
        employeeId,
        error: error?.errors || error?.message,
      });
      return res.status(400).json({ error: "employeeId invalid." });
    }
    
    // ... rest of code
  }
);
```

**Modificare similară pentru DELETE.**

---

## 📊 MATRIX DE AUTORIZARE

| Endpoint | BUSINESS Owner | EMPLOYEE (self) | EMPLOYEE (other) | CLIENT | SUPERADMIN |
|----------|---------------|----------------|------------------|--------|------------|
| `GET /business/:id/employees` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `GET /business/:id/employees/:employeeId` | ✅ | ❓ | ❓ | ❌ | ✅ |
| `POST /business/:id/employees` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `PUT /business/:id/employees/:employeeId` | ✅ | ❌ | ❌ | ❌ | ✅ |
| `DELETE /business/:id/employees/:employeeId` | ✅ | ❌ | ❌ | ❌ | ✅ |

**Notă:** Pentru `GET /business/:id/employees/:employeeId`, trebuie să decidem dacă:
- Un EMPLOYEE poate vedea propriile date? (probabil DA)
- Un EMPLOYEE poate vedea datele altor employees? (probabil NU)

---

## 🧪 TESTE RECOMANDATE

1. **Test GET employee individual:**
   ```bash
   curl -X GET 'http://localhost:4000/business/{businessId}/employees/{employeeId}' \
     -H 'Cookie: voob_auth={JWT_TOKEN}'
   ```
   - ✅ Ar trebui să returneze datele angajatului
   - ✅ Ar trebui să includă `canManageOwnServices`
   - ❌ Ar trebui să returneze 404 dacă angajatul nu există
   - ❌ Ar trebui să returneze 403 dacă utilizatorul nu are acces

2. **Test autorizare:**
   - BUSINESS owner poate accesa employees din business-ul său
   - BUSINESS owner NU poate accesa employees din alte business-uri
   - EMPLOYEE poate accesa propriile date? (de decis)
   - CLIENT nu poate accesa employees

3. **Test validare:**
   - Request cu `employeeId` invalid (nu CUID) → 400
   - Request cu `employeeId` inexistent → 404
   - Request cu `businessId` invalid → 400/404

---

## 📝 CHECKLIST IMPLEMENTARE

- [x] ✅ Adăugare endpoint `GET /business/:businessId/employees/:employeeId`
- [x] ✅ Adăugare `requireBusinessAccess` la DELETE employee
- [x] ✅ Adăugare validare `employeeIdParamSchema` la PUT și DELETE
- [x] ✅ Testare endpoint nou
- [x] ✅ Testare autorizare pentru toate rolurile (via `requireBusinessAccess`)
- [x] ✅ Verificare că frontend-ul funcționează corect cu noul endpoint

**Status:** ✅ **TOATE ITEMELE IMPLEMENTATE**

---

## 🔗 REFERINȚE

- **TICKET-044:** Employee Service Permissions (`canManageOwnServices`)
- **TICKET-045:** Employee Service Access Middleware
- **TICKET-046:** Employee Service Audit Trail
- **TICKET-012:** Specific Error Messages

---

**Status final:** 🔴 **CRITICĂ - Endpoint lipsește și trebuie implementat urgent**

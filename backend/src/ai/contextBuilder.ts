const prisma = require("../lib/prisma");

// Define AuthUser locally (matches middleware/auth.ts)
interface AuthUser {
  userId: string;
  role: any;
  businessId?: string;
}

interface AIContext {
  userId: string;
  role: any;
  businessId?: string;
}

/**
 * Construiește contextul pentru AI din informațiile utilizatorului
 */
async function buildAIContext(user: AuthUser): Promise<any> {
  const context: any = {
    userId: user.userId,
    role: user.role,
    ...(user.businessId && { businessId: user.businessId }),
  };

  // Încarcă informații despre user
  const userData = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (userData) {
    context.userName = userData.name;
    context.userEmail = userData.email;
    context.userPhone = userData.phone;
  }

  // Dacă utilizatorul este CLIENT, încarcă business-urile conectate
  if (user.role === "CLIENT") {
    const links = await prisma.clientBusinessLink.findMany({
      where: { clientId: user.userId },
      include: {
        business: {
          select: {
            id: true,
            name: true,
            domain: true,
            services: {
              select: {
                id: true,
                name: true,
                duration: true,
                price: true,
              },
            },
            employees: {
              select: {
                id: true,
                name: true,
                specialization: true,
              },
            },
          },
        },
      },
    });

    context.linkedBusinesses = links.map((link: any) => link.business);
  }

  // Dacă nu avem businessId dar utilizatorul este BUSINESS sau EMPLOYEE, îl căutăm
  if (!context.businessId && (user.role === "BUSINESS" || user.role === "EMPLOYEE")) {
    const business = await prisma.business.findFirst({
      where: {
        OR: [{ ownerId: user.userId }, { employees: { some: { id: user.userId } } }],
      },
      select: {
        id: true,
        name: true,
        services: {
          select: {
            id: true,
            name: true,
            duration: true,
            price: true,
          },
        },
        employees: {
          select: {
            id: true,
            name: true,
            specialization: true,
          },
        },
      },
    });
    if (business) {
      context.businessId = business.id;
      context.businessName = business.name;
      context.businessServices = business.services;
      context.businessEmployees = business.employees;
      
      // Obține timezone separat pentru a evita eroarea Prisma
      try {
        const businessWithTimezone = await prisma.business.findUnique({
          where: { id: business.id },
          select: { timezone: true },
        });
        context.businessTimezone = businessWithTimezone?.timezone || "Europe/Bucharest";
      } catch (error) {
        // Dacă timezone nu există în baza de date, folosește default
        context.businessTimezone = "Europe/Bucharest";
      }
    }
  }

  return context;
}

/**
 * Construiește mesajul de sistem pentru LLM
 */
function buildSystemMessage(context: AIContext, availableTools: string[]): string {
  return `Ești LARSTEF AI Assistant. Utilizatorul are rolul ${context.role}.
Are ID-ul ${context.userId}${context.businessId ? ` și businessId ${context.businessId}` : ""}.
Poți executa doar acțiunile permise pentru acest rol: ${availableTools.join(", ")}.

Răspunde în română, fii prietenos și concis.`;
}

module.exports = { buildAIContext, buildSystemMessage };


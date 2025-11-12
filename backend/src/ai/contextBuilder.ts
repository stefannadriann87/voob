const prisma = require("../lib/prisma").default;

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
async function buildAIContext(user: AuthUser): Promise<AIContext> {
  const context: AIContext = {
    userId: user.userId,
    role: user.role,
    ...(user.businessId && { businessId: user.businessId }),
  };

  // Dacă nu avem businessId dar utilizatorul este BUSINESS sau EMPLOYEE, îl căutăm
  if (!context.businessId && (user.role === "BUSINESS" || user.role === "EMPLOYEE")) {
    const business = await prisma.business.findFirst({
      where: {
        OR: [{ ownerId: user.userId }, { employees: { some: { id: user.userId } } }],
      },
    });
    context.businessId = business?.id;
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


const clientTools = require("./clientTools");
const businessTools = require("./businessTools");
const adminTools = require("./adminTools");

// Type pentru AIContext
interface AIContext {
  userId: string;
  role: any;
  businessId?: string;
}

// Agregă toate tool-urile într-un obiect
// Notă: viewBookings este mapat diferit în funcție de rol
const allTools = {
  // Client tools
  cancelOwnBooking: clientTools.cancelOwnBooking,
  viewClientBookings: clientTools.viewClientBookings,
  
  // Business tools
  viewBusinessBookings: businessTools.viewBusinessBookings,
  createBooking: businessTools.createBooking,
  cancelBooking: businessTools.cancelBooking,
  generateReport: businessTools.generateReport,
  
  // Admin tools
  viewAllBusinesses: adminTools.viewAllBusinesses,
  viewTransactions: adminTools.viewTransactions,
  generateGlobalReport: adminTools.generateGlobalReport,
  
  // Alias pentru viewBookings - va fi mapat corect în funcție de rol
  viewBookings: async (context: AIContext, args?: any) => {
    if (context.role === "CLIENT") {
      return await clientTools.viewClientBookings(context, args);
    } else {
      return await businessTools.viewBusinessBookings(context, args);
    }
  },
};

// Execută un tool bazat pe nume
async function executeTool(
  toolName: string,
  args: any,
  context: AIContext
): Promise<any> {
  const tool = (allTools as any)[toolName];

  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  return await tool(context, args);
}

module.exports = { allTools, executeTool };


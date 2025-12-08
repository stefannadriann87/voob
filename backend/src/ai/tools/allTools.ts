/**
 * Agregă toate tools-urile pentru AI Agent
 * Organizate pe roluri pentru RBAC
 */

const { bookingTools, bookingToolExecutors } = require("./bookingTools");
const clientTools = require("./clientTools");
const businessTools = require("./businessTools");
const employeeTools = require("./employeeTools");
const adminTools = require("./adminTools");

// Tools pentru CLIENT
const clientToolDefinitions = [
  {
    type: "function",
    function: {
      name: "viewClientBookings",
      description: "Vizualizează rezervările clientului. Poți filtra după dată și status.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Data de început (ISO format, opțional)" },
          endDate: { type: "string", description: "Data de sfârșit (ISO format, opțional)" },
          status: { type: "string", description: "Statusul rezervărilor (opțional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancelOwnBooking",
      description: "Anulează o rezervare proprie. Doar rezervările clientului pot fi anulate.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID-ul rezervării de anulat" },
        },
        required: ["bookingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateOwnBooking",
      description: "Actualizează o rezervare proprie (dată, serviciu, angajat).",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID-ul rezervării" },
          date: { type: "string", description: "Noua dată (ISO format, opțional)" },
          serviceId: { type: "string", description: "ID-ul noului serviciu (opțional)" },
          employeeId: { type: "string", description: "ID-ul noului angajat (opțional)" },
        },
        required: ["bookingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBusinessInfo",
      description: "Obține informații despre un business (servicii, angajați, program de lucru).",
      parameters: {
        type: "object",
        properties: {
          businessId: { type: "string", description: "ID-ul business-ului (opțional dacă dai businessName)" },
          businessName: { type: "string", description: "Numele business-ului (opțional dacă dai businessId)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAvailableSlots",
      description: "Obține sloturi disponibile pentru un business și serviciu într-o anumită zi.",
      parameters: {
        type: "object",
        properties: {
          businessId: { type: "string", description: "ID-ul business-ului (opțional dacă dai businessName)" },
          businessName: { type: "string", description: "Numele business-ului (opțional)" },
          serviceId: { type: "string", description: "ID-ul serviciului (opțional dacă dai serviceName)" },
          serviceName: { type: "string", description: "Numele serviciului (opțional)" },
          date: { type: "string", description: "Data pentru care să verifici disponibilitatea (ISO format)" },
          employeeId: { type: "string", description: "ID-ul angajatului (opțional)" },
        },
        required: ["date"],
      },
    },
  },
  // Include createBooking din bookingTools pentru CLIENT
  bookingTools.find((t: any) => t.function.name === "createBooking"),
].filter(Boolean);

// Tools pentru BUSINESS
const businessToolDefinitions = [
  ...bookingTools, // Toate tools-urile de booking
  {
    type: "function",
    function: {
      name: "listEmployees",
      description: "Listează toți employee-ii business-ului.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createEmployee",
      description: "Creează un employee nou pentru business.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Numele employee-ului" },
          email: { type: "string", description: "Email-ul employee-ului" },
          phone: { type: "string", description: "Telefonul employee-ului (opțional)" },
          specialization: { type: "string", description: "Specializarea employee-ului (opțional)" },
        },
        required: ["name", "email"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateEmployee",
      description: "Actualizează un employee existent.",
      parameters: {
        type: "object",
        properties: {
          employeeId: { type: "string", description: "ID-ul employee-ului" },
          name: { type: "string", description: "Numele (opțional)" },
          email: { type: "string", description: "Email-ul (opțional)" },
          phone: { type: "string", description: "Telefonul (opțional)" },
          specialization: { type: "string", description: "Specializarea (opțional)" },
        },
        required: ["employeeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteEmployee",
      description: "Șterge un employee din business.",
      parameters: {
        type: "object",
        properties: {
          employeeId: { type: "string", description: "ID-ul employee-ului de șters" },
        },
        required: ["employeeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listServices",
      description: "Listează toate serviciile business-ului.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createService",
      description: "Creează un serviciu nou pentru business.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Numele serviciului" },
          duration: { type: "number", description: "Durata în minute" },
          price: { type: "number", description: "Prețul serviciului" },
          notes: { type: "string", description: "Note despre serviciu (opțional)" },
        },
        required: ["name", "duration", "price"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateService",
      description: "Actualizează un serviciu existent.",
      parameters: {
        type: "object",
        properties: {
          serviceId: { type: "string", description: "ID-ul serviciului" },
          name: { type: "string", description: "Numele (opțional)" },
          duration: { type: "number", description: "Durata în minute (opțional)" },
          price: { type: "number", description: "Prețul (opțional)" },
          notes: { type: "string", description: "Note (opțional)" },
        },
        required: ["serviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "deleteService",
      description: "Șterge un serviciu din business.",
      parameters: {
        type: "object",
        properties: {
          serviceId: { type: "string", description: "ID-ul serviciului de șters" },
        },
        required: ["serviceId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateWorkingHours",
      description: "Actualizează programul de lucru pentru o zi specifică.",
      parameters: {
        type: "object",
        properties: {
          day: { type: "string", description: "Ziua săptămânii (ex: 'monday', 'tuesday')" },
          hours: {
            type: "array",
            items: {
              type: "object",
              properties: {
                start: { type: "string", description: "Ora de început (ex: '09:00')" },
                end: { type: "string", description: "Ora de sfârșit (ex: '18:00')" },
              },
            },
            description: "Lista de intervale orare",
          },
          enabled: { type: "boolean", description: "Dacă ziua este activă (opțional)" },
        },
        required: ["day", "hours"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "addHoliday",
      description: "Adaugă o sărbătoare/perioadă de închidere pentru business.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Data de început (ISO format)" },
          endDate: { type: "string", description: "Data de sfârșit (ISO format)" },
          description: { type: "string", description: "Descrierea sărbătorii (opțional)" },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateAdvancedStats",
      description: "Generează statistici avansate pentru business (top servicii, clienți, employee-i).",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Data de început (ISO format)" },
          endDate: { type: "string", description: "Data de sfârșit (ISO format)" },
        },
        required: ["startDate", "endDate"],
      },
    },
  },
];

// Tools pentru EMPLOYEE
const employeeToolDefinitions = [
  {
    type: "function",
    function: {
      name: "viewEmployeeBookings",
      description: "Vizualizează rezervările employee-ului. Poți filtra după dată și status.",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Data de început (ISO format, opțional)" },
          endDate: { type: "string", description: "Data de sfârșit (ISO format, opțional)" },
          status: { type: "string", description: "Statusul rezervărilor (opțional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createBookingForClient",
      description: "Creează o rezervare pentru un client (employee-ul este automat asignat).",
      parameters: {
        type: "object",
        properties: {
          clientId: { type: "string", description: "ID-ul clientului" },
          serviceId: { type: "string", description: "ID-ul serviciului" },
          date: { type: "string", description: "Data și ora rezervării (ISO format)" },
          paid: { type: "boolean", description: "Dacă este plătită (default: false)" },
        },
        required: ["clientId", "serviceId", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancelEmployeeBooking",
      description: "Anulează o rezervare a employee-ului.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID-ul rezervării de anulat" },
        },
        required: ["bookingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateEmployeeBooking",
      description: "Actualizează o rezervare a employee-ului.",
      parameters: {
        type: "object",
        properties: {
          bookingId: { type: "string", description: "ID-ul rezervării" },
          date: { type: "string", description: "Noua dată (ISO format, opțional)" },
          serviceId: { type: "string", description: "ID-ul noului serviciu (opțional)" },
          paid: { type: "boolean", description: "Statusul plății (opțional)" },
        },
        required: ["bookingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getEmployeeAvailability",
      description: "Verifică disponibilitatea employee-ului pentru o anumită zi.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Data pentru care să verifici disponibilitatea (ISO format, opțional, default: astăzi)" },
        },
      },
    },
  },
];

// Tools pentru SUPERADMIN
const superadminToolDefinitions = [
  ...bookingTools, // Toate tools-urile de booking
  {
    type: "function",
    function: {
      name: "viewAllBusinesses",
      description: "Vizualizează toate business-urile din platformă.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "viewTransactions",
      description: "Vizualizează toate tranzacțiile din platformă pentru o perioadă.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "object",
            properties: {
              start: { type: "string", description: "Data de început (ISO format)" },
              end: { type: "string", description: "Data de sfârșit (ISO format)" },
            },
            required: ["start", "end"],
          },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generateGlobalReport",
      description: "Generează raport global pentru întreaga platformă.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "object",
            properties: {
              start: { type: "string", description: "Data de început (ISO format)" },
              end: { type: "string", description: "Data de sfârșit (ISO format)" },
            },
            required: ["start", "end"],
          },
        },
        required: ["period"],
      },
    },
  },
];

// Mapare tools pe roluri
const toolsByRole = {
  CLIENT: clientToolDefinitions,
  BUSINESS: businessToolDefinitions,
  EMPLOYEE: employeeToolDefinitions,
  SUPERADMIN: superadminToolDefinitions,
};

// Agregă toți executorii
const allToolExecutors = {
  // Booking tools
  ...bookingToolExecutors,
  // Client tools
  viewClientBookings: clientTools.viewClientBookings,
  cancelOwnBooking: clientTools.cancelOwnBooking,
  updateOwnBooking: clientTools.updateOwnBooking,
  getBusinessInfo: clientTools.getBusinessInfo,
  getAvailableSlots: clientTools.getAvailableSlots,
  // Business tools
  listEmployees: businessTools.listEmployees,
  createEmployee: businessTools.createEmployee,
  updateEmployee: businessTools.updateEmployee,
  deleteEmployee: businessTools.deleteEmployee,
  listServices: businessTools.listServices,
  createService: businessTools.createService,
  updateService: businessTools.updateService,
  deleteService: businessTools.deleteService,
  updateWorkingHours: businessTools.updateWorkingHours,
  addHoliday: businessTools.addHoliday,
  generateAdvancedStats: businessTools.generateAdvancedStats,
  // Employee tools
  viewEmployeeBookings: employeeTools.viewEmployeeBookings,
  createBookingForClient: employeeTools.createBookingForClient,
  cancelEmployeeBooking: employeeTools.cancelEmployeeBooking,
  updateEmployeeBooking: employeeTools.updateEmployeeBooking,
  getEmployeeAvailability: employeeTools.getEmployeeAvailability,
  // Admin tools
  viewAllBusinesses: adminTools.viewAllBusinesses,
  viewTransactions: adminTools.viewTransactions,
  generateGlobalReport: adminTools.generateGlobalReport,
};

module.exports = {
  toolsByRole,
  allToolExecutors,
  clientToolDefinitions,
  businessToolDefinitions,
  employeeToolDefinitions,
  superadminToolDefinitions,
};


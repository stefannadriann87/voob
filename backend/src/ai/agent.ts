const OpenAI = require("openai");
const { buildSystemMessage } = require("./contextBuilder");
const { toolsByRole, isToolAllowed } = require("./permissions");
const { executeTool } = require("./tools");

// Type pentru AIContext
interface AIContext {
  userId: string;
  role: any;
  businessId?: string;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Inițializează OpenAI client (dacă API key este disponibil)
const openai = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
    })
  : null;

/**
 * Construiește definițiile de tools pentru OpenAI
 */
function buildToolDefinitions(availableTools: string[]): any[] {
  const tools: any[] = [];

  if (availableTools.includes("viewBookings")) {
    tools.push({
      type: "function",
      function: {
        name: "viewBookings",
        description: "Vizualizează rezervările. Pentru clienți: rezervările proprii. Pentru business: rezervările business-ului.",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    });
  }

  if (availableTools.includes("cancelOwnBooking")) {
    tools.push({
      type: "function",
      function: {
        name: "cancelOwnBooking",
        description: "Anulează o rezervare proprie (doar pentru clienți)",
        parameters: {
          type: "object",
          properties: {
            bookingId: {
              type: "string",
              description: "ID-ul rezervării de anulat",
            },
          },
          required: ["bookingId"],
        },
      },
    });
  }

  if (availableTools.includes("createBooking")) {
    tools.push({
      type: "function",
      function: {
        name: "createBooking",
        description: "Creează o nouă rezervare (doar pentru business/employee)",
        parameters: {
          type: "object",
          properties: {
            clientId: { type: "string", description: "ID-ul clientului" },
            serviceId: { type: "string", description: "ID-ul serviciului" },
            employeeId: { type: "string", description: "ID-ul angajatului (opțional)" },
            date: { type: "string", description: "Data și ora rezervării (ISO format)" },
            paid: { type: "boolean", description: "Dacă este plătită" },
          },
          required: ["clientId", "serviceId", "date"],
        },
      },
    });
  }

  if (availableTools.includes("cancelBooking")) {
    tools.push({
      type: "function",
      function: {
        name: "cancelBooking",
        description: "Anulează o rezervare (doar pentru business/employee)",
        parameters: {
          type: "object",
          properties: {
            bookingId: { type: "string", description: "ID-ul rezervării de anulat" },
          },
          required: ["bookingId"],
        },
      },
    });
  }

  if (availableTools.includes("generateReport")) {
    tools.push({
      type: "function",
      function: {
        name: "generateReport",
        description: "Generează un raport de activitate pentru business",
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
    });
  }

  if (availableTools.includes("viewAllBusinesses")) {
    tools.push({
      type: "function",
      function: {
        name: "viewAllBusinesses",
        description: "Vizualizează toate business-urile (doar pentru superadmin)",
        parameters: {
          type: "object",
          properties: {},
        },
      },
    });
  }

  if (availableTools.includes("viewTransactions")) {
    tools.push({
      type: "function",
      function: {
        name: "viewTransactions",
        description: "Vizualizează tranzacțiile (doar pentru superadmin)",
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
    });
  }

  if (availableTools.includes("generateGlobalReport")) {
    tools.push({
      type: "function",
      function: {
        name: "generateGlobalReport",
        description: "Generează un raport global (doar pentru superadmin)",
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
    });
  }

  return tools;
}

/**
 * Gestionează o cerere AI
 */
async function handleAIRequest(
  context: AIContext,
  userMessage: string,
  conversationHistory: any[] = []
): Promise<string> {
  const availableTools = toolsByRole[context.role];
  const systemMessage = buildSystemMessage(context, availableTools);
  const tools = buildToolDefinitions(availableTools);

  // Construiește mesajele pentru OpenAI
  const messages: any[] = [
    { role: "system", content: systemMessage },
    ...conversationHistory.map((msg: any) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    })),
    { role: "user", content: userMessage },
  ];

  if (!openai || tools.length === 0) {
    // Fallback dacă OpenAI nu este configurat
    return `Înțeleg că vrei: "${userMessage}". Pentru funcționalitate completă, configurează OPENAI_API_KEY în variabilele de mediu.`;
  }

  try {
    // Apelează OpenAI cu function calling
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
    });

    const assistantMessage = completion.choices[0]?.message;

    if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
      // Execută tool calls
      const toolCalls = assistantMessage.tool_calls;
      const toolResults: any[] = [];

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs: any = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch (e) {
          console.error("Failed to parse tool arguments:", e);
        }

        // Verifică permisiunile
        if (!isToolAllowed(context.role, toolName)) {
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: JSON.stringify({ error: "Action not allowed for this role" }),
          });
          continue;
        }

        try {
          console.log(`🔧 Executing tool: ${toolName}`, toolArgs);
          const result = await executeTool(toolName, toolArgs, context);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: JSON.stringify(result),
          });
          console.log(`✅ Tool ${toolName} executed successfully`);
        } catch (error: any) {
          console.error(`❌ Tool ${toolName} failed:`, error);
          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: JSON.stringify({ error: error.message || "Eroare la executarea tool-ului" }),
          });
        }
      }

      // Trimite rezultatele înapoi la OpenAI pentru răspuns final
      const finalMessages: any[] = [
        ...messages,
        { role: "assistant", content: assistantMessage.content || null, tool_calls: toolCalls },
        ...toolResults,
      ];

      const finalCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: finalMessages,
      });

      return finalCompletion.choices[0]?.message?.content || "Nu am putut genera un răspuns.";
    } else {
      return assistantMessage?.content || "Nu am putut genera un răspuns.";
    }
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    // Fallback la răspuns simplu dacă OpenAI eșuează
    return `Înțeleg că vrei: "${userMessage}". ${error.message || "Eroare la comunicarea cu AI-ul."}`;
  }
}

module.exports = { handleAIRequest };


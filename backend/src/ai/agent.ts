/**
 * AI Agent - Wrapper OpenAI cu function calling
 */

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const { toolsByRole, allToolExecutors } = require("./tools/allTools");
const { recordAiUsage } = require("../services/usageService");
const { logSystemAction } = require("../services/auditService");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_COST_PER_1K_TOKENS = Number(process.env.OPENAI_COST_PER_1K_TOKENS || "0.015");

if (!OPENAI_API_KEY) {
  console.warn("⚠️  OPENAI_API_KEY nu este setat. AI Agent nu va funcționa complet.");
}

const client = OPENAI_API_KEY
  ? new OpenAI({
      apiKey: OPENAI_API_KEY,
    })
  : null;

/**
 * Încarcă system prompt-ul
 */
function loadSystemPrompt(): string {
  try {
    const promptPath = path.join(__dirname, "prompts", "systemPrompt.txt");
    return fs.readFileSync(promptPath, "utf-8");
  } catch (error) {
    console.warn("Nu s-a putut încărca system prompt, folosind default.");
    return "Ești AI-ul platformei LARSTEF CRM. Răspunde în română, fii concis și util.";
  }
}

/**
 * Determină ce tools sunt disponibile pentru un rol
 */
function getAvailableToolsForRole(role: string): any[] {
  return toolsByRole[role] || [];
}

/**
 * Execută un tool bazat pe nume
 */
async function executeTool(
  toolName: string,
  args: any,
  context: any
): Promise<any> {
  const executor = allToolExecutors[toolName];

  if (!executor) {
    throw new Error(`Tool necunoscut: ${toolName}`);
  }

  return await executor(args, context);
}

/**
 * Rulează AI Agent-ul
 */
async function runAIAgent({
  message,
  context,
  conversationHistory = [],
}: {
  message: string;
  context: any;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ reply: string; toolCalls?: any[] }> {
  if (!client) {
    return {
      reply: "AI Agent nu este configurat. Verifică OPENAI_API_KEY în variabilele de mediu.",
    };
  }

  const systemPrompt = loadSystemPrompt();
  
  // Obține data curentă și formatează-o
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  // Formatează datele în română
  const formatDateRomanian = (date: Date) => {
    const days = ["duminică", "luni", "marți", "miercuri", "joi", "vineri", "sâmbătă"];
    const months = ["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };
  
  // Formatează datele ISO folosind timezone-ul local (nu UTC)
  const formatDateISO = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  
  const currentDateISO = formatDateISO(now);
  const currentDateRomanian = formatDateRomanian(now);
  const yesterdayRomanian = formatDateRomanian(yesterday);
  const tomorrowRomanian = formatDateRomanian(tomorrow);
  const yesterdayISO = formatDateISO(yesterday);
  const todayISO = formatDateISO(today);
  const tomorrowISO = formatDateISO(tomorrow);
  
  // Construiește un system prompt extins cu informații despre user și business-uri
  let enhancedSystemPrompt = systemPrompt;
  
  // Adaugă informații despre data curentă
  enhancedSystemPrompt += `\n\n## DATA CURENTĂ:
Astăzi este: ${currentDateRomanian} (${currentDateISO}).
Ieri a fost: ${yesterdayRomanian} (${yesterdayISO}).
Mâine va fi: ${tomorrowRomanian} (${tomorrowISO}).

IMPORTANT: Când utilizatorul spune "ieri", înseamnă ${yesterdayRomanian} (${yesterdayISO}).
Când spune "astăzi", înseamnă ${currentDateRomanian} (${currentDateISO}).
Când spune "mâine", înseamnă ${tomorrowRomanian} (${tomorrowISO}).
Folosește aceste date EXACTE când cauți rezervări sau creezi rezervări noi.`;
  
  if (context.userName) {
    enhancedSystemPrompt += `\n\nUtilizatorul se numește ${context.userName} (ID: ${context.userId}).`;
  }
  if (context.role === "CLIENT" && context.linkedBusinesses && context.linkedBusinesses.length > 0) {
    enhancedSystemPrompt += `\n\nBusiness-uri conectate: ${context.linkedBusinesses.map((b: any) => `"${b.name}" (ID: ${b.id})`).join(", ")}.`;
    enhancedSystemPrompt += `\nPentru a crea o rezervare, poți folosi numele business-ului în loc de ID.`;
  }
  
  // Adaugă timezone-ul business-ului dacă există
  if (context.businessId && context.businessTimezone) {
    enhancedSystemPrompt += `\n\nBusiness-ul folosește timezone-ul: ${context.businessTimezone}.`;
  }
  
  const tools = getAvailableToolsForRole(context.role);

  try {
    // Construiește mesajele cu conversation history
    const messages: any[] = [
      { role: "system", content: enhancedSystemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    // Prima apelare - OpenAI decide dacă să apeleze tools
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
    });

    const assistantMessage = response.choices[0]?.message;
    let totalTokens = response.usage?.total_tokens ?? 0;

    // Dacă nu sunt tool calls, returnează răspunsul direct
    if (!assistantMessage?.tool_calls || assistantMessage.tool_calls.length === 0) {
      return {
        reply: assistantMessage?.content || "Nu am putut genera un răspuns.",
      };
    }

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
        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolName,
          content: JSON.stringify({ error: "Argumente invalide" }),
        });
        continue;
      }

      try {
        console.log(`🔧 Executing tool: ${toolName}`, toolArgs);
        const result = await executeTool(toolName, toolArgs, context);
        
        // Audit logging pentru acțiuni AI
        logSystemAction({
          actorId: context.userId,
          actorRole: context.role,
          action: `ai_${toolName}`,
          entity: "ai_action",
          entityId: null,
          before: null,
          after: { toolName, args: toolArgs, result },
        }).catch((error: unknown) => {
          console.error("Failed to log AI action:", error);
        });
        
        toolResults.push({
          tool_call_id: toolCall.id,
          role: "tool",
          name: toolName,
          content: JSON.stringify({ success: true, result }),
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
      { role: "system", content: enhancedSystemPrompt },
      ...conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: message },
      {
        role: "assistant",
        content: assistantMessage.content || null,
        tool_calls: toolCalls,
      },
      ...toolResults,
    ];

    const finalCompletion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: finalMessages,
    });
    totalTokens += finalCompletion.usage?.total_tokens ?? 0;

    const costEstimate = Number(((totalTokens / 1000) * OPENAI_COST_PER_1K_TOKENS).toFixed(6));

    recordAiUsage({
      businessId: context.businessId ?? null,
      userId: context.userId ?? null,
      userRole: context.role,
      toolName: toolCalls.length > 0 ? toolCalls.map((tc: any) => tc.function.name).join(",") : "chat_only",
      tokensUsed: totalTokens || undefined,
      costEstimate: costEstimate || undefined,
      statusCode: 200,
      metadata: {
        toolCalls: toolCalls.length,
      },
    }).catch((error: unknown) => {
      console.error("Failed to record AI usage:", error);
    });

    return {
      reply: finalCompletion.choices[0]?.message?.content || "Nu am putut genera un răspuns.",
      toolCalls: toolCalls.map((tc: any) => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || "{}"),
      })),
    };
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    recordAiUsage({
      businessId: context.businessId ?? null,
      userId: context.userId ?? null,
      userRole: context.role,
      toolName: "chat_completion",
      statusCode: error?.status ?? 500,
      metadata: {
        error: error?.message,
      },
    }).catch((logError: unknown) => {
      console.error("Failed to record AI error usage:", logError);
    });
    return {
      reply: `Eroare la comunicarea cu AI-ul: ${error.message || "Eroare necunoscută"}`,
    };
  }
}

module.exports = { runAIAgent };

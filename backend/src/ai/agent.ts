/**
 * AI Agent - Wrapper OpenAI cu function calling
 */

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const { bookingTools, bookingToolExecutors } = require("./tools/bookingTools");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
  // Toate tools-urile sunt disponibile pentru toate rolurile
  // RBAC este verificat în fiecare tool executor
  return bookingTools;
}

/**
 * Execută un tool bazat pe nume
 */
async function executeTool(
  toolName: string,
  args: any,
  context: any
): Promise<any> {
  const executor = bookingToolExecutors[toolName];

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
}: {
  message: string;
  context: any;
}): Promise<{ reply: string; toolCalls?: any[] }> {
  if (!client) {
    return {
      reply: "AI Agent nu este configurat. Verifică OPENAI_API_KEY în variabilele de mediu.",
    };
  }

  const systemPrompt = loadSystemPrompt();
  
  // Construiește un system prompt extins cu informații despre user și business-uri
  let enhancedSystemPrompt = systemPrompt;
  if (context.userName) {
    enhancedSystemPrompt += `\n\nUtilizatorul se numește ${context.userName} (ID: ${context.userId}).`;
  }
  if (context.role === "CLIENT" && context.linkedBusinesses && context.linkedBusinesses.length > 0) {
    enhancedSystemPrompt += `\n\nBusiness-uri conectate: ${context.linkedBusinesses.map((b: any) => `"${b.name}" (ID: ${b.id})`).join(", ")}.`;
    enhancedSystemPrompt += `\nPentru a crea o rezervare, poți folosi numele business-ului în loc de ID.`;
  }
  
  const tools = getAvailableToolsForRole(context.role);

  try {
    // Prima apelare - OpenAI decide dacă să apeleze tools
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: enhancedSystemPrompt },
        { role: "user", content: message },
      ],
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
    });

    const assistantMessage = response.choices[0]?.message;

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

    return {
      reply: finalCompletion.choices[0]?.message?.content || "Nu am putut genera un răspuns.",
      toolCalls: toolCalls.map((tc: any) => ({
        name: tc.function.name,
        args: JSON.parse(tc.function.arguments || "{}"),
      })),
    };
  } catch (error: any) {
    console.error("OpenAI API error:", error);
    return {
      reply: `Eroare la comunicarea cu AI-ul: ${error.message || "Eroare necunoscută"}`,
    };
  }
}

module.exports = { runAIAgent };

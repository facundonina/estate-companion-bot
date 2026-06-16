import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Modelo Gemini usado a través del gateway de Lovable AI.
const GEMINI_MODEL = "google/gemini-2.5-flash";

// Sistema (personalidad e instrucciones) que guía a PropBot.
const SYSTEM_PROMPT = `Sos PropBot, un asistente inmobiliario virtual para el mercado uruguayo. Sos amable, profesional y usás lenguaje rioplatense (vos, che). Tu objetivo es calificar leads inmobiliarios de forma natural.

Tenés que recolectar: zona de interés, tipo de propiedad, dormitorios, urgencia (cuándo necesita concretar), método de financiamiento (efectivo, crédito aprobado, crédito en trámite, no definido) y preferencias específicas.

Hacé UNA sola pregunta por mensaje. Cuando tengas todos los datos mostrá las propiedades recomendadas. Nunca menciones la calificación interna del lead al usuario.`;

// Reglas de estilo para que la salida sea apta para una burbuja de chat.
const STYLE_RULES = `Reglas de salida:
- Respondé SOLO con el mensaje para el usuario, sin comillas ni markdown.
- Sé breve: 1 a 3 frases como máximo.
- No repitas el saludo si ya saludaste antes en la conversación.
- No inventes propiedades, precios ni horarios: esos los maneja el sistema.
- Mantené el tono rioplatense (vos, che), cálido y profesional.`;

// Crea el proveedor del gateway de Lovable AI (OpenAI-compatible).
async function getModel() {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[botAi] Falta LOVABLE_API_KEY");
    return null;
  }
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
  return provider(GEMINI_MODEL);
}

const messageInputSchema = z.object({
  // Historial reciente de la conversación (para dar contexto a la IA).
  history: z
    .array(
      z.object({
        role: z.enum(["bot", "user"]),
        text: z.string().max(2000),
      }),
    )
    .max(24),
  // Instrucción interna que indica qué tiene que comunicar el bot ahora.
  instruction: z.string().min(1).max(1500),
});

/**
 * Genera, con Gemini (vía Lovable AI), el próximo mensaje del bot de forma
 * natural y conversacional, manteniendo el flujo controlado por la app.
 * El "instruction" indica QUÉ comunicar; la IA solo redacta CÓMO decirlo.
 * Si algo falla, devuelve { text: null } y el cliente usa su texto de respaldo.
 */
export const generateBotMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => messageInputSchema.parse(data))
  .handler(async ({ data }): Promise<{ text: string | null }> => {
    try {
      const model = await getModel();
      if (!model) return { text: null };

      const { generateText } = await import("ai");

      const messages = [
        ...data.history
          .filter((m) => m.text.trim())
          .map((m) => ({
            role: (m.role === "user" ? "user" : "assistant") as
              | "user"
              | "assistant",
            content: m.text,
          })),
        {
          role: "user" as const,
          content: `[Instrucción interna del sistema, no la menciones ni la repitas]: ${data.instruction}`,
        },
      ];

      const { text } = await generateText({
        model,
        system: `${SYSTEM_PROMPT}\n\n${STYLE_RULES}`,
        messages,
      });

      const clean = (text || "").trim();
      return { text: clean || null };
    } catch (err) {
      console.error("[botAi] Error generando mensaje:", err);
      return { text: null };
    }
  });

// Resultado de interpretar una respuesta del usuario con la IA.
export interface InterpretResult {
  // Para preguntas con opciones: la opción elegida, o null si no aplica.
  option: string | null;
  // Para preguntas de presupuesto: el monto aproximado, o null.
  amount: number | null;
}

const inputSchema = z.object({
  // "option" -> clasificar contra una lista; "budget" -> extraer un monto.
  kind: z.enum(["option", "budget"]),
  // Pregunta que se le hizo al usuario (contexto para la IA).
  question: z.string().min(1).max(500),
  // Texto libre que escribió el usuario.
  message: z.string().min(1).max(1000),
  // Opciones disponibles (solo para kind === "option").
  options: z.array(z.string()).max(12).optional(),
});

/**
 * Interpreta una respuesta de texto libre del usuario usando Lovable AI.
 * Se usa como respaldo cuando las reglas locales no logran entender la
 * intención. Siempre devuelve un objeto seguro (nunca lanza al cliente).
 */
export const interpretAnswer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<InterpretResult> => {
    const empty: InterpretResult = { option: null, amount: null };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      console.error("[botAi] Falta LOVABLE_API_KEY");
      return empty;
    }

    try {
      const { generateText, Output } = await import("ai");
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );

      const provider = createOpenAICompatible({
        name: "lovable",
        baseURL: "https://ai.gateway.lovable.dev/v1",
        headers: {
          "Lovable-API-Key": apiKey,
          "X-Lovable-AIG-SDK": "vercel-ai-sdk",
        },
      });
      const model = provider("google/gemini-3-flash-preview");

      if (data.kind === "budget") {
        const { output } = await generateText({
          model,
          output: Output.object({
            schema: z.object({ amount: z.number().nullable() }),
          }),
          system:
            "Sos un asistente de una inmobiliaria. Extraé el monto de presupuesto aproximado en dólares (USD) de la respuesta del usuario. Acepta formatos como '200000', '200.000', 'USD 200.000', '200 mil', 'doscientos mil', 'hasta 250000', 'entre 200000 y 250000' (tomá el valor máximo). Devolvé solo el número entero en dólares. Si no hay un monto razonable, devolvé null.",
          prompt: `Pregunta: ${data.question}\nRespuesta del usuario: ${data.message}`,
        });
        const amount =
          output.amount && output.amount > 0 ? Math.round(output.amount) : null;
        return { option: null, amount };
      }

      const options = data.options ?? [];
      if (options.length === 0) return empty;

      const { output } = await generateText({
        model,
        output: Output.object({
          schema: z.object({ option: z.string() }),
        }),
        system:
          "Sos un clasificador de intenciones para una inmobiliaria. Dada una pregunta, una lista de opciones válidas y la respuesta libre del usuario, devolvé EXACTAMENTE el texto de la opción que mejor representa la intención del usuario. Si la respuesta no corresponde claramente a ninguna opción, devolvé exactamente 'NONE'.",
        prompt: `Pregunta: ${data.question}\nOpciones válidas: ${options
          .map((o) => `"${o}"`)
          .join(", ")}\nRespuesta del usuario: ${data.message}`,
      });

      const picked = (output.option || "").trim();
      const match = options.find(
        (o) => o.toLowerCase() === picked.toLowerCase(),
      );
      return { option: match ?? null, amount: null };
    } catch (err) {
      console.error("[botAi] Error interpretando respuesta:", err);
      return empty;
    }
  });

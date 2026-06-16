import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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

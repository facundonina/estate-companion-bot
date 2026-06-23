import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { properties, type Property } from "@/data/properties";
import { formatPrice } from "@/lib/format";
import type { CalendarSlot } from "@/lib/calendar.server";

// Modelo Gemini usado a través del gateway de Lovable AI.
const GEMINI_MODEL = "google/gemini-2.5-flash";

// System prompt base del asesor (function calling nativo).
const SYSTEM_PROMPT = `Sos un asesor inmobiliario virtual en tono rioplatense, cercano y directo. Tenés acceso a estas herramientas: buscar_propiedades, obtener_detalle_propiedad, actualizar_perfil_lead, agendar_reunion. Usalas cuando la conversación lo requiera, no esperes una secuencia fija. Tu objetivo de fondo es calificar al lead en financiación, presupuesto y urgencia, pero la prioridad siempre es responder lo que el usuario realmente preguntó, aunque se desvíe del tema. Nunca repitas una pregunta que ya fue respondida o explícitamente evitada; si el usuario evita una pregunta dos veces, abandonala y seguí con otra. Si el usuario muestra interés en otra ubicación, precio o tipo de propiedad, usá buscar_propiedades para ofrecer alternativas reales del catálogo, nunca inventes propiedades que no estén en la base. Cuando el perfil del lead tenga suficiente información, ofrecé agendar una reunión con un vendedor usando agendar_reunion. Mantené las respuestas cortas, como mensajes reales de chat, sin sonar a script.`;

// Reglas de salida para la burbuja de chat.
const STYLE_RULES = `Reglas de salida:
- Respondé SOLO con el mensaje para el usuario, sin comillas ni markdown.
- Sé breve: 1 a 3 frases como máximo.
- Los precios siempre en dólares americanos (USD).
- Mantené el tono rioplatense (vos, che, dale), cálido y profesional.
- Cuando uses una herramienta que muestra tarjetas o una agenda, no repitas en texto toda la info: presentalas con una frase corta.`;

// Crea el proveedor del gateway de Lovable AI (OpenAI-compatible).
async function getProvider() {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.error("[botAi] Falta LOVABLE_API_KEY");
    return null;
  }
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

// Normaliza texto: minúsculas y sin acentos, para comparar.
function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Resumen compacto de una propiedad para devolverle al modelo / al cliente.
function propSummary(p: Property) {
  return {
    id: p.id,
    tipo: p.tipo,
    ubicacion: `${p.barrio}, ${p.departamento}`,
    precio: formatPrice(p.precio, p.moneda),
    dormitorios: p.dormitorios,
    m2: p.superficieTotal,
    estado: p.estado,
    financiacionDisponible: p.aptoBanco,
  };
}

// Detalle completo de una propiedad.
function propDetalle(p: Property) {
  return {
    id: p.id,
    tipo: p.tipo,
    ubicacion: `${p.barrio}, ${p.departamento}`,
    zona: p.zona,
    precio: formatPrice(p.precio, p.moneda),
    moneda: p.moneda,
    dormitorios: p.dormitorios,
    banos: p.banos,
    superficieTotal: `${p.superficieTotal} m²`,
    superficieCubierta: `${p.superficieCubierta} m²`,
    estado: p.estado,
    // "fecha de entrega" aproximada según el estado de obra.
    fechaEntrega:
      p.estado === "En pozo" || p.estado === "En construcción"
        ? "A confirmar (obra en curso)"
        : "Entrega inmediata",
    financiacionDisponible: p.aptoBanco,
    garage: p.garage,
    piscina: p.piscina,
    descripcion: p.descripcion,
  };
}

// ===========================================================================
// Acciones que el servidor le devuelve al cliente para que renderice tarjetas,
// la agenda o aplique cambios en el perfil del lead.
// ===========================================================================
export type BotAction =
  | { type: "buscar_propiedades"; ids: number[] }
  | { type: "obtener_detalle_propiedad"; id: number }
  | {
      type: "actualizar_perfil_lead";
      patch: {
        financiamiento?: string;
        presupuesto?: number;
        urgencia?: string;
        plazoCompra?: string;
      };
    }
  | { type: "agendar_reunion"; slots: CalendarSlot[] };

export interface ChatResult {
  text: string | null;
  actions: BotAction[];
}

const perfilSchema = z.object({
  nombre: z.string().max(120).optional(),
  ubicacion: z.string().max(120).optional(),
  tipo: z.string().max(60).optional(),
  urgencia: z.string().max(120).optional(),
  financiamiento: z.string().max(120).optional(),
  presupuesto: z.number().optional(),
  plazoCompra: z.string().max(120).optional(),
});

const chatInputSchema = z.object({
  // Historial COMPLETO de la conversación (no solo el último mensaje).
  history: z
    .array(
      z.object({
        role: z.enum(["bot", "user"]),
        text: z.string().max(2000),
      }),
    )
    .max(60),
  // Perfil acumulado del lead hasta este momento.
  perfil: perfilSchema,
  // Propiedad que el usuario está viendo en este momento.
  propertyId: z.number(),
});

/**
 * Conversación del bot con function calling nativo de Gemini. En cada llamada
 * se envía: el historial completo, el perfil acumulado del lead y la propiedad
 * que el usuario está viendo. El modelo decide qué herramientas usar (buscar
 * propiedades, ver detalle, actualizar perfil, agendar). Devuelve el texto a
 * mostrar y una lista de acciones para que el cliente renderice tarjetas/agenda
 * y persista el perfil.
 */
export const chatWithBot = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => chatInputSchema.parse(data))
  .handler(async ({ data }): Promise<ChatResult> => {
    const empty: ChatResult = { text: null, actions: [] };
    try {
      const provider = await getProvider();
      if (!provider) return empty;
      const model = provider(GEMINI_MODEL);

      const { generateText, tool, stepCountIs } = await import("ai");

      const activeProp =
        properties.find((p) => p.id === data.propertyId) ?? null;

      // Acciones recolectadas durante la ejecución de las tools (closure).
      const actions: BotAction[] = [];

      const tools = {
        // -------------------------------------------------------------------
        buscar_propiedades: tool({
          description:
            "Busca propiedades reales del catálogo que matcheen filtros opcionales. Usala cuando el usuario pide alternativas o propiedades parecidas (otra ubicación, otro precio, otro tipo). Nunca inventes propiedades fuera de lo que devuelve esta herramienta.",
          inputSchema: z.object({
            ubicacion: z
              .string()
              .optional()
              .describe("Zona, barrio o departamento (ej: Pocitos, Maldonado)"),
            precioMin: z.number().optional().describe("Precio mínimo en USD"),
            precioMax: z.number().optional().describe("Precio máximo en USD"),
            tipo: z
              .string()
              .optional()
              .describe("Tipo de propiedad (Apartamento, Casa, Lote, etc.)"),
            financiacion: z
              .boolean()
              .optional()
              .describe("true si el usuario necesita financiación bancaria"),
          }),
          execute: async (filtros) => {
            const u = filtros.ubicacion ? norm(filtros.ubicacion) : null;
            const t = filtros.tipo ? norm(filtros.tipo) : null;
            const matches = properties
              .filter((p) => p.disponible)
              .filter((p) => {
                if (
                  u &&
                  !norm(`${p.zona} ${p.barrio} ${p.departamento}`).includes(u)
                )
                  return false;
                if (t && !norm(p.tipo).includes(t)) return false;
                if (filtros.precioMin && p.precio < filtros.precioMin)
                  return false;
                if (filtros.precioMax && p.precio > filtros.precioMax)
                  return false;
                if (filtros.financiacion && !p.aptoBanco) return false;
                return true;
              })
              .slice(0, 6);

            actions.push({
              type: "buscar_propiedades",
              ids: matches.map((p) => p.id),
            });

            return {
              cantidad: matches.length,
              propiedades: matches.map(propSummary),
            };
          },
        }),

        // -------------------------------------------------------------------
        obtener_detalle_propiedad: tool({
          description:
            "Devuelve todos los datos de una propiedad (precio, ubicación, m², fecha de entrega, financiación). Usala cuando el usuario pregunta algo específico de una propiedad. Si no se aclara el ID, asumí la propiedad que el usuario está viendo.",
          inputSchema: z.object({
            id: z
              .number()
              .optional()
              .describe("ID de la propiedad; si se omite, la propiedad actual"),
          }),
          execute: async ({ id }) => {
            const targetId = id ?? data.propertyId;
            const p = properties.find((x) => x.id === targetId);
            if (!p) return { error: "Propiedad no encontrada" };
            actions.push({ type: "obtener_detalle_propiedad", id: p.id });
            return propDetalle(p);
          },
        }),

        // -------------------------------------------------------------------
        actualizar_perfil_lead: tool({
          description:
            "Guarda los datos de calificación que van apareciendo en la charla (financiación, presupuesto, urgencia, plazo de compra). Llamala apenas detectes alguno de estos datos. Corre en segundo plano: no bloquea ni demora tu respuesta.",
          inputSchema: z.object({
            financiacion: z
              .string()
              .optional()
              .describe("Cómo planea financiar (contado, crédito, etc.)"),
            presupuesto: z
              .number()
              .optional()
              .describe("Presupuesto aproximado en USD"),
            urgencia: z
              .string()
              .optional()
              .describe("Qué tan urgente es la compra"),
            plazoCompra: z
              .string()
              .optional()
              .describe("En cuánto tiempo planea comprar"),
          }),
          execute: async (patch) => {
            const clean: {
              financiamiento?: string;
              presupuesto?: number;
              urgencia?: string;
              plazoCompra?: string;
            } = {};
            if (patch.financiacion) clean.financiamiento = patch.financiacion;
            if (typeof patch.presupuesto === "number" && patch.presupuesto > 0)
              clean.presupuesto = Math.round(patch.presupuesto);
            if (patch.urgencia) clean.urgencia = patch.urgencia;
            if (patch.plazoCompra) clean.plazoCompra = patch.plazoCompra;
            actions.push({ type: "actualizar_perfil_lead", patch: clean });
            return { ok: true };
          },
        }),

        // -------------------------------------------------------------------
        agendar_reunion: tool({
          description:
            "Ofrece turnos disponibles con un vendedor para coordinar una reunión/visita. Usala SOLO cuando el perfil del lead esté suficientemente calificado (al menos financiación y urgencia/plazo claros). Devuelve horarios reales de la agenda.",
          inputSchema: z.object({}),
          execute: async () => {
            try {
              const { getAvailableSlotsCore } = await import(
                "@/lib/calendar.server"
              );
              const slots = await getAvailableSlotsCore();
              actions.push({ type: "agendar_reunion", slots });
              return {
                disponibles: slots.length,
                horarios: slots
                  .slice(0, 8)
                  .map((s) => `${s.label} ${s.time}`),
              };
            } catch (err) {
              console.error("[botAi] agendar_reunion:", err);
              return {
                error:
                  "No se pudo consultar la agenda en este momento.",
              };
            }
          },
        }),
      };

      // Contexto inyectado: propiedad activa + perfil acumulado.
      const contextLines: string[] = [];
      if (activeProp) {
        const d = propDetalle(activeProp);
        contextLines.push(
          `Propiedad que el usuario está viendo ahora: ${d.tipo} en ${d.ubicacion}, ${d.precio}, ${d.dormitorios} dorm, ${d.superficieTotal}, estado "${d.estado}", entrega ${d.fechaEntrega}, financiación ${d.financiacionDisponible ? "disponible" : "no disponible"}. ID ${d.id}.`,
        );
      }
      const p = data.perfil;
      const perfilLines = [
        p.nombre ? `nombre: ${p.nombre}` : null,
        p.ubicacion ? `ubicación de interés: ${p.ubicacion}` : null,
        p.tipo ? `tipo de interés: ${p.tipo}` : null,
        p.financiamiento ? `financiación: ${p.financiamiento}` : null,
        typeof p.presupuesto === "number"
          ? `presupuesto: USD ${p.presupuesto.toLocaleString("es-UY")}`
          : null,
        p.urgencia ? `urgencia: ${p.urgencia}` : null,
        p.plazoCompra ? `plazo de compra: ${p.plazoCompra}` : null,
      ].filter(Boolean);
      contextLines.push(
        perfilLines.length
          ? `Perfil acumulado del lead: ${perfilLines.join("; ")}.`
          : "Perfil del lead: todavía no hay datos de calificación.",
      );

      const messages = data.history
        .filter((m) => m.text.trim())
        .map((m) => ({
          role: (m.role === "user" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.text,
        }));

      const result = await generateText({
        model,
        system: `${SYSTEM_PROMPT}\n\n${STYLE_RULES}\n\nContexto actual (no lo menciones literalmente):\n${contextLines.join("\n")}`,
        messages,
        tools,
        stopWhen: stepCountIs(8),
      });

      const text = (result.text || "").trim();
      return { text: text || null, actions };
    } catch (err) {
      console.error("[botAi] Error en chatWithBot:", err);
      return empty;
    }
  });

// ===========================================================================
// generateBotMessage: redactor breve para mensajes guiados por la app (saludo
// inicial, confirmaciones). Solo redacta CÓMO decir algo, no decide el flujo.
// ===========================================================================
const messageInputSchema = z.object({
  history: z
    .array(
      z.object({
        role: z.enum(["bot", "user"]),
        text: z.string().max(2000),
      }),
    )
    .max(60),
  instruction: z.string().min(1).max(1500),
});

export const generateBotMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => messageInputSchema.parse(data))
  .handler(async ({ data }): Promise<{ text: string | null }> => {
    try {
      const provider = await getProvider();
      if (!provider) return { text: null };
      const model = provider(GEMINI_MODEL);

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

// ===========================================================================
// interpretAnswer: extracción NO bloqueante. Su único rol es extraer datos de
// calificación (financiación, presupuesto, urgencia, plazo) del mensaje del
// usuario para alimentar actualizar_perfil_lead. Ya NO decide si se repite una
// pregunta ni controla el flujo. Devuelve siempre un objeto seguro.
// ===========================================================================
export interface ProfilePatch {
  financiamiento: string | null;
  presupuesto: number | null;
  urgencia: string | null;
  plazoCompra: string | null;
}

const interpretInputSchema = z.object({
  history: z
    .array(
      z.object({
        role: z.enum(["bot", "user"]),
        text: z.string().max(2000),
      }),
    )
    .max(60),
  message: z.string().min(1).max(1000),
});

export const interpretAnswer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => interpretInputSchema.parse(data))
  .handler(async ({ data }): Promise<ProfilePatch> => {
    const empty: ProfilePatch = {
      financiamiento: null,
      presupuesto: null,
      urgencia: null,
      plazoCompra: null,
    };
    try {
      const provider = await getProvider();
      if (!provider) return empty;
      const model = provider(GEMINI_MODEL);

      const { generateText, Output } = await import("ai");

      const historyMessages = data.history
        .filter((m) => m.text.trim())
        .map((m) => ({
          role: (m.role === "user" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.text,
        }));

      const { output } = await generateText({
        model,
        output: Output.object({
          schema: z.object({
            financiamiento: z.string(),
            presupuesto: z.number(),
            urgencia: z.string(),
            plazoCompra: z.string(),
          }),
        }),
        system:
          "Sos un asistente de una inmobiliaria uruguaya. Extraé del último mensaje del usuario (usando el contexto) SOLO datos de calificación: financiación (cómo paga), presupuesto en USD, urgencia y plazo de compra. No inventes: si un dato no aparece, devolvé \"NONE\" para los textos y 0 para el presupuesto.",
        messages: [
          ...historyMessages,
          {
            role: "user" as const,
            content: `Último mensaje del usuario: "${data.message}"`,
          },
        ],
      });

      const str = (v: unknown) => {
        const s = typeof v === "string" ? v.trim() : "";
        return s && s.toUpperCase() !== "NONE" ? s : null;
      };
      const num =
        typeof output.presupuesto === "number" && output.presupuesto > 0
          ? Math.round(output.presupuesto)
          : null;

      return {
        financiamiento: str(output.financiamiento),
        presupuesto: num,
        urgencia: str(output.urgencia),
        plazoCompra: str(output.plazoCompra),
      };
    } catch (err) {
      console.error("[botAi] Error interpretando respuesta:", err);
      return empty;
    }
  });

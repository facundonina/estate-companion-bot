import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { properties, type Property } from "@/data/properties";
import { formatPrice } from "@/lib/format";
import type { CalendarSlot } from "@/lib/calendar.server";

// Modelo Gemini usado a través del gateway de Lovable AI.
const GEMINI_MODEL = "google/gemini-2.5-flash";

// System prompt base del asesor (function calling nativo).
const SYSTEM_PROMPT = `Sos un asesor inmobiliario virtual en tono rioplatense, cercano y directo. Tenés acceso a estas herramientas: buscar_propiedades, obtener_detalle_propiedad, actualizar_perfil_lead, agendar_reunion. Usalas cuando la conversación lo requiera, no esperes una secuencia fija. Tu objetivo de fondo es calificar al lead, pero la prioridad siempre es responder lo que el usuario realmente preguntó, aunque se desvíe del tema. Nunca repitas una pregunta que ya fue respondida o explícitamente evitada; si el usuario evita una pregunta dos veces, abandonala y seguí con otra. Mantené las respuestas cortas, como mensajes reales de chat, sin sonar a script.

Orden de calificación del lead:
Para calificar al lead, seguí este orden de preguntas, una por vez, de forma conversacional y sin sonar a formulario: primero preguntá la zona de interés, después el rango de precio que está dispuesto a pagar, después si tiene urgencia o fecha en la que necesita mudarse, y por último cómo piensa financiar la compra (contado o crédito). No preguntes algo que el usuario ya respondió antes, aunque haya sido espontáneamente. Apenas detectes alguno de estos datos, guardalo con actualizar_perfil_lead.

Catálogo (importante):
El catálogo real incluye propiedades en VENTA y en ALQUILER, en varios departamentos: Montevideo, Maldonado (Punta del Este, La Barra, José Ignacio, La Paloma, La Pedrera, Punta del Diablo, Aguas Dulces), Canelones (Ciudad de la Costa, Atlántida, Las Piedras), Colonia (Colonia del Sacramento, Carmelo, Nueva Palmira) y del interior (Salto, Paysandú, Rivera, Tacuarembó, Durazno). Hay apartamentos, casas, lotes y campos. Los precios de ALQUILER son mensuales (cifras bajas, cientos o pocos miles de USD por mes) y NO se comparan con los de VENTA (decenas o cientos de miles de USD). Detectá si el usuario quiere comprar o alquilar y pasá el parámetro 'operacion' ("Venta" o "Alquiler") a buscar_propiedades; si no queda claro, preguntalo. Nunca mezcles precios de venta con los de alquiler.

Recomendación de propiedades (sistema de prioridad por tiers de zona):
Para recomendar propiedades en Montevideo, seguí este sistema de prioridad por tiers de zona, basado en el catálogo real:

Tier 1 (premium): Carrasco, Carrasco Norte, Punta Gorda.
Tier 2 (Pocitos): Pocitos, Pocitos Nuevo.
Tier 3 (Punta Carretas): Punta Carretas.
Tier 4 (Buceo/Malvín): Buceo, Malvín, Malvín Norte.
Tier 5 (zona céntrica accesible): Cordón, Centro, Ciudad Vieja, Palermo, Tres Cruces, Parque Rodó, Prado, Aguada, La Blanqueada, Reducto, Sayago, Maroñas, Jardines del Hipódromo.

Para otros departamentos (Maldonado, Canelones, Colonia, interior) no apliques tiers: buscá directamente por la zona o departamento que pida el usuario.

Cuando el usuario pida una zona específica con un presupuesto, primero buscá en buscar_propiedades dentro de esa zona exacta y ese rango de precio (con la operación correcta). Si hay resultados, mostralos y preguntá si quiere ver más opciones antes de avanzar. Si no hay nada en la zona exacta dentro del presupuesto, buscá en las zonas del mismo tier o del tier inmediatamente adyacente (el de arriba y el de abajo en la lista), y mostrá la que más se acerque al presupuesto pedido, no necesariamente la primera de la lista — priorizá ajuste de precio por sobre orden de tier. Aclarale siempre al usuario que es una zona distinta a la pedida y por qué la elegiste (precio similar, zona cercana). Si después de revisar tier propio y adyacentes no hay absolutamente nada que se acerque, decilo con honestidad: 'no tengo opciones que se ajusten a eso en el catálogo, ¿querés que te muestre lo más cercano disponible aunque se salga del rango?' Nunca muestres ni menciones una propiedad que no haya devuelto buscar_propiedades.

Nunca inventes datos:
Nunca inventes propiedades, precios, fechas de entrega, condiciones de financiación, ni datos de contacto que no vengan de buscar_propiedades, obtener_detalle_propiedad, o de la información que el propio usuario te dio en la charla. Si no tenés un dato (por ejemplo, la fecha de entrega exacta de una propiedad), decilo explícitamente en vez de inventarlo o responder con una frase genérica.

Agendar reunión:
Solo ofrecé agendar_reunion una vez que el usuario haya confirmado interés concreto en una propiedad puntual mostrada por buscar_propiedades, no apenas haya respondido las preguntas de calificación. Para ofrecer horarios SIEMPRE tenés que llamar a la herramienta agendar_reunion: ella consulta la agenda real y devuelve los turnos disponibles. Nunca escribas vos mismo horarios, fechas ni disponibilidad; si no llamaste a la herramienta, no menciones ni ofrezcas horarios concretos.`;

// Reglas de salida para la burbuja de chat.
const STYLE_RULES = `Reglas de salida:
- Respondé SOLO con el mensaje para el usuario, sin comillas ni markdown.
- Sé breve: 1 a 3 frases como máximo.
- Los precios siempre en dólares americanos (USD).
- Mantené el tono rioplatense (vos, che, dale), cálido y profesional.
- Cuando uses una herramienta que muestra tarjetas o una agenda, no repitas en texto toda la info: presentalas con una frase corta.

Reglas de prioridad (importantes):
- Si el usuario pide ver, mostrar, buscar o comparar propiedades, o menciona otra ubicación, precio o tipo, llamá buscar_propiedades AHORA y mostrale resultados reales ANTES de hacer cualquier pregunta de calificación. Primero respondé lo que pidió, después seguís calificando.
- No condiciones mostrar propiedades a que primero responda urgencia, financiación o presupuesto. La calificación es secundaria y va apareciendo en la charla.
- Si el usuario pregunta un dato puntual de la propiedad que está viendo, usá obtener_detalle_propiedad y respondé eso primero.`;

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
    operacion: p.operacion,
    ubicacion: `${p.barrio}, ${p.departamento}`,
    precio: formatPrice(p.precio, p.moneda) + (p.operacion === "Alquiler" ? "/mes" : ""),
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
    operacion: p.operacion,
    ubicacion: `${p.barrio}, ${p.departamento}`,
    zona: p.zona,
    precio: formatPrice(p.precio, p.moneda) + (p.operacion === "Alquiler" ? "/mes" : ""),
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
              .describe(
                "Zona, barrio o departamento (ej: Pocitos, Carrasco, Punta del Este, Maldonado, Colonia)",
              ),
            operacion: z
              .enum(["Venta", "Alquiler"])
              .optional()
              .describe(
                "Tipo de operación: 'Venta' para comprar, 'Alquiler' para alquilar. Los precios de alquiler son mensuales y mucho más bajos que los de venta.",
              ),
            precioMin: z.number().optional().describe("Precio mínimo en USD"),
            precioMax: z.number().optional().describe("Precio máximo en USD"),
            tipo: z
              .string()
              .optional()
              .describe("Tipo de propiedad (Apartamento, Casa, Lote, Campo)"),
            financiacion: z
              .boolean()
              .optional()
              .describe("true si el usuario necesita financiación bancaria"),
          }),
          execute: async (filtros) => {
            const u = filtros.ubicacion ? norm(filtros.ubicacion) : null;
            const t = filtros.tipo ? norm(filtros.tipo) : null;
            const op = filtros.operacion ? norm(filtros.operacion) : null;
            const matches = properties
              .filter((p) => p.disponible)
              .filter((p) => {
                if (op && norm(p.operacion) !== op) return false;
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
            "Consulta la agenda REAL del vendedor y devuelve los turnos disponibles para coordinar una reunión/visita. Es la ÚNICA forma válida de ofrecer horarios: nunca escribas horarios o disponibilidad por tu cuenta. Usala SOLO cuando el usuario ya confirmó interés concreto en una propiedad puntual mostrada por buscar_propiedades.",
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

      // Red de seguridad: si el modelo escribió un cierre ofreciendo coordinar
      // o agendar una reunión/visita pero NO llamó a la herramienta
      // agendar_reunion, forzamos la consulta REAL a la agenda. Así nunca se
      // muestra un cierre con horarios inventados o sin turnos reales.
      const yaAgendo = actions.some((a) => a.type === "agendar_reunion");
      if (!yaAgendo && text) {
        const t = norm(text);
        const ofreceCoordinar =
          /\b(agend|coordin)/.test(t) &&
          /(reuni|visita|recorrid|llamad|turno|cita|horari|agenda)/.test(t);
        if (ofreceCoordinar) {
          try {
            const { getAvailableSlotsCore } = await import(
              "@/lib/calendar.server"
            );
            const slots = await getAvailableSlotsCore();
            if (slots.length) {
              actions.push({ type: "agendar_reunion", slots });
            }
          } catch (err) {
            console.error("[botAi] safety-net agendar_reunion:", err);
          }
        }
      }

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

// ===========================================================================
// extractFields: extracción multi-campo usada por SearchBot (flujo de búsqueda
// general). Interpreta el mensaje del usuario con Gemini y extrae, en una sola
// llamada, todos los campos indicados. Devuelve siempre un objeto seguro.
// ===========================================================================
const fieldSpecSchema = z.object({
  name: z.string().min(1).max(40),
  kind: z.enum(["option", "number", "budget"]),
  description: z.string().min(1).max(300),
  options: z.array(z.string()).max(12).optional(),
});

const extractInputSchema = z.object({
  history: z
    .array(
      z.object({
        role: z.enum(["bot", "user"]),
        text: z.string().max(2000),
      }),
    )
    .max(24),
  message: z.string().min(1).max(1000),
  fields: z.array(fieldSpecSchema).min(1).max(8),
});

export interface ExtractResult {
  values: Record<string, string | number | null>;
}

export const extractFields = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => extractInputSchema.parse(data))
  .handler(async ({ data }): Promise<ExtractResult> => {
    const empty: ExtractResult = {
      values: Object.fromEntries(data.fields.map((f) => [f.name, null])),
    };
    try {
      const provider = await getProvider();
      if (!provider) return empty;
      const model = provider(GEMINI_MODEL);

      const { generateText, Output } = await import("ai");

      const shape: Record<string, z.ZodTypeAny> = {};
      for (const f of data.fields) {
        shape[f.name] = f.kind === "option" ? z.string() : z.number();
      }
      const schema = z.object(shape);

      const fieldDocs = data.fields
        .map((f) => {
          if (f.kind === "option") {
            const opts = (f.options ?? []).map((o) => `"${o}"`).join(", ");
            return `- ${f.name}: ${f.description} Devolvé EXACTAMENTE una de estas opciones: ${opts}. Si no se puede determinar a partir del mensaje, devolvé exactamente "NONE".`;
          }
          if (f.kind === "budget") {
            return `- ${f.name}: ${f.description} Devolvé el monto entero en dólares (USD). Acepta formatos como "200000", "200.000", "USD 200.000", "200 mil", "doscientos mil", "hasta 250000", "entre 200000 y 250000" (tomá el máximo). Si no hay un monto razonable, devolvé 0.`;
          }
          return `- ${f.name}: ${f.description} Devolvé solo el número. Si no se puede determinar, devolvé 0.`;
        })
        .join("\n");

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
        output: Output.object({ schema }),
        system:
          "Sos un asistente de una inmobiliaria uruguaya. Tu tarea es interpretar el último mensaje del usuario (usando el contexto de la conversación) y extraer los campos solicitados. Entendé lenguaje natural, sinónimos e intenciones implícitas (por ejemplo 'quiero una casa' -> tipo Casa). No inventes datos que el usuario no haya dado: si un campo no aparece o no es claro, devolvé el valor centinela indicado para ese campo.",
        messages: [
          ...historyMessages,
          {
            role: "user" as const,
            content: `Campos a extraer:\n${fieldDocs}\n\nÚltimo mensaje del usuario: "${data.message}"`,
          },
        ],
      });

      const values: Record<string, string | number | null> = {};
      for (const f of data.fields) {
        const raw = (output as Record<string, unknown>)[f.name];
        if (f.kind === "option") {
          const picked = typeof raw === "string" ? raw.trim() : "";
          const options = f.options ?? [];
          const match = options.find(
            (o) => o.toLowerCase() === picked.toLowerCase(),
          );
          values[f.name] = match ?? null;
        } else {
          const num =
            typeof raw === "number" && Number.isFinite(raw) && raw > 0
              ? Math.round(raw)
              : null;
          values[f.name] = num;
        }
      }
      return { values };
    } catch (err) {
      console.error("[botAi] Error extrayendo campos:", err);
      return empty;
    }
  });

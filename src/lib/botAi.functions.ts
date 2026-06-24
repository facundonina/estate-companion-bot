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
El catálogo real incluye propiedades en VENTA y en ALQUILER, en varios departamentos: Montevideo, Maldonado (Punta del Este, La Barra, José Ignacio, La Paloma, La Pedrera, Punta del Diablo, Aguas Dulces), Canelones (Ciudad de la Costa, Atlántida, Las Piedras), Colonia (Colonia del Sacramento, Carmelo, Nueva Palmira) y del interior (Salto, Paysandú, Rivera, Tacuarembó, Durazno). Hay apartamentos, casas, lotes y campos. Los precios de ALQUILER son mensuales (cifras bajas, cientos o pocos miles de USD por mes) y NO se comparan con los de VENTA (decenas o cientos de miles de USD). Pasá el parámetro 'operacion' ("Venta" o "Alquiler") a buscar_propiedades. Si el usuario está interesado en una propiedad puntual ya mostrada, la operación es la de esa propiedad: tomala automáticamente y NO se la preguntes. Solo preguntá si busca comprar o alquilar cuando esté charlando en general, sin haber elegido todavía ninguna propiedad puntual. Reconocé sinónimos: "comprar", "comprarla", "compra" = Venta; "alquilar", "rentar", "alquilarla" = Alquiler. Nunca mezcles precios de venta con los de alquiler.

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

Confirmación de interés en una propiedad puntual:
En el momento exacto en que el usuario confirme interés concreto en una propiedad mostrada (por ejemplo, diciendo que le interesa, que le gusta, o similar), antes de cualquier otra cosa preguntale, en dos mensajes separados y en este orden, cómo piensa pagarla y para cuándo la necesita. Una vez que tengas esas dos respuestas, preguntale explícitamente: ¿querés ver una opción similar antes de decidir, o ya coordinamos la visita? No avances a ofrecer la visita ni el calendario hasta que el usuario elija una de esas dos opciones explícitamente.

Toda la interacción es conversacional en texto libre: no hay botones de respuesta rápida. Por eso, cada vez que tu mensaje espere que el usuario elija entre opciones (método de pago, plazo de mudanza, o la pregunta de cierre), presentá SIEMPRE las dos o tres opciones explícitamente dentro del texto de la pregunta, de modo que la respuesta no dependa de una sola palabra ambigua como "sí" o "dale". Por ejemplo: "¿la pensás pagar al contado o con crédito (ya aprobado o en trámite)?", "¿para cuándo la necesitás: ya, en los próximos meses, o más adelante?", "¿querés ver una opción similar antes de decidir, o ya coordinamos la visita?". Nunca cierres una pregunta de opciones de forma que solo se pueda contestar con "sí".

Agendar reunión:
Solo ofrecé agendar_reunion una vez que el usuario haya confirmado interés concreto en una propiedad puntual mostrada por buscar_propiedades, no apenas haya respondido las preguntas de calificación. Para ofrecer horarios SIEMPRE tenés que llamar a la herramienta agendar_reunion: ella consulta la agenda real y devuelve los turnos disponibles. Nunca escribas vos mismo horarios, fechas ni disponibilidad; si no llamaste a la herramienta, no menciones ni ofrezcas horarios concretos. La herramienta agendar_reunion solo devuelve turnos si el lead ya está calificado; si te responde con "faltanDatos", NO confirmes ninguna visita: preguntá esos datos primero y recién después volvé a ofrecer agendar.
Si la herramienta agendar_reunion te responde con "derivarAsesor" (porque el método de pago del lead es "Sin iniciar"), NO ofrezcas coordinar una visita ni menciones el calendario: decile con calidez que un asesor se va a contactar para ayudarlo con los pasos de financiación, y seguí la charla con naturalidad.
Nunca interpretes una respuesta corta y ambigua como "sí", "dale", "ok", o "bueno" como confirmación para agendar una visita o cerrar la conversación, salvo que ya tengas completos estos cuatro datos del lead: operación, presupuesto, intención de compra y método de pago. Si falta alguno, una respuesta afirmativa del usuario significa que quiere que sigas la calificación, no que reserves una visita. Además, evitá frases ambiguas como "¿querés que avancemos?" cuando lo que sigue es ofrecer agendar — en cambio, preguntá directamente la próxima pregunta de calificación pendiente.

No repitas datos crudos de las herramientas:
Nunca repitas en tu respuesta de texto el resultado crudo (JSON, array, ni ningún campo técnico) de buscar_propiedades u obtener_detalle_propiedad, bajo ninguna circunstancia. Esos datos se muestran únicamente a través de la tarjeta visual de la propiedad, nunca como texto. Tu respuesta en texto debe ser puramente conversacional — podés mencionar el nombre o la zona de la propiedad, pero nunca pegues el objeto de datos, un array, un bloque JSON ni ningún campo técnico.

Calificación del lead:
Durante la conversación, identificá y guardá en el perfil del lead, vía actualizar_perfil_lead, estos campos a medida que vayan apareciendo: operación (si el usuario muestra interés en una propiedad puntual, la operación es la de esa propiedad y NO se la preguntes; solo preguntá si busca comprar o alquilar en charlas generales, cuando todavía no eligió ninguna propiedad puntual), zona, tipo de propiedad, presupuesto, intención de compra o plazo de mudanza, método de pago, y el ID de la propiedad puntual en la que el usuario mostró interés concreto entre los resultados de buscar_propiedades. El sistema registra al lead en la planilla automáticamente al final de la conversación (cuando se confirma la reunión o el usuario se despide); no tenés ninguna herramienta de registro, así que no intentes registrar nada vos mismo. Nunca calcules ni menciones vos mismo un puntaje o una categoría de prioridad — eso lo hace el sistema automáticamente, no es algo que tengas que decidir ni comunicar.

Cuando el usuario te diga cómo piensa pagar o para cuándo necesita la propiedad, guardá su frase literal y además la categoría que mejor corresponda, interpretando sinónimos naturales. Para método de pago usá exactamente una de estas cuatro categorías: Efectivo listo, Crédito hipotecario aprobado, Crédito en trámite, Sin iniciar. Al contado / tengo la plata / en efectivo equivalen a Efectivo listo. Crédito ya aprobado / preaprobado por el banco equivale a Crédito hipotecario aprobado. Crédito en trámite SOLO aplica si la persona ya está activamente tramitando con el banco, con gestión iniciada y documentación entregada o en evaluación. Si quiere crédito pero todavía no entregó papeles, no inició gestión con el banco, está averiguando, o no lo definió, categorizalo como Sin iniciar, no como Crédito en trámite. Para intención de compra: lo antes posible / ya / necesito mudarme ahora equivalen a Menos de 3 meses. Nunca dejes la categoría sin asignar si el usuario dio una respuesta que claramente corresponde a alguna de las opciones.`;

// Reglas de salida para la burbuja de chat.
const STYLE_RULES = `Reglas de salida:
- Respondé SOLO con el mensaje para el usuario, sin comillas ni markdown.
- Sé breve: 1 a 3 frases como máximo.
- Los precios siempre en dólares americanos (USD).
- Mantené el tono rioplatense (vos, che, dale), cálido y profesional.
- Cuando uses una herramienta que muestra tarjetas o una agenda, no repitas en texto toda la info: presentalas con una frase corta.

Reglas de prioridad (importantes):
- Vos SOS siempre el asesor inmobiliario, nunca el cliente. Escribí únicamente el próximo mensaje del asesor. Nunca redactes, completes ni simules lo que diría el usuario, nunca te saludes a vos mismo ("¡Hola! Todo bien, gracias…"), ni respondas en primera persona como si fueras quien busca la propiedad. Si el último mensaje del historial es del usuario, tu tarea es responderle como asesor, no continuar su turno.
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

// Mapea la respuesta del usuario sobre la operación a "Venta" o "Alquiler",
// reconociendo sinónimos comunes (comprar/compra -> Venta; alquilar/rentar ->
// Alquiler), no solo las palabras exactas "venta"/"alquiler".
export function mapOperacion(text: string): "Venta" | "Alquiler" | null {
  const n = norm(text);
  if (
    /\b(comprar|comprarla|comprarlo|comprarlos|comprarme|comprando|compra|compro|adquirir|adquirirla|venta|vender)\b/.test(
      n,
    )
  )
    return "Venta";
  if (
    /\b(alquilar|alquilarla|alquilarlo|alquilando|alquiler|alquilo|rentar|rentarla|rentarlo|renta|arrendar|arriendo)\b/.test(
      n,
    )
  )
    return "Alquiler";
  return null;
}

function normalizeMetodoPagoCategoria(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const n = norm(v);
  if (n.includes("efectivo")) return "Efectivo listo";
  if (n.includes("hipotecario") && n.includes("aprobad")) {
    return "Crédito hipotecario aprobado";
  }
  if (n.includes("credito") && (n.includes("tramite") || n.includes("gestion"))) {
    return "Crédito en trámite";
  }
  if (n.includes("sin iniciar") || n.includes("no definido")) return "Sin iniciar";
  return v;
}

// Red de seguridad en código (no solo en el prompt): elimina cualquier bloque de
// datos estructurados (JSON, arrays, bloques de código, líneas tipo "campo: valor"
// crudas) que el modelo haya podido pegar por error en su respuesta de texto. Los
// datos de las propiedades se muestran SOLO a través de la tarjeta visual, nunca
// como texto plano.
function stripStructuredData(text: string): string {
  let t = text;
  // Bloques de código con fence ```...```.
  t = t.replace(/```[\s\S]*?```/g, " ");
  // Objetos JSON {...} y arrays [...] que contengan comillas y dos puntos/comas
  // (señal de payload estructurado, no de una frase normal).
  t = t.replace(/\{[^{}]*["'][^{}]*[:,][^{}]*\}/g, " ");
  t = t.replace(/\[\s*\{[\s\S]*?\}\s*\]/g, " ");
  // Limpieza de espacios sobrantes que pueda dejar el borrado.
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return t.trim();
}


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
        operacion?: string;
        metodoPago?: string;
        presupuesto?: number;
        intencionCompra?: string;
      };
    }
  | { type: "agendar_reunion"; slots: CalendarSlot[] };

export interface ChatResult {
  text: string | null;
  actions: BotAction[];
}

const perfilSchema = z.object({
  nombre: z.string().max(120).optional(),
  operacion: z.string().max(40).optional(),
  ubicacion: z.string().max(120).optional(),
  tipo: z.string().max(60).optional(),
  // Método de pago: una de las categorías fijas (sin texto literal separado).
  metodoPago: z.string().max(60).optional(),
  // Intención de compra / plazo: una de las categorías fijas.
  intencionCompra: z.string().max(60).optional(),
  presupuesto: z.number().optional(),
});

type PerfilLead = z.infer<typeof perfilSchema>;

// Calificación mínima exigida ANTES de poder confirmar/ofrecer una visita.
// Devuelve la lista de campos que faltan (vacía => se puede agendar).
function camposFaltantesParaAgendar(perfil: PerfilLead): string[] {
  const faltan: string[] = [];
  const metodoPago = normalizeMetodoPagoCategoria(perfil.metodoPago);
  if (!perfil.operacion) faltan.push("operación (compra o alquiler)");
  if (typeof perfil.presupuesto !== "number" || perfil.presupuesto <= 0)
    faltan.push("presupuesto");
  if (!perfil.intencionCompra || perfil.intencionCompra === "Sin definir")
    faltan.push("intención de compra o plazo de mudanza");
  if (!metodoPago || metodoPago === "Sin iniciar")
    faltan.push("método de pago");
  return faltan;
}

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
            "Guarda los datos de calificación que van apareciendo en la charla (operación, método de pago, presupuesto, intención de compra). Llamala apenas detectes alguno de estos datos. Corre en segundo plano: no bloquea ni demora tu respuesta.",
          inputSchema: z.object({
            operacion: z
              .enum(["Venta", "Alquiler"])
              .optional()
              .describe(
                "Operación que busca el usuario: 'Venta' si quiere comprar, 'Alquiler' si quiere alquilar.",
              ),
            metodo_pago_texto: z
              .string()
              .optional()
              .describe(
                "El texto literal que dijo el usuario sobre cómo piensa pagar, tal cual lo escribió o algo muy cercano.",
              ),
            metodo_pago_categoria: z
              .enum([
                "Efectivo listo",
                "Crédito hipotecario aprobado",
                "Crédito en trámite",
                "Sin iniciar",
              ])
              .optional()
              .describe(
                "La categoría fija de método de pago que mejor corresponde a lo que dijo el usuario.",
              ),
            presupuesto: z
              .number()
              .optional()
              .describe("Presupuesto aproximado en USD"),
            intencion_compra_texto: z
              .string()
              .optional()
              .describe(
                "El texto literal que dijo el usuario sobre para cuándo necesita la propiedad, tal cual lo escribió o algo muy cercano.",
              ),
            intencion_compra_categoria: z
              .enum(["Menos de 3 meses", "3 a 6 meses", "En el año", "Sin definir"])
              .optional()
              .describe(
                "La categoría fija de intención de compra / plazo de mudanza que mejor corresponde a lo que dijo el usuario.",
              ),
          }),
          execute: async (patch) => {
            const clean: {
              operacion?: string;
              metodoPagoTexto?: string;
              metodoPagoCategoria?: string;
              presupuesto?: number;
              intencionCompraTexto?: string;
              intencionCompraCategoria?: string;
            } = {};
            if (patch.operacion) clean.operacion = patch.operacion;
            if (patch.metodo_pago_texto)
              clean.metodoPagoTexto = patch.metodo_pago_texto;
            if (patch.metodo_pago_categoria)
              clean.metodoPagoCategoria = normalizeMetodoPagoCategoria(
                patch.metodo_pago_categoria,
              );
            if (typeof patch.presupuesto === "number" && patch.presupuesto > 0)
              clean.presupuesto = Math.round(patch.presupuesto);
            if (patch.intencion_compra_texto)
              clean.intencionCompraTexto = patch.intencion_compra_texto;
            if (patch.intencion_compra_categoria)
              clean.intencionCompraCategoria = patch.intencion_compra_categoria;
            actions.push({ type: "actualizar_perfil_lead", patch: clean });
            // Aplicamos el patch al perfil EN MEMORIA de esta misma llamada para
            // que las tools que corran después en el mismo turno (sobre todo
            // agendar_reunion) lean la categoría de financiación ACTUALIZADA y
            // no el valor viejo con el que arrancó la request. Sin esto, el
            // usuario podía decir "quiero crédito pero todavía no arranqué" y el
            // bot ofrecía el calendario igual, porque agendar_reunion seguía
            // viendo el metodoPagoCategoria anterior al patch.
            Object.assign(data.perfil, clean);
            return { ok: true };
          },
        }),

        // -------------------------------------------------------------------
        agendar_reunion: tool({
          description:
            "Consulta la agenda REAL del vendedor y devuelve los turnos disponibles para coordinar una reunión/visita. Es la ÚNICA forma válida de ofrecer horarios: nunca escribas horarios o disponibilidad por tu cuenta. Usala SOLO cuando el usuario ya confirmó interés concreto en una propiedad puntual mostrada por buscar_propiedades. Antes de devolver turnos, el sistema verifica que el lead esté calificado (operación, presupuesto, intención de compra y método de pago); si falta algún dato, NO devuelve horarios.",
          inputSchema: z.object({}),
          execute: async () => {
            // Si el método de pago del lead es "Sin iniciar" (quiere crédito pero
            // todavía no inició ningún trámite), NO ofrecemos coordinar la visita
            // ni mostramos el calendario: derivamos a un asesor para los pasos de
            // financiación. El lead se registra igual por el flujo normal de fin
            // de conversación, solo que sin generar un evento de calendario.
            if (
              normalizeMetodoPagoCategoria(data.perfil.metodoPagoCategoria) ===
              "Sin iniciar"
            ) {
              return {
                reservaConfirmada: false,
                puedeAgendar: false,
                derivarAsesor: true,
                instruccion:
                  "El método de pago del lead es 'Sin iniciar'. NO ofrezcas coordinar una visita ni menciones el calendario. Decile con calidez que un asesor se va a contactar para ayudarlo con los pasos de financiación.",
              };
            }
            // VERIFICACIÓN EN CÓDIGO (no solo en el prompt): no se puede agendar
            // una visita sin tener el lead calificado. Si falta alguno de los 4
            // campos clave, no consultamos la agenda ni confirmamos: devolvemos
            // una señal con los campos faltantes para que el modelo los pregunte.
            const faltan = camposFaltantesParaAgendar(data.perfil);
            if (faltan.length) {
              return {
                reservaConfirmada: false,
                puedeAgendar: false,
                faltanDatos: faltan,
                instruccion:
                  "No confirmes ni ofrezcas la visita todavía. Antes tenés que calificar al lead: faltan estos datos -> " +
                  faltan.join(", ") +
                  ". Preguntá de forma conversacional el primero que falte y no vuelvas a ofrecer agendar hasta tenerlos todos.",
              };
            }
            try {
              const { getAvailableSlotsCore } = await import(
                "@/lib/calendar.server"
              );
              const slots = await getAvailableSlotsCore();
              actions.push({ type: "agendar_reunion", slots });
              return {
                reservaConfirmada: true,
                puedeAgendar: true,
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
        // El registro del lead en la planilla lo hace el CLIENTE al final de la
        // conversación (reunión confirmada, despedida, inactividad o cierre de
        // pestaña), para mandar siempre los datos más actualizados. El modelo no
        // dispone de una herramienta de registro.
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
        p.operacion ? `operación: ${p.operacion}` : null,
        p.ubicacion ? `ubicación de interés: ${p.ubicacion}` : null,
        p.tipo ? `tipo de interés: ${p.tipo}` : null,
        p.metodoPagoTexto
          ? `método de pago: ${p.metodoPagoTexto}${p.metodoPagoCategoria ? ` (${p.metodoPagoCategoria})` : ""}`
          : null,
        typeof p.presupuesto === "number"
          ? `presupuesto: USD ${p.presupuesto.toLocaleString("es-UY")}`
          : null,
        p.intencionCompraTexto
          ? `intención de compra: ${p.intencionCompraTexto}${p.intencionCompraCategoria ? ` (${p.intencionCompraCategoria})` : ""}`
          : null,
      ].filter(Boolean);
      contextLines.push(
        perfilLines.length
          ? `Perfil acumulado del lead: ${perfilLines.join("; ")}.`
          : "Perfil del lead: todavía no hay datos de calificación.",
      );
      const faltanParaAgendar = camposFaltantesParaAgendar(p);
      contextLines.push(
        faltanParaAgendar.length
          ? `Faltan datos para poder agendar una visita: ${faltanParaAgendar.join(", ")}. No ofrezcas ni confirmes una visita hasta tenerlos todos.`
          : "El lead ya está calificado: si confirma interés concreto, podés ofrecer agendar una visita.",
      );

      const messages = data.history
        .filter((m) => m.text.trim())
        .map((m) => ({
          role: (m.role === "user" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.text,
        }));

      // Garantía de roles: la conversación SIEMPRE debe arrancar con un turno
      // del usuario. Si el primer mensaje del historial es del asesor (p. ej. el
      // saludo/opener generado por la app), Gemini puede "perder" quién es y
      // ponerse a contestar como si fuera el cliente. Anclamos el rol con un
      // turno inicial sintético del usuario.
      if (messages.length && messages[0].role === "assistant") {
        messages.unshift({
          role: "user" as const,
          content: "(Abrí el chat porque estoy mirando esta propiedad.)",
        });
      }

      const result = await generateText({
        model,
        system: `${SYSTEM_PROMPT}\n\n${STYLE_RULES}\n\nContexto actual (no lo menciones literalmente):\n${contextLines.join("\n")}`,
        messages,
        tools,
        stopWhen: stepCountIs(8),
      });

      const text = stripStructuredData((result.text || "").trim());

      // Red de seguridad: si el modelo escribió un cierre ofreciendo coordinar
      // o agendar una reunión/visita pero NO llamó a la herramienta
      // agendar_reunion, forzamos la consulta REAL a la agenda. Así nunca se
      // muestra un cierre con horarios inventados o sin turnos reales.
      const yaAgendo = actions.some((a) => a.type === "agendar_reunion");
      // La red de seguridad NUNCA debe forzar turnos si el lead no está
      // calificado: respeta el mismo gate que la tool agendar_reunion. Lo
      // recalculamos sobre el perfil YA actualizado por las tools de este turno
      // (no el snapshot inicial), y nunca forzamos calendario si la financiación
      // es "Sin iniciar" (ese caso se deriva a un asesor, sin agendar visita).
      const faltanFinal = camposFaltantesParaAgendar(data.perfil);
      const financiacionSinIniciar =
        normalizeMetodoPagoCategoria(data.perfil.metodoPagoCategoria) ===
        "Sin iniciar";
      if (!yaAgendo && text && !faltanFinal.length && !financiacionSinIniciar) {
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

      const clean = stripStructuredData((text || "").trim());
      return { text: clean || null };
    } catch (err) {
      console.error("[botAi] Error generando mensaje:", err);
      return { text: null };
    }
  });

// ===========================================================================
// interpretAnswer: extracción NO bloqueante. Su único rol es extraer datos de
// calificación (método de pago, presupuesto, intención de compra) del mensaje
// del usuario para alimentar actualizar_perfil_lead. Ya NO decide si se repite
// una pregunta ni controla el flujo. Devuelve siempre un objeto seguro.
// Para método de pago e intención de compra devuelve tanto el texto literal
// como la categoría fija (la misma lista que usa la tool y el scoring).
// ===========================================================================
export interface ProfilePatch {
  operacion: string | null;
  metodoPagoTexto: string | null;
  metodoPagoCategoria: string | null;
  presupuesto: number | null;
  intencionCompraTexto: string | null;
  intencionCompraCategoria: string | null;
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
    // Detección determinística de la operación a partir de sinónimos comunes
    // (comprar/compra -> Venta; alquilar/rentar -> Alquiler). Es independiente
    // de la IA: garantiza que "comprar" no se pierda aunque el modelo falle.
    const operacionDet = mapOperacion(data.message);
    const empty: ProfilePatch = {
      operacion: operacionDet,
      metodoPagoTexto: null,
      metodoPagoCategoria: null,
      presupuesto: null,
      intencionCompraTexto: null,
      intencionCompraCategoria: null,
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
            operacion: z.string(),
            metodoPagoTexto: z.string(),
            metodoPagoCategoria: z.string(),
            presupuesto: z.number().optional(),
            presupuestoUSD: z.number().optional(),
            intencionCompraTexto: z.string(),
            intencionCompraCategoria: z.string(),
          }),
        }),
        system:
          "Sos un asistente de una inmobiliaria uruguaya. Extraé del último mensaje del usuario (usando el contexto) SOLO datos de calificación: operación (devolvé \"Venta\" si quiere comprar -comprar, comprarla, compra-, \"Alquiler\" si quiere alquilar -alquilar, rentar, alquilarla-), método de pago y intención de compra (para cada uno devolvé DOS valores: el texto literal que dijo el usuario, y la categoría fija que mejor corresponda) y presupuesto en USD. Para metodoPagoCategoria usá EXACTAMENTE una de: \"Efectivo listo\", \"Crédito hipotecario aprobado\", \"Crédito en trámite\", \"Sin iniciar\". Al contado / tengo la plata / en efectivo = \"Efectivo listo\". Crédito aprobado o preaprobado por el banco = \"Crédito hipotecario aprobado\". \"Crédito en trámite\" SOLO si la persona ya inició gestión activa con el banco y entregó documentación o está en evaluación. Si quiere crédito pero no entregó papeles, no inició trámite con el banco, está averiguando, o no lo definió, devolvé \"Sin iniciar\", nunca \"Crédito en trámite\". Para intencionCompraCategoria usá EXACTAMENTE una de: \"Menos de 3 meses\", \"3 a 6 meses\", \"En el año\", \"Sin definir\" (lo antes posible / ya / necesito mudarme ahora = \"Menos de 3 meses\"). No inventes: si un dato no aparece, devolvé \"NONE\" para los textos y 0 para el presupuesto. Si el usuario no dio método de pago, devolvé categoría \"Sin iniciar\"; si no dio intención, devolvé \"Sin definir\".",
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
      // Solo aceptamos categorías que pertenezcan a la lista fija.
      const cat = (v: unknown, allowed: string[]) => {
        const s = str(v);
        return s && allowed.includes(s) ? s : null;
      };
      const catMetodoPago = (v: unknown) => {
        const s = normalizeMetodoPagoCategoria(str(v) ?? undefined);
        return s &&
          [
            "Efectivo listo",
            "Crédito hipotecario aprobado",
            "Crédito en trámite",
            "Sin iniciar",
          ].includes(s)
          ? s
          : null;
      };
      const presupuestoRaw = output.presupuesto ?? output.presupuestoUSD;
      const num =
        typeof presupuestoRaw === "number" && presupuestoRaw > 0
          ? Math.round(presupuestoRaw)
          : null;

      return {
        operacion: operacionDet ?? str(output.operacion),
        metodoPagoTexto: str(output.metodoPagoTexto),
        metodoPagoCategoria: catMetodoPago(output.metodoPagoCategoria),
        presupuesto: num,
        intencionCompraTexto: str(output.intencionCompraTexto),
        intencionCompraCategoria: cat(output.intencionCompraCategoria, [
          "Menos de 3 meses",
          "3 a 6 meses",
          "En el año",
          "Sin definir",
        ]),
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

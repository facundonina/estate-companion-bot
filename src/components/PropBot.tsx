import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  chatWithBot,
  generateBotMessage,
  interpretAnswer,
  type BotAction,
} from "@/lib/botAi.functions";
import { Building2, Send, Calendar, Bath, BedDouble, Maximize, ArrowRight } from "lucide-react";
import { properties, type Property } from "@/data/properties";
import { formatPrice } from "@/lib/format";
import { propertyImage } from "@/lib/propertyImage";
import { sendLeadRow, sendLeadBeacon, type LeadRow } from "@/lib/leadSheet";
import { computeLeadScore } from "@/lib/leadScoring";
import { isAngryMessage, isAffirmative, isFarewell } from "@/lib/sentiment";
import { mergeStoredLead } from "@/lib/leadStore";
import {
  createCalendarEvent,
  type CalendarSlot,
} from "@/lib/calendar.functions";

export interface BotLead {
  nombre: string;
  telefono: string;
  email: string;
  mensaje?: string;
}

type LeadPatch = {
  operacion?: string;
  metodoPagoTexto?: string;
  metodoPagoCategoria?: string;
  presupuesto?: number;
  intencionCompraTexto?: string;
  intencionCompraCategoria?: string;
};

type QuickReply = { label: string; value: string; patch?: LeadPatch };

// Normaliza texto (minúsculas, sin acentos) para detectar qué está preguntando
// el bot en su mensaje generado.
function botNorm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// A partir del texto que generó el bot, detecta si está haciendo una de las
// preguntas de cierre/financiación/plazo y devuelve botones de respuesta rápida
// (con el patch de perfil correspondiente) para evitar respuestas ambiguas.
function detectQuickReplies(text: string): QuickReply[] | undefined {
  const t = botNorm(text);
  // Pregunta de cierre: ver una opción similar vs coordinar la visita.
  if (t.includes("similar") && (t.includes("visita") || t.includes("coordin"))) {
    return [
      {
        label: "Ver una opción similar",
        value: "Prefiero ver una opción similar antes de decidir",
      },
      { label: "Coordinar la visita", value: "Ya quiero coordinar la visita" },
    ];
  }
  // Pregunta de financiación / método de pago.
  if (
    (t.includes("pag") || t.includes("financ")) &&
    (t.includes("contado") || t.includes("credito") || t.includes("efectivo"))
  ) {
    return [
      {
        label: "Contado",
        value: "Lo pago al contado",
        patch: {
          metodoPagoTexto: "Lo pago al contado",
          metodoPagoCategoria: "Efectivo listo",
        },
      },
      {
        label: "Crédito ya aprobado",
        value: "Con crédito ya aprobado",
        patch: {
          metodoPagoTexto: "Con crédito ya aprobado",
          metodoPagoCategoria: "Crédito hipotecario aprobado",
        },
      },
      {
        label: "Crédito en trámite",
        value: "Con crédito en trámite",
        patch: {
          metodoPagoTexto: "Con crédito en trámite",
          metodoPagoCategoria: "Crédito en trámite",
        },
      },
    ];
  }
  // Pregunta de plazo: ¿para cuándo la necesitás?
  if (
    t.includes("cuando") &&
    (t.includes("necesit") ||
      t.includes("mudar") ||
      t.includes("compr") ||
      t.includes("para"))
  ) {
    return [
      {
        label: "Ya",
        value: "La necesito ya",
        patch: {
          intencionCompraTexto: "La necesito ya",
          intencionCompraCategoria: "Menos de 3 meses",
        },
      },
      {
        label: "En los próximos meses",
        value: "En los próximos meses",
        patch: {
          intencionCompraTexto: "En los próximos meses",
          intencionCompraCategoria: "3 a 6 meses",
        },
      },
      {
        label: "Más adelante",
        value: "Más adelante",
        patch: {
          intencionCompraTexto: "Más adelante",
          intencionCompraCategoria: "En el año",
        },
      },
    ];
  }
  return undefined;
}

type Slot = CalendarSlot;

interface BotMessage {
  id: number;
  role: "bot" | "user";
  text?: string;
  card?: Property;
  cards?: Property[];
  recCards?: Property[];
  agenda?: boolean;
  quickReplies?: QuickReply[];
  cta?: { label: string };
}

function firstName(n: string) {
  return (n || "").split(" ")[0] || "";
}



function scoreProp(p: Property, lead: BotLeadState): number {
  let s = 0;
  if (lead.zona && p.zona.toLowerCase().includes(lead.zona.toLowerCase())) s += 4;
  if (lead.tipo && p.tipo.toLowerCase().includes(lead.tipo.toLowerCase())) s += 3;
  if (lead.dormitorios && p.dormitorios >= lead.dormitorios) s += 2;
  if (lead.presupuesto) {
    const d = Math.abs(p.precio - lead.presupuesto) / lead.presupuesto;
    if (d < 0.15) s += 3;
    else if (d < 0.35) s += 1;
  }
  if (lead.piscina && p.piscina) s += 1;
  if (lead.garage && p.garage) s += 1;
  return s;
}

interface BotLeadState extends BotLead {
  operacion?: string;
  zona?: string;
  tipo?: string;
  dormitorios?: number;
  presupuesto?: number;
  proposito?: string;
  piscina?: boolean;
  garage?: boolean;
  // Método de pago: texto literal del usuario + categoría fija.
  metodoPagoTexto?: string;
  metodoPagoCategoria?: string;
  // Intención de compra / plazo: texto literal del usuario + categoría fija.
  intencionCompraTexto?: string;
  intencionCompraCategoria?: string;
  prioridad?: string;
}

function calcPrioridad(lead: BotLeadState): string {
  const categoria = lead.metodoPagoCategoria || "";
  const intencion = lead.intencionCompraCategoria || "";
  const tieneDinero =
    categoria === "Efectivo listo" ||
    categoria === "Crédito hipotecario aprobado";
  const urgenciaAlta = intencion === "Menos de 3 meses";
  const urgenciaMedia = intencion === "3 a 6 meses";
  if (tieneDinero && urgenciaAlta) return "Alta";
  if (tieneDinero && urgenciaMedia) return "Media";
  if (tieneDinero || urgenciaAlta) return "Media";
  return "Baja";
}

// Construye la fila de la planilla de Leads. El puntaje y la prioridad SIEMPRE
// los calcula el sistema (computeLeadScore) usando exclusivamente las CATEGORÍAS
// fijas. En cambio, las columnas "Intención de compra" y "Método de pago" de la
// planilla reciben el TEXTO LITERAL del usuario, no la categoría.
function buildLeadRow(lead: BotLeadState, prop: Property): LeadRow {
  const intencionTexto =
    lead.intencionCompraTexto || lead.intencionCompraCategoria || "";
  const metodoPagoTexto =
    lead.metodoPagoTexto || lead.metodoPagoCategoria || "";
  const operacion = lead.operacion || prop.operacion;
  const score = computeLeadScore({
    operacion,
    zona: lead.zona,
    tipo: lead.tipo,
    presupuesto: lead.presupuesto,
    intencionCompraCategoria: lead.intencionCompraCategoria,
    metodoPagoCategoria: lead.metodoPagoCategoria,
    propiedadInteresId: prop.id,
    nombre: lead.nombre,
    telefono: lead.telefono,
    email: lead.email,
  });
  return {
    fecha: new Date().toISOString(),
    nombre: lead.nombre ?? "",
    telefono: lead.telefono ?? "",
    email: lead.email ?? "",
    zona: lead.zona ?? "",
    tipo: lead.tipo ?? "",
    presupuesto: typeof lead.presupuesto === "number" ? lead.presupuesto : "",
    intencionCompra: intencionTexto,
    metodoPago: metodoPagoTexto,
    operacion,
    propiedadInteres: `${prop.tipo} en ${prop.barrio}, ${prop.departamento} (#${prop.id})`,
    matchEnCatalogo: score.matchEnCatalogo ? "Sí" : "No",
    puntaje: score.puntaje,
    prioridad: score.prioridad,
  };
}

// Indica si el lead tiene AL MENOS un dato de calificación propio (algo que el
// usuario haya respondido). Si no hay ninguno, es una sesión de prueba o alguien
// que se fue sin avanzar nada: no tiene sentido escribir la fila en la planilla.
function tieneDatosCalificacion(lead: BotLeadState): boolean {
  return Boolean(
    lead.operacion ||
      typeof lead.presupuesto === "number" ||
      lead.intencionCompraTexto ||
      lead.intencionCompraCategoria ||
      lead.metodoPagoTexto ||
      lead.metodoPagoCategoria,
  );
}

function PropertyCardBubble({ p }: { p: Property }) {
  const isLand = p.tipo === "Lote" || p.tipo === "Campo";
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <img
        src={propertyImage(p, 400, 240)}
        alt={`${p.tipo} en ${p.zona}`}
        loading="lazy"
        className="h-24 w-full object-cover"
      />
      <div className="p-2.5">
        <p className="text-xs font-semibold text-foreground">
          {p.tipo} · {p.barrio}, {p.departamento}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-primary">
          {formatPrice(p.precio, p.moneda)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {!isLand && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
              <BedDouble size={10} /> {p.dormitorios} dorm
            </span>
          )}
          {!isLand && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
              <Bath size={10} /> {p.banos} baños
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
            <Maximize size={10} /> {p.superficieTotal} m²
          </span>
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">
            {p.estado}
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {p.descripcion}
        </p>
      </div>
    </div>
  );
}

export function PropBot({
  property,
  lead,
  secondary = false,
}: {
  property: Property;
  lead: BotLead & {
    urgencia?: string;
    financiamiento?: string;
    presupuesto?: number;
    prioridad?: string;
  };
  secondary?: boolean;
}) {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [slotConfirmed, setSlotConfirmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<CalendarSlot[]>([]);

  const leadRef = useRef<BotLeadState>({ ...lead });
  // Propiedad por la que el lead muestra interés en este momento (puede
  // cambiar si elige "Me interesa también" sobre una recomendación).
  const activePropRef = useRef<Property>(property);
  const offeredRecRef = useRef(false);
  // Horario ya confirmado para la reunión.
  const confirmedSlotRef = useRef<Slot | null>(null);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const awaitingHumanRef = useRef(false);
  // En modo "secundario" esperamos que confirme si quiere avanzar también
  // por esta propiedad antes de seguir con el flujo.
  const secondaryConfirmRef = useRef(false);
  // Marca si ya enviamos el lead al Sheet (para no duplicarlo).
  const leadSentRef = useRef(false);
  // El usuario interactuó al menos una vez (mandó un mensaje o eligió horario).
  const interactedRef = useRef(false);
  // Timer de inactividad: registra el lead si pasan varios minutos sin actividad.
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chat = useServerFn(chatWithBot);
  const interpret = useServerFn(interpretAnswer);
  const genMsg = useServerFn(generateBotMessage);

  // Espejo del historial para enviarlo como contexto a la IA sin recrear callbacks.
  const messagesRef = useRef<BotMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const nextId = () => ++idRef.current;

  const addMsg = useCallback((msg: Omit<BotMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: nextId() }]);
  }, []);

  // Devuelve el historial COMPLETO de la conversación (sin recortar), más el
  // mensaje actual del usuario si se pasa. Se envía como contexto a la IA.
  const fullHistory = useCallback(
    (appendUser?: string) => {
      const base = messagesRef.current
        .filter((m) => m.text)
        .map((m) => ({ role: m.role, text: m.text as string }));
      if (appendUser) base.push({ role: "user", text: appendUser });
      return base;
    },
    [],
  );

  // Perfil acumulado del lead (financiación, presupuesto, urgencia, plazo).
  const buildPerfil = useCallback(() => {
    const l = leadRef.current;
    return {
      nombre: l.nombre,
      operacion: l.operacion,
      ubicacion: l.zona,
      tipo: l.tipo,
      urgencia: l.urgencia,
      financiamiento: l.financiamiento,
      presupuesto: l.presupuesto,
      plazoCompra: l.plazoCompra,
    };
  }, []);

  // Pide a Gemini que redacte un mensaje guiado por la app (saludo, opener).
  const phrase = useCallback(
    async (instruction: string, fallback: string): Promise<string> => {
      try {
        const res = await genMsg({ data: { history: fullHistory(), instruction } });
        return (res?.text || "").trim() || fallback;
      } catch (err) {
        console.error("[PropBot] generateBotMessage:", err);
        return fallback;
      }
    },
    [genMsg, fullHistory],
  );

  const botReply = useCallback(
    async (msg: Omit<BotMessage, "id" | "role">, delay = 850) => {
      setTyping(true);
      await new Promise((r) => setTimeout(r, delay));
      setTyping(false);
      addMsg({ ...msg, role: "bot" });
    },
    [addMsg],
  );

  // Igual que botReply, pero el texto lo redacta Gemini a partir de la
  // instrucción (con fallback). Se usa solo para mensajes guiados (opener).
  const botSay = useCallback(
    async (
      instruction: string,
      fallback: string,
      extra: Omit<BotMessage, "id" | "role" | "text"> = {},
      delay = 350,
    ) => {
      setTyping(true);
      const text = await phrase(instruction, fallback);
      await new Promise((r) => setTimeout(r, delay));
      setTyping(false);
      addMsg({ role: "bot", text, ...extra });
    },
    [phrase, addMsg],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  // Recomendaciones locales para sugerir tras confirmar la visita.
  const recommendProps = useCallback((): Property[] => {
    const lead = leadRef.current;
    const pool = properties.filter((x) => x.id !== activePropRef.current.id);
    const tipoOk = (p: Property) => !lead.tipo || p.tipo === lead.tipo;
    const zonaOk = (p: Property) => !lead.zona || p.zona === lead.zona;
    const budgetOk = (p: Property) =>
      !lead.presupuesto || p.precio <= lead.presupuesto * 1.1;
    const sortTop = (arr: Property[]) =>
      [...arr].sort((a, b) => scoreProp(b, lead) - scoreProp(a, lead));

    let filtered = pool.filter((p) => zonaOk(p) && tipoOk(p) && budgetOk(p));
    if (filtered.length < 3) {
      filtered = pool.filter((p) => zonaOk(p) && budgetOk(p));
    }
    return sortTop(filtered).slice(0, 3);
  }, []);

  // Aplica al perfil un patch de calificación y lo persiste (no bloquea).
  const applyPatch = useCallback(
    (patch: {
      operacion?: string;
      financiamiento?: string;
      presupuesto?: number;
      urgencia?: string;
      plazoCompra?: string;
    }) => {
      const l = leadRef.current;
      let changed = false;
      if (patch.operacion) {
        l.operacion = patch.operacion;
        changed = true;
      }
      if (patch.financiamiento) {
        l.financiamiento = patch.financiamiento;
        changed = true;
      }
      if (typeof patch.presupuesto === "number" && patch.presupuesto > 0) {
        l.presupuesto = patch.presupuesto;
        changed = true;
      }
      if (patch.urgencia) {
        l.urgencia = patch.urgencia;
        changed = true;
      }
      if (patch.plazoCompra) {
        l.plazoCompra = patch.plazoCompra;
        changed = true;
      }
      if (changed) {
        l.prioridad = calcPrioridad(l);
        mergeStoredLead({
          urgencia: l.urgencia,
          financiamiento: l.financiamiento,
          presupuesto: l.presupuesto,
          prioridad: l.prioridad,
        });
      }
    },
    [],
  );

  // Registra el lead en la planilla con los datos MÁS ACTUALIZADOS del perfil.
  // Se dispara recién al final de la conversación (reunión confirmada, despedida)
  // o como red de seguridad (inactividad / cierre de pestaña, vía sendBeacon).
  // Guardado con leadSentRef para no duplicar la fila.
  const registerLead = useCallback((opts?: { beacon?: boolean }) => {
    if (leadSentRef.current) return;
    if (!interactedRef.current) return; // no registramos a quien nunca interactuó
    // No ensuciamos la planilla con filas vacías: si el lead no tiene ningún
    // dato de calificación (ni operación, ni presupuesto, ni intención de compra,
    // ni método de pago), es una sesión de prueba o alguien que se fue sin
    // avanzar nada — no aporta nada al vendedor, así que no la escribimos.
    if (!tieneDatosCalificacion(leadRef.current)) return;
    leadSentRef.current = true;
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    const row = buildLeadRow(leadRef.current, activePropRef.current);
    if (opts?.beacon) sendLeadBeacon(row);
    else void sendLeadRow(row);
  }, []);

  // Reinicia el temporizador de inactividad. Si pasan varios minutos sin que el
  // usuario escriba, registramos el lead con sendBeacon (red de seguridad).
  const bumpInactivity = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    const INACTIVITY_MS = 4 * 60 * 1000; // 4 minutos sin actividad
    inactivityTimerRef.current = setTimeout(() => {
      registerLead({ beacon: true });
    }, INACTIVITY_MS);
  }, [registerLead]);

  // Red de seguridad: si la pestaña se cierra o queda oculta, mandamos el lead
  // con navigator.sendBeacon (un fetch normal puede no completarse al cerrar).
  useEffect(() => {
    const onUnload = () => registerLead({ beacon: true });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") registerLead({ beacon: true });
    };
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("pagehide", onUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("pagehide", onUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [registerLead]);

  // completo + el perfil acumulado + la propiedad activa a Gemini, que decide
  // qué herramientas usar. El cliente solo renderiza el texto y las acciones.
  const runBot = useCallback(
    async (userText: string) => {
      // Extracción NO bloqueante en paralelo: alimenta el perfil sin demorar
      // la respuesta (red de seguridad de actualizar_perfil_lead).
      void interpret({ data: { history: fullHistory(), message: userText } })
        .then((patch) => {
          if (!patch) return;
          applyPatch({
            // La operación solo se aplica desde una charla general; si ya hay
            // una propiedad puntual elegida, su operación manda (se fijó al abrir).
            operacion: patch.operacion ?? undefined,
            financiamiento: patch.financiamiento ?? undefined,
            presupuesto: patch.presupuesto ?? undefined,
            urgencia: patch.urgencia ?? undefined,
            plazoCompra: patch.plazoCompra ?? undefined,
          });
        })
        .catch(() => {});


      setTyping(true);
      let result: { text: string | null; actions: BotAction[] } | null = null;
      try {
        result = await chat({
          data: {
            history: fullHistory(userText),
            perfil: buildPerfil(),
            propertyId: activePropRef.current.id,
          },
        });
      } catch (err) {
        console.error("[PropBot] chatWithBot:", err);
      }

      const extra: Omit<BotMessage, "id" | "role" | "text"> = {};

      for (const a of result?.actions ?? []) {
        if (a.type === "actualizar_perfil_lead") {
          applyPatch(a.patch);
        } else if (a.type === "buscar_propiedades") {
          const cards = a.ids
            .map((id) => properties.find((p) => p.id === id))
            .filter((p): p is Property => Boolean(p));
          if (cards.length) extra.recCards = cards;
        } else if (a.type === "obtener_detalle_propiedad") {
          const p = properties.find((x) => x.id === a.id);
          if (p && p.id !== activePropRef.current.id) extra.card = p;
        } else if (a.type === "agendar_reunion") {
          if (a.slots.length) {
            setAvailableSlots(a.slots);
            extra.agenda = true;
          }
        }
      }

      // El lead NO se registra acá: se registra recién al final de la
      // conversación (reunión confirmada o despedida) o como red de seguridad
      // (inactividad / cierre de pestaña), para mandar siempre los datos más
      // actualizados del perfil.


      const text =
        (result?.text || "").trim() ||
        "Perdón, no te entendí bien. ¿Me lo contás de nuevo?";

      // Si el bot está haciendo la pregunta de financiación, plazo o la de
      // cierre (ver opción similar / coordinar visita), ofrecemos botones de
      // respuesta rápida para evitar respuestas cortas y ambiguas.
      if (!extra.quickReplies) {
        const qr = detectQuickReplies(text);
        if (qr) extra.quickReplies = qr;
      }

      await new Promise((r) => setTimeout(r, 300));
      setTyping(false);
      addMsg({ role: "bot", text, ...extra });

    },
    [chat, interpret, fullHistory, buildPerfil, applyPatch, addMsg],
  );

  // Kick off the conversation once.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const propDesc = `${property.tipo} en ${property.barrio}, ${property.departamento} (${formatPrice(property.precio, property.moneda)})`;
      leadRef.current.zona = property.zona;
      leadRef.current.tipo = property.tipo;
      // El usuario llegó a través de una propiedad puntual: la operación es la
      // de esa propiedad (Venta o Alquiler). La completamos automáticamente y
      // NO se la preguntamos.
      leadRef.current.operacion = property.operacion;

      // Modo secundario: el usuario ya dejó sus datos y eligió ver otra
      // propiedad recomendada. No le pedimos el formulario de nuevo.
      if (secondary) {
        await botSay(
          `Saludá a ${firstName(lead.nombre)} por su nombre, de forma cálida y como si ya se conocieran. Decile que viste que también se interesó en esta propiedad: ${propDesc}. Preguntale con entusiasmo si le gustaría avanzar por esta propiedad también. La tarjeta se muestra debajo de tu mensaje; no le pidas sus datos porque ya los tenés.`,
          `¡Hola de nuevo, ${firstName(lead.nombre)}! Vimos que también te interesó esta propiedad. ¿Te gustaría avanzar por esta propiedad también?`,
          {
            card: property,
            quickReplies: [
              { label: "Sí, me interesa", value: "Sí, me interesa esta propiedad" },
              { label: "No, gracias", value: "No, gracias" },
            ],
          },
          650,
        );
        secondaryConfirmRef.current = true;
        return;
      }

      await botSay(
        `Sos vos, el asesor inmobiliario, quien escribe este mensaje (no el usuario). Saludá a ${firstName(lead.nombre)} por su nombre, presentate en una frase como asesor y mencioná brevemente que se interesó en esta propiedad: ${propDesc}. NO le preguntes si busca comprar o alquilar: ya sabemos que esta propiedad es en ${property.operacion}. Cerrá preguntándole de forma cálida y breve si le interesa avanzar con esta propiedad o si tiene alguna duda primero. La tarjeta de la propiedad se muestra debajo de tu mensaje, no la repitas en texto.`,
        `¡Hola ${firstName(lead.nombre)}! Soy tu asesor para esta propiedad. ¿Te interesa avanzar con esta propiedad o tenés alguna duda primero?`,
        {
          card: property,
          quickReplies: [
            { label: "Me interesa", value: "Me interesa esta propiedad" },
            { label: "Tengo una duda", value: "Tengo una duda" },
          ],
        },
        650,
      );


    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || typing) return;
      addMsg({ role: "user", text });
      setInput("");
      // El usuario interactuó: habilita el registro y reinicia el temporizador
      // de inactividad (red de seguridad).
      interactedRef.current = true;
      bumpInactivity();

      // Despedida explícita: cerramos la conversación y registramos el lead con
      // los datos más actualizados.
      if (isFarewell(text)) {
        await botReply(
          {
            text: "¡Gracias por tu tiempo! Cualquier cosa estoy por acá. ¡Que andes bien! 👋",
          },
          600,
        );
        registerLead();
        setDone(true);
        return;
      }


      // Modo secundario: confirmación de avanzar por esta propiedad.
      if (secondaryConfirmRef.current) {
        secondaryConfirmRef.current = false;
        if (!isAffirmative(text)) {
          await botReply(
            {
              text: "¡Sin problema! Cualquier cosa que necesites, estoy por acá. 😊",
            },
            600,
          );
          setDone(true);
          return;
        }
        await runBot(text);
        return;
      }

      // ¿Estábamos esperando que confirme si quiere hablar con un humano?
      if (awaitingHumanRef.current) {
        awaitingHumanRef.current = false;
        if (isAffirmative(text)) {
          await botReply(
            {
              text: "Listo, le aviso a un asesor de nuestro equipo para que se comunique con vos a la brevedad. ¡Gracias por tu paciencia! 🙌",
            },
            700,
          );
          return;
        }
        await botReply(
          {
            text: "¡Dale, seguimos por acá! 😊 Contame, ¿en qué te puedo ayudar?",
          },
          600,
        );
        return;
      }

      // Detectar enojo / insultos y ofrecer ayuda humana.
      if (isAngryMessage(text)) {
        awaitingHumanRef.current = true;
        await botReply(
          {
            text: "Tranquilo, te noto un poco frustrado 😟. ¿Querés que te ponga en contacto con un humano de nuestro equipo?",
            quickReplies: [
              { label: "Sí, hablar con un humano", value: "Sí" },
              { label: "No, seguir acá", value: "No" },
            ],
          },
          600,
        );
        return;
      }

      if (done) {
        await botReply(
          {
            text: `Perfecto, un asesor se va a contactar con vos a la brevedad al ${leadRef.current.telefono || leadRef.current.email}. ¡Gracias!`,
          },
          700,
        );
        return;
      }

      // Conversación libre: la maneja Gemini con function calling.
      await runBot(text);
    },
    [addMsg, botReply, done, runBot, typing, bumpInactivity, registerLead],
  );

  // Click en un botón de respuesta rápida: si el botón trae un patch de perfil
  // (financiación/plazo), lo aplicamos directo para no depender de interpretar
  // texto libre, y mandamos el valor como mensaje del usuario.
  const handleQuickReply = useCallback(
    (qr: QuickReply) => {
      if (qr.patch) applyPatch(qr.patch);
      void handleSend(qr.value);
    },
    [applyPatch, handleSend],
  );



  const confirmSlot = useCallback(async () => {
    if (!selectedSlot || slotConfirmed || confirming) return;
    const activeProp = activePropRef.current;
    setConfirming(true);
    interactedRef.current = true;
    addMsg({
      role: "user",
      text: `Confirmo la visita para el ${selectedSlot.label} a las ${selectedSlot.time}`,
    });
    try {
      await createCalendarEvent({
        data: {
          startISO: selectedSlot.startISO,
          endISO: selectedSlot.endISO,
          cliente: leadRef.current.nombre || "Cliente",
          zona: leadRef.current.zona,
          tipo: leadRef.current.tipo,
          propiedad: `${activeProp.tipo} en ${activeProp.barrio}, ${activeProp.departamento}`,
          email: leadRef.current.email,
        },
      });
      setSlotConfirmed(true);
      confirmedSlotRef.current = selectedSlot;
      await botSay(
        `Confirmá con entusiasmo que la visita quedó agendada para el ${selectedSlot.label} a las ${selectedSlot.time}, y avisá que recibirá la confirmación por email${
          leadRef.current.email ? ` a ${leadRef.current.email}` : ""
        }. Despedite cálidamente.`,
        `¡Listo! Tu visita quedó confirmada para el ${selectedSlot.label} a las ${selectedSlot.time}. Vas a recibir la confirmación por email${
          leadRef.current.email ? ` a ${leadRef.current.email}` : ""
        }. ¡Hasta pronto!`,
        {},
        500,
      );
      setDone(true);
      // Reunión confirmada: registramos el lead con los datos más actualizados.
      registerLead();



      // Una sola vez: ofrecemos otras propiedades que también podrían
      // interesarle.
      if (!offeredRecRef.current) {
        offeredRecRef.current = true;
        const cards = recommendProps();
        if (cards.length > 0) {
          await new Promise((r) => setTimeout(r, 600));
          await botSay(
            "Comentale que además tenés estas otras propiedades que también podrían interesarle (se muestran como tarjetas debajo). Invitalo a tocar 'Ver' en la que le guste para conocerla.",
            "Además, tengo estas otras propiedades que también podrían interesarte. Tocá “Ver” en la que te guste para conocerla 👇",
            { recCards: cards },
          );
        }
      }
    } catch (err) {
      console.error("[calendar] No se pudo crear el evento:", err);
      setConfirming(false);
      await botReply(
        {
          text: "Tuve un problema al confirmar la visita. Probá con otro horario o un asesor se va a contactar con vos para coordinarla.",
        },
        700,
      );
    }
  }, [addMsg, botReply, botSay, confirming, recommendProps, selectedSlot, slotConfirmed, registerLead]);

  return (
    <div className="flex h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {/* Header */}
      <div className="flex items-center gap-2.5 bg-primary px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
          <Building2 size={18} className="text-primary-foreground" />
        </span>
        <div>
          <p className="text-sm font-semibold text-primary-foreground">PropBot</p>
          <p className="text-[11px] text-primary-foreground/70">
            Asistente inmobiliario · Activo ahora
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
        {messages.map((m) => (
          <div key={m.id} className={`flex items-end gap-1.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            {m.role === "bot" && (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
                <Building2 size={12} className="text-primary-foreground" />
              </span>
            )}
            <div className={`flex max-w-[84%] flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
              {m.text && (
                <div
                  className={`whitespace-pre-line rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                    m.role === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-secondary text-secondary-foreground"
                  }`}
                >
                  {m.text}
                </div>
              )}
              {m.card && (
                <div className="w-full max-w-[260px]">
                  <PropertyCardBubble p={m.card} />
                </div>
              )}
              {m.cards && (
                <div className="flex w-full max-w-[260px] flex-col gap-2">
                  {m.cards.map((c) => (
                    <PropertyCardBubble key={c.id} p={c} />
                  ))}
                </div>
              )}
              {m.recCards && (
                <div className="flex w-full max-w-[260px] flex-col gap-3">
                  {m.recCards.map((c) => (
                    <div key={c.id} className="flex flex-col gap-1.5">
                      <PropertyCardBubble p={c} />
                      <Link
                        to="/propiedades/$id"
                        params={{ id: String(c.id) }}
                        className="block w-full rounded-full bg-primary px-3 py-1.5 text-center text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        Ver
                      </Link>
                    </div>

                  ))}
                </div>
              )}
              {m.cta && (
                <Link
                  to="/propiedades"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {m.cta.label} <ArrowRight size={14} />
                </Link>
              )}
              {m.agenda && (
                <div className="w-full max-w-[280px] rounded-xl border border-border bg-card p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    <Calendar size={15} className="text-primary" /> Elegí un horario
                  </p>
                  <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto">
                    {availableSlots.map((s) => {
                      const active = selectedSlot?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={slotConfirmed || confirming}
                          onClick={() => setSelectedSlot(s)}
                          className={`rounded-md border px-2 py-1.5 text-center text-[12px] transition-colors disabled:cursor-not-allowed ${
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-secondary text-foreground hover:border-primary/40"
                          }`}
                        >
                          <span className="block font-medium">{s.label}</span>
                          <span className="block text-[11px] opacity-80">{s.time}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    disabled={!selectedSlot || slotConfirmed || confirming}
                    onClick={confirmSlot}
                    className="mt-2 w-full rounded-md bg-primary py-2 text-[13px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
                  >
                    {slotConfirmed
                      ? "Visita confirmada"
                      : confirming
                        ? "Confirmando..."
                        : "Confirmar visita"}
                  </button>
                </div>
              )}
              {m.quickReplies && !typing && m === messages[messages.length - 1] && (
                <div className="flex flex-wrap gap-1.5">
                  {m.quickReplies.map((qr) => (
                    <button
                      key={qr.value}
                      type="button"
                      onClick={() => handleQuickReply(qr)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      {qr.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex items-end gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
              <Building2 size={12} className="text-primary-foreground" />
            </span>
            <div className="flex gap-1 rounded-xl rounded-bl-sm bg-secondary px-3 py-3">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      {slotConfirmed ? (
        <div className="border-t border-border p-3.5 text-center">
          <p className="text-[13px] font-medium text-foreground">
            ✅ Visita confirmada
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Esta conversación quedó cerrada. ¡Nos vemos en la visita!
          </p>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="flex items-center gap-2 border-t border-border p-2.5"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí tu mensaje..."
            className="flex-1 rounded-full border border-border bg-secondary px-3.5 py-2 text-[13px] text-foreground outline-none focus:border-primary"
          />
          <button
            type="submit"
            aria-label="Enviar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Send size={15} />
          </button>
        </form>
      )}
    </div>
  );
}

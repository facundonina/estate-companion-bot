import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { extractFields, generateBotMessage } from "@/lib/botAi.functions";
import { Building2, Send, Calendar, Bath, BedDouble, Maximize, ArrowRight } from "lucide-react";
import { properties, type Property } from "@/data/properties";
import { formatPrice } from "@/lib/format";
import { propertyImage } from "@/lib/propertyImage";
import { sendLeadToSheet } from "@/lib/leadSheet";
import { parseBudget } from "@/lib/parseBudget";
import { isAngryMessage, isAffirmative } from "@/lib/sentiment";
import { setStoredLead, mergeStoredLead } from "@/lib/leadStore";
import {
  getAvailableSlots,
  createCalendarEvent,
  type CalendarSlot,
} from "@/lib/calendar.functions";

export interface BotLead {
  nombre: string;
  telefono: string;
  email: string;
  mensaje?: string;
}

type QuickReply = { label: string; value: string };

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

// Opciones válidas para cada pregunta de calificación. Si el usuario
// responde algo que no corresponde, le pedimos que lo intente de nuevo.
const URGENCIA_OPCIONES = [
  "Menos de 3 meses",
  "3 a 6 meses",
  "En el año",
  "Estoy explorando",
];
const FINANCIAMIENTO_OPCIONES = [
  "Efectivo listo",
  "Crédito hipotecario aprobado",
  "Crédito en trámite",
  "No lo definí todavía",
];

// Normaliza texto: minúsculas y sin acentos, para comparar intención.
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Palabras clave que mapean texto libre del usuario a cada opción de urgencia.
const URGENCIA_KEYWORDS: Record<string, string[]> = {
  "Menos de 3 meses": [
    "ya",
    "cuanto antes",
    "inmediato",
    "inmediata",
    "este mes",
    "lo antes posible",
    "urgente",
    "ahora",
    "proximos dias",
    "en breve",
    "enseguida",
    "pronto",
    "1 mes",
    "un mes",
    "2 meses",
    "dos meses",
    "3 meses",
    "tres meses",
    "uno a tres",
    "1 a 3",
    "corto plazo",
  ],
  "3 a 6 meses": [
    "4 meses",
    "cuatro meses",
    "5 meses",
    "cinco meses",
    "6 meses",
    "seis meses",
    "medio ano",
    "3 a 6",
    "tres a seis",
  ],
  "En el año": [
    "este ano",
    "en el ano",
    "dentro del ano",
    "fin de ano",
    "un ano",
    "1 ano",
    "12 meses",
    "doce meses",
  ],
  "Estoy explorando": [
    "explorando",
    "mirando",
    "viendo",
    "no tengo apuro",
    "sin apuro",
    "largo plazo",
    "mas adelante",
    "evaluando",
    "evaluando opciones",
    "estoy evaluando",
    "todavia no",
    "no decidi",
    "no me decidi",
  ],
};

// Palabras clave que mapean texto libre a cada opción de financiamiento.
const FINANCIAMIENTO_KEYWORDS: Record<string, string[]> = {
  "Efectivo listo": [
    "contado",
    "al contado",
    "efectivo",
    "cash",
    "ahorro",
    "ahorros",
    "fondos propios",
    "dinero propio",
    "plata propia",
    "capital propio",
    "pago total",
    "pago completo",
    "pago de una",
    "tengo el dinero",
    "dispongo del dinero",
    "sin financiacion",
    "sin credito",
  ],
  "Crédito hipotecario aprobado": [
    "credito aprobado",
    "aprobado",
    "hipoteca aprobada",
    "prestamo aprobado",
    "credito otorgado",
    "ya tengo el credito",
    "tengo el credito",
  ],
  "Crédito en trámite": [
    "credito hipotecario",
    "credito",
    "prestamo hipotecario",
    "prestamo del banco",
    "prestamo",
    "hipoteca",
    "banco",
    "financiacion bancaria",
    "financiamiento",
    "financiar",
    "voy a financiar",
    "en tramite",
    "tramite",
    "tramitando",
    "gestionando",
  ],
  "No lo definí todavía": [
    "no se",
    "no lo se",
    "no defini",
    "no decidi",
    "todavia no",
    "no estoy seguro",
    "no sabria",
    "ver opciones",
  ],
};

// Dado un texto libre, lo asigna a la opción correspondiente según su
// intención. Primero busca coincidencia exacta con una opción, luego por
// palabras clave (respetando el orden de prioridad de las opciones).
function matchOption(
  raw: string,
  options: string[],
  keywords: Record<string, string[]>,
): string | null {
  const t = norm(raw);
  for (const o of options) if (norm(o) === t) return o;
  for (const o of options) {
    for (const kw of keywords[o] || []) {
      if (t.includes(norm(kw))) return o;
    }
  }
  return null;
}

const matchUrgencia = (raw: string) =>
  matchOption(raw, URGENCIA_OPCIONES, URGENCIA_KEYWORDS);
const matchFinanciamiento = (raw: string) =>
  matchOption(raw, FINANCIAMIENTO_OPCIONES, FINANCIAMIENTO_KEYWORDS);

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
  zona?: string;
  tipo?: string;
  dormitorios?: number;
  presupuesto?: number;
  proposito?: string;
  piscina?: boolean;
  garage?: boolean;
  urgencia?: string;
  financiamiento?: string;
  prioridad?: string;
}

function calcPrioridad(lead: BotLeadState): string {
  const financiamiento = lead.financiamiento || "";
  const urgencia = lead.urgencia || "";
  const tieneDinero =
    financiamiento === "Efectivo listo" ||
    financiamiento === "Crédito hipotecario aprobado";
  const urgenciaAlta = urgencia === "Menos de 3 meses";
  const urgenciaMedia = urgencia === "3 a 6 meses";
  if (tieneDinero && urgenciaAlta) return "Alta";
  if (tieneDinero && urgenciaMedia) return "Media";
  if (tieneDinero || urgenciaAlta) return "Media";
  return "Baja";
}




// Evalúa si el lead realmente califica para ESTA propiedad puntual.
// Devuelve los motivos por los que NO calificaría (vacío = califica).
function qualifyForProperty(
  p: Property,
  lead: BotLeadState,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  // Estado de obra vs. urgencia de mudanza.
  const enObra = p.estado === "En construcción" || p.estado === "En pozo";
  if (enObra && lead.urgencia === "Menos de 3 meses") {
    reasons.push(
      `esta propiedad está en estado "${p.estado}", así que no estaría lista para mudarte en menos de 3 meses`,
    );
  }

  // Presupuesto vs. precio: no puede ser menor al 60% del valor.
  if (lead.presupuesto && lead.presupuesto < p.precio * 0.6) {
    reasons.push(
      `tu presupuesto queda bastante por debajo del precio de esta propiedad (${formatPrice(
        p.precio,
        p.moneda,
      )})`,
    );
  }

  return { ok: reasons.length === 0, reasons };
}

// Construye el payload para Google Sheets incluyendo la propiedad puntual
// que está consultando el lead, para que el vendedor sepa por cuál se interesó.
function leadPayload(lead: BotLeadState, prop: Property) {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  return {
    nombre: lead.nombre,
    telefono: lead.telefono,
    email: lead.email,
    mensaje: lead.mensaje,
    zona: lead.zona,
    tipo: lead.tipo,
    dormitorios: lead.dormitorios,
    presupuesto: lead.presupuesto,
    proposito: lead.proposito,
    urgencia: lead.urgencia,
    financiamiento: lead.financiamiento,
    prioridad: lead.prioridad,
    propiedad: `${prop.tipo} en ${prop.barrio}, ${prop.departamento}`,
    propiedadId: prop.id,
    propiedadLink: `${origin}/propiedades/${prop.id}`,
  };
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
  const [notQualified, setNotQualified] = useState(false);

  const leadRef = useRef<BotLeadState>({ ...lead });
  const stepRef = useRef(0);
  // Propiedad por la que el lead muestra interés en este momento (puede
  // cambiar si elige "Me interesa también" sobre una recomendación).
  const activePropRef = useRef<Property>(property);
  const offeredRecRef = useRef(false);
  // Horario ya confirmado para la reunión. Si el lead suma otra propiedad
  // con "Me interesa también", la coordinamos en este mismo horario.
  const confirmedSlotRef = useRef<Slot | null>(null);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const awaitingHumanRef = useRef(false);
  // En modo "secundario" esperamos que confirme si quiere avanzar también
  // por esta propiedad antes de seguir con el flujo.
  const secondaryConfirmRef = useRef(false);
  // Último campo que el bot le pidió al usuario (para detectar respuestas
  // que no aportan el dato esperado y pedir una aclaración).
  const lastAskedRef = useRef<"urgencia" | "financiamiento" | "presupuesto" | null>(
    null,
  );

  const extract = useServerFn(extractFields);
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

  // Pide a Gemini que redacte el próximo mensaje del bot según una instrucción
  // interna. Si la IA falla o no está disponible, usa el texto de respaldo.
  const phrase = useCallback(
    async (instruction: string, fallback: string): Promise<string> => {
      try {
        const history = messagesRef.current
          .filter((m) => m.text)
          .slice(-12)
          .map((m) => ({ role: m.role, text: m.text as string }));
        const res = await genMsg({ data: { history, instruction } });
        return (res?.text || "").trim() || fallback;
      } catch (err) {
        console.error("[PropBot] generateBotMessage:", err);
        return fallback;
      }
    },
    [genMsg],
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
  // instrucción (con fallback). Mantiene el indicador de "escribiendo".
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

  // Consulta Google Calendar y muestra los horarios disponibles como agenda.
  // El texto introductorio lo redacta Gemini (con fallback).
  const presentAgenda = useCallback(
    async (instruction: string, fallback: string) => {
      setTyping(true);
      try {
        const slots = await getAvailableSlots();
        setAvailableSlots(slots);
        if (slots.length === 0) {
          await botReply(
            {
              text: "Por ahora no tengo horarios disponibles en los próximos días. Un asesor se va a contactar con vos para coordinar la visita. ¡Gracias!",
            },
            800,
          );
          setDone(true);
        } else {
          const text = await phrase(instruction, fallback);
          await new Promise((r) => setTimeout(r, 300));
          setTyping(false);
          addMsg({ role: "bot", text, agenda: true });
        }
      } catch (err) {
        console.error("[calendar] No se pudieron obtener los horarios:", err);
        await botReply(
          {
            text: "Tuve un problema al consultar la agenda. Un asesor se va a contactar con vos para coordinar la visita. ¡Gracias!",
          },
          800,
        );
        setDone(true);
      }
    },
    [botReply, phrase, addMsg],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  const recommendProps = useCallback((): { cards: Property[]; expanded: boolean } => {
    const lead = leadRef.current;
    const pool = properties.filter((x) => x.id !== activePropRef.current.id);

    const tipoOk = (p: Property) => !lead.tipo || p.tipo === lead.tipo;
    // Solo recomendamos en la MISMA zona que está consultando el lead.
    const zonaOk = (p: Property) => !lead.zona || p.zona === lead.zona;
    // El precio no puede superar el presupuesto del usuario (con un margen
    // chico del 10%). Nunca recomendamos propiedades fuera de su alcance.
    const budgetOk = (p: Property) =>
      !lead.presupuesto || p.precio <= lead.presupuesto * 1.1;
    const sortTop = (arr: Property[]) =>
      [...arr].sort((a, b) => scoreProp(b, lead) - scoreProp(a, lead));

    // Paso 1: misma zona + filtros duros (tipo + presupuesto).
    let filtered = pool.filter(
      (p) => zonaOk(p) && tipoOk(p) && budgetOk(p),
    );

    // Paso 2: si hay menos de 3, relajar el tipo pero SIEMPRE respetando la
    // misma zona y el presupuesto. Nunca cambiamos de zona ni recomendamos
    // fuera del alcance del lead.
    if (filtered.length < 3) {
      filtered = pool.filter((p) => zonaOk(p) && budgetOk(p));
    }

    return { cards: sortTop(filtered).slice(0, 3), expanded: false };
  }, []);

  // Con urgencia, financiamiento y presupuesto ya conocidos, evalúa si el lead
  // califica para la propiedad activa: si sí, entrega el lead y abre la agenda;
  // si no, deriva a otras opciones. Persiste la calificación para reutilizarla
  // en próximos chats de esta sesión.
  const finalizeQualification = useCallback(async () => {
    const lead = leadRef.current;
    lastAskedRef.current = null;
    lead.prioridad = calcPrioridad(lead);
    mergeStoredLead({
      urgencia: lead.urgencia,
      financiamiento: lead.financiamiento,
      presupuesto: lead.presupuesto,
      prioridad: lead.prioridad,
    });

    const { ok, reasons } = qualifyForProperty(activePropRef.current, lead);

    // No califica para esta propiedad: NO entregamos el lead.
    // Lo derivamos a ver opciones que sí encajan.
    if (!ok) {
      const { cards } = recommendProps();
      await botSay(
        `Agradecele que te contó sus datos. Con tacto y sin mencionar ninguna calificación interna, explicale que esta propiedad puntual no sería la mejor opción para él/ella por estos motivos: ${reasons.join(
          " y ",
        )}.`,
        `Gracias por contarme. Mirando lo que necesitás, ${reasons.join(
          " y ",
        )}. Por eso esta propiedad no sería la mejor opción para vos.`,
        {},
        500,
      );
      if (cards.length > 0) {
        await new Promise((r) => setTimeout(r, 400));
        await botSay(
          "Presentale, con entusiasmo, estas otras opciones que sí encajan con su presupuesto y preferencias (se muestran como tarjetas debajo). Invitalo a tocar el botón 'Ver' para conocer la que le guste.",
          "Con tus preferencias, estas opciones sí encajan mejor. Tocá “Ver” en la que te interese para conocerla:",
          { recCards: cards },
        );
      } else {
        await new Promise((r) => setTimeout(r, 400));
        await botSay(
          lead.zona
            ? `Explicale que por ahora en ${lead.zona} no tenés propiedades que se ajusten a su presupuesto, e invitalo a recorrer el catálogo completo por si encuentra algo que le guste. Debajo de tu mensaje hay un botón para verlo.`
            : "Explicale que por ahora no tenés propiedades que se ajusten a su presupuesto y a lo que busca, e invitalo a recorrer el catálogo completo. Debajo de tu mensaje hay un botón para verlo.",
          lead.zona
            ? `Por ahora en ${lead.zona} no tenemos propiedades que se ajusten a tu presupuesto. De todos modos, te invito a recorrer todo nuestro catálogo por si encontrás algo que te guste 👇`
            : "Por ahora no tenemos propiedades que se ajusten a tu presupuesto y a lo que estás buscando. De todos modos, te invito a recorrer todo nuestro catálogo por si encontrás algo que te guste 👇",
          { cta: { label: "Ver propiedades disponibles" } },
        );
      }
      setNotQualified(true);
      return;
    }

    // Califica: entregamos el lead y coordinamos la visita.
    void sendLeadToSheet(leadPayload(lead, activePropRef.current));
    stepRef.current = 4;
    await presentAgenda(
      "El usuario calificó. Agradecele y proponele coordinar una visita presencial para conocer la propiedad. Pedile que elija uno de los horarios disponibles (se muestran como botones debajo).",
      "¡Gracias! Podemos coordinar una visita para que la conozcas en persona. Elegí uno de los horarios disponibles:",
    );
  }, [botSay, presentAgenda, recommendProps]);


  // Kick off the conversation once.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      const propDesc = `${property.tipo} en ${property.barrio}, ${property.departamento} (${formatPrice(property.precio, property.moneda)})`;
      leadRef.current.zona = property.zona;
      leadRef.current.tipo = property.tipo;

      // Modo secundario: el usuario ya dejó sus datos y eligió ver otra
      // propiedad recomendada. No le pedimos el formulario de nuevo: abrimos
      // un chat con sus datos y le preguntamos si quiere avanzar por esta.
      if (secondary) {
        await botSay(
          `Saludá a ${firstName(lead.nombre)} por su nombre, de forma cálida y como si ya se conocieran. Decile que viste que también se interesó en esta propiedad: ${propDesc}. Preguntale con entusiasmo si le gustaría avanzar por esta propiedad también. La tarjeta se muestra debajo de tu mensaje; no le pidas sus datos porque ya los tenés.`,
          `¡Hola de nuevo, ${firstName(lead.nombre)}! Vimos que también te interesó esta propiedad. ¿Te gustaría avanzar por esta propiedad también?`,
          {
            card: property,
            quickReplies: [
              { label: "Sí, me interesa", value: "Sí" },
              { label: "No, gracias", value: "No" },
            ],
          },
          650,
        );
        secondaryConfirmRef.current = true;
        return;
      }

      await botSay(
        `Saludá a ${firstName(lead.nombre)} por su nombre y, con entusiasmo, contale que viste que se interesó en esta propiedad: ${propDesc}. Presentate brevemente como PropBot. No hagas preguntas todavía: la tarjeta de la propiedad se muestra debajo de tu mensaje.`,
        `¡Hola ${firstName(lead.nombre)}! Vi que te interesaste en esta propiedad:`,
        { card: property },
        650,
      );
      await new Promise((r) => setTimeout(r, 300));
      await botSay(
        "Decile que, antes de coordinar la visita, te gustaría conocer un par de cosas para asegurarte de que sea la mejor opción para él/ella. Después hacé UNA sola pregunta: con qué urgencia o para cuándo necesita concretar la compra.",
        "Genial. Antes de coordinar la visita, me gustaría conocer un par de cosas para asegurarme de que sea la mejor opción para vos. ¿Cuándo necesitás concretar la compra?",
        {
          quickReplies: [
            { label: "Menos de 3 meses", value: "Menos de 3 meses" },
            { label: "3 a 6 meses", value: "3 a 6 meses" },
            { label: "En el año", value: "En el año" },
            { label: "Estoy explorando", value: "Estoy explorando" },
          ],
        },
      );
      stepRef.current = 2;
      lastAskedRef.current = "urgencia";
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || typing) return;
      addMsg({ role: "user", text });
      setInput("");

      // Modo secundario: esperábamos que confirme si quiere avanzar también
      // por esta propiedad. Ya tenemos sus datos, así que no pedimos formulario.
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
        const lead = leadRef.current;
        // Si en un chat anterior ya nos dio su calificación, vamos directo a
        // evaluar y coordinar la visita. Si no, arrancamos las preguntas.
        if (lead.urgencia && lead.financiamiento && lead.presupuesto) {
          await finalizeQualification();
          return;
        }
        stepRef.current = 2;
        lastAskedRef.current = "urgencia";
        await botSay(
          "El usuario quiere avanzar por esta propiedad. Decile que para asegurarte de que sea la mejor opción para él/ella querés conocer un par de cosas, y hacé UNA sola pregunta: con qué urgencia o para cuándo necesita concretar la compra (las opciones aparecen como botones debajo).",
          "¡Buenísimo! Para asegurarme de que sea la mejor opción para vos, ¿cuándo necesitás concretar la compra?",
          {
            quickReplies: URGENCIA_OPCIONES.map((o) => ({
              label: o,
              value: o,
            })),
          },
        );
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
            text: "¡Dale, seguimos por acá! 😊 Cuando quieras, respondé la última pregunta para continuar.",
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

      const lead = leadRef.current;

      // Fase de recolección de datos de calificación (urgencia, financiamiento
      // y presupuesto). La IA interpreta TODO el mensaje del usuario y extrae,
      // de una sola vez, los datos que todavía falten.
      if (
        stepRef.current === 2 ||
        stepRef.current === 3 ||
        stepRef.current === 5
      ) {
        const fields: Array<{
          name: string;
          kind: "option" | "number" | "budget";
          description: string;
          options?: string[];
        }> = [];
        if (!lead.urgencia)
          fields.push({
            name: "urgencia",
            kind: "option",
            description:
              "Con qué urgencia o para cuándo necesita concretar la compra.",
            options: URGENCIA_OPCIONES,
          });
        if (!lead.financiamiento)
          fields.push({
            name: "financiamiento",
            kind: "option",
            description: "Cómo piensa financiar la compra.",
            options: FINANCIAMIENTO_OPCIONES,
          });
        if (!lead.presupuesto)
          fields.push({
            name: "presupuesto",
            kind: "budget",
            description: "Presupuesto aproximado en dólares para esta compra.",
          });

        setTyping(true);
        try {
          const history = messagesRef.current
            .filter((m) => m.text)
            .slice(-12)
            .map((m) => ({ role: m.role, text: m.text as string }));
          const res = await extract({
            data: { history, message: text, fields },
          });
          const v = res?.values ?? {};
          if (typeof v.urgencia === "string") lead.urgencia = v.urgencia;
          if (typeof v.financiamiento === "string")
            lead.financiamiento = v.financiamiento;
          if (typeof v.presupuesto === "number" && v.presupuesto > 0)
            lead.presupuesto = v.presupuesto;
        } catch (err) {
          console.error("[PropBot] extract:", err);
        }
        setTyping(false);

        // Respaldo local SOLO para el dato que se acaba de pedir, por si la IA
        // no está disponible o no lo detectó.
        const expected = lastAskedRef.current;
        if (!lead.urgencia && expected === "urgencia") {
          const u = matchUrgencia(text);
          if (u) lead.urgencia = u;
        }
        if (!lead.financiamiento && expected === "financiamiento") {
          const f = matchFinanciamiento(text);
          if (f) lead.financiamiento = f;
        }
        if (!lead.presupuesto && expected === "presupuesto") {
          const b = parseBudget(text);
          if (b) lead.presupuesto = b;
        }

        const stillMissingExpected =
          (expected === "urgencia" && !lead.urgencia) ||
          (expected === "financiamiento" && !lead.financiamiento) ||
          (expected === "presupuesto" && !lead.presupuesto);

        // Próxima pregunta según el primer dato que falte.
        if (!lead.urgencia) {
          stepRef.current = 2;
          lastAskedRef.current = "urgencia";
          await botSay(
            stillMissingExpected
              ? "No entendiste la respuesta del usuario sobre la urgencia. Pedile con amabilidad que te aclare para cuándo necesita concretar la compra, dándole ejemplos como 'lo antes posible', 'en unos meses' o 'estoy explorando'."
              : "Hacé UNA sola pregunta: con qué urgencia o para cuándo necesita concretar la compra (las opciones aparecen como botones debajo).",
            "¿Cuándo necesitás concretar la compra?",
            {
              quickReplies: URGENCIA_OPCIONES.map((o) => ({
                label: o,
                value: o,
              })),
            },
          );
          return;
        }
        if (!lead.financiamiento) {
          stepRef.current = 3;
          lastAskedRef.current = "financiamiento";
          await botSay(
            stillMissingExpected
              ? "No entendiste cómo piensa financiar la compra. Pedile que te lo aclare, con ejemplos como 'al contado' o 'con crédito hipotecario'."
              : `Ya sabés que su urgencia es "${lead.urgencia}". Reconocelo brevemente y hacé UNA sola pregunta: cómo piensa financiar la compra (las opciones aparecen como botones debajo).`,
            "¿Cómo pensás financiar la compra?",
            {
              quickReplies: FINANCIAMIENTO_OPCIONES.map((o) => ({
                label: o,
                value: o,
              })),
            },
          );
          return;
        }
        if (!lead.presupuesto) {
          stepRef.current = 5;
          lastAskedRef.current = "presupuesto";
          await botSay(
            stillMissingExpected
              ? "No pudiste entender el monto del presupuesto. Pedile que lo escriba en dólares con un ejemplo (90.000 o USD 120.000)."
              : "Hacé UNA sola pregunta: cuál es su presupuesto aproximado para esta compra, pidiéndole que lo escriba en dólares con un ejemplo (90.000 o USD 120.000).",
            "Por último, ¿cuál es tu presupuesto aproximado para esta compra? Escribilo en dólares (por ejemplo: 90.000 o USD 120.000).",
          );
          return;
        }

        // Tenemos urgencia, financiamiento y presupuesto: calificamos.
        await finalizeQualification();
        return;
      }
    },
    [
      addMsg,
      botReply,
      botSay,
      done,
      extract,
      finalizeQualification,
      presentAgenda,
      typing,
    ],
  );

  const confirmSlot = useCallback(async () => {
    if (!selectedSlot || slotConfirmed || confirming) return;
    const activeProp = activePropRef.current;
    setConfirming(true);
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

      // Una sola vez: ofrecemos otras propiedades que también podrían
      // interesarle. Si elige alguna, reutilizamos sus datos (no volvemos
      // a preguntar) y coordinamos otra visita.
      if (!offeredRecRef.current) {
        offeredRecRef.current = true;
        const { cards } = recommendProps();
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
  }, [addMsg, botReply, botSay, confirming, recommendProps, selectedSlot, slotConfirmed]);




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
                      <div className="flex gap-1.5">
                        <Link
                          to="/propiedades/$id"
                          params={{ id: String(c.id) }}
                          className="flex-1 rounded-full border border-border bg-card px-3 py-1.5 text-center text-[12px] font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                          Ver
                        </Link>
                        <button
                          type="button"
                          disabled={typing || confirming}
                          onClick={() => expressInterest(c)}
                          className="flex-1 rounded-full bg-primary px-3 py-1.5 text-center text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                        >
                          Me interesa también
                        </button>
                      </div>
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
                      onClick={() => handleSend(qr.value)}
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
      ) : notQualified ? (
        <div className="border-t border-border p-3.5 text-center">
          <Link
            to="/propiedades"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ver propiedades disponibles <ArrowRight size={14} />
          </Link>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Explorá las opciones que mejor se ajustan a vos.
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

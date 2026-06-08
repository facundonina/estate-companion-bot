import { useEffect, useRef, useState, useCallback } from "react";
import { Building2, Send, Calendar, Bath, BedDouble, Maximize } from "lucide-react";
import { properties, type Property } from "@/data/properties";
import { formatPrice, propertyTitle } from "@/lib/format";
import { propertyImage } from "@/lib/propertyImage";
import { sendLeadToSheet } from "@/lib/leadSheet.functions";

export interface BotLead {
  nombre: string;
  telefono: string;
  email: string;
  mensaje?: string;
}

type QuickReply = { label: string; value: string };

type Slot = { label: string; time: string; id: string };

interface BotMessage {
  id: number;
  role: "bot" | "user";
  text?: string;
  card?: Property;
  cards?: Property[];
  agenda?: boolean;
  quickReplies?: QuickReply[];
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

function buildSlots(): Slot[] {
  const today = new Date();
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const meses = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const slots: Slot[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const label = `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
    slots.push({ label, time: "10:00 hs", id: `s${i}a` });
    slots.push({ label, time: "16:00 hs", id: `s${i}b` });
  }
  return slots;
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

export function PropBot({ property, lead }: { property: Property; lead: BotLead }) {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [done, setDone] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [slotConfirmed, setSlotConfirmed] = useState(false);

  const leadRef = useRef<BotLeadState>({ ...lead });
  const stepRef = useRef(0);
  const flowRef = useRef<"prop" | "similar">("prop");
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const nextId = () => ++idRef.current;

  const addMsg = useCallback((msg: Omit<BotMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: nextId() }]);
  }, []);

  const botReply = useCallback(
    async (msg: Omit<BotMessage, "id" | "role">, delay = 850) => {
      setTyping(true);
      await new Promise((r) => setTimeout(r, delay));
      setTyping(false);
      addMsg({ ...msg, role: "bot" });
    },
    [addMsg],
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  const similarProps = useCallback(() => {
    return [...properties]
      .filter((x) => x.id !== property.id)
      .sort((a, b) => scoreProp(b, leadRef.current) - scoreProp(a, leadRef.current))
      .slice(0, 3);
  }, [property.id]);

  // Kick off the conversation once.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      await botReply(
        {
          text: `¡Hola ${firstName(lead.nombre)}! Vi que te interesaste en esta propiedad:`,
          card: property,
        },
        900,
      );
      await new Promise((r) => setTimeout(r, 300));
      await botReply(
        {
          text: "¿Buscás específicamente esta propiedad o también te gustaría conocer opciones similares?",
          quickReplies: [
            { label: "Me interesa esta", value: "esta" },
            { label: "Ver opciones similares", value: "similares" },
          ],
        },
        700,
      );
      stepRef.current = 1;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || typing) return;
      addMsg({ role: "user", text });
      setInput("");

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

      if (flowRef.current === "prop" && stepRef.current === 1) {
        if (text === "esta") {
          await botReply(
            {
              text: "¡Genial! Podemos coordinar una visita para que la conozcas en persona. Elegí un horario que te venga bien:",
              agenda: true,
            },
            800,
          );
          stepRef.current = 2;
        } else {
          flowRef.current = "similar";
          lead.zona = property.zona;
          lead.tipo = property.tipo;
          stepRef.current = 10;
          await botReply(
            {
              text: "Perfecto. Para mostrarte las mejores opciones, ¿cuántos dormitorios necesitás?",
              quickReplies: [
                { label: "1 dormitorio", value: "1 dormitorio" },
                { label: "2 dormitorios", value: "2 dormitorios" },
                { label: "3 dormitorios", value: "3 dormitorios" },
                { label: "4 o más", value: "4 o más" },
              ],
            },
            800,
          );
        }
        return;
      }

      if (flowRef.current === "similar") {
        switch (stepRef.current) {
          case 10: {
            const m: Record<string, number> = {
              "1 dormitorio": 1,
              "2 dormitorios": 2,
              "3 dormitorios": 3,
              "4 o más": 4,
            };
            lead.dormitorios = m[text] || 2;
            stepRef.current = 11;
            await botReply(
              {
                text: "¿Cuál sería tu presupuesto aproximado?",
                quickReplies: [
                  { label: "Hasta USD 80K", value: "Hasta USD 80K" },
                  { label: "USD 80K – 150K", value: "USD 80K – 150K" },
                  { label: "USD 150K – 300K", value: "USD 150K – 300K" },
                  { label: "Más de USD 300K", value: "Más de USD 300K" },
                ],
              },
              700,
            );
            return;
          }
          case 11: {
            const m: Record<string, number> = {
              "Hasta USD 80K": 65000,
              "USD 80K – 150K": 115000,
              "USD 150K – 300K": 225000,
              "Más de USD 300K": 400000,
            };
            lead.presupuesto = m[text] || 115000;
            stepRef.current = 12;
            await botReply(
              {
                text: "¿Buscás para vivir o para invertir?",
                quickReplies: [
                  { label: "Para vivir", value: "Para vivir" },
                  { label: "Para invertir", value: "Para invertir" },
                  { label: "Las dos cosas", value: "Las dos cosas" },
                ],
              },
              700,
            );
            return;
          }
          case 12: {
            lead.proposito = text;
            stepRef.current = 13;
            await botReply(
              {
                text: "¿Hay algo que sí o sí querés que tenga? (garage, piscina, planta baja, vista al mar...). Si no, escribí 'No, está bien'.",
              },
              800,
            );
            return;
          }
          case 13: {
            const low = text.toLowerCase();
            if (low.includes("piscin")) lead.piscina = true;
            if (low.includes("garage") || low.includes("garaje")) lead.garage = true;
            stepRef.current = 14;
            await botReply(
              {
                text: "¿Cuándo necesitás concretar?",
                quickReplies: [
                  { label: "Menos de 3 meses", value: "Menos de 3 meses" },
                  { label: "3 a 6 meses", value: "3 a 6 meses" },
                  { label: "En el año", value: "En el año" },
                  { label: "Estoy explorando", value: "Estoy explorando" },
                ],
              },
              700,
            );
            return;
          }
          case 14: {
            lead.urgencia = text;
            stepRef.current = 15;
            await botReply(
              {
                text: "¿Cómo pensás financiar la compra?",
                quickReplies: [
                  { label: "Efectivo listo", value: "Efectivo listo" },
                  {
                    label: "Crédito hipotecario aprobado",
                    value: "Crédito hipotecario aprobado",
                  },
                  { label: "Crédito en trámite", value: "Crédito en trámite" },
                  { label: "No lo definí todavía", value: "No lo definí todavía" },
                ],
              },
              700,
            );
            return;
          }
          case 15: {
            lead.financiamiento = text;
            lead.prioridad = calcPrioridad(lead);
            void sendLeadToSheet(lead);
            const top3 = similarProps();
            await botReply(
              {
                text: "Estas son las opciones que mejor se ajustan a lo que buscás:",
                cards: top3,
              },
              1000,
            );
            await new Promise((r) => setTimeout(r, 400));
            await botReply(
              {
                text: "Si alguna te interesa, podemos coordinar una visita. Un asesor también se va a contactar con vos para acompañarte. ¡Gracias!",
              },
              700,
            );
            setDone(true);
            return;
          }
        }
      }
    },
    [addMsg, botReply, done, property, similarProps, typing],
  );

  const confirmSlot = useCallback(async () => {
    if (!selectedSlot || slotConfirmed) return;
    setSlotConfirmed(true);
    addMsg({
      role: "user",
      text: `Confirmo la visita para el ${selectedSlot.label} a las ${selectedSlot.time}`,
    });
    await botReply(
      {
        text: `¡Listo! Tu visita quedó agendada para el ${selectedSlot.label} a las ${selectedSlot.time}. Te confirmamos por email a ${leadRef.current.email || "tu correo"}. Si necesitás reprogramar, avisanos. ¡Hasta pronto!`,
      },
      1000,
    );
    setDone(true);
  }, [addMsg, botReply, selectedSlot, slotConfirmed]);

  const slots = useRef<Slot[]>(buildSlots());

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
              {m.agenda && (
                <div className="w-full max-w-[280px] rounded-xl border border-border bg-card p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
                    <Calendar size={15} className="text-primary" /> Elegí un horario
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {slots.current.map((s) => {
                      const active = selectedSlot?.id === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={slotConfirmed}
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
                    disabled={!selectedSlot || slotConfirmed}
                    onClick={confirmSlot}
                    className="mt-2 w-full rounded-md bg-primary py-2 text-[13px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
                  >
                    {slotConfirmed ? "Visita confirmada" : "Confirmar visita"}
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
    </div>
  );
}

import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { extractFields, generateBotMessage } from "@/lib/botAi.functions";
import { Building2, Send, ArrowRight, Bath, BedDouble, Maximize } from "lucide-react";
import { properties, type Property } from "@/data/properties";
import { formatPrice } from "@/lib/format";
import { propertyImage } from "@/lib/propertyImage";
import { parseBudget } from "@/lib/parseBudget";
import { isAngryMessage, isAffirmative } from "@/lib/sentiment";

type QuickReply = { label: string; value: string };

interface BotMessage {
  id: number;
  role: "bot" | "user";
  text?: string;
  cards?: Property[];
  quickReplies?: QuickReply[];
  cta?: boolean;
}

interface SearchState {
  tipo?: string;
  departamento?: string;
  dormitorios?: number;
  presupuesto?: number;
}

const TIPOS = Array.from(new Set(properties.map((p) => p.tipo)));
const DEPARTAMENTOS = Array.from(
  new Set(properties.map((p) => p.departamento)),
).sort();




function isLandTipo(tipo?: string) {
  return tipo === "Lote" || tipo === "Campo";
}

function PropertyCardBubble({ p }: { p: Property }) {
  const isLand = isLandTipo(p.tipo);
  return (
    <Link
      to="/propiedades/$id"
      params={{ id: String(p.id) }}
      className="block overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-card"
    >
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
        </div>
        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
          Ver propiedad <ArrowRight size={11} />
        </span>
      </div>
    </Link>
  );
}

export function SearchBot() {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");

  const stateRef = useRef<SearchState>({});
  const stepRef = useRef(0);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const awaitingHumanRef = useRef(false);
  // Último campo que el bot le pidió al usuario (para detectar respuestas
  // que no aportan el dato esperado y pedir una aclaración).
  const lastAskedRef = useRef<keyof SearchState | null>(null);

  const extract = useServerFn(extractFields);
  const genMsg = useServerFn(generateBotMessage);

  // Espejo del historial para enviarlo como contexto a la IA.
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
        console.error("[SearchBot] generateBotMessage:", err);
        return fallback;
      }
    },
    [genMsg],
  );

  const botReply = useCallback(
    async (msg: Omit<BotMessage, "id" | "role">, delay = 800) => {
      setTyping(true);
      await new Promise((r) => setTimeout(r, delay));
      setTyping(false);
      addMsg({ ...msg, role: "bot" });
    },
    [addMsg],
  );

  // Igual que botReply, pero el texto lo redacta Gemini (con fallback).
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

  const showResults = useCallback(async () => {
    const s = stateRef.current;
    const matches = properties
      .filter((p) => {
        if (!p.disponible) return false;
        if (s.tipo && p.tipo !== s.tipo) return false;
        if (s.departamento && p.departamento !== s.departamento) return false;
        if (s.dormitorios && !isLandTipo(p.tipo) && p.dormitorios < s.dormitorios)
          return false;
        if (s.presupuesto && p.precio > s.presupuesto * 1.1) return false;
        return true;
      })
      .sort((a, b) => b.precio - a.precio)
      .slice(0, 4);

    if (matches.length === 0) {
      await botSay(
        "No encontraste propiedades que encajen con todo lo que busca el usuario. Decíselo con amabilidad e invitalo a recorrer el catálogo completo (hay un botón debajo de tu mensaje).",
        "Por ahora no tengo propiedades que encajen con todo lo que buscás. Te invito a recorrer el catálogo completo, seguro encontrás algo que te guste 👇",
        { cta: true },
      );
      return;
    }

    await botSay(
      "Encontraste opciones que encajan con lo que busca (se muestran como tarjetas debajo). Anunciáselo con entusiasmo e invitalo a tocar la que más le guste para ver el detalle y dejar sus datos.",
      "¡Encontré estas opciones que encajan con lo que buscás! Tocá la que más te guste para ver el detalle y dejar tus datos 👇",
      { cards: matches },
    );
    await new Promise((r) => setTimeout(r, 300));
    await botReply(
      {
        text: "Si querés ver todo el catálogo o ajustar la búsqueda, podés hacerlo acá 👇",
        cta: true,
      },
      600,
    );
  }, [botReply, botSay]);

  // Inicio de la conversación.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      await botSay(
        "Saludá al usuario, presentate como PropBot y contale que lo vas a ayudar a encontrar la propiedad ideal. Después hacé UNA sola pregunta: qué tipo de propiedad le interesa (las opciones aparecen como botones debajo).",
        "¡Hola! 👋 Soy PropBot. Contame qué estás buscando y te ayudo a encontrar la propiedad ideal. Para empezar, ¿qué tipo de propiedad te interesa?",
        { quickReplies: TIPOS.map((t) => ({ label: t, value: t })) },
        500,
      );
      stepRef.current = 1;
      lastAskedRef.current = "tipo";
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSend = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || typing) return;
      addMsg({ role: "user", text });
      setInput("");

      // ¿Estábamos esperando que confirme si quiere hablar con un humano?
      if (awaitingHumanRef.current) {
        awaitingHumanRef.current = false;
        if (isAffirmative(text)) {
          await botReply(
            {
              text: "Listo, le aviso a un asesor de nuestro equipo para que se comunique con vos a la brevedad. Si querés, dejame tu teléfono o email así te contactan más rápido. 🙌",
            },
            700,
          );
          return;
        }
        await botReply(
          {
            text: "¡Perfecto, seguimos por acá! 😊 Volvé a responder la última pregunta cuando quieras.",
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

      const s = stateRef.current;

      // Búsqueda ya completada.
      if (stepRef.current >= 5) {
        await botReply(
          {
            text: "Si querés empezar otra búsqueda, recargá la página. Mientras tanto, podés ver todo el catálogo acá 👇",
            cta: true,
          },
          600,
        );
        return;
      }

      // La IA interpreta TODO el mensaje del usuario y extrae, de una sola vez,
      // todos los datos que todavía falten (un mensaje libre puede completar
      // varios pasos: "quiero una casa de 3 dormitorios en Pocitos").
      const fields: Array<{
        name: string;
        kind: "option" | "number" | "budget";
        description: string;
        options?: string[];
      }> = [];
      if (!s.tipo)
        fields.push({
          name: "tipo",
          kind: "option",
          description: "Qué tipo de propiedad busca el usuario.",
          options: TIPOS,
        });
      if (!s.departamento)
        fields.push({
          name: "departamento",
          kind: "option",
          description: "En qué departamento de Uruguay quiere la propiedad.",
          options: DEPARTAMENTOS,
        });
      if (!s.dormitorios)
        fields.push({
          name: "dormitorios",
          kind: "number",
          description: "Cuántos dormitorios necesita.",
        });
      if (!s.presupuesto)
        fields.push({
          name: "presupuesto",
          kind: "budget",
          description: "Presupuesto aproximado en dólares para la compra.",
        });

      setTyping(true);
      try {
        const history = messagesRef.current
          .filter((m) => m.text)
          .slice(-12)
          .map((m) => ({ role: m.role, text: m.text as string }));
        const res = await extract({ data: { history, message: text, fields } });
        const v = res?.values ?? {};
        if (typeof v.tipo === "string") s.tipo = v.tipo;
        if (typeof v.departamento === "string") s.departamento = v.departamento;
        if (typeof v.dormitorios === "number" && v.dormitorios > 0)
          s.dormitorios = v.dormitorios;
        if (typeof v.presupuesto === "number" && v.presupuesto > 0)
          s.presupuesto = v.presupuesto;
      } catch (err) {
        console.error("[SearchBot] extract:", err);
      }
      setTyping(false);

      // Respaldo local de presupuesto si la IA no lo detectó.
      if (!s.presupuesto && lastAskedRef.current === "presupuesto") {
        const b = parseBudget(text);
        if (b) s.presupuesto = b;
      }

      // ¿El usuario no aportó el dato que se le pidió recién? Pedimos aclaración.
      const expected = lastAskedRef.current;
      const stillMissingExpected =
        (expected === "tipo" && !s.tipo) ||
        (expected === "departamento" && !s.departamento) ||
        (expected === "dormitorios" && !s.dormitorios) ||
        (expected === "presupuesto" && !s.presupuesto);

      // Próxima pregunta según el primer dato que falte.
      if (!s.tipo) {
        lastAskedRef.current = "tipo";
        await botSay(
          stillMissingExpected
            ? "No reconociste el tipo de propiedad que dijo el usuario. Pedile con amabilidad que elija uno de los tipos de la lista (botones debajo)."
            : "Hacé UNA sola pregunta: qué tipo de propiedad le interesa (las opciones aparecen como botones debajo).",
          "¿Qué tipo de propiedad te interesa? Elegí una opción 👇",
          { quickReplies: TIPOS.map((t) => ({ label: t, value: t })) },
        );
        return;
      }
      if (!s.departamento) {
        lastAskedRef.current = "departamento";
        await botSay(
          stillMissingExpected
            ? "No reconociste el departamento que mencionó el usuario. Pedile que elija uno de la lista (botones debajo)."
            : `El usuario busca: ${s.tipo}. Reconocelo con entusiasmo y hacé UNA sola pregunta: en qué departamento le gustaría (las opciones aparecen como botones debajo).`,
          "¡Buenísimo! ¿En qué departamento te gustaría?",
          { quickReplies: DEPARTAMENTOS.map((d) => ({ label: d, value: d })) },
        );
        return;
      }
      if (!isLandTipo(s.tipo) && !s.dormitorios) {
        lastAskedRef.current = "dormitorios";
        await botSay(
          stillMissingExpected
            ? "No entendiste cuántos dormitorios necesita el usuario. Pedile que te diga un número (por ejemplo: 1, 2 o 3)."
            : "Hacé UNA sola pregunta: cuántos dormitorios necesita (las opciones aparecen como botones debajo).",
          "¿Cuántos dormitorios necesitás?",
          {
            quickReplies: [
              { label: "1 dormitorio", value: "1" },
              { label: "2 dormitorios", value: "2" },
              { label: "3 dormitorios", value: "3" },
              { label: "4 o más", value: "4" },
            ],
          },
        );
        return;
      }
      if (!s.presupuesto) {
        lastAskedRef.current = "presupuesto";
        await botSay(
          stillMissingExpected
            ? "No pudiste entender el monto del presupuesto. Pedile que lo escriba en dólares con un ejemplo (90.000 o USD 120.000)."
            : "Hacé UNA sola pregunta: cuál es su presupuesto aproximado, pidiéndolo en dólares con un ejemplo (90.000 o USD 120.000).",
          "¿Cuál es tu presupuesto aproximado? Escribilo en dólares (por ejemplo: 90.000 o USD 120.000).",
        );
        return;
      }

      // Tenemos todos los datos: mostramos los resultados.
      lastAskedRef.current = null;
      stepRef.current = 5;
      await showResults();
    },
    [addMsg, botReply, botSay, extract, showResults, typing],
  );

  return (
    <div className="flex h-[540px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-elevated">
      {/* Header */}
      <div className="flex items-center gap-2.5 bg-primary px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
          <Building2 size={18} className="text-primary-foreground" />
        </span>
        <div>
          <p className="text-sm font-semibold text-primary-foreground">PropBot</p>
          <p className="text-[11px] text-primary-foreground/70">
            Encontrá tu propiedad ideal · Activo ahora
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-3.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex items-end gap-1.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            {m.role === "bot" && (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
                <Building2 size={12} className="text-primary-foreground" />
              </span>
            )}
            <div
              className={`flex max-w-[84%] flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}
            >
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
              {m.cards && (
                <div className="flex w-full max-w-[260px] flex-col gap-2">
                  {m.cards.map((c) => (
                    <PropertyCardBubble key={c.id} p={c} />
                  ))}
                </div>
              )}
              {m.cta && (
                <Link
                  to="/propiedades"
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Ver propiedades <ArrowRight size={14} />
                </Link>
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

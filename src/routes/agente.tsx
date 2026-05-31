import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageCircle, ArrowRight, Check } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { AgentSection } from "@/components/AgentSection";

export const Route = createFileRoute("/agente")({
  head: () => ({
    meta: [
      { title: "Agente IA por WhatsApp — Habita.uy" },
      {
        name: "description",
        content:
          "Conocé el agente conversacional por WhatsApp que atiende, califica y da seguimiento automático a los leads de tu inmobiliaria.",
      },
      { property: "og:title", content: "Agente IA por WhatsApp — Habita.uy" },
      {
        property: "og:description",
        content:
          "Atiende, califica y da seguimiento automático a los leads de tu inmobiliaria por WhatsApp.",
      },
    ],
  }),
  component: AgentePage,
});

const conversation = [
  { from: "bot", text: "¡Hola! 👋 Vi que dejaste tus datos. ¿En qué zona estás buscando?" },
  { from: "user", text: "Hola, busco en Pocitos" },
  { from: "bot", text: "Genial. ¿Apartamento o casa? ¿Cuántos dormitorios?" },
  { from: "user", text: "Apartamento de 2 dormitorios" },
  { from: "bot", text: "Perfecto. ¿Cuál es tu presupuesto aproximado?" },
  { from: "user", text: "Hasta 200.000 USD" },
  { from: "bot", text: "Tengo opciones ideales para vos. Te derivo con un asesor y te envío propiedades similares. 🏡" },
];

const benefits = [
  "Respuesta inmediata las 24 horas",
  "Califica el lead antes de pasarlo al vendedor",
  "El comercial recibe el contacto ya trabajado",
  "Seguimiento periódico con propiedades similares",
  "Cierra automáticamente leads que no califican",
  "Mayor probabilidad de conversión",
];

function AgentePage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-4 py-1.5 text-sm font-semibold text-gold">
              <MessageCircle size={15} /> Powered by WhatsApp + IA
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl">
              El asistente que <span className="text-gold">no deja</span> escapar
              ningún lead
            </h1>
            <p className="mt-5 text-lg text-primary-foreground/80">
              Un único agente conversacional que atiende cada consulta, entiende
              el perfil del cliente y mantiene vivo el interés con seguimiento
              automático.
            </p>
            <Link
              to="/propiedades"
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 font-semibold text-gold-foreground transition-transform hover:scale-[1.03]"
            >
              Ver propiedades <ArrowRight size={18} />
            </Link>
          </div>

          {/* Chat mock */}
          <div className="rounded-3xl bg-card p-4 shadow-elevated">
            <div className="flex items-center gap-3 border-b border-border px-2 pb-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-gold-foreground">
                <MessageCircle size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Asistente Habita.uy
                </p>
                <p className="text-xs text-teal">en línea</p>
              </div>
            </div>
            <div className="space-y-2.5 px-1 py-4">
              {conversation.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}
                >
                  <p
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      m.from === "user"
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {m.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <AgentSection />

      {/* Benefits */}
      <section className="mx-auto max-w-4xl px-4 py-20">
        <h2 className="text-center text-3xl font-bold text-foreground">
          Por qué funciona
        </h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {benefits.map((b) => (
            <div
              key={b}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-5 shadow-card"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check size={14} />
              </span>
              <p className="text-sm text-foreground">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

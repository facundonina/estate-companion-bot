import { MessageCircle, UserCheck, Repeat, Filter } from "lucide-react";

const steps = [
  {
    icon: MessageCircle,
    title: "Contacto instantáneo",
    text: "Apenas el lead deja sus datos en una campaña, el agente inicia la conversación por WhatsApp en segundos.",
  },
  {
    icon: Filter,
    title: "Califica el perfil",
    text: "Pregunta zona, tipo de propiedad, presupuesto, dormitorios y si busca para vivir o invertir.",
  },
  {
    icon: UserCheck,
    title: "Deriva al vendedor",
    text: "Si califica, el comercial recibe el lead ya trabajado y organizado, listo para cerrar.",
  },
  {
    icon: Repeat,
    title: "Seguimiento automático",
    text: "Envía propiedades similares de forma periódica para mantener vivo el interés del cliente.",
  },
];

export function AgentSection() {
  return (
    <section className="bg-secondary py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-gold/20 px-4 py-1.5 text-sm font-semibold text-gold-foreground">
            <MessageCircle size={15} /> Asistente por WhatsApp
          </span>
          <h2 className="mt-4 text-3xl font-bold text-foreground sm:text-4xl">
            Ningún lead se pierde
          </h2>
          <p className="mt-4 text-muted-foreground">
            Nuestro agente conversacional atiende, califica y da seguimiento a
            cada contacto automáticamente. El vendedor recibe solo leads con
            potencial real.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div
              key={s.title}
              className="rounded-2xl bg-card p-6 shadow-card"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <s.icon size={20} />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {s.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

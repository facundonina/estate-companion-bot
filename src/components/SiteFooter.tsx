import { Link } from "@tanstack/react-router";
import { Home, MessageCircle } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-foreground/10">
              <Home size={18} />
            </span>
            <span className="font-serif text-xl font-bold">Habita.uy</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-primary-foreground/70">
            El portal inmobiliario de Uruguay con asistente inteligente por
            WhatsApp.
          </p>
        </div>

        <div>
          <h4 className="font-sans text-sm font-semibold uppercase tracking-wide text-primary-foreground/60">
            Explorar
          </h4>
          <ul className="mt-4 space-y-2 text-sm text-primary-foreground/80">
            <li><Link to="/propiedades" className="hover:text-primary-foreground">Propiedades</Link></li>
            <li><Link to="/agente" className="hover:text-primary-foreground">Agente IA</Link></li>
            <li><Link to="/" className="hover:text-primary-foreground">Inicio</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="font-sans text-sm font-semibold uppercase tracking-wide text-primary-foreground/60">
            Tipos
          </h4>
          <ul className="mt-4 space-y-2 text-sm text-primary-foreground/80">
            <li>Apartamentos</li>
            <li>Casas</li>
            <li>Lotes y Campos</li>
          </ul>
        </div>

        <div>
          <h4 className="font-sans text-sm font-semibold uppercase tracking-wide text-primary-foreground/60">
            Contacto
          </h4>
          <a
            href="https://wa.me/59800000000"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-gold-foreground"
          >
            <MessageCircle size={16} /> Hablar por WhatsApp
          </a>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10 py-5 text-center text-xs text-primary-foreground/60">
        © {new Date().getFullYear()} Habita.uy — Demo de portal inmobiliario.
      </div>
    </footer>
  );
}

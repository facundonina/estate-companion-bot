import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Home size={18} />
      </span>
      <span className="font-serif text-xl font-bold tracking-tight text-foreground">
        Habita<span className="text-gold">.uy</span>
      </span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link
            to="/"
            className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-foreground" }}
          >
            Inicio
          </Link>
          <Link
            to="/propiedades"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Propiedades
          </Link>
          <Link
            to="/propiedades"
            className="rounded-lg bg-primary px-4 py-2 text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ver propiedades
          </Link>
        </nav>
      </div>
    </header>
  );
}

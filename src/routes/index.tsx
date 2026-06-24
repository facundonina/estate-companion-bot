import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, ArrowRight, MapPin, TrendingUp, Home, X } from "lucide-react";
import { useState } from "react";
import { properties } from "@/data/properties";
import { PropertyCard } from "@/components/PropertyCard";
import { SearchBot } from "@/components/SearchBot";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Habita.uy — Portal inmobiliario de Uruguay" },
      {
        name: "description",
        content:
          "Encontrá apartamentos, casas, lotes y campos en todo Uruguay. Portal inmobiliario con asistente inteligente que atiende y da seguimiento a cada consulta.",
      },
      { property: "og:title", content: "Habita.uy — Portal inmobiliario de Uruguay" },
      {
        property: "og:description",
        content:
          "Apartamentos, casas, lotes y campos en todo Uruguay, con asistente inteligente.",
      },
    ],
  }),
  component: Index,
});

const departamentos = Array.from(
  new Set(properties.map((p) => p.departamento)),
).sort();

function Index() {
  const featured = [...properties]
    .filter((p) => p.disponible)
    .sort((a, b) => b.precio - a.precio)
    .slice(0, 6);

  const total = properties.length;
  const minPrice = Math.min(
    ...properties
      .filter((p) => p.operacion !== "Alquiler")
      .map((p) => p.precio),
  );
  

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 15% 20%, white 1.5px, transparent 1.5px)",
            backgroundSize: "30px 30px",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-24 text-center sm:py-32">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-4 py-1.5 text-sm font-medium">
            <MapPin size={15} /> {total} propiedades en todo Uruguay
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
            Tu próximo hogar te está{" "}
            <span className="text-gold">esperando</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-primary-foreground/80">
            Apartamentos, casas, lotes y campos seleccionados. Y un asistente
            inteligente que responde tus consultas al instante.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/propiedades"
              className="inline-flex items-center gap-2 rounded-xl bg-gold px-6 py-3 font-semibold text-gold-foreground transition-transform hover:scale-[1.03]"
            >
              <Search size={18} /> Ver propiedades
            </Link>
          </div>

          <div className="mx-auto mt-14 grid max-w-2xl grid-cols-3 gap-6 border-t border-primary-foreground/15 pt-8">
            <Stat value={`${total}`} label="Propiedades" />
            <Stat value={`${departamentos.length}`} label="Departamentos" />
            <Stat value={`U$S ${(minPrice / 1000).toFixed(0)}k+`} label="Desde" />
          </div>
        </div>
      </section>

      {/* Departamentos */}
      <section className="mx-auto max-w-6xl px-4 py-16">

        <h2 className="text-2xl font-bold text-foreground">Explorá por zona</h2>
        <p className="mt-1 text-muted-foreground">
          Propiedades en los principales departamentos del país.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {departamentos.map((dep) => (
            <Link
              key={dep}
              to="/propiedades"
              search={{ departamento: dep }}
              className="rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground shadow-card transition-colors hover:border-primary hover:text-primary"
            >
              {dep}
            </Link>
          ))}
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <TrendingUp size={22} className="text-gold" /> Destacadas
            </h2>
            <p className="mt-1 text-muted-foreground">
              Las propiedades premium de nuestro catálogo.
            </p>
          </div>
          <Link
            to="/propiedades"
            className="hidden items-center gap-1 text-sm font-semibold text-primary hover:underline sm:flex"
          >
            Ver todas <ArrowRight size={16} />
          </Link>
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-serif text-3xl font-bold text-gold">{value}</p>
      <p className="mt-1 text-sm text-primary-foreground/70">{label}</p>
    </div>
  );
}

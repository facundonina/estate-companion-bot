import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
  BedDouble,
  Bath,
  Maximize,
  MapPin,
  Calendar,
  Building,
  ArrowLeft,
  MessageCircle,
  Check,
  Phone,
} from "lucide-react";
import { properties } from "@/data/properties";
import { formatPrice, propertyTitle } from "@/lib/format";
import { PropertyMedia } from "@/components/PropertyMedia";
import { PropertyCard } from "@/components/PropertyCard";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/propiedades/$id")({
  loader: ({ params }) => {
    const property = properties.find((p) => p.id === Number(params.id));
    if (!property) throw notFound();
    return { property };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.property;
    const title = p
      ? `${propertyTitle(p.tipo, p.barrio, p.dormitorios)} — Habita.uy`
      : "Propiedad — Habita.uy";
    const desc = p ? p.descripcion : "Detalle de propiedad en Uruguay.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold text-foreground">
          Propiedad no encontrada
        </h1>
        <Link to="/propiedades" className="mt-4 text-primary hover:underline">
          Ver todas las propiedades
        </Link>
      </div>
      <SiteFooter />
    </div>
  ),
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">No se pudo cargar la propiedad.</p>
    </div>
  ),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { property: p } = Route.useLoaderData();

  const features: { label: string; on: boolean }[] = [
    { label: "Garage", on: p.garage },
    { label: "Parrillero", on: p.parrillero },
    { label: "Terraza / Balcón", on: p.terraza },
    { label: "Piscina", on: p.piscina },
    { label: "Amueblado", on: p.amueblado },
    { label: "Ascensor", on: p.ascensor },
    { label: "Apto Banco", on: p.aptoBanco },
  ];

  const similar = properties
    .filter(
      (x) =>
        x.id !== p.id &&
        x.tipo === p.tipo &&
        (x.departamento === p.departamento || x.zona === p.zona),
    )
    .slice(0, 3);

  const isLand = p.tipo === "Lote" || p.tipo === "Campo";

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="mx-auto max-w-6xl px-4 py-6">
        <Link
          to="/propiedades"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} /> Volver a propiedades
        </Link>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 lg:grid-cols-[1.6fr_1fr]">
        {/* Main */}
        <div>
          <PropertyMedia
            tipo={p.tipo}
            iconSize={96}
            className="aspect-[16/10] w-full rounded-2xl"
          />

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {p.tipo}
            </span>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
              {p.estado}
            </span>
            {p.aptoBanco && (
              <span className="rounded-full bg-gold/20 px-3 py-1 text-xs font-semibold text-gold-foreground">
                Apto Banco
              </span>
            )}
          </div>

          <h1 className="mt-3 text-3xl font-bold text-foreground">
            {propertyTitle(p.tipo, p.barrio, p.dormitorios)}
          </h1>
          <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
            <MapPin size={16} /> {p.barrio}, {p.zona} — {p.departamento}
          </p>

          {/* Key specs */}
          <div className="mt-6 grid grid-cols-2 gap-4 rounded-2xl border border-border bg-card p-6 shadow-card sm:grid-cols-4">
            {!isLand && <Spec icon={BedDouble} value={p.dormitorios} label="Dormitorios" />}
            {!isLand && <Spec icon={Bath} value={p.banos} label="Baños" />}
            <Spec icon={Maximize} value={`${p.superficieTotal} m²`} label="Sup. total" />
            {!isLand && (
              <Spec
                icon={Building}
                value={`${p.superficieCubierta} m²`}
                label="Sup. cubierta"
              />
            )}
            {p.anioConstruccion && (
              <Spec icon={Calendar} value={p.anioConstruccion} label="Año" />
            )}
          </div>

          {/* Description */}
          <div className="mt-8">
            <h2 className="text-xl font-bold text-foreground">Descripción</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {p.descripcion}
            </p>
          </div>

          {/* Features */}
          {!isLand && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-foreground">
                Características
              </h2>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {features.map((f) => (
                  <div
                    key={f.label}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                      f.on
                        ? "border-primary/30 bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground/50 line-through"
                    }`}
                  >
                    <Check
                      size={16}
                      className={f.on ? "text-primary" : "text-muted-foreground/40"}
                    />
                    {f.label}
                  </div>
                ))}
              </div>
              {p.expensas > 0 && (
                <p className="mt-4 text-sm text-muted-foreground">
                  Gastos comunes: {formatPrice(p.expensas, "USD")}/mes
                </p>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-elevated">
            <p className="text-sm text-muted-foreground">Precio</p>
            <p className="font-serif text-3xl font-bold text-primary">
              {formatPrice(p.precio, p.moneda)}
            </p>

            <div className="my-5 border-t border-border" />

            <p className="text-sm font-semibold text-foreground">
              Asesor a cargo
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone size={14} /> {p.contacto}
            </p>

            <a
              href={`https://wa.me/59800000000?text=${encodeURIComponent(
                `Hola, me interesa la propiedad #${p.id}: ${propertyTitle(p.tipo, p.barrio, p.dormitorios)}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 font-semibold text-gold-foreground transition-transform hover:scale-[1.02]"
            >
              <MessageCircle size={18} /> Consultar por WhatsApp
            </a>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Nuestro asistente te responde al instante y coordina la visita.
            </p>
          </div>
        </aside>
      </div>

      {/* Similar */}
      {similar.length > 0 && (
        <section className="border-t border-border bg-secondary py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-2xl font-bold text-foreground">
              Propiedades similares
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((s) => (
                <PropertyCard key={s.id} property={s} />
              ))}
            </div>
          </div>
        </section>
      )}

      <SiteFooter />
    </div>
  );
}

function Spec({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof BedDouble;
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <Icon size={22} className="text-primary" />
      <p className="mt-2 font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

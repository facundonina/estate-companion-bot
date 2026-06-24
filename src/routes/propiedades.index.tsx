import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { properties } from "@/data/properties";
import { PropertyCard } from "@/components/PropertyCard";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

interface PropSearch {
  q?: string;
  tipo?: string;
  operacion?: string;
  departamento?: string;
  dormitorios?: number;
  precioMax?: number;
}

const tipos = Array.from(new Set(properties.map((p) => p.tipo)));
const operaciones = Array.from(
  new Set(properties.map((p) => p.operacion).filter(Boolean)),
);
const departamentos = Array.from(
  new Set(properties.map((p) => p.departamento)),
).sort();

export const Route = createFileRoute("/propiedades/")({
  validateSearch: (search: Record<string, unknown>): PropSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    tipo: typeof search.tipo === "string" ? search.tipo : undefined,
    operacion:
      typeof search.operacion === "string" ? search.operacion : undefined,
    departamento:
      typeof search.departamento === "string" ? search.departamento : undefined,
    dormitorios: search.dormitorios ? Number(search.dormitorios) : undefined,
    precioMax: search.precioMax ? Number(search.precioMax) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Propiedades en Uruguay — Habita.uy" },
      {
        name: "description",
        content:
          "Buscá y filtrá apartamentos, casas, lotes y campos en venta en todo Uruguay por zona, tipo, precio y dormitorios.",
      },
      { property: "og:title", content: "Propiedades en Uruguay — Habita.uy" },
      {
        property: "og:description",
        content: "Apartamentos, casas, lotes y campos en venta en todo Uruguay.",
      },
    ],
  }),
  component: PropiedadesPage,
});

function PropiedadesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const update = (patch: Partial<PropSearch>) =>
    navigate({ search: (prev: PropSearch) => ({ ...prev, ...patch }) });

  const filtered = properties.filter((p) => {
    if (search.tipo && p.tipo !== search.tipo) return false;
    if (search.departamento && p.departamento !== search.departamento)
      return false;
    if (search.dormitorios && p.dormitorios < search.dormitorios) return false;
    if (search.precioMax && p.precio > search.precioMax) return false;
    if (search.q) {
      const hay = `${p.barrio} ${p.zona} ${p.departamento} ${p.descripcion} ${p.tipo}`.toLowerCase();
      if (!hay.includes(search.q.toLowerCase())) return false;
    }
    return true;
  });

  const hasFilters =
    search.q || search.tipo || search.departamento || search.dormitorios || search.precioMax;

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <div className="border-b border-border bg-secondary">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <h1 className="text-3xl font-bold text-foreground">Propiedades</h1>
          <p className="mt-1 text-muted-foreground">
            {filtered.length} de {properties.length} propiedades disponibles
          </p>

          {/* Search */}
          <div className="relative mt-6 max-w-xl">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={search.q ?? ""}
              onChange={(e) => update({ q: e.target.value || undefined })}
              placeholder="Buscar por barrio, zona o palabra clave…"
              className="w-full rounded-xl border border-border bg-card py-3 pl-11 pr-4 text-sm text-foreground shadow-card outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Filters */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <SlidersHorizontal size={16} /> Filtros
          </span>

          <FilterSelect
            value={search.tipo ?? ""}
            onChange={(v) => update({ tipo: v || undefined })}
            placeholder="Tipo"
            options={tipos}
          />
          <FilterSelect
            value={search.departamento ?? ""}
            onChange={(v) => update({ departamento: v || undefined })}
            placeholder="Departamento"
            options={departamentos}
          />
          <FilterSelect
            value={search.dormitorios ? String(search.dormitorios) : ""}
            onChange={(v) => update({ dormitorios: v ? Number(v) : undefined })}
            placeholder="Dormitorios"
            options={["1", "2", "3", "4"]}
            suffix="+ dorm."
          />
          <FilterSelect
            value={search.precioMax ? String(search.precioMax) : ""}
            onChange={(v) => update({ precioMax: v ? Number(v) : undefined })}
            placeholder="Precio máx."
            options={["100000", "200000", "300000", "500000", "1000000"]}
            format={(v) => `Hasta U$S ${(Number(v) / 1000).toLocaleString("es-UY")}k`}
          />

          {hasFilters && (
            <button
              onClick={() =>
                navigate({ search: {} })
              }
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <X size={15} /> Limpiar
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border py-20 text-center">
            <p className="text-lg font-semibold text-foreground">
              Sin resultados
            </p>
            <p className="mt-1 text-muted-foreground">
              Probá ajustar o limpiar los filtros.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  suffix = "",
  format,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
  suffix?: string;
  format?: (v: string) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-card outline-none focus:border-primary ${
        value ? "text-foreground font-medium" : "text-muted-foreground"
      }`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {format ? format(o) : `${o}${suffix}`}
        </option>
      ))}
    </select>
  );
}

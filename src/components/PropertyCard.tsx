import { Link } from "@tanstack/react-router";
import { BedDouble, Bath, Maximize, MapPin } from "lucide-react";
import type { Property } from "@/data/properties";
import { formatPrice, propertyTitle } from "@/lib/format";
import { propertyImage } from "@/lib/propertyImage";
import { PropertyMedia } from "./PropertyMedia";

export function PropertyCard({ property }: { property: Property }) {
  return (
    <Link
      to="/propiedades/$id"
      params={{ id: String(property.id) }}
      className="group flex flex-col overflow-hidden rounded-2xl bg-card shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-elevated"
    >
      <div className="relative">
        <PropertyMedia
          tipo={property.tipo}
          src={propertyImage(property)}
          alt={propertyTitle(property.tipo, property.barrio, property.dormitorios)}
          className="aspect-[4/3] w-full"
        />
        <span className="absolute left-3 top-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold text-foreground backdrop-blur">
          {property.tipo}
        </span>
        {property.operacion && (
          <span className="absolute left-3 bottom-3 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
            {property.operacion}
          </span>
        )}
        {property.estado === "Nuevo" && (
          <span className="absolute right-3 top-3 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">
            Estreno
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="font-serif text-xl font-semibold text-primary">
          {formatPrice(property.precio, property.moneda)}
          {property.operacion === "Alquiler" && (
            <span className="text-sm font-normal text-muted-foreground">/mes</span>
          )}
        </p>
        <h3 className="mt-1 line-clamp-1 text-base font-semibold text-foreground">
          {propertyTitle(property.tipo, property.barrio, property.dormitorios)}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin size={14} className="shrink-0" />
          {property.barrio}, {property.departamento}
        </p>

        <div className="mt-4 flex flex-wrap gap-4 border-t border-border pt-4 text-sm text-muted-foreground">
          {property.tipo !== "Lote" && property.tipo !== "Campo" && (
            <span className="flex items-center gap-1.5">
              <BedDouble size={16} /> {property.dormitorios}
            </span>
          )}
          {property.tipo !== "Lote" && property.tipo !== "Campo" && (
            <span className="flex items-center gap-1.5">
              <Bath size={16} /> {property.banos}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Maximize size={16} /> {property.superficieTotal} m²
          </span>
        </div>
      </div>
    </Link>
  );
}

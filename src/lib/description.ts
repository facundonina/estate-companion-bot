import type { Property } from "@/data/properties";

// Genera una descripción extendida y atractiva acorde a las características
// reales de cada propiedad. Usa la descripción base como apertura y agrega
// párrafos coherentes con los atributos disponibles.

const zonaPremium = [
  "Punta Carretas",
  "Pocitos",
  "Carrasco",
  "Punta del Este",
  "Parque Rodó",
];

function intro(p: Property): string {
  const esLote = p.tipo === "Lote" || p.tipo === "Campo";
  if (esLote) {
    return p.tipo === "Campo"
      ? `Excelente campo ubicado en ${p.barrio}, ${p.departamento}, con ${p.superficieTotal} m² ideales para producción, inversión o proyecto rural.`
      : `Lote en ${p.barrio}, ${p.departamento}, de ${p.superficieTotal} m². Una oportunidad inmejorable para construir la casa de tus sueños o invertir en una zona de proyección.`;
  }

  const nuevo = p.estado === "Nuevo";
  const tradicional = zonaPremium.includes(p.barrio) || zonaPremium.includes(p.zona);

  if (nuevo) {
    return `${p.tipo} a estrenar de ${p.dormitorios} dormitorio${
      p.dormitorios === 1 ? "" : "s"
    } en ${p.barrio}, ${p.departamento}. Una propiedad moderna y lista para habitar${
      tradicional ? ", en un barrio consolidado y de gran demanda." : ", en una zona de alto crecimiento."
    }`;
  }

  if (p.anioConstruccion && p.anioConstruccion < 1990) {
    return `${p.tipo} de ${p.dormitorios} dormitorio${
      p.dormitorios === 1 ? "" : "s"
    } con identidad propia en ${p.barrio}, ${p.departamento}. Una propiedad de buena estructura, ideal para quienes buscan personalizarla a su gusto${
      tradicional ? " en un barrio tradicional y bien servido." : "."
    }`;
  }

  return `${p.tipo} de ${p.dormitorios} dormitorio${
    p.dormitorios === 1 ? "" : "s"
  } en ${p.barrio}, ${p.departamento}${
    tradicional ? ", uno de los barrios más buscados de la zona." : ", en una ubicación práctica y bien conectada."
  }`;
}

function comodidades(p: Property): string {
  if (p.tipo === "Lote" || p.tipo === "Campo") return "";
  const items: string[] = [];
  if (p.garage) items.push("garage");
  if (p.terraza) items.push("terraza o balcón");
  if (p.parrillero) items.push("parrillero");
  if (p.piscina) items.push("piscina");
  if (p.ascensor) items.push("ascensor");
  if (p.amueblado) items.push("opción amueblado");
  if (items.length === 0) return "";

  const last = items.pop();
  const list = items.length ? `${items.join(", ")} y ${last}` : last;
  return `Entre sus comodidades se destaca: ${list}.`;
}

function cierre(p: Property): string {
  if (p.aptoBanco) {
    return "La propiedad es apta para crédito bancario, lo que facilita la financiación de tu compra.";
  }
  if (p.tipo === "Lote" || p.tipo === "Campo") {
    return "Ideal tanto para uso propio como para inversión a mediano y largo plazo.";
  }
  return "Coordiná una visita y descubrí todo lo que esta propiedad tiene para ofrecerte.";
}

export function buildLongDescription(p: Property): string[] {
  const base = p.descripcion?.trim();
  const paragraphs = [intro(p)];
  if (base && !paragraphs[0].includes(base)) paragraphs.push(base + ".");
  const com = comodidades(p);
  if (com) paragraphs.push(com);
  paragraphs.push(cierre(p));
  return paragraphs;
}

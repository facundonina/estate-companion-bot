import type { Property } from "@/data/properties";

// Tags por tipo para traer una foto relacionada (no exacta) a la propiedad.
const tagsByType: Record<string, string> = {
  Apartamento: "apartment,building,interior",
  Casa: "house,home,facade",
  Lote: "land,plot,terrain",
  Campo: "farm,countryside,field",
};

/**
 * Devuelve una URL de foto única por propiedad y acorde a su tipo.
 * Usa el id como "lock" para que la imagen sea estable y no se repita.
 */
export function propertyImage(p: Property, w = 800, h = 600): string {
  // Si la propiedad trae una foto real del catálogo, la usamos (ajustando el ancho).
  if (p.fotoUrl && /^https?:\/\//.test(p.fotoUrl)) {
    return p.fotoUrl.replace(/([?&]w=)\d+/, `$1${w}`);
  }
  const tag = tagsByType[p.tipo] ?? "house,home";
  return `https://loremflickr.com/${w}/${h}/${tag}?lock=${p.id}`;
}

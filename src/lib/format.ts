export function formatPrice(value: number, moneda = "USD"): string {
  const prefix = moneda === "USD" ? "U$S" : "$";
  return `${prefix} ${value.toLocaleString("es-UY")}`;
}

export function propertyTitle(tipo: string, barrio: string, dormitorios: number): string {
  if (tipo === "Lote" || tipo === "Campo") return `${tipo} en ${barrio}`;
  return `${tipo} ${dormitorios} dorm. en ${barrio}`;
}

// Sistema de puntuación del lead 100% dinámico (sin rangos fijos).
// El puntaje se calcula combinando: tipo de operación, financiación, plazo en
// meses (dinámico) y precio real de la propiedad de interés (dinámico).

export type Prioridad = "Alta" | "Media" | "Baja";

export type FinanciacionKey =
  | "efectivo"
  | "credito_aprobado"
  | "credito_tramite"
  | "sin_definir";

export interface LeadScoreInput {
  /** Operación de la propiedad de interés ("Venta" | "Alquiler"). */
  operacion?: string | null;
  /** Texto libre de financiación recolectado en la charla. */
  financiamiento?: string | null;
  /** Plazo de compra en meses (número exacto). */
  plazoMeses?: number | null;
  /** Precio real de la propiedad por la que mostró interés (USD). */
  precio?: number | null;
}

export interface LeadScoreResult {
  puntaje: number;
  prioridad: Prioridad;
  /** Clave normalizada de financiación usada en el cálculo. */
  financiacionKey: FinanciacionKey;
}

function norm(s?: string | null): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Mapea el texto libre de financiación a una de las claves del puntaje.
export function mapFinanciacion(raw?: string | null): FinanciacionKey {
  const t = norm(raw);
  if (!t) return "sin_definir";
  if (t.includes("efectivo") || t.includes("contado") || t.includes("cash"))
    return "efectivo";
  if (t.includes("aprobad")) return "credito_aprobado";
  if (
    t.includes("credito") ||
    t.includes("hipotec") ||
    t.includes("tramite") ||
    t.includes("banco") ||
    t.includes("prestamo")
  )
    return "credito_tramite";
  if (t.includes("sin definir") || t.includes("no se") || t.includes("nose"))
    return "sin_definir";
  return "sin_definir";
}

// Convierte la operación de la propiedad a "compra" | "alquiler".
function tipoOperacion(operacion?: string | null): "compra" | "alquiler" | null {
  const t = norm(operacion);
  if (!t) return null;
  if (t.includes("alquiler") || t.includes("renta")) return "alquiler";
  return "compra";
}

export function calcularLeadScore(input: LeadScoreInput): LeadScoreResult {
  let puntaje = 0;

  // Tipo de operación (0-20 pts)
  const op = tipoOperacion(input.operacion);
  if (op === "compra") puntaje += 20;
  else if (op === "alquiler") puntaje += 8;

  // Financiación (0-30 pts)
  const finMap: Record<FinanciacionKey, number> = {
    efectivo: 30,
    credito_aprobado: 22,
    credito_tramite: 12,
    sin_definir: 3,
  };
  const financiacionKey = mapFinanciacion(input.financiamiento);
  puntaje += finMap[financiacionKey] || 0;

  // Plazo dinámico: 25 pts base, resta 1 por cada mes (mínimo 0)
  const meses =
    typeof input.plazoMeses === "number" && input.plazoMeses > 0
      ? input.plazoMeses
      : 24;
  puntaje += Math.max(0, 25 - meses);

  // Precio dinámico: hasta 25 pts, proporcional al precio real.
  // Referencia: USD 1.000.000 = 25 pts
  const precioRef = 1000000;
  const precio =
    typeof input.precio === "number" && input.precio > 0 ? input.precio : 0;
  puntaje += Math.min(25, (precio / precioRef) * 25);

  // Prioridad final
  let prioridad: Prioridad;
  if (puntaje >= 70) prioridad = "Alta";
  else if (puntaje >= 40) prioridad = "Media";
  else prioridad = "Baja";

  return { puntaje: Math.round(puntaje), prioridad, financiacionKey };
}

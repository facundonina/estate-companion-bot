// ===========================================================================
// Calificación automática de leads — LÓGICA PURA, SIN IA.
// El puntaje y la prioridad se calculan exclusivamente con código según una
// fórmula fija. El modelo de Gemini NUNCA decide ni el puntaje ni la prioridad:
// solo recolecta los datos del perfil y dispara registrar_lead.
// ===========================================================================
import { properties } from "@/data/properties";

export interface LeadProfileForScoring {
  /** "Venta" | "Alquiler" */
  operacion?: string;
  zona?: string;
  tipo?: string;
  presupuesto?: number;
  /** Intención de compra / plazo de mudanza */
  intencionCompra?: string;
  /** Método de pago */
  metodoPago?: string;
  /** ID de la propiedad puntual de interés, si la hay */
  propiedadInteresId?: number;
  nombre?: string;
  telefono?: string;
  email?: string;
}

export interface LeadScoreResult {
  puntaje: number; // 0 a 9
  prioridad: "Alta" | "Media" | "Baja";
  matchEnCatalogo: boolean;
  esVenta: boolean;
}

// Normaliza: minúsculas, sin acentos, sin espacios extra.
function norm(s: string | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Puntos por intención de compra / plazo de mudanza.
function puntosIntencion(v: string | undefined): number {
  const n = norm(v);
  if (n.includes("menos de 3") || n.includes("menos de tres")) return 3;
  if (n.includes("3 a 6") || n.includes("3 a seis") || n.includes("tres a seis"))
    return 2;
  if (n.includes("en el ano") || n.includes("dentro del ano") || n === "este ano")
    return 1;
  return 0;
}

// Puntos por método de pago.
function puntosMetodoPago(v: string | undefined): number {
  const n = norm(v);
  if (n.includes("efectivo")) return 3;
  if (n.includes("hipotecario") && n.includes("aprobad")) return 3;
  if (n.includes("credito") && (n.includes("tramite") || n.includes("gestion")))
    return 1;
  return 0;
}

// Detecta valores basura o de prueba en texto libre.
function esBasura(s: string | undefined): boolean {
  const n = norm(s);
  if (!n) return true;
  if (n.length < 2) return true;
  if (/^(test|prueba|asd|asdf|qwe|aaa+|xxx+|sin nombre|no se|nose|na|n\/a)$/.test(n))
    return true;
  if (/(.)\1{3,}/.test(n)) return true; // 4+ repeticiones del mismo caracter
  return false;
}

// Teléfono válido: al menos 8 dígitos.
function telefonoValido(v: string | undefined): boolean {
  const digits = (v || "").replace(/\D/g, "");
  if (digits.length < 8) return false;
  if (/^(\d)\1+$/.test(digits)) return false; // 0000000000, 1111111111...
  if (/^(0123456789|1234567890|12345678)/.test(digits)) return false;
  return true;
}

// Email con formato válido.
function emailValido(v: string | undefined): boolean {
  const s = (v || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return false;
  if (/(test|prueba|ejemplo|example|asdf)@/.test(norm(s))) return false;
  return true;
}

// Presupuesto real (no basura / no de prueba).
function presupuestoValido(v: number | undefined): boolean {
  return typeof v === "number" && isFinite(v) && v >= 1000;
}

/**
 * Determina si hay al menos una propiedad REAL en el catálogo que matchee la
 * zona y el tipo del lead dentro de su presupuesto (y operación correcta).
 */
export function matchEnCatalogo(perfil: LeadProfileForScoring): boolean {
  const z = norm(perfil.zona);
  const t = norm(perfil.tipo);
  const op = norm(perfil.operacion);
  const presupuesto = perfil.presupuesto;
  if (!z && !t) return false;

  return properties.some((p) => {
    if (p.disponible === false) return false;
    if (op && norm(p.operacion) !== op) return false;
    if (z && !norm(`${p.zona} ${p.barrio} ${p.departamento}`).includes(z))
      return false;
    if (t && !norm(p.tipo).includes(t)) return false;
    if (presupuestoValido(presupuesto) && p.precio > (presupuesto as number) * 1.1)
      return false;
    return true;
  });
}

/**
 * Calcula el puntaje (0–9) y la prioridad del lead con lógica de código pura.
 *
 * - Alquiler => 0 puntos, prioridad Baja (no genera comisión).
 * - Venta => suma de 4 factores:
 *     intención de compra (0–3) + método de pago (0–3) +
 *     match en catálogo (0 o 2) + completitud de datos (0 o 1).
 *
 * Prioridad: >=6 Alta, 3–5 Media, <=2 Baja.
 */
export function computeLeadScore(
  perfil: LeadProfileForScoring,
): LeadScoreResult {
  const esVenta = norm(perfil.operacion) === "venta";
  const match = matchEnCatalogo(perfil);

  // Filtro: alquiler => puntaje 0, prioridad Baja, sin calcular nada más.
  if (!esVenta) {
    return { puntaje: 0, prioridad: "Baja", matchEnCatalogo: match, esVenta };
  }

  const pIntencion = puntosIntencion(perfil.intencionCompra);
  const pPago = puntosMetodoPago(perfil.metodoPago);
  const pMatch = match ? 2 : 0;

  // Completitud: teléfono + email válidos y presupuesto/intención/pago
  // completos y no basura.
  const datosCompletos =
    telefonoValido(perfil.telefono) &&
    emailValido(perfil.email) &&
    presupuestoValido(perfil.presupuesto) &&
    pIntencion > 0 &&
    pPago > 0 &&
    !esBasura(perfil.nombre);
  const pCompletitud = datosCompletos ? 1 : 0;

  const puntaje = pIntencion + pPago + pMatch + pCompletitud; // 0–9

  let prioridad: "Alta" | "Media" | "Baja";
  if (puntaje >= 6) prioridad = "Alta";
  else if (puntaje >= 3) prioridad = "Media";
  else prioridad = "Baja";

  return { puntaje, prioridad, matchEnCatalogo: match, esVenta };
}

// Envía los datos del lead a un Google Apps Script Web App que escribe una
// fila en la planilla "Leads" de Google Sheets.
//
// Estructura de columnas de la planilla (en este orden):
//   Fecha | Nombre | Teléfono | Email | Zona | Tipo | Presupuesto (USD) |
//   Intención de compra | Método de pago | Operación | Propiedad de Interés |
//   Match en Catálogo | Puntaje | Prioridad
//
// El Puntaje y la Prioridad SIEMPRE los calcula el sistema (computeLeadScore),
// nunca el modelo de Gemini.

const SHEETS_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbxzxSkjCW8YzeyBtAIOQ4bTiERaYunrtL5tdlLe8O2y_rWQzADqmXbJzIXxI6LawyLpwQ/exec";

// Una fila de la planilla de Leads, ya calculada.
export interface LeadRow {
  fecha: string;
  nombre: string;
  telefono: string;
  email: string;
  zona: string;
  tipo: string;
  /** Presupuesto en USD (número o vacío). */
  presupuesto: number | "";
  intencionCompra: string;
  metodoPago: string;
  operacion: string;
  propiedadInteres: string;
  /** "Sí" | "No" — calculado por el sistema. */
  matchEnCatalogo: string;
  /** 0–9 — calculado por el sistema. */
  puntaje: number;
  /** Alta | Media | Baja — calculado por el sistema. */
  prioridad: string;
}

// Construye el body que entiende el Apps Script (claves = columnas).
function buildBody(row: LeadRow) {
  return {
    fecha: row.fecha,
    nombre: row.nombre ?? "",
    telefono: row.telefono ?? "",
    email: row.email ?? "",
    zona: row.zona ?? "",
    tipo: row.tipo ?? "",
    presupuesto: row.presupuesto ?? "",
    intencionCompra: row.intencionCompra ?? "",
    metodoPago: row.metodoPago ?? "",
    operacion: row.operacion ?? "",
    propiedadInteres: row.propiedadInteres ?? "",
    matchEnCatalogo: row.matchEnCatalogo ?? "",
    puntaje: row.puntaje ?? "",
    prioridad: row.prioridad ?? "",
  };
}

/**
 * Escribe la fila desde el SERVIDOR (usado por la tool registrar_lead).
 * En el servidor no hay restricciones CORS, así que se hace un POST normal.
 */
export async function writeLeadRowServer(row: LeadRow) {
  try {
    const res = await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(buildBody(row)),
    });
    return { ok: res.ok as boolean };
  } catch (err) {
    console.error("[leadSheet] No se pudo escribir la fila (server):", err);
    return { ok: false as const, reason: "fetch-error" };
  }
}

/**
 * Escribe la fila desde el NAVEGADOR (mode no-cors, respuesta opaca).
 * Se mantiene para compatibilidad con flujos del cliente.
 */
export async function sendLeadRow(row: LeadRow) {
  try {
    console.log("Enviando lead a Sheets...");
    await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(buildBody(row)),
    });
    console.log("Lead enviado");
    return { ok: true as const };
  } catch (err) {
    console.error("[leadSheet] No se pudo enviar el lead:", err);
    return { ok: false as const, reason: "fetch-error" };
  }
}

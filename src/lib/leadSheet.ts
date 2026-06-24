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
  /**
   * Columna "Intención de compra": recibe el TEXTO LITERAL que dijo el usuario
   * (intencion_compra_texto), NO la categoría fija usada para el puntaje.
   */
  intencionCompra: string;
  /**
   * Columna "Método de pago": recibe el TEXTO LITERAL que dijo el usuario
   * (metodo_pago_texto), NO la categoría fija usada para el puntaje.
   */
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

// Construye el body que entiende el Apps Script.
// Enviamos los datos de TRES formas para máxima compatibilidad con el writer
// de la planilla, garantizando que Puntaje, Match en Catálogo y Propiedad de
// Interés nunca lleguen vacíos:
//   1) claves camelCase (compatibilidad con la versión anterior),
//   2) alias con el nombre EXACTO de cada columna de la planilla,
//   3) un array "valores"/"values" en el MISMO orden que las columnas.
function buildBody(row: LeadRow) {
  const presupuesto = row.presupuesto ?? "";
  const matchEnCatalogo = row.matchEnCatalogo ?? "";
  const puntaje = row.puntaje ?? "";
  const prioridad = row.prioridad ?? "";
  const propiedadInteres = row.propiedadInteres ?? "";

  // Fila ordenada según las columnas de la planilla "Leads".
  const valores = [
    row.fecha ?? "",
    row.nombre ?? "",
    row.telefono ?? "",
    row.email ?? "",
    row.zona ?? "",
    row.tipo ?? "",
    presupuesto,
    row.intencionCompra ?? "",
    row.metodoPago ?? "",
    row.operacion ?? "",
    propiedadInteres,
    matchEnCatalogo,
    puntaje,
    prioridad,
  ];

  return {
    // 1) Claves camelCase
    fecha: row.fecha,
    nombre: row.nombre ?? "",
    telefono: row.telefono ?? "",
    email: row.email ?? "",
    zona: row.zona ?? "",
    tipo: row.tipo ?? "",
    presupuesto,
    intencionCompra: row.intencionCompra ?? "",
    metodoPago: row.metodoPago ?? "",
    operacion: row.operacion ?? "",
    propiedadInteres,
    matchEnCatalogo,
    puntaje,
    prioridad,
    // 2) Alias con el nombre EXACTO de cada columna
    Fecha: row.fecha,
    Nombre: row.nombre ?? "",
    "Teléfono": row.telefono ?? "",
    Email: row.email ?? "",
    Zona: row.zona ?? "",
    Tipo: row.tipo ?? "",
    "Presupuesto (USD)": presupuesto,
    "Intención de compra": row.intencionCompra ?? "",
    "Método de pago": row.metodoPago ?? "",
    "Operación": row.operacion ?? "",
    "Propiedad de Interés": propiedadInteres,
    "Match en Catálogo": matchEnCatalogo,
    Puntaje: puntaje,
    Prioridad: prioridad,
    // 3) Fila ordenada por si el Apps Script hace appendRow(values)
    valores,
    values: valores,
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

/**
 * Envía la fila como ÚLTIMO recurso cuando la página se está cerrando o quedó
 * inactiva. Usa navigator.sendBeacon: el navegador garantiza el envío aunque la
 * pestaña se cierre, cosa que un fetch normal no asegura. Si sendBeacon no está
 * disponible, cae a sendLeadRow con keepalive.
 */
export function sendLeadBeacon(row: LeadRow): boolean {
  try {
    const payload = JSON.stringify(buildBody(row));
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
      const ok = navigator.sendBeacon(SHEETS_WEBHOOK_URL, blob);
      if (ok) return true;
    }
    // Fallback: fetch con keepalive (también sobrevive al cierre, mejor esfuerzo).
    void fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      headers: { "Content-Type": "text/plain" },
      body: payload,
    }).catch(() => {});
    return true;
  } catch (err) {
    console.error("[leadSheet] No se pudo enviar el beacon:", err);
    return false;
  }
}

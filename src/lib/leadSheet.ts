// Envía los datos del lead directamente desde el navegador a un
// Google Apps Script Web App. Se usa mode: "no-cors" porque el endpoint
// de Apps Script no devuelve cabeceras CORS; la respuesta será opaca.

const SHEETS_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbxzxSkjCW8YzeyBtAIOQ4bTiERaYunrtL5tdlLe8O2y_rWQzADqmXbJzIXxI6LawyLpwQ/exec";

export interface LeadSheetPayload {
  nombre?: string;
  telefono?: string;
  email?: string;
  mensaje?: string;
  zona?: string;
  tipo?: string;
  dormitorios?: number;
  presupuesto?: number;
  proposito?: string;
  urgencia?: string;
  financiamiento?: string;
  /** Plazo de compra en número de meses (exacto). */
  plazoMeses?: number;
  /** Precio real de la propiedad de interés (USD). */
  precio?: number;
  /** Puntaje numérico calculado del lead. */
  puntaje?: number;
  prioridad?: string;
  /** Propiedad puntual que está consultando el lead. */
  propiedad?: string;
  propiedadId?: number;
  propiedadLink?: string;
}

export async function sendLeadToSheet(lead: LeadSheetPayload) {
  const body = {
    fecha: new Date().toISOString(),
    nombre: lead.nombre ?? "",
    telefono: lead.telefono ?? "",
    email: lead.email ?? "",
    mensaje: lead.mensaje ?? "",
    propiedad: lead.propiedad ?? "",
    propiedadId: lead.propiedadId ?? "",
    propiedadLink: lead.propiedadLink ?? "",
    zona: lead.zona ?? "",
    tipo: lead.tipo ?? "",
    dormitorios: lead.dormitorios ?? "",
    presupuesto: lead.presupuesto ?? "",
    proposito: lead.proposito ?? "",
    urgencia: lead.urgencia ?? "",
    financiamiento: lead.financiamiento ?? "",
    prioridad: lead.prioridad ?? "",
  };

  try {
    console.log("Enviando lead a Sheets...");
    await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    console.log("Lead enviado");
    return { ok: true as const };
  } catch (err) {
    console.error("[leadSheet] No se pudo enviar el lead:", err);
    return { ok: false as const, reason: "fetch-error" };
  }
}

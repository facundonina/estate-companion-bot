// Envía los datos del lead a una hoja de Google Sheets a través de un
// Google Apps Script Web App. Configurá la URL del script publicado en
// la variable de entorno VITE_SHEETS_WEBHOOK_URL.
//
// El Apps Script debe escribir las columnas en este orden (o por nombre):
// fecha, nombre, telefono, email, mensaje, zona, tipo, dormitorios,
// presupuesto, proposito, urgencia, financiamiento, prioridad.

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
  prioridad?: string;
}

const WEBHOOK_URL = import.meta.env.VITE_SHEETS_WEBHOOK_URL as
  | string
  | undefined;

export async function sendLeadToSheet(lead: LeadSheetPayload): Promise<void> {
  const body = {
    fecha: new Date().toISOString(),
    nombre: lead.nombre ?? "",
    telefono: lead.telefono ?? "",
    email: lead.email ?? "",
    mensaje: lead.mensaje ?? "",
    zona: lead.zona ?? "",
    tipo: lead.tipo ?? "",
    dormitorios: lead.dormitorios ?? "",
    presupuesto: lead.presupuesto ?? "",
    proposito: lead.proposito ?? "",
    urgencia: lead.urgencia ?? "",
    financiamiento: lead.financiamiento ?? "",
    prioridad: lead.prioridad ?? "",
  };

  if (!WEBHOOK_URL) {
    // Todavía no hay URL de Google Sheets configurada.
    console.info("[leadSheet] Sin VITE_SHEETS_WEBHOOK_URL. Lead:", body);
    return;
  }

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      // Apps Script suele requerir no-cors / text para evitar preflight.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[leadSheet] No se pudo enviar el lead:", err);
  }
}

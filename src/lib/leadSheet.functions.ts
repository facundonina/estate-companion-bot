import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Envía los datos del lead a una hoja de Google Sheets a través de un
// Google Apps Script Web App. La URL se guarda en el secreto SHEETS_WEBHOOK_URL.
//
// El Apps Script debe escribir las columnas (por nombre o en este orden):
// fecha, nombre, telefono, email, mensaje, zona, tipo, dormitorios,
// presupuesto, proposito, urgencia, financiamiento, prioridad.

const leadSchema = z.object({
  nombre: z.string().max(120).optional(),
  telefono: z.string().max(40).optional(),
  email: z.string().max(255).optional(),
  mensaje: z.string().max(1000).optional(),
  zona: z.string().max(120).optional(),
  tipo: z.string().max(60).optional(),
  dormitorios: z.number().optional(),
  presupuesto: z.number().optional(),
  proposito: z.string().max(60).optional(),
  urgencia: z.string().max(60).optional(),
  financiamiento: z.string().max(80).optional(),
  prioridad: z.string().max(20).optional(),
});

export type LeadSheetPayload = z.infer<typeof leadSchema>;

export const sendLeadToSheet = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => leadSchema.parse(data))
  .handler(async ({ data }) => {
    const url = process.env.SHEETS_WEBHOOK_URL;

    const body = {
      fecha: new Date().toISOString(),
      nombre: data.nombre ?? "",
      telefono: data.telefono ?? "",
      email: data.email ?? "",
      mensaje: data.mensaje ?? "",
      zona: data.zona ?? "",
      tipo: data.tipo ?? "",
      dormitorios: data.dormitorios ?? "",
      presupuesto: data.presupuesto ?? "",
      proposito: data.proposito ?? "",
      urgencia: data.urgencia ?? "",
      financiamiento: data.financiamiento ?? "",
      prioridad: data.prioridad ?? "",
    };

    if (!url) {
      console.info("[leadSheet] Sin SHEETS_WEBHOOK_URL. Lead:", body);
      return { ok: false as const, reason: "no-url" };
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ok: res.ok as boolean };
    } catch (err) {
      console.error("[leadSheet] No se pudo enviar el lead:", err);
      return { ok: false as const, reason: "fetch-error" };
    }
  });

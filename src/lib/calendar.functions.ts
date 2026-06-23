// Server functions para integrar Google Calendar a través del connector
// gateway de Lovable. La lógica real vive en ./calendar.server (server-only);
// acá solo exponemos los endpoints RPC que consume el cliente.

import { createServerFn } from "@tanstack/react-start";

export type { CalendarSlot, CreateEventInput } from "./calendar.server";
import type { CalendarSlot, CreateEventInput } from "./calendar.server";

// Consulta Google Calendar y devuelve los bloques de 1 hora disponibles.
export const getAvailableSlots = createServerFn({ method: "GET" }).handler(
  async (): Promise<CalendarSlot[]> => {
    const { getAvailableSlotsCore } = await import("./calendar.server");
    return getAvailableSlotsCore();
  },
);

// Crea el evento de la visita en Google Calendar.
export const createCalendarEvent = createServerFn({ method: "POST" })
  .inputValidator((data: CreateEventInput) => data)
  .handler(async ({ data }) => {
    const { createCalendarEventCore } = await import("./calendar.server");
    return createCalendarEventCore(data);
  });

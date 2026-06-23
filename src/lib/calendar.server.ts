// Lógica de servidor para Google Calendar (a través del connector gateway de
// Lovable). Este módulo es server-only (sufijo .server) y NO debe importarse
// en el nivel superior de archivos del bundle del cliente: se importa de forma
// dinámica dentro de los handlers de server functions / tools.

const GATEWAY_URL =
  "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

// Uruguay (America/Montevideo) usa un offset fijo de -03:00 (sin horario de verano).
const TZ_OFFSET = "-03:00";
export const TIME_ZONE = "America/Montevideo";

const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

// Horarios laborables: bloques de 1 hora entre las 9:00 y las 18:00.
const START_HOUR = 9;
const END_HOUR = 18; // último bloque comienza a las 17:00 y termina a las 18:00.
const LOOKAHEAD_DAYS = 4;

export interface CalendarSlot {
  id: string;
  label: string; // p.ej. "Mié 11 jun"
  time: string; // p.ej. "10:00 hs"
  startISO: string; // inicio del bloque con offset (-03:00)
  endISO: string; // fin del bloque (1 hora después)
}

export interface CreateEventInput {
  startISO: string;
  endISO: string;
  cliente: string;
  zona?: string;
  tipo?: string;
  propiedad?: string;
  email?: string;
}

function gatewayHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const connKey = process.env.GOOGLE_CALENDAR_API_KEY;
  if (!lovableKey || !connKey) {
    throw new Error(
      "Faltan credenciales del connector de Google Calendar (LOVABLE_API_KEY / GOOGLE_CALENDAR_API_KEY).",
    );
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connKey,
    "Content-Type": "application/json",
  };
}

// Devuelve las partes (año, mes, día) de "hoy" en la zona horaria de Montevideo.
function montevideoToday(): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [y, m, d] = fmt.format(new Date()).split("-").map(Number);
  return { y, m, d };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Genera todos los bloques candidatos para los próximos LOOKAHEAD_DAYS días.
function buildCandidateSlots(): CalendarSlot[] {
  const { y, m, d } = montevideoToday();
  const slots: CalendarSlot[] = [];
  for (let dayOffset = 1; dayOffset <= LOOKAHEAD_DAYS; dayOffset++) {
    const base = new Date(Date.UTC(y, m - 1, d + dayOffset));
    const yy = base.getUTCFullYear();
    const mm = base.getUTCMonth();
    const dd = base.getUTCDate();
    const dow = base.getUTCDay();
    const label = `${DAYS[dow]} ${dd} ${MONTHS[mm]}`;
    for (let h = START_HOUR; h < END_HOUR; h++) {
      const startISO = `${yy}-${pad(mm + 1)}-${pad(dd)}T${pad(h)}:00:00${TZ_OFFSET}`;
      const endISO = `${yy}-${pad(mm + 1)}-${pad(dd)}T${pad(h + 1)}:00:00${TZ_OFFSET}`;
      slots.push({
        id: `${yy}${pad(mm + 1)}${pad(dd)}-${pad(h)}`,
        label,
        time: `${pad(h)}:00 hs`,
        startISO,
        endISO,
      });
    }
  }
  return slots;
}

interface GCalEvent {
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

// Consulta Google Calendar y devuelve los bloques de 1 hora disponibles.
export async function getAvailableSlotsCore(): Promise<CalendarSlot[]> {
  const candidates = buildCandidateSlots();
  if (candidates.length === 0) return [];

  const timeMin = candidates[0].startISO;
  const timeMax = candidates[candidates.length - 1].endISO;

  const url =
    `${GATEWAY_URL}/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(timeMin)}` +
    `&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=250`;

  const res = await fetch(url, { headers: gatewayHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar (events.list) ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { items?: GCalEvent[] };
  const events = data.items ?? [];

  const busy: Array<{ start: number; end: number }> = [];
  for (const ev of events) {
    if (ev.status === "cancelled") continue;
    if (ev.transparency === "transparent") continue;
    const s = ev.start?.dateTime ?? ev.start?.date;
    const e = ev.end?.dateTime ?? ev.end?.date;
    if (!s || !e) continue;
    busy.push({ start: new Date(s).getTime(), end: new Date(e).getTime() });
  }

  const now = Date.now();
  return candidates.filter((slot) => {
    const slotStart = new Date(slot.startISO).getTime();
    const slotEnd = new Date(slot.endISO).getTime();
    if (slotStart <= now) return false;
    return !busy.some((b) => b.start < slotEnd && b.end > slotStart);
  });
}

// Crea el evento de la visita en Google Calendar.
export async function createCalendarEventCore(data: CreateEventInput) {
  const descripcionLineas = [
    data.zona ? `Zona: ${data.zona}` : null,
    data.tipo ? `Tipo: ${data.tipo}` : null,
    data.propiedad ? `Propiedad de interés: ${data.propiedad}` : null,
    data.email ? `Email del cliente: ${data.email}` : null,
  ].filter(Boolean);

  const event: Record<string, unknown> = {
    summary: `Visita de propiedad - ${data.cliente}`,
    description: descripcionLineas.join("\n"),
    start: { dateTime: data.startISO, timeZone: TIME_ZONE },
    end: { dateTime: data.endISO, timeZone: TIME_ZONE },
    conferenceData: {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };

  if (data.email) {
    event.attendees = [{ email: data.email }];
  }

  const url =
    `${GATEWAY_URL}/calendars/primary/events` +
    `?conferenceDataVersion=1&sendUpdates=all`;

  const res = await fetch(url, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify(event),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Calendar (events.insert) ${res.status}: ${body}`);
  }
  const created = (await res.json()) as {
    id?: string;
    htmlLink?: string;
    hangoutLink?: string;
  };
  return {
    ok: true as const,
    id: created.id,
    htmlLink: created.htmlLink,
    meetLink: created.hangoutLink,
  };
}

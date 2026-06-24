// Almacena los datos del lead durante la sesión para no volver a pedirle el
// formulario en otras propiedades. Una vez que el usuario dejó sus datos (y
// eventualmente su calificación), los reutilizamos para abrir un chat nuevo
// directamente, sin volver a rellenar nada.

export interface StoredLead {
  nombre: string;
  telefono: string;
  email: string;
  mensaje?: string;
  // Datos de calificación que se hayan recolectado en un chat previo.
  metodoPagoTexto?: string;
  metodoPagoCategoria?: string;
  intencionCompraTexto?: string;
  intencionCompraCategoria?: string;
  presupuesto?: number;
  prioridad?: string;
}

const KEY = "habita_lead";

export function getStoredLead(): StoredLead | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLead;
    if (!parsed || !parsed.nombre) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredLead(lead: StoredLead): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(lead));
  } catch {
    /* sessionStorage no disponible */
  }
}

// Combina datos nuevos con los ya guardados (por ejemplo, la calificación
// recolectada en el chat) sin perder los anteriores.
export function mergeStoredLead(patch: Partial<StoredLead>): void {
  const current = getStoredLead();
  if (!current) return;
  setStoredLead({ ...current, ...patch });
}

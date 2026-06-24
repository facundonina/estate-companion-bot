// Detección simple de mensajes con enojo / insultos para ofrecer ayuda humana.

const INSULTOS = [
  "puta",
  "puto",
  "mierda",
  "carajo",
  "joder",
  "jodete",
  "jodanse",
  "pelotudo",
  "boludo",
  "forro",
  "idiota",
  "imbecil",
  "imbécil",
  "estupido",
  "estúpido",
  "tarado",
  "garca",
  "basura",
  "inutil",
  "inútil",
  "asco",
  "cagada",
  "concha",
  "verga",
  "pendejo",
  "gilipollas",
  "cabron",
  "cabrón",
  "fuck",
  "shit",
  "wtf",
];

const FRASES_ENOJO = [
  "no sirve",
  "no funciona",
  "esto es una porqueria",
  "esto es una porquería",
  "que mal",
  "estoy harto",
  "estoy harta",
  "me tienen harto",
  "me tienen harta",
  "no entendes nada",
  "no entendés nada",
  "sos un desastre",
  "que perdida de tiempo",
  "qué pérdida de tiempo",
  "perdida de tiempo",
  "pérdida de tiempo",
  "andate",
  "callate",
  "cállate",
];

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isAngryMessage(raw: string): boolean {
  const t = normalizar(raw);

  // Coincidencia de insultos como palabra completa.
  const palabras = t.split(/[^a-zñ]+/i).filter(Boolean);
  if (palabras.some((w) => INSULTOS.some((bad) => normalizar(bad) === w))) {
    return true;
  }

  // Frases de enojo.
  if (FRASES_ENOJO.some((f) => t.includes(normalizar(f)))) return true;

  // Gritar en mayúsculas con varios signos de exclamación.
  if (/!{2,}/.test(raw) && raw.replace(/[^A-Za-z]/g, "").length > 4) {
    const letras = raw.replace(/[^A-Za-z]/g, "");
    const mays = raw.replace(/[^A-Z]/g, "");
    if (letras.length > 0 && mays.length / letras.length > 0.7) return true;
  }

  return false;
}

export function isAffirmative(raw: string): boolean {
  const t = normalizar(raw).trim();
  return /^(si|sí|s|dale|ok|okay|obvio|claro|por favor|porfa|quiero|sip|yes|si quiero)\b/.test(
    t,
  );
}

// Frases con las que el usuario se despide explícitamente y da por terminada
// la conversación.
const FRASES_DESPEDIDA = [
  "chau",
  "chao",
  "adios",
  "adiós",
  "nos vemos",
  "hasta luego",
  "hasta pronto",
  "hasta la proxima",
  "hasta la próxima",
  "me voy",
  "muchas gracias por todo",
  "gracias por todo",
  "gracias, eso es todo",
  "eso es todo",
  "ya esta",
  "ya está",
  "nada mas",
  "nada más",
  "buenas noches",
  "que tengas buen dia",
  "que tengas buen día",
  "saludos",
  "bye",
  "good bye",
  "goodbye",
];

export function isFarewell(raw: string): boolean {
  const t = normalizar(raw).trim();
  if (!t) return false;
  const palabras = t.split(/[^a-zñ]+/i).filter(Boolean);
  // "chau", "chao", "adios", "bye" como palabra suelta.
  if (palabras.some((w) => ["chau", "chao", "adios", "bye"].includes(w))) {
    return true;
  }
  return FRASES_DESPEDIDA.some((f) => t.includes(normalizar(f)));
}

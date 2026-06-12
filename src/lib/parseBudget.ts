// Interpreta el presupuesto escrito a mano por el usuario y lo convierte a un
// número en dólares. Soporta:
//   - Números en cualquier formato: 200000, 200.000, 200,000, USD 200.000, US$ 200.000
//   - Sufijos: "200 mil", "1.8 millones", "80k", "1,8M"
//   - Rangos: "entre 200000 y 250000", "200000 a 250000", "hasta 250000"
//   - Números escritos en palabras: "doscientos mil", "ciento cincuenta mil"

const PALABRAS: Record<string, number> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiuno: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Convierte un texto con números escritos en palabras a su valor numérico.
function wordsToNumber(raw: string): number | null {
  const tokens = stripAccents(raw.toLowerCase())
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let total = 0;
  let current = 0;
  let found = false;

  for (const tok of tokens) {
    if (tok === "y") continue;
    if (tok === "mil") {
      current = current === 0 ? 1 : current;
      total += current * 1000;
      current = 0;
      found = true;
      continue;
    }
    if (tok === "millon" || tok === "millones") {
      current = current === 0 ? 1 : current;
      total += current * 1_000_000;
      current = 0;
      found = true;
      continue;
    }
    if (tok in PALABRAS) {
      current += PALABRAS[tok];
      found = true;
    }
  }

  total += current;
  return found && total > 0 ? total : null;
}

export function parseBudget(raw: string): number | null {
  const t = stripAccents(raw.toLowerCase()).trim();

  // Extrae todos los valores numéricos presentes (con sufijos opcionales).
  const re = /(\d[\d.,]*)\s*(millones|millon|mil|mm|m|k)?/g;
  const values: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const numRaw = m[1];
    const suf = m[2] || "";
    let value: number;
    if (suf === "mil" || suf === "k") {
      value = parseFloat(numRaw.replace(/[.,]/g, "")) * 1000;
    } else if (suf) {
      value = parseFloat(numRaw.replace(",", ".")) * 1_000_000;
    } else {
      value = parseFloat(numRaw.replace(/[.,]/g, ""));
    }
    if (Number.isFinite(value) && value > 0) values.push(Math.round(value));
  }

  // Para rangos ("entre X y Y", "X a Y") tomamos el valor más alto como tope.
  if (values.length > 0) return Math.max(...values);

  // Sin dígitos: intentamos interpretar números escritos en palabras.
  return wordsToNumber(t);
}

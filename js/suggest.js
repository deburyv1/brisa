/* ============================================
   BRISA - Suggest Module
   Deterministic heuristic classifier for captures.
   No NLP: ordered keyword/date rules, reversible by the user.
   ============================================ */

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "setiembre", "octubre", "noviembre", "diciembre",
];

const WEEKDAYS = [
  "lunes", "martes", "miércoles", "miercoles", "jueves", "viernes", "sábado", "sabado", "domingo",
];

const ACTION_VERBS = [
  "llamar", "revisar", "hacer", "lavar", "pagar", "enviar",
  "responder", "preparar", "ordenar", "limpiar", "llevar", "buscar",
  "pedir", "arreglar", "terminar", "empezar", "leer", "escribir",
  "tengo que", "hay que", "necesito hacer", "no olvidar",
];

const BUY_HINTS = [
  "comprar", "compra", "cómprame", "comprame",
  "supermercado", "super ", "feria", "farmacia", "panadería", "panaderia",
];

const IDEA_HINTS = [
  "se me ocurrió", "se me ocurrio", "idea", "podría", "podria",
  "qué tal si", "que tal si", "quiero aprender", "quiero explorar",
  "me gustaría", "me gustaria",
];

const MOOD_HINTS = [
  "me costó", "me costo", "me siento", "estoy", "hoy me", "me cuesta",
];

function hasTimeOfDay(text) {
  return /\d{1,2}:\d{2}/.test(text) || /\ba las\b/.test(text);
}

function hasDateRef(text) {
  if (/\b(hoy|mañana|manana|pasado mañana|el \w+day|\bel\b)/.test(text)) return true;
  if (WEEKDAYS.some(w => text.includes(w))) return true;
  if (MONTHS.some(m => text.includes(m))) return true;
  if (/\b\d{1,2}\s+de\s+\w+/.test(text)) return true;
  return false;
}

// Returns { type, reason }. Types: action | event | note | idea | reminder | purchase
export function suggestType(rawText) {
  const text = rawText.toLowerCase().trim();
  const timeRef = hasTimeOfDay(text);
  const dateRef = hasDateRef(text);

  if (IDEA_HINTS.some(h => text.includes(h))) {
    return { type: "idea", reason: "Parece una idea." };
  }
  if (BUY_HINTS.some(h => text.includes(h))) {
    return { type: "purchase", reason: "Parece una compra." };
  }
  if (timeRef && dateRef) {
    return { type: "event", reason: "Tiene fecha y hora." };
  }
  if (timeRef || (dateRef && /(médico|medico|llamada|reunión|reunion|clase|turno|cita|vuelo|consulta)/.test(text))) {
    return { type: "event", reason: "Tiene fecha u hora." };
  }
  if (dateRef && /(renovar|recordar|revisar|vence|contrato|seguro|suscripción|suscripcion)/.test(text)) {
    return { type: "reminder", reason: "Es algo para recordar a futuro." };
  }
  if (dateRef && ACTION_VERBS.some(v => text.includes(v))) {
    return { type: "action", reason: "Parece una acción con fecha." };
  }
  if (MOOD_HINTS.some(h => text.includes(h))) {
    return { type: "note", reason: "Parece una nota personal." };
  }
  if (ACTION_VERBS.some(v => text.includes(v))) {
    return { type: "action", reason: "Parece una acción." };
  }
  return { type: "action", reason: "Sugerencia inicial, puedes cambiarla." };
}

export const TYPE_LABELS = {
  action: "Acción",
  event: "Evento",
  note: "Nota",
  idea: "Idea",
  reminder: "Recordatorio",
  purchase: "Compra",
};

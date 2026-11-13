import { Router } from 'express';

const router = Router();

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const INPUT_LIMITS = { title: 500, context: 4000, parentTitle: 500, eventTitle: 500, block: 2000 };

function validateTextFields(body, fields) {
  for (const field of fields) {
    const value = body[field];
    if (value != null && (typeof value !== 'string' || value.length > INPUT_LIMITS[field])) {
      return `${field} debe ser texto de hasta ${INPUT_LIMITS[field]} caracteres`;
    }
  }
  return null;
}

function buildPrompt(taskTitle, context = '', parentTitle = '', eventTitle = '') {
  return `Eres un asistente que ayuda a personas con dificultades ejecutivas a descomponer tareas.

La tarea es: "${taskTitle}"
${parentTitle ? `Es un paso de una tarea mayor: "${parentTitle}"` : ''}
${eventTitle ? `Todo esto es preparación para el evento: "${eventTitle}"` : ''}
${context ? `Contexto adicional: ${context}` : ''}

Divide esta tarea en 3 a 6 pasos concretos y accionables. Cada paso debe ser:
- Específico y físico (algo que se pueda hacer, no un concepto)
- Acotado en tiempo (idealmente 5-25 minutos)
- Ordenado de menor a mayor dificultad
${eventTitle ? '- Orientado a que el evento salga bien' : ''}

Responde SOLO con un arreglo JSON de strings, sin markdown, sin texto adicional.
Ejemplo: ["Paso 1", "Paso 2", "Paso 3"]`;
}

async function callGeminiOnce(prompt, maxTokens = 512) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: maxTokens,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Gemini can return 503 under load; retry with backoff.
async function callGemini(prompt, attempts = 3, maxTokens = 512) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callGeminiOnce(prompt, maxTokens);
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 800 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

function parseSteps(raw) {
  // Try to extract JSON array from the response
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array in response');
  const arr = JSON.parse(match[0]);
  if (!Array.isArray(arr)) throw new Error('Response is not an array');
  return arr
    .map(s => String(s).trim())
    .filter(s => s.length > 0)
    .slice(0, 8);
}

// POST /api/ai/split { title, context?, parentTitle?, eventTitle? } → { steps: string[] }
router.post('/split', async (req, res) => {
  const { title, context, parentTitle, eventTitle } = req.body || {};
  const invalid = validateTextFields(req.body || {}, ['title', 'context', 'parentTitle', 'eventTitle']);
  if (invalid) return res.status(400).json({ error: invalid });
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const prompt = buildPrompt(title.trim(), context || '', parentTitle || '', eventTitle || '');
    const raw = await callGemini(prompt);
    const steps = parseSteps(raw);
    if (steps.length === 0) throw new Error('Empty steps');
    res.json({ steps });
  } catch (err) {
    console.error('Gemini split error:', err);
    res.status(502).json({ error: 'No se pudo dividir la tarea. Intenta de nuevo.' });
  }
});

function buildApproachPrompt(title, context = '', parentTitle = '', eventTitle = '') {
  return `Eres Brisa, un acompañante práctico para personas con disfunción ejecutiva. Usa la información disponible para elegir automáticamente la ayuda más útil. Reduce decisiones y no inventes datos.

Acción: "${title}"
${context ? `Información guardada: ${context}` : 'No hay más información guardada.'}
${parentTitle ? `Acción mayor: "${parentTitle}"` : ''}
${eventTitle ? `Evento asociado: "${eventTitle}"` : ''}

Elige UNA ruta:
- "step": objetivo claro y pequeño; escribe un primer paso físico de 5-15 minutos.
- "checklist": resultado concreto que requiere varios pasos; escribe 2-5 pasos accionables y ordenados.
- "clarify": falta un dato importante o el objetivo es ambiguo; formula UNA pregunta sencilla que permita continuar.
- "develop": requiere analizar, comparar, planificar o redactar; escribe un primer movimiento visible, como abrir el documento o anotar opciones.

Usa "clarify" solo si no puedes proponer responsablemente un primer avance. Evita recomendaciones genéricas como "investigar" o "pensar". No repitas el título como paso. El texto debe ser breve, amable y en español.

Responde SOLO JSON válido. mode debe ser exactamente uno de: step, checklist, clarify, develop. Incluye las cinco claves; usa cadenas vacías o [] donde no correspondan:
{"mode":"step","reason":"motivo breve","first_step":"paso concreto o vacío","steps":[],"question":"una pregunta o vacío"}`;
}

function parseApproach(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in approach response');
  const obj = JSON.parse(match[0]);
  const modes = new Set(['step', 'checklist', 'clarify', 'develop']);
  const mode = modes.has(obj.mode) ? obj.mode : null;
  const clean = (value, max) => String(value || '').trim().slice(0, max);
  const steps = (Array.isArray(obj.steps) ? obj.steps : [])
    .map(step => String(step || '').trim()).filter(Boolean).slice(0, 5);
  const result = {
    mode,
    reason: clean(obj.reason, 220),
    first_step: clean(obj.first_step, 240),
    steps,
    question: clean(obj.question, 240),
  };
  if (!mode) throw new Error('Invalid approach mode');
  if (mode === 'step' && !result.first_step) throw new Error('Missing first step');
  if (mode === 'checklist' && steps.length < 2) throw new Error('Checklist needs two steps');
  if (mode === 'clarify' && !result.question) throw new Error('Missing clarification question');
  if (mode === 'develop' && !result.first_step) throw new Error('Missing development action');
  return result;
}

// POST /api/ai/approach { title, context?, parentTitle?, eventTitle? }
router.post('/approach', async (req, res) => {
  const { title, context, parentTitle, eventTitle } = req.body || {};
  const invalid = validateTextFields(req.body || {}, ['title', 'context', 'parentTitle', 'eventTitle']);
  if (invalid) return res.status(400).json({ error: invalid });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  try {
    const raw = await callGemini(buildApproachPrompt(title.trim(), context || '', parentTitle || '', eventTitle || ''), 2, 512);
    res.json(parseApproach(raw));
  } catch (err) {
    console.error('Gemini approach error:', err);
    res.status(502).json({ error: 'No se pudo sugerir una forma de avanzar.' });
  }
});

// POST /api/ai/check-in { title, update, parentTitle?, plan? }
// Turn a short end-of-focus update into a safe, reviewable next move.
router.post('/check-in', async (req, res) => {
  const { title, update, parentTitle, plan } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  if (!update || typeof update !== 'string' || !update.trim() || update.length > 1200) {
    return res.status(400).json({ error: 'Describe el avance en hasta 1200 caracteres' });
  }
  if (parentTitle != null && (typeof parentTitle !== 'string' || parentTitle.length > 500)) return res.status(400).json({ error: 'parentTitle inválido' });
  const safePlan = Array.isArray(plan) ? plan.filter(x => typeof x === 'string').slice(0, 12).map(x => x.slice(0, 240)) : [];
  const prompt = `Eres Brisa, un acompañante práctico para personas con disfunción ejecutiva. Interpreta el reporte sin juzgar ni asumir que la tarea está terminada.
Acción o paso actual: "${title.trim().slice(0, 500)}"
${parentTitle ? `Acción mayor: "${parentTitle}"` : ''}
${safePlan.length ? `Plan conocido: ${safePlan.join(' | ')}` : 'No hay checklist guardado.'}
Lo que la persona cuenta que pasó: "${update.trim()}"

Clasifica como done solo si el reporte dice claramente que se completó este paso/acción. Usa progress si hubo avance parcial. Usa blocked si apareció una traba o no pudo empezar. No inventes hechos. Propón como máximo un siguiente paso concreto y pequeño, o deja next_step vacío si conviene continuar el plan ya existente. Si falta información necesaria, escribe una sola pregunta corta. Responde en español, cálido y conciso. Devuelve SOLO este JSON válido:
{"status":"progress","summary":"resumen breve","next_step":"siguiente paso concreto o vacío","question":"pregunta breve o vacío"}`;
  try {
    const raw = await callGemini(prompt, 2, 300);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Invalid check-in JSON');
    const result = JSON.parse(match[0]);
    const status = ['done', 'progress', 'blocked'].includes(result.status) ? result.status : 'progress';
    const clean = (value, max) => String(value || '').trim().slice(0, max);
    res.json({ status, summary: clean(result.summary, 240), next_step: clean(result.next_step, 240), question: clean(result.question, 240) });
  } catch (err) {
    console.error('Gemini check-in error:', err);
    res.status(502).json({ error: 'No pude interpretar el avance ahora. El texto puede guardarse igual.' });
  }
});

function buildUnblockPrompt(taskTitle, block, parentTitle = '', eventTitle = '') {
  return `Eres un asistente que ayuda a personas con dificultades ejecutivas a destrabarse.
Tu trabajo: separar lo que se puede VERIFICAR de lo que requiere un primer intento (borrador).

La tarea es: "${taskTitle}"
Lo que frena a la persona: "${block}"
${parentTitle ? `Es un paso de una tarea mayor: "${parentTitle}"` : ''}
${eventTitle ? `Todo esto es preparación para el evento: "${eventTitle}"` : ''}

Reglas:
- Las VERIFICACIONES responden una pregunta concreta con un dato observable, acotadas a 10 minutos. Cada una incluye su criterio de "suficiente para actuar" (qué dato basta, no la certeza total).
- Los BORRADORES son primeros intentos físicos de 10-25 minutos que producen algo visible (una lista, una secuencia, un mensaje). Nunca "pensar en" ni "decidir si".
- Máximo 3 verificaciones y 3 borradores. Si algo no aplica, deja ese arreglo vacío.
- La lectura es UNA frase empática que nombra la traba real (incertidumbre, interacción social, perfeccionismo, falta de un dato).

Responde SOLO con este JSON, sin markdown ni texto adicional:
{"lectura": "...", "verificaciones": [{"titulo": "...", "minutos": 10}], "borradores": [{"titulo": "...", "minutos": 15}]}`;
}

function parseUnblock(raw) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object in response');
  const obj = JSON.parse(match[0]);
  const clean = (arr) => (Array.isArray(arr) ? arr : [])
    .map(s => typeof s === 'string'
      ? { titulo: s.trim(), minutos: 15 }
      : { titulo: String(s.titulo || '').trim(), minutos: Number(s.minutos) || 15 })
    .filter(s => s.titulo.length > 0)
    .slice(0, 3);
  return {
    lectura: String(obj.lectura || '').slice(0, 300),
    verificaciones: clean(obj.verificaciones),
    borradores: clean(obj.borradores),
  };
}

// POST /api/ai/unblock { title, block, parentTitle?, eventTitle? }
router.post('/unblock', async (req, res) => {
  const { title, block, parentTitle, eventTitle } = req.body || {};
  const invalid = validateTextFields(req.body || {}, ['title', 'block', 'parentTitle', 'eventTitle']);
  if (invalid) return res.status(400).json({ error: invalid });
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }
  if (!block || !block.trim()) {
    return res.status(400).json({ error: 'Describe qué te frena' });
  }

  try {
    const prompt = buildUnblockPrompt(title.trim(), block.trim(), parentTitle || '', eventTitle || '');
    const raw = await callGemini(prompt, 3, 768);
    const result = parseUnblock(raw);
    if (result.verificaciones.length === 0 && result.borradores.length === 0) {
      throw new Error('Empty result');
    }
    res.json(result);
  } catch (err) {
    console.error('Gemini unblock error:', err);
    res.status(502).json({ error: 'No se pudo analizar la traba. Intenta de nuevo.' });
  }
});

export default router;

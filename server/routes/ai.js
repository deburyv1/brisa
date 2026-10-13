import { Router } from 'express';

const router = Router();

const GEMINI_MODEL = 'gemini-3.5-flash-lite';

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
  const { title, context, parentTitle, eventTitle } = req.body;
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
  const { title, block, parentTitle, eventTitle } = req.body;
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

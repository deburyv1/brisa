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

async function callGeminiOnce(prompt) {
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
        maxOutputTokens: 512,
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
async function callGemini(prompt, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callGeminiOnce(prompt);
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

export default router;

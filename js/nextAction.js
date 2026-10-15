/* ============================================
   BRISA - Next Action Module
   Deterministic "what now" selection. No scoring magic:
   1. Scheduled for today first
   2. Higher priority next
   3. Shorter estimated time next
   4. In the evening (>= 22:00), long tasks sink
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";
const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };

function isToday(dt) {
  if (!dt) return false;
  const d = new Date(dt);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function score(task, evening) {
  const scheduledToday = task.scheduled_datetime && isToday(task.scheduled_datetime) ? 0 : 1;
  const longPenalty = evening && (task.estimated_minutes || 0) > 30 ? 1 : 0;
  const priority = PRIORITY_WEIGHT[task.priority] ?? 1;
  const est = task.estimated_minutes ?? 9999;
  return [scheduledToday, longPenalty, priority, est];
}

function compare(a, b, evening) {
  const sa = score(a, evening);
  const sb = score(b, evening);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sa[i] - sb[i];
  }
  return 0;
}

export function pickNextAction(tasks, now = new Date()) {
  const candidates = (tasks || []).filter(t => !t.is_completed);
  if (candidates.length === 0) return { current: null, alternatives: [] };
  const evening = now.getHours() >= 22;
  const sorted = [...candidates].sort((a, b) => compare(a, b, evening));
  return { current: sorted[0], alternatives: sorted.slice(1, 4) };
}

export function initNext() {
  renderNext();
}

export function renderNext() {
  const section = document.querySelector("#next-section");
  if (!section) return;

  const { current, alternatives } = pickNextAction(state.tasks || []);

  if (!current) {
    section.innerHTML = `
      <div class="next-empty">
        <div class="next-empty-icon">🌱</div>
        <div class="next-empty-text"><strong>Hola de nuevo.</strong><br>No importa lo que quedó atrás. ¿Qué necesitas ahora?</div>
      </div>
    `;
    return;
  }

  const detail = current.first_step || current.description || "Sin detalles todavía.";
  const est = current.estimated_minutes ? `~${current.estimated_minutes} min` : "sin estimar";

  section.innerHTML = `
    <div class="next-label">Ahora</div>
    <div class="next-main">
      <div class="next-info">
        <div class="next-title">${escapeHtml(current.title)}</div>
        <div class="next-detail">${escapeHtml(detail)}</div>
        <div class="next-meta">${est}</div>
      </div>
      <button class="next-start" data-start="${current.id}">Empezar</button>
    </div>
    ${alternatives.length > 0 ? `
      <div class="next-also-label">Otras pendientes <span class="next-also-hint">(no son parte de esta tarea)</span></div>
      <div class="next-also">
        ${alternatives.map(t => `
          <button class="next-alt" data-start="${t.id}" title="Empezar esta en vez de la sugerida">
            ${escapeHtml(t.title)}${t.estimated_minutes ? ` · ${t.estimated_minutes} min` : ""}
          </button>
        `).join("")}
      </div>
    ` : ""}
    <div class="next-event" id="next-event" style="display:none"></div>
  `;

  section.querySelectorAll("[data-start]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (window.openFocus) window.openFocus(btn.dataset.start);
    });
  });

  fillNextEvent(section);
}

// Next event nudge: what is coming + do you need to prepare
// anything (opens the event detail with its prep checklist).
async function fillNextEvent(section) {
  const box = section.querySelector("#next-event");
  if (!box) return;
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) return;
    const now = Date.now();
    const upcoming = (await res.json())
      .filter(e => e.start && new Date(e.start).getTime() > now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))[0];
    if (!upcoming || !section.isConnected || section.querySelector("#next-event") !== box) return;
    const when = new Date(upcoming.start).toLocaleDateString("es-ES", {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    box.style.display = "";
    box.innerHTML = `
      <span>Próximo evento: <strong>${escapeHtml(upcoming.title)}</strong> · ${escapeHtml(when)}</span>
      <button class="next-alt" id="next-event-prep" title="Ver el evento y su preparación">¿Preparar algo?</button>
    `;
    box.querySelector("#next-event-prep")?.addEventListener("click", () => {
      if (window.openEventDetail) window.openEventDetail(upcoming.id);
    });
  } catch {
    // ignore: the nudge is optional
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

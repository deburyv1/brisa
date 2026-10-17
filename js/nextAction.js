/* ============================================
   BRISA - Next Action Module
   Deterministic "what now" selection. No scoring magic:
   1. For today first (programada o con fecha límite hoy)
   2. Higher priority next
   3. Shorter estimated time next
   4. In the evening (>= 22:00), long tasks sink
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";
const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 };

function isDayOnly(d) {
  const h = d.getHours(), m = d.getMinutes();
  return (h === 0 && m === 0) || (h === 23 && m === 59);
}

function isToday(dt) {
  if (!dt) return false;
  const d = new Date(dt);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function formatWhen(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target - start) / 86400000);
  const time = isDayOnly(d) ? "" : ` ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (diff === 0) return `hoy${time}`;
  if (diff === 1) return `mañana${time}`;
  if (diff === -1) return `ayer${time}`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + time;
}

function score(task, evening) {
  // "Es de hoy" si la programaste para hoy o si vence hoy: una fecha
  // límite de hoy pesa igual que una hora puesta hoy.
  const isForToday =
    (task.scheduled_datetime && isToday(task.scheduled_datetime)) ||
    (task.due_datetime && isToday(task.due_datetime));
  const forToday = isForToday ? 0 : 1;
  const longPenalty = evening && (task.estimated_minutes || 0) > 30 ? 1 : 0;
  const priority = PRIORITY_WEIGHT[task.priority] ?? 1;
  const est = task.estimated_minutes ?? 9999;
  return [forToday, longPenalty, priority, est];
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
  // "Ahora" es para lo programado: una tarea sin fecha ni fecha límite no
  // es "ahora", es "sin fecha" (se muestra abajo, no como principal).
  // Pero las sin fecha siguen apareciendo en "Otras pendientes", agrupadas
  // por su motivo (acción padre o evento), para no perderse.
  const all = (tasks || []).filter(t => !t.is_completed);
  const scheduled = all.filter(t => t.scheduled_datetime || t.due_datetime);
  const unscheduled = all.filter(t => !t.scheduled_datetime && !t.due_datetime);
  if (scheduled.length === 0) return { current: null, alternatives: [] };
  const evening = now.getHours() >= 22;
  const sortedScheduled = [...scheduled].sort((a, b) => compare(a, b, evening));
  const sortedUnscheduled = [...unscheduled].sort((a, b) => compare(a, b, evening));
  const current = sortedScheduled[0];
  const alternatives = [...sortedScheduled.slice(1, 4), ...sortedUnscheduled].slice(0, 6);
  return { current, alternatives };
}

export function initNext() {
  renderNext();
}

export async function renderNext() {
  const section = document.querySelector("#next-section");
  if (!section) return;

  const { current, alternatives } = pickNextAction(state.tasks || []);

  // Eventos: para mostrar a qué evento sirve cada tarea (las de preparación)
  // y cuándo es, incluyendo el tiempo de viaje.
  let events = [];
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (res.ok) events = await res.json();
  } catch { /* ignore */ }
  const eventById = (id) => (events || []).find(e => String(e.id) === String(id));

  if (!current) {
    // Tareas sin fecha: siguen siendo accesibles, pero no son "ahora".
    const unscheduled = (state.tasks || []).filter(t =>
      !t.is_completed && !t.scheduled_datetime && !t.due_datetime);
    section.innerHTML = `
      <div class="next-empty">
        <div class="next-empty-icon">🌱</div>
        <div class="next-empty-text"><strong>Nada programado para hoy.</strong><br>Programa una tarea para que aparezca acá, o elige una sin fecha.</div>
      </div>
      ${unscheduled.length > 0 ? `
        <div class="next-also-label" style="margin-top:10px">Sin fecha <span class="next-also-hint">(programa una para que sea "ahora")</span></div>
        <div class="next-also">
          ${unscheduled.slice(0, 6).map(t => `
            <button class="next-alt" data-start="${t.id}" title="Empezar esta (sin fecha)">
              ${escapeHtml(t.title)}${t.estimated_minutes ? ` · ${t.estimated_minutes} min` : ""}
            </button>
          `).join("")}
        </div>
      ` : ""}
    `;
    section.querySelectorAll("[data-start]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (window.openFocus) window.openFocus(btn.dataset.start);
      });
    });
    return;
  }

  const detail = current.first_step || current.description || "Sin detalles todavía.";
  const parent = current.parent_task_id
    ? (state.tasks || []).find(t => String(t.id) === String(current.parent_task_id))
    : null;
  const linkedEvent = current.event_id ? eventById(current.event_id) : null;
  const est = current.estimated_minutes
    ? `~${current.estimated_minutes} min`
    : (parent?.estimated_minutes ? `~${parent.estimated_minutes} min` : "sin estimar");
  const scheduleOf = (t) => {
    if (!t) return "";
    if (t.scheduled_datetime) return formatWhen(t.scheduled_datetime);
    if (t.due_datetime) return `límite ${formatWhen(t.due_datetime)}`;
    return "";
  };
  const ownWhen = scheduleOf(current);
  const parentWhen = scheduleOf(parent);
  const when = ownWhen || (parentWhen ? `${parentWhen} (acción)` : "Sin fecha programada");
  const eventWhen = linkedEvent ? formatWhen(linkedEvent.start) : "";
  const eventLeave = linkedEvent?.travel_minutes
    ? new Date(new Date(linkedEvent.start).getTime() - Number(linkedEvent.travel_minutes) * 60000)
        .toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
    : "";
  // "Patear" cuando no hay fecha límite hoy: lo que tiene deadline no se
  // puede patear; lo demás sí (programado para un día o sin fecha).
  const canPostpone = !current.due_datetime || !isToday(current.due_datetime);

  section.innerHTML = `
    <div class="next-label">Ahora <span class="next-label-hint">(lo siguiente que te toca)</span></div>
    <div class="next-main">
      <div class="next-info">
        ${parent ? `<div class="next-parent">↳ Parte de: ${escapeHtml(parent.title)}${parentWhen ? ` · ${escapeHtml(parentWhen)}` : ""}</div>` : ""}
        ${linkedEvent ? `<div class="next-event-link">🎪 Para: <strong>${escapeHtml(linkedEvent.title)}</strong>${eventWhen ? ` · ${escapeHtml(eventWhen)}` : ""}${eventLeave ? ` · salís a las ${escapeHtml(eventLeave)}` : ""}</div>` : ""}
        <div class="next-title">${escapeHtml(current.title)}</div>
        <div class="next-detail">${escapeHtml(detail)}</div>
        <div class="next-meta">${escapeHtml(when)} · ${est}</div>
      </div>
      <div class="next-actions">
        <button class="next-done" data-done="${current.id}" title="Marcar como hecha y pasar a la siguiente">✓ Hecho</button>
        <button class="next-start" data-start="${current.id}">Empezar</button>
        ${canPostpone ? `<button class="next-postpone" data-postpone="${current.id}" title="Patearla para mañana (no tiene fecha límite hoy)">Patear → mañana</button>` : ""}
      </div>
    </div>
    ${alternatives.length > 0 ? `
      <div class="next-also-label">Otras pendientes <span class="next-also-hint">(no son parte de esta tarea)</span></div>
      <div class="next-also">
        ${(() => {
          // Agrupar por motivo (acción padre o evento): las que sirven para
          // lo mismo no deben aparecer como sueltas. Se priorizan grupos
          // distintos para que no se mezclen 3 pasos del mismo asunto.
          const groups = new Map();
          for (const t of alternatives) {
            const key = t.event_id ? `e:${t.event_id}` : (t.parent_task_id ? `p:${t.parent_task_id}` : `s:${t.id}`);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(t);
          }
          // orden de grupos: por la mejor prioridad de sus items
          const groupList = [...groups.entries()].map(([key, items]) => ({
            key,
            items,
            best: items.reduce((a, b) => compare(a, b, false) <= 0 ? a : b),
          })).sort((a, b) => compare(a.best, b.best, false));
          // tomar hasta 3 grupos, 2 items por grupo
          const shown = groupList.slice(0, 3);
          let html = "";
          for (const g of shown) {
            const first = g.items[0];
            const ev = first.event_id ? eventById(first.event_id) : null;
            const par = first.parent_task_id ? (state.tasks || []).find(x => String(x.id) === String(first.parent_task_id)) : null;
            const label = ev ? `🎪 ${ev.title}` : (par ? `↳ ${par.title}` : "");
            const isGroup = g.key !== `s:${first.id}` && g.items.length > 1;
            if (isGroup) {
              html += `<div class="next-alt-group"><div class="next-alt-group-label">${escapeHtml(label)}</div>`;
              html += g.items.slice(0, 2).map(t => `
                <button class="next-alt" data-start="${t.id}" title="Empezar esta en vez de la sugerida">
                  <span class="next-alt-title">${escapeHtml(t.title)}</span>
                  <span class="next-alt-meta">${t.estimated_minutes ? `${t.estimated_minutes} min` : "sin estimar"}${t.scheduled_datetime ? ` · ${formatWhen(t.scheduled_datetime)}` : ""}</span>
                </button>`).join("");
              html += `</div>`;
            } else {
              // item suelto: muestra su motivo si lo tiene
              html += g.items.slice(0, 2).map(t => {
                const ev2 = t.event_id ? eventById(t.event_id) : null;
                const par2 = t.parent_task_id ? (state.tasks || []).find(x => String(x.id) === String(t.parent_task_id)) : null;
                const ctx = ev2 ? `🎪 ${ev2.title}` : (par2 ? `↳ ${par2.title}` : "");
                return `
                <button class="next-alt" data-start="${t.id}" title="Empezar esta en vez de la sugerida">
                  ${ctx ? `<span class="next-alt-ctx">${escapeHtml(ctx)}</span>` : ""}
                  <span class="next-alt-title">${escapeHtml(t.title)}</span>
                  <span class="next-alt-meta">${t.estimated_minutes ? `${t.estimated_minutes} min` : "sin estimar"}${t.scheduled_datetime ? ` · ${formatWhen(t.scheduled_datetime)}` : ""}</span>
                </button>`;
              }).join("");
            }
          }
          return html;
        })()}
      </div>
    ` : ""}
    <div class="next-event" id="next-event" style="display:none"></div>
    <div class="next-ideas" id="next-ideas" style="display:none"></div>
  `;

  section.querySelectorAll("[data-start]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (window.openFocus) window.openFocus(btn.dataset.start);
    });
  });

  section.querySelector("[data-postpone]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const id = btn.dataset.postpone;
    const task = (state.tasks || []).find(t => String(t.id) === String(id));
    btn.disabled = true;
    btn.textContent = "Pateando…";
    try {
      let at;
      if (task?.scheduled_datetime) {
        const d = new Date(task.scheduled_datetime);
        d.setDate(d.getDate() + 1);
        at = d.toISOString();
      } else {
        // Sin fecha: se agenda para mañana a las 9, sale de "ahora" hoy.
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        at = d.toISOString();
      }
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_datetime: at }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.initToday) window.initToday();
      if (window.initWeek) window.initWeek();
    } catch (err) {
      console.error("No se pudo patear:", err);
      btn.disabled = false;
      btn.textContent = "Patear → mañana";
    }
  });

  section.querySelector("[data-done]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/tasks/${btn.dataset.done}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: true, completed_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.error("No se pudo marcar como hecha:", err);
      btn.disabled = false;
      return;
    }
    if (window.initTasks) await window.initTasks();
    if (window.renderNext) window.renderNext();
    if (window.initToday) window.initToday();
    if (window.initWeek) window.initWeek();
    if (window.initReadiness) window.initReadiness();
  });

  fillNextEvent(section);
  fillNextIdeas(section);
}

// Home seeds: latest open ideas with one-tap derive to action
// (the idea stays; same rule as the Ideas view).
async function fillNextIdeas(section) {
  const box = section.querySelector("#next-ideas");
  if (!box) return;
  try {
    const res = await fetch(`${API_BASE}/ideas`);
    if (!res.ok) return;
    const open = (await res.json()).filter(i => i.status !== "done").slice(0, 3);
    if (open.length === 0) return;
    if (!section.isConnected || section.querySelector("#next-ideas") !== box) return;
    box.style.display = "";
    box.innerHTML = `
      <div class="next-also-label">Últimas ideas <span class="next-also-hint">(el semillero sigue en Ideas)</span></div>
      ${open.map(i => `
        <div class="next-idea-row">
          <span class="next-idea-title">${escapeHtml(i.title)}</span>
          <button class="next-alt" data-derive="${i.id}" data-title="${escapeHtml(i.title)}" title="Crear una acción desde esta idea (la idea queda)">→ acción</button>
        </div>`).join("")}
      <button class="next-ideas-all" id="next-ideas-all">Ver todas en Ideas</button>
    `;
    box.querySelectorAll("[data-derive]").forEach(btn => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          const task = await fetch(`${API_BASE}/tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: btn.dataset.title }),
          }).then(r => r.json());
          await fetch(`${API_BASE}/ideas/${btn.dataset.derive}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "done", task_id: task?.id || null }),
          });
        } catch (e) {
          console.error("Error derivando acción:", e);
        }
        if (window.initIdeas) window.initIdeas();
        if (window.initTasks) await window.initTasks();
        if (window.renderNext) window.renderNext();
      });
    });
    box.querySelector("#next-ideas-all")?.addEventListener("click", () => {
      document.querySelector('.nav[data-nav="ideas"]')?.click();
    });
  } catch {
    // ignore: the seeds are optional
  }
}
// Next events: the coming ones, plural — no surprises.
// Each links to its detail with the prep checklist.
async function fillNextEvent(section) {
  const box = section.querySelector("#next-event");
  if (!box) return;
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) return;
    const now = Date.now();
    const upcoming = (await res.json())
      .filter(e => e.start && e.status !== "done" && e.status !== "cancelled" && new Date(e.start).getTime() > now)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 3);
    if (upcoming.length === 0) return;
    if (!section.isConnected || section.querySelector("#next-event") !== box) return;
    const fmtWhen = (s) => new Date(s).toLocaleDateString("es-ES", {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    box.style.display = "";
    box.innerHTML = `
      <div class="next-event-label">Próximos eventos</div>
      ${upcoming.map(e => `
        <div class="next-event-row">
          <span><strong>${escapeHtml(e.title)}</strong> · ${escapeHtml(fmtWhen(e.start))}</span>
          <button class="next-alt" data-prep="${e.id}" title="Ver el evento y su preparación">¿Preparar algo?</button>
        </div>`).join("")}
    `;
    box.querySelectorAll("[data-prep]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (window.openEventDetail) window.openEventDetail(Number(btn.dataset.prep));
      });
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

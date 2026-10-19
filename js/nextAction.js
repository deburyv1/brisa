/* ============================================
   BRISA - Next Action Module
   Deterministic "what now" selection:
   1. Past-due commitments, then today's commitments in time order
   2. A short, clearly optional step when today is clear
   3. The full horizon remains available below the suggestion
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

function localDayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayOffset(value, now) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Infinity;
  return Math.round((localDayStart(date) - localDayStart(now)) / 86400000);
}

function isPastDue(value, now) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  // A date-only deadline includes the whole day.
  if (isDayOnly(date)) return dayOffset(value, now) < 0;
  return date.getTime() < now.getTime();
}

function priorityAndSize(a, b) {
  const priorityDiff = (PRIORITY_WEIGHT[a.priority] ?? 1) - (PRIORITY_WEIGHT[b.priority] ?? 1);
  if (priorityDiff) return priorityDiff;
  return (a.estimated_minutes ?? Infinity) - (b.estimated_minutes ?? Infinity);
}

function taskTime(task) {
  const value = task.scheduled_datetime || task.due_datetime;
  if (!value) return Infinity;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Infinity;
  return isDayOnly(date) ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59).getTime() : date.getTime();
}

function taskHorizonTime(task) {
  return [task.scheduled_datetime, task.due_datetime]
    .filter(Boolean)
    .map(value => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return Infinity;
      return isDayOnly(date) ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59).getTime() : date.getTime();
    })
    .reduce((earliest, time) => Math.min(earliest, time), Infinity);
}

export function pickNextAction(tasks, now = new Date()) {
  const source = (tasks || []).filter(t => !t.is_completed);
  const ids = new Set((tasks || []).map(t => String(t.id)));
  // A child is a step inside its parent action, not a separate commitment.
  // Keep orphaned children visible in case their parent was removed.
  const all = source.filter(t => t.parent_task_id == null || !ids.has(String(t.parent_task_id)));
  const overdue = all.filter(t => isPastDue(t.due_datetime, now)
    || (t.scheduled_datetime && isPastDue(t.scheduled_datetime, now)));
  const overdueIds = new Set(overdue.map(t => String(t.id)));
  const today = all.filter(t => !overdueIds.has(String(t.id))
    && ((t.scheduled_datetime && dayOffset(t.scheduled_datetime, now) === 0)
      || (t.due_datetime && dayOffset(t.due_datetime, now) === 0)));
  const todayIds = new Set(today.map(t => String(t.id)));
  const upcoming = all.filter(t => !overdueIds.has(String(t.id)) && !todayIds.has(String(t.id))
    && [t.scheduled_datetime, t.due_datetime].some(d => d && dayOffset(d, now) > 0 && dayOffset(d, now) <= 7));
  const upcomingIds = new Set(upcoming.map(t => String(t.id)));
  const later = all.filter(t => !overdueIds.has(String(t.id)) && !todayIds.has(String(t.id))
    && !upcomingIds.has(String(t.id)) && (t.scheduled_datetime || t.due_datetime));
  const unscheduled = all.filter(t => !t.scheduled_datetime && !t.due_datetime);

  overdue.sort((a, b) => priorityAndSize(a, b) || taskTime(a) - taskTime(b));
  today.sort((a, b) => taskTime(a) - taskTime(b) || priorityAndSize(a, b));
  upcoming.sort((a, b) => taskHorizonTime(a) - taskHorizonTime(b) || priorityAndSize(a, b));
  later.sort((a, b) => taskTime(a) - taskTime(b) || priorityAndSize(a, b));
  unscheduled.sort((a, b) => priorityAndSize(a, b));

  const current = overdue[0] || today[0] || null;
  const shortest = (items) => [...items].filter(t => Number(t.estimated_minutes) > 0 && Number(t.estimated_minutes) <= 15)
    .sort((a, b) => a.estimated_minutes - b.estimated_minutes || priorityAndSize(a, b))[0] || null;
  const quickPickOptions = [
    [shortest(unscheduled), "unscheduled"],
    [shortest(upcoming), "upcoming"],
    [unscheduled[0] || null, "unscheduled"],
    [upcoming[0] || null, "upcoming"],
    [later[0] || null, "later"],
  ];
  const [quickPick, quickPickType] = current ? [null, null]
    : quickPickOptions.find(([task]) => task) || [null, null];
  const reason = overdue[0]
    ? isPastDue(overdue[0].due_datetime, now) ? "Su fecha límite ya pasó." : "Su hora programada ya pasó."
    : today[0]?.due_datetime && isToday(today[0].due_datetime) && !today[0].scheduled_datetime
      ? "Tiene fecha límite hoy."
      : today[0] ? "Es lo siguiente en tu agenda de hoy."
        : quickPickType === "unscheduled" ? Number(quickPick?.estimated_minutes) <= 15
          ? "No hay tareas para hoy; elegí una tarea breve sin fecha. Puedes dejarla para después."
          : "No hay tareas para hoy; esta tarea no tiene fecha y puede esperar."
          : quickPickType === "upcoming" ? "Hoy está despejado; puedes adelantar esta tarea, aunque tiene una fecha posterior."
            : quickPickType === "later" ? "Hoy está despejado; esta tarea futura también puede esperar."
          : "No tienes tareas pendientes para hoy.";
  const alternatives = [...overdue, ...today, ...upcoming, ...later, ...unscheduled]
    .filter(t => String(t.id) !== String(current?.id)).slice(0, 6);
  return { current, quickPick, quickPickType, reason, overdue, today, upcoming, later, unscheduled, alternatives };
}

export function initNext() {
  renderNext();
}

export async function renderNext() {
  const section = document.querySelector("#next-section");
  if (!section) return;
  if (state.tasksStatus === "loading") {
    section.innerHTML = `<div class="next-loading" role="status" aria-live="polite"><span class="next-loading-spinner" aria-hidden="true"></span><span>Cargando tus acciones de hoy y fechas próximas…</span></div>`;
    return;
  }
  if (state.tasksStatus === "error") {
    section.innerHTML = `<div class="next-load-error" role="alert"><span>No pude cargar tus acciones.</span><button type="button" id="next-retry" class="next-retry">Reintentar</button></div>`;
    section.querySelector("#next-retry")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "Cargando…";
      if (window.initTasks) await window.initTasks();
      await renderNext();
    });
    return;
  }
  const agendaWasOpen = section.querySelector(".next-agenda")?.open || false;

  // Event checklist items live with their event; do not surface them as
  // unrelated standalone actions in the daily recommendation.
  const eventTaskIds = new Set((state.tasks || []).filter(t => t.event_id).map(t => String(t.id)));
  const plan = pickNextAction((state.tasks || []).filter(t => !t.event_id && !eventTaskIds.has(String(t.parent_task_id))));
  const { current, quickPick, quickPickType, reason, overdue, today, upcoming, later, unscheduled } = plan;

  // Eventos: para mostrar a qué evento sirve cada tarea (las de preparación)
  // y cuándo es, incluyendo el tiempo de viaje.
  let events = [];
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (res.ok) events = await res.json();
  } catch { /* ignore */ }
  const eventById = (id) => (events || []).find(e => String(e.id) === String(id));

  const taskList = (items, type) => items.map(t => {
    const when = type === "overdue"
      ? t.due_datetime && isPastDue(t.due_datetime, new Date())
        ? `Límite vencido ${formatWhen(t.due_datetime)}`
        : `Programada ${formatWhen(t.scheduled_datetime)}`
      : t.scheduled_datetime ? `Programada ${formatWhen(t.scheduled_datetime)}`
        : t.due_datetime ? `Límite ${formatWhen(t.due_datetime)}` : "Sin fecha";
    const estimate = t.estimated_minutes ? ` · ~${t.estimated_minutes} min` : "";
    const children = (state.tasks || []).filter(child => String(child.parent_task_id) === String(t.id));
    const childProgress = children.length
      ? ` · ${children.filter(child => child.is_completed).length}/${children.length} pasos` : "";
    return `<button class="next-agenda-task" data-start="${t.id}">
      <span class="next-agenda-title">${escapeHtml(t.title)}</span>
      <span class="next-agenda-meta">${escapeHtml(when + estimate + childProgress)}</span>
    </button>`;
  }).join("");
  const agendaGroups = [
    ["Atrasadas", overdue, "overdue"],
    ["Hoy", today, "today"],
    ["Próximos 7 días", upcoming, "upcoming"],
    ["Más adelante", later, "later"],
    ["Sin fecha", unscheduled, "unscheduled"],
  ].filter(([, items]) => items.length > 0);
  const summary = [
    `${overdue.length} atrasadas`,
    `${today.length} hoy`,
    `${upcoming.length} próximos 7 días`,
    `${unscheduled.length} sin fecha`,
    ...(later.length ? [`${later.length} más adelante`] : []),
  ].join(" · ");
  const agenda = agendaGroups.length ? `
    <details class="next-agenda">
      <summary><span>Ver todas las acciones</span><span class="next-agenda-summary">${escapeHtml(summary)}</span></summary>
      <div class="next-agenda-list">${agendaGroups.map(([label, items, type]) => `
        <section class="next-agenda-group">
          <h3>${escapeHtml(label)} <span>${items.length}</span></h3>
          ${taskList(items, type)}
        </section>`).join("")}
      </div>
    </details>` : `<div class="next-reassurance">No hay tareas vencidas ni pendientes para hoy.</div>`;

  let main;
  if (current) {
    const detail = current.first_step || current.description || "Sin detalles todavía.";
    const parent = current.parent_task_id
      ? (state.tasks || []).find(t => String(t.id) === String(current.parent_task_id)) : null;
    const linkedEvent = current.event_id ? eventById(current.event_id) : null;
    const est = current.estimated_minutes
      ? `~${current.estimated_minutes} min`
      : (parent?.estimated_minutes ? `~${parent.estimated_minutes} min` : "sin estimar");
    const when = [
      current.scheduled_datetime ? `Programada ${formatWhen(current.scheduled_datetime)}` : "",
      current.due_datetime ? `límite ${formatWhen(current.due_datetime)}` : "",
    ].filter(Boolean).join(" · ");
    const parentWhen = parent ? [
      parent.scheduled_datetime ? `Programada ${formatWhen(parent.scheduled_datetime)}` : "",
      parent.due_datetime ? `límite ${formatWhen(parent.due_datetime)}` : "",
    ].filter(Boolean).join(" · ") : "";
    const eventWhen = linkedEvent ? formatWhen(linkedEvent.start) : "";
    const eventLeave = linkedEvent?.travel_minutes
      ? new Date(new Date(linkedEvent.start).getTime() - Number(linkedEvent.travel_minutes) * 60000)
          .toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";
    const canPostpone = !current.due_datetime || !isToday(current.due_datetime);
    main = `
      <div class="next-label">Ahora <span class="next-label-hint">· siguiente según tus fechas</span></div>
      <div class="next-main">
        <div class="next-info">
          ${parent ? `<div class="next-parent">↳ Parte de: ${escapeHtml(parent.title)}${parentWhen ? ` · ${escapeHtml(parentWhen)}` : ""}</div>` : ""}
          ${linkedEvent ? `<div class="next-event-link">🎪 Para: <strong>${escapeHtml(linkedEvent.title)}</strong>${eventWhen ? ` · ${escapeHtml(eventWhen)}` : ""}${eventLeave ? ` · sales a las ${escapeHtml(eventLeave)}` : ""}</div>` : ""}
          <div class="next-title">${escapeHtml(current.title)}</div>
          <div class="next-detail">${escapeHtml(detail)}</div>
          <div class="next-meta">${escapeHtml(when)}${when ? " · " : ""}${est}</div>
          <div class="next-reason">${escapeHtml(reason)}</div>
        </div>
        <div class="next-actions">
          <button class="next-start" data-start="${current.id}">Empezar</button>
          <button class="next-done" data-done="${current.id}" title="Marcar como hecha y pasar a la siguiente">Hecho</button>
          ${canPostpone ? `<button class="next-postpone" data-postpone="${current.id}" title="Mover a mañana a las 9:00 (no tiene fecha límite hoy)">Pasar a mañana</button>` : ""}
        </div>
      </div>`;
  } else if (quickPick) {
    const est = quickPick.estimated_minutes ? ` · ~${quickPick.estimated_minutes} min` : "";
    const quickWhen = quickPickType === "unscheduled" ? "Sin fecha"
      : quickPickType === "upcoming" ? `Programada ${formatWhen(quickPick.scheduled_datetime || quickPick.due_datetime)}`
        : `Más adelante · ${formatWhen(quickPick.scheduled_datetime || quickPick.due_datetime)}`;
    main = `
      <div class="next-label">Si tienes un momento <span class="next-label-hint">· sugerencia opcional</span></div>
      <div class="next-main">
        <div class="next-info">
          <div class="next-title">${escapeHtml(quickPick.title)}</div>
          <div class="next-detail">${escapeHtml(quickPick.first_step || quickPick.description || "Sin detalles todavía.")}</div>
          <div class="next-meta">${escapeHtml(quickWhen + est)}</div>
          <div class="next-reason">${escapeHtml(reason)}</div>
        </div>
        <div class="next-actions"><button class="next-start" data-start="${quickPick.id}">Empezar</button></div>
      </div>`;
  } else {
    main = `<div class="next-empty"><div class="next-empty-icon">🌱</div><div class="next-empty-text"><strong>Hoy está despejado.</strong><br>Revisé tus tareas vencidas y no hay pendientes para hoy.</div></div>`;
  }

  section.innerHTML = `${main}${agenda}
    <div class="next-event" id="next-event" style="display:none"></div>
    <div class="next-ideas" id="next-ideas" style="display:none"></div>`;
  if (agendaWasOpen) {
    const nextAgenda = section.querySelector(".next-agenda");
    if (nextAgenda) nextAgenda.open = true;
  }

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
      btn.textContent = "Moviendo…";
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
      btn.textContent = "Pasar a mañana";
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
    const [res, taskRes] = await Promise.all([fetch(`${API_BASE}/events`), fetch(`${API_BASE}/tasks`)]);
    if (!res.ok) return;
    const allEvents = await res.json();
    const tasks = taskRes.ok ? await taskRes.json() : [];
    const now = Date.now();
    const allUpcoming = allEvents
      .filter(e => {
        if (!e.start || e.status === "done" || e.status === "cancelled") return false;
        const start = new Date(e.start);
        return start.getTime() > now || (isDayOnly(start) && isToday(e.start));
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    const upcoming = allUpcoming.slice(0, 3);
    if (upcoming.length === 0) return;
    if (!section.isConnected || section.querySelector("#next-event") !== box) return;
    const fmtWhen = (s) => new Date(s).toLocaleDateString("es-ES", {
      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
    const eventRow = (e) => {
      const linked = tasks.filter(t => String(t.event_id) === String(e.id));
      const done = linked.filter(t => t.is_completed).length;
      const prep = linked.filter(t => !t.is_completed && (t.event_phase || "prep") === "prep").length;
      const leave = linked.filter(t => !t.is_completed && t.event_phase === "leave").length;
      const during = linked.filter(t => !t.is_completed && t.event_phase === "during").length;
      const status = !linked.length ? "Sin preparación registrada"
        : `${done}/${linked.length} listos${prep ? ` · ${prep} para preparar` : ""}${leave ? ` · ${leave} antes de salir` : ""}${during ? ` · ${during} ese día` : ""}`;
      return `<div class="next-event-row">
        <span><strong>${escapeHtml(e.title)}</strong> · ${escapeHtml(fmtWhen(e.start))}<small class="next-event-prep-status">${status}</small></span>
        <button class="next-alt" data-prep="${e.id}" title="Ver el evento y sus pasos de preparación">Ver preparación</button>
      </div>`;
    };
    box.style.display = "";
    box.innerHTML = `
      <div class="next-event-label">Próximos eventos · ${upcoming.length} de ${allUpcoming.length}</div>
      ${upcoming.map(eventRow).join("")}
      ${allUpcoming.length > 3 ? `<details class="next-event-all"><summary>Ver los otros ${allUpcoming.length - 3} eventos próximos</summary>${allUpcoming.slice(3).map(eventRow).join("")}</details>` : ""}
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

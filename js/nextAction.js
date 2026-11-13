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

  const timer = typeof window !== "undefined" ? window.brisaTimer : null;
  const linkedTaskId = timer?.hasSession() ? timer.linkedTask?.() : null;
  const timerTask = linkedTaskId != null
    ? source.find(t => String(t.id) === String(linkedTaskId)) : null;
  // Una acción empezada pero programada para otro día no debe ocupar la
  // tarjeta de hoy: al patearla vuelve mañana como EN CURSO. El timer en
  // marcha siempre manda (sin fechas = sigue vigente).
  const bindsToday = (task) => {
    const dates = [task.scheduled_datetime, task.due_datetime].filter(Boolean);
    return !dates.length || dates.some((d) => dayOffset(d, now) <= 0);
  };
  const activeTask = timerTask || source
    .filter(t => t.started_at && bindsToday(t))
    .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))[0] || null;
  const activeParent = activeTask?.parent_task_id != null
    ? source.find(t => String(t.id) === String(activeTask.parent_task_id) && bindsToday(t)) : null;
  const activeAction = activeParent || activeTask;
  const current = activeAction || overdue[0] || today[0] || null;
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
  const overdueTask = overdue[0];
  const reason = activeAction ? "Ya empezaste esta acción. Sigamos desde el paso que dejaste abierto."
    : overdueTask
    ? isPastDue(overdueTask.due_datetime, now) ? "Su fecha límite ya pasó."
      : overdueTask.scheduled_datetime && isDayOnly(new Date(overdueTask.scheduled_datetime))
        ? "Quedó para un día que ya pasó."
        : "Su hora programada ya pasó."
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
  return { current, activeAction: activeAction ? current : null, activeTask: activeAction ? activeTask : null, quickPick, quickPickType, reason, overdue, today, upcoming, later, unscheduled, alternatives };
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
  const { current, activeAction, activeTask, quickPick, quickPickType, reason, overdue, today, upcoming, later, unscheduled } = plan;

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
    return `<div class="next-agenda-row">
      <button class="next-agenda-task" data-start="${t.id}" title="Abrir en Enfoque">
        <span class="next-agenda-title">${escapeHtml(t.title)}</span>
        <span class="next-agenda-meta">${escapeHtml(when + estimate + childProgress)}</span>
      </button>
      <div class="next-agenda-actions">
        <button class="next-agenda-act" data-done="${t.id}" title="Marcar como hecha">Listo</button>
        <button class="next-agenda-act" data-schedule="${t.id}" title="Ponerle día y hora sin abrir Enfoque">Programar</button>
        <button class="next-agenda-act next-agenda-del" data-delete="${t.id}" title="Eliminar la tarea (queda en la Papelera por si la recuperas)">Eliminar</button>
      </div>
    </div>`;
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
    const inProgress = !!activeAction && String(activeAction.id) === String(current.id);
    const detail = inProgress && activeTask && String(activeTask.id) !== String(current.id)
      ? `Ahora mismo: ${activeTask.title}`
      : detailSnippet(current.first_step || current.description) || "Sin detalles todavía.";
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
      <div class="next-label">${inProgress ? "EN CURSO" : "AHORA"} <span class="next-label-hint">· ${inProgress ? "ya avanzaste; retomemos juntos" : "siguiente según tus fechas"}</span></div>
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
          <button class="next-start" data-start="${inProgress ? activeTask?.id || current.id : current.id}" ${inProgress ? 'data-resume="true"' : ""}>${inProgress ? "Continuar" : "Empezar"}</button>
          <button class="next-done" data-done="${current.id}" title="Marcar como hecha y pasar a la siguiente">Hecho</button>
          ${canPostpone ? `<button class="next-postpone" data-postpone="${current.id}" title="Sale de la vista de hoy y queda programada para mañana">Pasar a mañana</button>` : ""}
          <button class="next-schedule" data-schedule="${current.id}" title="Ponerle día y hora sin abrir Enfoque">Programar</button>
          <button class="next-delete" data-delete="${current.id}" title="Eliminar la tarea (queda en la Papelera por si la recuperas)">Eliminar</button>
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
          <div class="next-detail">${escapeHtml(detailSnippet(quickPick.first_step || quickPick.description) || "Sin detalles todavía.")}</div>
          <div class="next-meta">${escapeHtml(quickWhen + est)}</div>
          <div class="next-reason">${escapeHtml(reason)}</div>
        </div>
        <div class="next-actions">
          <button class="next-start" data-start="${quickPick.id}">Empezar</button>
          <button class="next-schedule" data-schedule="${quickPick.id}" title="Ponerle día y hora sin abrir Enfoque">Programar</button>
        </div>
      </div>`;
  } else {
    main = `<div class="next-empty"><div class="next-empty-icon">🌱</div><div class="next-empty-text"><strong>Hoy está despejado.</strong><br>Revisé tus tareas vencidas y no hay pendientes para hoy.</div></div>`;
  }

  section.innerHTML = `${main}
    <div class="next-scheduler" id="next-scheduler" style="display:none">
      <label class="next-scheduler-label" for="next-scheduler-input">Día y hora</label>
      <input type="datetime-local" id="next-scheduler-input" class="next-scheduler-input">
      <div class="next-scheduler-quick">
        <button type="button" data-sched-quick="now" title="Programarla para este mismo momento">Ahora</button>
        <button type="button" data-sched-quick="today" title="Hoy a su hora, o la media hora siguiente">Hoy</button>
      </div>
      <div class="next-scheduler-actions">
        <button type="button" class="next-scheduler-save">Guardar</button>
        <button type="button" class="next-scheduler-cancel">Cancelar</button>
      </div>
    </div>
    ${agenda}
    <div class="next-event" id="next-event" style="display:none"></div>
    <div class="next-ideas" id="next-ideas" style="display:none"></div>`;
  if (agendaWasOpen) {
    const nextAgenda = section.querySelector(".next-agenda");
    if (nextAgenda) nextAgenda.open = true;
  }

  section.querySelectorAll("[data-start]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.resume === "true") {
        const task = (state.tasks || []).find(t => String(t.id) === String(btn.dataset.start));
        const hasChildren = (state.tasks || []).some(t => String(t.parent_task_id) === String(btn.dataset.start) && !t.is_completed);
        if (task?.parent_task_id != null || (!hasChildren && task?.first_step?.trim())) {
          if (window.resumeFocusTask) window.resumeFocusTask(btn.dataset.start);
          else if (window.openFocus) window.openFocus(btn.dataset.start);
        } else if (window.openFocus) {
          window.openFocus(btn.dataset.start);
        }
      } else if (window.openFocus) window.openFocus(btn.dataset.start);
    });
  });

  section.querySelector("[data-postpone]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const id = btn.dataset.postpone;
    const task = (state.tasks || []).find(t => String(t.id) === String(id));
    btn.disabled = true;
      btn.textContent = "Moviendo…";
    try {
      // Mañana real = hoy + 1. Antes sumaba 1 día a la fecha de la tarea,
      // así que una tarea programada a futuro quedaba aún más lejos.
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const orig = task?.scheduled_datetime ? new Date(task.scheduled_datetime) : null;
      const hasOrig = orig && !Number.isNaN(orig.getTime());
      d.setHours(hasOrig ? orig.getHours() : 9, hasOrig ? orig.getMinutes() : 0, 0, 0);
      const at = d.toISOString();
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

  // Programar sin abrir Enfoque: elegir día y hora libremente.
  const schedBox = section.querySelector("#next-scheduler");
  const schedInput = section.querySelector("#next-scheduler-input");
  const localValue = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const nextHalfHour = (now) => {
    const d = new Date(now);
    d.setSeconds(0, 0);
    if (d.getMinutes() < 30) d.setMinutes(30);
    else { d.setMinutes(0); d.setHours(d.getHours() + 1); }
    return d;
  };
  const schedTask = () => (state.tasks || []).find(t => String(t.id) === String(schedBox?.dataset.task));
  // Defecto al abrir: su hora si aún viene, hoy a su hora si aún queda, si no la media hora siguiente.
  // Si la tarea quedó "solo con día", el 23:59/00:00 es un relleno interno: no se
  // muestra como si lo hubieras elegido, se conserva el día y se usa una hora neutra.
  const defaultScheduleValue = (task) => {
    const now = new Date();
    const orig = task?.scheduled_datetime ? new Date(task.scheduled_datetime) : null;
    const fallback = nextHalfHour(now);
    if (orig && !Number.isNaN(orig.getTime())) {
      if (isDayOnly(orig)) {
        const dayAt = new Date(orig);
        dayAt.setHours(fallback.getHours(), fallback.getMinutes(), 0, 0);
        return localValue(dayAt.getTime() > now.getTime() ? dayAt : fallback);
      }
      if (orig.getTime() > now.getTime()) return localValue(orig);
      const todayAt = new Date(now);
      todayAt.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
      if (todayAt.getTime() > now.getTime()) return localValue(todayAt);
    }
    return localValue(fallback);
  };
  const todayScheduleValue = (task) => {
    const now = new Date();
    const orig = task?.scheduled_datetime ? new Date(task.scheduled_datetime) : null;
    if (orig && !Number.isNaN(orig.getTime()) && !isDayOnly(orig)) {
      const todayAt = new Date(now);
      todayAt.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
      if (todayAt.getTime() > now.getTime()) return localValue(todayAt);
    }
    return localValue(nextHalfHour(now));
  };
  section.querySelectorAll("[data-schedule]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!schedBox || !schedInput) return;
      const alreadyOpen = schedBox.style.display !== "none" && schedBox.dataset.task === btn.dataset.schedule;
      if (alreadyOpen) { schedBox.style.display = "none"; return; }
      schedBox.dataset.task = btn.dataset.schedule;
      schedInput.value = defaultScheduleValue(schedTask());
      schedBox.style.display = "";
      schedInput.focus();
    });
  });
  schedBox?.querySelectorAll("[data-sched-quick]").forEach(chip => {
    chip.addEventListener("click", () => {
      const task = schedTask();
      schedInput.value = chip.dataset.schedQuick === "now" ? localValue(new Date()) : todayScheduleValue(task);
    });
  });
  schedBox?.querySelector(".next-scheduler-cancel")?.addEventListener("click", () => { schedBox.style.display = "none"; });
  schedBox?.querySelector(".next-scheduler-save")?.addEventListener("click", async () => {
    if (!schedInput?.value) return;
    const saveBtn = schedBox.querySelector(".next-scheduler-save");
    saveBtn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/tasks/${schedBox.dataset.task}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_datetime: new Date(schedInput.value).toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      schedBox.style.display = "none";
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.initToday) await window.initToday();
      if (window.initWeek) window.initWeek();
    } catch (err) {
      console.error("No se pudo programar:", err);
      saveBtn.disabled = false;
    }
  });

  section.querySelectorAll("[data-done]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/tasks/${button.dataset.done}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_completed: true, completed_at: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.error("No se pudo marcar como hecha:", err);
        button.disabled = false;
        return;
      }
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.initToday) window.initToday();
      if (window.initWeek) window.initWeek();
      if (window.initReadiness) window.initReadiness();
    });
  });

  // Borrar desde la tarjeta o desde la agenda: con confirmación, igual que
  // el detalle. El trigger de papelera guarda la fila: es reversible.
  section.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.delete;
      if (!confirm("¿Eliminar esta tarea? Queda en la Papelera por si la recuperas.")) return;
      btn.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/tasks/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        console.error("No se pudo eliminar la tarea:", err);
        btn.disabled = false;
        return;
      }
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.initToday) window.initToday();
      if (window.initWeek) window.initWeek();
    });
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
    // Vencidos (pasados sin cerrar ni cancelar): en casa también se ven,
    // con acciones de cierre — no escondidos hasta que alguien abra el día.
    // Lo más reciente primero (lo de hoy es lo accionable) y tope de 3:
    // una muralla de atrasos viejos no ayuda a nadie.
    const overdue = allEvents
      .filter(e => {
        if (!e.start || e.status === "done" || e.status === "cancelled") return false;
        const start = new Date(e.start);
        return start.getTime() <= now && !(isDayOnly(start) && isToday(e.start));
      })
      .sort((a, b) => new Date(b.start) - new Date(a.start));
    if (upcoming.length === 0 && overdue.length === 0) return;
    if (!section.isConnected || section.querySelector("#next-event") !== box) return;
    const fmtWhen = (s) => {
      const date = new Date(s);
      const day = date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
      return isDayOnly(date) ? day : `${day} · ${date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
    };
    const eventRow = (e, isOverdue = false) => {
      const linked = tasks.filter(t => String(t.event_id) === String(e.id));
      const done = linked.filter(t => t.is_completed).length;
      const prep = linked.filter(t => !t.is_completed && (t.event_phase || "prep") === "prep").length;
      const leave = linked.filter(t => !t.is_completed && t.event_phase === "leave").length;
      const during = linked.filter(t => !t.is_completed && t.event_phase === "during").length;
      const status = !linked.length ? "Sin preparación registrada"
        : `${done}/${linked.length} listos${prep ? ` · ${prep} para preparar` : ""}${leave ? ` · ${leave} antes de salir` : ""}${during ? ` · ${during} ese día` : ""}`;
      // "Tomar ahora" solo si el evento es de hoy: para lo viejo, cerrar o mover.
      const sameDay = new Date(e.start).toDateString() === new Date().toDateString();
      return `<div class="next-event-row${isOverdue ? " next-event-overdue" : ""}">
        <span><button type="button" class="next-event-title" data-info="${e.id}" title="Ver toda la información del evento: detalle, edición y borrado">${escapeHtml(e.title)}</button> · ${escapeHtml(fmtWhen(e.start))}<small class="next-event-prep-status">${status}${e.conclusion ? ` · ✎ ${escapeHtml(e.conclusion)}` : ""}</small></span>
        ${isOverdue ? `<button class="next-alt next-alt-close" data-closeev="${e.id}" title="Registrar cómo salió, cancelarlo o moverlo de día">Cerrar</button>` : ""}
        ${isOverdue && sameDay ? `<button class="next-alt" data-takenow="${e.id}" title="Reprogramar para ahora: empieza en este momento">Tomar ahora</button>` : ""}
        <button class="next-alt" data-sched="${e.id}" title="${isOverdue ? "Reprogramar el momento" : "Programar el momento"}">${isOverdue ? "Reprogramar" : "Programar"}</button>
        <button class="next-alt" data-prep="${e.id}" title="Ver el evento y sus pasos de preparación">Ver preparación</button>
        <button class="next-alt next-alt-del" data-deleteev="${e.id}" title="Eliminar el evento (queda en la Papelera por si lo recuperas)">Eliminar</button>
      </div>`;
    };
    box.style.display = "";
    box.innerHTML = `
      ${overdue.length ? `<div class="next-event-label next-event-label-overdue">Pasados · ${overdue.length}</div>${overdue.slice(0, 3).map(e => eventRow(e, true)).join("")}${overdue.length > 3 ? `<details class="next-event-all"><summary>Ver los otros ${overdue.length - 3} pasados</summary>${overdue.slice(3).map(e => eventRow(e, true)).join("")}</details>` : ""}` : ""}
      <div class="next-event-label">Próximos eventos · ${upcoming.length} de ${allUpcoming.length}</div>
      ${upcoming.map(e => eventRow(e)).join("")}
      ${allUpcoming.length > 3 ? `<details class="next-event-all"><summary>Ver los otros ${allUpcoming.length - 3} eventos próximos</summary>${allUpcoming.slice(3).map(e => eventRow(e)).join("")}</details>` : ""}
    `;
    box.querySelectorAll("[data-closeev]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = Number(btn.dataset.closeev);
        if (window.openEventClose) window.openEventClose(id);
        else if (window.openEventDetail) window.openEventDetail(id);
      });
    });
    box.querySelectorAll("[data-takenow]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.takenow;
        btn.disabled = true;
        try {
          const cur = await fetch(`${API_BASE}/events/${id}`).then(r => r.json());
          if (!cur?.start) throw new Error("Sin inicio");
          const s = new Date(cur.start);
          const dur = cur.end ? new Date(cur.end).getTime() - s.getTime() : 0;
          s.setTime(Date.now());
          const body = { start: s.toISOString() };
          if (cur.end) body.end = new Date(s.getTime() + dur).toISOString();
          await fetch(`${API_BASE}/events/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (window.initToday) window.initToday();
          if (window.initWeek) window.initWeek();
          fillNextEvent(section);
        } catch {
          btn.disabled = false;
        }
      });
    });
    box.querySelectorAll("[data-prep]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (window.openEventDetail) window.openEventDetail(Number(btn.dataset.prep));
      });
    });
    // El título también abre el detalle: es la vía evidente a "ver más info".
    box.querySelectorAll("[data-info]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (window.openEventDetail) window.openEventDetail(Number(btn.dataset.info));
      });
    });
    // Opción rápida: programar o reprogramar el evento desde la lista.
    box.querySelectorAll("[data-sched]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (window.openEventSchedule) window.openEventSchedule(Number(btn.dataset.sched));
      });
    });
    // Borrar desde la lista, con la misma confirmación del detalle.
    // El trigger de papelera guarda la fila: es reversible.
    box.querySelectorAll("[data-deleteev]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.deleteev);
        if (!confirm("¿Eliminar este evento? Queda en la Papelera por si lo recuperas.")) return;
        btn.disabled = true;
        try {
          const res = await fetch(`${API_BASE}/events/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error("No se pudo eliminar el evento.");
          if (window.initCalendar) window.initCalendar();
          if (window.initWeek) window.initWeek();
          if (window.initToday) window.initToday();
          fillNextEvent(section);
        } catch {
          btn.disabled = false;
        }
      });
    });
  } catch {
    // ignore: the nudge is optional
  }
}

function plainText(value) {
  let source = String(value ?? "");
  for (let i = 0; i < 2; i++) {
    const withBreaks = source
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n");
    const doc = new DOMParser().parseFromString(withBreaks, "text/html");
    const text = doc.body.textContent || "";
    if (text === source) break;
    source = text;
  }
  return source.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The bloc accumulates "Avance · fecha" check-ins; the AHORA card only
// wants the original note (or first step), never the whole history.
function detailSnippet(value) {
  const text = plainText(value);
  if (!text) return "";
  const cut = text.indexOf("Avance · ");
  const head = cut >= 0 ? text.slice(0, cut) : text;
  const first = head.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)[0] || "";
  const clean = first.replace(/\s+/g, " ");
  return clean.length > 150 ? `${clean.slice(0, 150).trimEnd()}…` : clean;
}

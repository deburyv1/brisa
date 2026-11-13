/* ============================================
   BRISA - Tasks Module
   CRUD for tasks via /api/tasks
   ============================================ */
import { state } from "./state.js";
import { pairsHTML } from "./dataPairs.js?v=20261021pairs1";

const API_BASE = "/api";

let taskFilter = "pending";

// Pasos de una acción: se pueden plegar para ver la lista de un vistazo.
// El estado se recuerda entre sesiones y sobrevive a los re-renders.
const COLLAPSED_KEY = "brisa.tasksCollapsed";
let collapsedGroups = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSED_KEY) || "[]"));
  } catch {
    return new Set();
  }
})();

function toggleGroup(id) {
  const key = String(id);
  if (collapsedGroups.has(key)) collapsedGroups.delete(key);
  else collapsedGroups.add(key);
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsedGroups]));
  } catch {
    // modo privado: al menos vive durante la sesión
  }
}

function showTasksFeedback(section, message = "") {
  const el = section.querySelector("#tasks-feedback");
  if (el) { el.textContent = message; el.hidden = !message; }
}

async function fetchTasks() {
  try {
    const res = await fetch(`${API_BASE}/tasks`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar tareas:", e);
    return null;
  }
}

async function createTask(task) {
  const res = await fetch(`${API_BASE}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function updateTask(id, updates) {
  const res = await fetch(`${API_BASE}/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function deleteTask(id) {
  const res = await fetch(`${API_BASE}/tasks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/* Cuando eliges "solo el día" (sin hora), Brisa guarda 23:59 como límite
   del día (o 00:00 desde la ficha de la tarea). Mostrar "23:59" o "00:00"
   hace pensar que tú pusiste esa hora, así que en ese caso se muestra solo
   el día: hoy, mañana, ayer. */
function isDayOnly(d) {
  const h = d.getHours(), m = d.getMinutes();
  return (h === 0 && m === 0) || (h === 23 && m === 59);
}

function dayLabel(d) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target - start) / 86400000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function formatDateTime(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  if (isDayOnly(d)) return dayLabel(d);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " " +
         d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

const PRIORITY_LABELS = { high: "Alta", medium: "Media", low: "Baja" };

function priorityPill(priority) {
  const label = PRIORITY_LABELS[priority] || priority;
  return `<span class="task-priority ${priority}">${label}</span>`;
}

function isToday(dt) {
  if (!dt) return false;
  const d = new Date(dt);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

export async function initTasks() {
  const section = document.querySelector("#tasks-section");
  if (!section) return;

  const tasks = await fetchTasks();
  if (tasks === null) {
    state.tasksStatus = "error";
  } else {
    state.tasks = tasks;
    state.tasksStatus = "ready";
  }
  // Precargar eventos para que taskRowHtml muestre a qué evento sirve
  // cada tarea (correspondencia clara en la lista).
  try {
    if (!eventsCache) {
      const res = await fetch(`${API_BASE}/events`);
      eventsCache = res.ok ? await res.json() : [];
    }
  } catch { eventsCache = eventsCache || []; }
  const badge = document.querySelector('.nav[data-nav="tasks"] i');
  if (badge) badge.textContent = (tasks || []).filter(t => !t.is_completed).length;

  if (!tasks) {
    section.innerHTML = `
      <div class="tasks-empty">
        <div class="tasks-empty-icon">⚠️</div>
        <div class="tasks-empty-text">No se pudo conectar con el servidor.<br>Revisa que el backend esté corriendo e intenta de nuevo.</div>
        <button class="tasks-empty-btn" id="retry-tasks">Reintentar</button>
      </div>
    `;
    section.querySelector("#retry-tasks")?.addEventListener("click", () => {
      if (window.initTasks) window.initTasks();
    });
    return;
  }

  if (tasks.length === 0) {
    section.innerHTML = `
      <div class="tasks-empty">
        <div class="tasks-empty-icon">✅</div>
        <div class="tasks-empty-text">No tienes tareas pendientes.<br>Crea la primera para empezar.</div>
        <button class="tasks-empty-btn" id="add-first-task">+ Nueva tarea</button>
      </div>
    `;
    const btn = section.querySelector("#add-first-task");
    if (btn) {
      btn.addEventListener("click", () => {
        if (window.openTaskModal) window.openTaskModal();
      });
    }
    return;
  }

  renderTasks(section, tasks);
}

let eventsCache = null;

async function eventTitle(eventId) {
  if (!eventId) return "";
  try {
    if (!eventsCache) {
      const res = await fetch(`${API_BASE}/events`);
      eventsCache = res.ok ? await res.json() : [];
    }
    const ev = (eventsCache || []).find(e => String(e.id) === String(eventId));
    return ev ? ev.title : "";
  } catch {
    return "";
  }
}

async function aiContext(task) {
  const tasks = state.tasks || [];
  const parent = task.parent_task_id
    ? tasks.find(x => String(x.id) === String(task.parent_task_id))
    : null;
  const evTitle = await eventTitle(task.event_id || parent?.event_id);
  return {
    parentTitle: parent ? parent.title : "",
    eventTitle: evTitle,
  };
}

function eventTitleSync(eventId) {
  if (!eventId || !eventsCache) return "";
  const ev = (eventsCache || []).find(e => String(e.id) === String(eventId));
  return ev ? ev.title : "";
}

function parentTitle(tasks, task) {
  if (!task.parent_task_id) return "";
  const p = (tasks || []).find(x => String(x.id) === String(task.parent_task_id));
  return p ? p.title : "";
}

function taskRowHtml(t, tasks, isChild, group = null) {
  const fromParent = t.parent_task_id ? parentTitle(tasks, t) : "";
  const evTitle = t.event_id ? eventTitleSync(t.event_id) : "";
  const hiddenSteps = group && group.collapsed
    ? `<span class="task-steps">${group.count} paso${group.count === 1 ? "" : "s"} oculto${group.count === 1 ? "" : "s"}</span>`
    : "";
  return `
    <div class="task-item ${t.is_completed ? "done" : ""}${!t.is_completed && t.priority === "high" ? " urgent" : ""}${isChild ? " child" : ""}" data-task-id="${t.id}">
      <div class="task-checkbox ${t.is_completed ? "done" : ""}" data-action="toggle" role="checkbox" aria-checked="${!!t.is_completed}" aria-label="${t.is_completed ? "Marcar pendiente" : "Marcar completada"}: ${escapeHtml(t.title)}" tabindex="0" title="${t.is_completed ? "Marcar pendiente" : "Marcar completada"}"></div>
      ${group ? `<button class="task-collapse" data-action="collapse" aria-expanded="${group.collapsed ? "false" : "true"}"
          title="${group.collapsed ? "Mostrar" : "Ocultar"} los ${group.count} pasos">${group.collapsed ? "▸" : "▾"}</button>` : ""}
      <div class="task-info">
        <div class="task-name">${isChild ? "↳ " : ""}${escapeHtml(t.title)}</div>
        <div class="task-meta">
          ${hiddenSteps}
          ${fromParent ? `<span class="task-parent">de: ${escapeHtml(fromParent)}</span>` : ""}
          ${evTitle ? `<span class="task-event">🎪 Para: ${escapeHtml(evTitle)}</span>` : ""}
          ${t.scheduled_datetime ? `📅 ${formatDateTime(t.scheduled_datetime)}` : ""}
          ${t.due_datetime ? ` · ⏰ ${formatDateTime(t.due_datetime)}` : ""}
          ${t.estimated_minutes ? ` · ~${t.estimated_minutes} min` : ""}
          ${t.priority ? ` ${priorityPill(t.priority)}` : ""}
        </div>
      </div>
      <div class="task-actions">
        ${t.is_completed ? "" : `<button class="task-btn task-btn-start" data-action="start" title="Empezar ahora (mismo flujo que AHORA)">▶</button>`}
        ${!t.is_completed && (!t.due_datetime || !isToday(t.due_datetime)) ? `<button class="task-btn task-btn-postpone" data-action="postpone" title="Patear para mañana (no tiene fecha límite hoy)">⏭ Patear</button>` : ""}
        <button class="task-btn task-btn-ai" data-action="ai" title="Dividir con IA">✨</button>
        <button class="task-btn task-btn-edit" data-action="edit">Editar</button>
        <button class="task-btn task-btn-delete" data-action="delete">Eliminar</button>
      </div>
      <div class="task-ai-slot" id="ai-slot-${t.id}"></div>
    </div>
  `;
}
function renderTasks(section, tasks) {
  const pending = tasks.filter(t => !t.is_completed);
  const done = tasks.filter(t => t.is_completed);
  // Pendientes: la fecha más cercana primero (sin fecha al final).
  // Completadas: la más reciente primero.
  const byNearest = (a, b) => {
    const da = new Date(a.due_datetime || a.scheduled_datetime || "9999");
    const db = new Date(b.due_datetime || b.scheduled_datetime || "9999");
    return da - db;
  };
  const byNewest = (a, b) => new Date(b.completed_at || b.created_at) - new Date(a.completed_at || a.created_at);
  const byCreated = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  const visible = taskFilter === "done" ? [...done].sort(byNewest)
                  : taskFilter === "all" ? [...tasks].sort(byCreated)
                  : [...pending].sort(byNearest);

  const roots = visible.filter(t =>
    !t.parent_task_id || !visible.some(p => String(p.id) === String(t.parent_task_id)));
  const childrenOf = (pid) => visible.filter(t =>
    t.parent_task_id && String(t.parent_task_id) === String(pid));

  section.innerHTML = `
    <div class="tasks-header">
      <div class="tasks-title">Acciones</div>
      <button class="tasks-add-btn" id="add-task">+ Nueva</button>
    </div>
    <div class="tasks-filter">
      ${[["pending", `Pendientes · ${pending.length}`], ["done", `Completadas · ${done.length}`], ["all", `Todas · ${tasks.length}`]].map(([v, label]) => `
        <button class="tasks-filter-btn ${taskFilter === v ? "active" : ""}" data-filter="${v}">${label}</button>
      `).join("")}
    </div>
    <div class="tasks-feedback" id="tasks-feedback" role="alert" hidden></div>
    <div class="tasks-list">
      ${visible.length === 0 ? `
        <div class="tasks-empty">
          <div class="tasks-empty-text">${taskFilter === "done" ? "Nada completado todavía." : taskFilter === "all" ? "Sin tareas." : "Nada pendiente. 🌱"}</div>
        </div>
      ` : roots.map(t => {
        const kids = childrenOf(t.id);
        const collapsedNow = kids.length > 0 && collapsedGroups.has(String(t.id));
        return taskRowHtml(t, tasks, false, kids.length ? { count: kids.length, collapsed: collapsedNow } : null)
          + (kids.length ? `<div class="task-children" data-children-of="${t.id}"${collapsedNow ? ' data-collapsed="1"' : ""}>${
              kids.map(c => taskRowHtml(c, tasks, true)).join("")
            }</div>` : "");
      }).join("")}
    </div>
  `;

  const addBtn = section.querySelector("#add-task");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (window.openTaskModal) window.openTaskModal();
    });
  }

  section.querySelectorAll(".tasks-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      taskFilter = btn.dataset.filter;
      renderTasks(section, state.tasks || []);
    });
  });

  section.querySelectorAll(".task-item").forEach(item => {
    const id = item.dataset.taskId;

    item.querySelector('[data-action="toggle"]')?.addEventListener("click", async (e) => {
      if (e.currentTarget.getAttribute("aria-disabled") === "true") return;
      const task = state.tasks.find(t => t.id == id);
      if (!task) return;
      const completing = !task.is_completed;
      const toggle = e.currentTarget;
      toggle.setAttribute("aria-disabled", "true");
      showTasksFeedback(section);
      try {
        await updateTask(id, {
          is_completed: completing,
          completed_at: completing ? new Date().toISOString() : null,
        });
        if (window.initTasks) await window.initTasks();
        if (window.initReadiness) await window.initReadiness();
        if (window.renderNext) window.renderNext();
        if (window.initToday) await window.initToday();
      } catch {
        toggle.setAttribute("aria-disabled", "false");
        showTasksFeedback(section, "No se pudo actualizar la tarea. Sigue pendiente; intenta de nuevo.");
      }
    });
    item.querySelector('[data-action="toggle"]')?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        item.querySelector('[data-action="toggle"]')?.click();
      }
    });

    item.querySelector('[data-action="collapse"]')?.addEventListener("click", () => {
      toggleGroup(id);
      renderTasks(section, state.tasks || []);
    });

    item.querySelector('[data-action="ai"]')?.addEventListener("click", async () => {
      const task = state.tasks.find(t => t.id == id);
      if (!task) return;
      const btn = item.querySelector('[data-action="ai"]');
      btn.disabled = true;
      btn.textContent = "...";
      try {
        const ctx = await aiContext(task);
        const res = await fetch(`${API_BASE}/ai/split`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: task.title, ...ctx }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        showAISplit(task, data.steps);
      } catch (e) {
        alert(e.message || "No se pudo dividir. Intenta de nuevo.");
      } finally {
        btn.disabled = false;
        btn.textContent = "✨";
      }
    });

    item.querySelector('[data-action="start"]')?.addEventListener("click", () => {
      if (window.openFocus) window.openFocus(id);
    });

    item.querySelector('[data-action="postpone"]')?.addEventListener("click", async () => {
      const task = (state.tasks || []).find(t => String(t.id) === String(id));
      if (!task) return;
      const btn = item.querySelector('[data-action="postpone"]');
      if (btn) { btn.disabled = true; btn.textContent = "…"; }
      try {
        let payload;
        if (task.scheduled_datetime) {
          const d = new Date(task.scheduled_datetime);
          d.setDate(d.getDate() + 1);
          payload = { scheduled_datetime: d.toISOString() };
        } else if (task.due_datetime) {
          const due = new Date(task.due_datetime);
          const d = new Date();
          d.setDate(d.getDate() + 1);
          d.setHours(due.getHours(), due.getMinutes(), 0, 0);
          payload = { due_datetime: d.toISOString() };
        } else {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          d.setHours(9, 0, 0, 0);
          payload = { scheduled_datetime: d.toISOString() };
        }
        const res = await fetch(`${API_BASE}/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        if (window.initTasks) await window.initTasks();
        if (window.renderNext) window.renderNext();
        if (window.initToday) window.initToday();
        if (window.initWeek) window.initWeek();
      } catch (e) {
        console.error("No se pudo patear:", e);
        if (btn) { btn.disabled = false; btn.textContent = "⏭ Patear"; }
        showTasksFeedback(section, "No se pudo mover la tarea para mañana. Intenta de nuevo.");
      }
    });

    item.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      if (window.openTaskModal) window.openTaskModal(id);
    });

    item.addEventListener("click", (e) => {
      if (e.target.closest('[data-action]')) return;
      showTaskDetail(id);
    });

    item.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      showTasksFeedback(section);
      try {
        await deleteTask(id);
        if (window.initTasks) await window.initTasks();
        if (window.renderNext) window.renderNext();
        if (window.initToday) await window.initToday();
        if (window.initWeek) await window.initWeek();
      } catch {
        btn.disabled = false;
        showTasksFeedback(section, "No se pudo borrar esta tarea. Sigue en tu lista; intenta de nuevo.");
      }
    });
  });
}

// ---- Task detail modal ----

export function initTaskDetail() {
  const overlay = document.querySelector("#task-detail-modal");
  const closeBtn = document.querySelector("#task-detail-close");
  if (!overlay || !closeBtn) return;

  closeBtn.addEventListener("click", () => overlay.classList.remove("active"));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("active");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) {
      overlay.classList.remove("active");
    }
  });
}

async function showTaskDetail(id) {
  const overlay = document.querySelector("#task-detail-modal");
  const titleEl = document.querySelector("#task-detail-title");
  const body = document.querySelector("#task-detail-body");
  if (!overlay || !body) return;

  const task = (state.tasks || []).find(t => t.id == id);
  if (!task) return;

  const parent = task.parent_task_id
    ? (state.tasks || []).find(x => String(x.id) === String(task.parent_task_id))
    : null;
  const evTitle = await eventTitle(task.event_id || parent?.event_id);

  titleEl.textContent = task.title;
  body.innerHTML = `
    <div class="task-detail-context">
      ${parent ? `<span class="task-parent">↳ Parte de: ${escapeHtml(parent.title)}</span>` : ""}
      ${evTitle ? `<span class="task-event">🎪 Para: ${escapeHtml(evTitle)}</span>` : ""}
    </div>
    <div class="task-detail-meta">
      ${task.scheduled_datetime ? `<div>📅 ${formatDateTime(task.scheduled_datetime)}</div>` : ""}
      ${task.due_datetime ? `<div>⏰ ${formatDateTime(task.due_datetime)}</div>` : ""}
      ${task.estimated_minutes ? `<div>~${task.estimated_minutes} min</div>` : ""}
      ${task.priority ? `<div>Prioridad: ${PRIORITY_LABELS[task.priority] || task.priority}</div>` : ""}
      ${task.first_step ? `<div class="task-detail-step">Primer paso: ${escapeHtml(task.first_step)}</div>` : ""}
    </div>
    ${task.description ? `<div class="task-detail-desc">${escapeHtml(task.description)}</div>` : ""}
    ${pairsHTML(parent ? parent.data_pairs : task.data_pairs)}
    <div class="task-detail-ai" id="task-detail-ai"></div>
    <div class="modal-actions">
      <button class="modal-btn modal-btn-secondary" id="task-detail-edit">Editar</button>
      <button class="modal-btn modal-btn-primary" id="task-detail-ai-btn">✨ Dividir con IA</button>
      ${task.is_completed ? "" : (task.due_datetime && isToday(task.due_datetime) ? "" : `<button class="modal-btn modal-btn-secondary" id="task-detail-postpone">Patear → mañana</button>`)}
    </div>
  `;
  overlay.classList.add("active");

  body.querySelector("#task-detail-edit")?.addEventListener("click", () => {
    overlay.classList.remove("active");
    if (window.openTaskModal) window.openTaskModal(id);
  });

  const postponeBtn = body.querySelector("#task-detail-postpone");
  if (postponeBtn) {
    postponeBtn.addEventListener("click", async () => {
      postponeBtn.disabled = true;
      postponeBtn.textContent = "Pateando…";
      try {
        let payload;
        if (task.scheduled_datetime) {
          const d = new Date(task.scheduled_datetime);
          d.setDate(d.getDate() + 1);
          payload = { scheduled_datetime: d.toISOString() };
        } else if (task.due_datetime) {
          const due = new Date(task.due_datetime);
          const d = new Date();
          d.setDate(d.getDate() + 1);
          d.setHours(due.getHours(), due.getMinutes(), 0, 0);
          payload = { due_datetime: d.toISOString() };
        } else {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          d.setHours(9, 0, 0, 0);
          payload = { scheduled_datetime: d.toISOString() };
        }
        await fetch(`${API_BASE}/tasks/${task.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        overlay.classList.remove("active");
        if (window.initTasks) await window.initTasks();
        if (window.renderNext) window.renderNext();
        if (window.initToday) window.initToday();
        if (window.initWeek) window.initWeek();
      } catch (e) {
        console.error("No se pudo patear:", e);
        postponeBtn.disabled = false;
        postponeBtn.textContent = "Patear → mañana";
      }
    });
  }

  body.querySelector("#task-detail-ai-btn")?.addEventListener("click", async () => {
    const btn = body.querySelector("#task-detail-ai-btn");
    const aiBox = body.querySelector("#task-detail-ai");
    btn.disabled = true;
    btn.textContent = "Pensando...";
    aiBox.innerHTML = "";
    try {
      const ctx = await aiContext(task);
      const res = await fetch(`${API_BASE}/ai/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: task.title, ...ctx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      aiBox.innerHTML = `
        <div class="ai-steps">
          <div class="ai-steps-title">Pasos para «${escapeHtml(task.title)}»:</div>
          ${data.steps.map((s, i) => `
            <div class="ai-step">
              <span class="ai-step-num">${i + 1}</span>
              <span class="ai-step-text">${escapeHtml(s)}</span>
              <button class="ai-step-add" data-step="${i}" title="Agregar como paso de esta acción">+</button>
            </div>`).join("")}
          <button class="modal-btn modal-btn-primary" id="ai-add-all" style="margin-top:8px">Agregar todos como pasos</button>
        </div>
      `;
      aiBox.querySelectorAll(".ai-step-add").forEach(b => {
        b.addEventListener("click", () => addStepAsTask(data.steps[Number(b.dataset.step)], task));
      });
      aiBox.querySelector("#ai-add-all")?.addEventListener("click", async () => {
        for (const s of data.steps) await addStepAsTask(s, task);
      });
    } catch (e) {
      aiBox.innerHTML = `<div class="ai-error">${escapeHtml(e.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "✨ Dividir con IA";
    }
  });
}

async function addStepAsTask(stepText, parentTask = null) {
  try {
    await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: stepText,
        parent_task_id: parentTask?.id || null,
        event_id: parentTask?.event_id || null,
      }),
    });
    if (window.initTasks) window.initTasks();
  } catch (e) {
    console.error("Error creando paso:", e);
  }
}

function showAISplit(task, steps) {
  // Suggestion box attached INSIDE the task row: it belongs to it.
  const slot = document.querySelector(`#ai-slot-${task.id}`);
  if (!slot) return;
  slot.innerHTML = `
    <div class="ai-steps attached">
      <div class="ai-steps-title">Pasos para «${escapeHtml(task.title)}»:</div>
      ${steps.map((s, i) => `
        <div class="ai-step">
          <span class="ai-step-num">${i + 1}</span>
          <span class="ai-step-text">${escapeHtml(s)}</span>
          <button class="ai-step-add" data-step="${i}" title="Agregar como paso de esta acción">+</button>
        </div>`).join("")}
      <button class="modal-btn modal-btn-primary" id="ai-inline-add-all" style="margin-top:8px">Agregar todos como pasos</button>
    </div>
  `;
  slot.querySelectorAll(".ai-step-add").forEach(b => {
    b.addEventListener("click", () => addStepAsTask(steps[Number(b.dataset.step)], task));
  });
  slot.querySelector("#ai-inline-add-all")?.addEventListener("click", async () => {
    for (const s of steps) await addStepAsTask(s, task);
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

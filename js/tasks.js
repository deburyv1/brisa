/* ============================================
   BRISA - Tasks Module
   CRUD for tasks via /api/tasks
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";

let taskFilter = "pending";

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

function formatDateTime(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " " +
         d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

const PRIORITY_LABELS = { high: "Alta", medium: "Media", low: "Baja" };

function priorityPill(priority) {
  const label = PRIORITY_LABELS[priority] || priority;
  return `<span class="task-priority ${priority}">${label}</span>`;
}

export async function initTasks() {
  const section = document.querySelector("#tasks-section");
  if (!section) return;

  const tasks = await fetchTasks();
  state.tasks = tasks || [];

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

function parentTitle(tasks, task) {
  if (!task.parent_task_id) return "";
  const p = (tasks || []).find(x => String(x.id) === String(task.parent_task_id));
  return p ? p.title : "";
}

function taskRowHtml(t, tasks, isChild) {
  const fromParent = t.parent_task_id ? parentTitle(tasks, t) : "";
  return `
    <div class="task-item ${t.is_completed ? "done" : ""}${!t.is_completed && t.priority === "high" ? " urgent" : ""}${isChild ? " child" : ""}" data-task-id="${t.id}">
      <div class="task-checkbox ${t.is_completed ? "done" : ""}" data-action="toggle" role="checkbox" tabindex="0" title="Marcar completada"></div>
      <div class="task-info">
        <div class="task-name">${isChild ? "↳ " : ""}${escapeHtml(t.title)}</div>
        <div class="task-meta">
          ${fromParent ? `<span class="task-parent">de: ${escapeHtml(fromParent)}</span>` : ""}
          ${t.scheduled_datetime ? `📅 ${formatDateTime(t.scheduled_datetime)}` : ""}
          ${t.due_datetime ? ` · ⏰ ${formatDateTime(t.due_datetime)}` : ""}
          ${t.estimated_minutes ? ` · ~${t.estimated_minutes} min` : ""}
          ${t.priority ? ` ${priorityPill(t.priority)}` : ""}
        </div>
      </div>
      <div class="task-actions">
        ${t.is_completed ? "" : `<button class="task-btn task-btn-start" data-action="start" title="Empezar ahora (mismo flujo que AHORA)">▶</button>`}
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
  const visible = taskFilter === "done" ? done : taskFilter === "all" ? tasks : pending;

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
    <div class="tasks-list">
      ${visible.length === 0 ? `
        <div class="tasks-empty">
          <div class="tasks-empty-text">${taskFilter === "done" ? "Nada completado todavía." : taskFilter === "all" ? "Sin tareas." : "Nada pendiente. 🌱"}</div>
        </div>
      ` : roots.map(t => `
        ${taskRowHtml(t, tasks, false)}
        ${childrenOf(t.id).map(c => taskRowHtml(c, tasks, true)).join("")}
      `).join("")}
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

    item.querySelector('[data-action="toggle"]')?.addEventListener("click", async () => {
      const task = state.tasks.find(t => t.id == id);
      const completing = !task.is_completed;
      await updateTask(id, {
        is_completed: completing,
        completed_at: completing ? new Date().toISOString() : null,
      });
      if (window.initTasks) await window.initTasks();
      if (window.initReadiness) window.initReadiness();
      if (window.renderNext) window.renderNext();
      if (window.initToday) window.initToday();
    });
    item.querySelector('[data-action="toggle"]')?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        item.querySelector('[data-action="toggle"]')?.click();
      }
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

    item.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      if (window.openTaskModal) window.openTaskModal(id);
    });

    item.addEventListener("click", (e) => {
      if (e.target.closest('[data-action]')) return;
      showTaskDetail(id);
    });

    item.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      if (confirm("¿Eliminar esta tarea?")) {
        await deleteTask(id);
        if (window.initTasks) await window.initTasks();
        if (window.renderNext) window.renderNext();
        if (window.initToday) window.initToday();
        if (window.initWeek) window.initWeek();
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
    <div class="task-detail-ai" id="task-detail-ai"></div>
    <div class="modal-actions">
      <button class="modal-btn modal-btn-secondary" id="task-detail-edit">Editar</button>
      <button class="modal-btn modal-btn-primary" id="task-detail-ai-btn">✨ Dividir con IA</button>
    </div>
  `;
  overlay.classList.add("active");

  body.querySelector("#task-detail-edit")?.addEventListener("click", () => {
    overlay.classList.remove("active");
    if (window.openTaskModal) window.openTaskModal(id);
  });

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

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

function renderTasks(section, tasks) {
  const pending = tasks.filter(t => !t.is_completed);
  const done = tasks.filter(t => t.is_completed);
  const visible = taskFilter === "done" ? done : taskFilter === "all" ? tasks : pending;

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
      ` : visible.map(t => `
        <div class="task-item ${t.is_completed ? "done" : ""}${!t.is_completed && t.priority === "high" ? " urgent" : ""}" data-task-id="${t.id}">
          <div class="task-checkbox ${t.is_completed ? "done" : ""}" data-action="toggle"></div>
          <div class="task-info">
            <div class="task-name">${t.title}</div>
            <div class="task-meta">
              ${t.scheduled_datetime ? `📅 ${formatDateTime(t.scheduled_datetime)}` : ""}
              ${t.due_datetime ? ` · ⏰ ${formatDateTime(t.due_datetime)}` : ""}
              ${t.estimated_minutes ? ` · ~${t.estimated_minutes} min` : ""}
              ${t.priority ? ` ${priorityPill(t.priority)}` : ""}
            </div>
          </div>
          <div class="task-actions">
            <button class="task-btn task-btn-ai" data-action="ai" title="Dividir con IA">✨</button>
            <button class="task-btn task-btn-edit" data-action="edit">Editar</button>
            <button class="task-btn task-btn-delete" data-action="delete">Eliminar</button>
          </div>
        </div>
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
      if (window.initTasks) window.initTasks();
      if (window.initReadiness) window.initReadiness();
    });

    item.querySelector('[data-action="ai"]')?.addEventListener("click", async () => {
      const task = state.tasks.find(t => t.id == id);
      if (!task) return;
      const btn = item.querySelector('[data-action="ai"]');
      btn.disabled = true;
      btn.textContent = "...";
      try {
        const res = await fetch(`${API_BASE}/ai/split`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: task.title }),
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
        if (window.initTasks) window.initTasks();
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

  titleEl.textContent = task.title;
  body.innerHTML = `
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
      const res = await fetch(`${API_BASE}/ai/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: task.title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      aiBox.innerHTML = `
        <div class="ai-steps">
          <div class="ai-steps-title">La IA sugiere estos pasos:</div>
          ${data.steps.map((s, i) => `
            <div class="ai-step">
              <span class="ai-step-num">${i + 1}</span>
              <span class="ai-step-text">${escapeHtml(s)}</span>
              <button class="ai-step-add" data-step="${i}" title="Agregar como tarea">+</button>
            </div>`).join("")}
          <button class="modal-btn modal-btn-primary" id="ai-add-all" style="margin-top:8px">Agregar todos como tareas</button>
        </div>
      `;
      aiBox.querySelectorAll(".ai-step-add").forEach(b => {
        b.addEventListener("click", () => addStepAsTask(data.steps[Number(b.dataset.step)]));
      });
      aiBox.querySelector("#ai-add-all")?.addEventListener("click", async () => {
        for (const s of data.steps) await addStepAsTask(s);
      });
    } catch (e) {
      aiBox.innerHTML = `<div class="ai-error">${escapeHtml(e.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = "✨ Dividir con IA";
    }
  });
}

async function addStepAsTask(stepText) {
  try {
    await fetch(`${API_BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: stepText }),
    });
    if (window.initTasks) window.initTasks();
  } catch (e) {
    console.error("Error creando paso:", e);
  }
}

function showAISplit(task, steps) {
  // Inline AI result in the task list row
  const existing = document.querySelector(`#ai-inline-${task.id}`);
  if (existing) existing.remove();
  const row = document.querySelector(`.task-item[data-task-id="${task.id}"]`);
  if (!row) return;
  const div = document.createElement("div");
  div.id = `ai-inline-${task.id}`;
  div.className = "ai-inline";
  div.innerHTML = `
    <div class="ai-steps">
      <div class="ai-steps-title">La IA sugiere estos pasos:</div>
      ${steps.map((s, i) => `
        <div class="ai-step">
          <span class="ai-step-num">${i + 1}</span>
          <span class="ai-step-text">${escapeHtml(s)}</span>
          <button class="ai-step-add" data-step="${i}" title="Agregar como tarea">+</button>
        </div>`).join("")}
      <button class="modal-btn modal-btn-primary" id="ai-inline-add-all" style="margin-top:8px">Agregar todos como tareas</button>
    </div>
  `;
  row.after(div);
  div.querySelectorAll(".ai-step-add").forEach(b => {
    b.addEventListener("click", () => addStepAsTask(steps[Number(b.dataset.step)]));
  });
  div.querySelector("#ai-inline-add-all")?.addEventListener("click", async () => {
    for (const s of steps) await addStepAsTask(s);
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

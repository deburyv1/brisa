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
    });

    item.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      if (window.openTaskModal) window.openTaskModal(id);
    });

    item.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      if (confirm("¿Eliminar esta tarea?")) {
        await deleteTask(id);
        if (window.initTasks) window.initTasks();
      }
    });
  });
}

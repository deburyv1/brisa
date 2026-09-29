/* ============================================
   BRISA - Tasks Module
   CRUD for tasks via /api/tasks
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";

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
        <div class="tasks-empty-text">No se pudo conectar con el servidor.<br>Revisá que el backend esté corriendo e intentá de nuevo.</div>
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
        <div class="tasks-empty-text">No tenés tareas pendientes.<br>Creá la primera para empezar.</div>
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
  section.innerHTML = `
    <div class="tasks-header">
      <div class="tasks-title">Acciones</div>
      <button class="tasks-add-btn" id="add-task">+ Nueva</button>
    </div>
    <div class="tasks-list">
      ${tasks.map(t => `
        <div class="task-item ${t.is_completed ? "done" : ""}" data-task-id="${t.id}">
          <div class="task-checkbox ${t.is_completed ? "done" : ""}" data-action="toggle"></div>
          <div class="task-info">
            <div class="task-name">${t.title}</div>
            <div class="task-meta">
              ${t.scheduled_datetime ? `📅 ${formatDateTime(t.scheduled_datetime)}` : ""}
              ${t.due_datetime ? ` · ⏰ ${formatDateTime(t.due_datetime)}` : ""}
              ${t.priority ? ` · ${t.priority}` : ""}
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

  section.querySelectorAll(".task-item").forEach(item => {
    const id = item.dataset.taskId;

    item.querySelector('[data-action="toggle"]')?.addEventListener("click", async () => {
      const task = state.tasks.find(t => t.id == id);
      await updateTask(id, { is_completed: !task.is_completed });
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

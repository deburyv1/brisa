/* ============================================
   BRISA - Task Modal Module
   Handles task creation and editing
   ============================================ */
const API_BASE = "/api";

function toLocalInput(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initTaskModal() {
  const overlay = document.querySelector("#task-modal");
  const closeBtn = document.querySelector("#task-modal-close");
  const cancelBtn = document.querySelector("#task-modal-cancel");
  const form = document.querySelector("#task-form");
  const titleEl = document.querySelector("#task-modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form || !titleEl) return;

  let editingId = null;

  function open(taskId = null) {
    editingId = taskId;
    form.reset();

    if (taskId) {
      titleEl.textContent = "Editar tarea";
      fetch(`${API_BASE}/tasks/${taskId}`)
        .then(r => r.json())
        .then(task => {
          form.title.value = task.title || "";
          form.description.value = task.description || "";
          form.scheduled_datetime.value = toLocalInput(task.scheduled_datetime);
          form.due_datetime.value = toLocalInput(task.due_datetime);
          form.priority.value = task.priority || "medium";
        });
    } else {
      titleEl.textContent = "Nueva tarea";
    }

    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='title']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    overlay.classList.remove("active");
    form.reset();
    editingId = null;
  }

  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.title || !data.title.trim()) return;

    try {
      if (editingId) {
        await fetch(`${API_BASE}/tasks/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } else {
        await fetch(`${API_BASE}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      }
      close();
      if (window.initTasks) window.initTasks();
    } catch (err) {
      console.error("Error guardando tarea:", err);
      alert("No se pudo guardar. Intentá de nuevo.");
    }
  });

  window.openTaskModal = open;
}

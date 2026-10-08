/* ============================================
   BRISA - Task Modal Module
   Handles task creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard, toISODateTime } from "./modalGuard.js";

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
  let cleanSnapshot = null;

  async function fillReadinessOptions(selectedItemId) {
    const sel = form.querySelector("#task-readiness-select");
    if (!sel) return;
    sel.innerHTML = `<option value="">Nada</option>`;
    try {
      const res = await fetch(`${API_BASE}/readiness`);
      if (!res.ok) return;
      const items = await res.json();
      for (const it of items) {
        const opt = document.createElement("option");
        opt.value = it.id;
        opt.textContent = it.label;
        if (String(it.id) === String(selectedItemId)) opt.selected = true;
        sel.appendChild(opt);
      }
    } catch (e) {
      console.error("Error cargando condiciones:", e);
    }
  }

  async function linkedReadinessItem(taskId) {
    try {
      const res = await fetch(`${API_BASE}/readiness`);
      if (!res.ok) return null;
      const items = await res.json();
      return items.find(i => i.source_type === "task" && String(i.source_id) === String(taskId)) || null;
    } catch {
      return null;
    }
  }

  async function saveReadinessLink(taskId) {
    const sel = form.querySelector("#task-readiness-select");
    const itemId = sel?.value || null;
    if (!itemId) return;
    try {
      await fetch(`${API_BASE}/readiness/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: "task", source_id: Number(taskId) }),
      });
    } catch (e) {
      console.error("Error vinculando condición:", e);
    }
  }

  function open(taskId = null) {
    editingId = taskId;
    form.reset();
    const result = document.querySelector("#ai-split-result");
    if (result) { result.style.display = "none"; result.innerHTML = ""; }

    if (taskId) {
      titleEl.textContent = "Editar tarea";
      fetch(`${API_BASE}/tasks/${taskId}`)
        .then(r => r.json())
        .then(async task => {
          form.title.value = task.title || "";
          form.description.value = task.description || "";
          form.first_step.value = task.first_step || "";
          form.scheduled_datetime.value = toLocalInput(task.scheduled_datetime);
          form.due_datetime.value = toLocalInput(task.due_datetime);
          form.priority.value = task.priority || "medium";
          form.estimated_minutes.value = task.estimated_minutes ?? "";
          const linked = await linkedReadinessItem(taskId);
          await fillReadinessOptions(linked?.id || "");
          cleanSnapshot = snapshotForm(form);
        });
    } else {
      titleEl.textContent = "Nueva tarea";
      fillReadinessOptions("").then(() => {
        cleanSnapshot = snapshotForm(form);
      });
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

  function tryClose() {
    if (isDirty(form, cleanSnapshot) && !confirmDiscard()) return;
    close();
  }

  closeBtn.addEventListener("click", tryClose);
  cancelBtn.addEventListener("click", tryClose);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) tryClose();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) tryClose();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.title || !data.title.trim()) return;

    try {
      let savedId = editingId;
      if (editingId) {
        await fetch(`${API_BASE}/tasks/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            scheduled_datetime: toISODateTime(data.scheduled_datetime),
            due_datetime: toISODateTime(data.due_datetime),
          }),
        });
      } else {
        const res = await fetch(`${API_BASE}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            scheduled_datetime: toISODateTime(data.scheduled_datetime),
            due_datetime: toISODateTime(data.due_datetime),
          }),
        });
        const created = await res.json().catch(() => null);
        if (created?.id) savedId = created.id;
      }
      // Reconcile readiness link: selected item points here, previous link cleared
      const selItemId = form.querySelector("#task-readiness-select")?.value || null;
      if (savedId) {
        try {
          const prev = await linkedReadinessItem(savedId);
          if (prev && String(prev.id) !== String(selItemId)) {
            await fetch(`${API_BASE}/readiness/items/${prev.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source_type: null, source_id: null }),
            });
          }
          if (selItemId && (!prev || String(prev.id) !== String(selItemId))) {
            await fetch(`${API_BASE}/readiness/items/${selItemId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ source_type: "task", source_id: Number(savedId) }),
            });
          }
        } catch (e) {
          console.error("Error vinculando condición:", e);
        }
      }
      close();
      if (window.initTasks) window.initTasks();
    } catch (err) {
      console.error("Error guardando tarea:", err);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });

  window.openTaskModal = open;
}

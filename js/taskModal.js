/* ============================================
   BRISA - Task Modal Module
   Handles task creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard, toISODateTime, setFormFeedback, setFormBusy, setFormLoading, isFormSaving } from "./modalGuard.js";
import { pairsEditorHTML, wirePairsEditor, collectPairs } from "./dataPairs.js?v=20261021pairs1";

function toLocalDate(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toLocalTime(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function combineDateTime(date, time) {
  if (!date) return null;
  return toISODateTime(`${date}T${time || "00:00"}`);
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
  let loadGeneration = 0;

  // Se re-renderiza en cada apertura (el div #task-pairs-editor
  // persiste, pero su interior y sus listeners no).
  function renderPairsEditor(pairs) {
    const box = form.querySelector("#task-pairs-editor");
    if (!box) return;
    box.innerHTML = pairsEditorHTML(pairs);
    wirePairsEditor(box.querySelector(".task-pairs-edit"));
  }

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
    const generation = ++loadGeneration;
    editingId = taskId;
    form.reset();
    window.resetPickers(form);
    setFormFeedback(form, "");
    const result = document.querySelector("#ai-split-result");
    if (result) { result.style.display = "none"; result.innerHTML = ""; }

    if (taskId) {
      titleEl.textContent = "Editar tarea";
      setFormLoading(form, true);
      cleanSnapshot = null;
      fetch(`${API_BASE}/tasks/${taskId}`)
        .then(r => {
          if (!r.ok) throw new Error("No se pudo cargar esta tarea.");
          return r.json();
        })
        .then(async task => {
          if (generation !== loadGeneration) return;
          form.title.value = task.title || "";
          form.description.value = task.description || "";
          form.first_step.value = task.first_step || "";
          window.setPickerValue(form.scheduled_date, toLocalDate(task.scheduled_datetime));
          window.setPickerValue(form.scheduled_time, toLocalTime(task.scheduled_datetime));
          window.setPickerValue(form.due_date, toLocalDate(task.due_datetime));
          window.setPickerValue(form.due_time, toLocalTime(task.due_datetime));
          form.priority.value = task.priority || "medium";
          form.estimated_minutes.value = task.estimated_minutes ?? "";
          renderPairsEditor(task.data_pairs);
          const linked = await linkedReadinessItem(taskId);
          await fillReadinessOptions(linked?.id || "");
          if (generation !== loadGeneration) return;
          setFormLoading(form, false);
          cleanSnapshot = snapshotForm(form);
        })
        .catch(err => {
          if (generation !== loadGeneration) return;
          setFormLoading(form, false);
          setFormFeedback(form, err.message || "No se pudo cargar esta tarea. Cierra e inténtalo de nuevo.");
          const submit = form.querySelector("button[type='submit']");
          if (submit) submit.disabled = true;
        });
    } else {
      titleEl.textContent = "Nueva tarea";
      setFormBusy(form, false);
      renderPairsEditor([]);
      const pristineSnapshot = snapshotForm(form);
      cleanSnapshot = pristineSnapshot;
      fillReadinessOptions("").then(() => {
        if (!isDirty(form, pristineSnapshot)) cleanSnapshot = snapshotForm(form);
      });
    }

    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='title']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    loadGeneration++;
    overlay.classList.remove("active");
    setFormBusy(form, false);
    setFormFeedback(form, "");
    form.reset();
    window.resetPickers(form);
    editingId = null;
  }

  function tryClose() {
    if (isFormSaving(form)) return;
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

    if (!data.title || !data.title.trim()) {
      setFormFeedback(form, "Escribe un título para la tarea.");
      form.title.focus();
      return;
    }
    setFormFeedback(form, "");
    setFormBusy(form, true);

    const payload = { ...data };
    delete payload.scheduled_date;
    delete payload.scheduled_time;
    delete payload.due_date;
    delete payload.due_time;
    // Inputs del editor de datos útiles: solo interesan ya colectados.
    for (const key of Object.keys(payload)) {
      if (key.startsWith("pair_label_") || key.startsWith("pair_value_")) delete payload[key];
    }
    payload.scheduled_datetime = combineDateTime(data.scheduled_date, data.scheduled_time);
    payload.due_datetime = combineDateTime(data.due_date, data.due_time);
    payload.data_pairs = collectPairs(form.querySelector("#task-pairs-editor .task-pairs-edit"));

    try {
      let savedId = editingId;
      if (editingId) {
        const res = await fetch(`${API_BASE}/tasks/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("No se pudo guardar la tarea. Revisa los datos e inténtalo de nuevo.");
      } else {
        const res = await fetch(`${API_BASE}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("No se pudo crear la tarea. Revisa los datos e inténtalo de nuevo.");
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
      setFormFeedback(form, err.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setFormBusy(form, false);
    }
  });

  window.openTaskModal = open;
}

/* ============================================
   BRISA - Workmode (deep work view)
   Current task + shared timer + scratch note.
   No new tables: scratch lives in task.description.
   ============================================ */
import { state } from "./state.js";
import { pickNextAction } from "./nextAction.js";
import { createEditor, editorHTML, isHTML } from "./richtext.js";

const API_BASE = "/api";

let currentId = null;
let quill = null;
let saveTimer = null;
let pollTimer = null;
let dirty = false;
let unloadBound = false;

function pendingTasks() {
  return (state.tasks || []).filter(t => !t.is_completed);
}

function resolveTask() {
  const pending = pendingTasks();
  if (pending.some(t => String(t.id) === String(currentId))) {
    return pending.find(t => String(t.id) === String(currentId));
  }
  const pick = pickNextAction(state.tasks || [], new Date());
  const task = pick && pick.current ? pick.current : pending[0] || null;
  currentId = task ? task.id : null;
  return task;
}

function fmt(sec) {
  const n = Number(sec);
  const s = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Parent breadcrumb: when working a step, show which action it
// belongs to and where you are in it.
function parentContext(task) {
  if (task.parent_task_id == null) return "";
  const all = state.tasks || [];
  const parent = all.find(t => String(t.id) === String(task.parent_task_id));
  if (!parent) return "";
  const siblings = all.filter(t => String(t.parent_task_id) === String(parent.id));
  const pos = siblings.findIndex(t => String(t.id) === String(task.id)) + 1;
  const total = siblings.length;
  return `
    <button type="button" class="workmode-parent" data-parent="${parent.id}" title="Ver la acción completa">
      Parte de: <strong>${escapeHtml(parent.title)}</strong>${total > 0 ? ` · Paso ${pos} de ${total}` : ""}
    </button>`;
}

async function flushSave() {
  if (!dirty || !quill || !currentId) return;
  dirty = false;
  paintSaveState("saving");
  try {
    await fetch(`${API_BASE}/tasks/${currentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: editorHTML(quill) }),
    });
    const t = (state.tasks || []).find(x => String(x.id) === String(currentId));
    if (t) t.description = editorHTML(quill);
    paintSaveState("saved");
  } catch (e) {
    console.warn("No se pudo guardar el bloc:", e);
    dirty = true;
    paintSaveState("error");
  }
}

function paintSaveState(s) {
  const el = document.querySelector("#workmode-save-state");
  if (!el) return;
  el.textContent = s === "saving" ? "Guardando…" : s === "saved" ? "Guardado ✓" : s === "error" ? "Sin guardar (reintentando)" : "";
  el.dataset.state = s;
}

function paintTimer() {
  const t = window.brisaTimer && window.brisaTimer.timeLeft ? window.brisaTimer.timeLeft() : null;
  const clock = document.querySelector("#workmode-clock");
  const toggle = document.querySelector("#workmode-toggle");
  if (!clock || !t) return;
  clock.textContent = fmt(t.remainingSec);
  clock.classList.toggle("running", t.running);
  if (toggle) toggle.textContent = t.running ? "⏸ Pausar" : "▶ Empezar";
  document.querySelectorAll(".workmode-preset").forEach(b => {
    b.classList.toggle("selected", Math.round(t.totalSec / 60) === Number(b.dataset.min));
  });
}

function render(section) {
  const task = resolveTask();
  const pending = pendingTasks();

  if (!task) {
    section.innerHTML = `
      <div class="workmode-empty">
        <div class="workmode-empty-icon">✓</div>
        <div class="workmode-empty-text">Nada pendiente.<br>Buen momento para capturar algo nuevo.</div>
      </div>`;
    return;
  }

  section.innerHTML = `
    <div class="workmode-header">
      <div class="workmode-title">Enfoque</div>
      <div class="workmode-tools">
        <select id="workmode-task-select" class="workmode-select" title="Cambiar de tarea">
          ${pending.map(t => `<option value="${t.id}" ${String(t.id) === String(task.id) ? "selected" : ""}>${escapeHtml(t.title)}</option>`).join("")}
        </select>
        <button class="workmode-zen-btn" id="workmode-zen" title="Ocultar barra lateral">⛶ Zen</button>
      </div>
    </div>
    <div class="workmode-grid">
      <div class="workmode-task aero-panel">
        ${parentContext(task)}
        <div class="workmode-task-title">${escapeHtml(task.title)}</div>
        ${task.first_step ? `<div class="workmode-step">Ahora mismo, solo esto: <strong>${escapeHtml(task.first_step)}</strong></div>` : `<div class="workmode-step dim">Sin primer paso definido.</div>`}
        <div class="workmode-timer">
          <div class="workmode-clock" id="workmode-clock">--:--</div>
          <div class="workmode-presets">
            ${[10, 15, 25].map(m => `<button class="workmode-preset" data-min="${m}">${m}</button>`).join("")}
            <button class="workmode-preset workmode-reset" id="workmode-reset" title="Detener y volver al inicio">↺</button>
          </div>
          <div class="workmode-actions">
            <button class="modal-btn modal-btn-primary" id="workmode-toggle">▶ Empezar</button>
            <button class="modal-btn modal-btn-secondary" id="workmode-stuck">¿Trabado?</button>
          </div>
          <button class="modal-btn modal-btn-secondary" id="workmode-done">Marcar hecha ✓</button>
        </div>
      </div>
      <div class="workmode-notes aero-panel">
        <div class="workmode-notes-head">
          <span>Bloc de la sesión</span>
          <span id="workmode-save-state" class="workmode-save"></span>
        </div>
        <div id="workmode-quill"></div>
        <div class="workmode-notes-hint">Se guarda solo en esta tarea · Ctrl+Enter para terminar</div>
      </div>
    </div>
  `;

  section.querySelector("#workmode-task-select")?.addEventListener("change", async (e) => {
    await flushSave();
    currentId = e.target.value;
    render(section);
  });

  section.querySelector("#workmode-zen")?.addEventListener("click", () => {
    document.body.classList.toggle("zen");
  });

  section.querySelector(".workmode-parent")?.addEventListener("click", (e) => {
    const pid = e.currentTarget.dataset.parent;
    if (pid && window.openFocus) window.openFocus(pid);
  });

  section.querySelectorAll(".workmode-preset").forEach(b => {
    b.addEventListener("click", () => {
      if (window.brisaTimer) window.brisaTimer.setMinutes(Number(b.dataset.min));
      paintTimer();
    });
  });

  section.querySelector("#workmode-toggle")?.addEventListener("click", () => {
    if (!window.brisaTimer) return;
    if (window.brisaTimer.isRunning()) window.brisaTimer.stop();
    else window.brisaTimer.start();
    paintTimer();
  });

  section.querySelector("#workmode-reset")?.addEventListener("click", () => {
    if (!window.brisaTimer || !window.brisaTimer.timeLeft) return;
    const t = window.brisaTimer.timeLeft();
    const total = t && Number.isFinite(t.totalSec) ? t.totalSec : 600;
    const mins = Math.max(1, Math.round(total / 60));
    window.brisaTimer.stop();
    window.brisaTimer.setMinutes(mins);
    paintTimer();
  });

  section.querySelector("#workmode-stuck")?.addEventListener("click", () => {
    if (window.openFocus) window.openFocus(task.id, { friction: true });
  });

  section.querySelector("#workmode-done")?.addEventListener("click", async () => {
    await flushSave();
    try {
      await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: true, completed_at: new Date().toISOString() }),
      });
    } catch (e) {
      console.error("Error completando tarea:", e);
    }
    if (window.initTasks) await window.initTasks();
    if (window.renderNext) window.renderNext();
    if (window.initToday) window.initToday();
    currentId = null;
    render(section);
  });

  quill = createEditor(section.querySelector("#workmode-quill"), {
    placeholder: "Ideas sueltas, trazos, lo que salga…",
  });
  if (quill) {
    const html = task.description || "";
    try {
      if (html && isHTML(html)) quill.setContents(quill.clipboard.convert(html));
      else quill.setText(html || "");
    } catch {
      quill.setText(quill.getText() || "");
    }
    quill.off("text-change", onEdit);
    quill.on("text-change", onEdit);
    quill.keyboard.addBinding({ key: "Enter", ctrlKey: true, handler: () => {
      section.querySelector("#workmode-done")?.click();
    }});
    function onEdit() {
      dirty = true;
      paintSaveState("saving");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 800);
    }
  }

  paintTimer();
}

export async function initWorkmode() {
  const section = document.querySelector("#workmode-section");
  if (!section) return;
  await flushSave();
  render(section);
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (document.querySelector("#workmode-section #workmode-clock")) paintTimer();
    }, 500);
  }
  if (!unloadBound) {
    unloadBound = true;
    window.addEventListener("beforeunload", () => {
      if (dirty && quill && currentId) {
        try {
          fetch(`${API_BASE}/tasks/${currentId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: editorHTML(quill) }),
            keepalive: true,
          }).catch(() => {});
        } catch {
          // ignore
        }
      }
    });
  }
}

// Enters work mode on a specific task (e.g. from Empezar buttons):
// selects it, navigates to the view, renders fresh.
export async function startWorkmode(taskId) {
  await flushSave();
  if (taskId != null) currentId = taskId;
  document.querySelector('.nav[data-nav="workmode"]')?.click();
  await initWorkmode();
}

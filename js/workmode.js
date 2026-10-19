/* ============================================
   BRISA - Workmode (deep work view)
   Current task + shared timer + scratch note.
   No new tables: scratch lives in task.description.
   ============================================ */
import { state } from "./state.js";
import { pickNextAction } from "./nextAction.js?v=20261019ab";
import { createEditor, editorHTML, htmlWithLightImages, isHTML } from "./richtext.js";
import { confirmDiscard } from "./modalGuard.js";

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
    const html = await htmlWithLightImages(editorHTML(quill));
    await fetch(`${API_BASE}/tasks/${currentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: html }),
    });
    const t = (state.tasks || []).find(x => String(x.id) === String(currentId));
    if (t) t.description = html;
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

let patioTimer = null;

function clearPatio() {
  if (patioTimer) {
    clearInterval(patioTimer);
    patioTimer = null;
  }
}

function openPatio(section) {
  if (section.querySelector("#patio")) return;
  if (window.brisaTimer) window.brisaTimer.stop();
  const deadline = Date.now() + 5 * 60 * 1000;
  const overlay = document.createElement("div");
  overlay.className = "patio-overlay";
  overlay.id = "patio";
  overlay.innerHTML = `
    <div class="patio-card aero-panel">
      <div class="patio-title">Patio de recuperación</div>
      <p class="patio-sub">Para poner los pies en la tierra. Sin apuro, sin culpa.</p>
      <ol class="patio-steps">
        <li>Apoya los pies en el suelo y nota el peso.</li>
        <li>Tres respiraciones lentas, soltando los hombros.</li>
        <li>Agua, estírate o mira por la ventana.</li>
      </ol>
      <div class="patio-clock" id="patio-clock">5:00</div>
      <p class="patio-sub" id="patio-msg">Vuelve cuando quieras, la tarea te espera.</p>
      <button class="modal-btn modal-btn-primary" id="patio-back">Volver a la tarea</button>
    </div>
  `;
  (section.querySelector(".workmode") || section).appendChild(overlay);
  const paint = () => {
    const left = Math.max(0, deadline - Date.now());
    const el = overlay.querySelector("#patio-clock");
    if (el) el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left % 60000 / 1000)).padStart(2, "0")}`;
    if (left <= 0) {
      clearInterval(patioTimer);
      patioTimer = null;
      const msg = overlay.querySelector("#patio-msg");
      if (msg) msg.textContent = "Tiempo cumplido. Vuelve cuando quieras, sin culpa.";
    }
  };
  paint();
  patioTimer = setInterval(paint, 500);
  overlay.querySelector("#patio-back")?.addEventListener("click", () => {
    clearPatio();
    overlay.remove();
  });
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html ?? "");
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

// The capture entry this task was born from. Processed entries
// never sit in state, so this fills in async after render.
async function fillOrigin(task) {
  const el = document.querySelector("#workmode-origin");
  if (!el) return;
  try {
    const res = await fetch(`${API_BASE}/entries?target_type=action&target_id=${task.id}`);
    if (!res.ok) return;
    const rows = await res.json();
    if (!rows.length) return;
    const raw = stripHtml(rows[0].raw_text);
    el.textContent = `Viene de: “${raw.slice(0, 90)}”`;
    el.title = raw;
  } catch {
    // ignore
  }
}

// Navbar presence: only when the running timer actually belongs to
// a task. A free timer never borrows a task's name.
function paintFocusChip() {
  const chip = document.querySelector("#focus-chip");
  if (!chip) return;
  const link = window.brisaTimer && window.brisaTimer.linkedTask ? window.brisaTimer.linkedTask() : null;
  const task = link ? (state.tasks || []).find(t => String(t.id) === String(link) && !t.is_completed) : null;
  const live = task && window.brisaTimer && window.brisaTimer.hasSession();
  const inWorkmode = !!document.querySelector("#workmode-section")?.offsetParent;
  if (!live || inWorkmode) {
    chip.style.display = "none";
    return;
  }
  chip.style.display = "";
  const title = chip.querySelector("#focus-chip-title");
  if (title) title.textContent = task.title;
  const time = chip.querySelector("#focus-chip-time");
  const t = window.brisaTimer && window.brisaTimer.timeLeft ? window.brisaTimer.timeLeft() : null;
  if (time) time.textContent = t ? ` · ${fmt(t.remainingSec)}` : "";
  chip.classList.toggle("running", !!(t && t.running));
  chip.title = `Volver al enfoque: ${task.title}`;
  chip.dataset.taskId = task.id;
}

function render(section) {
  clearPatio();
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
        <div class="workmode-origin" id="workmode-origin"></div>
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
          <div class="workmode-switch-row">
            <button class="modal-btn modal-btn-secondary" id="workmode-switch" title="Rotar a otra tarea sin culpa">⇄ Otra cosa</button>
            <button class="modal-btn modal-btn-secondary" id="workmode-patio" title="Pausa corta para poner los pies en la tierra">Patio</button>
          </div>
          <div class="workmode-switch-panel" id="workmode-switch-panel"></div>
          <button class="modal-btn modal-btn-secondary" id="workmode-done">Marcar hecha ✓</button>
          <button class="modal-btn modal-btn-secondary" id="workmode-postpone" title="Patear para mañana (sin fecha límite hoy)">Patear → mañana</button>
          <button class="modal-btn modal-btn-secondary" id="workmode-discard" title="Descartar este paso o la tarea">Descartar</button>
          <div class="workmode-switch-panel" id="workmode-discard-panel"></div>
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
    if (window.brisaTimer.isRunning()) {
      window.brisaTimer.stop();
    } else {
      if (window.brisaTimer.setTask) window.brisaTimer.setTask(currentId);
      window.brisaTimer.start();
    }
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

  // Rotation without guilt: 1-tap alternatives, bloc already autosaved.
  section.querySelector("#workmode-switch")?.addEventListener("click", () => {
    const panel = section.querySelector("#workmode-switch-panel");
    if (!panel) return;
    if (panel.dataset.open === "1") {
      panel.innerHTML = "";
      panel.dataset.open = "";
      return;
    }
    const { alternatives } = pickNextAction(
      (state.tasks || []).filter(t => String(t.id) !== String(task.id)), new Date());
    panel.dataset.open = "1";
    panel.innerHTML = `
      <p class="workmode-switch-note">Cambiar también es avanzar. El bloc de esta tarea ya quedó guardado.</p>
      ${(alternatives || []).length === 0
        ? `<p class="workmode-switch-note">No hay otra pendiente. Buen momento para el Patio.</p>`
        : alternatives.map(t => `
          <button class="workmode-alt" data-alt="${t.id}" title="Pasar a esta tarea">
            ${escapeHtml(t.title)}${t.estimated_minutes ? ` · ~${t.estimated_minutes} min` : ""}
          </button>`).join("")}
    `;
    panel.querySelectorAll("[data-alt]").forEach(btn => {
      btn.addEventListener("click", async () => {
        await flushSave();
        if (window.brisaTimer) window.brisaTimer.stop();
        currentId = btn.dataset.alt;
        render(section);
      });
    });
  });

  // Patio: short grounding transition. Pauses the work timer;
  // the user restarts it when back (clean re-entry, no guilt).
  section.querySelector("#workmode-patio")?.addEventListener("click", () => {
    openPatio(section);
  });

  async function refreshAfterChange() {
    if (window.initTasks) await window.initTasks();
    if (window.renderNext) window.renderNext();
    if (window.initToday) window.initToday();
  }

  async function deleteTask(id) {
    await fetch(`${API_BASE}/tasks/${id}`, { method: "DELETE" });
  }

  // Discard: a step asks step-vs-parent, a parent warns about its steps.
  section.querySelector("#workmode-discard")?.addEventListener("click", () => {
    const panel = section.querySelector("#workmode-discard-panel");
    if (!panel) return;
    if (panel.dataset.open === "1") {
      panel.innerHTML = "";
      panel.dataset.open = "";
      return;
    }
    panel.dataset.open = "1";
    const parent = task.parent_task_id != null
      ? (state.tasks || []).find(t => String(t.id) === String(task.parent_task_id))
      : null;
    const kids = (state.tasks || []).filter(t =>
      t.parent_task_id != null && String(t.parent_task_id) === String(task.id) && !t.is_completed);
    if (parent) {
      const siblings = (state.tasks || []).filter(t =>
        t.parent_task_id != null && String(t.parent_task_id) === String(parent.id)
        && !t.is_completed && String(t.id) !== String(task.id));
      panel.innerHTML = `
        <p class="workmode-switch-note">¿Descartas solo este paso o la acción completa?</p>
        <button class="workmode-alt" id="discard-step">Solo este paso${siblings.length > 0 ? " → ir al siguiente" : ""}</button>
        <button class="workmode-alt" id="discard-parent">Toda la acción “${escapeHtml(parent.title)}”</button>
        <button class="workmode-alt" id="discard-back">Volver</button>
      `;
      panel.querySelector("#discard-back")?.addEventListener("click", () => {
        panel.innerHTML = "";
        panel.dataset.open = "";
      });
      panel.querySelector("#discard-step")?.addEventListener("click", async () => {
        await deleteTask(task.id);
        await refreshAfterChange();
        currentId = siblings.length > 0 ? siblings[0].id : parent.id;
        render(section);
      });
      panel.querySelector("#discard-parent")?.addEventListener("click", async () => {
        const all = (state.tasks || []).filter(t =>
          t.parent_task_id != null && String(t.parent_task_id) === String(parent.id));
        for (const k of all) await deleteTask(k.id);
        await deleteTask(parent.id);
        await refreshAfterChange();
        currentId = null;
        render(section);
      });
    } else {
      panel.innerHTML = `
        <p class="workmode-switch-note">${kids.length > 0
          ? `Esta tarea tiene ${kids.length} paso(s). ¿Eliminar todo?`
          : "¿Eliminar esta tarea?"}</p>
        <button class="workmode-alt" id="discard-all">Eliminar${kids.length > 0 ? " todo" : ""}</button>
        <button class="workmode-alt" id="discard-back">Volver</button>
      `;
      panel.querySelector("#discard-back")?.addEventListener("click", () => {
        panel.innerHTML = "";
        panel.dataset.open = "";
      });
      panel.querySelector("#discard-all")?.addEventListener("click", async () => {
        for (const k of kids) await deleteTask(k.id);
        await deleteTask(task.id);
        await refreshAfterChange();
        currentId = null;
        render(section);
      });
    }
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

  section.querySelector("#workmode-postpone")?.addEventListener("click", async () => {
    await flushSave();
    const btn = section.querySelector("#workmode-postpone");
    if (btn) { btn.disabled = true; btn.textContent = "Pateando…"; }
    try {
      let at;
      if (task.scheduled_datetime) {
        const d = new Date(task.scheduled_datetime);
        d.setDate(d.getDate() + 1);
        at = d.toISOString();
      } else {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        at = d.toISOString();
      }
      await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_datetime: at }),
      });
      if (window.brisaTimer) window.brisaTimer.stop();
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.initToday) window.initToday();
      if (window.initWeek) window.initWeek();
      currentId = null;
      render(section);
    } catch (e) {
      console.error("No se pudo patear:", e);
      if (btn) { btn.disabled = false; btn.textContent = "Patear → mañana"; }
    }
  });
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
  fillOrigin(task);
  paintFocusChip();
}

export async function initWorkmode() {
  const section = document.querySelector("#workmode-section");
  if (!section) return;
  await flushSave();
  render(section);
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (document.querySelector("#workmode-section #workmode-clock")) paintTimer();
      paintFocusChip();
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

// Task notes modal: the same bloc Enfoque edits, reachable from
// anywhere (timeline popover). One store: task.description.
let notesQuill = null;
let notesTaskId = null;
let notesPristine = "";

export function initTaskNotes() {
  const overlay = document.querySelector("#task-note-modal");
  if (!overlay) return;
  notesQuill = createEditor(overlay.querySelector("#task-note-quill"), {
    placeholder: "Avances, opciones, lo que no quieres perder…",
  });

  const close = () => {
    if (notesQuill && editorHTML(notesQuill) !== notesPristine && !confirmDiscard()) return;
    overlay.classList.remove("active");
    notesTaskId = null;
  };

  overlay.querySelector("#task-note-close")?.addEventListener("click", close);
  overlay.querySelector("#task-note-cancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });
  overlay.querySelector("#task-note-save")?.addEventListener("click", async () => {
    if (!notesTaskId || !notesQuill) return;
    const html = await htmlWithLightImages(editorHTML(notesQuill));
    try {
      await fetch(`${API_BASE}/tasks/${notesTaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: html }),
      });
      const t = (state.tasks || []).find(x => String(x.id) === String(notesTaskId));
      if (t) t.description = html;
      notesPristine = html;
      overlay.classList.remove("active");
      notesTaskId = null;
      if (String(currentId) === String(t?.id) && document.querySelector("#workmode-section")?.offsetParent) {
        render(document.querySelector("#workmode-section"));
      }
    } catch (e) {
      console.error("Error guardando nota:", e);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });

  window.openTaskNotes = async (taskId) => {
    const task = (state.tasks || []).find(t => String(t.id) === String(taskId));
    if (!task || !notesQuill) return;
    notesTaskId = task.id;
    overlay.querySelector("#task-note-title").textContent = task.title || "Anotar avance";
    try {
      const html = task.description || "";
      if (html && isHTML(html)) notesQuill.setContents(notesQuill.clipboard.convert(html));
      else notesQuill.setText(html || "");
    } catch {
      notesQuill.setText("");
    }
    notesPristine = editorHTML(notesQuill);
    overlay.classList.add("active");
    notesQuill.focus();
  };
}

// Enters work mode on a specific task (e.g. from Empezar buttons):
// selects it, navigates to the view, renders fresh.
export async function startWorkmode(taskId) {
  await flushSave();
  if (window.initTasks) await window.initTasks();
  if (taskId != null) currentId = taskId;
  document.querySelector('.nav[data-nav="workmode"]')?.click();
  await initWorkmode();
}

if (typeof window !== "undefined") {
  window.paintFocusChip = paintFocusChip;
  document.querySelector("#focus-chip")?.addEventListener("click", () => {
    const id = document.querySelector("#focus-chip")?.dataset.taskId;
    if (id && window.startWorkmode) window.startWorkmode(id);
    else document.querySelector('.nav[data-nav="workmode"]')?.click();
  });
}

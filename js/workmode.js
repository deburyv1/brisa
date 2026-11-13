/* ============================================
   BRISA - Workmode (deep work view)
   Current task + shared timer + scratch note.
   No new tables: scratch lives in task.description.
   ============================================ */
import { state } from "./state.js";
import { pickNextAction } from "./nextAction.js?v=20261020sched";
import { createEditor, editorHTML, htmlWithLightImages, isHTML } from "./richtext.js?v=20261021rtl9";
import { pairsHTML } from "./dataPairs.js?v=20261021pairs1";
import { confirmDiscard } from "./modalGuard.js";
import { eventPhaseLabel, getActionPlan } from "./workmodePlan.js";

const API_BASE = "/api";

let currentId = null;
let quill = null;
let saveTimer = null;
let pollTimer = null;
let dirty = false;
let unloadBound = false;
let transitionMessage = "";

function pendingTasks() {
  return (state.tasks || []).filter(t => !t.is_completed);
}

// Los datos útiles viven en la acción: si estás trabajando un paso del
// checklist, se muestran los de su padre.
function pairsForTask(task) {
  if (task?.parent_task_id != null) {
    const parent = (state.tasks || []).find(t => String(t.id) === String(task.parent_task_id));
    if (parent) return parent.data_pairs;
  }
  return task?.data_pairs;
}

function resolveTask() {
  const pending = pendingTasks();
  if (pending.some(t => String(t.id) === String(currentId))) {
    return pending.find(t => String(t.id) === String(currentId));
  }
  const pick = pickNextAction(state.tasks || [], new Date());
  const task = pick?.activeTask || pick?.current || pending[0] || null;
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

function formatEventDate(event) {
  if (!event?.start) return "";
  const date = new Date(event.start);
  const day = date.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const h = date.getHours(), m = date.getMinutes();
  return (h === 0 && m === 0) || (h === 23 && m === 59)
    ? day
    : `${day} · ${date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}`;
}

function actionContext(task, plan) {
  const hasContext = !!plan.parent || plan.total > 0 || task.event_id != null || plan.action.event_id != null;
  if (!hasContext) return "";
  const eventId = task.event_id || plan.action.event_id;
  const event = eventId != null
    ? (state.events || []).find(item => String(item.id) === String(eventId)) : null;
  const currentId = plan.currentStep?.id;
  return `
    <section class="workmode-action-context" aria-label="Contexto de la acción">
      <div class="workmode-context-kicker">${plan.parent ? "ACCIÓN COMPLETA" : "CONTEXTO"}</div>
      ${plan.parent ? `<div class="workmode-context-title">${escapeHtml(plan.action.title)}</div>` : ""}
      ${(plan.parent || plan.total > 0) && plan.action.first_step ? `<p class="workmode-context-first"><strong>Primer movimiento:</strong> ${escapeHtml(plan.action.first_step)}</p>` : ""}
      ${event ? `<p class="workmode-context-event">Para ${escapeHtml(event.title)} · ${escapeHtml(formatEventDate(event))} · ${escapeHtml(eventPhaseLabel(task.event_phase || plan.action.event_phase))}</p>` : ""}
      ${plan.total ? `
        <details class="workmode-plan" open>
          <summary><span>Plan de esta acción</span><span>${plan.done} de ${plan.total} pasos listos</span></summary>
          <div class="workmode-plan-progress" role="progressbar" aria-label="Avance del plan" aria-valuemin="0" aria-valuemax="${plan.total}" aria-valuenow="${plan.done}">
            <span style="width:${Math.round((plan.done / plan.total) * 100)}%"></span>
          </div>
          <ol id="workmode-plan-list" data-plan-id="${plan.action.id}">${plan.steps.map((step, index) => {
            const done = !!step.is_completed;
            const isCurrent = !!plan.parent && String(step.id) === String(currentId) && !done;
            const isNext = !plan.parent && String(step.id) === String(plan.nextStep?.id) && !done;
            return `<li class="${done ? "done" : isCurrent ? "current" : isNext ? "next" : "pending"}" data-step-row="${step.id}" data-step-id="${step.id}" draggable="true" title="Arrastra para cambiar el orden">
              <span class="workmode-plan-marker" aria-hidden="true">${done ? "✓" : index + 1}</span>
              <span class="workmode-plan-name">${escapeHtml(step.title)}</span>
              <span class="workmode-plan-status${done ? " is-done" : ""}">${done ? "Listo" : isCurrent ? "Ahora" : isNext ? "Siguiente" : "Pendiente"}</span>
              <span class="workmode-plan-tools">
                <button type="button" data-step-done="${step.id}" data-done="${done}" aria-label="${done ? "Desmarcar" : "Marcar"} ${escapeHtml(step.title)} ${done ? "como pendiente" : "como listo"}" title="${done ? "Deshacer listo" : "Marcar listo"}">${done ? "↶" : "✓"}</button>
                <button type="button" data-step-edit="${step.id}" aria-label="Editar ${escapeHtml(step.title)}" title="Editar">✎</button>
                <button type="button" data-step-remove="${step.id}" aria-label="Quitar ${escapeHtml(step.title)} del plan" title="No corresponde">×</button>
              </span>
            </li>`;
          }).join("")}</ol>
          <form class="workmode-plan-add" id="workmode-add-step-form">
            <input name="step" maxlength="240" placeholder="Agregar el siguiente paso…" aria-label="Agregar paso al plan">
            <button type="submit">Agregar</button>
          </form>
          <p class="workmode-plan-feedback" id="workmode-plan-feedback" role="status"></p>
        </details>` : ""}
      ${plan.action.estimated_minutes ? `<p class="workmode-action-estimate">Estimación de la acción completa: ~${Number(plan.action.estimated_minutes)} min</p>` : ""}
    </section>`;
}

async function flushSave() {
  if (!dirty || !quill || !currentId) return true;
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
    return true;
  } catch (e) {
    console.warn("No se pudo guardar el bloc:", e);
    dirty = true;
    paintSaveState("error");
    return false;
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
  const progress = document.querySelector("#workmode-clock-progress");
  const toggle = document.querySelector("#workmode-toggle");
  if (!t) return;
  if (clock) {
    clock.textContent = fmt(t.remainingSec);
    clock.classList.toggle("running", t.running);
  }
  if (progress) progress.style.width = `${t.totalSec > 0 ? Math.max(0, Math.min(100, (t.remainingSec / t.totalSec) * 100)) : 0}%`;
  if (toggle) toggle.textContent = t.running ? "⏸ Pausar" : t.remainingSec < t.totalSec ? "▶ Retomar" : "▶ Empezar bloque";
  const status = document.querySelector("#workmode-session-status");
  if (status) status.textContent = t.running
    ? "En marcha · sigue con este paso."
    : t.remainingSec < t.totalSec ? "En pausa · puedes retomarlo cuando quieras." : "Listo para iniciar cuando tú quieras.";
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
  const actionId = task.parent_task_id || task.id;
  try {
    const res = await fetch(`${API_BASE}/entries?target_type=action&target_id=${actionId}`);
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
  if (!task) {
    section.innerHTML = `
      <div class="workmode-empty">
        <div class="workmode-empty-icon">✓</div>
        <div class="workmode-empty-text">Nada pendiente.<br>Buen momento para capturar algo nuevo.</div>
      </div>`;
    return;
  }

  const plan = getActionPlan(task, state.tasks || []);
  window.currentWorkActionId = plan.action?.id || task.id;
  if (window.brisaTimer?.hasSession?.() && window.brisaTimer?.setTask) {
    window.brisaTimer.setTask(window.currentWorkActionId);
  }
  const isActionOverview = !plan.parent && plan.total > 0;
  const isChecklistStep = task.parent_task_id != null;
  const immediateStep = isActionOverview ? "" : task.first_step?.trim() || (isChecklistStep ? task.title : "");
  const context = actionContext(task, plan);
  const event = (state.events || []).find(item => String(item.id) === String(task.event_id || plan.action.event_id));
  const stepCaption = isChecklistStep ? "PASO ACTUAL" : isActionOverview ? "ACCIÓN COMPLETA" : "ACCIÓN";
  const message = transitionMessage;
  transitionMessage = "";
  const timerControls = isActionOverview ? `
    ${plan.nextStep ? `
      <div class="workmode-next-step">
        <div class="workmode-context-kicker">SIGUIENTE PASO</div>
        <strong>${escapeHtml(plan.nextStep.title)}</strong>
        <button type="button" class="modal-btn modal-btn-primary" id="workmode-open-next">Ver este paso</button>
      </div>` : `<p class="workmode-plan-finished">Todos los pasos registrados están listos. Revisa la acción completa y ciérrala cuando corresponda.</p>`}
    ${plan.pending === 0 ? `<button class="modal-btn modal-btn-primary" id="workmode-done">Cerrar acción ✓</button>` : ""}
  ` : immediateStep ? `
    <div class="workmode-timer-scope">
      <strong>Temporizador de la sesión</strong>
      <div class="workmode-clock-readout"><span>Tiempo restante del bloque</span><b id="workmode-clock" class="workmode-clock" aria-live="off">10:00</b></div>
      <div class="workmode-clock-track" aria-hidden="true"><span id="workmode-clock-progress"></span></div>
      <span id="workmode-session-status" class="workmode-session-status" role="status"></span>
      ${plan.action.estimated_minutes ? `<span>Estimación de la acción: ~${Number(plan.action.estimated_minutes)} min</span>` : ""}
    </div>
    <div class="workmode-actions">
      <button class="modal-btn modal-btn-primary" id="workmode-toggle">▶ Empezar bloque</button>
      <button class="modal-btn modal-btn-secondary" id="workmode-stuck">¿Qué me frena?</button>
    </div>
    <div class="workmode-switch-row">
      <button class="modal-btn modal-btn-secondary" id="workmode-switch" title="Cambiar a otra tarea sin culpa">⇄ Otra cosa</button>
      <button class="modal-btn modal-btn-secondary" id="workmode-patio" title="Pausa corta para recuperarte">Patio</button>
    </div>
    <div class="workmode-switch-panel" id="workmode-switch-panel"></div>
    <button class="modal-btn modal-btn-primary" id="workmode-done">${isChecklistStep ? "Terminar este paso ✓" : "Marcar acción hecha ✓"}</button>
    ${isChecklistStep ? `<p class="workmode-done-hint">Al terminar, te mostraré el siguiente paso del plan.</p>` : ""}
    <button class="modal-btn modal-btn-secondary" id="workmode-postpone" title="Mover para mañana">Pasar a mañana</button>
    <button class="modal-btn modal-btn-secondary" id="workmode-discard" title="Descartar este paso o la acción">Descartar</button>
    <div class="workmode-switch-panel" id="workmode-discard-panel"></div>
  ` : `
    <div class="workmode-no-step">
      <p>Aún no hay un primer movimiento concreto. Lo definimos juntos antes de iniciar el temporizador.</p>
      <button type="button" class="modal-btn modal-btn-primary" id="workmode-define-step">Ayúdame a encontrar por dónde partir</button>
    </div>`;

  section.innerHTML = `
    ${message ? `<p class="workmode-transition" role="status">${escapeHtml(message)}</p>` : ""}
    <div class="workmode-header">
      <div><div class="workmode-title">Estación de trabajo</div><div class="workmode-heading-hint">La acción, el paso actual y tus notas en un solo lugar.</div></div>
      <div class="workmode-tools">
        <button class="workmode-zen-btn" id="workmode-zen" title="Ocultar barra lateral">⛶ Zen</button>
      </div>
    </div>
    <div class="workmode-grid">
      <div class="workmode-task aero-panel">
        ${context}
        <div class="workmode-task-kicker">${stepCaption}</div>
        <div class="workmode-task-title">${escapeHtml(task.title)}</div>
        <div class="workmode-origin" id="workmode-origin"></div>
        ${pairsHTML(pairsForTask(task))}
        ${immediateStep ? `<div class="workmode-step"><span>AHORA MISMO, SOLO ESTO</span><strong>${escapeHtml(immediateStep)}</strong></div>` : ""}
        <div class="workmode-timer">
          ${timerControls}
        </div>
      </div>
      <div class="workmode-notes aero-panel">
        <div class="workmode-notes-head">
          <span>${isChecklistStep ? "Notas de este paso" : "Notas de esta acción"}</span>
          <div class="workmode-notes-tools">
            <button class="workmode-timestamp-btn" id="workmode-timestamp" title="Insertar timestamp de avance">+ Avance</button>
            <span id="workmode-save-state" class="workmode-save"></span>
          </div>
        </div>
        <div id="workmode-quill"></div>
        <div class="workmode-notes-hint">Se guarda automáticamente con ${isChecklistStep ? "este paso" : "esta acción"}. · Ctrl+Enter para terminar</div>
      </div>
    </div>
  `;

  const planFeedback = (message) => {
    const el = section.querySelector("#workmode-plan-feedback");
    if (el) el.textContent = message;
  };
  const refreshPlan = async (message = "") => {
    if (window.initTasks) await window.initTasks();
    if (window.renderNext) await window.renderNext();
    if (window.initToday) await window.initToday();
    if (message) transitionMessage = message;
    render(section);
  };
  section.querySelectorAll("[data-step-done]").forEach(button => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/tasks/${button.dataset.stepDone}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(button.dataset.done === "true"
            ? { is_completed: false, completed_at: null }
            : { is_completed: true, completed_at: new Date().toISOString() }),
        });
        if (!res.ok) throw new Error("No se pudo guardar el paso.");
        await refreshPlan(button.dataset.done === "true"
          ? "Paso devuelto a pendientes. El plan ya refleja lo que falta."
          : "Paso marcado como listo. El plan ya refleja lo que falta.");
      } catch (error) {
        planFeedback(error.message || "No se pudo guardar el paso.");
        button.disabled = false;
      }
    });
  });
  const planList = section.querySelector("#workmode-plan-list");
  if (planList) {
    let draggedRow = null;
    const dragAutoScroll = event => {
      if (!draggedRow) return;
      const bounds = planList.getBoundingClientRect();
      const edge = 42;
      const maxScroll = planList.scrollHeight - planList.clientHeight;
      if (event.clientY < bounds.top + edge && planList.scrollTop > 0) {
        const speed = Math.min(18, Math.max(4, Math.ceil((bounds.top + edge - event.clientY) / 3)));
        planList.scrollTop -= speed;
      } else if (event.clientY > bounds.bottom - edge && planList.scrollTop < maxScroll) {
        const speed = Math.min(18, Math.max(4, Math.ceil((event.clientY - (bounds.bottom - edge)) / 3)));
        planList.scrollTop += speed;
      }

      const viewportEdge = 54;
      if (event.clientY < viewportEdge) window.scrollBy(0, -12);
      else if (event.clientY > window.innerHeight - viewportEdge) window.scrollBy(0, 12);
    };
    planList.querySelectorAll("[data-step-id]").forEach(row => {
      row.addEventListener("dragstart", event => {
        draggedRow = row;
        row.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", row.dataset.stepId);
        document.addEventListener("dragover", dragAutoScroll, true);
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        draggedRow = null;
        document.removeEventListener("dragover", dragAutoScroll, true);
        planList.querySelectorAll(".drop-before, .drop-after").forEach(item => item.classList.remove("drop-before", "drop-after"));
      });
      row.addEventListener("dragover", event => {
        if (!draggedRow || draggedRow === row) return;
        event.preventDefault();
        const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2;
        row.classList.toggle("drop-after", after);
        row.classList.toggle("drop-before", !after);
        planList.insertBefore(draggedRow, after ? row.nextSibling : row);
      });
      row.addEventListener("drop", event => event.preventDefault());
    });
    planList.addEventListener("wheel", event => {
      if (!draggedRow) return;
      event.preventDefault();
      planList.scrollTop += event.deltaY;
    }, { passive: false });
    planList.addEventListener("dragend", async () => {
      const ids = [...planList.querySelectorAll("[data-step-id]")].map(row => Number(row.dataset.stepId));
      if (ids.length < 2) return;
      const response = await fetch(`${API_BASE}/tasks/reorder`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parent_task_id: Number(planList.dataset.planId), task_ids: ids }),
      });
      if (!response.ok) {
        transitionMessage = "No se pudo guardar el orden. El plan se restauró.";
        await refreshPlan();
        return;
      }
      if (plan.parent) {
        const nextStepId = ids.find(id => {
          const item = (state.tasks || []).find(candidate => String(candidate.id) === String(id));
          return item && !item.is_completed;
        });
        currentId = nextStepId ?? plan.action.id;
      }
      await refreshPlan("Orden del plan guardado.");
    });
  }
  section.querySelectorAll("[data-step-edit]").forEach(button => {
    button.addEventListener("click", () => {
      const step = (state.tasks || []).find(item => String(item.id) === String(button.dataset.stepEdit));
      const row = section.querySelector(`[data-step-row="${button.dataset.stepEdit}"]`);
      const name = row?.querySelector(".workmode-plan-name");
      if (!step || !row || !name) return;
      name.innerHTML = `<form class="workmode-step-edit"><input maxlength="240" value="${escapeHtml(step.title)}" aria-label="Editar nombre del paso"><button type="submit">Guardar</button><button type="button" data-cancel-edit>Cancelar</button></form>`;
      const form = name.querySelector("form");
      const input = form.querySelector("input");
      input.focus(); input.select();
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const title = input.value.trim();
        if (!title) { input.focus(); return; }
        const res = await fetch(`${API_BASE}/tasks/${step.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }),
        });
        if (!res.ok) { planFeedback("No se pudo guardar el nombre del paso."); return; }
        await refreshPlan("Paso actualizado.");
      });
      form.querySelector("[data-cancel-edit]").addEventListener("click", () => { name.textContent = step.title; });
    });
  });
  section.querySelectorAll("[data-step-remove]").forEach(button => {
    button.addEventListener("click", () => {
      const id = button.dataset.stepRemove;
      const row = section.querySelector(`[data-step-row="${id}"]`);
      const name = row?.querySelector(".workmode-plan-name")?.textContent || "este paso";
      const confirm = document.createElement("span");
      confirm.className = "workmode-remove-confirm";
      confirm.innerHTML = `¿${escapeHtml(name)} no corresponde? <button type="button">Quitar</button> <button type="button" data-cancel>Cancelar</button>`;
      button.replaceWith(confirm);
      confirm.querySelector("[data-cancel]").addEventListener("click", () => render(section));
      confirm.querySelector("button:not([data-cancel])").addEventListener("click", async () => {
        const res = await fetch(`${API_BASE}/tasks/${id}`, { method: "DELETE" });
        if (!res.ok) { planFeedback("No se pudo quitar este paso."); return; }
        if (String(currentId) === String(id)) currentId = plan.parent?.id || task.id;
        await refreshPlan("Paso quitado del plan. La acción se conserva.");
      });
    });
  });
  section.querySelector("#workmode-add-step-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const input = event.currentTarget.elements.step;
    const title = input.value.trim();
    if (!title) { input.focus(); return; }
    const res = await fetch(`${API_BASE}/tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, parent_task_id: plan.action.id, event_id: plan.action.event_id || null }),
    });
    if (!res.ok) { planFeedback("No se pudo agregar el paso. Intenta de nuevo."); return; }
    await refreshPlan("Paso agregado al plan.");
  });

  section.querySelector("#workmode-zen")?.addEventListener("click", () => {
    document.body.classList.toggle("zen");
  });

  section.querySelector("#workmode-timestamp")?.addEventListener("click", async () => {
    if (!quill) return;
    const now = new Date();
    const timestamp = now.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
    const entry = `<p><strong>Avance · ${escapeHtml(timestamp)}</strong><br></p>`;
    const html = await htmlWithLightImages(editorHTML(quill));
    const newHtml = /<\/?(?:p|div|ul|ol|h[1-6])\b/i.test(html)
      ? `${html}${entry}`
      : `<p>${escapeHtml(html).replace(/\n/g, "<br>")}</p>${entry}`;
    try {
      quill.setContents(quill.clipboard.convert(newHtml));
      dirty = true;
      await flushSave();
    } catch (e) {
      console.warn("No se pudo insertar timestamp:", e);
    }
  });

  section.querySelector("#workmode-define-step")?.addEventListener("click", () => {
    if (window.openFocus) window.openFocus(task.id);
  });

  section.querySelector("#workmode-open-next")?.addEventListener("click", async () => {
    if (!plan.nextStep) return;
    await flushSave();
    if (window.brisaTimer?.setTask) window.brisaTimer.setTask(plan.action.id);
    currentId = plan.nextStep.id;
    transitionMessage = `El siguiente paso es “${plan.nextStep.title}”. El temporizador sigue siendo el mismo bloque de sesión.`;
    render(section);
  });

  section.querySelector("#workmode-toggle")?.addEventListener("click", async () => {
    if (!window.brisaTimer) return;
    if (window.brisaTimer.isRunning()) {
      window.brisaTimer.stop();
    } else {
      if (!plan.action.started_at) {
        const startedAt = new Date().toISOString();
        try {
          const res = await fetch(`${API_BASE}/tasks/${plan.action.id}`, {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ started_at: startedAt }),
          });
          if (res.ok) {
            plan.action.started_at = startedAt;
            const local = (state.tasks || []).find(t => String(t.id) === String(plan.action.id));
            if (local) local.started_at = startedAt;
            if (window.renderNext) await window.renderNext();
          }
        } catch (e) {
          console.warn("No se pudo guardar el inicio de la acción:", e);
        }
      }
      if (window.brisaTimer.setTask) window.brisaTimer.setTask(plan.action.id);
      window.brisaTimer.start();
    }
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
        currentId = btn.dataset.alt;
        const nextAction = getActionPlan((state.tasks || []).find(item => String(item.id) === String(currentId)), state.tasks || []).action;
        if (nextAction && window.brisaTimer?.setTask) window.brisaTimer.setTask(nextAction.id);
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

  section.querySelector("#workmode-done")?.addEventListener("click", async (event) => {
    await flushSave();
    try {
      const res = await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: true, completed_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error("No se pudo guardar el avance.");
    } catch (e) {
      console.error("Error completando tarea:", e);
      transitionMessage = e.message || "No se pudo guardar el avance. Intenta de nuevo.";
      render(section);
      return;
    }
    if (window.initTasks) await window.initTasks();
    if (window.renderNext) window.renderNext();
    if (window.initToday) window.initToday();
    if (plan.parent) {
      const refreshedParent = (state.tasks || []).find(item => String(item.id) === String(plan.parent.id)) || plan.parent;
      const after = getActionPlan(refreshedParent, state.tasks || []);
      currentId = refreshedParent.id;
      transitionMessage = after.nextStep
        ? `Paso listo. El siguiente es “${after.nextStep.title}”. El plan sigue aquí para que no tengas que recordarlo.`
        : "Todos los pasos registrados están listos. Revisa si la acción completa quedó resuelta.";
    } else {
      currentId = null;
      transitionMessage = "Acción marcada como hecha. Ya no tienes que mantenerla en mente.";
    }
    render(section);
  });

  section.querySelector("#workmode-postpone")?.addEventListener("click", async () => {
    await flushSave();
    const btn = section.querySelector("#workmode-postpone");
    if (btn) { btn.disabled = true; btn.textContent = "Pateando…"; }
    try {
      // Mañana real = hoy + 1: conserva la hora programada; si no hay hora,
      // mueve la fecha límite; si tampoco hay, usa 9:00.
      const d = new Date();
      d.setDate(d.getDate() + 1);
      const orig = task.scheduled_datetime ? new Date(task.scheduled_datetime) : null;
      const due = task.due_datetime ? new Date(task.due_datetime) : null;
      let payload;
      if (orig && !Number.isNaN(orig.getTime())) {
        d.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
        payload = { scheduled_datetime: d.toISOString() };
      } else if (due && !Number.isNaN(due.getTime())) {
        const nextDue = new Date();
        nextDue.setDate(nextDue.getDate() + 1);
        nextDue.setHours(due.getHours(), due.getMinutes(), 0, 0);
        payload = { due_datetime: nextDue.toISOString() };
      } else {
        d.setHours(9, 0, 0, 0);
        payload = { scheduled_datetime: d.toISOString() };
      }
      await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (window.brisaTimer?.setTask) window.brisaTimer.setTask(null);
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
  window.flushWorkmodeNotes = flushSave;
  await flushSave();
  render(section);
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (document.querySelector("#workmode-section #workmode-session-status")) paintTimer();
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
  if (window.renderNext) await window.renderNext();
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

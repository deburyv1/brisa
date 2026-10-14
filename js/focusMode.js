/* ============================================
   BRISA - Focus Mode
   Friction-first: before acting, detect what blocks.
   Distinguishes real dependency from need for certainty:
   verify bounded (10 min) -> enough confidence -> act.
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";
const LINKS_KEY = "brisa.focusLinks";

let currentTask = null;

function getLinks() {
  try {
    return JSON.parse(sessionStorage.getItem(LINKS_KEY) || "{}");
  } catch {
    return {};
  }
}

function setLink(childId, parentId, kind) {
  const links = getLinks();
  links[childId] = { parentId, kind };
  try {
    sessionStorage.setItem(LINKS_KEY, JSON.stringify(links));
  } catch {
    // sessionStorage unavailable: parent link is lost, flow still works
  }
}

export function linkChildToParent(childId, parentId, kind) {
  setLink(childId, parentId, kind);
}

function takeLink(childId) {
  const links = getLinks();
  const link = links[childId];
  if (link) {
    delete links[childId];
    try {
      sessionStorage.setItem(LINKS_KEY, JSON.stringify(links));
    } catch {
      // ignore
    }
  }
  return link || null;
}

function findTask(id) {
  return (state.tasks || []).find(t => t.id == id) || null;
}

async function resolveTask(id) {
  const local = findTask(id);
  if (local) return local;
  try {
    const res = await fetch(`${API_BASE}/tasks/${id}`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Error cargando tarea:", e);
  }
  return null;
}

export async function openFocus(taskId, opts = {}) {
  const task = await resolveTask(taskId);
  if (!task) return;
  currentTask = task;

  const overlay = document.querySelector("#focus-modal");
  if (!overlay) return;
  // Child steps show the parent action as title; the step itself
  // lives in the hero box, so nothing reads twice.
  let title = task.title;
  if (task.parent_task_id != null) {
    const parent = findTask(task.parent_task_id) || await resolveTask(task.parent_task_id).catch(() => null);
    if (parent) title = parent.title;
  }
  overlay.querySelector("#focus-title").textContent = title;
  overlay.classList.add("active");

  if (opts.skipFriction) {
    renderStep(task, {});
  } else if (opts.friction) {
    // Explicitly stuck: always show the friction menu, even mid-session
    renderFriction(task);
  } else if (window.brisaTimer && window.brisaTimer.hasSession()) {
    // Paused or running session: continue where left, don't restart friction
    renderStep(task, {});
  } else {
    await routeByClarity(task);
  }
}

// Single entry routing: the task's shape decides the mode,
// the user never picks a methodology.
async function routeByClarity(task) {
  const children = await fetchChildren(task.id);
  const open = children.filter(c => !c.is_completed);
  if (open.length > 0) {
    renderChecklist(task, children);
  } else if ((task.parent_task_id != null) || (task.first_step && task.first_step.trim())) {
    renderStep(task, {});
  } else {
    renderUnblockAsk(task);
  }
}

async function fetchChildren(taskId) {
  try {
    const res = await fetch(`${API_BASE}/tasks?parent_task_id=${taskId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Error cargando pasos:", e);
  }
  return [];
}

// Mode bar: visible, switchable, no auto-magic hidden from the user.
const FOCUS_MODES = [
  { id: "checklist", label: "Checklist" },
  { id: "step", label: "Paso" },
  { id: "guide", label: "Guía" },
];

function modeBar(current) {
  return `
    <div class="focus-modes" title="Cambia cómo trabajas esta acción">
      ${FOCUS_MODES.map(m => `<button type="button" class="focus-mode-seg ${m.id === current ? "on" : ""}" data-mode="${m.id}">${m.label}</button>`).join("")}
    </div>`;
}

async function switchMode(task, mode) {
  if (mode === "checklist") {
    const [children, fresh] = await Promise.all([fetchChildren(task.id), resolveTask(task.id)]);
    currentTask = fresh || task;
    document.querySelector("#focus-title").textContent = currentTask.title;
    renderChecklist(currentTask, children);
  } else if (mode === "step") {
    renderStep(task, {});
  } else if (mode === "guide") {
    renderUnblockAsk(task);
  }
}

function wireModeBar(task) {
  body().querySelectorAll(".focus-mode-seg").forEach(btn => {
    btn.addEventListener("click", () => switchMode(task, btn.dataset.mode));
  });
}

async function refreshChecklist(task) {
  const [fresh, stillThere] = await Promise.all([fetchChildren(task.id), resolveTask(task.id)]);
  currentTask = stillThere || task;
  document.querySelector("#focus-title").textContent = currentTask.title;
  renderChecklist(currentTask, fresh);
}

function body() {
  return document.querySelector("#focus-body");
}

// ---- Views ----

function renderFriction(task) {
  body().innerHTML = `
    <p class="focus-question">Antes de hacerlo, ¿qué te frena?</p>
    <p class="focus-hint">Si ya sabes qué hacer, aprieta <strong>Empezar</strong> y parte. Si algo te traba, elige qué es y te ayudo a destrabarlo.</p>
    <div class="focus-options">
      <button class="focus-option primary" data-friction="ready">▶️ Empezar<small>Ya sé qué hacer · parte el timer</small></button>
      <button class="focus-option" data-friction="unknown">🟢 No sé cuál es el siguiente paso<small>Lo definimos juntos en una frase</small></button>
      <button class="focus-option" data-friction="verify">🔎 Necesito verificar algo primero<small>Revisamos el dato en 10 min máximo</small></button>
      <button class="focus-option" data-friction="big">🧩 Es más grande de lo que parece<small>La partimos en algo chico</small></button>
      <button class="focus-option" data-friction="resist">😕 Me da resistencia<small>Partimos con 5 min nomás, parar vale</small></button>
      <button class="focus-option" data-friction="unblock">✨ Ayúdame a partir<small>Describo mi traba y la separamos juntos</small></button>
    </div>
  `;
  body().querySelectorAll(".focus-option").forEach(btn => {
    btn.addEventListener("click", () => handleFriction(task, btn.dataset.friction));
  });
}

function handleFriction(task, kind) {
  if (kind === "ready") {
    renderStep(task, {});
  } else if (kind === "unknown") {
    renderDefineStep(task);
  } else if (kind === "verify") {
    renderVerifyAsk(task);
  } else if (kind === "big") {
    renderSplit(task);
  } else if (kind === "resist") {
    renderStep(task, { presetMin: 5, note: "Empieza 5 minutos nomás. Parar también vale." });
  } else if (kind === "unblock") {
    renderUnblockAsk(task);
  }
}

function renderStep(task, { presetMin = 10, note = null } = {}) {
  const hasStep = !!(task.first_step && task.first_step.trim());
  const isChildStep = task.parent_task_id != null;
  const parent = isChildStep ? findTask(task.parent_task_id) : null;
  const actionable = hasStep || isChildStep;
  const stepInner = hasStep
    ? `<div class="focus-step">${escapeHtml(task.first_step)}</div>`
    : isChildStep
      ? `<div class="focus-step">${escapeHtml(task.title)}</div>`
      : `<div class="focus-step missing">Aún no defines el primer paso.</div>
         <button type="button" class="modal-btn modal-btn-secondary" id="focus-define-now" style="margin-top:8px">Definirlo (20 segundos)</button>`;
  body().innerHTML = `
    ${modeBar("step")}
    ${parent ? `<button type="button" class="focus-parent-link" id="focus-parent" title="Ver la acción completa">Parte de: <strong>${escapeHtml(parent.title)}</strong></button>` : ""}
    ${note ? `<p class="focus-note">${escapeHtml(note)}</p>` : ""}
    ${actionable ? `
    <button type="button" class="focus-step-box as-complete" id="focus-step-done" title="Marcar como hecho">
      <span class="focus-step-check" aria-hidden="true"></span>
      <span class="focus-step-text">
        <span class="focus-step-label">Ahora mismo, solo esto:</span>
        ${stepInner}
      </span>
    </button>` : `
    <div class="focus-step-box">
      <div class="focus-step-label">Ahora mismo, solo esto:</div>
      ${stepInner}
    </div>`}
    <div class="focus-timer-row">
      <div class="focus-time-btns" title="Duración de la sesión">
        <button class="focus-time-btn" data-min="5">5</button>
        <button class="focus-time-btn" data-min="10">10</button>
        <button class="focus-time-btn" data-min="15">15</button>
        <input type="number" class="focus-custom-min" id="focus-custom-min" min="1" max="120" placeholder="min" title="Minutos a tu medida">
      </div>
      <button class="modal-btn modal-btn-primary focus-primary-block" id="focus-start" title="Cierra esto y parte el timer flotante">Empezar</button>
    </div>
    <p id="focus-message" class="focus-message"></p>
    <div class="modal-actions focus-quiet-row">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-stuck" title="Volver a qué me frena">Atascado</button>
    </div>
  `;
  let minutes = presetMin;
  const startBtn = body().querySelector("#focus-start");
  const paintStart = () => {
    if (startBtn) startBtn.textContent = `Empezar (${minutes}:00)`;
  };
  body().querySelectorAll(".focus-time-btn").forEach(b => {
    b.classList.toggle("selected", Number(b.dataset.min) === minutes);
    b.addEventListener("click", () => {
      minutes = Number(b.dataset.min);
      body().querySelectorAll(".focus-time-btn").forEach(x =>
        x.classList.toggle("selected", x === b));
      const custom = body().querySelector("#focus-custom-min");
      if (custom) custom.value = "";
      paintStart();
    });
  });
  body().querySelector("#focus-custom-min")?.addEventListener("change", (e) => {
    const v = Math.max(1, Math.min(120, Number(e.target.value) || 0));
    if (!v) return;
    minutes = v;
    body().querySelectorAll(".focus-time-btn").forEach(x => x.classList.remove("selected"));
    paintStart();
  });
  paintStart();
  if (![5, 10, 15].includes(minutes)) {
    const custom = body().querySelector("#focus-custom-min");
    if (custom) custom.value = String(minutes);
  }
  startBtn?.addEventListener("click", () => handoffToTimer(minutes));
  body().querySelector("#focus-define-now")?.addEventListener("click", () => renderDefineStep(task));
  body().querySelector("#focus-step-done")?.addEventListener("click", completeTask);
  body().querySelector("#focus-parent")?.addEventListener("click", async () => {
    const p = await resolveTask(task.parent_task_id);
    if (!p) return;
    currentTask = p;
    document.querySelector("#focus-title").textContent = p.title;
    await routeByClarity(p);
  });
  body().querySelector("#focus-later")?.addEventListener("click", closeFocus);
  body().querySelector("#focus-stuck")?.addEventListener("click", () => {
    if (currentTask) renderFriction(currentTask);
  });
  body().querySelector("#focus-done")?.addEventListener("click", completeTask);
  wireModeBar(task);
}

// Checklist mode: the path is clear, just walk it.
// Progress is evidence (X of Y), never score.
function renderChecklist(task, children, note = null) {
  const done = children.filter(c => c.is_completed).length;
  const total = children.length;
  const open = children.filter(c => !c.is_completed);
  const next = open[0] || null;
  body().innerHTML = `
    <p class="focus-permission">El camino está claro. Avanza paso a paso.</p>
    ${modeBar("checklist")}
    ${note ? `<p class="focus-note">${escapeHtml(note)}</p>` : ""}
    ${task.first_step && task.first_step.trim() ? `<p class="focus-note">Arranca por: <strong>${escapeHtml(task.first_step)}</strong></p>` : ""}
    ${total > 0 ? `
    <div class="focus-progress">
      <div class="focus-progress-top"><span>Avance de esta acción</span><span>${done} de ${total}</span></div>
      <div class="focus-progress-bar"><span style="width:${Math.round((done / total) * 100)}%"></span></div>
    </div>` : ""}
    <div class="focus-checklist">
      ${total === 0 ? `<p class="focus-note">Sin pasos todavía: escríbelos abajo, uno a la vez.</p>` : ""}
      ${children.map(c => `
        <button type="button" class="focus-check-item ${c.is_completed ? "done" : ""}" data-child="${c.id}">
          <span class="focus-check-box">${c.is_completed ? "✓" : ""}</span>
          <span class="focus-check-title">${escapeHtml(c.title)}</span>
          ${c.estimated_minutes ? `<span class="focus-check-min">~${c.estimated_minutes} min</span>` : ""}
        </button>`).join("")}
      <div class="focus-add-row">
        <input type="text" id="focus-add-step" class="prep-input" placeholder="Agregar paso + Enter" autocomplete="off">
      </div>
    </div>
    <div class="modal-actions">
      ${next
        ? `<button type="button" class="modal-btn modal-btn-primary focus-primary-block" id="focus-next-step" title="Abrir el siguiente paso pendiente">Empezar siguiente</button>`
        : `<button type="button" class="modal-btn modal-btn-primary focus-primary-block" id="focus-done" title="Todos los pasos listos: marcar la tarea como hecha">Marcar hecha ✓</button>`}
    </div>
    <div class="modal-actions focus-quiet-row">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-later" title="Cerrar sin marcar nada">Lo dejo acá</button>
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-stuck" title="Volver a qué me frena">Atascado</button>
      ${next ? `<button type="button" class="modal-btn modal-btn-secondary" id="focus-done" title="Marcar la tarea como hecha">Marcar hecha ✓</button>` : ""}
    </div>
  `;
  body().querySelectorAll(".focus-check-item").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.child;
      const child = children.find(c => String(c.id) === String(id));
      if (!child) return;
      const completing = !child.is_completed;
      try {
        await fetch(`${API_BASE}/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            is_completed: completing,
            completed_at: completing ? new Date().toISOString() : null,
          }),
        });
      } catch (e) {
        console.error("Error actualizando paso:", e);
      }
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.initToday) window.initToday();
      if (window.initReadiness) window.initReadiness();
      await refreshChecklist(task);
    });
  });
  const addInput = body().querySelector("#focus-add-step");
  const addStep = async () => {
    const title = addInput?.value.trim();
    if (!title) return;
    try {
      await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, parent_task_id: task.id }),
      });
    } catch (e) {
      console.error("Error agregando paso:", e);
    }
    if (window.initTasks) await window.initTasks();
    if (window.renderNext) window.renderNext();
    await refreshChecklist(task);
    body().querySelector("#focus-add-step")?.focus();
  };
  addInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addStep();
    }
  });
  const nextBtn = body().querySelector("#focus-next-step");
  if (nextBtn && next) {
    nextBtn.addEventListener("click", () => openFocus(next.id));
  }
  body().querySelector("#focus-later")?.addEventListener("click", closeFocus);
  body().querySelector("#focus-stuck")?.addEventListener("click", () => {
    if (currentTask) renderFriction(currentTask);
  });
  body().querySelector("#focus-done")?.addEventListener("click", completeTask);
  wireModeBar(task);
}

function renderDefineStep(task) {
  const current = task.first_step && task.first_step.trim() ? task.first_step.trim() : "";
  body().innerHTML = `
    <p class="focus-question">¿Cuál sería el primer paso físico, bien chico?</p>
    ${current ? `<p class="focus-note">Actual: "<strong>${escapeHtml(current)}</strong>". Editarlo lo reemplaza.</p>` : ""}
    <div class="form-group">
      <input type="text" id="focus-define-input" placeholder="Ej: saca una prenda y ponla en la cama" value="${escapeHtml(current)}">
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-back">Volver</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-define-save">Guardar y empezar</button>
    </div>
  `;
  const input = body().querySelector("#focus-define-input");
  input?.focus();
  body().querySelector("#focus-back")?.addEventListener("click", () => renderFriction(task));
  body().querySelector("#focus-define-save")?.addEventListener("click", async () => {
    const step = input?.value.trim();
    if (!step) return;
    if (step.length < 4) {      input?.focus();
      input?.select();
      let nudge = body().querySelector("#focus-define-nudge");
      if (!nudge) {
        nudge = document.createElement("p");
        nudge.id = "focus-define-nudge";
        nudge.className = "focus-note";
        input?.after(nudge);
      }
      nudge.textContent = "Muy cortito: descríbelo en una frase (ej: abre la boleta y mira el monto).";
      return;
    }
    try {
      await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_step: step }),
      });
      task.first_step = step;
      if (window.initTasks) await window.initTasks();
    } catch (e) {
      console.error("Error guardando paso:", e);
    }
    renderStep(task, {});
  });
}

function renderUnblockAsk(task) {
  body().innerHTML = `
    <p class="focus-question">Cuéntame qué te traba, como me lo contarías a mí.</p>
    ${modeBar("guide")}
    <div class="form-group">
      <textarea id="focus-block-input" rows="3" placeholder="Ej: no terminé de juntar las fotos y no sé si las que tengo sirven"></textarea>
    </div>
    <p class="focus-staging">Separo lo que se puede verificar de lo que pide un primer intento. Sin juicios.</p>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-back">Volver</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-unblock-go">Analizar mi traba</button>
    </div>
    <div id="focus-unblock-result"></div>
  `;
  const input = body().querySelector("#focus-block-input");
  input?.focus();
  wireModeBar(task);
  body().querySelector("#focus-back")?.addEventListener("click", () => renderFriction(task));
  body().querySelector("#focus-unblock-go")?.addEventListener("click", async () => {
    const block = input?.value.trim();
    if (!block) return;
    const box = body().querySelector("#focus-unblock-result");
    const btn = body().querySelector("#focus-unblock-go");
    btn.disabled = true;
    btn.textContent = "Pensando...";
    box.innerHTML = "";
    try {
      const res = await fetch("/api/ai/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: task.title, block }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      renderUnblockResult(task, data);
    } catch (e) {
      box.innerHTML = `<p class="focus-note">No se pudo analizar. Intenta de nuevo.</p>`;
      btn.disabled = false;
      btn.textContent = "Analizar mi traba";
    }
  });
}

function renderUnblockResult(task, data) {
  const box = body().querySelector("#focus-unblock-result");
  if (!box) return;
  const group = (label, items, prefix) => items.length === 0 ? "" : `
    <div class="focus-unblock-group">
      <div class="focus-unblock-label">${label}</div>
      ${items.map((s, i) => `
        <label class="prep-row">
          <input type="checkbox" data-unblock="${prefix}-${i}" checked>
          <span>${escapeHtml(s.titulo)} <small>· ~${s.minutos} min</small></span>
        </label>`).join("")}
    </div>`;
  box.innerHTML = `
    ${data.lectura ? `<p class="focus-note"><strong>Lo que veo:</strong> ${escapeHtml(data.lectura)}</p>` : ""}
    ${group("Se puede verificar (dato concreto, acotado):", data.verificaciones || [], "v")}
    ${group("Pide un primer intento (borrador visible):", data.borradores || [], "d")}
    <div class="modal-actions" style="margin-top:8px">
      <button type="button" class="modal-btn modal-btn-primary" id="focus-unblock-create">Crear pasos y empezar por el primero</button>
    </div>
  `;
  box.querySelector("#focus-unblock-create")?.addEventListener("click", async () => {
    const picked = [];
    box.querySelectorAll("[data-unblock]:checked").forEach(cb => {
      const [prefix, idx] = cb.dataset.unblock.split("-");
      const src = prefix === "v" ? (data.verificaciones || []) : (data.borradores || []);
      const step = src[Number(idx)];
      if (step) picked.push(step);
    });
    if (picked.length === 0) return;
    try {
      const created = [];
      for (const s of picked) {
        const res = await fetch(`${API_BASE}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: s.titulo,
            description: `Paso de: ${task.title}`,
            estimated_minutes: s.minutos,
            parent_task_id: task.id,
          }),
        });
        const child = await res.json();
        setLink(child.id, task.id, "split");
        created.push(child);
      }
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      currentTask = created[0];
      document.querySelector("#focus-title").textContent = created[0].title;
      renderStep(created[0], {});
    } catch (e) {
      console.error("Error creando pasos:", e);
      alert("No se pudieron crear. Intenta de nuevo.");
    }
  });
}

function renderVerifyAsk(task) {
  body().innerHTML = `
    <p class="focus-question">¿Qué necesitas comprobar?</p>
    <div class="form-group">
      <input type="text" id="focus-verify-input" placeholder="Ej: que el monto coincide con el cálculo">
    </div>
    <p class="focus-staging">Objetivo: tener suficiente confianza para actuar, no dominar todo el tema. Límite: 10 min.</p>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-back">Volver</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-verify-save">Verificar (10 min)</button>
    </div>
  `;
  const input = body().querySelector("#focus-verify-input");
  input?.focus();
  body().querySelector("#focus-back")?.addEventListener("click", () => renderFriction(task));
  body().querySelector("#focus-verify-save")?.addEventListener("click", async () => {
    const what = input?.value.trim();
    if (!what) return;
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Verificar: ${what}`,
          description: `Para: ${task.title}\nObjetivo: comprobar el dato, no dominar todo el tema.`,
          estimated_minutes: 10,
        }),
      });
      const child = await res.json();
      setLink(child.id, task.id, "verify");
      if (window.initTasks) await window.initTasks();
      currentTask = child;
      document.querySelector("#focus-title").textContent = child.title;
      renderStep(child, {});
    } catch (e) {
      console.error("Error creando verificación:", e);
      alert("No se pudo crear. Intenta de nuevo.");
    }
  });
}

function renderSplit(task) {
  body().innerHTML = `
    <p class="focus-question">¿Cuál sería una parte más chica?</p>
    <div class="form-group">
      <input type="text" id="focus-split-input" placeholder="Ej: solo la ropa de la silla">
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-back">Volver</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-split-save">Crear y empezar</button>
    </div>
  `;
  const input = body().querySelector("#focus-split-input");
  input?.focus();
  body().querySelector("#focus-back")?.addEventListener("click", () => renderFriction(task));
  body().querySelector("#focus-split-save")?.addEventListener("click", async () => {
    const part = input?.value.trim();
    if (!part) return;
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: part }),
      });
      const child = await res.json();
      setLink(child.id, task.id, "split");
      if (window.initTasks) await window.initTasks();
      currentTask = child;
      document.querySelector("#focus-title").textContent = child.title;
      renderStep(child, {});
    } catch (e) {
      console.error("Error creando parte:", e);
      alert("No se pudo crear. Intenta de nuevo.");
    }
  });
}

function renderVerifyResult(child, parent) {
  body().innerHTML = `
    <p class="focus-question">¿Es suficiente para dar el siguiente paso?</p>
    <p class="focus-staging">No necesitas certeza total, solo claridad razonable para actuar.</p>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-need-more">No, falta algo</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-enough">Sí, vamos</button>
    </div>
  `;
  body().querySelector("#focus-enough")?.addEventListener("click", async () => {
    const fresh = await resolveTask(parent.id);
    currentTask = fresh || parent;
    document.querySelector("#focus-title").textContent = currentTask.title;
    renderStep(currentTask, {});
  });
  body().querySelector("#focus-need-more")?.addEventListener("click", () => {
    renderNewStep(parent);
  });
}

function renderNewStep(parent) {
  body().innerHTML = `
    <p class="focus-question">¿Qué paso concreto falta?</p>
    <div class="form-group">
      <input type="text" id="focus-newstep-input" placeholder="Ej: pedir el detalle a la corredora">
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-back">Volver</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-newstep-save">Crear y empezar</button>
    </div>
  `;
  const input = body().querySelector("#focus-newstep-input");
  input?.focus();
  body().querySelector("#focus-back")?.addEventListener("click", () => renderFriction(parent));
  body().querySelector("#focus-newstep-save")?.addEventListener("click", async () => {
    const step = input?.value.trim();
    if (!step) return;
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: step }),
      });
      const child = await res.json();
      if (window.initTasks) await window.initTasks();
      currentTask = child;
      document.querySelector("#focus-title").textContent = child.title;
      renderStep(child, {});
    } catch (e) {
      console.error("Error creando paso:", e);
      alert("No se pudo crear. Intenta de nuevo.");
    }
  });
}

// Hands the timing over to the floating circle: the modal fades,
// the circle pulses once so the eye follows it, it starts counting,
// and we land in Enfoque ready to work.
async function handoffToTimer(minutes) {
  const taskId = currentTask ? currentTask.id : null;
  if (window.brisaTimer) {
    // Resume paused session as-is; only a fresh timer takes new minutes
    if (!window.brisaTimer.hasSession()) {
      window.brisaTimer.setMinutes(minutes);
    }
  }
  closeFocus();
  requestAnimationFrame(() => {
    const pill = document.querySelector("#timer-pill");
    if (!pill) return;
    pill.classList.remove("timer-handoff");
    void pill.offsetWidth;
    pill.classList.add("timer-handoff");
    setTimeout(() => pill.classList.remove("timer-handoff"), 1300);
  });
  if (window.brisaTimer) window.brisaTimer.start();
  if (taskId && window.startWorkmode) {
    try {
      await window.startWorkmode(taskId);
    } catch {
      // navigation is a bonus; the timer already runs
    }
  }
}

// ---- Shell ----

export function initFocus() {
  const overlay = document.querySelector("#focus-modal");
  if (!overlay) return;
  overlay.querySelector("#focus-close")?.addEventListener("click", closeFocus);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeFocus();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) closeFocus();
  });
}

function closeFocus() {
  document.querySelector("#focus-modal")?.classList.remove("active");
  // Leaving the session pauses the floating timer (resume continues it)
  if (window.brisaTimer) window.brisaTimer.stop();
  currentTask = null;
}

async function completeTask() {
  if (!currentTask) return;
  const doneId = currentTask.id;
  const doneTitle = currentTask.title;
  try {
    await fetch(`${API_BASE}/tasks/${doneId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_completed: true, completed_at: new Date().toISOString() }),
    });
  } catch (e) {
    console.error("Error completando tarea:", e);
  }
  if (window.initTasks) await window.initTasks();
  if (window.initReadiness) window.initReadiness();
  if (window.renderNext) window.renderNext();
  if (window.initToday) window.initToday();

  const link = takeLink(doneId);
  const parentId = (link && link.parentId) || currentTask.parent_task_id || null;
  if (link && link.kind === "verify") {
    const parent = parentId ? await resolveTask(parentId) : null;
    if (parent && !parent.is_completed) {
      currentTask = parent;
      document.querySelector("#focus-title").textContent = parent.title;
      renderVerifyResult(currentTask, parent);
      return;
    }
  } else if (parentId) {
    // A finished step returns to its parent with visible progress,
    // suggesting the next step instead of closing the flow.
    const parent = await resolveTask(parentId);
    if (parent && !parent.is_completed) {
      currentTask = parent;
      document.querySelector("#focus-title").textContent = parent.title;
      const siblings = await fetchChildren(parent.id);
      const openSiblings = siblings.filter(s => !s.is_completed);
      if (openSiblings.length > 0) {
        renderChecklist(parent, siblings, `✓ "${doneTitle}" listo.`);
      } else {
        renderStep(parent, { note: `✓ "${doneTitle}" listo. Era el último paso.` });
      }
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.initToday) window.initToday();
      if (window.initReadiness) window.initReadiness();
      return;
    }
  }
  closeFocus();
  const section = document.querySelector("#next-section");
  if (section) {
    section.innerHTML = `
      <div class="next-empty">
        <div class="next-empty-icon">🌱</div>
        <div class="next-empty-text"><strong>Listo: ${escapeHtml(doneTitle)}.</strong><br>Ni perfecto ni completo: avanzado.</div>
      </div>
    `;
    setTimeout(() => {
      if (window.renderNext) window.renderNext();
    }, 4000);
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

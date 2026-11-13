/* ============================================
   BRISA - Focus Mode
   Friction-first: before acting, detect what blocks.
   Distinguishes real dependency from need for certainty:
   verify bounded (10 min) -> enough confidence -> act.
   ============================================ */
import { state } from "./state.js";
import { pairsHTML } from "./dataPairs.js?v=20261021pairs1";

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

function paintFocusPairs(overlay, task) {
  const box = overlay.querySelector("#focus-pairs");
  if (!box) return;
  const html = pairsHTML(task?.data_pairs);
  box.innerHTML = html;
  box.hidden = !html;
}

export async function openFocus(taskId, opts = {}) {
  const task = await resolveTask(taskId);
  if (!task) return;
  currentTask = task;

  const overlay = document.querySelector("#focus-modal");
  if (!overlay) return;
  // Child steps show the parent action as title; the step itself
  // lives in the hero box, so nothing reads twice. Los datos útiles
  // son de la acción: si abriste Enfoque en un paso, se pintan los
  // del padre y quedan mientras navegas dentro del mismo contexto.
  let title = task.title;
  let pairsTask = task;
  if (task.parent_task_id != null) {
    const parent = findTask(task.parent_task_id) || await resolveTask(task.parent_task_id).catch(() => null);
    if (parent) {
      title = parent.title;
      pairsTask = parent;
    }
  }
  overlay.querySelector("#focus-title").textContent = title;
  paintFocusPairs(overlay, pairsTask);
  overlay.classList.add("active");

  if (opts.skipFriction) {
    renderStep(task, {});
  } else if (opts.friction) {
    // Explicitly stuck: always show the friction menu, even mid-session
    renderFriction(task);
  } else if (window.brisaTimer && window.brisaTimer.hasSession()) {
    // Sesión pausada o corriendo: seguir donde se quedó, pero si la
    // tarea tiene checklist escrito, mostrarlo (no saltar a "Paso").
    const children = await fetchChildren(task.id);
    if (children.length > 0) {
      renderChecklist(task, children);
    } else {
      renderStep(task, {});
    }
  } else {
    await routeByClarity(task);
  }
}

// Single entry routing: the task's shape decides the mode,
// the user never picks a methodology.
async function routeByClarity(task) {
  const children = await fetchChildren(task.id);
  if (children.length > 0) {
    renderChecklist(task, children);
  } else if ((task.parent_task_id != null) || (task.first_step && task.first_step.trim())) {
    renderStep(task, {});
  } else {
    await suggestApproach(task);
  }
}

async function requestApproach(task, context = "") {
  const parent = task.parent_task_id != null ? await resolveTask(task.parent_task_id) : null;
  const event = (state.events || []).find(item => String(item.id) === String(task.event_id));
  const savedContext = [
    task.description,
    task.estimated_minutes ? `Duración estimada: ${task.estimated_minutes} minutos.` : "",
    task.due_datetime ? `Fecha límite: ${task.due_datetime}.` : "",
    context,
  ].filter(Boolean).join("\n\n").slice(0, 4000);
  const res = await fetch(`${API_BASE}/ai/approach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: task.title, context: savedContext, parentTitle: parent?.title || "", eventTitle: event?.title || "" }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo sugerir una forma de avanzar.");
  return data;
}

async function suggestApproach(task, context = "", clarificationCount = 0) {
  body().innerHTML = `<div class="focus-approach-loading" role="status" aria-live="polite"><span class="focus-approach-spinner" aria-hidden="true"></span><span>Revisando lo que ya sabes de esta acción…</span></div>`;
  try {
    const suggestion = await requestApproach(task, context);
    currentTask = task;
    if (suggestion.mode === "step") renderSuggestedStep(task, suggestion);
    else if (suggestion.mode === "checklist") renderSuggestedChecklist(task, suggestion);
    else if (suggestion.mode === "clarify") renderApproachQuestion(task, suggestion, clarificationCount);
    else if (suggestion.mode === "develop") renderDevelop(task, suggestion.reason, suggestion.first_step);
    else renderApproachFallback(task);
  } catch (e) {
    console.warn("No se pudo obtener una ruta sugerida:", e);
    renderApproachFallback(task);
  }
}

function renderApproachFallback(task) {
  body().innerHTML = `
    <p class="focus-question">No pude sugerir una ruta todavía.</p>
    <p class="focus-note">No hace falta resolverlo todo. Cuéntame qué es lo que no está claro y avanzamos desde ahí.</p>
    ${modeBar("guide")}
    <button type="button" class="modal-btn modal-btn-primary focus-primary-block" id="focus-fallback-help">Ayúdame a aclararlo</button>
  `;
  wireModeBar(task);
  body().querySelector("#focus-fallback-help")?.addEventListener("click", () => renderUnblockAsk(task));
}

function renderSuggestedStep(task, suggestion) {
  body().innerHTML = `
    ${modeBar("step")}
    <p class="focus-route-intro">${escapeHtml(suggestion.reason || "Por lo que ya sabemos, este parece un buen comienzo.")}</p>
    <div class="focus-step-box">
      <div class="focus-step-label">Te propongo empezar por:</div>
      <div class="focus-step">${escapeHtml(suggestion.first_step)}</div>
    </div>
    <p class="focus-message" id="focus-approach-error" role="alert"></p>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-edit-suggestion">Ajustar</button>
      <button type="button" class="modal-btn modal-btn-primary focus-primary-block" id="focus-use-suggestion">Usar este paso y empezar</button>
    </div>
  `;
  wireModeBar(task);
  body().querySelector("#focus-edit-suggestion")?.addEventListener("click", () => renderDefineStep(task, suggestion.first_step));
  body().querySelector("#focus-use-suggestion")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Guardando…";
    try {
      const res = await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_step: suggestion.first_step }),
      });
      if (!res.ok) throw new Error("No se pudo guardar el paso. Intenta de nuevo.");
      task.first_step = suggestion.first_step;
      if (window.initTasks) await window.initTasks();
      currentTask = task;
      renderStep(task, {});
      await handoffToTimer(10);
    } catch (e) {
      button.disabled = false;
      button.textContent = "Usar este paso y empezar";
      const msg = body().querySelector("#focus-approach-error");
      if (msg) msg.textContent = e.message;
    }
  });
}

function renderSuggestedChecklist(task, suggestion) {
  body().innerHTML = `
    ${modeBar("checklist")}
    <p class="focus-route-intro">${escapeHtml(suggestion.reason || "Parece una acción con varias partes. Organicé un primer recorrido para quitarte ese trabajo.")}</p>
    <ol class="focus-suggested-steps">${suggestion.steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-edit-plan">Lo quiero hacer de otra forma</button>
      <button type="button" class="modal-btn modal-btn-primary focus-primary-block" id="focus-use-plan">Usar este checklist</button>
    </div>
  `;
  wireModeBar(task);
  body().querySelector("#focus-edit-plan")?.addEventListener("click", () => renderUnblockAsk(task));
  body().querySelector("#focus-use-plan")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Guardando…";
    const saved = [];
    try {
      for (const title of suggestion.steps) {
        const res = await fetch(`${API_BASE}/tasks`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, parent_task_id: task.id }),
        });
        if (!res.ok) throw new Error("No se pudo guardar el checklist completo. Revisa la acción y vuelve a intentarlo.");
        saved.push(await res.json());
      }
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) await window.renderNext();
      const children = await fetchChildren(task.id);
      renderChecklist(task, children, "Checklist sugerido a partir de la información de esta acción.");
    } catch (e) {
      if (saved.length > 0) {
        if (window.initTasks) await window.initTasks();
        if (window.renderNext) await window.renderNext();
        renderChecklist(task, await fetchChildren(task.id), "Se guardó parte del checklist. Puedes continuar y agregar lo que falte.");
        return;
      }
      button.disabled = false;
      button.textContent = "Usar este checklist";
      const msg = body().querySelector("#focus-approach-error") || document.createElement("p");
      msg.id = "focus-approach-error";
      msg.className = "focus-message";
      msg.textContent = e.message || "No se pudo guardar el checklist.";
      body().append(msg);
    }
  });
}

function renderApproachQuestion(task, suggestion, clarificationCount) {
  body().innerHTML = `
    ${modeBar("guide")}
    <p class="focus-route-intro">${escapeHtml(suggestion.reason || "Me falta un dato para recomendarte algo útil.")}</p>
    <p class="focus-question">${escapeHtml(suggestion.question)}</p>
    <div class="form-group"><input type="text" id="focus-approach-answer" maxlength="500" autocomplete="off" placeholder="Una frase basta"></div>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-answer-skip">No lo sé todavía</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-answer-send">Responder y continuar</button>
    </div>
  `;
  wireModeBar(task);
  const input = body().querySelector("#focus-approach-answer");
  input?.focus();
  body().querySelector("#focus-answer-skip")?.addEventListener("click", () => renderUnblockAsk(task));
  const submit = async () => {
    const answer = input?.value.trim();
    if (!answer) {
      input?.focus();
      return;
    }
    if (clarificationCount >= 1) {
      renderUnblockAsk(task, answer);
      return;
    }
    await suggestApproach(task, `Respuesta a la pregunta anterior: ${answer}`, clarificationCount + 1);
  };
  body().querySelector("#focus-answer-send")?.addEventListener("click", submit);
  input?.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); submit(); }
  });
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

// The route is visible and switchable; scheduling stays a contextual action.
const FOCUS_MODES = [
  { id: "step", label: "Un paso", title: "Para una tarea clara o pequeña: define un primer movimiento" },
  { id: "checklist", label: "Checklist", title: "Para una tarea compleja cuyo camino ya conoces" },
  { id: "guide", label: "Aclarar", title: "Para cuando no sabes cómo partir" },
  { id: "develop", label: "Desarrollar", title: "Para analizar, decidir o escribir con más espacio" },
];

function modeBar(current) {
  return `
    <div class="focus-routebar">
      <div class="focus-modes" role="group" aria-label="Cómo abordar esta acción">
        ${FOCUS_MODES.map(m => `<button type="button" class="focus-mode-seg ${m.id === current ? "on" : ""}" data-mode="${m.id}" title="${m.title}" aria-pressed="${m.id === current}">${m.label}</button>`).join("")}
      </div>
      <button type="button" class="focus-schedule-link ${current === "event" ? "on" : ""}" data-mode="event" title="Asignar fecha y hora a esta acción">Programar fecha</button>
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
  } else if (mode === "event") {
    renderEventMode(task);
  } else if (mode === "develop") {
    renderDevelop(task);
  }
}

function wireModeBar(task) {
  body().querySelectorAll("[data-mode]").forEach(btn => {
    btn.addEventListener("click", () => switchMode(task, btn.dataset.mode));
  });
}

function renderDevelop(task, reason = "", firstStep = "") {
  body().innerHTML = `
    ${modeBar("develop")}
    <p class="focus-question">${reason ? escapeHtml(reason) : "¿Necesitas pensarla antes de actuar?"}</p>
    ${firstStep ? `<div class="focus-step-box"><div class="focus-step-label">Primer movimiento sugerido:</div><div class="focus-step">${escapeHtml(firstStep)}</div></div>` : ""}
    <p class="focus-note">Abre el bloc de esta acción para desarrollar ideas, comparar opciones o anotar decisiones. Se guarda con la tarea.</p>
    <button type="button" class="modal-btn modal-btn-primary focus-primary-block" id="focus-open-notes">${firstStep ? "Abrir el bloc y empezar" : "Abrir bloc de esta acción"}</button>
    <p class="focus-staging">Cuando encuentres un paso concreto, puedes volver a “Un paso” o crear un checklist.</p>
  `;
  wireModeBar(task);
  body().querySelector("#focus-open-notes")?.addEventListener("click", async () => {
    const id = task.id;
    if (firstStep) {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_step: firstStep }),
      });
      if (!res.ok) {
        const msg = body().querySelector(".focus-staging");
        if (msg) msg.textContent = "No se pudo guardar el movimiento. Intenta de nuevo.";
        return;
      }
      task.first_step = firstStep;
      if (window.initTasks) await window.initTasks();
    }
    closeFocus();
    if (window.startWorkmode) await window.startWorkmode(id);
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

async function handleFriction(task, kind) {
  if (kind === "ready") {
    // Si la tarea ya tiene checklist escrito, partir mostrándolo (no saltar a "Paso").
    const children = await fetchChildren(task.id);
    if (children.length > 0) {
      renderChecklist(task, children);
    } else {
      renderStep(task, {});
    }
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
      : `<div class="focus-step missing">Aún no hay un paso concreto para empezar.</div>`;
  body().innerHTML = `
    <p class="focus-route-intro">${hasStep ? "Ya tienes un primer paso. Parte por ahí o cambia la forma de abordarlo." : "No necesitas resolver todo ahora. Basta con definir un primer movimiento."}</p>
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
      <div class="focus-step-label">Primero, encontremos por dónde partir:</div>
      ${stepInner}
      <div class="focus-empty-actions">
        <button type="button" class="modal-btn modal-btn-primary" id="focus-define-now">Definir un primer paso</button>
        <button type="button" class="modal-btn modal-btn-secondary" id="focus-ask-help">Ayúdame a elegir</button>
      </div>
    </div>`}
    ${actionable ? `<div class="focus-timer-row">
      <div class="focus-time-btns" title="Duración de la sesión">
        <button class="focus-time-btn" data-min="5">5</button>
        <button class="focus-time-btn" data-min="10">10</button>
        <button class="focus-time-btn" data-min="15">15</button>
        <input type="number" class="focus-custom-min" id="focus-custom-min" min="1" max="120" placeholder="min" title="Minutos a tu medida">
      </div>
      <button class="modal-btn modal-btn-primary focus-primary-block" id="focus-start" title="Cierra esto y parte el timer flotante">Empezar</button>
    </div>` : `<p class="focus-staging">Cuando tengamos un paso concreto, podrás empezar sin planificar todo el resto.</p>`}
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
  body().querySelector("#focus-ask-help")?.addEventListener("click", () => renderUnblockAsk(task));
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
    <p class="focus-permission">El camino está claro. Marca un paso y seguimos con el siguiente.</p>
    ${modeBar("checklist")}
    ${note ? `<p class="focus-note">${escapeHtml(note)}</p>` : ""}
    ${task.first_step && task.first_step.trim() ? `<p class="focus-note">Arranca por: <strong>${escapeHtml(task.first_step)}</strong></p>` : ""}
    ${total > 0 ? `
    <div class="focus-progress">
      <div class="focus-progress-top"><span>Avance de esta acción</span><span>${done} de ${total}</span></div>
      <div class="focus-progress-bar"><span style="width:${Math.round((done / total) * 100)}%"></span></div>
    </div>` : ""}
    <div class="focus-checklist">
      ${total === 0 ? `<p class="focus-note">Anota solo lo que no quieres tener que recordar.</p>` : ""}
      ${children.map(c => `
        <button type="button" class="focus-check-item ${c.is_completed ? "done" : ""}" data-child="${c.id}">
          <span class="focus-check-box">${c.is_completed ? "✓" : ""}</span>
          <span class="focus-check-title">${escapeHtml(c.title)}</span>
          ${c.estimated_minutes ? `<span class="focus-check-min">~${c.estimated_minutes} min</span>` : ""}
        </button>`).join("")}
      <div class="focus-add-row">
        <input type="text" id="focus-add-step" class="prep-input" placeholder="Agregar un paso + Enter" autocomplete="off" aria-label="Agregar un paso al checklist">
      </div>
    </div>
    <div class="modal-actions">
      ${next
        ? `<button type="button" class="modal-btn modal-btn-primary focus-primary-block" id="focus-next-step" title="Ir directamente a trabajar en este paso">Empezar este paso: ${escapeHtml(next.title.slice(0, 34))}${next.title.length > 34 ? "…" : ""}</button>`
        : total > 0
          ? `<button type="button" class="modal-btn modal-btn-primary focus-primary-block" id="focus-done" title="Todos los pasos están listos: marcar la acción como hecha">Marcar acción hecha ✓</button>`
          : `<button type="button" class="modal-btn modal-btn-primary focus-primary-block" id="focus-add-first-step">Escribir primer paso</button>`}
    </div>
    <div class="modal-actions focus-quiet-row">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-later" title="Cerrar sin marcar nada">Lo dejo acá</button>
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-stuck" title="Volver a qué me frena">Atascado</button>
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
  body().querySelector("#focus-add-first-step")?.addEventListener("click", () => addInput?.focus());
  const nextBtn = body().querySelector("#focus-next-step");
  if (nextBtn && next) {
    nextBtn.addEventListener("click", async () => {
      // Checklist is already the user's chosen route. Move straight into
      // the selected step's work session instead of reopening the mode picker.
      currentTask = next;
      await handoffToTimer(10);
    });
  }
  body().querySelector("#focus-later")?.addEventListener("click", closeFocus);
  body().querySelector("#focus-stuck")?.addEventListener("click", () => {
    if (currentTask) renderFriction(currentTask);
  });
  body().querySelector("#focus-done")?.addEventListener("click", completeTask);
  wireModeBar(task);
}

function renderDefineStep(task, suggested = "") {
  const current = suggested || (task.first_step && task.first_step.trim() ? task.first_step.trim() : "");
  body().innerHTML = `
    <p class="focus-question">¿Cuál sería el primer paso físico, bien chico?</p>
    ${current ? `<p class="focus-note">Actual: "<strong>${escapeHtml(current)}</strong>". Editarlo lo reemplaza.</p>` : ""}
    <div class="form-group">
      <input type="text" id="focus-define-input" placeholder="Ej: saca una prenda y ponla en la cama" value="${escapeHtml(current)}">
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-back">Volver</button>
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-define-close">Guardar y cerrar</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-define-save">Guardar y empezar</button>
    </div>
  `;
  const input = body().querySelector("#focus-define-input");
  input?.focus();
  body().querySelector("#focus-back")?.addEventListener("click", () => renderFriction(task));

  const saveStep = async () => {
    const step = input?.value.trim();
    if (!step) return false;
    if (step.length < 4) {
      input?.focus();
      input?.select();
      let nudge = body().querySelector("#focus-define-nudge");
      if (!nudge) {
        nudge = document.createElement("p");
        nudge.id = "focus-define-nudge";
        nudge.className = "focus-note";
        input?.after(nudge);
      }
      nudge.textContent = "Muy cortito: descríbelo en una frase (ej: abre la boleta y mira el monto).";
      return false;
    }
    try {
      await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_step: step }),
      });
      task.first_step = step;
      if (window.initTasks) await window.initTasks();
      return true;
    } catch (e) {
      console.error("Error guardando paso:", e);
      return false;
    }
  };

  body().querySelector("#focus-define-close")?.addEventListener("click", async () => {
    const ok = await saveStep();
    if (ok) closeFocus();
  });
  body().querySelector("#focus-define-save")?.addEventListener("click", async () => {
    const ok = await saveStep();
    if (ok) renderStep(task, {});
  });
}

function renderUnblockAsk(task, initialBlock = "") {
  body().innerHTML = `
    <p class="focus-question">¿Qué parte todavía no está clara?</p>
    ${modeBar("guide")}
    <div class="form-group">
      <textarea id="focus-block-input" rows="3" placeholder="Escribe lo que tengas en mente. No hace falta ordenarlo.">${escapeHtml(initialBlock)}</textarea>
    </div>
    <p class="focus-staging">Te ayudo a separar qué falta averiguar y cuál podría ser el primer intento.</p>
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

// Modo fecha: dos caminos explícitos.
// 1) "Programar la acción" → solo scheduled_datetime (sigue siendo acción).
// 2) "Crear evento" → evento de calendario + alarma extrema (pantalla completa + sonido).
function renderEventMode(task) {
  const preset = task.scheduled_datetime ? new Date(task.scheduled_datetime) : null;
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  body().innerHTML = `
    <p class="focus-question">¿Cuándo la quieres hacer?</p>
    ${modeBar("event")}
    <div class="form-group" style="gap:8px">
      <input type="date" id="focus-event-date" value="${preset ? fmtDate(preset) : fmtDate(tomorrow)}" title="Día">
      <div class="focus-time-row">
        <input type="time" id="focus-event-time" value="${preset ? fmtTime(preset) : ""}" title="Hora (opcional)">
        <button type="button" class="focus-time-clear" id="focus-time-clear" title="Quitar la hora">Sin hora</button>
      </div>
    </div>
    <p id="focus-when-note" class="focus-staging"></p>
    <p id="focus-event-msg" class="focus-message"></p>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-back">Volver</button>
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-event-create">Crear evento</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-event-save">Programar la acción</button>
    </div>
    <p class="focus-staging">“Programar la acción” solo le pone día y hora en tu lista. “Crear evento” la suma al calendario y, si tiene hora, activa la alarma extrema.</p>
  `;
  wireModeBar(task);

  // La hora es opcional. El input nativo de hora no se puede borrar con
  // teclado una vez con valor, así que "Sin hora" la limpia de una vez:
  // el evento se guarda como todo el día y sin alarma extrema.
  const timeInput = body().querySelector("#focus-event-time");
  const clearTime = body().querySelector("#focus-time-clear");
  const whenNote = body().querySelector("#focus-when-note");
  const syncWhen = () => {
    const time = timeInput.value;
    clearTime.hidden = !time;
    whenNote.textContent = time
      ? "Con hora: la acción queda a esa hora y el evento (si lo creas) activa la alarma extrema."
      : "Sin hora: la acción queda a las 09:00. El evento, si lo creas, queda de todo el día y sin alarma.";
  };
  timeInput.addEventListener("input", syncWhen);
  timeInput.addEventListener("change", syncWhen);
  body().querySelector("#focus-event-date")?.addEventListener("input", syncWhen);
  clearTime.addEventListener("click", () => {
    timeInput.value = "";
    syncWhen();
  });
  syncWhen();

  body().querySelector("#focus-back")?.addEventListener("click", () => renderFriction(task));
  const showDone = (title, whenText, isEvent, withAlarm) => {
    body().innerHTML = `
      ${modeBar("event")}
      <p class="focus-question">${isEvent ? "Evento creado ✓" : "Acción programada ✓"}</p>
      <p class="focus-note"><strong>${escapeHtml(title)}</strong><br>${escapeHtml(whenText)}</p>
      ${isEvent
        ? (withAlarm
          ? `<p class="focus-staging">Alarma extrema activada: a la hora verás pantalla completa + sonido hasta que lo marques hecho o lo pospongas. No necesitas la app abierta en esa vista, pero sí la pestaña activa.</p>`
          : `<p class="focus-staging">Quedó en tu calendario como todo el día, sin alarma.</p>`)
        : `<p class="focus-staging">Quedó en tu lista de acciones con día y hora. No se creó ningún evento.</p>`}
      <div class="modal-actions">
        <button type="button" class="modal-btn modal-btn-primary" id="focus-event-ok">Entendido</button>
      </div>
    `;
    wireModeBar(task);
    body().querySelector("#focus-event-ok")?.addEventListener("click", closeFocus);
  };

  const readDate = () => body().querySelector("#focus-event-date")?.value || "";

  // Camino 1: la acción sigue siendo acción; solo se le pone día y hora.
  body().querySelector("#focus-event-save")?.addEventListener("click", async () => {
    const msg = body().querySelector("#focus-event-msg");
    const date = readDate();
    if (!date) {
      if (msg) msg.textContent = "Pon el día para programarla.";
      return;
    }
    const time = timeInput.value;
    const iso = new Date(`${date}T${time || "09:00"}:00`).toISOString();
    const btn = body().querySelector("#focus-event-save");
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_datetime: iso }),
      });
      if (!res.ok) throw new Error("task");
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.initToday) window.initToday();
      if (window.initWeek) window.initWeek();
      const when = new Date(iso).toLocaleString("es-ES", {
        weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      });
      showDone(task.title, when, false, false);
    } catch (e) {
      console.error("Error programando la acción:", e);
      btn.disabled = false;
      if (msg) msg.textContent = "No se pudo programar. Intenta de nuevo.";
    }
  });

  // Camino 2: crear un evento de calendario (con alarma extrema si tiene hora).
  body().querySelector("#focus-event-create")?.addEventListener("click", async () => {
    const msg = body().querySelector("#focus-event-msg");
    const date = readDate();
    const time = timeInput.value;
    if (!date) {
      if (msg) msg.textContent = "Pon el día para crear el evento.";
      return;
    }
    const iso = new Date(`${date}T${time || "00:00"}:00`).toISOString();
    const withAlarm = Boolean(time);
    const btn = body().querySelector("#focus-event-create");
    btn.disabled = true;
    try {
      const evRes = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: task.title, start: iso, description: `Desde acción: ${task.title}` }),
      });
      if (!evRes.ok) throw new Error("event");
      const ev = await evRes.json();
      await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: ev.id }),
      }).catch(() => {});
      // Extreme companion: the guarantee of fullscreen + sound.
      // Sin hora no hay alarma: el evento queda como todo el día.
      if (withAlarm) {
        await fetch(`${API_BASE}/reminders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: task.title, remind_at: iso, extreme: true }),
        });
      }
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.initToday) window.initToday();
      if (window.initWeek) window.initWeek();
      if (window.initCalendar) window.initCalendar();
      const when = withAlarm
        ? new Date(iso).toLocaleString("es-ES", {
            weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
          })
        : `${new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })} · Todo el día`;
      showDone(task.title, when, true, withAlarm);
    } catch (e) {
      console.error("Error creando evento:", e);
      btn.disabled = false;
      if (msg) msg.textContent = "No se pudo crear. Intenta de nuevo.";
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
          description: `Para: ${task.title}`,
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
  if (currentTask && !currentTask.started_at) {
    const startedAt = new Date().toISOString();
    try {
      const res = await fetch(`${API_BASE}/tasks/${taskId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ started_at: startedAt }),
      });
      if (res.ok) {
        currentTask.started_at = startedAt;
        const local = findTask(taskId);
        if (local) local.started_at = startedAt;
      }
    } catch (e) {
      console.warn("No se pudo guardar el inicio de la acción:", e);
    }
  }
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
  const timerActionId = currentTask?.parent_task_id || taskId;
  if (timerActionId && window.brisaTimer && window.brisaTimer.setTask) window.brisaTimer.setTask(timerActionId);
  if (taskId && window.startWorkmode) {
    try {
      await window.startWorkmode(taskId);
    } catch {
      // navigation is a bonus; the timer already runs
    }
  }
}

async function resumeFocusTask(taskId) {
  const task = await resolveTask(taskId);
  if (!task) return;
  currentTask = task;
  await handoffToTimer(10);
}

// ---- Shell ----

export function initFocus() {
  const overlay = document.querySelector("#focus-modal");
  if (!overlay) return;
  window.resumeFocusTask = resumeFocusTask;
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

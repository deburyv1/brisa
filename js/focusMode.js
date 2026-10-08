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
  overlay.querySelector("#focus-title").textContent = task.title;
  overlay.classList.add("active");

  if (opts.skipFriction) {
    renderStep(task, {});
  } else {
    renderFriction(task);
  }
}

function body() {
  return document.querySelector("#focus-body");
}

// ---- Views ----

async function renderFriction(task) {
  let basics = [];
  try {
    const res = await fetch("/api/readiness");
    if (res.ok) basics = (await res.json()).filter(i => !i.done);
  } catch {
    basics = [];
  }
  body().innerHTML = `
    <p class="focus-question">Antes de hacerlo, ¿qué te frena?</p>
    <div class="focus-options">
      ${basics.length > 0 ? `
        <button class="focus-option" data-friction="basics">🧹 Lo básico pendiente (${basics.length})</button>
      ` : ""}
      <button class="focus-option" data-friction="unknown">🟢 No sé cuál es el siguiente paso</button>
      <button class="focus-option" data-friction="verify">🔎 Necesito verificar algo primero</button>
      <button class="focus-option" data-friction="big">🧩 Es más grande de lo que parece</button>
      <button class="focus-option" data-friction="resist">😕 Me da resistencia</button>
      <button class="focus-option primary" data-friction="ready">▶️ Ya tengo suficiente información</button>
    </div>
    <div id="focus-basics"></div>
  `;
  body().querySelectorAll(".focus-option").forEach(btn => {
    btn.addEventListener("click", () => handleFriction(task, btn.dataset.friction, basics));
  });
}

function handleFriction(task, kind, basics = []) {
  if (kind === "ready") {
    renderStep(task, {});
  } else if (kind === "basics") {
    renderBasics(task, basics);
  } else if (kind === "unknown") {
    renderDefineStep(task);
  } else if (kind === "verify") {
    renderVerifyAsk(task);
  } else if (kind === "big") {
    renderSplit(task);
  } else if (kind === "resist") {
    renderStep(task, { presetMin: 5, note: "Empieza 5 minutos nomás. Parar también vale." });
  }
}

function renderStep(task, { presetMin = 10, note = null } = {}) {
  const step = task.first_step || "Empieza por lo más chico que veas.";
  body().innerHTML = `
    <p class="focus-permission">No tiene que quedar perfecto. Solo mueve UNA cosa.</p>
    ${note ? `<p class="focus-note">${escapeHtml(note)}</p>` : ""}
    <div class="focus-step-box">
      <div class="focus-step-label">Ahora mismo, solo esto:</div>
      <div class="focus-step">${escapeHtml(step)}</div>
    </div>
    <p class="focus-staging">Todo lo que saques va a <strong>un solo lugar provisorio</strong> (la cama sirve). Ordenar viene después, no ahora.</p>
    <div class="focus-timer-row">
      <div class="focus-time-btns">
        <button class="focus-time-btn" data-min="10">10</button>
        <button class="focus-time-btn" data-min="15">15</button>
        <button class="focus-time-btn" data-min="25">25</button>
      </div>
      <button class="modal-btn modal-btn-primary" id="focus-start">Empezar</button>
    </div>
    <p id="focus-message" class="focus-message"></p>
    <div class="modal-actions">
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-later">Lo dejo acá</button>
      <button type="button" class="modal-btn modal-btn-secondary" id="focus-stuck">Atascado</button>
      <button type="button" class="modal-btn modal-btn-primary" id="focus-done">Listo ✓</button>
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
      paintStart();
    });
  });
  paintStart();
  startBtn?.addEventListener("click", () => handoffToTimer(minutes));
  body().querySelector("#focus-later")?.addEventListener("click", closeFocus);
  body().querySelector("#focus-stuck")?.addEventListener("click", () => {
    if (currentTask) renderFriction(currentTask);
  });
  body().querySelector("#focus-done")?.addEventListener("click", completeTask);
}

function renderBasics(task, basics) {
  const box = body().querySelector("#focus-basics");
  if (!box) return;
  box.innerHTML = `
    <div class="focus-basics">
      ${basics.map(b => `
        <label class="prep-row">
          <input type="checkbox" data-basic="${b.id}">
          <span>${escapeHtml(b.label)}</span>
        </label>`).join("")}
      <button class="modal-btn modal-btn-primary" id="focus-basics-done" style="margin-top:8px">Listo, sigamos</button>
    </div>
  `;
  box.querySelectorAll("[data-basic]").forEach(cb => {
    cb.addEventListener("change", async () => {
      try {
        await fetch("/api/readiness/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: Number(cb.dataset.basic), done: cb.checked }),
        });
        if (window.initReadiness) window.initReadiness();
      } catch (e) {
        console.error("Error guardando readiness:", e);
      }
    });
  });
  box.querySelector("#focus-basics-done")?.addEventListener("click", () => {
    renderStep(task, {});
  });
}

function renderDefineStep(task) {
  body().innerHTML = `
    <p class="focus-question">¿Cuál sería el primer paso físico, bien chico?</p>
    <div class="form-group">
      <input type="text" id="focus-define-input" placeholder="Ej: saca una prenda y ponla en la cama">
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
// the circle pulses once so the eye follows it, and it starts counting.
function handoffToTimer(minutes) {
  if (window.brisaTimer) {
    window.brisaTimer.setMinutes(minutes);
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
  if (link && link.kind === "verify") {
    const parent = await resolveTask(link.parentId);
    if (parent && !parent.is_completed) {
      currentTask = parent;
      document.querySelector("#focus-title").textContent = parent.title;
      renderVerifyResult(currentTask, parent);
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

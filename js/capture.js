/* ============================================
   BRISA - Capture Module
   Fast inbox capture with reversible suggestion
   ============================================ */
import { suggestType, TYPE_LABELS } from "./suggest.js";
import { attachFormatbar } from "./formatbar.js";
import { renderMarkdown } from "./markdown.js";

const API_BASE = "/api";
const TYPES = ["action", "event", "note", "idea", "reminder"];

let pendingEntry = null;
let selectedType = null;

function needsDate(type) {
  return type === "action" || type === "event" || type === "reminder";
}

export function initCapture() {
  const section = document.querySelector("#capture-section");
  if (!section) return;

  renderIdle(section);
}

export async function loadEntryIntoCapture(entryId) {
  const section = document.querySelector("#capture-section");
  if (!section) return;
  try {
    const entries = await fetch(`${API_BASE}/entries?status=inbox`).then(r => r.json());
    const entry = entries.find(e => e.id == entryId);
    if (!entry) return;
    pendingEntry = entry;
    selectedType = entry.suggested_type || suggestType(entry.raw_text).type;
    renderSuggestion(section, entry, "Revísala y confirma el tipo.");
  } catch (e) {
    console.error("Error cargando entrada:", e);
  }
}

function renderIdle(section) {
  pendingEntry = null;
  selectedType = null;
  section.innerHTML = `
    <div class="capture-row">
      <span class="capture-icon">💭</span>
      <textarea id="capture-input" class="capture-input" rows="1"
        placeholder="¿Qué tienes en mente?" autocomplete="off" maxlength="2000"></textarea>
      <button class="capture-btn" id="capture-save">Guardar</button>
    </div>
    <div class="capture-under">
      <div id="capture-fmt"></div>
      <span class="capture-count" id="capture-count"></span>
    </div>
  `;
  const input = section.querySelector("#capture-input");
  attachFormatbar(input, section.querySelector("#capture-fmt"));
  const count = section.querySelector("#capture-count");
  const update = () => {
    autogrow(input);
    const words = input.value.trim().split(/\s+/).filter(Boolean).length;
    count.textContent = words > 1 ? `${words} palabras` : "";
  };
  input?.addEventListener("input", update);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      capture(section);
    }
  });
  section.querySelector("#capture-save")?.addEventListener("click", () => capture(section));
}

function autogrow(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

async function capture(section) {
  const input = section.querySelector("#capture-input");
  const text = input?.value.trim();
  if (!text) return;

  const saveBtn = section.querySelector("#capture-save");
  if (saveBtn) saveBtn.disabled = true;
  try {
    const suggestion = suggestType(text);
    const res = await fetch(`${API_BASE}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: text, suggested_type: suggestion.type }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pendingEntry = await res.json();
    selectedType = suggestion.type;
    renderSuggestion(section, pendingEntry, suggestion.reason);
    if (window.initInbox) window.initInbox();
    if (window.renderGuidanceBanner) window.renderGuidanceBanner();
  } catch (err) {
    console.error("Error capturando:", err);
    alert("No se pudo guardar. Intenta de nuevo.");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

async function findSimilar(text) {
  const needle = norm(text);
  if (needle.length < 4) return null;
  try {
    const [tasksRes, entriesRes] = await Promise.all([
      fetch(`${API_BASE}/tasks`).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/entries?status=inbox`).then(r => r.ok ? r.json() : []),
    ]);
    const hay = [
      ...tasksRes.filter(t => !t.is_completed).map(t => ({ kind: "tarea", title: t.title })),
      ...entriesRes.map(e => ({ kind: "inbox", title: e.raw_text })),
    ];
    return hay.find(h => {
      const hayN = norm(h.title);
      return hayN && hayN.length >= 4 && (hayN.includes(needle) || needle.includes(hayN));
    }) || null;
  } catch {
    return null;
  }
}

function renderSuggestion(section, entry, reason) {
  section.innerHTML = `
    <div class="capture-suggest">
      <div class="capture-suggest-text"><span class="capture-suggest-icon">💭</span><span class="md">${renderMarkdown(entry.raw_text)}</span></div>
      <div class="capture-suggest-reason">${escapeHtml(reason)}</div>
      <div class="capture-similar" id="capture-similar" style="display:none"></div>
      <div class="capture-types">
        ${TYPES.map(t => `
          <button class="capture-type ${t === selectedType ? "active" : ""}" data-type="${t}">${TYPE_LABELS[t]}</button>
        `).join("")}
      </div>
      <div class="capture-when" ${needsDate(selectedType) ? "" : 'style="display:none"'}>
        <button class="capture-when-btn" data-when="today">Hoy</button>
        <button class="capture-when-btn" data-when="later">Después</button>
        <input type="datetime-local" id="capture-datetime" class="capture-datetime">
      </div>
      <div class="capture-actions">
        <button class="modal-btn modal-btn-secondary" id="capture-discard">Descartar</button>
        <button class="modal-btn modal-btn-secondary" id="capture-later">Después</button>
        <button class="modal-btn modal-btn-primary" id="capture-confirm">Guardar</button>
      </div>
    </div>
  `;

  section.querySelectorAll(".capture-type").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedType = btn.dataset.type;
      section.querySelectorAll(".capture-type").forEach(b =>
        b.classList.toggle("active", b === btn));
      const when = section.querySelector(".capture-when");
      if (when) when.style.display = needsDate(selectedType) ? "" : "none";
    });
  });

  section.querySelectorAll(".capture-when-btn").forEach(b =>
    b.addEventListener("click", () => {
      section.querySelectorAll(".capture-when-btn").forEach(x =>
        x.classList.toggle("selected", x === b));
    }));

  section.querySelector("#capture-discard")?.addEventListener("click", async () => {
    try {
      await fetch(`${API_BASE}/entries/${entry.id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Error descartando:", e);
    }
    renderIdle(section);
    if (window.initInbox) window.initInbox();
    if (window.renderGuidanceBanner) window.renderGuidanceBanner();
  });

  section.querySelector("#capture-confirm")?.addEventListener("click", () => confirmEntry(section, entry));

  findSimilar(entry.raw_text).then(sim => {
    if (!sim) return;
    const box = section.querySelector("#capture-similar");
    if (!box) return;
    box.style.display = "";
    box.innerHTML = `⚠️ Ya tienes algo parecido en ${sim.kind === "tarea" ? "tareas" : "inbox"}: <strong>${escapeHtml(sim.title)}</strong>`;
  });

  section.querySelector("#capture-later")?.addEventListener("click", () => {
    // Leave it in inbox on purpose: decide later, no pressure now
    renderIdle(section);
    if (window.initInbox) window.initInbox();
    if (window.renderGuidanceBanner) window.renderGuidanceBanner();
  });
}

function dateFor(when, datetimeValue) {
  const now = new Date();
  if (when === "today") {
    now.setHours(23, 59, 0, 0);
    return now;
  }
  if (datetimeValue) return new Date(datetimeValue);
  return null;
}

async function confirmEntry(section, entry) {
  const whenBtn = section.querySelector(".capture-when-btn.selected");
  const datetimeValue = section.querySelector("#capture-datetime")?.value;
  const when = whenBtn?.dataset.when;
  const at = dateFor(when, datetimeValue);
  const iso = at ? at.toISOString() : null;
  const text = entry.raw_text;

  // Actions pass through the readiness gate first
  if (selectedType === "action") {
    renderReadiness(section, entry, text, iso);
    return;
  }

  try {
    let targetType = selectedType;
    let targetId = null;

    if (selectedType === "event") {
      if (!iso) {
        alert("El evento necesita fecha y hora.");
        return;
      }
      const ev = await postJson("/api/events", { title: text, start: iso, entry_id: entry.id });
      targetId = ev.id;
    } else if (selectedType === "note") {
      const note = await postJson("/api/journal", {
        title: text.length > 60 ? text.slice(0, 60) + "…" : text,
        content: text,
      });
      targetId = note.id;
    } else if (selectedType === "idea") {
      const idea = await postJson("/api/ideas", { title: text, entry_id: entry.id });
      targetId = idea.id;
    } else if (selectedType === "reminder") {
      const rem = await postJson("/api/reminders", { title: text, remind_at: iso, entry_id: entry.id });
      targetId = rem.id;
    }

    await fetch(`${API_BASE}/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "processed", target_type: targetType, target_id: targetId }),
    });

    renderIdle(section);
    if (window.initInbox) window.initInbox();
    if (window.initTasks) window.initTasks();
    if (window.initToday) window.initToday();
    if (window.renderNext) window.renderNext();
  } catch (err) {
    console.error("Error procesando entrada:", err);
    alert("No se pudo guardar. Intenta de nuevo.");
  }
}

async function finishEntry(section, entry, targetType, targetId) {
  await fetch(`${API_BASE}/entries/${entry.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "processed", target_type: targetType, target_id: targetId }),
  });
  renderIdle(section);
  if (window.initInbox) window.initInbox();
  if (window.renderGuidanceBanner) window.renderGuidanceBanner();
  if (window.initTasks) window.initTasks();
  if (window.initToday) window.initToday();
  if (window.renderNext) window.renderNext();
}

// Readiness gate: is this action ready to act on?
function renderReadiness(section, entry, text, iso) {
  section.querySelector(".capture-suggest").innerHTML = `
    <div class="capture-suggest-text">💭 ${escapeHtml(text)}</div>
    <div class="capture-suggest-reason">¿Está listo para actuar?</div>
    <div class="capture-types">
      <button class="capture-type" data-ready="yes">Sí, crearlo</button>
      <button class="capture-type" data-ready="verify">Falta algo</button>
      <button class="capture-type" data-ready="split">Es muy grande</button>
    </div>
    <div id="capture-ready-detail"></div>
    <div class="capture-actions" style="margin-top:8px">
      <button class="modal-btn modal-btn-secondary" id="capture-ready-later">Decidir después</button>
    </div>
  `;

  section.querySelector("#capture-ready-later")?.addEventListener("click", () => {
    // Entry is already safe in inbox: just go back to idle
    renderIdle(section);
    if (window.initInbox) window.initInbox();
  });

  section.querySelectorAll("[data-ready]").forEach(btn => {
    btn.addEventListener("click", () => {
      section.querySelectorAll("[data-ready]").forEach(b =>
        b.classList.toggle("active", b === btn));
      const detail = section.querySelector("#capture-ready-detail");
      const kind = btn.dataset.ready;
      if (kind === "yes") {
        detail.innerHTML = "";
        createReadyAction(section, entry, text, iso);
      } else if (kind === "verify") {
        detail.innerHTML = `
          <div class="form-group" style="margin-top:8px">
            <input type="text" id="capture-ready-input" placeholder="¿Qué hay que verificar?">
          </div>
          <div class="capture-actions">
            <button class="modal-btn modal-btn-primary" id="capture-ready-save">Crear verificación</button>
          </div>
        `;
        const input = detail.querySelector("#capture-ready-input");
        input?.focus();
        detail.querySelector("#capture-ready-save")?.addEventListener("click", () =>
          createVerifyAction(section, entry, text, input?.value.trim()));
      } else if (kind === "split") {
        detail.innerHTML = `
          <div class="form-group" style="margin-top:8px">
            <input type="text" id="capture-ready-input" placeholder="¿Cuál sería el primer paso físico?">
          </div>
          <div class="capture-actions">
            <button class="modal-btn modal-btn-primary" id="capture-ready-save">Crear con primer paso</button>
          </div>
        `;
        const input = detail.querySelector("#capture-ready-input");
        input?.focus();
        detail.querySelector("#capture-ready-save")?.addEventListener("click", () =>
          createSplitAction(section, entry, text, iso, input?.value.trim()));
      }
    });
  });
}

async function createReadyAction(section, entry, text, iso) {
  try {
    const task = await postJson("/api/tasks", { title: text, scheduled_datetime: iso });
    await finishEntry(section, entry, "action", task.id);
  } catch (err) {
    console.error("Error creando acción:", err);
    alert("No se pudo guardar. Intenta de nuevo.");
  }
}

async function createVerifyAction(section, entry, text, what) {
  if (!what) return;
  try {
    // Parent action stays dateless: no pressure until resolved
    const parent = await postJson("/api/tasks", { title: text });
    const child = await postJson("/api/tasks", {
      title: `Verificar: ${what}`,
      description: `Para: ${text}\nObjetivo: comprobar el dato, no dominar todo el tema.`,
      estimated_minutes: 10,
    });
    const { linkChildToParent } = await import("./focusMode.js");
    linkChildToParent(child.id, parent.id, "verify");
    await finishEntry(section, entry, "action", parent.id);
  } catch (err) {
    console.error("Error creando verificación:", err);
    alert("No se pudo guardar. Intenta de nuevo.");
  }
}

async function createSplitAction(section, entry, text, iso, firstStep) {
  if (!firstStep) return;
  try {
    const task = await postJson("/api/tasks", {
      title: text,
      scheduled_datetime: iso,
      first_step: firstStep,
    });
    await finishEntry(section, entry, "action", task.id);
  } catch (err) {
    console.error("Error creando acción:", err);
    alert("No se pudo guardar. Intenta de nuevo.");
  }
}

async function postJson(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

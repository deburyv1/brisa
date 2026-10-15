/* ============================================
   BRISA - Capture Module
   Fast inbox capture with reversible suggestion
   ============================================ */
import { suggestType, TYPE_LABELS } from "./suggest.js";
import { createEditor, editorHTML, htmlWithLightImages, plainText, renderRich } from "./richtext.js";

const API_BASE = "/api";
const TYPES = ["action", "event", "note", "idea", "reminder", "purchase"];

let pendingEntry = null;
let selectedType = null;
// Rich HTML waiting to be captured (quick input shows its plain version)
let pendingHTML = null;

function needsDate(type) {
  return type === "action" || type === "event" || type === "reminder";
}

export function initCapture() {
  const section = document.querySelector("#capture-section");
  if (!section) return;

  renderIdle(section);

  // Click on the dimmed backdrop closes the editor (asks first if dirty)
  document.querySelector("#editor-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "editor-modal") document.querySelector("#editor-cancel")?.click();
  });
}

export async function loadEntryIntoCapture(entryId) {
  const section = document.querySelector("#capture-section");
  if (!section) return;
  try {
    const entries = await fetch(`${API_BASE}/entries?status=inbox`).then(r => r.json());
    const entry = entries.find(e => e.id == entryId);
    if (!entry) return;
    pendingEntry = entry;
    selectedType = entry.suggested_type || suggestType(plainText(entry.raw_text)).type;
    renderSuggestion(section, entry);
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
      <input id="capture-input" class="capture-input" type="text"
        placeholder="¿Qué tienes en mente?" autocomplete="off" maxlength="255">
      <button class="capture-expand" id="capture-expand" title="Escribir más elaborado (Ctrl+E)">⤢</button>
      <button class="capture-btn" id="capture-save">Guardar</button>
    </div>
  `;
  const input = section.querySelector("#capture-input");
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      capture(section);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      openEditor(section);
    }
  });
  section.querySelector("#capture-expand")?.addEventListener("click", () => openEditor(section));
  section.querySelector("#capture-save")?.addEventListener("click", () => capture(section));
}

// ---- Elaborate editor (modal) ----

function openEditor(section) {
  const overlay = document.querySelector("#editor-modal");
  const holder = document.querySelector("#editor-text");
  const count = document.querySelector("#editor-count");
  if (!overlay || !holder) return;
  const quill = createEditor(holder, {
    placeholder: "Desarróllalo acá, sin apuro. Ctrl+Enter para guardar.",
  });
  if (!quill) return;
  const quick = section.querySelector("#capture-input")?.value || "";
  if (quick && !quill.getText().trim()) quill.setText(quick);
  const update = () => {
    const words = quill.getText().trim().split(/\s+/).filter(Boolean).length;
    if (count) count.textContent = words > 1 ? `${words} palabras` : "";
  };
  quill.off("text-change", update);
  quill.on("text-change", update);
  update();
  overlay.classList.add("active");
  quill.focus();
  quill.keyboard.addBinding({ key: "Enter", ctrlKey: true, handler: () => {
    document.querySelector("#editor-save")?.click();
  }});
  quill.keyboard.addBinding({ key: "Escape", handler: () => {
    document.querySelector("#editor-cancel")?.click();
  }});

  const save = async () => {
    const html = editorHTML(quill);
    if (!html) {
      closeEditor();
      return;
    }
    const input = section.querySelector("#capture-input");
    if (input) input.value = plainText(html).slice(0, 255);
    pendingHTML = await htmlWithLightImages(html);
    // Only clear the editor once the entry is safe: on failure
    // the text (and photos) stay put for a retry.
    const ok = await capture(section);
    if (ok) {
      quill.setText("");
      closeEditor();
    }
  };
  document.querySelector("#editor-save").onclick = save;
  const cancel = () => {
    if (quill.getText().trim() && !confirm("¿Descartar este texto?")) return;
    quill.setText("");
    closeEditor();
  };
  document.querySelector("#editor-cancel").onclick = cancel;
  document.querySelector("#editor-close").onclick = cancel;
}

function closeEditor() {
  document.querySelector("#editor-modal")?.classList.remove("active");
  document.querySelector("#capture-input")?.focus();
}

async function capture(section) {
  const input = section.querySelector("#capture-input");
  const raw = (pendingHTML || input?.value || "").trim();
  pendingHTML = null;
  if (!raw) return;
  const plain = plainText(raw);

  const saveBtn = section.querySelector("#capture-save");
  if (saveBtn) saveBtn.disabled = true;
  try {
    const suggestion = suggestType(plain);
    const res = await fetch(`${API_BASE}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw_text: raw, suggested_type: suggestion.type }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pendingEntry = await res.json();
    selectedType = suggestion.type;
    renderSuggestion(section, pendingEntry);
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

async function findSimilar(text, excludeId = null) {
  const needle = norm(plainText(text));
  if (needle.length < 4) return null;
  try {
    const [tasksRes, entriesRes] = await Promise.all([
      fetch(`${API_BASE}/tasks`).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/entries?status=inbox`).then(r => r.ok ? r.json() : []),
    ]);
    const hay = [
      ...tasksRes.filter(t => !t.is_completed).map(t => ({ kind: "tarea", title: plainText(t.title) })),
      ...entriesRes
        .filter(e => String(e.id) !== String(excludeId))
        .map(e => ({ kind: "inbox", title: plainText(e.raw_text) })),
    ];
    return hay.find(h => {
      const hayN = norm(h.title);
      return hayN && hayN.length >= 4 && (hayN.includes(needle) || needle.includes(hayN));
    }) || null;
  } catch {
    return null;
  }
}

function renderSuggestion(section, entry) {
  section.innerHTML = `
    <div class="capture-suggest">
      <div class="capture-suggest-text"><span class="capture-suggest-icon">💭</span><div class="md">${renderRich(entry.raw_text)}</div></div>
      <div class="capture-similar" id="capture-similar" style="display:none"></div>
      <div class="capture-types">
        ${TYPES.map(t => `
          <button class="capture-type ${t === selectedType ? "active" : ""}" data-type="${t}">${TYPE_LABELS[t]}</button>
        `).join("")}
      </div>
      <div class="capture-when" ${needsDate(selectedType) ? "" : 'style="display:none"'}>
        <button class="capture-when-btn" data-when="today">Hoy</button>
        <button class="capture-when-btn" data-when="later">Después</button>
        <input type="date" id="capture-date" class="capture-datetime" title="Día (opcional)">
        <input type="time" id="capture-time" class="capture-datetime" title="Hora (opcional)">
        <label class="capture-extreme" id="capture-extreme-row" ${selectedType === "reminder" ? "" : 'style="display:none"'} title="Al llegar la hora: pantalla completa + sonido hasta que lo veas">
          <input type="checkbox" id="capture-extreme"> Extrema
        </label>
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
      const extremeRow = section.querySelector("#capture-extreme-row");
      if (extremeRow) extremeRow.style.display = selectedType === "reminder" ? "" : "none";
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

  findSimilar(entry.raw_text, entry.id).then(sim => {
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

function dateFor(when, dateValue, timeValue) {
  const now = new Date();
  if (when === "today") {
    now.setHours(23, 59, 0, 0);
    return now;
  }
  if (dateValue) {
    // Date without time → end of that day, so "just the day" still notifies
    const [y, m, d] = dateValue.split("-").map(Number);
    const at = new Date(y, (m || 1) - 1, d || 1);
    if (timeValue) {
      const [hh, mm] = timeValue.split(":").map(Number);
      at.setHours(hh || 0, mm || 0, 0, 0);
    } else {
      at.setHours(23, 59, 0, 0);
    }
    return at;
  }
  return null;
}

async function confirmEntry(section, entry) {
  const whenBtn = section.querySelector(".capture-when-btn.selected");
  const dateValue = section.querySelector("#capture-date")?.value;
  const timeValue = section.querySelector("#capture-time")?.value;
  const when = whenBtn?.dataset.when;
  const extreme = section.querySelector("#capture-extreme")?.checked || false;
  const at = dateFor(when, dateValue, timeValue);
  const iso = at ? at.toISOString() : null;
  // Titles are always plain text (one line, no tags); the full
  // rich content only survives into notes.
  const rich = entry.raw_text;
  const text = plainText(rich).slice(0, 255) || rich;

  // Actions pass through the readiness gate first
  if (selectedType === "action") {
    renderReadiness(section, entry, text, iso);
    return true;
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
        content: rich,
      });
      targetId = note.id;
    } else if (selectedType === "idea") {
      const idea = await postJson("/api/ideas", { title: text, entry_id: entry.id });
      targetId = idea.id;
    } else if (selectedType === "reminder") {
      const rem = await postJson("/api/reminders", {
        title: text, remind_at: iso, entry_id: entry.id, extreme,
      });
      targetId = rem.id;
    } else if (selectedType === "purchase") {
      const item = text.replace(/^(comprar|cómprame|comprame)\s+/i, "").trim() || text;
      const shop = await postJson("/api/shopping", { description: item });
      targetId = shop.id;
    }

    await fetch(`${API_BASE}/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "processed", target_type: targetType, target_id: targetId }),
    });

    renderIdle(section);
    if (window.initInbox) window.initInbox();
    // Tasks first (refreshes state.tasks), then everything that reads it
    if (window.initTasks) await window.initTasks();
    if (window.initToday) window.initToday();
    if (window.initWeek) window.initWeek();
    if (window.initCalendar) window.initCalendar();
    if (window.initJournal) window.initJournal();
    if (window.initIdeas) window.initIdeas();
    if (window.initShopping) window.initShopping();
    if (window.renderNext) window.renderNext();
    return true;
  } catch (err) {
    console.error("Error procesando entrada:", err);
    alert("No se pudo guardar. Intenta de nuevo.");
    return false;
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
  // Tasks first (refreshes state.tasks), then everything that reads it
  if (window.initTasks) await window.initTasks();
  if (window.initToday) window.initToday();
  if (window.initWeek) window.initWeek();
  if (window.initCalendar) window.initCalendar();
  if (window.initJournal) window.initJournal();
  if (window.initIdeas) window.initIdeas();
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

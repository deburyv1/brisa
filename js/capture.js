/* ============================================
   BRISA - Capture Module
   Fast inbox capture with reversible suggestion
   ============================================ */
import { suggestType, TYPE_LABELS } from "./suggest.js";
import { createEditor, editorHTML, htmlWithLightImages, plainText, renderRich } from "./richtext.js";
import { renderMarkdown } from "./markdown.js";

const API_BASE = "/api";
const TYPES = ["action", "event", "note", "pensamiento", "idea", "reminder", "purchase"];
// "Ya está hecho" solo tiene sentido para lo que se completa: una acción,
// un recordatorio o una compra. Una idea no se "hace": se piensa.
const DONE_TYPES = ["action", "reminder", "purchase"];

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
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
      && input.value.length >= (Number(input.maxLength) > 0 ? Number(input.maxLength) : 255)) {
      // Ya está al tope: la letra sigue en el editor, no se pierde.
      e.preventDefault();
      openEditor(section, input.value);
    }
  });
  // Al tope del input el texto no se corta: sigue en el editor,
  // ya formateado, sin perder lo que venías escribiendo.
  const MAX = Number(input?.maxLength) > 0 ? Number(input.maxLength) : 255;
  input?.addEventListener("input", () => {
    if (input.value.length >= MAX) openEditor(section, input.value);
  });
  input?.addEventListener("paste", (e) => {
    const pasted = e.clipboardData?.getData("text") || "";
    if (!pasted) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const full = input.value.slice(0, start) + pasted + input.value.slice(end);
    if (full.length > MAX) {
      e.preventDefault();
      openEditor(section, full);
    }
  });
  section.querySelector("#capture-expand")?.addEventListener("click", () => openEditor(section));
  section.querySelector("#capture-save")?.addEventListener("click", () => capture(section));
}

// ---- Elaborate editor (modal) ----

function openEditor(section, initialText = "") {
  const overlay = document.querySelector("#editor-modal");
  const holder = document.querySelector("#editor-text");
  const count = document.querySelector("#editor-count");
  if (!overlay || !holder || overlay.classList.contains("active")) return;
  const quill = createEditor(holder, {
    placeholder: "Desarróllalo acá, sin apuro. Ctrl+Enter para guardar.",
  });
  if (!quill) return;
  if (!quill.getText().trim()) {
    const quick = String(initialText || section.querySelector("#capture-input")?.value || "");
    if (pendingHTML) quill.clipboard.dangerouslyPasteHTML(pendingHTML);
    else if (quick.trim()) quill.clipboard.dangerouslyPasteHTML(formatQuickText(quick));
  }
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

// Texto que ya no cabe en el input: entra al editor con formato, sin
// cambiarle una palabra. Se aplican las marcas que escribiste y, si es
// un bloque largo sin saltos de línea, se le da aire entre frases.
function formatQuickText(text) {
  let clean = String(text || "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return "";
  if (!clean.includes("\n") && clean.length > 220) {
    clean = clean.replace(/([.!?…])\s+/g, "$1\n\n");
  }
  return renderMarkdown(clean);
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
    return true;
  } catch (err) {
    console.error("Error capturando:", err);
    alert("No se pudo guardar. Intenta de nuevo.");
    return false;
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
        <button class="modal-btn modal-btn-secondary" id="capture-done" title="Ya está hecho">Hecho ✓</button>
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
      const doneBtn = section.querySelector("#capture-done");
      if (doneBtn) doneBtn.style.display = DONE_TYPES.includes(selectedType) ? "" : "none";
    });
  });

  section.querySelectorAll(".capture-when-btn").forEach(b =>
    b.addEventListener("click", () => {
      section.querySelectorAll(".capture-when-btn").forEach(x =>
        x.classList.toggle("selected", x === b));
      const dateInput = section.querySelector("#capture-date");
      if (b.dataset.when === "today" && dateInput && !dateInput.value) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        window.setPickerValue(dateInput, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
      }
    }));

  section.querySelector("#capture-discard")?.addEventListener("click", async () => {
    try {
      await fetch(`${API_BASE}/entries/${entry.id}`, { method: "DELETE" });
    } catch (e) {
      console.error("Error descartando:", e);
    }
    renderIdle(section);
    if (window.initInbox) await window.initInbox();
    if (window.renderGuidanceBanner) window.renderGuidanceBanner();
  });

  section.querySelector("#capture-confirm")?.addEventListener("click", () => confirmEntry(section, entry));
  const doneBtn = section.querySelector("#capture-done");
  if (doneBtn) {
    doneBtn.style.display = DONE_TYPES.includes(selectedType) ? "" : "none";
    doneBtn.addEventListener("click", () => confirmDone(section, entry));
  }

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

  // La acción se crea de una. Lo de "¿está listo para actuar?" (verificar,
  // partir en un primer paso) vive en Enfoque, que es donde de verdad actúas.
  try {
    let targetType = selectedType;
    let targetId = null;

    if (selectedType === "action") {
      const task = await postJson("/api/tasks", { title: text, scheduled_datetime: iso });
      targetId = task.id;
    } else if (selectedType === "event") {
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
    } else if (selectedType === "pensamiento") {
      // Mismo diario que las notas, pero separado: es algo que pensaste,
      // no algo que tienes que hacer.
      const thought = await postJson("/api/journal", {
        title: text.length > 60 ? text.slice(0, 60) + "…" : text,
        content: rich,
        kind: "pensamiento",
      });
      targetId = thought.id;
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

// "Ya está hecho": creates the target already completed.
async function confirmDone(section, entry) {
  const text = plainText(entry.raw_text).slice(0, 255) || entry.raw_text;
  const now = new Date().toISOString();
  try {
    let targetType = selectedType;
    let targetId = null;
    if (selectedType === "action") {
      const t = await postJson("/api/tasks", { title: text });
      await fetch(`${API_BASE}/tasks/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_completed: true, completed_at: now }),
      });
      targetId = t.id;
    } else if (selectedType === "reminder") {
      const rem = await postJson("/api/reminders", { title: text, remind_at: now, entry_id: entry.id });
      await fetch(`${API_BASE}/reminders/${rem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
      targetId = rem.id;
    } else if (selectedType === "purchase") {
      const item = text.replace(/^(comprar|cómprame|comprame)\s+/i, "").trim() || text;
      const shop = await postJson("/api/shopping", { description: item });
      await fetch(`${API_BASE}/shopping/${shop.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_purchased: true }),
      });
      targetId = shop.id;
    } else {
      return;
    }
    await finishEntry(section, entry, targetType, targetId);
  } catch (err) {
    console.error("Error marcando hecho:", err);
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
  // Tasks first (refreshes state.tasks), then everything that reads it
  if (window.initTasks) await window.initTasks();
  if (window.initToday) window.initToday();
  if (window.initWeek) window.initWeek();
  if (window.initCalendar) window.initCalendar();
  if (window.initJournal) window.initJournal();
  if (window.initIdeas) window.initIdeas();
  if (window.renderNext) window.renderNext();
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

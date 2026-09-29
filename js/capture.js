/* ============================================
   BRISA - Capture Module
   Fast inbox capture with reversible suggestion
   ============================================ */
import { suggestType, TYPE_LABELS } from "./suggest.js";

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

  section.querySelector("#capture-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      capture(section);
    }
  });

  section.querySelector("#capture-save")?.addEventListener("click", () => capture(section));
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
      <input id="capture-input" class="capture-input" type="text"
        placeholder="¿Qué tienes en mente?" autocomplete="off" maxlength="255">
      <button class="capture-btn" id="capture-save">Guardar</button>
    </div>
  `;
  section.querySelector("#capture-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      capture(section);
    }
  });
  section.querySelector("#capture-save")?.addEventListener("click", () => capture(section));
}

async function capture(section) {
  const input = section.querySelector("#capture-input");
  const text = input?.value.trim();
  if (!text) return;

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
  } catch (err) {
    console.error("Error capturando:", err);
    alert("No se pudo guardar. Intenta de nuevo.");
  }
}

function renderSuggestion(section, entry, reason) {
  section.innerHTML = `
    <div class="capture-suggest">
      <div class="capture-suggest-text">💭 ${escapeHtml(entry.raw_text)}</div>
      <div class="capture-suggest-reason">${escapeHtml(reason)}</div>
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
  });

  section.querySelector("#capture-confirm")?.addEventListener("click", () => confirmEntry(section, entry));
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

  try {
    let targetType = selectedType;
    let targetId = null;

    if (selectedType === "action") {
      const task = await postJson("/api/tasks", {
        title: text,
        scheduled_datetime: iso,
      });
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
  } catch (err) {
    console.error("Error procesando entrada:", err);
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

/* ============================================
   BRISA - Journal Module
   CRUD for notes via /api/journal
   Dos clases de escrito en el mismo diario:
   notas (lo que anotas) y pensamientos (lo que piensas).
   ============================================ */
import { state } from "./state.js";
import { renderRich } from "./richtext.js";

const API_BASE = "/api";
const KINDS = {
  nota: {
    label: "Notas",
    empty: "Todavía no tienes notas.<br>Escribe la primera para empezar.",
    emptySearch: "Sin notas para esa búsqueda.",
  },
  pensamiento: {
    label: "Pensamientos",
    empty: "Todavía no tienes pensamientos.<br>Cuando algo te dé vueltas, captúralo y elige Pensamiento.",
    emptySearch: "Sin pensamientos para esa búsqueda.",
  },
};

// Pestaña activa: se recuerda mientras navegas (initJournal se llama seguido).
let currentKind = "nota";

const kindOf = (row) => (row.kind === "pensamiento" ? "pensamiento" : "nota");

async function fetchNotes() {
  try {
    const res = await fetch(`${API_BASE}/journal`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar notas:", e);
    return null;
  }
}

async function deleteNote(id) {
  const res = await fetch(`${API_BASE}/journal/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function formatNoteDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function updateBadge(rows) {
  const badge = document.querySelector('.nav[data-nav="journal"] i');
  if (badge) badge.textContent = rows ? rows.length : 0;
}

export async function initJournal() {
  const section = document.querySelector("#journal-section");
  if (!section) return;

  const rows = await fetchNotes();
  state.journal = rows || [];
  updateBadge(rows);

  if (!rows) {
    section.innerHTML = `
      <div class="journal-empty">
        <div class="journal-empty-icon">⚠️</div>
        <div class="journal-empty-text">No se pudo conectar con el servidor.<br>Revisa que el backend esté corriendo e intenta de nuevo.</div>
        <button class="journal-empty-btn" id="retry-notes">Reintentar</button>
      </div>
    `;
    section.querySelector("#retry-notes")?.addEventListener("click", () => {
      if (window.initJournal) window.initJournal();
    });
    return;
  }

  renderJournal(section, rows);
}

function renderJournal(section, rows, query = "") {
  const counts = { nota: 0, pensamiento: 0 };
  rows.forEach(r => { counts[kindOf(r)]++; });
  const visible = rows.filter(r => kindOf(r) === currentKind);
  const info = KINDS[currentKind];

  section.innerHTML = `
    <div class="journal-header">
      <div class="journal-title">Diario</div>
      <div class="journal-tools">
        <input type="search" id="journal-search" class="journal-search" placeholder="Buscar en el diario…" value="${escapeHtml(query)}" autocomplete="off">
        <button class="journal-add-btn" id="add-note">+ Nueva</button>
      </div>
    </div>
    <div class="journal-tabs">
      ${Object.entries(KINDS).map(([k, v]) => `
        <button class="journal-tab ${k === currentKind ? "active" : ""}" data-kind="${k}">
          ${v.label}<i>${counts[k]}</i>
        </button>
      `).join("")}
    </div>
    <div class="journal-list">
      ${visible.length === 0
        ? `<div class="journal-empty-note">${query ? info.emptySearch : info.empty}</div>`
        : visible.map(noteCard).join("")}
    </div>
  `;

  section.querySelectorAll(".journal-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      if (tab.dataset.kind === currentKind) return;
      currentKind = tab.dataset.kind;
      renderJournal(section, rows);
    });
  });

  section.querySelector("#add-note")?.addEventListener("click", () => {
    if (window.openJournalModal) window.openJournalModal(null, currentKind);
  });

  const searchInput = section.querySelector("#journal-search");
  let debounce = null;
  searchInput?.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = searchInput.value.trim();
      if (!q) {
        renderJournal(section, rows);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/journal/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        renderJournal(section, await res.json(), q);
        const el = section.querySelector("#journal-search");
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      } catch (e) {
        console.warn("No se pudo buscar:", e);
      }
    }, 300);
  });

  section.querySelectorAll(".note-card").forEach(card => {
    const id = card.dataset.noteId;

    card.addEventListener("click", (e) => {
      if (e.target.closest('[data-action="delete"]')) return;
      if (window.openJournalModal) window.openJournalModal(id);
    });

    card.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteNote(id);
      if (window.initJournal) window.initJournal();
    });
  });
}

function noteCard(n) {
  return `
    <div class="note-card" data-note-id="${n.id}" data-action="edit">
      <div class="note-card-top">
        <div class="note-title">${escapeHtml(n.title)}</div>
        <div class="note-date">${formatNoteDate(n.updated_at || n.created_at)}</div>
      </div>
      <div class="note-preview md">${renderRich(n.content || "Sin contenido")}</div>
      <div class="note-card-foot">
        <div class="note-mood">${n.mood ? `· ${escapeHtml(n.mood)}` : ""}</div>
        <button class="note-delete" data-action="delete">Eliminar</button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

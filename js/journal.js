/* ============================================
   BRISA - Journal Module
   CRUD for notes via /api/journal
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";

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

function updateBadge(notes) {
  const badge = document.querySelector('.nav[data-nav="journal"] i');
  if (badge) badge.textContent = notes ? notes.length : 0;
}

export async function initJournal() {
  const section = document.querySelector("#journal-section");
  if (!section) return;

  const notes = await fetchNotes();
  state.journal = notes || [];
  updateBadge(notes);

  if (!notes) {
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

  if (notes.length === 0) {
    section.innerHTML = `
      <div class="journal-empty">
        <div class="journal-empty-icon">📝</div>
        <div class="journal-empty-text">Todavía no tienes notas.<br>Escribe la primera para empezar.</div>
        <button class="journal-empty-btn" id="add-first-note">+ Nueva nota</button>
      </div>
    `;
    const btn = section.querySelector("#add-first-note");
    if (btn) {
      btn.addEventListener("click", () => {
        if (window.openJournalModal) window.openJournalModal();
      });
    }
    return;
  }

  renderNotes(section, notes);
}

function renderNotes(section, notes) {
  section.innerHTML = `
    <div class="journal-header">
      <div class="journal-title">Notas</div>
      <button class="journal-add-btn" id="add-note">+ Nueva</button>
    </div>
    <div class="journal-list">
      ${notes.map(n => `
        <div class="note-card" data-note-id="${n.id}" data-action="edit">
          <div class="note-card-top">
            <div class="note-title">${escapeHtml(n.title)}</div>
            <div class="note-date">${formatNoteDate(n.updated_at || n.created_at)}</div>
          </div>
          <p class="note-preview md">${renderMarkdown(n.content || "Sin contenido")}</p>
          <div class="note-card-foot">
            <div class="note-mood">${n.mood ? `· ${escapeHtml(n.mood)}` : ""}</div>
            <button class="note-delete" data-action="delete">Eliminar</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  const addBtn = section.querySelector("#add-note");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (window.openJournalModal) window.openJournalModal();
    });
  }

  section.querySelectorAll(".note-card").forEach(card => {
    const id = card.dataset.noteId;

    card.addEventListener("click", (e) => {
      if (e.target.closest('[data-action="delete"]')) return;
      if (window.openJournalModal) window.openJournalModal(id);
    });

    card.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("¿Eliminar esta nota?")) {
        await deleteNote(id);
        if (window.initJournal) window.initJournal();
      }
    });
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

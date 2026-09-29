/* ============================================
   BRISA - Journal Modal Module
   Handles note creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard } from "./modalGuard.js";

export function initJournalModal() {
  const overlay = document.querySelector("#journal-modal");
  const closeBtn = document.querySelector("#journal-modal-close");
  const cancelBtn = document.querySelector("#journal-modal-cancel");
  const form = document.querySelector("#journal-form");
  const titleEl = document.querySelector("#journal-modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form || !titleEl) return;

  let editingId = null;
  let cleanSnapshot = null;

  function open(noteId = null) {
    editingId = noteId;
    form.reset();

    if (noteId) {
      titleEl.textContent = "Editar nota";
      fetch(`${API_BASE}/journal/${noteId}`)
        .then(r => r.json())
        .then(note => {
          form.title.value = note.title || "";
          form.content.value = note.content || "";
          form.mood.value = note.mood || "";
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => console.error("Error cargando nota:", e));
    } else {
      titleEl.textContent = "Nueva nota";
      cleanSnapshot = snapshotForm(form);
    }

    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='title']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    overlay.classList.remove("active");
    form.reset();
    editingId = null;
  }

  function tryClose() {
    if (isDirty(form, cleanSnapshot) && !confirmDiscard()) return;
    close();
  }

  closeBtn.addEventListener("click", tryClose);
  cancelBtn.addEventListener("click", tryClose);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) tryClose();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) tryClose();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.title || !data.title.trim()) return;

    try {
      if (editingId) {
        await fetch(`${API_BASE}/journal/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      } else {
        await fetch(`${API_BASE}/journal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      }
      close();
      if (window.initJournal) window.initJournal();
    } catch (err) {
      console.error("Error guardando nota:", err);
      alert("No se pudo guardar. Intentá de nuevo.");
    }
  });

  window.openJournalModal = open;
}

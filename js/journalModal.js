/* ============================================
   BRISA - Journal Modal Module
   Handles note creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard } from "./modalGuard.js";
import { createEditor, editorHTML, isHTML, sanitizeHTML } from "./richtext.js";
import { renderMarkdown } from "./markdown.js";

export function initJournalModal() {
  const overlay = document.querySelector("#journal-modal");
  const closeBtn = document.querySelector("#journal-modal-close");
  const cancelBtn = document.querySelector("#journal-modal-cancel");
  const form = document.querySelector("#journal-form");
  const titleEl = document.querySelector("#journal-modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form || !titleEl) return;

  // Rich editor for the content field (hidden textarea keeps
  // FormData + dirty-guard working untouched)
  const contentField = form.querySelector("textarea[name='content']");
  const quill = createEditor(document.querySelector("#journal-quill"), {
    placeholder: "Escribe lo que quieras recordar...",
  });
  if (quill && contentField) {
    quill.on("text-change", () => {
      contentField.value = editorHTML(quill);
    });
    quill.keyboard.addBinding({ key: "Enter", ctrlKey: true, handler: () => {
      form.requestSubmit();
    }});
  }

  function fillContent(htmlOrMd) {
    if (!quill || !contentField) return;
    const src = isHTML(htmlOrMd) ? htmlOrMd : renderMarkdown(htmlOrMd || "");
    // clipboard.convert normalizes synchronously, so the hidden
    // field matches the snapshot taken right after
    quill.setContents(quill.clipboard.convert(src));
    contentField.value = editorHTML(quill);
  }

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
          form.mood.value = note.mood || "";
          fillContent(note.content || "");
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => console.error("Error cargando nota:", e));
    } else {
      titleEl.textContent = "Nueva nota";
      fillContent("");
      cleanSnapshot = snapshotForm(form);
    }

    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='title']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    overlay.classList.remove("active");
    form.reset();
    if (quill) quill.setText("");
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
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });

  window.openJournalModal = open;
}

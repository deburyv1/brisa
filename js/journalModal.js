/* ============================================
   BRISA - Journal Modal Module
   Handles note creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard, setFormFeedback, setFormBusy, setFormLoading, isFormSaving } from "./modalGuard.js";
import { createEditor, editorHTML, htmlWithLightImages, isHTML, sanitizeHTML } from "./richtext.js?v=20261021rtl9";
import { renderMarkdown } from "./markdown.js";

export function initJournalModal() {
  const overlay = document.querySelector("#journal-modal");
  const closeBtn = document.querySelector("#journal-modal-close");
  const cancelBtn = document.querySelector("#journal-modal-cancel");
  const form = document.querySelector("#journal-form");
  const titleEl = document.querySelector("#journal-modal-title");
  const expandBtn = document.querySelector("#journal-modal-expand");
  const card = overlay.querySelector(".modal");

  // Wide page mode (remembered between notes)
  const WIDE_KEY = "brisa.noteWide";
  function setWide(wide) {
    card?.classList.toggle("modal-page", wide);
    if (expandBtn) {
      expandBtn.textContent = wide ? "⤡" : "⤢";
      expandBtn.title = wide ? "Volver a tamaño normal" : "Zona de escritura amplia";
    }
    try {
      localStorage.setItem(WIDE_KEY, wide ? "1" : "0");
    } catch {
      // ignore
    }
  }
  let wideDefault = false;
  try {
    wideDefault = localStorage.getItem(WIDE_KEY) === "1";
  } catch {
    wideDefault = false;
  }
  setWide(wideDefault);
  expandBtn?.addEventListener("click", () => setWide(!card?.classList.contains("modal-page")));

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
  let editingKind = "nota";
  let cleanSnapshot = null;
  let loadGeneration = 0;

  function open(noteId = null, kind = "nota") {
    const generation = ++loadGeneration;
    editingId = noteId;
    editingKind = kind === "pensamiento" ? "pensamiento" : "nota";
    form.reset();
    setFormFeedback(form, "");

    if (noteId) {
      titleEl.textContent = "Editar escrito";
      setFormLoading(form, true);
      quill?.enable(false);
      cleanSnapshot = null;
      fetch(`${API_BASE}/journal/${noteId}`)
        .then(r => {
          if (!r.ok) throw new Error("No se pudo cargar este escrito.");
          return r.json();
        })
        .then(note => {
          if (generation !== loadGeneration) return;
          editingKind = note.kind === "pensamiento" ? "pensamiento" : "nota";
          titleEl.textContent = editingKind === "pensamiento" ? "Editar pensamiento" : "Editar nota";
          form.title.value = note.title || "";
          form.mood.value = note.mood || "";
          fillContent(note.content || "");
          quill?.enable(true);
          setFormLoading(form, false);
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => {
          if (generation !== loadGeneration) return;
          console.error("Error cargando nota:", e);
          quill?.enable(true);
          setFormLoading(form, false);
          setFormFeedback(form, e.message || "No se pudo cargar. Cierra e inténtalo de nuevo.");
          const submit = form.querySelector("button[type='submit']");
          if (submit) submit.disabled = true;
        });
    } else {
      titleEl.textContent = editingKind === "pensamiento" ? "Nuevo pensamiento" : "Nueva nota";
      fillContent("");
      quill?.enable(true);
      setFormBusy(form, false);
      cleanSnapshot = snapshotForm(form);
    }

    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='title']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    loadGeneration++;
    overlay.classList.remove("active");
    setFormBusy(form, false);
    setFormFeedback(form, "");
    form.reset();
    if (quill) quill.setText("");
    editingId = null;
    editingKind = "nota";
  }

  function tryClose() {
    if (isFormSaving(form)) return;
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

    if (!data.title || !data.title.trim()) {
      setFormFeedback(form, "Escribe un título para guardar.");
      form.title.focus();
      return;
    }

    data.kind = editingKind;
    setFormFeedback(form, "");
    setFormBusy(form, true);

    try {
      data.content = await htmlWithLightImages(data.content || "");
      if (editingId) {
        const res = await fetch(`${API_BASE}/journal/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("No se pudo guardar el escrito. Intenta de nuevo.");
      } else {
        const res = await fetch(`${API_BASE}/journal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("No se pudo guardar el escrito. Intenta de nuevo.");
      }
      close();
      if (window.initJournal) window.initJournal();
    } catch (err) {
      console.error("Error guardando nota:", err);
      setFormFeedback(form, err.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setFormBusy(form, false);
    }
  });

  window.openJournalModal = open;
}

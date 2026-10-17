/* ============================================
   BRISA - Quick Capture Module
   La captura vive en el navbar: se ve siempre,
   en toda vista, sin abrir nada. Anota, guarda y
   vuelve a lo tuyo (o deja que se guarde solo).
   ============================================ */
import { suggestType } from "./suggest.js";

const API_BASE = "/api";
const IDLE_LABEL = "Guardar";

export function initQuickCapture() {
  const form = document.querySelector("#top-capture");
  const input = document.querySelector("#quick-input");
  const saveBtn = document.querySelector("#quick-save");
  if (!form || !input || !saveBtn) return;

  let resetTimer = null;

  // Deja el cursor al final: lo que escribas sigue donde ibas.
  function focusInput(text) {
    if (typeof text === "string" && text) input.value = text;
    input.focus();
    try { input.setSelectionRange(input.value.length, input.value.length); } catch { /* tipo no soportado */ }
  }

  function resetLabel() {
    clearTimeout(resetTimer);
    resetTimer = null;
    saveBtn.textContent = IDLE_LABEL;
    saveBtn.classList.remove("ok");
  }

  async function save() {
    const raw = input.value.trim();
    if (!raw) {
      input.focus();
      return;
    }
    saveBtn.disabled = true;
    try {
      const suggestion = suggestType(raw);
      const res = await fetch(`${API_BASE}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: raw, suggested_type: suggestion.type }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      input.value = "";
      saveBtn.textContent = "✓ Inbox";
      saveBtn.classList.add("ok");
      if (window.initInbox) window.initInbox();
      if (window.renderGuidanceBanner) window.renderGuidanceBanner();
      clearTimeout(resetTimer);
      resetTimer = setTimeout(resetLabel, 1400);
      input.focus();
    } catch (e) {
      console.error("Error en captura rápida:", e);
      saveBtn.textContent = "Reintentar";
    } finally {
      saveBtn.disabled = false;
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    save();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      resetLabel();
      input.blur();
    }
  });

  // La tecla C ya no abre una ventana: trae el foco acá (o a la caja de
  // captura de la portada, si la barra del navbar está oculta ahí).
  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName || "";
    const editing = /INPUT|TEXTAREA|SELECT/.test(tag)
      || document.activeElement?.isContentEditable
      || document.querySelector(".modal-overlay.active");
    if (editing) return;
    if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const bar = document.querySelector("#top-capture");
      if (bar && bar.style.display !== "none") {
        focusInput();
      } else {
        const homeInput = document.querySelector("#capture-input");
        if (homeInput) { homeInput.focus(); homeInput.select(); }
      }
    }
  });

  // Compartir desde el teléfono: si la barra está oculta (portada), el texto
  // cae en la caja de captura de la portada.
  window.openQuickCapture = (text) => {
    const bar = document.querySelector("#top-capture");
    if (bar && bar.style.display !== "none") {
      focusInput(text);
    } else {
      const homeInput = document.querySelector("#capture-input");
      if (homeInput) {
        if (typeof text === "string" && text) homeInput.value = text;
        homeInput.focus();
        try { homeInput.setSelectionRange(homeInput.value.length, homeInput.value.length); } catch { /* */ }
      }
    }
  };
}

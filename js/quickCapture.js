/* ============================================
   BRISA - Quick Capture Module
   One-keystroke inbox capture from anywhere.
   Never steals flow: overlay, save, back to work.
   ============================================ */
import { suggestType } from "./suggest.js";

const API_BASE = "/api";

export function initQuickCapture() {
  if (document.querySelector("#quick-capture")) return;

  const overlay = document.createElement("div");
  overlay.id = "quick-capture";
  overlay.style.display = "none";
  overlay.innerHTML = `
    <div class="quick-card aero-panel">
      <input id="quick-input" placeholder="Anótalo y sigue en lo tuyo…" autocomplete="off" maxlength="500">
      <button id="quick-save" class="modal-btn modal-btn-primary">Guardar</button>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector("#quick-input");
  const saveBtn = overlay.querySelector("#quick-save");

  function open() {
    overlay.style.display = "";
    input.focus();
  }

  function close() {
    overlay.style.display = "none";
    input.value = "";
    saveBtn.textContent = "Guardar";
  }

  async function save() {
    const raw = input.value.trim();
    if (!raw) {
      close();
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
      saveBtn.textContent = "✓ Inbox";
      if (window.initInbox) window.initInbox();
      if (window.renderGuidanceBanner) window.renderGuidanceBanner();
      setTimeout(close, 600);
    } catch (e) {
      console.error("Error en captura rápida:", e);
      saveBtn.textContent = "Reintentar";
    } finally {
      saveBtn.disabled = false;
    }
  }

  document.querySelector("#quick-capture-btn")?.addEventListener("click", () => {
    if (overlay.style.display === "none") open();
    else close();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  saveBtn.addEventListener("click", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      close();
    }
  });

  document.addEventListener("keydown", (e) => {
    const tag = document.activeElement?.tagName || "";
    const editing = /INPUT|TEXTAREA|SELECT/.test(tag)
      || document.activeElement?.isContentEditable
      || document.querySelector(".modal-overlay.active");
    if (editing) return;
    if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      open();
    }
  });

  window.openQuickCapture = open;
}

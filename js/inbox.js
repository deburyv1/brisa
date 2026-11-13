/* ============================================
   BRISA - Inbox Module
   Review unprocessed captures
   ============================================ */
import { TYPE_LABELS } from "./suggest.js";
import { state } from "./state.js";
import { renderRich } from "./richtext.js?v=20261021rtl9";

const API_BASE = "/api";

function showInboxFeedback(section, message = "") {
  let feedback = section.querySelector("[data-inbox-feedback]");
  if (!feedback) {
    feedback = document.createElement("div");
    feedback.dataset.inboxFeedback = "";
    feedback.className = "inbox-feedback";
    feedback.setAttribute("role", "alert");
    section.querySelector(".inbox-header")?.after(feedback);
  }
  feedback.textContent = message;
  feedback.hidden = !message;
}

async function fetchInbox() {
  try {
    const res = await fetch(`${API_BASE}/entries?status=inbox`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudo cargar inbox:", e);
    return null;
  }
}

function updateBadge(entries) {
  const badge = document.querySelector('.nav[data-nav="inbox"] i');
  if (badge) {
    badge.textContent = entries ? entries.length : 0;
    badge.style.display = !entries || entries.length === 0 ? "none" : "";
  }
}

export async function initInbox() {
  const section = document.querySelector("#inbox-section");
  if (!section) return;

  const entries = await fetchInbox();
  state.entries = entries || [];
  updateBadge(entries);
  // Aquí se sincroniza la lista: los avisos deben reflejar este estado,
  // no el que había antes de la llamada (async, sin await).
  if (window.renderGuidanceBanner) window.renderGuidanceBanner();

  if (!entries) {
    section.innerHTML = `
      <div class="inbox-empty">
        <div class="inbox-empty-icon">⚠️</div>
        <div class="inbox-empty-text">No se pudo conectar con el servidor.</div>
      </div>
    `;
    return;
  }

  if (entries.length === 0) {
    section.innerHTML = `
      <div class="inbox-empty">
        <div class="inbox-empty-icon">🌱</div>
        <div class="inbox-empty-text">Inbox en cero.<br>Todo capturado está procesado.</div>
      </div>
    `;
    return;
  }

  section.innerHTML = `
    <div class="inbox-header">
      <div class="inbox-title">Inbox · ${entries.length} sin procesar</div>
    </div>
    <div class="inbox-list">
      ${entries.map(e => `
        <div class="inbox-item" data-entry-id="${e.id}">
          <div class="inbox-info">
            <div class="inbox-text md">${renderRich(e.raw_text)}</div>
            <div class="inbox-meta">Sugerencia: ${TYPE_LABELS[e.suggested_type] || e.suggested_type || "—"}</div>
          </div>
          <div class="inbox-actions">
            <button class="tx-btn tx-btn-edit" data-action="process">Revisar</button>
            <button class="tx-btn tx-btn-archive" data-action="archive" title="Sale del inbox, pero no se borra">Archivar</button>
            <button class="tx-btn tx-btn-delete" data-action="delete" title="Borrar la captura" aria-label="Borrar captura">✕</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  section.querySelectorAll(".inbox-item").forEach(item => {
    const id = item.dataset.entryId;

    item.querySelector('[data-action="process"]')?.addEventListener("click", () => {
      // Go home and load this entry into the capture card
      document.querySelector('.nav[data-nav="home"]')?.click();
      setTimeout(() => {
        if (window.loadEntryIntoCapture) window.loadEntryIntoCapture(id);
      }, 50);
    });

    item.querySelector('[data-action="archive"]')?.addEventListener("click", async () => {
      const button = item.querySelector('[data-action="archive"]');
      button.disabled = true;
      showInboxFeedback(section);
      try {
        const res = await fetch(`${API_BASE}/entries/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        });
        if (!res.ok) throw new Error();
        if (window.initInbox) await window.initInbox();
        if (window.renderGuidanceBanner) window.renderGuidanceBanner();
      } catch {
        button.disabled = false;
        showInboxFeedback(section, "No se pudo archivar esta captura. Sigue en el Inbox; intenta de nuevo.");
      }
    });

    item.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      const button = item.querySelector('[data-action="delete"]');
      button.disabled = true;
      showInboxFeedback(section);
      try {
        const res = await fetch(`${API_BASE}/entries/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        if (window.initInbox) await window.initInbox();
        if (window.renderGuidanceBanner) window.renderGuidanceBanner();
      } catch {
        button.disabled = false;
        showInboxFeedback(section, "No se pudo borrar esta captura. Sigue en el Inbox; intenta de nuevo.");
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

/* ============================================
   BRISA - Ideas Module
   Semillero: ideas live here until one becomes an action.
   ============================================ */

const API_BASE = "/api";

async function fetchIdeas() {
  try {
    const res = await fetch(`${API_BASE}/ideas`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar ideas:", e);
    return null;
  }
}

export async function initIdeas() {
  const section = document.querySelector("#ideas-section");
  if (!section) return;

  const ideas = await fetchIdeas();

  if (!ideas) {
    section.innerHTML = `
      <div class="ideas-empty">
        <div class="journal-empty-text">No se pudo conectar con el servidor.</div>
        <button class="modal-btn modal-btn-secondary" id="ideas-retry">Reintentar</button>
      </div>`;
    section.querySelector("#ideas-retry")?.addEventListener("click", initIdeas);
    return;
  }

  section.innerHTML = `
    <div class="ideas-header">
      <div class="ideas-title">Ideas</div>
      <div class="ideas-sub">Semillero: maduran acá hasta que una se vuelve acción.</div>
    </div>
    <div class="ideas-list">
      ${ideas.length === 0
        ? `<div class="ideas-empty-note">Sin ideas todavía. Clasifica algo como idea desde el inbox.</div>`
        : ideas.map(ideaHtml).join("")}
    </div>
  `;

  section.querySelectorAll(".idea-row").forEach(row => {
    const id = row.dataset.ideaId;
    const title = row.dataset.ideaTitle || "";

    row.querySelector('[data-action="convert"]')?.addEventListener("click", async () => {
      try {
        await fetch(`${API_BASE}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
        await fetch(`${API_BASE}/ideas/${id}`, { method: "DELETE" });
      } catch (e) {
        console.error("Error convirtiendo idea:", e);
      }
      if (window.initIdeas) window.initIdeas();
      if (window.initTasks) window.initTasks();
      if (window.renderNext) window.renderNext();
    });

    row.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      if (!confirm("¿Descartar esta idea?")) return;
      await fetch(`${API_BASE}/ideas/${id}`, { method: "DELETE" });
      if (window.initIdeas) window.initIdeas();
    });
  });
}

function ideaHtml(i) {
  const date = i.created_at
    ? new Date(i.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
    : "";
  return `
  <div class="idea-row" data-idea-id="${i.id}" data-idea-title="${escapeAttr(i.title)}">
    <div class="idea-info">
      <span class="idea-name">💡 ${escapeHtml(i.title)}</span>
      ${date ? `<span class="idea-date">${date}</span>` : ""}
    </div>
    <div class="tx-actions">
      <button class="tx-btn tx-btn-edit" data-action="convert" title="Volverla acción">→ acción</button>
      <button class="tx-btn tx-btn-delete" data-action="delete" title="Descartar">✕</button>
    </div>
  </div>`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, "&#39;");
}

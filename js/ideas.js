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

  const open = ideas.filter(i => i.status !== "done");
  const done = ideas.filter(i => i.status === "done");

  section.innerHTML = `
    <div class="ideas-header">
      <div class="ideas-title">Ideas</div>
      <div class="ideas-sub">Semillero: de aquí nacen acciones, pero la idea queda.</div>
    </div>
    <div class="ideas-list">
      ${open.length === 0
        ? `<div class="ideas-empty-note">Sin ideas abiertas. Clasifica algo como idea desde el inbox.</div>`
        : open.map(i => ideaHtml(i, false)).join("")}
    </div>
    ${done.length > 0 ? `
      <div class="ideas-subtitle">Ya en acción · se pueden devolver</div>
      <div class="ideas-list">
        ${done.map(i => ideaHtml(i, true)).join("")}
      </div>
    ` : ""}
  `;

  section.querySelectorAll(".idea-row").forEach(row => {
    const id = row.dataset.ideaId;
    const title = row.dataset.ideaTitle || "";

    row.querySelector('[data-action="derive"]')?.addEventListener("click", async () => {
      try {
        const task = await fetch(`${API_BASE}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        }).then(r => r.json());
        await fetch(`${API_BASE}/ideas/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done", task_id: task?.id || null }),
        });
      } catch (e) {
        console.error("Error derivando acción:", e);
      }
      if (window.initIdeas) window.initIdeas();
      if (window.initTasks) window.initTasks();
      if (window.renderNext) window.renderNext();
    });

    row.querySelector('[data-action="revert"]')?.addEventListener("click", async () => {
      const taskId = row.dataset.taskId;
      try {
        if (taskId) await fetch(`${API_BASE}/tasks/${taskId}`, { method: "DELETE" });
        await fetch(`${API_BASE}/ideas/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open", task_id: null }),
        });
      } catch (e) {
        console.error("Error devolviendo idea:", e);
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

function ideaHtml(i, isDone) {
  const date = i.created_at
    ? new Date(i.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
    : "";
  return `
  <div class="idea-row ${isDone ? "done" : ""}" data-idea-id="${i.id}" data-idea-title="${escapeAttr(i.title)}" data-task-id="${i.task_id || ""}">
    <div class="idea-info">
      <span class="idea-name">💡 ${escapeHtml(i.title)}</span>
      ${date ? `<span class="idea-date">${date}</span>` : ""}
    </div>
    <div class="tx-actions">
      ${isDone
        ? `<button class="tx-btn tx-btn-edit" data-action="revert" title="Devolver al semillero (borra la tarea)">↩ devolver</button>`
        : `<button class="tx-btn tx-btn-edit" data-action="derive" title="Crear una acción desde esta idea (la idea queda)">→ acción</button>`}
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

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
    <div class="ideas-feedback" id="ideas-feedback" role="alert" hidden></div>
  `;

  const showFeedback = (message) => {
    const el = section.querySelector("#ideas-feedback");
    if (el) { el.textContent = message; el.hidden = !message; }
  };
  const runAction = async (button, action) => {
    button.disabled = true;
    showFeedback("");
    try {
      await action();
      if (window.initIdeas) await window.initIdeas();
      if (window.renderNext) window.renderNext();
    } catch (e) {
      button.disabled = false;
      showFeedback(e.message || "No se pudo guardar el cambio. Intenta de nuevo.");
    }
  };

  section.querySelectorAll(".idea-row").forEach(row => {
    const id = row.dataset.ideaId;
    const title = row.dataset.ideaTitle || "";

    row.querySelector('[data-action="derive"]')?.addEventListener("click", async (e) => {
      const button = e.currentTarget;
      await runAction(button, async () => {
        let taskId = null;
        try {
          const taskRes = await fetch(`${API_BASE}/tasks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
          const task = await taskRes.json().catch(() => ({}));
          if (!taskRes.ok || !task.id) throw new Error(task.error || "No se pudo crear la acción.");
          taskId = task.id;
          const ideaRes = await fetch(`${API_BASE}/ideas/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "done", task_id: taskId }),
          });
          if (!ideaRes.ok) throw new Error("La acción se creó, pero no se pudo vincular con la idea.");
        } catch (err) {
          if (taskId) await fetch(`${API_BASE}/tasks/${taskId}`, { method: "DELETE" }).catch(() => {});
          throw err;
        }
        if (window.initTasks) await window.initTasks();
      });
    });

    row.querySelector('[data-action="revert"]')?.addEventListener("click", async (e) => {
      const taskId = row.dataset.taskId;
      await runAction(e.currentTarget, async () => {
        if (taskId) {
          const taskRes = await fetch(`${API_BASE}/tasks/${taskId}`, { method: "DELETE" });
          if (!taskRes.ok) throw new Error("No se pudo quitar la acción vinculada.");
        }
        const res = await fetch(`${API_BASE}/ideas/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "open", task_id: null }),
        });
        if (!res.ok) throw new Error("No se pudo devolver la idea al semillero.");
        if (window.initTasks) await window.initTasks();
      });
    });

    row.querySelector('[data-action="convert"]')?.addEventListener("click", async (e) => {
      await runAction(e.currentTarget, async () => {
        const res = await fetch(`${API_BASE}/ideas/${id}/convert-to-thought`, { method: "POST" });
        if (!res.ok) throw new Error("No se pudo mover a Pensamientos.");
        if (window.initJournal) await window.initJournal();
      });
    });

    row.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
      await runAction(e.currentTarget, async () => {
        const res = await fetch(`${API_BASE}/ideas/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("No se pudo descartar esta idea.");
      });
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
      <button class="tx-btn tx-btn-edit" data-action="convert" title="Mover esta idea a Pensamientos">→ pensamiento</button>
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

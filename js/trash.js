/* ============================================
   BRISA - Papelera y deshacer
   Nada se borra del todo: el servidor guarda la fila antes de borrarla
   (trigger brisa_trash_row). Acá se avisa con un "Deshacer", se responde
   a Ctrl+Z y se muestra la papelera.
   ============================================ */

const API = "/api";

// Recurso de la URL -> tabla que sí llega a la papelera.
const RESOURCE_TABLE = {
  tasks: "tasks",
  journal: "journal",
  ideas: "ideas",
  events: "events",
  reminders: "reminders",
  people: "people",
  accounts: "accounts",
  transactions: "transactions",
  entries: "entries",
  shopping: "shopping_items",
  habits: "habits",
  clips: "clips",
};

const KIND_LABEL = {
  tasks: "Tarea",
  journal: "Nota",
  ideas: "Idea",
  events: "Evento",
  reminders: "Recordatorio",
  people: "Persona",
  accounts: "Cuenta",
  transactions: "Movimiento",
  entries: "Captura",
  shopping_items: "Compra",
  habits: "Hábito",
  clips: "Clip",
};

const UNDO_MS = 15000;
let toastEl = null;
let toastTimer = null;
let lastBatch = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tableForUrl(url) {
  let path = "";
  try {
    path = new URL(url, location.origin).pathname;
  } catch {
    return null;
  }
  const m = path.match(/^\/api\/([a-z_-]+)(?:\/|$)/i);
  return m ? RESOURCE_TABLE[m[1].toLowerCase()] || null : null;
}

/* --- Vigilancia de borrados ---------------------------------------------
   Engancharse a fetch evita tocar las 20 vistas: cualquiera que borre
   recibe el mismo aviso con "Deshacer". */
let pendingCheck = null;

function installFetchHook() {
  if (window.__brisaFetchHooked) return;
  window.__brisaFetchHooked = true;
  const original = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = (init?.method || input?.method || "GET").toUpperCase();
    const res = await original(input, init);
    if (method === "DELETE" && res.ok) {
      const table = tableForUrl(url);
      // Si fue un borrado en bloque (varias filas), se junta en un solo aviso.
      if (table) scheduleUndoCheck(table);
    }
    return res;
  };
}

function scheduleUndoCheck(table) {
  if (pendingCheck) clearTimeout(pendingCheck);
  pendingCheck = setTimeout(async () => {
    pendingCheck = null;
    try {
      const res = await fetch(`${API}/trash/last`);
      if (!res.ok) return;
      const info = await res.json();
      if (!info || info.table_name !== table) return;
      lastBatch = info;
      showUndoToast(info);
    } catch (e) {
      console.warn("No se pudo leer la papelera:", e);
    }
  }, 220);
}

/* --- Aviso con "Deshacer" ------------------------------------------------ */
function showUndoToast(info) {
  closeUndoToast();
  const n = info.count > 1 ? `${info.count} elementos` : (info.label || KIND_LABEL[info.table_name] || "elemento");
  const detalle = info.count > 1
    ? `${KIND_LABEL[info.table_name] || "Elemento"} · ${info.label ? escapeHtml(info.label) + " y otros" : info.count + " en total"}`
    : escapeHtml(info.label || KIND_LABEL[info.table_name] || "Sin título");

  toastEl = document.createElement("div");
  toastEl.className = "undo-toast";
  toastEl.setAttribute("role", "status");
  toastEl.innerHTML = `
    <div class="undo-body">
      <div class="undo-head">Eliminado: ${n}</div>
      <div class="undo-detail">${detalle}</div>
    </div>
    <button class="undo-btn" type="button">Deshacer</button>
    <button class="undo-close" type="button" aria-label="Cerrar" title="Cerrar">✕</button>
    <span class="undo-progress" style="animation-duration:${UNDO_MS}ms"></span>
  `;
  document.body.appendChild(toastEl);

  // Si el aviso de la guía está abajo, este sube para no taparse.
  const guidance = document.querySelector(".guidance-banner");
  if (guidance && guidance.offsetParent !== null) toastEl.classList.add("undo-high");

  toastEl.querySelector(".undo-btn")?.addEventListener("click", () => {
    const batch = lastBatch?.batch_id;
    closeUndoToast();
    undoBatch(batch);
  });
  toastEl.querySelector(".undo-close")?.addEventListener("click", closeUndoToast);

  toastTimer = setTimeout(closeUndoToast, UNDO_MS);
}

function closeUndoToast() {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  toastEl?.remove();
  toastEl = null;
}

async function undoBatch(batchId) {
  if (!batchId) {
    lastBatch = await fetchLast().catch(() => null);
    batchId = lastBatch?.batch_id;
  }
  if (!batchId) {
    notify("No hay nada para deshacer.");
    return;
  }
  try {
    const res = await fetch(`${API}/trash/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batchId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      notify(data.error || "No se pudo deshacer.");
      return;
    }
    lastBatch = null;
    const fallidos = data.failed?.length || 0;
    notify(fallidos ? `Devuelto ${data.restored}; ${fallidos} no se pudo.` : "Listo, volvió.");
    refreshViews();
  } catch (e) {
    console.warn("Error deshaciendo:", e);
    notify("No se pudo deshacer.");
  }
}

async function fetchLast() {
  const res = await fetch(`${API}/trash/last`);
  if (!res.ok) return null;
  return await res.json();
}

function notify(text) {
  closeUndoToast();
  const el = document.createElement("div");
  el.className = "undo-toast undo-toast-info";
  el.setAttribute("role", "status");
  el.innerHTML = `<div class="undo-body"><div class="undo-head">${escapeHtml(text)}</div></div>`;
  document.body.appendChild(el);
  toastEl = el;
  toastTimer = setTimeout(closeUndoToast, 3600);
}

/* Ctrl+Z: deshace el último borrado. No se mete si estás escribiendo
   (ahí el deshacer es el del texto). */
function bindCtrlZ() {
  if (window.__brisaCtrlZ) return;
  window.__brisaCtrlZ = true;
  document.addEventListener("keydown", (e) => {
    const esZ = e.key === "z" || e.key === "Z";
    if (!esZ || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
    e.preventDefault();
    if (toastEl && lastBatch) {
      const batch = lastBatch.batch_id;
      closeUndoToast();
      undoBatch(batch);
      return;
    }
    undoBatch(null);
  });
}

function refreshViews() {
  ["initTasks", "initJournal", "initFinance", "initRelationships", "initInbox",
    "initCalendar", "initShopping", "initHabits", "initIdeas", "initToday", "initWeek"]
    .forEach((name) => {
      try {
        window[name]?.();
      } catch (e) {
        console.warn(`No se pudo refrescar ${name}:`, e);
      }
    });
  if (document.querySelector('.nav.active[data-nav="trash"]')) renderTrash();
}

/* --- Papelera ------------------------------------------------------------ */
function formatWhen(dt) {
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const hora = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (mismoDia) return `hoy ${hora}`;
  const ayer = new Date(hoy);
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === ayer.toDateString()) return `ayer ${hora}`;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + ` ${hora}`;
}

export async function renderTrash() {
  const section = document.querySelector("#trash-section");
  if (!section) return;

  let rows = null;
  try {
    const res = await fetch(`${API}/trash`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    rows = await res.json();
  } catch (e) {
    console.warn("No se pudo cargar la papelera:", e);
  }

  if (!rows) {
    section.innerHTML = `
      <div class="trash">
        <div class="trash-header">
          <div class="trash-title">Papelera</div>
        </div>
        <div class="trash-empty">
          <div class="trash-empty-icon">⚠️</div>
          <div class="trash-empty-text">No se pudo cargar la papelera.</div>
          <button class="trash-retry" id="trash-retry">Reintentar</button>
        </div>
      </div>
    `;
    section.querySelector("#trash-retry")?.addEventListener("click", renderTrash);
    return;
  }

  const grupos = {};
  for (const r of rows) {
    const key = String(r.deleted_at).slice(0, 10);
    (grupos[key] = grupos[key] || []).push(r);
  }

  section.innerHTML = `
    <div class="trash">
      <div class="trash-header">
        <div class="trash-title">Papelera${rows.length ? ` · ${rows.length}` : ""}</div>
        ${rows.length ? '<button class="trash-empty-btn" id="trash-purge-all">Vaciar papelera</button>' : ""}
      </div>
      <div class="trash-hint">Lo que borras queda acá y se puede devolver tal como estaba. Ctrl+Z deshace el último borrado.</div>
      ${rows.length === 0
        ? `<div class="trash-empty">
             <div class="trash-empty-icon">🗑</div>
             <div class="trash-empty-text">Vacía. Nada se perdió.</div>
           </div>`
        : Object.keys(grupos).sort().reverse().map(key => `
            <div class="trash-group">
              <div class="trash-group-title">${formatWhen(grupos[key][0].deleted_at).replace(/\s\d{2}:\d{2}$/, "")}</div>
              <div class="trash-list">
                ${grupos[key].map(r => `
                  <div class="trash-row" data-id="${r.id}">
                    <div class="trash-what">
                      <span class="trash-kind">${escapeHtml(r.kind)}</span>
                      <span class="trash-label">${escapeHtml(r.label || "Sin título")}</span>
                    </div>
                    <div class="trash-when">${formatWhen(r.deleted_at)}</div>
                    <div class="trash-actions">
                      <button class="tx-btn trash-restore" data-action="restore">Devolver</button>
                      <button class="trash-x" data-action="purge" title="Borrar para siempre" aria-label="Borrar para siempre">✕</button>
                    </div>
                  </div>
                `).join("")}
              </div>
            </div>
          `).join("")}
    </div>
  `;

  section.querySelector("#trash-purge-all")?.addEventListener("click", async () => {
    if (!confirm("¿Vaciar la papelera? Esto sí borra para siempre.")) return;
    await fetch(`${API}/trash`, { method: "DELETE" });
    renderTrash();
  });

  section.querySelectorAll(".trash-row").forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-action="restore"]')?.addEventListener("click", async () => {
      try {
        const res = await fetch(`${API}/trash/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: Number(id) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) notify(data.error || "No se pudo devolver.");
        else notify("Listo, volvió.");
      } catch (e) {
        console.warn("Error devolviendo:", e);
      }
      refreshViews();
    });
    row.querySelector('[data-action="purge"]')?.addEventListener("click", async () => {
      if (!confirm("¿Borrar para siempre?")) return;
      await fetch(`${API}/trash/${id}`, { method: "DELETE" });
      renderTrash();
    });
  });
}

export function initTrash() {
  installFetchHook();
  bindCtrlZ();
  window.brisaUndo = (batchId = null) => undoBatch(batchId);
  return renderTrash();
}

/* ============================================
   BRISA - Event Detail Module
   Shows event info + one-tap prep task creation
   ============================================ */

const API_BASE = "/api";

let currentEventId = null;

async function renderPrepList(overlay, eventId) {
  const box = overlay.querySelector("#event-prep-list");
  if (!box) return;
  let tasks = [];
  try {
    const res = await fetch(`${API_BASE}/tasks`);
    if (res.ok) tasks = (await res.json()).filter(t => String(t.event_id) === String(eventId));
  } catch (e) {
    console.error("Error cargando preparación:", e);
  }
  const done = tasks.filter(t => t.is_completed).length;
  box.innerHTML = tasks.length === 0
    ? `<div class="focus-note">Sin pasos todavía. Agrega el primero arriba.</div>`
    : `<div class="focus-note">${done} de ${tasks.length} listos</div>` + tasks.map(t => `
      <label class="prep-row">
        <input type="checkbox" data-prep-toggle="${t.id}" ${t.is_completed ? "checked" : ""}>
        <span class="${t.is_completed ? "prep-done" : ""}">${escapeHtml(t.title)}</span>
      </label>`).join("");
  box.querySelectorAll("[data-prep-toggle]").forEach(cb => {
    cb.addEventListener("change", async () => {
      try {
        await fetch(`${API_BASE}/tasks/${cb.dataset.prepToggle}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            is_completed: cb.checked,
            completed_at: cb.checked ? new Date().toISOString() : null,
          }),
        });
        if (window.initTasks) await window.initTasks();
        if (window.renderNext) window.renderNext();
        if (window.initToday) window.initToday();
        await renderPrepList(overlay, eventId);
      } catch (e) {
        console.error("Error actualizando paso:", e);
      }
    });
  });
}

function formatWhen(ev) {
  const opts = { weekday: "long", day: "numeric", month: "long" };
  const date = new Date(ev.start).toLocaleDateString("es-ES", opts);
  const timeOpts = { hour: "2-digit", minute: "2-digit" };
  const start = new Date(ev.start).toLocaleTimeString("es-ES", timeOpts);
  const end = ev.end ? ` – ${new Date(ev.end).toLocaleTimeString("es-ES", timeOpts)}` : "";
  return `${date}, ${start}${end}`;
}

export function initEventDetail() {
  const overlay = document.querySelector("#event-detail-modal");
  if (!overlay) return;

  overlay.querySelector("#event-detail-close")?.addEventListener("click", close);
  overlay.querySelector("#event-detail-ok")?.addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  function close() {
    overlay.classList.remove("active");
  }

  window.openEventDetail = async (eventId) => {
    let ev = null;
    try {
      const res = await fetch(`${API_BASE}/events`);
      if (res.ok) {
        const all = await res.json();
        ev = all.find(x => String(x.id) === String(eventId));
      }
    } catch (e) {
      console.error("Error cargando evento:", e);
    }
    if (!ev) return;

    currentEventId = ev.id;
    overlay.querySelector("#event-detail-title").textContent = ev.title || "Evento";
    overlay.querySelector("#event-detail-when").textContent = ev.start ? formatWhen(ev) : "";
    overlay.querySelector("#event-detail-location").textContent = ev.location ? `📍 ${ev.location}` : "";
    overlay.querySelector("#event-detail-desc").textContent = ev.description || "";
    const prepInput = overlay.querySelector("#event-prep-input");
    if (prepInput) prepInput.value = "";
    await renderPrepList(overlay, ev.id);
    overlay.classList.add("active");
    prepInput?.focus();
  };

  overlay.querySelector("#event-prep-add")?.addEventListener("click", async () => {
    const input = overlay.querySelector("#event-prep-input");
    const titleEl = overlay.querySelector("#event-detail-title");
    const text = input?.value.trim();
    if (!text || !currentEventId) return;
    try {
      await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: text,
          description: `Preparación para: ${titleEl?.textContent || ""}`,
          event_id: currentEventId,
        }),
      });
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      await renderPrepList(overlay, currentEventId);
      input.value = "";
      input.placeholder = "Agregado ✓ ¿algo más?";
      setTimeout(() => { input.placeholder = "Ej: sacar la ropa del closet"; }, 2500);
    } catch (e) {
      console.error("Error creando preparación:", e);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

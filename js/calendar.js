/* ============================================
   BRISA - Calendar Module (agenda of upcoming events)
   ============================================ */

const API_BASE = "/api";

async function fetchEvents() {
  try {
    const res = await fetch(`${API_BASE}/events`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar eventos:", e);
    return null;
  }
}

function dayKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function formatDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function isMidnight(dt) {
  if (!dt) return false;
  const d = new Date(dt);
  return d.getHours() === 0 && d.getMinutes() === 0;
}

function formatRange(ev) {
  const opts = { hour: "2-digit", minute: "2-digit" };
  const start = new Date(ev.start).toLocaleTimeString("es-ES", opts);
  if (!ev.end) return isMidnight(ev.start) ? "Todo el día" : start;
  if (isMidnight(ev.start) && isMidnight(ev.end)) return "Todo el día";
  return `${start} – ${new Date(ev.end).toLocaleTimeString("es-ES", opts)}`;
}

export async function initCalendar() {
  const section = document.querySelector("#calendar-section");
  if (!section) return;

  const events = await fetchEvents();

  if (!events) {
    section.innerHTML = `
      <div class="calendar-empty">
        <div class="calendar-empty-icon">⚠️</div>
        <div class="calendar-empty-text">No se pudo conectar con el servidor.</div>
      </div>
    `;
    return;
  }

  const today = dayKey(new Date());
  const upcoming = events.filter(ev => ev.start && String(ev.start).slice(0, 10) >= today);

  if (upcoming.length === 0) {
    section.innerHTML = `
      <div class="calendar-header">
        <div class="calendar-title">Calendario</div>
        <button class="calendar-add-btn" id="add-event">+ Nuevo evento</button>
      </div>
      <div class="calendar-empty">
        <div class="calendar-empty-icon">📅</div>
        <div class="calendar-empty-text">Sin eventos próximos.<br>Creá el primero para empezar.</div>
      </div>
    `;
    section.querySelector("#add-event")?.addEventListener("click", () => {
      if (window.openEventModal) window.openEventModal();
    });
    return;
  }

  const groups = {};
  for (const ev of upcoming) {
    const key = String(ev.start).slice(0, 10);
    (groups[key] = groups[key] || []).push(ev);
  }

  section.innerHTML = `
    <div class="calendar-header">
      <div class="calendar-title">Calendario</div>
      <button class="calendar-add-btn" id="add-event">+ Nuevo evento</button>
    </div>
    ${Object.keys(groups).sort().map(key => `
      <div class="calendar-day">
        <div class="calendar-day-title">${formatDay(key)}</div>
        <div class="calendar-list">
          ${groups[key].map(ev => `
            <div class="calendar-item" data-event-id="${ev.id}" data-action="open" style="cursor:pointer">
              <div class="calendar-time">${formatRange(ev)}</div>
              <div class="calendar-info">
                <div class="calendar-name">${escapeHtml(ev.title)}</div>
                ${ev.location ? `<div class="calendar-meta">📍 ${escapeHtml(ev.location)}</div>` : ""}
              </div>
              <div class="tx-actions">
                <button class="tx-btn tx-btn-delete" data-action="delete">Eliminar</button>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")}
  `;

  section.querySelector("#add-event")?.addEventListener("click", () => {
    if (window.openEventModal) window.openEventModal();
  });

  section.querySelectorAll(".calendar-item").forEach(item => {
    const id = item.dataset.eventId;
    item.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("¿Eliminar este evento?")) {
        await fetch(`${API_BASE}/events/${id}`, { method: "DELETE" });
        if (window.initCalendar) window.initCalendar();
        if (window.initToday) window.initToday();
      }
    });
    item.addEventListener("click", () => {
      if (window.openEventDetail) window.openEventDetail(id);
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

/* ============================================
   BRISA - Calendar Module (month grid + agenda)
   Google-ready: events carry source/external_id
   ============================================ */

const API_BASE = "/api";

/* La vista sobrevive a los refrescos del módulo (editar/eliminar
   un evento no devuelve al mes de hoy ni pierde el día elegido). */
let viewDate = null;      // { y, m } — m 0-based
let selectedDay = null;   // 'YYYY-MM-DD' | null

function showCalendarFeedback(section, message = "") {
  let el = section.querySelector("[data-calendar-feedback]");
  if (!el) {
    el = document.createElement("div");
    el.dataset.calendarFeedback = "";
    el.className = "calendar-feedback";
    el.setAttribute("role", "alert");
    section.querySelector(".calendar-header")?.after(el);
  }
  el.textContent = message;
  el.hidden = !message;
}

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

function monthLabel(y, m) {
  const s = new Date(y, m, 1).toLocaleDateString("es-ES", { month: "long" });
  return `${s.charAt(0).toUpperCase() + s.slice(1)} ${y}`;
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

function itemHtml(ev) {
  const chip = ev.status === "done"
    ? `<span class="calendar-chip calendar-chip-done">✓ hecho</span>`
    : ev.status === "cancelled"
      ? `<span class="calendar-chip calendar-chip-cancelled">✕ cancelado</span>`
      : "";
  return `
    <div class="calendar-item${ev.status === "cancelled" ? " calendar-item-cancelled" : ""}" data-event-id="${ev.id}" data-action="open" role="group" tabindex="0" aria-label="Evento: ${escapeHtml(ev.title)}. Pulsa Enter para abrir el detalle." style="cursor:pointer">
      <div class="calendar-time">${formatRange(ev)}</div>
      <div class="calendar-info">
        <div class="calendar-name">${escapeHtml(ev.title)} ${chip}</div>
        ${ev.location ? `<div class="calendar-meta">📍 ${escapeHtml(ev.location)}</div>` : ""}
        ${ev.conclusion ? `<div class="calendar-meta calendar-conclusion">✎ ${escapeHtml(ev.conclusion)}</div>` : ""}
      </div>
      <div class="tx-actions">
        <button class="tx-btn tx-btn-edit" data-action="edit">Editar</button>
        <button class="tx-btn tx-btn-delete" data-action="delete" aria-label="Eliminar evento">Eliminar</button>
      </div>
    </div>
  `;
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
  const now = new Date();
  if (!viewDate) viewDate = { y: now.getFullYear(), m: now.getMonth() };

  // Índice de eventos por día (clave = día de inicio, igual que la agenda).
  const byDay = {};
  for (const ev of events) {
    if (!ev.start) continue;
    const key = String(ev.start).slice(0, 10);
    (byDay[key] = byDay[key] || []).push(ev);
  }

  section.innerHTML = `
    <div class="calendar-header">
      <div class="calendar-title">Calendario</div>
      <button class="calendar-add-btn" id="add-event">+ Nuevo evento</button>
    </div>
    <div class="calendar-month">
      <div class="calendar-month-nav">
        <button class="calendar-month-btn" id="cal-prev" title="Mes anterior" aria-label="Mes anterior">‹</button>
        <div class="calendar-month-label" id="cal-month-label"></div>
        <button class="calendar-month-btn" id="cal-next" title="Mes siguiente" aria-label="Mes siguiente">›</button>
        <button class="calendar-month-today" id="cal-month-today" title="Volver a hoy">Hoy</button>
      </div>
      <div class="calendar-grid" id="cal-grid" role="grid" aria-label="Mes en curso"></div>
    </div>
    <div class="calendar-agenda" id="cal-agenda"></div>
  `;

  const gridEl = section.querySelector("#cal-grid");
  const labelEl = section.querySelector("#cal-month-label");
  const agendaEl = section.querySelector("#cal-agenda");

  section.querySelector("#add-event")?.addEventListener("click", () => {
    if (window.openEventModal) window.openEventModal();
  });

  const cellHtml = (y, m, d, isOther) => {
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const evs = byDay[key] || [];
    const chips = evs.slice(0, 2).map(ev =>
      `<button type="button" class="calendar-cell-chip${ev.status === "done" ? " is-done" : ""}${ev.status === "cancelled" ? " is-cancelled" : ""}" data-event-id="${ev.id}" title="${escapeHtml(ev.title)}${ev.status === "done" ? " — hecho" : ev.status === "cancelled" ? " — cancelado" : ""}">${escapeHtml(ev.title)}</button>`
    ).join("");
    const more = evs.length > 2 ? `<span class="calendar-cell-more">+${evs.length - 2}</span>` : "";
    return `<div class="calendar-cell${isOther ? " is-other" : ""}${key === today ? " is-today" : ""}${key === selectedDay ? " is-selected" : ""}"
        data-day="${key}" role="gridcell" tabindex="0" aria-label="Día ${d}">
      <span class="calendar-cell-num">${d}</span>${chips}${more}
    </div>`;
  };

  function renderGrid() {
    labelEl.textContent = monthLabel(viewDate.y, viewDate.m);
    const weekdays = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
    const first = new Date(viewDate.y, viewDate.m, 1);
    const startOffset = (first.getDay() + 6) % 7; // lunes primero
    const daysInMonth = new Date(viewDate.y, viewDate.m + 1, 0).getDate();
    const prevDays = new Date(viewDate.y, viewDate.m, 0).getDate();

    let html = weekdays.map(w => `<div class="calendar-weekday">${w}</div>`).join("");
    const cells = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      const pm = viewDate.m === 0 ? 11 : viewDate.m - 1;
      const py = viewDate.m === 0 ? viewDate.y - 1 : viewDate.y;
      cells.push(cellHtml(py, pm, prevDays - i, true));
    }
    for (let d = 1; d <= daysInMonth; d++) cells.push(cellHtml(viewDate.y, viewDate.m, d, false));
    let tail = 1;
    while (cells.length % 7 !== 0) {
      const nm = viewDate.m === 11 ? 0 : viewDate.m + 1;
      const ny = viewDate.m === 11 ? viewDate.y + 1 : viewDate.y;
      cells.push(cellHtml(ny, nm, tail++, true));
      if (tail > 31) break;
    }
    gridEl.innerHTML = html + cells.join("");

    gridEl.querySelectorAll(".calendar-cell").forEach(cell => {
      const select = () => {
        selectedDay = cell.dataset.day;
        renderAgenda();
      };
      cell.addEventListener("click", (e) => {
        if (e.target.closest(".calendar-cell-chip")) return;
        select();
      });
      cell.addEventListener("keydown", (e) => {
        if (e.target !== cell) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(); }
      });
    });
    gridEl.querySelectorAll(".calendar-cell-chip").forEach(chip => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        if (window.openEventDetail) window.openEventDetail(chip.dataset.eventId);
      });
    });
  }

  function bindAgendaItems(root) {
    root.querySelectorAll(".calendar-item").forEach(item => {
      const id = item.dataset.eventId;
      item.querySelector('[data-action="edit"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        if (window.openEventModal) window.openEventModal(id);
      });
      item.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const button = e.currentTarget;
        button.disabled = true;
        try {
          const res = await fetch(`${API_BASE}/events/${id}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
          if (window.initCalendar) await window.initCalendar();
          if (window.initToday) await window.initToday();
          if (window.initWeek) await window.initWeek();
        } catch {
          button.disabled = false;
          showCalendarFeedback(section, "No se pudo eliminar el evento. Sigue en tu calendario; intenta de nuevo.");
        }
      });
      item.addEventListener("click", () => {
        if (window.openEventDetail) window.openEventDetail(id);
      });
      item.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.target.closest("button")) {
          e.preventDefault();
          if (window.openEventDetail) window.openEventDetail(id);
        }
      });
    });
  }

  function renderAgenda() {
    // Marca la celda elegida sin repintar toda la grilla.
    gridEl.querySelectorAll(".calendar-cell").forEach(c =>
      c.classList.toggle("is-selected", c.dataset.day === selectedDay));

    if (selectedDay) {
      const evs = (byDay[selectedDay] || []).slice()
        .sort((a, b) => String(a.start).localeCompare(String(b.start)));
      agendaEl.innerHTML = `
        <div class="calendar-agenda-head">
          <div class="calendar-day-title">${formatDay(selectedDay)}</div>
          <button class="calendar-agenda-clear" id="cal-clear" title="Quitar el filtro y ver lo que viene">Ver próximos</button>
        </div>
        ${evs.length
          ? `<div class="calendar-list">${evs.map(itemHtml).join("")}</div>`
          : `<div class="calendar-empty">
               <div class="calendar-empty-icon">📅</div>
               <div class="calendar-empty-text">Sin eventos este día.<br>Crea uno con "+ Nuevo evento".</div>
             </div>`}
      `;
      agendaEl.querySelector("#cal-clear")?.addEventListener("click", () => {
        selectedDay = null;
        renderAgenda();
      });
    } else {
      const upcoming = events.filter(ev => ev.start && String(ev.start).slice(0, 10) >= today);
      if (upcoming.length === 0) {
        agendaEl.innerHTML = `
          <div class="calendar-empty">
            <div class="calendar-empty-icon">📅</div>
            <div class="calendar-empty-text">Sin eventos próximos.<br>Crea el primero para empezar.</div>
          </div>
        `;
      } else {
        const groups = {};
        for (const ev of upcoming) {
          const key = String(ev.start).slice(0, 10);
          (groups[key] = groups[key] || []).push(ev);
        }
        agendaEl.innerHTML = Object.keys(groups).sort().map(key => `
          <div class="calendar-day">
            <div class="calendar-day-title">${formatDay(key)}</div>
            <div class="calendar-list">${groups[key].map(itemHtml).join("")}</div>
          </div>
        `).join("");
      }
    }
    bindAgendaItems(agendaEl);
  }

  section.querySelector("#cal-prev")?.addEventListener("click", () => stepMonth(-1));
  section.querySelector("#cal-next")?.addEventListener("click", () => stepMonth(1));
  section.querySelector("#cal-month-today")?.addEventListener("click", () => {
    const d = new Date();
    viewDate = { y: d.getFullYear(), m: d.getMonth() };
    selectedDay = dayKey(d);
    renderGrid();
    renderAgenda();
  });

  function stepMonth(delta) {
    let { y, m } = viewDate;
    m += delta;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    viewDate = { y, m };
    renderGrid();
  }

  renderGrid();
  renderAgenda();
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

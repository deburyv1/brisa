/* ============================================
   BRISA - Today Module
   Day timeline with current time and task markers.
   Past days: gray timeline + read-only day summary.
   ============================================ */
import { state } from "./state.js";

let dayOffset = 0;

export function shiftToday(delta) {
  dayOffset += delta;
  if (dayOffset > 0) dayOffset = 0;
  initToday();
}

export function resetToday() {
  dayOffset = 0;
  initToday();
}

function targetDate() {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return d;
}

function dateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function sameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

function getCurrentTimePercent() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return ((hours + minutes / 60) / 24) * 100;
}

function formatTime(date) {
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(date) {
  if (dayOffset === 0) return "Hoy";
  return date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

export async function initToday() {
  const section = document.querySelector("#today-section");
  if (!section) return;

  const target = targetDate();
  const isToday = dayOffset === 0;
  const isPast = dayOffset < 0;
  const key = dateKey(target);

  const tasks = state.tasks || [];

  let events = [];
  try {
    const res = await fetch(`/api/events?date=${key}`);
    if (res.ok) events = await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar eventos:", e);
  }
  if (isToday) {
    try {
      sessionStorage.setItem("brisa.todayEvents", JSON.stringify(events));
    } catch {
      // cache unavailable: upcoming pill skips events
    }
  }

  const dayTasks = tasks.filter(t => t.scheduled_datetime && sameDay(t.scheduled_datetime, target));

  let summaryHtml = "";
  if (isPast) {
    summaryHtml = await renderSummary(key);
  }

  section.innerHTML = `
    <div class="today-header">
      <div class="today-title">Tu día</div>
      <div class="today-daynav">
        <button class="today-daybtn" id="today-prev" title="Día anterior">‹</button>
        <button class="today-daylabel" id="today-reset" title="Volver a hoy">${dayLabel(target)}</button>
        <button class="today-daybtn" id="today-next" title="Día siguiente" ${isToday ? "disabled" : ""}>›</button>
      </div>
      <div class="today-time">${isToday ? formatTime(new Date()) : ""}</div>
    </div>
    <div class="today-timeline ${isPast ? "past" : ""}">
      ${isToday ? `<div class="today-now" style="left: ${getCurrentTimePercent()}%"></div>` : ""}
      ${dayTasks.map(t => {
        const d = new Date(t.scheduled_datetime);
        const percent = ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
        const overdue = isToday && !t.is_completed && d.getTime() < Date.now();
        return `<div class="today-task ${t.priority || "medium"}${t.is_completed ? " done" : ""}${overdue ? " overdue" : ""}" style="left: ${percent}%" data-task-id="${t.id}" title="${escapeHtml(t.title || "Tarea")}"></div>`;
      }).join("")}
      ${events.map(ev => {
        const d = new Date(ev.start);
        const percent = ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
        return `<div class="today-event" style="left: ${percent}%" data-event-id="${ev.id}" title="${escapeHtml(ev.title || "Evento")}"></div>`;
      }).join("")}
      <div class="today-pop" id="today-pop" style="display:none"></div>
    </div>
    <div class="today-labels">
      <span class="today-label">00</span>
      <span class="today-label">06</span>
      <span class="today-label">12</span>
      <span class="today-label">18</span>
      <span class="today-label">24</span>
    </div>
    <div class="today-legend">
      <div class="today-legend-item"><span class="today-legend-dot high"></span> Alta</div>
      <div class="today-legend-item"><span class="today-legend-dot medium"></span> Media</div>
      <div class="today-legend-item"><span class="today-legend-dot low"></span> Baja</div>
      <div class="today-legend-item"><span class="today-legend-dot event"></span> Evento</div>
    </div>
    ${summaryHtml}
  `;

  section.querySelector("#today-prev")?.addEventListener("click", () => shiftToday(-1));
  section.querySelector("#today-next")?.addEventListener("click", () => shiftToday(1));
  section.querySelector("#today-reset")?.addEventListener("click", () => resetToday());

  wireMarkers(section, dayTasks, events, isToday, key);

  const timeEl = section.querySelector(".today-time");
  if (section.dataset.clockId) {
    clearInterval(Number(section.dataset.clockId));
    delete section.dataset.clockId;
  }
  if (timeEl && isToday) {
    let ticks = 0;
    const id = setInterval(() => {
      if (!document.body.contains(section)) {
        clearInterval(id);
        return;
      }
      const el = section.querySelector(".today-time");
      if (el) el.textContent = formatTime(new Date());
      // Refresh overdue states every minute, unless the popover is open
      if (++ticks % 60 === 0) {
        const open = section.querySelector("#today-pop");
        if (open && open.style.display !== "none") return;
        if (window.initToday) window.initToday();
      }
    }, 1000);
    section.dataset.clockId = String(id);
  }
}

function markerPercent(dt) {
  const d = dt instanceof Date ? dt : new Date(dt);
  return ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
}

function overdueText(dt) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(dt).getTime()) / 60000));
  if (mins < 60) return `vencida hace ${mins} min`;
  const h = Math.floor(mins / 60);
  return `vencida hace ${h} h${mins % 60 ? ` ${mins % 60} min` : ""}`;
}

function wireMarkers(section, dayTasks, events, isToday, key) {
  const pop = section.querySelector("#today-pop");
  if (!pop) return;

  const closePop = () => { pop.style.display = "none"; pop.innerHTML = ""; };

  const showPop = (anchorEl, html) => {
    const timeline = section.querySelector(".today-timeline");
    const tRect = timeline.getBoundingClientRect();
    const aRect = anchorEl.getBoundingClientRect();
    let pct = ((aRect.left + aRect.width / 2 - tRect.left) / tRect.width) * 100;
    pct = Math.max(14, Math.min(86, pct));
    pop.innerHTML = html;
    pop.style.display = "";
    pop.style.left = `${pct}%`;
  };

  const refreshAll = async () => {
    if (window.initTasks) await window.initTasks();
    if (window.initToday) window.initToday();
    if (window.initWeek) window.initWeek();
    if (window.initCalendar) window.initCalendar();
    if (window.initReadiness) window.initReadiness();
    if (window.renderNext) window.renderNext();
  };

  const updateTask = async (id, body) => {
    await fetch(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    closePop();
    await refreshAll();
  };

  section.querySelectorAll(".today-task").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = (state.tasks || []).find(x => String(x.id) === String(el.dataset.taskId));
      if (!t) return;
      if (!isToday) return; // past days stay read-only
      const d = new Date(t.scheduled_datetime);
      const overdue = !t.is_completed && d.getTime() < Date.now();
      if (t.is_completed) {
        showPop(el, `
          <div class="today-pop-title">${escapeHtml(t.title)}</div>
          <div class="today-pop-time">Hecha ✓ ${t.completed_at ? formatTime(new Date(t.completed_at)) : ""}</div>
          <div class="today-pop-actions">
            <button class="modal-btn modal-btn-secondary" data-act="reopen">Deshacer</button>
          </div>`);
        pop.querySelector('[data-act="reopen"]')?.addEventListener("click", () =>
          updateTask(t.id, { is_completed: false, completed_at: null }));
        return;
      }
      showPop(el, `
        <div class="today-pop-title">${escapeHtml(t.title)}</div>
        <div class="today-pop-time">${overdue ? `⏰ ${overdueText(t.scheduled_datetime)} · ¿lo hiciste o se reprograma?` : `Hoy ${formatTime(d)}`}</div>
        <div class="today-pop-actions">
          <button class="modal-btn modal-btn-primary" data-act="done">✓ Hecho</button>
          <button class="modal-btn modal-btn-secondary" data-act="plus1">+1 h</button>
          <button class="modal-btn modal-btn-secondary" data-act="tomorrow">Mañana</button>
        </div>`);
      pop.querySelector('[data-act="done"]')?.addEventListener("click", () =>
        updateTask(t.id, { is_completed: true, completed_at: new Date().toISOString() }));
      pop.querySelector('[data-act="plus1"]')?.addEventListener("click", () => {
        const at = new Date(Date.now() + 60 * 60000);
        updateTask(t.id, { scheduled_datetime: at.toISOString() });
      });
      pop.querySelector('[data-act="tomorrow"]')?.addEventListener("click", () => {
        const at = new Date(t.scheduled_datetime);
        at.setDate(at.getDate() + 1);
        updateTask(t.id, { scheduled_datetime: at.toISOString() });
      });
    });
  });

  section.querySelectorAll(".today-event").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.openEventDetail) window.openEventDetail(el.dataset.eventId);
    });
  });

  if (!section.dataset.dismissBound) {
    section.dataset.dismissBound = "1";
    document.addEventListener("click", function dismiss(e) {
      const p = section.querySelector("#today-pop");
      if (!p) return;
      if (p.style.display !== "none" && !p.contains(e.target)) {
        p.style.display = "none";
        p.innerHTML = "";
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const p = section.querySelector("#today-pop");
      if (p && p.style.display !== "none") {
        p.style.display = "none";
        p.innerHTML = "";
      }
    });
  }
}

async function renderSummary(key) {
  const doneTasks = (state.tasks || []).filter(t =>
    t.is_completed && t.completed_at && dateKey(t.completed_at) === key);
  const notes = (state.journal || []).filter(n =>
    n.created_at && dateKey(n.created_at) === key);

  let entries = [];
  let allTxs = [];
  try {
    const [eRes, tRes] = await Promise.all([
      fetch("/api/entries").then(r => r.ok ? r.json() : []),
      fetch("/api/transactions").then(r => r.ok ? r.json() : []),
    ]);
    entries = Array.isArray(eRes) ? eRes.filter(e => e.created_at && dateKey(e.created_at) === key) : [];
    allTxs = Array.isArray(tRes) ? tRes.filter(t => t.date && String(t.date).slice(0, 10) === key) : [];
  } catch (e) {
    console.warn("No se pudo cargar resumen:", e);
  }

  const txNet = allTxs.reduce((s, t) =>
    s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)), 0);

  const rows = [];
  rows.push(summaryRow("✅", "Completadas", doneTasks.length === 0
    ? "nada marcado"
    : doneTasks.map(t => escapeHtml(t.title)).join(", ")));
  rows.push(summaryRow("📝", "Notas", notes.length === 0 ? "—" : `${notes.length} nota${notes.length === 1 ? "" : "s"}`));
  rows.push(summaryRow("💭", "Capturas", entries.length === 0 ? "—" : `${entries.length} procesada${entries.length === 1 ? "" : "s"}`));
  rows.push(summaryRow("💰", "Movimientos", allTxs.length === 0
    ? "—"
    : `${allTxs.length} · neto ${txNet >= 0 ? "+" : "−"}${Math.abs(txNet).toLocaleString("es-ES")}`));

  return `
    <div class="today-summary">
      <div class="today-summary-title">Resumen del día · solo lectura</div>
      ${rows.join("")}
    </div>
  `;
}

function summaryRow(icon, label, value) {
  return `
    <div class="summary-row">
      <span class="summary-icon">${icon}</span>
      <span class="summary-label">${label}</span>
      <span class="summary-value">${value}</span>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

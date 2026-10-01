/* ============================================
   BRISA - Week Module
   7-day rail: scheduled tasks + events per day
   ============================================ */
import { state } from "./state.js";

let weekOffset = 0;

export function shiftWeek(delta) {
  weekOffset += delta;
  initWeek();
}

function mondayOf(base) {
  const d = new Date(base);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(d) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function fmtTime(dt) {
  return new Date(dt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function fmtRange(ev) {
  const s = fmtTime(ev.start);
  if (!ev.end) return s;
  return `${s} – ${fmtTime(ev.end)}`;
}

export async function initWeek() {
  const section = document.querySelector("#week-section");
  if (!section) return;

  const monday = mondayOf(new Date());
  monday.setDate(monday.getDate() + weekOffset * 7);
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });

  let events = [];
  try {
    const res = await fetch("/api/events");
    if (res.ok) events = await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar eventos:", e);
  }

  const todayKey = dateKey(new Date());
  const byDay = {};
  for (const d of days) byDay[dateKey(d)] = { tasks: [], events: [] };

  for (const t of state.tasks || []) {
    if (t.is_completed || !t.scheduled_datetime) continue;
    const key = dateKey(t.scheduled_datetime);
    if (byDay[key]) byDay[key].tasks.push(t);
  }
  for (const ev of events) {
    if (!ev.start) continue;
    const key = dateKey(ev.start);
    if (byDay[key]) byDay[key].events.push(ev);
  }
  for (const key of Object.keys(byDay)) {
    byDay[key].tasks.sort((a, b) => String(a.scheduled_datetime) > String(b.scheduled_datetime) ? 1 : -1);
    byDay[key].events.sort((a, b) => String(a.start) > String(b.start) ? 1 : -1);
  }

  const rangeLabel = `${days[0].toLocaleDateString("es-ES", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`;

  section.innerHTML = `
    <div class="week-header">
      <div class="week-title">📅 Vista de la semana</div>
      <div class="week-nav">
        <button class="week-btn" id="week-prev" title="Semana anterior">‹</button>
        <div class="week-range">${rangeLabel}</div>
        <button class="week-btn" id="week-next" title="Semana siguiente">›</button>
      </div>
    </div>
    ${days.map(d => {
      const key = dateKey(d);
      const { tasks, events: evs } = byDay[key];
      const isToday = key === todayKey;
      const items = [
        ...evs.map(ev => `
          <div class="week-item">
            <span class="week-dot event"></span>
            <span class="week-item-title" title="${escapeHtml(ev.title)}">${escapeHtml(ev.title)}</span>
            <span class="week-item-time">${fmtRange(ev)}</span>
          </div>`),
        ...tasks.map(t => `
          <button class="week-item" data-focus-task="${t.id}" title="${escapeHtml(t.title)}">
            <span class="week-dot ${t.priority || "medium"}"></span>
            <span class="week-item-title">${escapeHtml(t.title)}</span>
            <span class="week-item-time">${fmtTime(t.scheduled_datetime)}</span>
          </button>`),
      ].join("");
      return `
      <div class="week-day ${isToday ? "today" : ""}">
        <div class="week-date">
          <span class="week-dow">${d.toLocaleDateString("es-ES", { weekday: "short" })}</span>
          <span class="week-num">${d.getDate()}</span>
        </div>
        <div class="week-items">${items || `<span class="week-free">—</span>`}</div>
      </div>`;
    }).join("")}
  `;

  section.querySelector("#week-prev")?.addEventListener("click", () => shiftWeek(-1));
  section.querySelector("#week-next")?.addEventListener("click", () => shiftWeek(1));
  section.querySelectorAll("[data-focus-task]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (window.openFocus) window.openFocus(btn.dataset.focusTask);
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

/* ============================================
   BRISA - Week Module
   7-day rail: scheduled tasks + events per day
   ============================================ */
import { state } from "./state.js";

let weekOffset = 0;
let plannerTab = "hoy";

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

function isMidnight(dt) {
  if (!dt) return false;
  const d = new Date(dt);
  return d.getHours() === 0 && d.getMinutes() === 0;
}

function fmtRange(ev) {
  const s = fmtTime(ev.start);
  if (!ev.end) return isMidnight(ev.start) ? "Todo el día" : s;
  if (isMidnight(ev.start) && isMidnight(ev.end)) return "Todo el día";
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
    <div class="week-tabs">
      <button class="week-tab ${plannerTab === "hoy" ? "active" : ""}" id="week-tab-hoy">Hoy</button>
      <button class="week-tab ${plannerTab === "semana" ? "active" : ""}" id="week-tab-semana">Semana</button>
    </div>
    <div id="week-body"></div>
  `;

  section.querySelector("#week-tab-hoy")?.addEventListener("click", () => { plannerTab = "hoy"; initWeek(); });
  section.querySelector("#week-tab-semana")?.addEventListener("click", () => { plannerTab = "semana"; initWeek(); });

  const body = section.querySelector("#week-body");
  if (plannerTab === "hoy") {
    await renderTodayPlanner(body, events, todayKey);
  } else {
    renderWeekRail(body, days, byDay, todayKey, rangeLabel);
  }
}

async function renderTodayPlanner(body, events, todayKey) {
  let habits = [];
  try {
    const res = await fetch("/api/habits");
    if (res.ok) habits = await res.json();
  } catch {
    habits = [];
  }

  const todayTasks = (state.tasks || []).filter(t =>
    !t.is_completed && t.scheduled_datetime && dateKey(t.scheduled_datetime) === todayKey);
  const todayEvents = (events || []).filter(ev => ev.start && dateKey(ev.start) === todayKey);

  body.innerHTML = `
    <div class="week-header">
      <div class="week-title">Hoy</div>
      <div class="week-range">${new Date().toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })}</div>
    </div>
    <div class="planner-label">Hábitos de hoy</div>
    <div class="planner-habits">
      ${habits.length === 0
        ? `<button class="planner-empty" data-goto-habits>Sin hábitos. Crea el primero →</button>`
        : habits.map(h => `
          <button class="planner-habit ${h.done_today ? "done" : ""}" data-habit="${h.id}">
            <span class="planner-check">${h.done_today ? "✓" : ""}</span>
            <span class="planner-habit-name">${h.icon ? `${escapeHtml(h.icon)} ` : ""}${escapeHtml(h.name)}</span>
          </button>`).join("")}
    </div>
    <div class="planner-label">Agenda</div>
    <div class="week-items">
      ${(todayTasks.length === 0 && todayEvents.length === 0)
        ? `<span class="week-free">Día despejado.</span>`
        : `
          ${todayEvents.map(ev => `
            <button class="week-item" data-open-event="${ev.id}">
              <span class="week-dot event"></span>
              <span class="week-item-title">${escapeHtml(ev.title)}</span>
              <span class="week-item-time">${fmtRange(ev)}</span>
            </button>`).join("")}
          ${todayTasks.map(t => `
            <button class="week-item" data-focus-task="${t.id}">
              <span class="week-dot ${t.priority || "medium"}"></span>
              <span class="week-item-title">${escapeHtml(t.title)}</span>
              <span class="week-item-time">${fmtTime(t.scheduled_datetime)}</span>
            </button>`).join("")}
        `}
    </div>
  `;

  body.querySelector("[data-goto-habits]")?.addEventListener("click", () => {
    document.querySelector('.nav[data-nav="habits"]')?.click();
  });
  body.querySelectorAll("[data-habit]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const done = !btn.classList.contains("done");
      btn.classList.toggle("done", done);
      btn.querySelector(".planner-check").textContent = done ? "✓" : "";
      try {
        await fetch(`/api/habits/${btn.dataset.habit}/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done }),
        });
        if (window.initReadiness) window.initReadiness();
        if (window.initHabits) window.initHabits();
        if (window.initToday) window.initToday();
      } catch (e) {
        console.error("Error marcando hábito:", e);
      }
    });
  });
  wireAgendaButtons(body);
}

function renderWeekRail(body, days, byDay, todayKey, rangeLabel) {
  body.innerHTML = `
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
          <button class="week-item" data-open-event="${ev.id}" title="${escapeHtml(ev.title)}">
            <span class="week-dot event"></span>
            <span class="week-item-title">${escapeHtml(ev.title)}</span>
            <span class="week-item-time">${fmtRange(ev)}</span>
          </button>`),
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

  body.querySelector("#week-prev")?.addEventListener("click", () => shiftWeek(-1));
  body.querySelector("#week-next")?.addEventListener("click", () => shiftWeek(1));
  wireAgendaButtons(body);
}

function wireAgendaButtons(root) {
  root.querySelectorAll("[data-focus-task]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (window.openFocus) window.openFocus(btn.dataset.focusTask);
    });
  });
  root.querySelectorAll("[data-open-event]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (window.openEventDetail) window.openEventDetail(btn.dataset.openEvent);
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

/* ============================================
   BRISA - Week Module
   7-day rail: scheduled tasks + events per day
   ============================================ */
import { state } from "./state.js";

let weekOffset = 0;
let plannerTab = "hoy";
let plannerDayOffset = 0;
let lastDragEnd = 0;

export function shiftDay(delta) {
  plannerDayOffset += delta;
  initWeek();
}

export function resetDay() {
  plannerDayOffset = 0;
  initWeek();
}

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
    const target = new Date();
    target.setDate(target.getDate() + plannerDayOffset);
    await renderTodayPlanner(body, events, dateKey(target), plannerDayOffset);
  } else {
    renderWeekRail(body, days, byDay, todayKey, rangeLabel);
  }
}

function dayLabel(date, offset) {
  if (offset === 0) return "Hoy";
  if (offset === 1) return "Mañana";
  if (offset === -1) return "Ayer";
  return date.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
}

async function renderTodayPlanner(body, events, dayKey, offset) {
  const target = new Date();
  target.setDate(target.getDate() + offset);
  const dateStr = target.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });

  let habits = [];
  try {
    const res = await fetch(`/api/habits?date=${dayKey}`);
    if (res.ok) habits = await res.json();
  } catch {
    habits = [];
  }

  const dayTasks = (state.tasks || []).filter(t =>
    !t.is_completed && (
      (t.scheduled_datetime && dateKey(t.scheduled_datetime) === dayKey) ||
      (!t.scheduled_datetime && t.due_datetime && dateKey(t.due_datetime) === dayKey)
    ));
  const timedTasks = dayTasks
    .filter(t => t.scheduled_datetime)
    .sort((a, b) => String(a.scheduled_datetime) > String(b.scheduled_datetime) ? 1 : -1);
  const untimedTasks = dayTasks.filter(t => !t.scheduled_datetime);
  const dayEvents = (events || [])
    .filter(ev => ev.start && dateKey(ev.start) === dayKey)
    .sort((a, b) => String(a.start) > String(b.start) ? 1 : -1);
  const dueHabits = habits.filter(h => h.due_today !== false);
  const habitAt = (h) => h.default_time ? `${dayKey}T${String(h.default_time).slice(0, 5)}:00` : null;
  const timedHabits = dueHabits
    .filter(h => habitAt(h))
    .sort((a, b) => String(a.default_time) > String(b.default_time) ? 1 : -1);
  const untimedHabits = dueHabits.filter(h => !habitAt(h));

  body.innerHTML = `
    <div class="week-header">
      <div class="week-title">Día</div>
      <div class="week-nav">
        <button class="week-btn" id="day-prev" title="Día anterior">‹</button>
        <button class="week-daylabel" id="day-reset" title="Volver a hoy">${dayLabel(target, offset)}</button>
        <button class="week-btn" id="day-next" title="Día siguiente">›</button>
      </div>
    </div>
    <div class="week-range" style="margin-bottom:2px">${dateStr}</div>
    <div class="planner-label">El día · arrastra para reordenar</div>
    <div class="week-items" id="day-agenda">
      ${(timedTasks.length === 0 && dayEvents.length === 0 && timedHabits.length === 0 && untimedTasks.length === 0 && untimedHabits.length === 0)
        ? (habits.length === 0
          ? `<button class="planner-empty" data-goto-habits>Sin hábitos. Crea el primero →</button>`
          : `<span class="week-free">Día despejado.</span>`)
        : `
          ${mergeAgenda(timedTasks, dayEvents, timedHabits, habitAt).map(item => agendaHtml(item)).join("")}
          ${(untimedTasks.length > 0 || untimedHabits.length > 0) ? `<div class="planner-label">Sin hora</div>` : ""}
          ${untimedHabits.map(h => habitHtml(h, null)).join("")}
          ${untimedTasks.map(t => agendaHtml({ kind: "task", data: t, at: null })).join("")}
        `}
    </div>
    <div id="day-close-slot"></div>
  `;

  body.querySelector("#day-prev")?.addEventListener("click", () => shiftDay(-1));
  body.querySelector("#day-next")?.addEventListener("click", () => shiftDay(1));
  body.querySelector("#day-reset")?.addEventListener("click", () => resetDay());

  body.querySelector("[data-goto-habits]")?.addEventListener("click", () => {
    document.querySelector('.nav[data-nav="habits"]')?.click();
  });
  body.querySelectorAll("[data-habit]").forEach(btn => {
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        btn.click();
      }
    });
    btn.addEventListener("click", async () => {
      if (Date.now() - lastDragEnd < 400) return;
      const done = !btn.classList.contains("done");
      btn.classList.toggle("done", done);
      btn.querySelector(".planner-check").textContent = done ? "✓" : "";
      try {
        await fetch(`/api/habits/${btn.dataset.habit}/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done, date: dayKey }),
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
  wireDayDrag(body);
  await renderDayClose(body, dayKey, offset, dayTasks, habits);
}

function mergeAgenda(tasks, events, habits, habitAt) {
  const items = [
    ...tasks.map(t => ({ kind: "task", data: t, at: t.scheduled_datetime })),
    ...events.map(ev => ({ kind: "event", data: ev, at: ev.start })),
    ...(habits || []).map(h => ({ kind: "habit", data: h, at: habitAt(h) })),
  ];
  items.sort((a, b) => String(a.at) > String(b.at) ? 1 : -1);
  return items;
}

function habitHtml(h, at) {
  return `
    <div class="planner-habit ${h.done_today ? "done" : ""}" draggable="true" data-habit="${h.id}" data-kind="habit" data-at="${at ? escapeHtml(at) : ""}" role="button" tabindex="0" title="Arrastra para mover · clic para marcar">
      <span class="planner-check">${h.done_today ? "✓" : ""}</span>
      <span class="planner-icon">${h.icon ? escapeHtml(h.icon) : "·"}</span>
      <span class="planner-habit-name">${escapeHtml(h.name)}</span>
      ${at ? `<span class="week-item-time">${escapeHtml(String(at).slice(11, 16))}</span>` : `<span class="week-item-time unscheduled">sin hora</span>`}
    </div>`;
}

function agendaHtml(item) {
  if (item.kind === "habit") return habitHtml(item.data, item.at);
  if (item.kind === "event") {
    const ev = item.data;
    return `
      <div class="day-item" draggable="true" data-kind="event" data-id="${ev.id}" data-at="${escapeHtml(ev.start)}">
        <span class="week-dot event"></span>
        <span class="week-item-title">${escapeHtml(ev.title)}</span>
        <span class="week-item-time">${fmtRange(ev)}</span>
      </div>`;
  }
  const t = item.data;
  return `
    <div class="day-item" draggable="true" data-kind="task" data-id="${t.id}" data-at="${escapeHtml(t.scheduled_datetime || "")}">
      <span class="week-dot ${t.priority || "medium"}"></span>
      <span class="week-item-title">${escapeHtml(t.title)}</span>
      ${t.scheduled_datetime
        ? `<span class="week-item-time">${fmtTime(t.scheduled_datetime)}</span>`
        : `<span class="week-item-time unscheduled">sin hora</span>`}
    </div>`;
}

const hhmm = (at) => at ? String(at).slice(11, 16) : null;
const dayOf = (at) => at ? String(at).slice(0, 10) : null;

async function swapAgendaTimes(a, b) {
  const putTaskTime = (id, dt) => fetch(`/api/tasks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scheduled_datetime: dt }),
  });
  const putHabitTime = (id, time) => fetch(`/api/habits/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ default_time: time }),
  });
  try {
    if (a.kind === "task" && b.kind === "task") {
      await Promise.all([putTaskTime(a.id, b.at || null), putTaskTime(b.id, a.at || null)]);
    } else if (a.kind === "habit" && b.kind === "habit") {
      await Promise.all([putHabitTime(a.id, hhmm(b.at)), putHabitTime(b.id, hhmm(a.at))]);
    } else if ((a.kind === "habit" && b.kind === "task") || (a.kind === "task" && b.kind === "habit")) {
      const habit = a.kind === "habit" ? a : b;
      const task = a.kind === "task" ? a : b;
      const timedAt = task.at || habit.at;
      if (!timedAt) return; // both untimed: nothing to exchange
      const day = dayOf(timedAt);
      const habitTime = hhmm(habit.at);
      const taskTime = hhmm(task.at);
      await Promise.all([
        putHabitTime(habit.id, taskTime),
        putTaskTime(task.id, habitTime ? `${day}T${habitTime}:00` : null),
      ]);
    } else {
      // Event involved: both sides need times (events can't be unscheduled)
      if (!a.at || !b.at) return;
      const evs = await fetch("/api/events").then(r => r.ok ? r.json() : []);
      const move = (x, otherAt) => {
        if (x.kind === "task") {
          return putTaskTime(x.id, otherAt);
        }
        if (x.kind === "habit") {
          return putHabitTime(x.id, hhmm(otherAt));
        }
        const ev = evs.find(e => String(e.id) === String(x.id));
        if (!ev) return Promise.resolve();
        const delta = new Date(otherAt).getTime() - new Date(ev.start).getTime();
        const end = ev.end ? new Date(new Date(ev.end).getTime() + delta).toISOString() : null;
        return fetch(`/api/events/${x.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: otherAt, end }),
        });
      };
      await Promise.all([move(a, b.at), move(b, a.at)]);
    }
  } catch (e) {
    console.error("Error reordenando agenda:", e);
  }
  if (window.initTasks) await window.initTasks();
  if (window.initCalendar) window.initCalendar();
  if (window.initToday) window.initToday();
  if (window.initWeek) window.initWeek();
  if (window.initHabits) window.initHabits();
}

function wireDayDrag(body) {
  const agenda = body.querySelector("#day-agenda");
  if (!agenda) return;
  let dragged = null;
  let justDragged = false;

  agenda.querySelectorAll(".day-item, .planner-habit[data-kind]").forEach(el => {
    el.addEventListener("dragstart", () => {
      dragged = { kind: el.dataset.kind, id: el.dataset.id || el.dataset.habit, at: el.dataset.at || null };
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      justDragged = true;
      lastDragEnd = Date.now();
      setTimeout(() => { justDragged = false; }, 300);
      agenda.querySelectorAll(".drop-hint").forEach(x => x.classList.remove("drop-hint"));
    });
    el.addEventListener("dragover", (e) => {
      if (!dragged) return;
      const otherId = el.dataset.id || el.dataset.habit;
      if (String(dragged.id) === String(otherId)) return;
      e.preventDefault();
      el.classList.add("drop-hint");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-hint"));
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.classList.remove("drop-hint");
      const source = dragged;
      dragged = null;
      const target = { kind: el.dataset.kind, id: el.dataset.id || el.dataset.habit, at: el.dataset.at || null };
      if (!source || String(source.id) === String(target.id)) return;
      if ((source.kind === "event" || target.kind === "event") && (!source.at || !target.at)) return;
      await swapAgendaTimes(source, target);
    });
    el.addEventListener("click", () => {
      if (justDragged) return;
      if (el.dataset.kind === "task" && window.openFocus) window.openFocus(el.dataset.id);
      if (el.dataset.kind === "event" && window.openEventDetail) window.openEventDetail(el.dataset.id);
    });
  });
}

async function renderDayClose(body, dayKey, offset, dayTasks, habits) {
  const slot = body.querySelector("#day-close-slot");
  if (!slot) return;
  if (offset > 0) return; // future: nothing to review

  let info = { misses: [], closed: false };
  try {
    const res = await fetch(`/api/days?date=${dayKey}`);
    if (res.ok) info = await res.json();
  } catch {
    return;
  }
  const missed = new Set((info.misses || []).map(m => `${m.kind}:${m.ref_id}`));

  if (info.closed) {
    const n = (info.misses || []).length;
    slot.innerHTML = `
      <div class="day-closed">
        <span>Cierre hecho${n > 0 ? ` · ${n} registrado${n === 1 ? "" : "s"} como no hecho` : " · nada pendiente"}. Sin culpa, es solo registro.</span>
        <button class="week-btn-text" id="day-reopen">Reabrir</button>
      </div>
    `;
    slot.querySelector("#day-reopen")?.addEventListener("click", async () => {
      await fetch("/api/days/close", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: dayKey }),
      });
      if (window.initWeek) window.initWeek();
    });
    return;
  }

  const pendingHabits = (habits || []).filter(h => h.due_today !== false && !h.done_today);
  const pendingTasks = (dayTasks || []).filter(t => !missed.has(`task:${t.id}`));
  const openHabits = pendingHabits.filter(h => !missed.has(`habit:${h.id}`));

  slot.innerHTML = `
    <div class="day-close">
      <div class="planner-label">Cierre del día</div>
      ${(pendingTasks.length === 0 && openHabits.length === 0)
        ? `<span class="week-free">Nada pendiente. Puedes cerrar.</span>`
        : `
          ${pendingTasks.map(t => `
            <div class="miss-row" data-kind="task" data-id="${t.id}">
              <span class="week-item-title">${escapeHtml(t.title)}</span>
              <button class="miss-btn" data-miss="${t.id}">No lo hice</button>
            </div>`).join("")}
          ${openHabits.map(h => `
            <div class="miss-row" data-kind="habit" data-id="${h.id}">
              <span class="week-item-title">${h.icon ? `${escapeHtml(h.icon)} ` : ""}${escapeHtml(h.name)}</span>
              <button class="miss-btn" data-miss="${h.id}">No lo hice</button>
            </div>`).join("")}
        `}
      <button class="modal-btn modal-btn-secondary" id="day-close-btn" style="margin-top:8px">Terminar cierre</button>
    </div>
  `;

  slot.querySelectorAll(".miss-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest(".miss-row");
      const kind = row.dataset.kind;
      const ref = row.dataset.id;
      const marked = btn.classList.contains("on");
      btn.classList.toggle("on", !marked);
      btn.textContent = marked ? "No lo hice" : "Registrado ✓";
      try {
        if (marked) {
          await fetch("/api/days/miss", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ day: dayKey, kind, ref_id: Number(ref) }),
          });
        } else {
          await fetch("/api/days/miss", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ day: dayKey, kind, ref_id: Number(ref) }),
          });
        }
      } catch (e) {
        console.error("Error registrando:", e);
      }
    });
  });

  // Pre-mark already registered ones
  slot.querySelectorAll(".miss-row").forEach(row => {
    if (missed.has(`${row.dataset.kind}:${row.dataset.id}`)) {
      const btn = row.querySelector(".miss-btn");
      btn?.classList.add("on");
      if (btn) btn.textContent = "Registrado ✓";
    }
  });

  slot.querySelector("#day-close-btn")?.addEventListener("click", async () => {
    await fetch("/api/days/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: dayKey }),
    });
    if (window.initWeek) window.initWeek();
  });
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

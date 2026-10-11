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

  const readonly = offset < 0;
  const dayTasks = (state.tasks || []).filter(t =>
    (t.scheduled_datetime && dateKey(t.scheduled_datetime) === dayKey) ||
    (!t.scheduled_datetime && t.due_datetime && dateKey(t.due_datetime) === dayKey)
  );
  const timedTasks = dayTasks
    .filter(t => t.scheduled_datetime)
    .sort((a, b) => String(a.scheduled_datetime) > String(b.scheduled_datetime) ? 1 : -1);
  const untimedTasks = dayTasks.filter(t => !t.scheduled_datetime);
  const dayEvents = (events || [])
    .filter(ev => ev.start && dateKey(ev.start) === dayKey)
    .sort((a, b) => String(a.start) > String(b.start) ? 1 : -1);
  const dueHabits = habits.filter(h => h.due_today !== false);
  const openHabits = readonly ? dueHabits : dueHabits.filter(h => !h.done_today);
  const habitAt = (h) => h.default_time ? `${dayKey}T${String(h.default_time).slice(0, 5)}:00` : null;
  const timedHabits = openHabits
    .filter(h => habitAt(h))
    .sort((a, b) => String(a.default_time) > String(b.default_time) ? 1 : -1);
  const untimedHabits = openHabits.filter(h => !habitAt(h));

  const dayMode = getDayMode();

  // A day counts as reopened when it was closed before (snapshot exists).
  // Closed days show everything including done items, so the user can correct.
  let wasClosed = false;
  try {
    const dayInfo = await fetch(`/api/days?date=${dayKey}`).then(r => r.ok ? r.json() : null);
    wasClosed = !!(dayInfo && dayInfo.closed);
  } catch { /* ignore */ }

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
    <div class="day-modes">
      <button class="week-tab ${dayMode === "hora" ? "active" : ""}" id="mode-hora">Por hora</button>
      <button class="week-tab ${dayMode === "orden" ? "active" : ""}" id="mode-orden">Por orden</button>
    </div>
    <div id="day-board"></div>
    <div id="day-close-slot"></div>
  `;

  body.querySelector("#day-prev")?.addEventListener("click", () => shiftDay(-1));
  body.querySelector("#day-next")?.addEventListener("click", () => shiftDay(1));
  body.querySelector("#day-reset")?.addEventListener("click", () => resetDay());
  body.querySelector("#mode-hora")?.addEventListener("click", () => setDayMode("hora"));
  body.querySelector("#mode-orden")?.addEventListener("click", () => setDayMode("orden"));

  const board = body.querySelector("#day-board");
  if (readonly) board.classList.add("day-readonly");
  if (dayMode === "hora") {
    renderHourGrid(board, dayKey, timedTasks, dayEvents, timedHabits, untimedTasks, untimedHabits, habits, readonly, offset === 0);
  } else {
    await renderOrderList(board, dayKey, dayTasks, dayEvents, dueHabits, readonly, wasClosed);
  }
  wireAgendaButtons(body);
  await renderDayClose(body, dayKey, offset, dayTasks, habits);
}

function getDayMode() {
  try {
    return localStorage.getItem("brisa.dayMode") === "orden" ? "orden" : "hora";
  } catch {
    return "hora";
  }
}

function setDayMode(mode) {
  try {
    localStorage.setItem("brisa.dayMode", mode);
  } catch {
    // ignore
  }
  if (window.initWeek) window.initWeek();
}

// Unified card for every kind: same look, no checks (planning board).
// Marking happens in Hábitos / Acciones.
function dayCard(item, readonly = false) {
  const { kind, data, at } = item;
  const time = at ? String(at).slice(11, 16) : "sin hora";
  const mark = kind === "habit"
    ? `<span class="planner-icon">${data.icon ? escapeHtml(data.icon) : "·"}</span>`
    : `<span class="week-dot ${kind === "event" ? "event" : (data.priority || "medium")}"></span>`;
  const done = kind === "habit" && data.done_today ? " done" : "";
  const hint = readonly
    ? "Día pasado: solo lectura"
    : kind === "habit" ? "Arrastra para mover · se marca en Hábitos" : "Arrastra para mover · clic para abrir";
  return `
    <div class="day-card${done}" ${readonly ? "" : 'draggable="true"'} data-kind="${kind}" data-id="${data.id}" data-at="${at ? escapeHtml(at) : ""}" role="button" tabindex="0" title="${hint}">
      ${mark}
      <span class="week-item-title">${escapeHtml(kind === "habit" ? data.name : data.title)}</span>
      <span class="week-item-time${at ? "" : " unscheduled"}">${time}</span>
    </div>`;
}

function habitAt(dayKey, h) {
  return h.default_time ? `${dayKey}T${String(h.default_time).slice(0, 5)}:00` : null;
}

function collectDayItems(dayKey, dayTasks, dayEvents, dueHabits) {
  const at = (h) => habitAt(dayKey, h);
  const items = [
    ...dayTasks.map(t => ({ kind: "task", data: t, at: t.scheduled_datetime })),
    ...dayEvents.map(ev => ({ kind: "event", data: ev, at: ev.start })),
    ...dueHabits.map(h => ({ kind: "habit", data: h, at: at(h) })),
  ];
  items.sort((a, b) => String(a.at || "") > String(b.at || "") ? 1 : -1);
  return items;
}

// ---- Por hora: grilla 06–23, soltar en una hora define la hora ----
const GRID_START = 6;
const GRID_END = 23;

function renderHourGrid(board, dayKey, timedTasks, dayEvents, timedHabits, untimedTasks, untimedHabits, habits, readonly = false, isToday = false) {
  const byHour = {};
  for (let h = GRID_START; h <= GRID_END; h++) byHour[h] = [];
  const nowHour = new Date().getHours();
  const place = (item) => {
    const hr = Number(String(item.at).slice(11, 13));
    if (byHour[hr]) byHour[hr].push(item);
  };
  timedTasks.forEach(t => place({ kind: "task", data: t, at: t.scheduled_datetime }));
  dayEvents.forEach(ev => place({ kind: "event", data: ev, at: ev.start }));
  timedHabits.forEach(h => place({ kind: "habit", data: h, at: `${dayKey}T${String(h.default_time).slice(0, 5)}:00` }));

  const pool = [
    ...untimedHabits.map(h => ({ kind: "habit", data: h, at: null })),
    ...untimedTasks.map(t => ({ kind: "task", data: t, at: null })),
  ];

  board.innerHTML = `
    <div class="day-grid" id="day-grid">
      <div class="day-pool" id="day-pool">
        <div class="planner-label">Sin hora${readonly ? "" : " · arrastra o Alt+↑↓ para agendar"}</div>
        <div class="day-pool-slot" id="day-pool-slot">
          ${pool.length === 0 ? `<span class="week-free">Nada sin hora.</span>` : pool.map(item => dayCard(item, readonly)).join("")}
        </div>
      </div>
      ${Object.keys(byHour).map(hr => `
        <div class="day-hour${isToday && Number(hr) === nowHour ? " now" : ""}" data-hour="${hr}">
          <span class="day-hour-label">${String(hr).padStart(2, "0")}:00${isToday && Number(hr) === nowHour ? " · ahora" : ""}</span>
          <div class="day-hour-slot" data-hour="${hr}">
            ${byHour[hr].map(item => dayCard(item, readonly)).join("") || `<span class="day-hour-empty">—</span>`}
          </div>
        </div>`).join("")}
    </div>
  `;
  if (!readonly) wireHourDrop(board, dayKey);
  wireDayCards(board);
  if (habits.length === 0) {
    const poolSlot = board.querySelector("#day-pool-slot");
    if (poolSlot && pool.length === 0) {
      poolSlot.innerHTML = `<button class="planner-empty" data-goto-habits>Sin hábitos. Crea el primero →</button>`;
      poolSlot.querySelector("[data-goto-habits]")?.addEventListener("click", () => {
        document.querySelector('.nav[data-nav="habits"]')?.click();
      });
    }
  }
}

function ownMinutes(at) {
  return at ? String(at).slice(14, 16) : "00";
}

async function setItemHour(item, dayKey, hour) {
  const mm = ownMinutes(item.at);
  const at = `${dayKey}T${String(hour).padStart(2, "0")}:${mm}:00`;
  try {
    if (item.kind === "task") {
      await fetch(`/api/tasks/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_datetime: at }),
      });
    } else if (item.kind === "habit") {
      await fetch(`/api/habits/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_time: `${String(hour).padStart(2, "0")}:${mm}` }),
      });
    } else if (item.kind === "event") {
      const evs = await fetch("/api/events").then(r => r.ok ? r.json() : []);
      const ev = evs.find(e => String(e.id) === String(item.id));
      if (!ev) return;
      const delta = new Date(at).getTime() - new Date(ev.start).getTime();
      const end = ev.end ? new Date(new Date(ev.end).getTime() + delta).toISOString() : null;
      await fetch(`/api/events/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: at, end }),
      });
    }
  } catch (e) {
    console.error("Error agendando:", e);
  }
  await refreshDay();
}

async function clearItemHour(item) {
  // Events can't be unscheduled
  if (item.kind === "event") return;
  try {
    if (item.kind === "task") {
      await fetch(`/api/tasks/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_datetime: null }),
      });
    } else if (item.kind === "habit") {
      await fetch(`/api/habits/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default_time: null }),
      });
    }
  } catch (e) {
    console.error("Error quitando hora:", e);
  }
  await refreshDay();
}

async function refreshDay() {
  if (window.initTasks) await window.initTasks();
  if (window.initCalendar) window.initCalendar();
  if (window.initToday) window.initToday();
  if (window.initHabits) window.initHabits();
  if (window.initWeek) window.initWeek();
}

function wireHourDrop(board, dayKey) {
  let dragged = null;
  const grid = board.querySelector("#day-grid");
  // Auto-scroll: dragging near the top/bottom edge scrolls the grid
  grid?.addEventListener("dragover", (e) => {
    if (!dragged) return;
    const r = grid.getBoundingClientRect();
    const margin = 70;
    if (e.clientY < r.top + margin) grid.scrollTop -= 14;
    else if (e.clientY > r.bottom - margin) grid.scrollTop += 14;
  });
  board.querySelectorAll(".day-card").forEach(el => {
    el.addEventListener("keydown", (e) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const hour = Number(el.closest(".day-hour-slot")?.dataset.hour);
      if (isNaN(hour)) return;
      const next = Math.max(GRID_START, Math.min(GRID_END, hour + (e.key === "ArrowUp" ? -1 : 1)));
      if (next === hour) return;
      setItemHour({ kind: el.dataset.kind, id: el.dataset.id, at: el.dataset.at || null }, dayKey, next);
    });
    el.addEventListener("dragstart", () => {
      dragged = { kind: el.dataset.kind, id: el.dataset.id, at: el.dataset.at || null };
      el.classList.add("dragging");
      board.querySelector("#day-grid")?.classList.add("dragging-on");
      lastDragEnd = 0;
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      lastDragEnd = Date.now();
      board.querySelector("#day-grid")?.classList.remove("dragging-on");
      board.querySelectorAll(".drop-hint").forEach(x => x.classList.remove("drop-hint"));
    });
  });
  board.querySelectorAll(".day-hour-slot").forEach(slot => {
    slot.addEventListener("dragover", (e) => {
      if (!dragged) return;
      e.preventDefault();
      slot.classList.add("drop-hint");
    });
    slot.addEventListener("dragleave", () => slot.classList.remove("drop-hint"));
    slot.addEventListener("drop", async (e) => {
      e.preventDefault();
      slot.classList.remove("drop-hint");
      const item = dragged;
      dragged = null;
      if (!item) return;
      await setItemHour(item, dayKey, Number(slot.dataset.hour));
    });
  });
  const pool = board.querySelector("#day-pool-slot");
  if (pool) {
    pool.addEventListener("dragover", (e) => {
      if (!dragged || dragged.kind === "event") return;
      e.preventDefault();
      pool.classList.add("drop-hint");
    });
    pool.addEventListener("dragleave", () => pool.classList.remove("drop-hint"));
    pool.addEventListener("drop", async (e) => {
      e.preventDefault();
      pool.classList.remove("drop-hint");
      const item = dragged;
      dragged = null;
      if (!item || item.kind === "event") return;
      await clearItemHour(item);
    });
  }
}

// ---- Por orden: secuencia sin horas, el orden se guarda ----
async function renderOrderList(board, dayKey, dayTasks, dayEvents, dueHabits, readonly = false, reopened = false) {
  // Past days show everything including done items (review mode).
  // Today shows done items only right after a reopen, so mistakes can be fixed.
  const openHabits = (readonly || reopened) ? dueHabits : dueHabits.filter(h => !h.done_today);
  const openTasks = (readonly || reopened) ? dayTasks : dayTasks.filter(t => !t.is_completed);
  const items = [
    ...openTasks.map(t => ({ kind: "task", data: t, at: t.scheduled_datetime })),
    ...dayEvents.map(ev => ({ kind: "event", data: ev, at: ev.start })),
    ...openHabits.map(h => ({
      kind: "habit", data: h,
      at: h.default_time ? `${dayKey}T${String(h.default_time).slice(0, 5)}:00` : null,
    })),
  ];
  let saved = [];
  try {
    const res = await fetch(`/api/days?date=${dayKey}`);
    if (res.ok) saved = (await res.json()).order || [];
  } catch {
    saved = [];
  }
  const key = (it) => `${it.kind}:${it.data.id}`;
  const byKey = new Map(items.map(it => [key(it), it]));
  const ordered = [];
  for (const s of saved) {
    const it = byKey.get(`${s.kind}:${s.ref_id}`);
    if (it) {
      ordered.push(it);
      byKey.delete(`${s.kind}:${s.ref_id}`);
    }
  }
  // New items not yet ordered go last (timed first, then rest)
  const rest = [...byKey.values()].sort((a, b) => String(a.at || "z") > String(b.at || "z") ? 1 : -1);
  const all = [...ordered, ...rest];

  board.innerHTML = `
    <div class="planner-label">El orden lo defines tú · arrastra o Alt+↑↓ · se guarda solo</div>
    <div class="day-order" id="day-order">
      ${all.length === 0 ? `<span class="week-free">Día despejado.</span>` : all.map(item => dayCard(item, readonly)).join("")}
    </div>
  `;
  wireDayCards(board);
  if (!readonly) wireOrderDrop(board, dayKey);
}

async function saveDayOrder(board, dayKey) {
  const items = [...board.querySelectorAll("#day-order .day-card")].map(el => ({
    kind: el.dataset.kind,
    ref_id: Number(el.dataset.id),
  }));
  try {
    await fetch("/api/days/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: dayKey, items }),
    });
  } catch (e) {
    console.error("Error guardando orden:", e);
  }
}

function wireOrderDrop(board, dayKey) {
  const list = board.querySelector("#day-order");
  if (!list) return;
  let dragged = null;
  const cards = () => [...list.querySelectorAll(".day-card")];

  cards().forEach(el => {
    el.addEventListener("keydown", (e) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      e.preventDefault();
      const sib = e.key === "ArrowUp" ? el.previousElementSibling : el.nextElementSibling;
      if (!sib || !sib.classList.contains("day-card")) return;
      list.insertBefore(el, e.key === "ArrowUp" ? sib : sib.nextSibling);
      el.focus();
      saveDayOrder(board, dayKey);
    });
    el.addEventListener("dragstart", () => {
      dragged = el;
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      lastDragEnd = Date.now();
      list.querySelectorAll(".drop-before, .drop-after").forEach(x =>
        x.classList.remove("drop-before", "drop-after"));
    });
    el.addEventListener("dragover", (e) => {
      if (!dragged || dragged === el) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      el.classList.toggle("drop-before", !after);
      el.classList.toggle("drop-after", after);
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-before", "drop-after"));
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      const after = el.classList.contains("drop-after");
      el.classList.remove("drop-before", "drop-after");
      if (!dragged || dragged === el) return;
      list.insertBefore(dragged, after ? el.nextSibling : el);
      dragged = null;
      await saveDayOrder(board, dayKey);
    });
  });
  // Gaps and empty space: dropping appends at the end (never blocked)
  list.addEventListener("dragover", (e) => {
    if (!dragged) return;
    e.preventDefault();
  });
  list.addEventListener("drop", async (e) => {
    if (e.target.closest(".day-card")) return; // handled by the card
    e.preventDefault();
    if (!dragged) return;
    list.appendChild(dragged);
    dragged = null;
    await saveDayOrder(board, dayKey);
  });
}

// Close confirmation: shows the date and what will be registered as done
async function openCloseConfirm(slot, dayKey, dayTasks, habits, offset) {
  const overlay = document.querySelector("#day-close-modal");
  const titleEl = document.querySelector("#day-close-modal-title");
  const body = document.querySelector("#day-close-modal-body");
  if (!overlay || !body) return;

  // Snapshot BEFORE marking anything as done
  try {
    await fetch("/api/days/snapshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: dayKey }),
    });
  } catch (e) {
    console.error("Error saving snapshot:", e);
  }

  const missed = new Set(
    [...slot.querySelectorAll(".miss-btn.on")].map(b => {
      const row = b.closest(".miss-row");
      return `${row.dataset.kind}:${row.dataset.id}`;
    })
  );

  const doneHabits = (habits || [])
    .filter(h => h.due_today !== false && !h.done_today && !missed.has(`habit:${h.id}`));
  const doneTasks = (dayTasks || []).filter(t => !missed.has(`task:${t.id}`));

  const date = new Date();
  date.setDate(date.getDate() + offset);
  const dateStr = date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });

  titleEl.textContent = `Cerrar día`;
  body.innerHTML = `
    <div class="close-confirm-date">${dateStr}</div>
    ${doneHabits.length === 0 && doneTasks.length === 0
      ? `<span class="week-free">Nada que registrar como hecho.</span>`
      : `
        ${doneHabits.length > 0 ? `
          <div class="close-confirm-label">Hábitos que se marcarán como hechos:</div>
          <div class="close-confirm-list">
            ${doneHabits.map(h => `
              <div class="close-confirm-item">
                <span class="close-confirm-check">✓</span>
                <span>${h.icon ? `${escapeHtml(h.icon)} ` : ""}${escapeHtml(h.name)}</span>
              </div>`).join("")}
          </div>` : ""}
        ${doneTasks.length > 0 ? `
          <div class="close-confirm-label">Acciones que se marcarán como hechas:</div>
          <div class="close-confirm-list">
            ${doneTasks.map(t => `
              <div class="close-confirm-item">
                <span class="close-confirm-check">✓</span>
                <span>${escapeHtml(t.title)}</span>
              </div>`).join("")}
          </div>` : ""}
      `}
    <div class="modal-actions">
      <button class="modal-btn modal-btn-secondary" id="day-close-cancel">Cancelar</button>
      <button class="modal-btn modal-btn-primary" id="day-close-confirm">Confirmar cierre</button>
    </div>
  `;
  overlay.classList.add("active");

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.classList.remove("active");
  });
  body.querySelector("#day-close-cancel")?.addEventListener("click", () => {
    overlay.classList.remove("active");
  });
  body.querySelector("#day-close-modal-close")?.addEventListener("click", () => {
    overlay.classList.remove("active");
  });

  body.querySelector("#day-close-confirm")?.addEventListener("click", async () => {
    for (const h of doneHabits) {
      try {
        await fetch(`/api/habits/${h.id}/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: true, date: dayKey }),
        });
      } catch (e) {
        console.error("Error marcando hábito:", e);
      }
    }
    for (const t of doneTasks) {
      try {
        await fetch(`/api/tasks/${t.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_completed: true, completed_at: new Date().toISOString() }),
        });
      } catch (e) {
        console.error("Error completando tarea:", e);
      }
    }
    await fetch("/api/days/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ day: dayKey }),
    });
    overlay.classList.remove("active");
    if (window.initWeek) window.initWeek();
    if (window.initHabits) window.initHabits();
    if (window.initTasks) window.initTasks();
  });
}

// Clicks + keyboard on day cards (planning board: no checks)
function wireDayCards(board) {
  board.querySelectorAll(".day-card").forEach(el => {
    const open = () => {
      if (Date.now() - lastDragEnd < 400) return;
      if (el.dataset.kind === "task" && window.openFocus) window.openFocus(el.dataset.id);
      else if (el.dataset.kind === "event" && window.openEventDetail) window.openEventDetail(el.dataset.id);
      else if (el.dataset.kind === "habit") document.querySelector('.nav[data-nav="habits"]')?.click();
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

const hhmm = (at) => at ? String(at).slice(11, 16) : null;

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

  slot.querySelector("#day-close-btn")?.addEventListener("click", () => {
    openCloseConfirm(slot, dayKey, dayTasks, habits, offset);
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

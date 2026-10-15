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

  // Timeline markers (tasks + events). Same-hour collisions spread
  // vertically so every marker stays visible and clickable.
  const rawMarkers = [
    ...dayTasks.map(t => {
      const d = new Date(t.scheduled_datetime);
      const overdue = isToday && !t.is_completed && d.getTime() < Date.now();
      return {
        pct: ((d.getHours() + d.getMinutes() / 60) / 24) * 100,
        cls: `today-task ${t.priority || "medium"}${t.is_completed ? " done" : ""}${overdue ? " overdue" : ""}`,
        drag: isToday && !t.is_completed,
        extra: `data-task-id="${t.id}"`,
        title: `${t.title || "Tarea"}${t.is_completed ? " (hecha)" : " · arrástrame para cambiar la hora"}`,
      };
    }),
    ...events.map(ev => {
      const d = new Date(ev.start);
      const evDone = ev.status === "done";
      const evOverdue = isToday && !evDone && d.getTime() < Date.now() && !missAcked(ev.id);
      return {
        pct: ((d.getHours() + d.getMinutes() / 60) / 24) * 100,
        cls: `today-event${evDone ? " done" : ""}${evOverdue ? " overdue" : ""}`,
        drag: isToday && !evDone,
        extra: `data-event-id="${ev.id}"`,
        title: `${ev.title || "Evento"}${evDone ? " (hecho)" : " · arrástrame para cambiar la hora"}`,
      };
    }),
  ];
  const bucketCount = {};
  rawMarkers.forEach(m => {
    const b = Math.round(m.pct * 10) / 10;
    bucketCount[b] = (bucketCount[b] || 0) + 1;
  });
  const bucketSeen = {};
  const markerHtml = rawMarkers.map(m => {
    const b = Math.round(m.pct * 10) / 10;
    const n = bucketCount[b];
    const i = bucketSeen[b] = (bucketSeen[b] || 0) + 1;
    const k = i - 1;
    let topPx = 0, leftPc = 0;
    if (n === 2) {
      topPx = k === 0 ? -11 : 11;
    } else if (n > 2) {
      topPx = k % 2 === 0 ? -11 : 11;
      leftPc = Math.floor(k / 2) * 0.6;
    }
    return `<div class="${m.cls}" style="left: calc(${m.pct}% + ${leftPc}%);${topPx ? `top: calc(50% + ${topPx}px);` : ""}" draggable="${m.drag ? "true" : "false"}" ${m.extra} title="${escapeHtml(m.title)}"></div>`;
  });

  const doneByDay = {};
  for (const t of tasks) {
    if (t.is_completed && t.completed_at) {
      const k = dateKey(new Date(t.completed_at));
      (doneByDay[k] = doneByDay[k] || []).push(t);
    }
  }
  const doneTarget = (doneByDay[key] || []).length;
  const pending = tasks.filter(t => !t.is_completed).length;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const metricText = isToday
    ? `Hoy: ${plural(doneTarget, "cerrada", "cerradas")} · ${plural(pending, "pendiente", "pendientes")}`
    : `${dayLabel(target)}: ${plural(doneTarget, "cerrada", "cerradas")}`;
  // Unscheduled pool: open, no hour hooked yet. Steps are excluded:
  // child steps live in their parent's checklist, event prep in the
  // event detail — here they only add noise. Drag onto the line
  // to schedule today; →mañana pushes it out of today explicitly.
  const poolTasks = isToday ? tasks.filter(t =>
    !t.is_completed && !t.scheduled_datetime && !t.parent_task_id && !t.event_id &&
    (!t.due_datetime || dateKey(t.due_datetime) <= key)).slice(0, 30) : [];

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
    <button class="today-metric" id="today-metric" title="Ver qué se completó cada día">${escapeHtml(metricText)}</button>
    <div class="today-timeline ${isPast ? "past" : ""}">
      ${isToday ? `<div class="today-now" style="left: ${getCurrentTimePercent()}%"></div>` : ""}
      <div class="today-drop-time" id="today-drop-time" style="display:none"></div>
      ${markerHtml}
      <div class="today-pop" id="today-pop" style="display:none"></div>
    </div>
    <div class="today-labels">
      <span class="today-label">00</span>
      <span class="today-label">06</span>
      <span class="today-label">12</span>
      <span class="today-label">18</span>
      <span class="today-label">24</span>
    </div>
    ${poolTasks.length > 0 ? `
    <div class="today-pool-label">Sin hora (${poolTasks.length}) · arrastra a la línea para hoy · →mañana si no es pa hoy</div>
    <div class="today-pool" id="today-pool">
      ${poolTasks.map(t => `
      <span class="today-chip-wrap">
        <button class="today-chip" draggable="true" data-chip="${t.id}" title="Arrastra a la hora · clic para editar fecha">${escapeHtml(t.title)}</button><button class="today-later" data-later="${t.id}" title="No es pa hoy → pasa a mañana">→mañana</button>
      </span>`).join("")}
    </div>` : ""}
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
  section.querySelector("#today-metric")?.addEventListener("click", () => openDoneDetail());

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

// Events acknowledged as done today (session only): no red, no nag.
function missAcked(id) {
  try {
    return (JSON.parse(sessionStorage.getItem("brisa.missAck") || "[]") || []).some(x => String(x) === String(id));
  } catch {
    return false;
  }
}

function wireMarkers(section, dayTasks, events, isToday, key) {
  let markerDragging = false;
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
    el.addEventListener("dragstart", (e) => {
      if (el.getAttribute("draggable") !== "true") {
        e.preventDefault();
        return;
      }
      markerDragging = true;
      e.dataTransfer.setData("text/plain", `task:${el.dataset.taskId}`);
      e.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => {
      setTimeout(() => { markerDragging = false; }, 100);
    });
    el.addEventListener("click", (e) => {
      if (markerDragging) return;
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
    el.addEventListener("dragstart", (e) => {
      if (el.getAttribute("draggable") !== "true") {
        e.preventDefault();
        return;
      }
      markerDragging = true;
      e.dataTransfer.setData("text/plain", `event:${el.dataset.eventId}`);
      e.dataTransfer.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => {
      setTimeout(() => { markerDragging = false; }, 100);
    });
    el.addEventListener("click", (e) => {
      if (markerDragging) return;
      e.stopPropagation();
      if (!isToday) {
        if (window.openEventDetail) window.openEventDetail(el.dataset.eventId);
        return;
      }
      const ev = (events || []).find(x => String(x.id) === String(el.dataset.eventId));
      const overdue = ev && ev.start && ev.status !== "done" && new Date(ev.start).getTime() < Date.now() && !missAcked(ev.id);
      if (!overdue) {
        if (window.openEventDetail) window.openEventDetail(el.dataset.eventId);
        return;
      }
      // Missed event feedback: what happened + move it or leave it.
      // "Hecho" acknowledges it for today (stops the red, no model
      // change: events have no done state). "Dejar así" only closes.
      showPop(el, `
        <div class="today-pop-title">${escapeHtml(ev.title || "Evento")}</div>
        <div class="today-pop-time">⏰ ${overdueText(ev.start)} · ¿lo hiciste o se reprograma?</div>
        <div class="today-pop-actions">
          <button class="modal-btn modal-btn-primary" data-act="done">✓ Hecho</button>
          <button class="modal-btn modal-btn-secondary" data-act="plus1">+1 h</button>
          <button class="modal-btn modal-btn-secondary" data-act="tomorrow">Mañana</button>
          <button class="modal-btn modal-btn-secondary" data-act="leave" title="Solo cierra este aviso">Dejar así</button>
        </div>`);
      const shift = async (fn) => {
        try {
          const cur = await fetch(`/api/events/${ev.id}`).then(r => r.json());
          const s = new Date(cur.start);
          const dur = cur.end ? new Date(cur.end).getTime() - s.getTime() : 0;
          fn(s);
          const body = { start: s.toISOString() };
          if (cur.end) body.end = new Date(s.getTime() + dur).toISOString();
          await fetch(`/api/events/${ev.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          closePop();
          await refreshAll();
        } catch (err) {
          console.error("Error reprogramando evento:", err);
        }
      };
      pop.querySelector('[data-act="plus1"]')?.addEventListener("click", () =>
        shift(s => s.setTime(s.getTime() + 60 * 60000)));
      pop.querySelector('[data-act="tomorrow"]')?.addEventListener("click", () =>
        shift(s => s.setDate(s.getDate() + 1)));
      pop.querySelector('[data-act="leave"]')?.addEventListener("click", closePop);
      pop.querySelector('[data-act="done"]')?.addEventListener("click", () => {
        try {
          const acked = JSON.parse(sessionStorage.getItem("brisa.missAck") || "[]");
          if (!acked.includes(ev.id)) acked.push(ev.id);
          sessionStorage.setItem("brisa.missAck", JSON.stringify(acked));
        } catch {
          // ignore
        }
        closePop();
        if (window.initToday) window.initToday();
      });
    });
  });

  // Pool → timeline: drop a chip on the line to hook an hour (snap :00/:30)
  const line = section.querySelector(".today-timeline");
  let poolDragging = false;
  section.querySelectorAll(".today-chip").forEach(chip => {
    chip.addEventListener("dragstart", (e) => {
      poolDragging = true;
      e.dataTransfer.setData("text/plain", chip.dataset.chip);
      e.dataTransfer.effectAllowed = "move";
    });
    chip.addEventListener("dragend", () => {
      setTimeout(() => { poolDragging = false; }, 100);
    });
    chip.addEventListener("click", () => {
      if (poolDragging) return;
      if (window.openTaskModal) window.openTaskModal(Number(chip.dataset.chip));
    });
  });
  section.querySelectorAll(".today-later").forEach(btn => {
    btn.addEventListener("click", async () => {
      const at = new Date(key + "T00:00:00");
      at.setDate(at.getDate() + 1);
      at.setHours(23, 59, 0, 0);
      btn.disabled = true;
      try {
        await fetch(`/api/tasks/${btn.dataset.later}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduled_datetime: null, due_datetime: at.toISOString() }),
        });
        await refreshAll();
      } catch (err) {
        console.error("Error posponiendo:", err);
        btn.disabled = false;
      }
    });
  });
  if (line && isToday) {
    const dropHint = section.querySelector("#today-drop-time");
    const paintDropTime = (clientX) => {
      if (!dropHint) return;
      const r = line.getBoundingClientRect();
      const pct = Math.min(0.99, Math.max(0, (clientX - r.left) / r.width));
      const mins = Math.round((pct * 24 * 60) / 30) * 30;
      const hh = String(Math.floor(mins / 60)).padStart(2, "0");
      const mm = String(mins % 60).padStart(2, "0");
      dropHint.textContent = `${hh}:${mm}`;
      dropHint.style.left = `${pct * 100}%`;
      dropHint.style.display = "";
    };
    const hideDropTime = () => {
      if (dropHint) dropHint.style.display = "none";
    };
    line.addEventListener("dragover", (e) => {
      if (![...e.dataTransfer.types].includes("text/plain")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      line.classList.add("drop-hint");
      paintDropTime(e.clientX);
    });
    line.addEventListener("dragleave", () => { line.classList.remove("drop-hint"); hideDropTime(); });
    line.addEventListener("drop", async (e) => {
      const raw = e.dataTransfer.getData("text/plain");
      line.classList.remove("drop-hint");
      hideDropTime();
      if (!raw) return;
      const isEvent = raw.startsWith("event:");
      const isMarker = raw.startsWith("task:");
      const id = isEvent ? raw.slice(6) : isMarker ? raw.slice(5) : raw;
      if (isEvent && !section.querySelector(`.today-event[data-event-id="${id}"]`)) return;
      if (isMarker && !section.querySelector(`.today-task[data-task-id="${id}"]`)) return;
      if (!isEvent && !isMarker && !section.querySelector(`.today-chip[data-chip="${id}"]`)) return;
      e.preventDefault();
      const r = line.getBoundingClientRect();
      const pct = Math.min(0.99, Math.max(0, (e.clientX - r.left) / r.width));
      const mins = Math.round((pct * 24 * 60) / 30) * 30;
      const at = new Date(key + "T00:00:00");
      at.setMinutes(mins);
      if (isEvent) {
        try {
          const cur = await fetch(`/api/events/${id}`).then(r => r.json());
          const dur = cur.end ? new Date(cur.end).getTime() - new Date(cur.start).getTime() : 0;
          const body = { start: at.toISOString() };
          if (cur.end) body.end = new Date(at.getTime() + dur).toISOString();
          await fetch(`/api/events/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          await refreshAll();
        } catch (err) {
          console.error("Error moviendo evento:", err);
        }
        return;
      }
      try {
        await fetch(`/api/tasks/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduled_datetime: at.toISOString() }),
        });
        await refreshAll();
      } catch (err) {
        console.error("Error agendando:", err);
      }
    });
  }

  if (!section.dataset.dismissBound) {
    section.dataset.dismissBound = "1";
    document.addEventListener("dragend", () => {
      const h = document.querySelector("#today-drop-time");
      if (h) h.style.display = "none";
      document.querySelector(".today-timeline.drop-hint")?.classList.remove("drop-hint");
    });
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

// Read-only detail: today at a glance (done, scheduled, floating)
// plus the 6 previous days. Evidence, never score: no totals
// as goals, no streaks — just a satisfying progress bar.
async function openDoneDetail() {
  const overlay = document.querySelector("#done-modal");
  const list = document.querySelector("#done-list");
  if (!overlay || !list) return;
  const all = state.tasks || [];
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayKey = keyOf(now);

  let todayEvents = [];
  try {
    const res = await fetch(`/api/events?date=${todayKey}`);
    if (res.ok) todayEvents = await res.json();
  } catch {
    todayEvents = [];
  }
  const evOpen = todayEvents
    .filter(e => e.status !== "done")
    .sort((a, b) => new Date(a.start) - new Date(b.start));
  const evDone = todayEvents
    .filter(e => e.status === "done" && e.completed_at && keyOf(new Date(e.completed_at)) === todayKey)
    .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));

  const doneToday = all
    .filter(t => t.is_completed && t.completed_at && keyOf(new Date(t.completed_at)) === todayKey)
    .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
  const scheduledToday = all
    .filter(t => !t.is_completed && t.scheduled_datetime && keyOf(new Date(t.scheduled_datetime)) === todayKey)
    .sort((a, b) => new Date(a.scheduled_datetime) - new Date(b.scheduled_datetime));
  const floating = all
    .filter(t => !t.is_completed && !t.scheduled_datetime && !t.due_datetime && !t.parent_task_id && !t.event_id);

  // Midnight means date-only (no real hour): last, with a dash.
  const hasHour = (iso) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getHours() !== 0 || d.getMinutes() !== 0;
  };
  const programmed = [
    ...scheduledToday.map(t => ({ title: t.title, iso: t.scheduled_datetime, timed: hasHour(t.scheduled_datetime) })),
    ...evOpen.map(e => ({ title: e.title, iso: e.start, timed: hasHour(e.start) })),
  ].sort((a, b) => {
    if (a.timed !== b.timed) return a.timed ? -1 : 1;
    if (!a.timed) return String(a.title).localeCompare(String(b.title));
    return new Date(a.iso) - new Date(b.iso);
  });

  const doneCount = doneToday.length + evDone.length;
  const dayTotal = doneCount + programmed.length;
  const pct = dayTotal === 0 ? 0 : Math.round((doneCount / dayTotal) * 100);

  const itemRow = (t, right, done = false) => `
    <div class="done-item${done ? " is-done" : ""}" title="${escapeHtml(t.title)}${right ? ` · ${escapeHtml(right)}` : ""}">
      <span class="done-check">${done ? "✓" : "○"}</span>
      <span class="done-title">${escapeHtml(t.title)}</span>
      ${right ? `<small>${escapeHtml(right)}</small>` : ""}
    </div>`;
  const timeOf = (iso) => new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const past = [];
  for (let back = 1; back < 7; back++) {
    const d = new Date(now);
    d.setDate(d.getDate() - back);
    const k = keyOf(d);
    const done = all
      .filter(t => t.is_completed && t.completed_at && keyOf(new Date(t.completed_at)) === k)
      .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));
    if (done.length === 0) continue;
    const label = d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });
    past.push(`
      <div class="done-day">
        <div class="done-day-head"><span>${escapeHtml(label)}</span><span>${done.length === 1 ? "1 cerrada" : `${done.length} cerradas`}</span></div>
        ${done.map(t => itemRow(t, timeOf(t.completed_at), true)).join("")}
      </div>`);
  }

  list.innerHTML = `
    <div class="done-hero">
      <div class="done-hero-top"><span>Hoy</span><span>${doneCount === 1 ? "1 cerrada" : `${doneCount} cerradas`}</span></div>
      <div class="done-bar"><span style="width:${pct}%"></span></div>
      ${doneCount > 0 ? `<div class="done-cheer">Lo hecho, hecho está. ✓</div>` : ""}
    </div>
    ${programmed.length > 0 ? `
    <div class="done-day">
      <div class="done-day-head"><span>Programadas para hoy</span><span>${programmed.length}</span></div>
      ${programmed.map(p => itemRow({ title: p.title }, p.timed ? timeOf(p.iso) : "—")).join("")}
    </div>` : ""}
    ${floating.length > 0 ? `
    <div class="done-day">
      <div class="done-day-head"><span>Flotantes · sin fecha</span><span>${floating.length}</span></div>
      ${floating.map(t => itemRow(t, "")).join("")}
    </div>` : ""}
    ${doneCount > 0 ? `
    <div class="done-day">
      <div class="done-day-head"><span>Cerradas hoy</span><span>✓</span></div>
      ${doneToday.map(t => itemRow(t, timeOf(t.completed_at), true)).join("")}
      ${evDone.map(e => itemRow(e, timeOf(e.completed_at), true)).join("")}
    </div>` : ""}
    ${past.join("")}
  `;
  overlay.classList.add("active");
}

if (typeof window !== "undefined") {
  window.openDoneDetail = openDoneDetail;
  document.querySelector("#done-modal-close")?.addEventListener("click", () => {
    document.querySelector("#done-modal")?.classList.remove("active");
  });
  document.querySelector("#done-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "done-modal") e.target.classList.remove("active");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") document.querySelector("#done-modal")?.classList.remove("active");
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

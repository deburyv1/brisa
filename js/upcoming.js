/* ============================================
   BRISA - Upcoming Module
   Escalating attention for tasks and event leave times:
   10 min -> silent pill
    5 min -> chime + system notification + flashing title
    0 min -> fullscreen takeover until dismissed
   Polls while the app is open; snooze supported.
   ============================================ */
import { state } from "./state.js";

const WINDOW_MIN = 10;
const WARN_MIN = 5;
const DISMISSED_KEY = "brisa.upcomingDismissed";
const SNOOZE_KEY = "brisa.upcomingSnooze";

let titleFlashId = null;
let alarmTimers = [];
let baseTitle = document.title;

function readSet(key) {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(key) || "[]"));
  } catch {
    return new Set();
  }
}

function writeSet(key, set) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function hidePill() {
  document.querySelector(".upcoming-pill")?.remove();
}

function minutesUntil(dt) {
  return (new Date(dt).getTime() - Date.now()) / 60000;
}

function leaveTime(ev) {
  if (!ev || !ev.start) return null;
  const travel = Number(ev.travel_minutes) || 0;
  return new Date(new Date(ev.start).getTime() - travel * 60000);
}

function chime(times = 3) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    let t = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.55);
      t += 0.7;
    }
  } catch (e) {
    console.warn("Audio no disponible:", e);
  }
}

function notify(title, body) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then(p => {
        if (p === "granted") {
          try {
            new Notification(title, { body });
          } catch {
            // ignore
          }
        }
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

function startTitleFlash(text) {
  stopTitleFlash();
  let on = false;
  titleFlashId = setInterval(() => {
    on = !on;
    document.title = on ? text : baseTitle;
  }, 1000);
}

function stopTitleFlash() {
  if (titleFlashId) {
    clearInterval(titleFlashId);
    titleFlashId = null;
  }
  document.title = baseTitle;
}

function stopTakeoverSound() {
  alarmTimers.forEach(clearInterval);
  alarmTimers = [];
}

function showTakeover(item, kind, lateLeave, started = false) {
  stopTakeoverSound();
  document.querySelector("#upcoming-takeover")?.remove();
  chime(4);
  alarmTimers.push(setInterval(() => chime(4), 8000));

  const isEvent = kind === "event";
  const isReminder = kind === "reminder";
  const isTask = kind === "task";
  const heading = isReminder ? "🔔 ¡Recuerda!" : !isEvent ? "⏰ ¡Ahora!" : started ? "📅 ¿Estás en eso?" : item.travel_minutes ? "🚌 ¡Sal ya!" : "📅 ¡Ahora!";
  const sub = lateLeave && item.travel_minutes
    ? `Debiste salir hace ${Math.max(1, Math.round(-(new Date(item.start).getTime() - Number(item.travel_minutes) * 60000 - Date.now()) / 60000))} min. Sin culpa: parte ahora.`
    : isReminder ? "No se calla hasta que lo marques hecho o lo pospongas."
    : started ? "Si ya partió, abre Ver. Si no, pospón 5 min o descártalo sin culpa."
    : "Lo que hiciste cuenta, aunque no esté terminado.";

  const overlay = document.createElement("div");
  overlay.className = "timer-alarm";
  overlay.id = "upcoming-takeover";
  overlay.innerHTML = `
    <div class="timer-alarm-card">
      <h2>${heading}</h2>
      <p>${escapeHtml(item.title)}</p>
      <p style="font-size:11px;opacity:.85">${sub}</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${isReminder
          ? `<button class="modal-btn modal-btn-primary" id="upcoming-done">Hecho ✓</button>`
          : `<button class="modal-btn modal-btn-primary" id="upcoming-go">Ver</button>`}
        <button class="modal-btn modal-btn-secondary" id="upcoming-snooze">5 min más</button>
        <button class="modal-btn modal-btn-secondary" id="upcoming-drop">Descartar</button>
      </div>
      ${isTask ? `
      <div class="takeover-exchange">
        <button class="takeover-exchange-open" id="upcoming-exchange-open">No la hago ahora, la hago después</button>
        <div class="takeover-exchange-body" id="upcoming-exchange-body" hidden>
          <div class="takeover-exchange-label">Intercambio: se va para después y, a cambio, escribes el primer paso pequeño.</div>
          <input type="text" id="upcoming-first-step" class="takeover-input" maxlength="160" autocomplete="off" placeholder="Primer paso, corto y concreto">
          <div class="takeover-exchange-actions">
            <button class="modal-btn modal-btn-primary" id="upcoming-exchange-hour">Guardar y +1 h</button>
            <button class="modal-btn modal-btn-primary" id="upcoming-exchange-tomorrow">Guardar y mañana</button>
          </div>
          <div class="takeover-exchange-hint" id="upcoming-exchange-hint" hidden>Sin el primer paso no hay intercambio: así después partes sin pensar.</div>
        </div>
      </div>` : ""}
    </div>
  `;
  overlay.querySelector("#upcoming-go")?.addEventListener("click", () => {
    stopTakeover();
    if (isEvent) {
      if (window.openEventDetail) window.openEventDetail(item.id);
    } else if (window.openFocus) {
      window.openFocus(item.id);
    }
  });
  overlay.querySelector("#upcoming-done")?.addEventListener("click", async () => {
    try {
      await fetch(`/api/reminders/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      });
    } catch {
      // ignore
    }
    stopTakeover();
  });
  overlay.querySelector("#upcoming-snooze")?.addEventListener("click", () => {
    const snoozed = readSet(SNOOZE_KEY);
    snoozed.add(`${snoozeKey(kind, item.id)}:${Date.now() + 5 * 60 * 1000}`);
    writeSet(SNOOZE_KEY, snoozed);
    stopTakeover();
  });
  overlay.querySelector("#upcoming-drop")?.addEventListener("click", () => {
    const dismissed = readSet(DISMISSED_KEY);
    dismissed.add(snoozeKey(kind, item.id));
    writeSet(DISMISSED_KEY, dismissed);
    stopTakeover();
    hidePill();
  });
  overlay.querySelector("#upcoming-exchange-open")?.addEventListener("click", () => {
    const body = overlay.querySelector("#upcoming-exchange-body");
    if (!body) return;
    const hint = overlay.querySelector("#upcoming-exchange-hint");
    if (hint) {
      hint.textContent = "Sin el primer paso no hay intercambio: así después partes sin pensar.";
      hint.hidden = true;
    }
    body.hidden = false;
    overlay.querySelector("#upcoming-exchange-open").hidden = true;
    overlay.querySelector("#upcoming-first-step")?.focus({ preventScroll: true });
  });
  const saveExchange = async (when) => {
    const input = overlay.querySelector("#upcoming-first-step");
    const step = (input?.value || "").trim();
    if (!step) {
      const hint = overlay.querySelector("#upcoming-exchange-hint");
      if (hint) hint.hidden = false;
      input?.focus({ preventScroll: true });
      return;
    }
    let at;
    if (when === "hour") {
      at = new Date(Date.now() + 60 * 60000);
    } else {
      at = new Date(item.scheduled_datetime || Date.now());
      at.setDate(at.getDate() + 1);
    }
    try {
      const res = await fetch(`/api/tasks/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ first_step: step, scheduled_datetime: at.toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error("No se pudo guardar el intercambio:", e);
      const hint = overlay.querySelector("#upcoming-exchange-hint");
      if (hint) {
        hint.textContent = "No se pudo guardar. Intenta de nuevo.";
        hint.hidden = false;
      }
      return;
    }
    stopTakeover();
    hidePill();
    if (window.initTasks) await window.initTasks();
    if (window.initToday) window.initToday();
    if (window.renderNext) window.renderNext();
    if (window.initWeek) window.initWeek();
  };
  overlay.querySelector("#upcoming-exchange-hour")?.addEventListener("click", () => saveExchange("hour"));
  overlay.querySelector("#upcoming-exchange-tomorrow")?.addEventListener("click", () => saveExchange("tomorrow"));
  document.body.appendChild(overlay);
  // Focus the primary action: Enter/Space accept natively
  overlay.querySelector("#upcoming-go, #upcoming-done")?.focus({ preventScroll: true });
}

function stopTakeover() {
  stopTakeoverSound();
  stopTitleFlash();
  document.querySelector("#upcoming-takeover")?.remove();
}

function snoozeKey(kind, id) {
  return `${kind}:${id}`;
}

async function check() {
  const dismissed = readSet(DISMISSED_KEY);
  const snoozedRaw = readSet(SNOOZE_KEY);
  const now = Date.now();
  // Snooze entries expire after 5 minutes: "kind:id:timestamp"
  const snoozed = new Set(
    [...snoozedRaw].filter(k => {
      const parts = String(k).split(":");
      const until = Number(parts[parts.length - 1]);
      return Number.isFinite(until) && until > now;
    }).map(k => {
      const parts = String(k).split(":");
      parts.pop();
      return parts.join(":");
    })
  );

  const taskHit = (state.tasks || [])
    .filter(t => !t.is_completed && t.scheduled_datetime)
    .map(t => ({ kind: "task", item: t, min: minutesUntil(t.scheduled_datetime) }))
    .filter(x => x.min > -15 && x.min <= WINDOW_MIN && !dismissed.has(snoozeKey("task", x.item.id)) && !snoozed.has(snoozeKey("task", x.item.id)))
    .sort((a, b) => a.min - b.min)[0];

  let eventHit = null;
  // Fresh fetch every poll: a tab left open sees events created
  // later the same day (the session cache is only fallback).
  let dayEvents = [];
  try {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const res = await fetch(`/api/events?date=${key}`);
    if (res.ok) dayEvents = await res.json();
    else throw new Error("fallback");
  } catch {
    try {
      dayEvents = JSON.parse(sessionStorage.getItem("brisa.todayEvents") || "[]");
    } catch {
      dayEvents = [];
    }
  }
  eventHit = dayEvents
    .map(ev => {
      const leave = leaveTime(ev);
      if (!leave) return null;
      const minLeave = (leave.getTime() - now) / 60000;
      const minStart = minutesUntil(ev.start);
      if (minStart <= -5) return null;
      return { kind: "event", item: ev, min: minLeave, leave: true, started: minStart <= 0 };
    })
    .filter(x => x && x.item.status === "open" && x.min <= WINDOW_MIN && !dismissed.has(snoozeKey("event", x.item.id)) && !snoozed.has(snoozeKey("event", x.item.id)))
    .sort((a, b) => a.min - b.min)[0];

  // Reminders: extreme ones jump straight to takeover at due time,
  // normal ones follow the same 3-stage escalation.
  let reminderHit = null;
  try {
    const res = await fetch("/api/reminders?pending=1");
    if (res.ok) {
      const rems = await res.json();
      reminderHit = rems
        .filter(r => r.remind_at)
        .map(r => ({ kind: "reminder", item: r, min: minutesUntil(r.remind_at) }))
        .filter(x => x.min > -15 && x.min <= WINDOW_MIN && !dismissed.has(snoozeKey("reminder", x.item.id)) && !snoozed.has(snoozeKey("reminder", x.item.id)))
        .sort((a, b) => a.min - b.min)[0];
    }
  } catch {
    reminderHit = null;
  }

  const upcoming = [taskHit, eventHit, reminderHit].filter(Boolean).sort((a, b) => a.min - b.min)[0];
  if (!upcoming) {
    hidePill();
    return;
  }

  const isEvent = upcoming.kind === "event";
  const isReminder = upcoming.kind === "reminder";
  const lateLeave = isEvent && upcoming.item.travel_minutes && upcoming.min < 0;
  const key = snoozeKey(upcoming.kind, upcoming.item.id);
  const label = lateLeave
    ? "¡Sal ya!"
    : upcoming.min < 1
      ? "Ahora mismo"
      : isEvent && upcoming.item.travel_minutes
        ? `Sal en ${Math.ceil(upcoming.min)} min`
        : `En ${Math.ceil(upcoming.min)} min`;

  // Stage 1: silent pill (always while in window)
  const existing = document.querySelector(".upcoming-pill");
  if (existing) {
    if (existing.dataset.key === key) {
      const strong = existing.querySelector("strong");
      if (strong) strong.textContent = label;
    } else {
      existing.remove();
    }
  }
  if (!document.querySelector(".upcoming-pill")) {
    const pill = document.createElement("div");
    pill.className = "upcoming-pill";
    pill.dataset.key = key;
    pill.innerHTML = `
      <strong>${label}:</strong>
      <span>${escapeHtml(upcoming.item.title)}</span>
      <button class="upcoming-dismiss" title="Ocultar">✕</button>
    `;
    pill.querySelector(".upcoming-dismiss")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const d = readSet(DISMISSED_KEY);
      d.add(key);
      writeSet(DISMISSED_KEY, d);
      stopTitleFlash();
      hidePill();
    });
    pill.addEventListener("click", () => {
      hidePill();
      stopTitleFlash();
      if (isEvent) {
        if (window.openEventDetail) window.openEventDetail(upcoming.item.id);
      } else if (!isReminder && window.openFocus) {
        window.openFocus(upcoming.item.id);
      }
    });
    document.body.appendChild(pill);
  }

  // Extreme reminders skip the silent stages: takeover as soon as due
  if (isReminder && upcoming.item.extreme && upcoming.min <= 0 && !document.querySelector("#upcoming-takeover")) {
    chime(3);
    notify("Brisa · urgente", upcoming.item.title);
    showTakeover(upcoming.item, "reminder", false);
    return;
  }

  // Stage 2: chime + notification + title at 5 min (once per key)
  const warned = readSet("brisa.upcomingWarned");
  if (upcoming.min <= WARN_MIN && !warned.has(key)) {
    warned.add(key);
    writeSet("brisa.upcomingWarned", warned);
    chime(3);
    notify("Brisa", `${label}: ${upcoming.item.title}`);
    startTitleFlash(`⏰ ${label} — ${upcoming.item.title}`.slice(0, 60));
  }

  // Stage 3: fullscreen takeover at zero
  if (upcoming.min <= 0 && !document.querySelector("#upcoming-takeover")) {
    showTakeover(upcoming.item, upcoming.kind, lateLeave, !!upcoming.started);
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function initUpcoming() {
  check();
  setInterval(check, 30000);
}

export { check as checkUpcoming };

/* ============================================
   BRISA - Upcoming Module
   Floating pill when a scheduled task starts within 10 min.
   Polls while the app is open; dismiss is per task (session).
   ============================================ */
import { state } from "./state.js";

const WINDOW_MIN = 10;
const DISMISSED_KEY = "brisa.upcomingDismissed";

function getDismissed() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function hidePill() {
  document.querySelector(".upcoming-pill")?.remove();
}

function minutesUntil(dt) {
  return (new Date(dt).getTime() - Date.now()) / 60000;
}

function check() {
  const dismissed = getDismissed();
  const taskHit = (state.tasks || [])
    .filter(t => !t.is_completed && t.scheduled_datetime)
    .map(t => ({ kind: "task", item: t, at: t.scheduled_datetime, min: minutesUntil(t.scheduled_datetime) }))
    .filter(x => x.min > 0 && x.min <= WINDOW_MIN && !dismissed.has(`task:${x.item.id}`))
    .sort((a, b) => a.min - b.min)[0];

  let eventHit = null;
  try {
    const cached = JSON.parse(sessionStorage.getItem("brisa.todayEvents") || "[]");
    eventHit = cached
      .map(ev => ({ kind: "event", item: ev, at: ev.start, min: minutesUntil(ev.start) }))
      .filter(x => x.min > 0 && x.min <= WINDOW_MIN && !dismissed.has(`event:${x.item.id}`))
      .sort((a, b) => a.min - b.min)[0];
  } catch {
    eventHit = null;
  }

  const upcoming = [taskHit, eventHit].filter(Boolean).sort((a, b) => a.min - b.min)[0];

  const existing = document.querySelector(".upcoming-pill");
  if (!upcoming) {
    hidePill();
    return;
  }

  const key = `${upcoming.kind}:${upcoming.item.id}`;
  const label = upcoming.min < 1
    ? "Ahora mismo"
    : `En ${Math.ceil(upcoming.min)} min`;

  if (existing) {
    if (existing.dataset.key === key) {
      const strong = existing.querySelector("strong");
      if (strong) strong.textContent = label;
      return;
    }
    existing.remove();
  }

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
    const set = getDismissed();
    set.add(String(key));
    try {
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
    } catch {
      // ignore
    }
    hidePill();
  });
  pill.addEventListener("click", () => {
    hidePill();
    if (upcoming.kind === "event") {
      if (window.openEventDetail) window.openEventDetail(upcoming.item.id);
    } else if (window.openFocus) {
      window.openFocus(upcoming.item.id);
    }
  });
  document.body.appendChild(pill);
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

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

function dismiss(id) {
  const set = getDismissed();
  set.add(String(id));
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
  hidePill();
}

function hidePill() {
  document.querySelector(".upcoming-pill")?.remove();
}

function minutesUntil(dt) {
  return (new Date(dt).getTime() - Date.now()) / 60000;
}

function check() {
  const dismissed = getDismissed();
  const upcoming = (state.tasks || [])
    .filter(t => !t.is_completed && t.scheduled_datetime)
    .map(t => ({ task: t, min: minutesUntil(t.scheduled_datetime) }))
    .filter(x => x.min > 0 && x.min <= WINDOW_MIN && !dismissed.has(String(x.task.id)))
    .sort((a, b) => a.min - b.min)[0];

  const existing = document.querySelector(".upcoming-pill");
  if (!upcoming) {
    hidePill();
    return;
  }

  const label = upcoming.min < 1
    ? "Ahora mismo"
    : `En ${Math.ceil(upcoming.min)} min`;

  if (existing) {
    if (existing.dataset.taskId == String(upcoming.task.id)) {
      const strong = existing.querySelector("strong");
      if (strong) strong.textContent = label;
      return;
    }
    existing.remove();
  }

  const pill = document.createElement("div");
  pill.className = "upcoming-pill";
  pill.dataset.taskId = upcoming.task.id;
  pill.innerHTML = `
    <strong>${label}:</strong>
    <span>${escapeHtml(upcoming.task.title)}</span>
    <button class="upcoming-dismiss" title="Ocultar">✕</button>
  `;
  pill.querySelector(".upcoming-dismiss")?.addEventListener("click", (e) => {
    e.stopPropagation();
    dismiss(upcoming.task.id);
  });
  pill.addEventListener("click", () => {
    hidePill();
    if (window.openFocus) window.openFocus(upcoming.task.id);
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

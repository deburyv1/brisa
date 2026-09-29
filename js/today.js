/* ============================================
   BRISA - Today Module
   Day timeline with current time and task markers
   ============================================ */
import { state } from "./state.js";

function getCurrentTimePercent() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return ((hours + minutes / 60) / 24) * 100;
}

function formatTime(date) {
  return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

export async function initToday() {
  const section = document.querySelector("#today-section");
  if (!section) return;

  const nowPercent = getCurrentTimePercent();
  const timeStr = formatTime(new Date());

  const tasks = state.tasks || [];

  let events = [];
  try {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const res = await fetch(`/api/events?date=${todayStr}`);
    if (res.ok) events = await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar eventos:", e);
  }

  section.innerHTML = `
    <div class="today-header">
      <div class="today-title">Tu día</div>
      <div class="today-time">${timeStr}</div>
    </div>
    <div class="today-timeline">
      <div class="today-now" style="left: ${nowPercent}%"></div>
      ${tasks.map(t => {
        if (!t.scheduled_datetime) return "";
        const d = new Date(t.scheduled_datetime);
        const percent = ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
        return `<div class="today-task ${t.priority || "medium"}" style="left: ${percent}%" title="${escapeHtml(t.title || "Tarea")}"></div>`;
      }).join("")}
      ${events.map(ev => {
        const d = new Date(ev.start);
        const percent = ((d.getHours() + d.getMinutes() / 60) / 24) * 100;
        return `<div class="today-event" style="left: ${percent}%" title="${escapeHtml(ev.title || "Evento")}"></div>`;
      }).join("")}
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
  `;

  const timeEl = section.querySelector(".today-time");
  if (timeEl) {
    setInterval(() => {
      timeEl.textContent = formatTime(new Date());
    }, 1000);
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

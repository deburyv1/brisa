/* ============================================
   BRISA - Focus Mode
   One micro-step at a time. Imperfect is allowed.
   Fights prerequisite paralysis:
   1. Only the next physical step is shown (rest hidden)
   2. Everything goes to ONE staging spot (no decisions)
   3. Time-boxed so "forever" never appears
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";

let currentTask = null;
let timerId = null;
let remainingSec = 10 * 60;

export function openFocus(taskId) {
  const task = (state.tasks || []).find(t => t.id == taskId);
  if (!task) return;
  currentTask = task;

  const overlay = document.querySelector("#focus-modal");
  if (!overlay) return;

  overlay.querySelector("#focus-title").textContent = task.title;
  overlay.querySelector("#focus-step").textContent =
    task.first_step || "Empieza por lo más chico que veas.";
  setTimer(10);
  overlay.classList.add("active");
}

function setTimer(minutes) {
  stopTimer();
  remainingSec = minutes * 60;
  paintTimer();
  document.querySelectorAll(".focus-time-btn").forEach(b =>
    b.classList.toggle("selected", Number(b.dataset.min) === minutes));
}

function paintTimer() {
  const el = document.querySelector("#focus-timer");
  if (!el) return;
  const m = Math.floor(remainingSec / 60);
  const s = remainingSec % 60;
  el.textContent = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  const btn = document.querySelector("#focus-timer-toggle");
  if (btn) btn.textContent = "Iniciar";
}

export function initFocus() {
  const overlay = document.querySelector("#focus-modal");
  if (!overlay) return;

  overlay.querySelector("#focus-close")?.addEventListener("click", closeFocus);
  overlay.querySelector("#focus-done")?.addEventListener("click", completeTask);
  overlay.querySelector("#focus-later")?.addEventListener("click", closeFocus);

  overlay.querySelectorAll(".focus-time-btn").forEach(b =>
    b.addEventListener("click", () => setTimer(Number(b.dataset.min))));

  overlay.querySelector("#focus-timer-toggle")?.addEventListener("click", () => {
    if (timerId) {
      stopTimer();
      return;
    }
    document.querySelector("#focus-timer-toggle").textContent = "Pausar";
    timerId = setInterval(() => {
      remainingSec = Math.max(0, remainingSec - 1);
      paintTimer();
      if (remainingSec === 0) {
        stopTimer();
        document.querySelector("#focus-message").textContent =
          "Tiempo cumplido. Bien. ¿Sigues un poco más o lo dejas hasta acá?";
      }
    }, 1000);
  });
}

function closeFocus() {
  stopTimer();
  document.querySelector("#focus-modal")?.classList.remove("active");
  currentTask = null;
}

async function completeTask() {
  if (!currentTask) return;
  try {
    await fetch(`${API_BASE}/tasks/${currentTask.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_completed: true }),
    });
  } catch (e) {
    console.error("Error completando tarea:", e);
  }
  const doneTitle = currentTask.title;
  closeFocus();
  if (window.initTasks) await window.initTasks();
  if (window.renderNext) window.renderNext();
  if (window.initToday) window.initToday();
  const section = document.querySelector("#next-section");
  if (section) {
    section.innerHTML = `
      <div class="next-empty">
        <div class="next-empty-icon">🌱</div>
        <div class="next-empty-text"><strong>Listo: ${escapeHtml(doneTitle)}.</strong><br>Ni perfecto ni completo: avanzado.</div>
      </div>
    `;
    setTimeout(() => {
      if (window.renderNext) window.renderNext();
    }, 4000);
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

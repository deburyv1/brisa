/* ============================================
   BRISA - Guidance Module
   Nudges the user to fill incomplete info
   ============================================ */
import { state } from "./state.js";

export function checkGuidance() {
  const reminders = [];
  const tasks = state.tasks || [];
  const transactions = state.transactions || [];

  const uncategorized = transactions.filter(t => !t.category);
  const overdue = tasks.filter(t => {
    if (t.is_completed || !t.due_datetime) return false;
    return new Date(t.due_datetime) < new Date();
  });

  if (uncategorized.length > 0) {
    reminders.push(`${uncategorized.length} transacción(es) sin categorizar`);
  }
  if (overdue.length > 0) {
    reminders.push(`${overdue.length} tarea(s) vencida(s) - ¡Reprogramar!`);
  }

  return reminders;
}

export function renderGuidanceBanner() {
  const reminders = checkGuidance();
  const banner = document.querySelector(".guidance-banner");
  if (!banner) return;

  if (reminders.length > 0) {
    banner.style.display = "block";
    banner.textContent = reminders.join(" · ");
  } else {
    banner.style.display = "none";
  }
}

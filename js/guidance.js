/* ============================================
   BRISA - Guidance Module
   Nudges the user to fill incomplete info
   ============================================ */
import { state } from "./state.js";

export function checkGuidance() {
  const reminders = [];
  const tasks = state.tasks || [];
  const transactions = state.transactions || [];
  const entries = state.entries || [];

  const pendingInbox = entries.filter(e => e.status === "inbox");

  const uncategorized = transactions.filter(t => !t.category);
  const overdue = tasks.filter(t => {
    if (t.is_completed || !t.due_datetime) return false;
    return new Date(t.due_datetime) < new Date();
  });

  if (pendingInbox.length > 0) {
    reminders.push(
      pendingInbox.length === 1
        ? "1 cosa sin procesar en Inbox"
        : `${pendingInbox.length} cosas sin procesar en Inbox`
    );
  }
  if (uncategorized.length > 0) {
    reminders.push(
      uncategorized.length === 1
        ? "1 transacción sin categorizar"
        : `${uncategorized.length} transacciones sin categorizar`
    );
  }
  if (overdue.length > 0) {
    reminders.push(
      overdue.length === 1
        ? "1 tarea vencida — ¡reprogramar!"
        : `${overdue.length} tareas vencidas — ¡a reprogramar!`
    );
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

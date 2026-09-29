/* ============================================
   BRISA - Guidance Module
   Neutral nudges as clickable shortcuts (never punishment)
   ============================================ */
import { state } from "./state.js";

export function checkGuidance() {
  const tasks = state.tasks || [];
  const transactions = state.transactions || [];
  const entries = state.entries || [];

  const pendingInbox = entries.filter(e => e.status === "inbox");
  const uncategorized = transactions.filter(t => !t.category);
  const overdue = tasks.filter(t => {
    if (t.is_completed || !t.due_datetime) return false;
    return new Date(t.due_datetime) < new Date();
  });

  const items = [];
  if (pendingInbox.length > 0) {
    items.push({
      text: pendingInbox.length === 1
        ? "1 cosa sin procesar en Inbox"
        : `${pendingInbox.length} cosas sin procesar en Inbox`,
      nav: "inbox",
    });
  }
  if (uncategorized.length > 0) {
    items.push({
      text: uncategorized.length === 1
        ? "1 transacción sin categorizar"
        : `${uncategorized.length} transacciones sin categorizar`,
      nav: "finance",
      filterUncategorized: true,
    });
  }
  if (overdue.length > 0) {
    items.push({
      text: overdue.length === 1
        ? "1 tarea vencida — reprogramar"
        : `${overdue.length} tareas vencidas — reprogramar`,
      nav: "tasks",
    });
  }
  return items;
}

export function renderGuidanceBanner() {
  const items = checkGuidance();
  const banner = document.querySelector(".guidance-banner");
  if (!banner) return;

  if (items.length === 0) {
    banner.style.display = "none";
    return;
  }

  banner.style.display = "block";
  banner.innerHTML = "";
  items.forEach((item, i) => {
    if (i > 0) {
      const sep = document.createElement("span");
      sep.textContent = " · ";
      sep.style.opacity = "0.6";
      banner.appendChild(sep);
    }
    const pill = document.createElement("button");
    pill.textContent = item.text;
    pill.style.cssText = "border:0;background:transparent;color:inherit;font:inherit;font-weight:inherit;cursor:pointer;padding:0;";
    pill.addEventListener("click", () => goTo(item));
    banner.appendChild(pill);
  });
}

async function goTo(item) {
  document.querySelector(`.nav[data-nav="${item.nav}"]`)?.click();
  if (item.filterUncategorized && window.setFinanceUncategorized) {
    window.setFinanceUncategorized(true);
    if (window.initFinance) await window.initFinance();
  }
}

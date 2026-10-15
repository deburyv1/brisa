/* ============================================
   BRISA - Guidance Module
   Neutral nudges as clickable shortcuts (never punishment)
   ============================================ */
import { state } from "./state.js";
import { readBankCheck, bankDiff } from "./reconcile.js";

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
  const bankCheck = readBankCheck();
  const bankAccount = (state.accounts || []).find(a => String(a.id) === String(bankCheck?.accountId));
  if (bankCheck && bankAccount) {
    const d = bankDiff(bankAccount, transactions, bankCheck);
    if (d && d.diff !== 0) {
      items.push({
        text: `Descuadre de $${Math.abs(d.diff).toLocaleString("es-ES")} con el banco — conciliar`,
        nav: "finance",
      });
    }
  }
  return items;
}

let dismissedKey = null;

export function renderGuidanceBanner() {
  const items = checkGuidance();
  const banner = document.querySelector(".guidance-banner");
  if (!banner) return;

  const key = items.map(i => i.text).join("|");
  if (items.length === 0 || key === dismissedKey) {
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

  const close = document.createElement("button");
  close.textContent = "✕";
  close.title = "Ocultar avisos";
  close.style.cssText = "border:0;background:rgba(255,255,255,.2);color:#fff;width:18px;height:18px;border-radius:50%;font-size:9px;cursor:pointer;margin-left:10px;line-height:1;";
  close.addEventListener("click", (e) => {
    e.stopPropagation();
    dismissedKey = key;
    banner.style.display = "none";
  });
  banner.appendChild(close);
}

async function goTo(item) {
  document.querySelector(`.nav[data-nav="${item.nav}"]`)?.click();
  if (item.filterUncategorized && window.setFinanceUncategorized) {
    window.setFinanceUncategorized(true);
    if (window.initFinance) await window.initFinance();
  }
}

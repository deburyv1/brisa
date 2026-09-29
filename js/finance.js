/* ============================================
   BRISA - Finance Module
   Accounts + import + quick categorize via /api
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";

const EXPENSE_CATEGORIES = ["Comida", "Transporte", "Casa", "Salud", "Ocio", "Suscripciones", "Trabajo", "Préstamo", "Otro"];
const INCOME_CATEGORIES = ["Sueldo", "Aguinaldo", "Reembolso", "Préstamo", "Otro"];

function categoriesFor(type) {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

let activeAccountId = null;
let activeAccount = null;
let showOnlyUncategorized = false;

export function setUncategorizedOnly(v) {
  showOnlyUncategorized = !!v;
}
if (typeof window !== "undefined") window.setFinanceUncategorized = setUncategorizedOnly;

async function fetchAccounts() {
  try {
    const res = await fetch(`${API_BASE}/accounts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar cuentas:", e);
    return null;
  }
}

async function fetchTransactions(accountId, uncategorizedOnly = false) {
  try {
    const params = new URLSearchParams();
    if (accountId) params.set("account_id", accountId);
    if (uncategorizedOnly) params.set("uncategorized", "1");
    const res = await fetch(`${API_BASE}/transactions?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar transacciones:", e);
    return null;
  }
}

async function fetchUncategorizedCount(accountId) {
  try {
    const params = accountId ? `?account_id=${accountId}` : "";
    const res = await fetch(`${API_BASE}/transactions/uncategorized-count${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.count || 0;
  } catch {
    return 0;
  }
}

async function fetchImports(accountId) {
  try {
    const params = accountId ? `?account_id=${accountId}` : "";
    const res = await fetch(`${API_BASE}/imports${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudo cargar historial:", e);
    return [];
  }
}

function formatImportDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " " +
    d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

async function deleteTransaction(id) {
  const res = await fetch(`${API_BASE}/transactions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatTxDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr.length <= 10 ? dateStr + "T12:00:00" : dateStr);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

async function uploadImport(section, file, force) {
  const formData = new FormData();
  formData.append("file", file);
  try {
    const res = await fetch(
      `${API_BASE}/transactions/import?account_id=${activeAccountId}${force ? "&force=1" : ""}`,
      { method: "POST", body: formData }
    );
    const result = await res.json();
    if (res.status === 409 && result.duplicate_file) {
      const when = formatImportDate(result.import.created_at);
      const again = confirm(
        `Este archivo ya se importó el ${when} (${result.import.imported} movimientos). ¿Subirlo de nuevo?`
      );
      if (again) await uploadImport(section, file, true);
      return;
    }
    if (!res.ok) {
      alert(result.error || "No se pudo importar.");
      return;
    }
    const initialStr = activeAccount?.initial_date
      ? ` (saldo inicial al ${formatTxDate(activeAccount.initial_date)})`
      : "";
    if (result.imported === 0 && result.before_initial > 0) {
      alert(
        `No se importó nada: los ${result.before_initial} movimientos son anteriores o iguales a la fecha de saldo inicial${initialStr}.\nRevisa la fecha con "✎ Cuenta".`
      );
    } else {
      alert(
        `Importados: ${result.imported}\nDuplicados: ${result.duplicates}\nAnteriores al saldo inicial: ${result.before_initial}\nOmitidos: ${result.skipped}`
      );
    }
    if (window.initFinance) window.initFinance();
  } catch (err) {
    console.error("Error importando:", err);
    alert("No se pudo importar. Intenta de nuevo.");
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function initFinance() {
  const section = document.querySelector("#finance-section");
  if (!section) return;

  const accounts = await fetchAccounts();
  if (!accounts) {
    section.innerHTML = `
      <div class="finance-empty">
        <div class="finance-empty-icon">⚠️</div>
        <div class="finance-empty-text">No se pudo conectar con el servidor.<br>Revisa que el backend esté corriendo e intenta de nuevo.</div>
        <button class="finance-empty-btn" id="retry-finance">Reintentar</button>
      </div>
    `;
    section.querySelector("#retry-finance")?.addEventListener("click", () => {
      if (window.initFinance) window.initFinance();
    });
    return;
  }

  state.accounts = accounts;

  if (accounts.length === 0) {
    section.innerHTML = `
      <div class="finance-empty">
        <div class="finance-empty-icon">🏦</div>
        <div class="finance-empty-title">Empecemos con tu cuenta</div>
        <div class="finance-empty-text">Crea tu cuenta corriente con su saldo inicial<br>y después importa la cartola del banco.</div>
        <button class="finance-empty-btn" id="add-first-account">+ Nueva cuenta</button>
      </div>
    `;
    section.querySelector("#add-first-account")?.addEventListener("click", () => {
      if (window.openAccountModal) window.openAccountModal();
    });
    return;
  }

  if (!activeAccountId || !accounts.find(a => a.id == activeAccountId)) {
    activeAccountId = accounts[0].id;
  }
  const account = accounts.find(a => a.id == activeAccountId);
  activeAccount = account;

  const [allTxs, uncategorized, imports] = await Promise.all([
    fetchTransactions(activeAccountId, false),
    fetchUncategorizedCount(activeAccountId),
    fetchImports(activeAccountId),
  ]);
  state.transactions = allTxs || [];
  const txs = showOnlyUncategorized
    ? (allTxs || []).filter(t => !t.category)
    : (allTxs || []);

  renderFinance(section, accounts, account, allTxs || [], txs, uncategorized, imports || []);
}

function renderFinance(section, accounts, account, allTxs, txs, uncategorized, imports) {
  const income = allTxs
    .filter(t => t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expense = allTxs
    .filter(t => t.type !== "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const initial = Number(account.initial_balance) || 0;
  const balance = initial + income - expense;

  section.innerHTML = `
    <div class="finance-header">
      <div class="finance-title">Finanzas</div>
      <div class="finance-header-actions">
        <button class="finance-import-btn" id="import-xlsx">⬆ Importar cartola</button>
        <button class="finance-import-btn" id="edit-account" title="Editar cuenta">✎ Cuenta</button>
        <button class="finance-add-btn" id="add-tx">+ Nuevo</button>
      </div>
    </div>

    <div class="finance-accounts">
      ${accounts.map(a => `
        <button class="finance-account ${a.id == activeAccountId ? "active" : ""}" data-account-id="${a.id}">
          ${escapeHtml(a.name)}
        </button>
      `).join("")}
      <button class="finance-account add" id="add-account">+ Cuenta</button>
    </div>

    <div class="finance-summary">
      <div class="finance-stat">
        <div class="finance-stat-label">Saldo inicial</div>
        <div class="finance-stat-value">${formatMoney(initial)}</div>
      </div>
      <div class="finance-stat">
        <div class="finance-stat-label">Movimientos</div>
        <div class="finance-stat-value ${income - expense >= 0 ? "income" : "expense"}">${income - expense >= 0 ? "+" : "−"}${formatMoney(Math.abs(income - expense))}</div>
      </div>
      <div class="finance-stat highlight">
        <div class="finance-stat-label">Saldo actual</div>
        <div class="finance-stat-value">${formatMoney(balance)}</div>
      </div>
    </div>

    ${uncategorized > 0 ? `
      <div class="finance-alert">
        <span>⚠️ ${uncategorized} movimiento${uncategorized === 1 ? "" : "s"} sin categorizar</span>
        <button class="finance-alert-btn" id="toggle-uncategorized">${showOnlyUncategorized ? "Ver todos" : "Revisar"}</button>
      </div>
    ` : ""}

    <div class="finance-list">
      ${txs.length === 0 ? `
        <div class="finance-empty">
          <div class="finance-empty-text">${showOnlyUncategorized ? "Nada pendiente. Todo categorizado. 🎉" : "Sin movimientos en esta cuenta."}</div>
        </div>
      ` : txs.map(t => {
        const isIncome = t.type === "income";
        return `
        <div class="tx-item" data-tx-id="${t.id}">
          <div class="tx-sign ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "−"}</div>
          <div class="tx-info">
            <div class="tx-desc">${escapeHtml(t.description)}</div>
            <div class="tx-meta">${formatTxDate(t.date)}</div>
          </div>
          <select class="tx-category" data-tx-id="${t.id}" title="Categoría">
            <option value="">Sin categoría</option>
            ${categoriesFor(t.type).map(c => `<option value="${c}" ${t.category === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
          <div class="tx-amount ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "−"}${formatMoney(t.amount)}</div>
          <div class="tx-actions">
            <button class="tx-btn tx-btn-edit" data-action="edit">Editar</button>
            <button class="tx-btn tx-btn-delete" data-action="delete">Eliminar</button>
          </div>
        </div>`;
      }).join("")}
    </div>
    ${imports.length > 0 ? `
      <div class="finance-history">
        <div class="finance-history-title">Historial de importaciones</div>
        ${imports.map(im => `
          <div class="finance-history-item">
            <div class="finance-history-info">
              <div class="finance-history-file">${escapeHtml(im.filename || "cartola.xlsx")}</div>
              <div class="finance-history-meta">${formatImportDate(im.created_at)} · ${im.imported} imp. · ${im.duplicates} dup.</div>
            </div>
            <button class="tx-btn tx-btn-delete" data-delete-import="${im.id}">Deshacer</button>
          </div>
        `).join("")}
      </div>
    ` : ""}
    <input type="file" id="import-file" accept=".xlsx,.xls" style="display:none">
  `;

  section.querySelector("#add-tx")?.addEventListener("click", () => {
    if (window.openTransactionModal) window.openTransactionModal(activeAccountId);
  });

  section.querySelector("#add-account")?.addEventListener("click", () => {
    if (window.openAccountModal) window.openAccountModal();
  });

  section.querySelector("#edit-account")?.addEventListener("click", () => {
    if (window.openAccountModal) window.openAccountModal(activeAccountId);
  });

  section.querySelector("#import-xlsx")?.addEventListener("click", () => {
    section.querySelector("#import-file")?.click();
  });

  section.querySelector("#import-file")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadImport(section, file, false);
    e.target.value = "";
  });

  section.querySelector("#toggle-uncategorized")?.addEventListener("click", () => {
    showOnlyUncategorized = !showOnlyUncategorized;
    if (window.initFinance) window.initFinance();
  });

  section.querySelectorAll(".finance-account[data-account-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      activeAccountId = btn.dataset.accountId;
      showOnlyUncategorized = false;
      if (window.initFinance) window.initFinance();
    });
  });

  // Quick categorize inline
  section.querySelectorAll(".tx-category").forEach(sel => {
    sel.addEventListener("change", async () => {
      try {
        await fetch(`${API_BASE}/transactions/${sel.dataset.txId}/category`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: sel.value || null }),
        });
        if (window.initFinance) window.initFinance();
      } catch (err) {
        console.error("Error categorizando:", err);
      }
    });
  });

  section.querySelectorAll("[data-delete-import]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Deshacer esta importación? Se eliminarán sus movimientos.")) return;
      try {
        await fetch(`${API_BASE}/imports/${btn.dataset.deleteImport}`, { method: "DELETE" });
        if (window.initFinance) window.initFinance();
      } catch (err) {
        console.error("Error deshaciendo importación:", err);
        alert("No se pudo deshacer. Intenta de nuevo.");
      }
    });
  });

  section.querySelectorAll(".tx-item").forEach(item => {
    const id = item.dataset.txId;

    item.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      if (window.openTransactionModal) window.openTransactionModal(activeAccountId, id);
    });

    item.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      if (confirm("¿Eliminar este movimiento?")) {
        await fetch(`${API_BASE}/transactions/${id}`, { method: "DELETE" });
        if (window.initFinance) window.initFinance();
      }
    });
  });
}

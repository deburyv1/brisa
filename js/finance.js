/* ============================================
   BRISA - Finance Module
   Accounts + import + quick categorize via /api
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";

const EXPENSE_CATEGORIES = ["Comida", "Transporte", "Casa", "Salud", "Ocio", "Suscripciones", "Regalos", "Trabajo", "Préstamo", "Tarjeta", "Ahorro", "Otro"];
const INCOME_CATEGORIES = ["Sueldo", "Aguinaldo", "Reembolso", "Préstamo", "Otro"];

function categoriesFor(type) {
  return type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
}

let activeAccountId = null;
let activeAccount = null;
let showOnlyUncategorized = false;
let currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
let currentPatterns = [];

export function setUncategorizedOnly(v) {
  showOnlyUncategorized = !!v;
}
if (typeof window !== "undefined") window.setFinanceUncategorized = setUncategorizedOnly;

function inMonth(dateStr, month) {
  return typeof dateStr === "string" && dateStr.slice(0, 7) === month;
}

function monthLabel(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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

function displayName(t) {
  return t.alias || t.description;
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
  const monthTxs = (allTxs || []).filter(t => inMonth(t.date, currentMonth));
  const txs = showOnlyUncategorized ? monthTxs.filter(t => !t.category) : monthTxs;

  renderFinance(section, accounts, account, allTxs || [], monthTxs, txs, uncategorized, imports || []);
}

function renderFinance(section, accounts, account, allTxs, monthTxs, txs, uncategorized, imports) {
  const byId = {};
  for (const t of allTxs) byId[t.id] = t;
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

    <div class="finance-month">
      <button class="finance-month-btn" id="month-prev">‹</button>
      <div class="finance-month-label">${monthLabel(currentMonth)}</div>
      <button class="finance-month-btn" id="month-next">›</button>
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

    ${(() => {
      const patterns = {};
      for (const t of allTxs) {
        if (!t.is_recurring) continue;
        const key = String(t.description || "").trim().toLowerCase();
        if (!key) continue;
        if (!patterns[key] || String(t.date) > String(patterns[key].date)) {
          patterns[key] = t;
        }
        if (t.alias && (!patterns[key].alias || String(t.date) >= String(patterns[key].date))) {
          patterns[key] = { ...patterns[key], alias: t.alias };
        }
      }
      const list = Object.values(patterns).sort((a, b) =>
        String(a.description).localeCompare(String(b.description)));
      currentPatterns = list;
      if (list.length === 0) return "";
      const committed = list
        .filter(p => p.type !== "income")
        .reduce((s, p) => s + Number(p.amount), 0);
      const monthIncome = monthTxs
        .filter(t => t.type === "income")
        .reduce((s, t) => s + Number(t.amount), 0);
      const available = monthIncome - committed;
      return `
      <div class="finance-breakdown">
        <div class="finance-breakdown-title">Fijos del mes · ${formatMoney(committed)} comprometido · <span style="color:#7bed9f">~${formatMoney(available)} disponible</span></div>
        ${list.map((p, i) => {
          const paid = allTxs.some(t =>
            String(t.description || "").trim().toLowerCase() === String(p.description).trim().toLowerCase() &&
            inMonth(t.date, currentMonth));
          return `
          <div class="breakdown-row">
            <div class="breakdown-cat">${escapeHtml(displayName(p))}</div>
            <div class="breakdown-val">${formatMoney(p.amount)}</div>
            ${paid
              ? `<span class="fixed-pill paid">Pagada</span>`
              : `<button class="tx-btn tx-btn-edit" data-register="${i}">Registrar</button>`}
          </div>`;
        }).join("")}
      </div>`;
    })()}

    ${(() => {
      const net = {};
      const gross = {};
      for (const t of monthTxs) {
        if (t.type === "income") {
          const parent = t.linked_id ? byId[t.linked_id] : null;
          if (parent && parent.category) {
            const cat = parent.category;
            net[cat] = (net[cat] || 0) - Number(t.amount);
          }
          continue;
        }
        const cat = t.category || "Sin categoría";
        gross[cat] = (gross[cat] || 0) + Number(t.amount);
        net[cat] = (net[cat] || 0) + Number(t.amount);
      }
      const rows = Object.entries(net).sort((a, b) => b[1] - a[1]);
      const total = rows.reduce((s, [, v]) => s + v, 0);
      if (rows.length === 0) return "";
      return `
      <div class="finance-breakdown">
        <div class="finance-breakdown-title">Gastos de ${monthLabel(currentMonth)} · ${formatMoney(total)}</div>
        ${rows.map(([cat, val]) => `
          <div class="breakdown-row" title="${gross[cat] && gross[cat] !== val ? `Bruto: ${formatMoney(gross[cat])}` : escapeHtml(cat)}">
            <div class="breakdown-cat">${escapeHtml(cat)}</div>
            <div class="breakdown-bar"><span style="width:${total ? Math.max(0, Math.round(val / total * 100)) : 0}%"></span></div>
            <div class="breakdown-val">${formatMoney(val)}</div>
          </div>
        `).join("")}
      </div>`;
    })()}

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
        const parent = t.linked_id ? byId[t.linked_id] : null;
        return `
        <div class="tx-item" data-tx-id="${t.id}">
          <div class="tx-sign ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "−"}</div>
          <div class="tx-info">
            <div class="tx-desc">${escapeHtml(displayName(t))}</div>
            <div class="tx-meta">${formatTxDate(t.date)}${parent ? ` · ↩ ${escapeHtml(parent.description)}` : ""}</div>
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

  section.querySelector("#month-prev")?.addEventListener("click", () => {
    currentMonth = shiftMonth(currentMonth, -1);
    if (window.initFinance) window.initFinance();
  });

  section.querySelector("#month-next")?.addEventListener("click", () => {
    currentMonth = shiftMonth(currentMonth, 1);
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

  section.querySelectorAll("[data-register]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = currentPatterns[Number(btn.dataset.register)];
      if (!p || !window.openTransactionModal) return;
      window.openTransactionModal(activeAccountId, null, {
        description: p.description,
        alias: p.alias || "",
        amount: p.amount,
        category: p.category || "",
        type: p.type || "expense",
      });
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

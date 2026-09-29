/* ============================================
   BRISA - Finance Module
   CRUD for transactions via /api/transactions
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";

async function fetchTransactions() {
  try {
    const res = await fetch(`${API_BASE}/transactions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar transacciones:", e);
    return null;
  }
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

export async function initFinance() {
  const section = document.querySelector("#finance-section");
  if (!section) return;

  const txs = await fetchTransactions();
  state.transactions = txs || [];

  if (!txs) {
    section.innerHTML = `
      <div class="finance-empty">
        <div class="finance-empty-icon">⚠️</div>
        <div class="finance-empty-text">No se pudo conectar con el servidor.<br>Revisá que el backend esté corriendo e intentá de nuevo.</div>
        <button class="finance-empty-btn" id="retry-finance">Reintentar</button>
      </div>
    `;
    section.querySelector("#retry-finance")?.addEventListener("click", () => {
      if (window.initFinance) window.initFinance();
    });
    return;
  }

  if (txs.length === 0) {
    section.innerHTML = `
      <div class="finance-empty">
        <div class="finance-empty-icon">💰</div>
        <div class="finance-empty-text">Todavía no tenés movimientos.<br>Registrá el primero para empezar.</div>
        <button class="finance-empty-btn" id="add-first-tx">+ Nuevo movimiento</button>
      </div>
    `;
    const btn = section.querySelector("#add-first-tx");
    if (btn) {
      btn.addEventListener("click", () => {
        if (window.openTransactionModal) window.openTransactionModal();
      });
    }
    return;
  }

  renderFinance(section, txs);
}

function renderFinance(section, txs) {
  const income = txs.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter(t => t.type !== "income").reduce((s, t) => s + Number(t.amount), 0);
  const balance = income - expense;

  section.innerHTML = `
    <div class="finance-header">
      <div class="finance-title">Finanzas</div>
      <button class="finance-add-btn" id="add-tx">+ Nuevo</button>
    </div>
    <div class="finance-summary">
      <div class="finance-stat">
        <div class="finance-stat-label">Ingresos</div>
        <div class="finance-stat-value income">+${formatMoney(income)}</div>
      </div>
      <div class="finance-stat">
        <div class="finance-stat-label">Gastos</div>
        <div class="finance-stat-value expense">−${formatMoney(expense)}</div>
      </div>
      <div class="finance-stat">
        <div class="finance-stat-label">Balance</div>
        <div class="finance-stat-value">${formatMoney(balance)}</div>
      </div>
    </div>
    <div class="finance-list">
      ${txs.map(t => {
        const isIncome = t.type === "income";
        return `
        <div class="tx-item" data-tx-id="${t.id}">
          <div class="tx-sign ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "−"}</div>
          <div class="tx-info">
            <div class="tx-desc">${escapeHtml(t.description)}</div>
            <div class="tx-meta">${formatTxDate(t.date)}${t.category ? ` · ${escapeHtml(t.category)}` : ""}</div>
          </div>
          <div class="tx-amount ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "−"}${formatMoney(t.amount)}</div>
          <div class="tx-actions">
            <button class="tx-btn tx-btn-edit" data-action="edit">Editar</button>
            <button class="tx-btn tx-btn-delete" data-action="delete">Eliminar</button>
          </div>
        </div>`;
      }).join("")}
    </div>
  `;

  const addBtn = section.querySelector("#add-tx");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (window.openTransactionModal) window.openTransactionModal();
    });
  }

  section.querySelectorAll(".tx-item").forEach(item => {
    const id = item.dataset.txId;

    item.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      if (window.openTransactionModal) window.openTransactionModal(id);
    });

    item.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      if (confirm("¿Eliminar este movimiento?")) {
        await deleteTransaction(id);
        if (window.initFinance) window.initFinance();
      }
    });
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

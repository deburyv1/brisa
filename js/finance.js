/* ============================================
   BRISA - Finance Module
   Accounts + import + quick categorize via /api
   ============================================ */
import { state } from "./state.js";
import { readBankCheck, writeBankCheck, bankDiff, brisaBalance } from "./reconcile.js";

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
let searchText = "";
let compareMode = false;
let budgetEdit = false;
let uncatScope = "month";

export function setUncategorizedOnly(v, scope) {
  showOnlyUncategorized = !!v;
  uncatScope = scope === "all" ? "all" : "month";
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

  const [allTxs, uncategorized, imports, budgets, people] = await Promise.all([
    fetchTransactions(activeAccountId, false),
    fetchUncategorizedCount(activeAccountId),
    fetchImports(activeAccountId),
    fetchBudgets(currentMonth),
    fetchPeople(),
  ]);
  state.transactions = allTxs || [];
  const monthTxs = (allTxs || []).filter(t => inMonth(t.date, currentMonth));
  const allUncat = (allTxs || []).filter(t => !t.category);
  const txs = showOnlyUncategorized
    ? (uncatScope === "all" ? allUncat : monthTxs.filter(t => !t.category))
    : monthTxs;

  renderFinance(section, accounts, account, allTxs || [], monthTxs, txs, uncategorized, imports || [], budgets || [], allUncat, people || []);
}

async function fetchPeople() {
  try {
    const res = await fetch(`${API_BASE}/people`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar personas:", e);
    return [];
  }
}

async function fetchBudgets(month) {
  try {
    const res = await fetch(`${API_BASE}/budgets?month=${month}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar topes:", e);
    return [];
  }
}

function netByCategory(txs, byId) {
  const net = {};
  const gross = {};
  const reimb = {};
  for (const t of txs) {
    if (t.type === "income") {
      const parent = t.linked_id ? byId[t.linked_id] : null;
      if (parent && parent.category) {
        const cat = parent.category;
        net[cat] = (net[cat] || 0) - Number(t.amount);
        reimb[cat] = (reimb[cat] || 0) + Number(t.amount);
      }
      continue;
    }
    const cat = t.category || "Sin categoría";
    gross[cat] = (gross[cat] || 0) + Number(t.amount);
    net[cat] = (net[cat] || 0) + Number(t.amount);
  }
  return { net, gross, reimb };
}

function renderBreakdown(monthPosted, plannedByCat, byId, budgetMap) {
  const { net, gross, reimb } = netByCategory(monthPosted, byId);
  let rows = Object.entries(net).sort((a, b) => b[1] - a[1]);
  if (budgetEdit) {
    // In edit mode show every known category so topes can be set proactively
    const known = new Set([...rows.map(([c]) => c), ...Object.keys(budgetMap), ...Object.keys(plannedByCat), ...EXPENSE_CATEGORIES]);
    rows = [...known].sort().map(c => [c, net[c] || 0]);
  }
  const total = rows.reduce((s, [, v]) => s + v, 0);
  return `
  <div class="finance-breakdown">
    <div class="finance-breakdown-title">
      <span>Gastos de ${monthLabel(currentMonth)} · ${formatMoney(total)}</span>
      <span class="finance-breakdown-actions">
        <button class="finance-mini-btn" id="toggle-compare">Comparar</button>
        <button class="finance-mini-btn" id="toggle-budgets">${budgetEdit ? "Listo" : "Topes"}</button>
      </span>
    </div>
    ${rows.map(([cat, val]) => {
      const cap = budgetMap[cat];
      const planned = plannedByCat[cat] || 0;
      const progress = val + planned;
      const pct = total ? Math.max(0, Math.round(val / total * 100)) : 0;
      const over = cap != null && progress > cap;
      return `
      <div class="breakdown-row" title="${gross[cat] && gross[cat] !== val ? `Bruto: ${formatMoney(gross[cat])}` : escapeHtml(cat)}">
        <div class="breakdown-cat">${escapeHtml(cat)}</div>
        <div class="breakdown-bar"><span style="width:${cap != null && !budgetEdit ? Math.min(100, Math.round(progress / cap * 100)) : pct}%"></span></div>
        ${budgetEdit && cat !== "Sin categoría" ? `
          <input class="budget-input" data-budget-cat="${escapeHtml(cat)}" type="number" min="0" step="any"
            placeholder="Tope" value="${cap != null ? cap : ""}">
        ` : `
          <div class="breakdown-val">${formatMoney(val)}${planned > 0 ? `<small> +${formatMoney(planned)} previsto</small>` : ""}${reimb[cat] > 0 ? `<small> −${formatMoney(reimb[cat])} reembolso</small>` : ""}${cap != null ? `<small> de ${formatMoney(cap)}${over ? ` · +${formatMoney(progress - cap)} sobre tope` : ""}</small>` : ""}</div>
        `}
      </div>`;
    }).join("")}
  </div>`;
}

function renderCompare(monthTxs, allTxs, byId) {
  const prev = shiftMonth(currentMonth, -1);
  const posted = (t) => t.status !== "planned";
  const prevTxs = (allTxs || []).filter(t => posted(t) && inMonth(t.date, prev));
  const curPosted = (monthTxs || []).filter(posted);
  const cur = netByCategory(curPosted, byId).net;
  const old = netByCategory(prevTxs, byId).net;
  const cats = [...new Set([...Object.keys(cur), ...Object.keys(old)])]
    .sort((a, b) => (cur[b] || 0) - (cur[a] || 0));
  if (cats.length === 0) return "";
  const max = Math.max(1, ...cats.map(c => Math.max(cur[c] || 0, old[c] || 0)));
  return `
  <div class="finance-breakdown">
    <div class="finance-breakdown-title">
      <span>${monthLabel(prev)} vs ${monthLabel(currentMonth)}</span>
      <span class="finance-breakdown-actions">
        <button class="finance-mini-btn" id="toggle-compare">Volver</button>
      </span>
    </div>
    ${cats.map(cat => {
      const a = old[cat] || 0;
      const b = cur[cat] || 0;
      const diff = b - a;
      const arrow = diff > 0 ? "▲" : diff < 0 ? "▼" : "＝";
      return `
      <div class="compare-row">
        <div class="breakdown-cat">${escapeHtml(cat)}</div>
        <div class="compare-bars">
          <div class="compare-bar"><span class="prev" style="width:${Math.round(a / max * 100)}%"></span></div>
          <div class="compare-bar"><span style="width:${Math.round(b / max * 100)}%"></span></div>
        </div>
        <div class="breakdown-val">${formatMoney(b)} <small>${arrow} ${formatMoney(Math.abs(diff))}</small></div>
      </div>`;
    }).join("")}
    <div class="compare-legend"><span><i class="swatch prev"></i>${monthLabel(prev)}</span><span><i class="swatch"></i>${monthLabel(currentMonth)}</span></div>
  </div>`;
}

function reconcileHtml(account, allTxs) {
  const check = readBankCheck();
  const d = bankDiff(account, allTxs, check);
  const diffLine = !d ? ""
    : d.diff === 0
      ? `<div class="reconcile-ok">Cuadrado con el banco ✓ <small>(${escapeHtml(d.date || "")})</small></div>`
      : `<div class="reconcile-diff">
          <span>Diferencia de $${formatMoney(Math.abs(d.diff))}: ${d.diff < 0
            ? "en Brisa hay más de lo que dice el banco."
            : "el banco tiene más de lo que dice Brisa."}</span>
          <button class="finance-mini-btn" id="reconcile-register">
            Registrar ${d.diff < 0 ? "gasto" : "ingreso"} por la diferencia
          </button>
        </div>`;
  return `
  <div class="finance-breakdown reconcile-card">
    <div class="finance-breakdown-title">Conciliación con el banco</div>
    <div class="reconcile-row">
      <span>Brisa <strong>$${formatMoney(d ? d.brisa : brisaBalance(account, allTxs))}</strong></span>
      ${d ? `<span>Banco <strong>$${formatMoney(d.bank)}</strong> <small>(${escapeHtml(d.date || "")})</small></span>` : `<span>Banco <strong>—</strong></span>`}
    </div>
    <div class="reconcile-row">
      <input type="number" id="reconcile-bank" class="reconcile-input" min="0" step="any"
        placeholder="Saldo que dice el banco" value="${d ? d.bank : ""}">
      <button class="finance-mini-btn" id="reconcile-compare">Comparar</button>
    </div>
    ${diffLine}
  </div>`;
}

function renderFinance(section, accounts, account, allTxs, monthTxs, txs, uncategorized, imports, budgets, allUncat, people) {
  const budgetMap = {};
  for (const b of budgets || []) budgetMap[b.category] = Number(b.amount);
  const byId = {};
  for (const t of allTxs) byId[t.id] = t;
  const mine = (t) => (t.owner || "mine") === "mine";
  const monthUncat = (monthTxs || []).filter(t => !t.category).length;
  const monthStart = currentMonth + "-01";
  const isPosted = (t) => t.status !== "planned";
  const beforeNet = (allTxs || [])
    .filter(t => isPosted(t) && String(t.date).slice(0, 10) < monthStart)
    .reduce((s, t) => s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)), 0);
  const initial = Number(account.initial_balance) || 0;
  const monthStartBalance = initial + beforeNet;
  const monthNet = (monthTxs || [])
    .filter(isPosted)
    .reduce((s, t) => s + (t.type === "income" ? Number(t.amount) : -Number(t.amount)), 0);
  const income = allTxs
    .filter(t => isPosted(t) && t.type === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expense = allTxs
    .filter(t => isPosted(t) && t.type !== "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const balance = initial + income - expense;

  const monthPosted = (monthTxs || []).filter(isPosted);
  const monthMine = monthPosted.filter(mine);
  const plannedByCat = {};
  for (const t of (monthTxs || [])) {
    if (isPosted(t) || t.type === "income") continue;
    const cat = t.category || "Sin categoría";
    plannedByCat[cat] = (plannedByCat[cat] || 0) + Number(t.amount);
  }

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
        <div class="finance-stat-label">Saldo inicio mes</div>
        <div class="finance-stat-value">${formatMoney(monthStartBalance)}</div>
      </div>
      <div class="finance-stat">
        <div class="finance-stat-label">Movimientos del mes</div>
        <div class="finance-stat-value ${monthNet >= 0 ? "income" : "expense"}">${monthNet >= 0 ? "+" : "−"}${formatMoney(Math.abs(monthNet))}</div>
      </div>
      <div class="finance-stat highlight">
        <div class="finance-stat-label">Saldo actual</div>
        <div class="finance-stat-value">${formatMoney(balance)}</div>
      </div>
    </div>

    ${reconcileHtml(account, allTxs)}
    ${(() => {
      const groups = {};
      for (const t of allTxs) {
        if (!t.is_recurring) continue;
        const key = String(t.description || "").trim().toLowerCase();
        if (!key) continue;
        (groups[key] = groups[key] || []).push(t);
      }
      const dayOf = (d) => Number(String(d).slice(8, 10)) || 0;
      const list = Object.values(groups).map(rows => {
        const sorted = [...rows].sort((a, b) => String(a.date) > String(b.date) ? -1 : 1);
        const rep = { ...sorted[0] };
        const days = rows.map(t => dayOf(t.date)).filter(d => d >= 1 && d <= 31);
        rep.usualDay = days.length
          ? [...days].sort((a, b) =>
              days.filter(x => x === b).length - days.filter(x => x === a).length)[0]
          : null;
        const withAlias = [...rows].reverse().find(t => t.alias);
        if (withAlias) rep.alias = withAlias.alias;
        const withDetails = [...rows].reverse().find(t => t.details);
        if (withDetails) rep.details = withDetails.details;
        return rep;
      }).sort((a, b) => (a.usualDay || 99) - (b.usualDay || 99));
      currentPatterns = list;
      if (list.length === 0) return "";
      const committed = list
        .filter(p => p.type !== "income")
        .reduce((s, p) => s + Number(p.amount), 0);
      const monthIncome = monthTxs
        .filter(t => t.type === "income")
        .reduce((s, t) => s + Number(t.amount), 0);
      const expectedIncome = list
        .filter(p => p.type === "income" && !allTxs.some(t =>
          String(t.description || "").trim().toLowerCase() === String(p.description).trim().toLowerCase() &&
          inMonth(t.date, currentMonth)))
        .reduce((s, p) => s + Number(p.amount), 0);
      const available = monthIncome + expectedIncome - committed;
      const availableStr = `${available < 0 ? "−" : "+"}${formatMoney(Math.abs(available))}`;
      const projectedHint = expectedIncome > 0 ? ` (incluye ~${formatMoney(expectedIncome)} por recibir)` : "";
      return `
      <div class="finance-breakdown fixed-list">
        <div class="finance-breakdown-title">Fijos del mes · ${formatMoney(committed)} comprometido · ${formatMoney(monthIncome)} recibidos · <span class="${available >= 0 ? "available-pos" : "available-neg"}" title="Proyectado${projectedHint}">${availableStr} disponible*</span></div>
        ${list.map((p, i) => {
          const paid = allTxs.some(t =>
            String(t.description || "").trim().toLowerCase() === String(p.description).trim().toLowerCase() &&
            inMonth(t.date, currentMonth));
          return `
          <div class="breakdown-row fixed-row">
            <div class="breakdown-cat">${escapeHtml(displayName(p))}${p.usualDay ? `<small>día ~${p.usualDay}</small>` : ""}${p.details ? `<small>📋 ${escapeHtml(p.details)}</small>` : ""}</div>
            <div class="breakdown-right">
              <div class="breakdown-val ${p.type === "income" ? "income" : "expense"}">${p.type === "income" ? "+" : "−"}${formatMoney(p.amount)}</div>
              ${paid
                ? `<span class="fixed-pill paid">${p.type === "income" ? "Recibido" : "Pagada"}</span>`
                : `<button class="tx-btn tx-btn-edit" data-register="${i}">Registrar</button>
                   <button class="tx-btn tx-btn-delete" data-endseries="${i}" title="Dejar de seguir esta cuenta">Terminar</button>`}
            </div>
          </div>`;
        }).join("")}
      </div>
      ${expectedIncome > 0 ? `<div class="fixed-footnote">* Disponible proyectado: cuenta ingresos fijos aún no recibidos.</div>` : ""}`;
    })()}

    ${compareMode ? renderCompare(monthMine, allTxs, byId) : renderBreakdown(monthMine, plannedByCat, byId, budgetMap)}

    ${(() => {
      const per = {};
      const pname = {};
      for (const p of (people || [])) pname[p.id] = p.nickname || p.name;
      for (const t of (allTxs || [])) {
        if ((t.owner || "mine") === "mine" || !t.person_id) continue;
        const k = String(t.person_id);
        const e = per[k] || { name: pname[t.person_id] || "Otra persona", advanced: 0, returned: 0 };
        if (t.type === "income") e.returned += Number(t.amount);
        else e.advanced += Number(t.amount);
        per[k] = e;
      }
      const rows = Object.values(per).filter(e => e.advanced > 0 || e.returned > 0);
      if (rows.length === 0) return "";
      return `
      <div class="finance-breakdown fixed-list">
        <div class="finance-breakdown-title">Movimientos por terceros · no es tu consumo</div>
        ${rows.map(e => {
          const pending = e.advanced - e.returned;
          return `
          <div class="breakdown-row fixed-row">
            <div class="breakdown-cat">${escapeHtml(e.name)}<small>adelantado ${formatMoney(e.advanced)} · devuelto ${formatMoney(e.returned)}</small></div>
            <div class="breakdown-right">
              <div class="breakdown-val ${pending > 0 ? "expense" : "income"}">${pending > 0 ? "−" : "+"}${formatMoney(Math.abs(pending))}</div>
              <span class="fixed-pill ${pending === 0 ? "paid" : ""}">${pending > 0 ? "Te deben" : pending < 0 ? "A favor" : "Al día"}</span>
            </div>
          </div>`;
        }).join("")}
      </div>`;
    })()}

    ${monthUncat > 0 ? `
      <div class="finance-alert">
        <span>⚠️ ${monthUncat} movimiento${monthUncat === 1 ? "" : "s"} sin categorizar este mes</span>
        <button class="finance-alert-btn" id="toggle-uncategorized">${showOnlyUncategorized ? "Ver todos" : "Revisar"}</button>
      </div>
    ` : ""}

    <div class="finance-search-row">
      <input id="finance-search" class="finance-search" type="text"
        placeholder="Buscar movimientos..." value="${escapeHtml(searchText)}" autocomplete="off">
    </div>

    <div class="finance-list">
      ${txs.length === 0 ? `
        <div class="finance-empty">
          <div class="finance-empty-text">${(() => {
            if (!showOnlyUncategorized) return "Sin movimientos en esta cuenta.";
            if (uncatScope === "all") return "Nada pendiente. Todo categorizado. 🎉";
            const rest = (allUncat || []).length;
            return rest > 0
              ? `Este mes al día. Quedan ${rest} en otros meses.`
              : "Nada pendiente. Todo categorizado. 🎉";
          })()}</div>
          ${showOnlyUncategorized && uncatScope !== "all" && (allUncat || []).length > 0 ? `
            <button class="finance-empty-btn" id="show-all-uncat">Ver todas</button>
          ` : ""}
        </div>
      ` : txs.map(t => {
        const isIncome = t.type === "income";
        const isPlanned = t.status === "planned";
        const parent = t.linked_id ? byId[t.linked_id] : null;
        return `
        <div class="tx-item ${isPlanned ? "planned" : ""}" data-tx-id="${t.id}">
          <div class="tx-sign ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "−"}</div>
          <div class="tx-info">
            <div class="tx-desc">${escapeHtml(displayName(t))}</div>
            <div class="tx-meta">${formatTxDate(t.date)}${parent ? ` · ↩ ${escapeHtml(parent.description)}` : ""}${isPlanned ? " · previsto" : ""}</div>
          </div>
          <select class="tx-category" data-tx-id="${t.id}" title="Categoría">
            <option value="">Sin categoría</option>
            ${categoriesFor(t.type).map(c => `<option value="${c}" ${t.category === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
          <div class="tx-amount ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "−"}${formatMoney(t.amount)}</div>
          <div class="tx-actions">
            ${isPlanned ? `<button class="tx-btn tx-btn-edit" data-action="realize">Realizado</button>` : ""}
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

  section.querySelector("#reconcile-compare")?.addEventListener("click", () => {
    const val = section.querySelector("#reconcile-bank")?.value;
    if (val === "" || val == null || Number.isNaN(Number(val))) return;
    writeBankCheck(activeAccountId, Number(val));
    if (window.initFinance) window.initFinance();
    if (window.renderGuidanceBanner) window.renderGuidanceBanner();
  });

  section.querySelector("#reconcile-register")?.addEventListener("click", () => {
    const d = bankDiff(activeAccount, allTxs, readBankCheck());
    if (!d || d.diff === 0 || !window.openTransactionModal) return;
    window.openTransactionModal(activeAccountId, null, {
      description: "Ajuste conciliación",
      amount: Math.abs(d.diff),
      type: d.diff < 0 ? "expense" : "income",
      category: "Otro",
    });
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

  section.querySelector("#toggle-compare")?.addEventListener("click", () => {
    compareMode = !compareMode;
    if (window.initFinance) window.initFinance();
  });

  section.querySelector("#toggle-budgets")?.addEventListener("click", () => {
    budgetEdit = !budgetEdit;
    if (window.initFinance) window.initFinance();
  });

  section.querySelectorAll(".budget-input").forEach(input => {
    input.addEventListener("change", async () => {
      try {
        await fetch(`${API_BASE}/budgets`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: input.dataset.budgetCat,
            month: currentMonth,
            amount: input.value === "" ? null : Number(input.value),
          }),
        });
        if (window.initFinance) window.initFinance();
      } catch (err) {
        console.error("Error guardando tope:", err);
      }
    });
  });

  const searchInput = section.querySelector("#finance-search");
  const applySearch = () => {
    searchText = searchInput ? searchInput.value : "";
    const q = searchText.trim().toLowerCase();
    section.querySelectorAll(".tx-item").forEach(item => {
      const id = item.dataset.txId;
      const t = (allTxs || []).find(x => String(x.id) === String(id));
      const hay = t ? `${t.description} ${t.alias || ""} ${t.category || ""}`.toLowerCase() : "";
      item.style.display = !q || hay.includes(q) ? "" : "none";
    });
  };
  searchInput?.addEventListener("input", applySearch);
  if (searchText) applySearch();

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
        details: p.details || "",
        amount: p.amount,
        category: p.category || "",
        type: p.type || "expense",
        lockDescription: true,
      });
    });
  });

  section.querySelectorAll("[data-endseries]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const p = currentPatterns[Number(btn.dataset.endseries)];
      if (!p) return;
      if (!confirm(`¿Terminar el seguimiento de "${p.description}"? El historial se conserva.`)) return;
      try {
        const rows = (allTxs || []).filter(t =>
          t.is_recurring &&
          String(t.description || "").trim().toLowerCase() === String(p.description).trim().toLowerCase());
        for (const r of rows) {
          await fetch(`${API_BASE}/transactions/${r.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: r.description,
              amount: r.amount,
              type: r.type,
              category: r.category,
              date: r.date ? String(r.date).slice(0, 10) : null,
              account_id: r.account_id,
              linked_id: r.linked_id,
              is_recurring: false,
              alias: r.alias,
              status: r.status,
              details: r.details,
            }),
          });
        }
        if (window.initFinance) window.initFinance();
      } catch (err) {
        console.error("Error terminando serie:", err);
      }
    });
  });

  section.querySelector("#show-all-uncat")?.addEventListener("click", () => {
    uncatScope = "all";
    if (window.initFinance) window.initFinance();
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

    item.querySelector('[data-action="realize"]')?.addEventListener("click", async () => {
      const row = (allTxs || []).find(x => String(x.id) === String(id));
      if (!row) return;
      try {
        await fetch(`${API_BASE}/transactions/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: row.description,
            amount: row.amount,
            type: row.type,
            category: row.category,
            date: new Date().toISOString().slice(0, 10),
            account_id: row.account_id,
            linked_id: row.linked_id,
            is_recurring: row.is_recurring,
            alias: row.alias,
            status: "posted",
          }),
        });
        if (window.initFinance) window.initFinance();
      } catch (err) {
        console.error("Error marcando realizado:", err);
      }
    });

    item.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      if (window.openTransactionModal) window.openTransactionModal(activeAccountId, id);
    });

    item.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      await fetch(`${API_BASE}/transactions/${id}`, { method: "DELETE" });
      if (window.initFinance) window.initFinance();
    });
  });
}

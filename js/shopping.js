/* ============================================
   BRISA - Shopping Module
   Fast list + buy as real expense
   ============================================ */

const API_BASE = "/api";

async function fetchItems() {
  try {
    const res = await fetch(`${API_BASE}/shopping`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudo cargar compras:", e);
    return null;
  }
}

function formatMoney(n) {
  return Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export async function initShopping() {
  const section = document.querySelector("#shopping-section");
  if (!section) return;

  const items = await fetchItems();

  if (!items) {
    section.innerHTML = `
      <div class="shopping-empty">
        <div class="journal-empty-icon">⚠️</div>
        <div class="journal-empty-text">No se pudo conectar con el servidor.</div>
      </div>
    `;
    return;
  }

  const pending = items.filter(i => !i.is_purchased);
  const done = items.filter(i => i.is_purchased);
  const estimate = pending.reduce((s, i) =>
    s + Number(i.estimated_amount || 0) * (Number(i.quantity) || 1), 0);

  section.innerHTML = `
    <div class="shopping-header">
      <div class="shopping-title">Compras</div>
      ${estimate > 0 ? `<div class="shopping-total">~${formatMoney(estimate)} estimado</div>` : ""}
    </div>
    <div class="shopping-add">
      <input type="text" id="shopping-input" placeholder="¿Qué falta? Ej: novas" maxlength="255" autocomplete="off">
      <input type="number" id="shopping-est" placeholder="$ ref" min="0" step="any">
      <button class="shopping-add-btn" id="shopping-add" title="Agregar a la lista">+</button>
    </div>
    <div class="shopping-list">
      ${pending.length === 0 ? `<div class="shopping-empty">Nada pendiente. 🎉</div>` : pending.map(itemHtml).join("")}
    </div>
    ${done.length > 0 ? `
      <div class="shopping-subtitle">Comprados · <button class="finance-mini-btn" id="shopping-clear">Limpiar</button></div>
      <div class="shopping-list">
        ${done.map(itemHtml).join("")}
      </div>
    ` : ""}
  `;

  const input = section.querySelector("#shopping-input");
  const est = section.querySelector("#shopping-est");

  const add = async () => {
    const description = input?.value.trim();
    if (!description) return;
    await fetch(`${API_BASE}/shopping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, estimated_amount: est?.value || null }),
    });
    await initShopping();
    // Back to the input for fast consecutive entry
    document.querySelector("#shopping-input")?.focus();
  };

  section.querySelector("#shopping-add")?.addEventListener("click", add);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  });

  section.querySelector("#shopping-clear")?.addEventListener("click", async () => {
    await fetch(`${API_BASE}/shopping?purchased=1`, { method: "DELETE" });
    if (window.initShopping) window.initShopping();
  });

  section.querySelectorAll(".shopping-item").forEach(row => {
    const id = row.dataset.itemId;

    row.querySelector('[data-action="toggle"]')?.addEventListener("click", async () => {
      const item = (items || []).find(x => String(x.id) === String(id));
      await fetch(`${API_BASE}/shopping/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_purchased: !item?.is_purchased }),
      });
      if (window.initShopping) window.initShopping();
    });

    row.querySelector('[data-action="buy"]')?.addEventListener("click", async () => {
      const item = (items || []).find(x => String(x.id) === String(id));
      if (!item || !window.openTransactionModal) return;
      let accountId = null;
      try {
        const res = await fetch(`${API_BASE}/accounts`);
        const accounts = res.ok ? await res.json() : [];
        accountId = accounts[0]?.id ?? null;
      } catch {
        accountId = null;
      }
      window.openTransactionModal(accountId, null, {
        description: item.description,
        amount: item.estimated_amount || "",
        category: item.category || "Comida",
        type: "expense",
      });
    });

    row.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      if (confirm("¿Eliminar de la lista?")) {
        await fetch(`${API_BASE}/shopping/${id}`, { method: "DELETE" });
        if (window.initShopping) window.initShopping();
      }
    });
  });
}

function itemHtml(i) {
  return `
  <div class="shopping-item ${i.is_purchased ? "done" : ""}" data-item-id="${i.id}">
    <button class="shopping-check ${i.is_purchased ? "done" : ""}" data-action="toggle">${i.is_purchased ? "✓" : ""}</button>
    <div class="shopping-info">
      <span class="shopping-name" title="${escapeHtml(i.description)}">${escapeHtml(i.description)}</span>
      ${i.estimated_amount ? `<span class="shopping-est">~${formatMoney(i.estimated_amount)}</span>` : ""}
    </div>
    <div class="tx-actions">
      ${i.is_purchased ? `<button class="tx-btn tx-btn-edit" data-action="buy" title="Pasar a finanzas">$ →</button>` : ""}
      <button class="tx-btn tx-btn-delete" data-action="delete">✕</button>
    </div>
  </div>`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

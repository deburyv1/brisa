/* ============================================
   BRISA - Shopping Module
   Lista rápida + tarjeta con lugares de compra
   en Santiago. Comprar se convierte en gasto
   real.
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

function showShoppingFeedback(section, message = "") {
  let feedback = section.querySelector("#shopping-feedback");
  if (!feedback) {
    feedback = document.createElement("div");
    feedback.id = "shopping-feedback";
    feedback.className = "shopping-feedback";
    feedback.setAttribute("role", "alert");
    section.querySelector(".shopping-add")?.after(feedback);
  }
  feedback.textContent = message;
  feedback.hidden = !message;
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
      <input type="number" id="shopping-est" placeholder="$ ref" aria-label="Monto estimado, opcional" min="0" step="any">
      <button type="button" class="shopping-add-btn" id="shopping-add" title="Agregar a la lista" aria-label="Agregar producto">+</button>
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
    const button = section.querySelector("#shopping-add");
    if (button?.disabled) return;
    if (button) { button.disabled = true; button.textContent = "…"; }
    showShoppingFeedback(section);
    try {
      const res = await fetch(`${API_BASE}/shopping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, estimated_amount: est?.value || null }),
      });
      if (!res.ok) throw new Error("No se pudo agregar. El texto sigue en la lista para que puedas reintentar.");
      await initShopping();
      // Back to the input for fast consecutive entry
      document.querySelector("#shopping-input")?.focus();
    } catch (e) {
      showShoppingFeedback(section, e.message || "No se pudo agregar. Intenta de nuevo.");
      if (button) { button.disabled = false; button.textContent = "+"; }
    }
  };

  section.querySelector("#shopping-add")?.addEventListener("click", add);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  });

  section.querySelector("#shopping-clear")?.addEventListener("click", async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/shopping?purchased=1`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      if (window.initShopping) await window.initShopping();
    } catch {
      button.disabled = false;
      showShoppingFeedback(section, "No se pudieron limpiar los productos comprados. Intenta de nuevo.");
    }
  });

  section.querySelectorAll(".shopping-item").forEach(row => {
    const id = row.dataset.itemId;

    row.querySelector('[data-action="toggle"]')?.addEventListener("click", async () => {
      const item = (items || []).find(x => String(x.id) === String(id));
      try {
        const res = await fetch(`${API_BASE}/shopping/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_purchased: !item?.is_purchased }),
        });
        if (!res.ok) throw new Error();
        if (window.initShopping) window.initShopping();
      } catch {
        showShoppingFeedback(section, "No se pudo actualizar el estado de compra. Intenta de nuevo.");
      }
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
      try {
        const res = await fetch(`${API_BASE}/shopping/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        if (window.initShopping) window.initShopping();
      } catch {
        showShoppingFeedback(section, "No se pudo quitar este producto. Intenta de nuevo.");
      }
    });

    // Tocar el texto lo edita ahí mismo (Enter guarda, Esc vuelve)
    row.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      const nameEl = row.querySelector(".shopping-name");
      if (!nameEl || nameEl.dataset.editing) return;
      nameEl.dataset.editing = "1";
      const current = nameEl.textContent;
      const field = document.createElement("input");
      field.type = "text";
      field.className = "shopping-edit";
      field.value = current;
      field.maxLength = 255;
      nameEl.replaceWith(field);
      field.focus();
      field.select();
      let finishing = false;
      const finish = async (save) => {
        if (finishing) return;
        finishing = true;
        const value = field.value.trim();
        if (!value) save = false;
        if (save && value !== current) {
          field.disabled = true;
          try {
            const res = await fetch(`${API_BASE}/shopping/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ description: value }),
            });
            if (!res.ok) throw new Error();
            nameEl.textContent = value;
            field.replaceWith(nameEl);
            delete nameEl.dataset.editing;
            if (window.initShopping) window.initShopping();
            return;
          } catch {
            showShoppingFeedback(section, "No se pudo guardar el nombre. Se restauró el texto anterior.");
          }
        }
        nameEl.textContent = current;
        field.replaceWith(nameEl);
        delete nameEl.dataset.editing;
      };
      field.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); finish(true); }
        else if (e.key === "Escape") { e.preventDefault(); finish(false); }
      });
      field.addEventListener("blur", () => finish(true));
    });

    // "Dónde comprar en Santiago": busca tiendas del rubro
    row.querySelector('[data-action="places"]')?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.textContent = "Buscando…";
      const r = await fetch(`${API_BASE}/shopping/${id}/places`).then(x => x.json()).catch(() => null);
      if (r?.places?.length) {
        await putCard(id, { places: r.places });
      } else {
        btn.textContent = "Sin sugerencias";
        setTimeout(() => { if (window.initShopping) window.initShopping(); }, 1200);
        return;
      }
      if (window.initShopping) window.initShopping();
    });
  });

  // Lugares de compra: se piden de a poco, en segundo plano.
  let changed = false;
  const hydration = items.map(async (item) => {
    if (item.card?.places) return;
    try {
      const r = await fetch(`${API_BASE}/shopping/${item.id}/places`).then(x => x.json()).catch(() => null);
      if (r?.places?.length) {
        await putCard(item.id, { places: r.places });
        changed = true;
      }
    } catch {
      // sin lugares: se queda la tarjeta simple
    }
  });
  await Promise.all(hydration);
  if (changed && window.initShopping) window.initShopping();
}

async function putCard(id, patch) {
  await fetch(`${API_BASE}/shopping/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ card: patch }),
  });
}

function itemHtml(i) {
  const card = i.card || {};
  const places = card.places?.length
    ? `<span class="shopping-places-on">En Santiago: ${escapeHtml(card.places.join(", "))}</span>`
    : `<button class="shopping-places-btn" data-action="places">Dónde comprar en Santiago</button>`;
  return `
  <div class="shopping-item ${i.is_purchased ? "done" : ""}" data-item-id="${i.id}">
    <button class="shopping-check ${i.is_purchased ? "done" : ""}" data-action="toggle" aria-label="${i.is_purchased ? "Marcar pendiente" : "Marcar comprado"}: ${escapeHtml(i.description)}" aria-pressed="${!!i.is_purchased}">${i.is_purchased ? "✓" : ""}</button>
    <div class="shopping-info">
      <div class="shopping-line">
        <button type="button" class="shopping-name" data-action="edit" title="Tocar para editar" aria-label="Editar ${escapeHtml(i.description)}">${escapeHtml(i.description)}</button>
        ${i.estimated_amount ? `<span class="shopping-est">~${formatMoney(i.estimated_amount)}</span>` : ""}
      </div>
      <div class="shopping-places">${places}</div>
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

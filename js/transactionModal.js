/* ============================================
   BRISA - Transaction Modal Module
   Handles transaction creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard } from "./modalGuard.js";

const EXPENSE_CATEGORIES = ["Comida", "Transporte", "Casa", "Salud", "Ocio", "Suscripciones", "Trabajo", "Préstamo", "Otro"];
const INCOME_CATEGORIES = ["Sueldo", "Aguinaldo", "Reembolso", "Préstamo", "Otro"];

function fillCategories(form, type, selected) {
  const sel = form.querySelector("#tx-category-select");
  if (!sel) return;
  const list = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  sel.innerHTML = `<option value="">Sin categoría</option>` +
    list.map(c => `<option value="${c}" ${selected === c ? "selected" : ""}>${c}</option>`).join("");
}

export function initTransactionModal() {
  const overlay = document.querySelector("#transaction-modal");
  const closeBtn = document.querySelector("#transaction-modal-close");
  const cancelBtn = document.querySelector("#transaction-modal-cancel");
  const form = document.querySelector("#transaction-form");
  const titleEl = document.querySelector("#transaction-modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form || !titleEl) return;

  let editingId = null;
  let currentAccountId = null;
  let cleanSnapshot = null;

  function open(accountId = null, txId = null) {
    // open(accountId) or open(accountId, txId)
    if (typeof accountId === "object") accountId = null;
    currentAccountId = accountId;
    editingId = txId;
    form.reset();

    if (txId) {
      titleEl.textContent = "Editar movimiento";
      fetch(`${API_BASE}/transactions/${txId}`)
        .then(r => r.json())
        .then(tx => {
          form.description.value = tx.description || "";
          form.amount.value = tx.amount ?? "";
          form.type.value = tx.type || "expense";
          fillCategories(form, form.type.value, tx.category || "");
          form.date.value = tx.date ? String(tx.date).slice(0, 10) : "";
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => console.error("Error cargando movimiento:", e));
    } else {
      titleEl.textContent = "Nuevo movimiento";
      form.date.value = new Date().toISOString().slice(0, 10);
      fillCategories(form, form.type.value, "");
      cleanSnapshot = snapshotForm(form);
    }

    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='description']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    overlay.classList.remove("active");
    form.reset();
    editingId = null;
  }

  function tryClose() {
    if (isDirty(form, cleanSnapshot) && !confirmDiscard()) return;
    close();
  }

  closeBtn.addEventListener("click", tryClose);
  cancelBtn.addEventListener("click", tryClose);

  form.type.addEventListener("change", () => {
    fillCategories(form, form.type.value, "");
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) tryClose();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) tryClose();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.description || !data.description.trim()) return;
    if (!data.amount || Number(data.amount) <= 0) {
      alert("Ingresa un monto mayor a 0.");
      return;
    }

    try {
      const payload = { ...data, account_id: currentAccountId };
      const res = await fetch(
        editingId ? `${API_BASE}/transactions/${editingId}` : `${API_BASE}/transactions`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "No se pudo guardar. Intenta de nuevo.");
        return;
      }
      close();
      if (window.initFinance) window.initFinance();
    } catch (err) {
      console.error("Error guardando movimiento:", err);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });

  window.openTransactionModal = open;
}

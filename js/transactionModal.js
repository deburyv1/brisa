/* ============================================
   BRISA - Transaction Modal Module
   Handles transaction creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard, setFormFeedback, setFormBusy, setFormLoading, isFormSaving } from "./modalGuard.js";
import { localDateKey } from "./reconcile.js";

const EXPENSE_CATEGORIES = ["Comida", "Transporte", "Casa", "Salud", "Ocio", "Suscripciones", "Regalos", "Trabajo", "Préstamo", "Tarjeta", "Ahorro", "Otro"];
const INCOME_CATEGORIES = ["Sueldo", "Aguinaldo", "Reembolso", "Préstamo", "Otro"];

function fillCategories(form, type, selected) {
  const sel = form.querySelector("#tx-category-select");
  if (!sel) return;
  const list = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  sel.innerHTML = `<option value="">Sin categoría</option>` +
    list.map(c => `<option value="${c}" ${selected === c ? "selected" : ""}>${c}</option>`).join("");
}

function toggleLinkRow(form) {
  const row = form.querySelector("#tx-link-row");
  if (row) row.style.display = form.type.value === "income" ? "" : "none";
}

function togglePersonRow(form) {
  const row = form.querySelector("#tx-person-row");
  if (row) row.style.display = form.owner.value === "other" ? "" : "none";
}

async function fillPersonOptions(form, selected) {
  const sel = form.querySelector("#tx-person-select");
  if (!sel) return;
  sel.innerHTML = `<option value="">Seleccionar...</option>`;
  try {
    const res = await fetch(`${API_BASE}/people`);
    if (!res.ok) return;
    const people = await res.json();
    for (const p of people) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nickname || p.name;
      if (String(p.id) === String(selected)) opt.selected = true;
      sel.appendChild(opt);
    }
  } catch (e) {
    console.error("Error cargando personas:", e);
  }
}

async function fillLinkOptions(form, accountId, selected, excludeId) {
  const sel = form.querySelector("#tx-link-select");
  if (!sel) return;
  sel.innerHTML = `<option value="">Sin vincular</option>`;
  if (!accountId) return;
  try {
    const res = await fetch(`${API_BASE}/transactions?account_id=${accountId}`);
    if (!res.ok) return;
    const txs = await res.json();
    for (const t of txs.filter(t => t.type !== "income" && String(t.id) !== String(excludeId))) {
      const opt = document.createElement("option");
      opt.value = t.id;
      const d = t.date ? String(t.date).slice(0, 10) : "";
      opt.textContent = `${t.description} · ${Number(t.amount).toLocaleString("es-ES")}${d ? " · " + d : ""}`;
      if (String(t.id) === String(selected)) opt.selected = true;
      sel.appendChild(opt);
    }
  } catch (e) {
    console.error("Error cargando gastos:", e);
  }
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
  let loadGeneration = 0;

  function open(accountId = null, txId = null, preset = null) {
    const generation = ++loadGeneration;
    // open(accountId) or open(accountId, txId) or open(accountId, null, preset)
    if (typeof accountId === "object") accountId = null;
    currentAccountId = accountId;
    editingId = txId;
    form.reset();
    window.resetPickers(form);
    setFormFeedback(form, "");

    if (txId) {
      titleEl.textContent = "Editar movimiento";
      setFormLoading(form, true);
      cleanSnapshot = null;
      fetch(`${API_BASE}/transactions/${txId}`)
        .then(r => {
          if (!r.ok) throw new Error("No se pudo cargar este movimiento.");
          return r.json();
        })
        .then(async tx => {
          if (generation !== loadGeneration) return;
          form.description.value = tx.description || "";
          form.alias.value = tx.alias || "";
          form.details.value = tx.details || "";
          form.amount.value = tx.amount ?? "";
          form.type.value = tx.type || "expense";
          form.is_recurring.checked = !!tx.is_recurring;
          form.is_planned.checked = tx.status === "planned";
          form.owner.value = tx.owner || "mine";
          fillCategories(form, form.type.value, tx.category || "");
          toggleLinkRow(form);
          togglePersonRow(form);
          await fillLinkOptions(form, currentAccountId, tx.linked_id || "", txId);
          await fillPersonOptions(form, tx.person_id || "");
          if (generation !== loadGeneration) return;
          window.setPickerValue(form.date, tx.date ? String(tx.date).slice(0, 10) : "");
          setFormLoading(form, false);
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => {
          if (generation !== loadGeneration) return;
          console.error("Error cargando movimiento:", e);
          setFormLoading(form, false);
          setFormFeedback(form, e.message || "No se pudo cargar. Cierra e inténtalo de nuevo.");
          const submit = form.querySelector("button[type='submit']");
          if (submit) submit.disabled = true;
        });
    } else {
      titleEl.textContent = "Nuevo movimiento";
      setFormBusy(form, false);
      window.setPickerValue(form.date, localDateKey());
      fillCategories(form, form.type.value, preset?.category || "");
      const descInput = form.description;
      descInput.readOnly = false;
      descInput.title = "";
      if (preset) {
        if (preset.description) form.description.value = preset.description;
        if (preset.alias !== undefined) form.alias.value = preset.alias || "";
        if (preset.details !== undefined) form.details.value = preset.details || "";
        if (preset.amount != null) form.amount.value = preset.amount;
        if (preset.type) {
          form.type.value = preset.type;
          fillCategories(form, preset.type, preset.category || "");
        }
        form.is_recurring.checked = !!preset.lockDescription;
        if (preset.lockDescription) {
          // The description identifies the fixed series: changing it would
          // spawn a second series. Alias/details stay editable.
          descInput.readOnly = true;
          descInput.title = "La descripción identifica la serie fija";
          if (!form.querySelector("#tx-lock-hint")) {
            const hint = document.createElement("div");
            hint.id = "tx-lock-hint";
            hint.className = "tx-lock-hint";
            hint.textContent = "La descripción identifica la serie · usa el alias para personalizar";
            descInput.after(hint);
          }
        } else {
          form.querySelector("#tx-lock-hint")?.remove();
        }
      }
      toggleLinkRow(form);
      togglePersonRow(form);
      fillPersonOptions(form, "");
      // Snapshot synchronously: if the user types before the async
      // option loads finish, the dirty guard still catches it.
      const pristineSnapshot = snapshotForm(form);
      cleanSnapshot = pristineSnapshot;
      fillLinkOptions(form, currentAccountId, "", null).then(() => {
        if (!isDirty(form, pristineSnapshot)) cleanSnapshot = snapshotForm(form);
      });
    }

    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='description']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    loadGeneration++;
    overlay.classList.remove("active");
    setFormBusy(form, false);
    setFormFeedback(form, "");
    form.reset();
    window.resetPickers(form);
    editingId = null;
  }

  function tryClose() {
    if (isFormSaving(form)) return;
    if (isDirty(form, cleanSnapshot) && !confirmDiscard()) return;
    close();
  }

  closeBtn.addEventListener("click", tryClose);
  cancelBtn.addEventListener("click", tryClose);

  form.type.addEventListener("change", () => {
    fillCategories(form, form.type.value, "");
    toggleLinkRow(form);
  });

  form.owner.addEventListener("change", () => {
    togglePersonRow(form);
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

    if (!data.description || !data.description.trim()) {
      setFormFeedback(form, "Escribe una descripción para el movimiento.");
      form.description.focus();
      return;
    }
    if (!data.amount || Number(data.amount) <= 0) {
      setFormFeedback(form, "Ingresa un monto mayor a 0.");
      form.amount.focus();
      return;
    }

    try {
      setFormFeedback(form, "");
      setFormBusy(form, true);
      const payload = { ...data, account_id: currentAccountId };
      payload.status = data.is_planned ? "planned" : "posted";
      delete payload.is_planned;
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
        throw new Error(err.error || "No se pudo guardar. Intenta de nuevo.");
      }
      close();
      if (window.initFinance) await window.initFinance();
      if (window.renderGuidanceBanner) window.renderGuidanceBanner();
    } catch (err) {
      console.error("Error guardando movimiento:", err);
      setFormFeedback(form, err.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setFormBusy(form, false);
    }
  });

  window.openTransactionModal = open;
}

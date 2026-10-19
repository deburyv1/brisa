/* ============================================
   BRISA - Account Modal Module
   Handles bank account creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard, setFormFeedback, setFormBusy, setFormLoading, isFormSaving } from "./modalGuard.js";

export function initAccountModal() {
  const overlay = document.querySelector("#account-modal");
  const closeBtn = document.querySelector("#account-modal-close");
  const cancelBtn = document.querySelector("#account-modal-cancel");
  const form = document.querySelector("#account-form");
  const titleEl = document.querySelector("#account-modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form || !titleEl) return;

  let cleanSnapshot = null;
  let editingId = null;
  let loadGeneration = 0;

  function open(accountId = null) {
    const generation = ++loadGeneration;
    editingId = accountId;
    form.reset();
    window.resetPickers(form);
    setFormFeedback(form, "");

    if (accountId) {
      titleEl.textContent = "Editar cuenta";
      setFormLoading(form, true);
      cleanSnapshot = null;
      fetch(`${API_BASE}/accounts/${accountId}`)
        .then(r => {
          if (!r.ok) throw new Error("No se pudo cargar esta cuenta.");
          return r.json();
        })
        .then(a => {
          if (generation !== loadGeneration) return;
          form.name.value = a.name || "";
          form.account_number.value = a.account_number || "";
          form.initial_balance.value = a.initial_balance ?? "";
          window.setPickerValue(form.initial_date, a.initial_date ? String(a.initial_date).slice(0, 10) : "");
          setFormLoading(form, false);
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => {
          if (generation !== loadGeneration) return;
          console.error("Error cargando cuenta:", e);
          setFormLoading(form, false);
          setFormFeedback(form, e.message || "No se pudo cargar. Cierra e inténtalo de nuevo.");
          const submit = form.querySelector("button[type='submit']");
          if (submit) submit.disabled = true;
        });
    } else {
      titleEl.textContent = "Nueva cuenta";
      setFormBusy(form, false);
      cleanSnapshot = snapshotForm(form);
    }
    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='name']");
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

    if (!data.name || !data.name.trim()) {
      setFormFeedback(form, "Escribe un nombre para la cuenta.");
      form.name.focus();
      return;
    }

    try {
      setFormFeedback(form, "");
      setFormBusy(form, true);
      const res = await fetch(
        editingId ? `${API_BASE}/accounts/${editingId}` : `${API_BASE}/accounts`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "No se pudo guardar. Intenta de nuevo.");
      }
      close();
      if (window.initFinance) window.initFinance();
    } catch (err) {
      console.error("Error guardando cuenta:", err);
      setFormFeedback(form, err.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setFormBusy(form, false);
    }
  });

  window.openAccountModal = open;
}

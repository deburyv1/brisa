/* ============================================
   BRISA - Account Modal Module
   Handles bank account creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard } from "./modalGuard.js";

export function initAccountModal() {
  const overlay = document.querySelector("#account-modal");
  const closeBtn = document.querySelector("#account-modal-close");
  const cancelBtn = document.querySelector("#account-modal-cancel");
  const form = document.querySelector("#account-form");
  const titleEl = document.querySelector("#account-modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form || !titleEl) return;

  let cleanSnapshot = null;

  function open() {
    titleEl.textContent = "Nueva cuenta";
    form.reset();
    cleanSnapshot = snapshotForm(form);
    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='name']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    overlay.classList.remove("active");
    form.reset();
  }

  function tryClose() {
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

    if (!data.name || !data.name.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "No se pudo guardar. Intenta de nuevo.");
        return;
      }
      close();
      if (window.initFinance) window.initFinance();
    } catch (err) {
      console.error("Error guardando cuenta:", err);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });

  window.openAccountModal = open;
}

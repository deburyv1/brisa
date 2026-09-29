/* ============================================
   BRISA - Account Modal Module
   Handles bank account creation and editing
   ============================================ */
const API_BASE = "/api";

export function initAccountModal() {
  const overlay = document.querySelector("#account-modal");
  const closeBtn = document.querySelector("#account-modal-close");
  const cancelBtn = document.querySelector("#account-modal-cancel");
  const form = document.querySelector("#account-form");
  const titleEl = document.querySelector("#account-modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form || !titleEl) return;

  function open() {
    titleEl.textContent = "Nueva cuenta";
    form.reset();
    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='name']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    overlay.classList.remove("active");
    form.reset();
  }

  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
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
        alert(err.error || "No se pudo guardar. Intentá de nuevo.");
        return;
      }
      close();
      if (window.initFinance) window.initFinance();
    } catch (err) {
      console.error("Error guardando cuenta:", err);
      alert("No se pudo guardar. Intentá de nuevo.");
    }
  });

  window.openAccountModal = open;
}

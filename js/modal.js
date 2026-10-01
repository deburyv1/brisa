/* ============================================
   BRISA - Person Modal Module
   Handles person creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard } from "./modalGuard.js";

export function initModal() {
  const overlay = document.querySelector("#person-modal");
  const closeBtn = document.querySelector("#modal-close");
  const cancelBtn = document.querySelector("#modal-cancel");
  const form = document.querySelector("#person-form");
  const titleEl = document.querySelector("#person-modal .modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form) return;

  let editingId = null;
  let cleanSnapshot = null;

  function open(personId = null) {
    editingId = personId;
    form.reset();

    if (personId) {
      if (titleEl) titleEl.textContent = "Editar persona";
      fetch(`${API_BASE}/people/${personId}`)
        .then(r => r.json())
        .then(p => {
          form.name.value = p.name || "";
          form.nickname.value = p.nickname || "";
          form.phone.value = p.phone || "";
          form.rut.value = p.rut || "";
          form.relation.value = p.relation || "";
          form.birthday.value = p.birthday ? String(p.birthday).slice(0, 10) : "";
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => console.error("Error cargando persona:", e));
    } else {
      if (titleEl) titleEl.textContent = "Nueva persona";
      cleanSnapshot = snapshotForm(form);
    }

    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='name']");
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
      const res = await fetch(
        editingId ? `${API_BASE}/people/${editingId}` : `${API_BASE}/people`,
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      close();
      if (window.initRelationships) window.initRelationships();
      if (window.initBirthdays) window.initBirthdays();
    } catch (err) {
      console.error("Error guardando persona:", err);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });

  window.openPersonModal = open;
}

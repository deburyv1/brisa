/* ============================================
   BRISA - Person Modal Module
   Handles person creation and editing
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard, setFormFeedback, setFormBusy, setFormLoading, isFormSaving } from "./modalGuard.js";

function parseBirthday(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const parts = s.split(/[\/\-]/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    const [a, b] = parts;
    const d = Number(a), m = Number(b);
    if (!Number.isInteger(d) || !Number.isInteger(m) || d < 1 || d > 31 || m < 1 || m > 12) return null;
    return validBirthday(2000, m, d) ? `2000-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  }
  if (parts.length === 3) {
    let dd, mm, yyyy;
    if (parts[0].length === 4) { [yyyy, mm, dd] = parts; }
    else { [dd, mm, yyyy] = parts; }
    const d = Number(dd), m = Number(mm), y = Number(yyyy);
    if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)
        || d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2100) return null;
    return validBirthday(y, m, d) ? `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  }
  return null;
}

function validBirthday(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatBirthdayForInput(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).slice(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return "";
  if (y === "2000") return `${d}/${m}`;
  return `${d}/${m}/${y}`;
}

export function initModal() {
  const overlay = document.querySelector("#person-modal");
  const closeBtn = document.querySelector("#modal-close");
  const cancelBtn = document.querySelector("#modal-cancel");
  const form = document.querySelector("#person-form");
  const titleEl = document.querySelector("#person-modal .modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form) return;

  let editingId = null;
  let cleanSnapshot = null;
  let loadGeneration = 0;

  function open(personId = null) {
    const generation = ++loadGeneration;
    editingId = personId;
    form.reset();
    window.resetPickers(form);
    setFormFeedback(form, "");

    if (personId) {
      if (titleEl) titleEl.textContent = "Editar persona";
      setFormLoading(form, true);
      cleanSnapshot = null;
      fetch(`${API_BASE}/people/${personId}`)
        .then(r => {
          if (!r.ok) throw new Error("No se pudo cargar esta persona.");
          return r.json();
        })
        .then(p => {
          if (generation !== loadGeneration) return;
          form.name.value = p.name || "";
          form.nickname.value = p.nickname || "";
          form.phone.value = p.phone || "";
          form.rut.value = p.rut || "";
          form.relation.value = p.relation || "";
          form.birthday.value = p.birthday ? formatBirthdayForInput(p.birthday) : "";
          setFormLoading(form, false);
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => {
          if (generation !== loadGeneration) return;
          console.error("Error cargando persona:", e);
          setFormLoading(form, false);
          setFormFeedback(form, e.message || "No se pudo cargar. Cierra e inténtalo de nuevo.");
          const submit = form.querySelector("button[type='submit']");
          if (submit) submit.disabled = true;
        });
    } else {
      if (titleEl) titleEl.textContent = "Nueva persona";
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
      setFormFeedback(form, "Escribe un nombre para la persona.");
      form.name.focus();
      return;
    }

    // Cumpleaños flexible: "dd/mm" (año desconocido) o "dd/mm/aaaa".
    // Se guarda siempre como fecha (año 2000 si no se indicó), y la UI
    // muestra solo día y mes.
    if (data.birthday && String(data.birthday).trim()) {
      const parsed = parseBirthday(data.birthday);
      if (!parsed) {
        setFormFeedback(form, "Cumpleaños inválido. Usa dd/mm o dd/mm/aaaa (ej: 15/03 o 15/03/1990).");
        form.birthday.focus();
        return;
      }
      data.birthday = parsed;
    } else {
      data.birthday = null;
    }

    try {
      setFormFeedback(form, "");
      setFormBusy(form, true);
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
      setFormFeedback(form, err.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setFormBusy(form, false);
    }
  });

  window.openPersonModal = open;
}

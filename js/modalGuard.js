/* ============================================
   BRISA - Modal Guard
   Prevents accidental loss of unsaved form data.
   Snapshot on open, compare on dismiss.
   ============================================ */

export function snapshotForm(form) {
  const data = {};
  for (const [k, v] of new FormData(form).entries()) {
    data[k] = v instanceof File ? `file:${v.name}:${v.size}` : v;
  }
  return JSON.stringify(data);
}

export function isDirty(form, snapshot) {
  if (!snapshot) return false;
  return snapshotForm(form) !== snapshot;
}

export function confirmDiscard() {
  return confirm("Tienes cambios sin guardar. ¿Descartarlos?");
}

export function setFormFeedback(form, message = "", kind = "error") {
  let el = form.querySelector("[data-form-feedback]");
  if (!el) {
    el = document.createElement("div");
    el.dataset.formFeedback = "";
    el.className = "form-feedback";
    const actions = form.querySelector(".modal-actions");
    form.insertBefore(el, actions || null);
  }
  el.textContent = message;
  el.hidden = !message;
  el.classList.toggle("is-error", kind === "error");
  el.classList.toggle("is-info", kind === "info");
  el.setAttribute("role", kind === "error" ? "alert" : "status");
}

export function setFormBusy(form, busy, label = "Guardando…") {
  for (const control of form.querySelectorAll("input, select, textarea")) {
    control.disabled = busy;
  }
  const button = form.querySelector("button[type='submit']");
  if (!button) return;
  if (busy) {
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent.trim();
    button.disabled = true;
    button.textContent = label;
    form.setAttribute("aria-busy", "true");
    form.dataset.saving = "true";
  } else {
    button.disabled = false;
    button.textContent = button.dataset.idleLabel || "Guardar";
    form.removeAttribute("aria-busy");
    delete form.dataset.saving;
  }
}

export function isFormSaving(form) {
  return form?.dataset.saving === "true";
}

export function setFormLoading(form, loading, message = "Cargando…") {
  for (const control of form.querySelectorAll("input, select, textarea, button")) {
    if (control.type !== "hidden") control.disabled = loading;
  }
  if (loading) {
    setFormFeedback(form, message, "info");
    form.setAttribute("aria-busy", "true");
  } else {
    setFormFeedback(form, "");
    form.removeAttribute("aria-busy");
  }
}

// datetime-local ("2026-10-01T19:15") -> ISO instant, so the
// backend always stores UTC and reads never shift with TZ.
export function toISODateTime(v) {
  if (!v) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toISOString();
}

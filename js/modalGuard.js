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

export function initDialogAccessibility() {
  const overlays = [...document.querySelectorAll(".modal-overlay")];
  const sync = overlay => {
    const panel = overlay.querySelector(".modal") || overlay.firstElementChild;
    if (!panel) return;
    const active = overlay.classList.contains("active");
    overlay.setAttribute("aria-hidden", String(!active));
    overlay.inert = !active;
    const controls = overlay.querySelectorAll('a[href], button, input, select, textarea, [tabindex]');
    controls.forEach(control => {
      if (active) {
        if (!Object.hasOwn(control.dataset, "dialogTabindex")) return;
        const previous = control.dataset.dialogTabindex;
        if (previous === "__none__") control.removeAttribute("tabindex");
        else control.setAttribute("tabindex", previous);
        delete control.dataset.dialogTabindex;
      } else if (!Object.hasOwn(control.dataset, "dialogTabindex")) {
        control.dataset.dialogTabindex = control.getAttribute("tabindex") ?? "__none__";
        control.setAttribute("tabindex", "-1");
      }
    });
    if (!panel.hasAttribute("role")) panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
    const title = panel.querySelector(".modal-title, .auth-title, h1, h2");
    if (title) {
      if (!title.id) title.id = `${overlay.id || "brisa"}-title`;
      panel.setAttribute("aria-labelledby", title.id);
    }
  };
  overlays.forEach(overlay => {
    sync(overlay);
    new MutationObserver(() => sync(overlay)).observe(overlay, { attributes: true, attributeFilter: ["class"] });
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const active = overlays.filter(overlay => overlay.classList.contains("active")).pop();
    if (!active) return;
    const panel = active.querySelector(".modal") || active.firstElementChild;
    const focusable = [...panel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(el => !el.hidden && !el.closest("[hidden]") && el.getClientRects().length > 0);
    if (!focusable.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });
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

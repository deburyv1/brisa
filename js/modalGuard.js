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

// datetime-local ("2026-10-01T19:15") -> ISO instant, so the
// backend always stores UTC and reads never shift with TZ.
export function toISODateTime(v) {
  if (!v) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toISOString();
}

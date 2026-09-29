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

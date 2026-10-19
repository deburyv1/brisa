/* ============================================
   BRISA - Event Modal Module
   Handles event creation
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard, toISODateTime, setFormFeedback, setFormBusy, setFormLoading, isFormSaving } from "./modalGuard.js";

function splitLocal(iso) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (isNaN(d)) return { date: "", time: "" };
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function initEventModal() {
  const overlay = document.querySelector("#event-modal");
  const closeBtn = document.querySelector("#event-modal-close");
  const cancelBtn = document.querySelector("#event-modal-cancel");
  const form = document.querySelector("#event-form");
  const titleEl = document.querySelector("#event-modal-title");

  if (!overlay || !closeBtn || !cancelBtn || !form) return;

  let editingId = null;
  let cleanSnapshot = null;
  let loadGeneration = 0;

  function open(eventId = null) {
    const generation = ++loadGeneration;
    editingId = eventId;
    form.reset();
    form.use_departure_checklist.closest("label").hidden = Boolean(eventId);
    window.resetPickers(form);
    setFormFeedback(form, "");
    if (eventId) {
      titleEl.textContent = "Editar evento";
      setFormLoading(form, true);
      cleanSnapshot = null;
      fetch(`${API_BASE}/events/${eventId}`)
        .then(r => {
          if (!r.ok) throw new Error("No se pudo cargar este evento.");
          return r.json();
        })
        .then(ev => {
          if (generation !== loadGeneration) return;
          form.title.value = ev.title || "";
          form.location.value = ev.location || "";
          form.use_departure_checklist.checked = Boolean(ev.use_departure_checklist);
          form.description.value = ev.description || "";
          form.travel_minutes.value = ev.travel_minutes ?? "";
          const s = splitLocal(ev.start);
          window.setPickerValue(form.start_date, s.date);
          window.setPickerValue(form.start_time, s.time);
          const e = splitLocal(ev.end);
          window.setPickerValue(form.end_date, e.date);
          window.setPickerValue(form.end_time, e.time);
          setFormLoading(form, false);
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => {
          if (generation !== loadGeneration) return;
          console.error("Error cargando evento:", e);
          setFormLoading(form, false);
          setFormFeedback(form, e.message || "No se pudo cargar. Cierra e inténtalo de nuevo.");
          const submit = form.querySelector("button[type='submit']");
          if (submit) submit.disabled = true;
        });
    } else {
      titleEl.textContent = "Nuevo evento";
      form.use_departure_checklist.checked = false;
      setFormBusy(form, false);
      cleanSnapshot = snapshotForm(form);
    }
    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='title']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    loadGeneration++;
    overlay.classList.remove("active");
    setFormBusy(form, false);
    setFormFeedback(form, "");
    form.reset();
    form.use_departure_checklist.closest("label").hidden = false;
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

  form.location.addEventListener("input", () => {
    if (!editingId && form.location.value.trim()) form.use_departure_checklist.checked = true;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.title || !data.title.trim()) {
      setFormFeedback(form, "Escribe un título para el evento.");
      form.title.focus();
      return;
    }
    if (!data.start_date) {
      setFormFeedback(form, "El evento necesita al menos una fecha.");
      form.start_date.focus();
      return;
    }
    if (data.end_date) {
      const endBeforeStart = data.end_date < data.start_date;
      const sameDayWithTimes = data.end_date === data.start_date && (data.start_time || data.end_time)
        && (data.end_time || "00:00") <= (data.start_time || "00:00");
      if (endBeforeStart || sameDayWithTimes) {
        setFormFeedback(form, "La fecha y hora de término debe ser posterior al inicio.");
        form.end_date.focus();
        return;
      }
    }
    const at = (d, t) => (d ? `${d}T${t || "00:00"}` : null);

    try {
      setFormFeedback(form, "");
      setFormBusy(form, true);
      const body = JSON.stringify({
        ...data,
        use_departure_checklist: form.use_departure_checklist.checked,
        start: toISODateTime(at(data.start_date, data.start_time)),
        end: toISODateTime(at(data.end_date, data.end_time)),
      });
      if (editingId) {
        const res = await fetch(`${API_BASE}/events/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } else {
        const res = await fetch(`${API_BASE}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      }
      close();
      if (window.initCalendar) window.initCalendar();
      if (window.initToday) window.initToday();
      if (window.initWeek) window.initWeek();
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) await window.renderNext();
    } catch (err) {
      console.error("Error guardando evento:", err);
      setFormFeedback(form, err.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      setFormBusy(form, false);
    }
  });

  window.openEventModal = open;
}

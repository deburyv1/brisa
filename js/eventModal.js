/* ============================================
   BRISA - Event Modal Module
   Handles event creation
   ============================================ */
const API_BASE = "/api";
import { snapshotForm, isDirty, confirmDiscard, toISODateTime } from "./modalGuard.js";

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

  function open(eventId = null) {
    editingId = eventId;
    form.reset();
    if (eventId) {
      titleEl.textContent = "Editar evento";
      fetch(`${API_BASE}/events/${eventId}`)
        .then(r => r.json())
        .then(ev => {
          form.title.value = ev.title || "";
          form.location.value = ev.location || "";
          form.description.value = ev.description || "";
          form.travel_minutes.value = ev.travel_minutes ?? "";
          const s = splitLocal(ev.start);
          form.start_date.value = s.date;
          form.start_time.value = s.time;
          const e = splitLocal(ev.end);
          form.end_date.value = e.date;
          form.end_time.value = e.time;
          cleanSnapshot = snapshotForm(form);
        })
        .catch(e => console.error("Error cargando evento:", e));
    } else {
      titleEl.textContent = "Nuevo evento";
      cleanSnapshot = snapshotForm(form);
    }
    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='title']");
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

    if (!data.title || !data.title.trim()) return;
    if (!data.start_date) {
      alert("El evento necesita al menos una fecha.");
      return;
    }
    const at = (d, t) => (d ? `${d}T${t || "00:00"}` : null);

    try {
      const body = JSON.stringify({
        ...data,
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
    } catch (err) {
      console.error("Error guardando evento:", err);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });

  window.openEventModal = open;
}

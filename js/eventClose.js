/* ============================================
   BRISA - Event Close Module
   Flujo amable para cerrar eventos pasados:
   cómo salió (conclusión), no pasó (cancelar),
   quedó pendiente (otro día) y seguimiento.
   Cero culpa: no juzga, solo cierra el loop.
   ============================================ */

const API_BASE = "/api";

let currentEventId = null;
let currentEvent = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showCloseFeedback(overlay, message = "") {
  let el = overlay.querySelector("#event-close-feedback");
  if (!el) {
    el = document.createElement("div");
    el.id = "event-close-feedback";
    el.className = "event-detail-feedback";
    el.setAttribute("role", "alert");
    overlay.querySelector("#event-close-when")?.after(el);
  }
  el.textContent = message;
  el.hidden = !message;
}

function formatWhen(ev) {
  const date = new Date(ev.start).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
  const d = new Date(ev.start);
  const dayOnly = d.getHours() === 0 && d.getMinutes() === 0;
  if (dayOnly) return date;
  return `${date}, ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

function resetChoices(overlay) {
  overlay.querySelectorAll(".event-close-choice").forEach(btn => btn.classList.remove("active"));
  const moveRow = overlay.querySelector("#event-close-move-row");
  if (moveRow) moveRow.hidden = true;
}

async function refreshViews() {
  if (window.initCalendar) window.initCalendar();
  if (window.initWeek) window.initWeek();
  if (window.initToday) window.initToday();
  if (window.initTasks) await window.initTasks();
  if (window.renderNext) window.renderNext();
  if (window.renderGuidanceBanner) window.renderGuidanceBanner();
}

export function initEventClose() {
  const overlay = document.querySelector("#event-close-modal");
  if (!overlay) return;

  const closeBtn = overlay.querySelector("#event-close-x");
  const laterBtn = overlay.querySelector("#event-close-later");
  const saveBtn = overlay.querySelector("#event-close-save");
  const conclusionEl = overlay.querySelector("#event-close-conclusion");
  const followupInput = overlay.querySelector("#event-close-followup-input");
  const followupAdd = overlay.querySelector("#event-close-followup-add");
  const moveRow = overlay.querySelector("#event-close-move-row");
  const moveDate = overlay.querySelector("#event-close-move-date");
  const moveGo = overlay.querySelector("#event-close-move-go");

  function close() {
    overlay.classList.remove("active");
    currentEventId = null;
    currentEvent = null;
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });
  closeBtn?.addEventListener("click", close);

  // Elección de desenlace: solo marca el botón; el guardado es único.
  overlay.querySelectorAll(".event-close-choice").forEach(btn => {
    btn.addEventListener("click", () => {
      const outcome = btn.dataset.outcome;
      const already = btn.classList.contains("active");
      resetChoices(overlay);
      if (already) return;
      btn.classList.add("active");
      if (outcome === "moved" && moveRow) {
        moveRow.hidden = false;
        moveDate?.focus();
      }
    });
  });

  async function saveOutcome(outcome, conclusion) {
    const body = {};
    if (conclusion) body.conclusion = conclusion;
    if (outcome === "done") {
      body.status = "done";
      body.completed_at = new Date().toISOString();
    } else if (outcome === "cancelled") {
      body.status = "cancelled";
    }
    const res = await fetch(`${API_BASE}/events/${currentEventId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("No se pudo guardar el cierre del evento.");
    return res.json();
  }

  // Guardar: aplica desenlace (si se eligió) + conclusión.
  saveBtn?.addEventListener("click", async () => {
    if (!currentEventId) return;
    const outcome = overlay.querySelector(".event-close-choice.active")?.dataset.outcome || null;
    const conclusion = (conclusionEl?.value || "").trim();
    saveBtn.disabled = true;
    showCloseFeedback(overlay, "");
    try {
      // Un evento "hecho" cierra sus pasos abiertos, igual que desde el detalle.
      if (outcome && window.applyEventStatus) {
        await window.applyEventStatus(currentEventId, outcome);
        if (conclusion) {
          const res = await fetch(`${API_BASE}/events/${currentEventId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conclusion }),
          });
          if (!res.ok) throw new Error("No se pudo guardar cómo salió.");
        }
      } else if (conclusion) {
        const res = await fetch(`${API_BASE}/events/${currentEventId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conclusion }),
        });
        if (!res.ok) throw new Error("No se pudo guardar cómo salió.");
      } else if (!outcome) {
        // Sin desenlace ni conclusión: no hay nada que guardar.
        close();
        return;
      }
      await refreshViews();
      close();
    } catch (e) {
      console.error("Error cerrando evento:", e);
      showCloseFeedback(overlay, e.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      saveBtn.disabled = false;
    }
  });

  // Dejar abierto: solo guarda la conclusión si hay; el loop sigue.
  laterBtn?.addEventListener("click", async () => {
    if (!currentEventId) return;
    const conclusion = (conclusionEl?.value || "").trim();
    if (!conclusion) {
      close();
      return;
    }
    laterBtn.disabled = true;
    showCloseFeedback(overlay, "");
    try {
      const res = await fetch(`${API_BASE}/events/${currentEventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conclusion }),
      });
      if (!res.ok) throw new Error("No se pudo guardar cómo salió.");
      await refreshViews();
      close();
    } catch (e) {
      console.error("Error guardando conclusión:", e);
      showCloseFeedback(overlay, e.message || "No se pudo guardar. Intenta de nuevo.");
    } finally {
      laterBtn.disabled = false;
    }
  });

  // Quedó pendiente: mover de día conservando la hora.
  moveGo?.addEventListener("click", async () => {
    if (!currentEventId || !currentEvent) return;
    const v = moveDate?.value;
    if (!v) return;
    moveGo.disabled = true;
    showCloseFeedback(overlay, "");
    try {
      const cur = currentEvent;
      const s = new Date(cur.start);
      const [y, m, d] = v.split("-").map(Number);
      const at = new Date(y, (m || 1) - 1, d || 1, s.getHours(), s.getMinutes(), 0, 0);
      const dur = cur.end ? new Date(cur.end).getTime() - s.getTime() : 0;
      const body = { start: at.toISOString() };
      if (cur.end) body.end = new Date(at.getTime() + dur).toISOString();
      const conclusion = (conclusionEl?.value || "").trim();
      if (conclusion) body.conclusion = conclusion;
      const res = await fetch(`${API_BASE}/events/${currentEventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("No se pudo mover el evento.");
      await refreshViews();
      close();
    } catch (e) {
      console.error("Error moviendo evento:", e);
      showCloseFeedback(overlay, e.message || "No se pudo mover el evento. Intenta de nuevo.");
    } finally {
      moveGo.disabled = false;
    }
  });

  // Seguimiento: crea una acción y abre su ficha para poner fecha/prioridad.
  followupAdd?.addEventListener("click", async () => {
    if (!currentEventId || !currentEvent) return;
    const text = (followupInput?.value || "").trim();
    if (!text) {
      followupInput?.focus();
      return;
    }
    followupAdd.disabled = true;
    showCloseFeedback(overlay, "");
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: text,
          description: `Surgió de: ${currentEvent.title || "un evento"} (${new Date(currentEvent.start).toLocaleDateString("es-ES", { day: "numeric", month: "short" })})`,
        }),
      });
      if (!res.ok) throw new Error("No se pudo crear la acción de seguimiento.");
      const created = await res.json().catch(() => null);
      followupInput.value = "";
      await refreshViews();
      close();
      if (created?.id && window.openTaskModal) window.openTaskModal(created.id);
    } catch (e) {
      console.error("Error creando seguimiento:", e);
      showCloseFeedback(overlay, e.message || "No se pudo crear la acción. Intenta de nuevo.");
    } finally {
      followupAdd.disabled = false;
    }
  });
  followupInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      followupAdd?.click();
    }
  });

  // Abre el flujo para un evento (pasado o no).
  window.openEventClose = async (eventId) => {
    let ev = null;
    try {
      const res = await fetch(`${API_BASE}/events/${eventId}`);
      if (res.ok) ev = await res.json();
    } catch (e) {
      console.error("Error cargando evento:", e);
    }
    if (!ev) return;

    currentEventId = ev.id;
    currentEvent = ev;
    showCloseFeedback(overlay, "");
    resetChoices(overlay);
    overlay.querySelector("#event-close-title").textContent = ev.title || "Evento";
    overlay.querySelector("#event-close-when").textContent = ev.start ? formatWhen(ev) : "";
    if (conclusionEl) conclusionEl.value = ev.conclusion || "";
    if (followupInput) followupInput.value = "";
    if (moveDate && ev.start) {
      const s = new Date(ev.start);
      const pad = (n) => String(n).padStart(2, "0");
      window.setPickerValue?.(moveDate, `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`);
    }
    overlay.classList.add("active");
  };
}

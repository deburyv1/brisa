/* ============================================
   BRISA - Event Detail Module
   Shows event info + one-tap prep task creation
   ============================================ */

const API_BASE = "/api";

let currentEventId = null;
let travelTickId = null;

function stopTravelTick() {
  if (travelTickId) {
    clearInterval(travelTickId);
    travelTickId = null;
  }
}

// Live countdown to leave time: "sales en 25 min" or "¡deberías estar saliendo!"
function travelCountdown(ev) {
  if (!ev || !ev.start || !ev.travel_minutes) return "";
  const leaveAt = new Date(ev.start).getTime() - Number(ev.travel_minutes) * 60000;
  const diffMin = Math.round((leaveAt - Date.now()) / 60000);
  if (diffMin <= 0) {
    const startIn = Math.round((new Date(ev.start).getTime() - Date.now()) / 60000);
    if (startIn <= 0) return "";
    return "¡deberías estar saliendo!";
  }
  if (diffMin < 60) return `sales en ${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `sales en ${h} h` : `sales en ${h} h ${m} min`;
}

function renderTravelRow(overlay, ev) {
  const el = overlay.querySelector("#event-detail-travel");
  if (!el) return;
  stopTravelTick();
  const leave = formatLeave(ev);
  const countdown = travelCountdown(ev);
  if (leave) {
    el.innerHTML = `🚌 Salir a las <strong>${leave}</strong> (${ev.travel_minutes} min de viaje)<span id="travel-countdown">${countdown ? ` · ${countdown}` : ""}</span> · <button class="tx-btn tx-btn-edit" id="travel-edit">Cambiar</button>`;
    if (countdown) {
      travelTickId = setInterval(() => {
        if (!document.querySelector("#event-detail-modal.active")) {
          stopTravelTick();
          return;
        }
        const next = travelCountdown(ev);
        const span = document.querySelector("#travel-countdown");
        if (!next) {
          stopTravelTick();
          renderTravelRow(overlay, ev);
          return;
        }
        if (span) span.textContent = ` · ${next}`;
      }, 30000);
    }
  } else {
    el.innerHTML = `🚌 Viaje: <button class="tx-btn tx-btn-edit" id="travel-edit">Agregar tiempo de viaje</button>`;
  }
  el.querySelector("#travel-edit")?.addEventListener("click", () => {
    el.innerHTML = `
      <input type="number" id="travel-input" min="0" max="480" placeholder="Minutos"
        value="${ev.travel_minutes || ""}"
        style="width:80px;border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:5px 8px;font-size:11px;color:#fff;background:rgba(255,255,255,.08);outline:none">
      <button class="tx-btn tx-btn-edit" id="travel-save">Guardar</button>`;
    const saveTravel = async () => {
      const val = el.querySelector("#travel-input")?.value;
      try {
        const res = await fetch(`${API_BASE}/events/${ev.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ travel_minutes: val === "" ? null : Number(val) }),
        });
        if (res.ok) {
          ev.travel_minutes = val === "" ? null : Number(val);
          renderTravelRow(overlay, ev);
          if (window.initCalendar) window.initCalendar();
          if (window.initToday) window.initToday();
        }
      } catch (e) {
        console.error("Error guardando viaje:", e);
      }
    };
    el.querySelector("#travel-save")?.addEventListener("click", saveTravel);
    el.querySelector("#travel-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveTravel();
      }
    });
  });
}

async function renderPrepList(overlay, eventId) {
  const box = overlay.querySelector("#event-prep-list");
  if (!box) return;
  let tasks = [];
  try {
    const res = await fetch(`${API_BASE}/tasks`);
    if (res.ok) tasks = (await res.json()).filter(t => String(t.event_id) === String(eventId));
  } catch (e) {
    console.error("Error cargando preparación:", e);
  }
  const done = tasks.filter(t => t.is_completed).length;
  const open = tasks.filter(t => !t.is_completed);
  box.innerHTML = tasks.length === 0
    ? `<div class="focus-note">Sin pasos todavía. Agrega el primero arriba.</div>`
    : `<div class="focus-note">Antes del evento · ${done} de ${tasks.length} listos</div>` + tasks.map(t => `
      <label class="prep-row">
        <input type="checkbox" data-prep-toggle="${t.id}" ${t.is_completed ? "checked" : ""}>
        <span class="${t.is_completed ? "prep-done" : ""}">${escapeHtml(t.title)}</span>
      </label>`).join("") + (open.length > 0 ? `
      <button class="modal-btn modal-btn-secondary" id="event-prep-focus" style="margin-top:8px" title="Abrir el siguiente paso en Enfoque">▶ Enfocar: ${escapeHtml(open[0].title.slice(0, 40))}</button>` : "");;
  box.querySelector("#event-prep-focus")?.addEventListener("click", async () => {
    try {
      const res = await fetch(`${API_BASE}/tasks`);
      if (!res.ok) return;
      const next = (await res.json())
        .filter(t => !t.is_completed && String(t.event_id) === String(eventId))
        .sort((a, b) => String(a.created_at) > String(b.created_at) ? 1 : -1)[0];
      if (next && window.startWorkmode) {
        document.querySelector("#event-detail-modal")?.classList.remove("active");
        window.startWorkmode(next.id);
      }
    } catch (e) {
      console.error("Error enfocando:", e);
    }
  });
  box.querySelectorAll("[data-prep-toggle]").forEach(cb => {
    cb.addEventListener("change", async () => {
      try {
        await fetch(`${API_BASE}/tasks/${cb.dataset.prepToggle}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            is_completed: cb.checked,
            completed_at: cb.checked ? new Date().toISOString() : null,
          }),
        });
        if (window.initTasks) await window.initTasks();
        if (window.initReadiness) window.initReadiness();
        if (window.renderNext) window.renderNext();
        if (window.initToday) window.initToday();
        await renderPrepList(overlay, eventId);
      } catch (e) {
        console.error("Error actualizando paso:", e);
      }
    });
  });
}

export function leaveBy(ev) {
  if (!ev || !ev.start) return null;
  const travel = Number(ev.travel_minutes) || 0;
  return new Date(new Date(ev.start).getTime() - travel * 60000);
}

function formatLeave(ev) {
  const leave = leaveBy(ev);
  if (!leave || !ev.travel_minutes) return "";
  return leave.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function isMidnight(dt) {
  if (!dt) return false;
  const d = new Date(dt);
  return d.getHours() === 0 && d.getMinutes() === 0;
}

function formatWhen(ev) {
  const opts = { weekday: "long", day: "numeric", month: "long" };
  const date = new Date(ev.start).toLocaleDateString("es-ES", opts);
  if (isMidnight(ev.start) && (!ev.end || isMidnight(ev.end))) {
    return `${date} · Todo el día`;
  }
  const timeOpts = { hour: "2-digit", minute: "2-digit" };
  const start = new Date(ev.start).toLocaleTimeString("es-ES", timeOpts);
  const end = ev.end ? ` – ${new Date(ev.end).toLocaleTimeString("es-ES", timeOpts)}` : "";
  return `${date}, ${start}${end}`;
}

export function initEventDetail() {
  const overlay = document.querySelector("#event-detail-modal");
  if (!overlay) return;

  overlay.querySelector("#event-detail-close")?.addEventListener("click", close);
  overlay.querySelector("#event-detail-ok")?.addEventListener("click", close);
  overlay.querySelector("#event-detail-edit")?.addEventListener("click", () => {
    const id = currentEventId;
    close();
    if (id && window.openEventModal) window.openEventModal(id);
  });
  overlay.querySelector("#event-detail-delete")?.addEventListener("click", async () => {
    if (!currentEventId) return;
    if (!confirm("¿Eliminar este evento? Sus preparaciones quedan como tareas sueltas.")) return;
    try {
      await fetch(`${API_BASE}/events/${currentEventId}`, { method: "DELETE" });
    } catch (e) {
      console.error("Error eliminando evento:", e);
    }
    close();
    if (window.initCalendar) window.initCalendar();
    if (window.initWeek) window.initWeek();
    if (window.initToday) window.initToday();
    if (window.renderNext) window.renderNext();
  });
  overlay.querySelector("#event-detail-done")?.addEventListener("click", async () => {
    if (!currentEventId) return;
    const btn = overlay.querySelector("#event-detail-done");
    const toDone = btn?.textContent !== "Devolver";
    btn.disabled = true;
    try {
      // The event and its linked tasks are one commitment in two views:
      // closing the event closes its open tasks, reopening restores
      // only those closed alongside it (older completions stay done).
      const ev = await fetch(`${API_BASE}/events/${currentEventId}`).then(r => r.json()).catch(() => null);
      const linked = await fetch(`${API_BASE}/tasks`).then(r => r.ok ? r.json() : []).catch(() => []);
      const mine = (linked || []).filter(t => String(t.event_id) === String(currentEventId));
      const now = new Date().toISOString();
      if (toDone) {
        for (const t of mine.filter(t => !t.is_completed)) {
          await fetch(`${API_BASE}/tasks/${t.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_completed: true, completed_at: now }),
          });
        }
      } else if (ev && ev.completed_at) {
        for (const t of mine.filter(t => t.is_completed && t.completed_at && t.completed_at >= ev.completed_at)) {
          await fetch(`${API_BASE}/tasks/${t.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_completed: false, completed_at: null }),
          });
        }
      }
      await fetch(`${API_BASE}/events/${currentEventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toDone
          ? { status: "done", completed_at: now }
          : { status: "open", completed_at: null }),
      });
      if (window.initCalendar) window.initCalendar();
      if (window.initWeek) window.initWeek();
      if (window.initToday) window.initToday();
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      if (window.openEventDetail) await window.openEventDetail(currentEventId);
    } catch (e) {
      console.error("Error actualizando evento:", e);
    } finally {
      btn.disabled = false;
    }
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  function close() {
    stopTravelTick();
    overlay.classList.remove("active");
  }

  window.openEventDetail = async (eventId) => {
    let ev = null;
    try {
      const res = await fetch(`${API_BASE}/events`);
      if (res.ok) {
        const all = await res.json();
        ev = all.find(x => String(x.id) === String(eventId));
      }
    } catch (e) {
      console.error("Error cargando evento:", e);
    }
    if (!ev) return;

    currentEventId = ev.id;
    overlay.querySelector("#event-detail-title").textContent = ev.title || "Evento";
    overlay.querySelector("#event-detail-when").textContent = ev.start ? formatWhen(ev) : "";
    overlay.querySelector("#event-detail-location").textContent = ev.location ? `📍 ${ev.location}` : "";
    overlay.querySelector("#event-detail-desc").textContent = ev.description || "";
    const doneBtn = overlay.querySelector("#event-detail-done");
    if (doneBtn) doneBtn.textContent = ev.status === "done" ? "Devolver" : "Hecho ✓";
    renderTravelRow(overlay, ev);
    const prepInput = overlay.querySelector("#event-prep-input");
    if (prepInput) prepInput.value = "";
    await renderPrepList(overlay, ev.id);
    overlay.classList.add("active");
    prepInput?.focus();
  };

  overlay.querySelector("#event-prep-add")?.addEventListener("click", addPrep);
  overlay.querySelector("#event-prep-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addPrep();
    }
  });

  async function addPrep() {
    const input = overlay.querySelector("#event-prep-input");
    const titleEl = overlay.querySelector("#event-detail-title");
    const text = input?.value.trim();
    if (!text || !currentEventId) return;
    try {
      await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: text,
          description: `Preparación para: ${titleEl?.textContent || ""}`,
          event_id: currentEventId,
        }),
      });
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      await renderPrepList(overlay, currentEventId);
      input.value = "";
      input.placeholder = "Agregado ✓ ¿algo más?";
      setTimeout(() => { input.placeholder = "Ej: sacar la ropa del closet"; }, 2500);
    } catch (e) {
      console.error("Error creando preparación:", e);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  };
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

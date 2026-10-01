/* ============================================
   BRISA - Event Detail Module
   Shows event info + one-tap prep task creation
   ============================================ */

const API_BASE = "/api";

function formatWhen(ev) {
  const opts = { weekday: "long", day: "numeric", month: "long" };
  const date = new Date(ev.start).toLocaleDateString("es-ES", opts);
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
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  function close() {
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

    overlay.querySelector("#event-detail-title").textContent = ev.title || "Evento";
    overlay.querySelector("#event-detail-when").textContent = ev.start ? formatWhen(ev) : "";
    overlay.querySelector("#event-detail-location").textContent = ev.location ? `📍 ${ev.location}` : "";
    overlay.querySelector("#event-detail-desc").textContent = ev.description || "";
    const prepInput = overlay.querySelector("#event-prep-input");
    if (prepInput) prepInput.value = "";
    overlay.classList.add("active");
    prepInput?.focus();
  };

  overlay.querySelector("#event-prep-add")?.addEventListener("click", async () => {
    const input = overlay.querySelector("#event-prep-input");
    const titleEl = overlay.querySelector("#event-detail-title");
    const text = input?.value.trim();
    if (!text) return;
    try {
      await fetch(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: text, description: `Preparación para: ${titleEl?.textContent || ""}` }),
      });
      if (window.initTasks) await window.initTasks();
      if (window.renderNext) window.renderNext();
      input.value = "";
      input.placeholder = "Agregado ✓ ¿algo más?";
      setTimeout(() => { input.placeholder = "Ej: sacar la ropa del closet"; }, 2500);
    } catch (e) {
      console.error("Error creando preparación:", e);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

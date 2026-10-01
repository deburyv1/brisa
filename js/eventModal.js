/* ============================================
   BRISA - Event Modal Module
   Handles event creation
   ============================================ */
const API_BASE = "/api";

export function initEventModal() {
  const overlay = document.querySelector("#event-modal");
  const closeBtn = document.querySelector("#event-modal-close");
  const cancelBtn = document.querySelector("#event-modal-cancel");
  const form = document.querySelector("#event-form");

  if (!overlay || !closeBtn || !cancelBtn || !form) return;

  function open() {
    form.reset();
    overlay.classList.add("active");
    const firstInput = form.querySelector("input[name='title']");
    if (firstInput) firstInput.focus();
  }

  function close() {
    overlay.classList.remove("active");
    form.reset();
  }

  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("active")) close();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    if (!data.title || !data.title.trim()) return;
    if (!data.start) {
      alert("El evento necesita fecha y hora.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      close();
      if (window.initCalendar) window.initCalendar();
      if (window.initToday) window.initToday();
    } catch (err) {
      console.error("Error guardando evento:", err);
      alert("No se pudo guardar. Intenta de nuevo.");
    }
  });

  window.openEventModal = open;
}

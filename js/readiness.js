/* ============================================
   BRISA - Readiness Module
   Daily readiness conditions (shower, bed, lunch...).
   State only, no streaks, no history shaming.
   ============================================ */

const API_BASE = "/api";

async function fetchReadiness() {
  try {
    const res = await fetch(`${API_BASE}/readiness`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudo cargar readiness:", e);
    return null;
  }
}

export async function initReadiness() {
  const section = document.querySelector("#readiness-section");
  if (!section) return;

  const items = await fetchReadiness();
  if (!items) {
    section.style.display = "";
    section.innerHTML = `
      <div class="readiness-row">
        <span class="readiness-label">¿Listo para el día?</span>
        <span class="readiness-message">No se pudieron cargar las condiciones.</span>
        <button class="readiness-add" id="readiness-retry">Reintentar</button>
      </div>`;
    section.querySelector("#readiness-retry")?.addEventListener("click", initReadiness);
    return;
  }
  section.style.display = "";

  section.innerHTML = `
    <div class="readiness-row">
      <span class="readiness-label">¿Listo para el día?</span>
      ${items.length ? items.map(i => `
        <button class="readiness-chip ${i.done ? "on" : ""}" data-item="${i.id}" data-label="${escapeHtml(i.label)}" data-linked="${i.source_type ? "1" : ""}" title="${escapeHtml(i.label)}${i.source_type ? ` (vinculado a ${i.source_type === "habit" ? "hábito" : "tarea"})` : ""}">
          ${i.done ? "✓ " : ""}${escapeHtml(i.label)}${i.source_type ? " 🔗" : ""}
        </button>
      `).join("") : `<span class="readiness-message">Agrega una condición simple que te ayude a aterrizar el día.</span>`}
      <button class="readiness-add" id="readiness-add" title="Agregar condición">+</button>
    </div>
    <div class="readiness-feedback" id="readiness-feedback" role="alert" hidden></div>
  `;

  const feedback = (message = "") => {
    const el = section.querySelector("#readiness-feedback");
    if (el) { el.textContent = message; el.hidden = !message; }
  };

  section.querySelectorAll(".readiness-chip").forEach(chip => {
    chip.addEventListener("click", async () => {
      const id = chip.dataset.item;
      const done = !chip.classList.contains("on");
      chip.disabled = true;
      feedback();
      try {
        const res = await fetch(`${API_BASE}/readiness/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: Number(id), done }),
        });
        if (!res.ok) throw new Error();
        chip.classList.toggle("on", done);
        chip.innerHTML = `${done ? "✓ " : ""}${escapeHtml(chip.dataset.label)}${chip.dataset.linked ? " 🔗" : ""}`;
      } catch {
        feedback("No se pudo guardar el cambio. Intenta de nuevo.");
      } finally {
        chip.disabled = false;
      }
    });
  });

  section.querySelector("#readiness-add")?.addEventListener("click", async () => {
    const label = prompt("Nueva condición (ej: Ropa lista):");
    if (!label || !label.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/readiness/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() }),
      });
      if (!res.ok) throw new Error();
      if (window.initReadiness) window.initReadiness();
    } catch {
      feedback("No se pudo agregar. Intenta de nuevo.");
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

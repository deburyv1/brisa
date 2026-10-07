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
  if (!items) return;
  if (items.length === 0) {
    section.style.display = "none";
    return;
  }
  section.style.display = "";

  section.innerHTML = `
    <div class="readiness-row">
      <span class="readiness-label">¿Listo para el día?</span>
      ${items.map(i => `
        <button class="readiness-chip ${i.done ? "on" : ""}" data-item="${i.id}" title="${escapeHtml(i.label)}${i.source_type === "task" ? " (vinculado a tarea)" : ""}">
          ${i.done ? "✓ " : ""}${escapeHtml(i.label)}${i.source_type === "task" ? " 🔗" : ""}
        </button>
      `).join("")}
      <button class="readiness-add" id="readiness-add" title="Agregar condición">+</button>
    </div>
  `;

  section.querySelectorAll(".readiness-chip").forEach(chip => {
    chip.addEventListener("click", async () => {
      const id = chip.dataset.item;
      const done = !chip.classList.contains("on");
      chip.classList.toggle("on", done);
      chip.innerHTML = `${done ? "✓ " : ""}${escapeHtml(chip.title)}`;
      try {
        await fetch(`${API_BASE}/readiness/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: Number(id), done }),
        });
      } catch (e) {
        console.error("Error guardando readiness:", e);
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
      if (res.ok && window.initReadiness) window.initReadiness();
    } catch (e) {
      console.error("Error creando condición:", e);
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

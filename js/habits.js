/* ============================================
   BRISA - Habits Module
   Daily habits with today toggle + neutral week dots.
   No streaks, no scores: state only.
   A habit can count as a readiness condition
   (readiness_items.source_type='habit').
   ============================================ */

const API_BASE = "/api";
const QUICK_ICONS = ["🚿", "🛏️", "🍳", "📖", "🚶", "💧", "🧘", "🎸"];

async function fetchHabits() {
  try {
    const res = await fetch(`${API_BASE}/habits`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    console.warn("No se pudieron cargar hábitos:", e);
    return null;
  }
}

async function fetchReadiness() {
  try {
    const res = await fetch(`${API_BASE}/readiness`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function initHabits() {
  const section = document.querySelector("#habits-section");
  if (!section) return;

  const habits = await fetchHabits();

  if (!habits) {
    section.innerHTML = `
      <div class="habits-empty">
        <div class="journal-empty-text">No se pudo conectar con el servidor.</div>
        <button class="modal-btn modal-btn-secondary" id="habits-retry">Reintentar</button>
      </div>`;
    section.querySelector("#habits-retry")?.addEventListener("click", initHabits);
    return;
  }

  section.innerHTML = `
    <div class="habits-header">
      <div class="habits-title">Hábitos</div>
      <div class="habits-sub">Marca el de hoy. Sin rachas, sin culpa.</div>
    </div>
    <div class="habits-add">
      <div class="habits-icon-pick" id="habits-icon-pick">
        ${QUICK_ICONS.map(e => `<button class="habits-emoji" data-emoji="${e}">${e}</button>`).join("")}
      </div>
      <div class="habits-add-row">
        <input type="text" id="habits-icon" placeholder="✦" maxlength="16" title="Emoji del hábito">
        <input type="text" id="habits-input" placeholder="Nuevo hábito (ej: tender la cama)" maxlength="100" autocomplete="off">
        <button class="habits-add-btn" id="habits-add">+</button>
      </div>
    </div>
    <div class="habits-list">
      ${habits.length === 0
        ? `<div class="habits-empty-note">Sin hábitos todavía. Crea el primero arriba y aparece en Tu día.</div>`
        : habits.map(habitHtml).join("")}
    </div>
    <div class="habit-editor" id="habit-editor" style="display:none"></div>
  `;

  let pickedIcon = "";
  const iconInput = section.querySelector("#habits-icon");
  section.querySelectorAll(".habits-emoji").forEach(btn => {
    btn.addEventListener("click", () => {
      pickedIcon = btn.dataset.emoji;
      if (iconInput) iconInput.value = pickedIcon;
      section.querySelectorAll(".habits-emoji").forEach(b => b.classList.toggle("sel", b === btn));
    });
  });

  const add = async () => {
    const name = section.querySelector("#habits-input")?.value.trim();
    if (!name) return;
    await fetch(`${API_BASE}/habits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, icon: iconInput?.value.trim() || null }),
    });
    if (window.initHabits) window.initHabits();
    if (window.initWeek) window.initWeek();
  };
  section.querySelector("#habits-add")?.addEventListener("click", add);
  section.querySelector("#habits-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); add(); }
  });

  section.querySelectorAll(".habit-row").forEach(row => {
    const id = row.dataset.habitId;
    row.querySelector('[data-action="toggle"]')?.addEventListener("click", async () => {
      const habit = habits.find(h => String(h.id) === String(id));
      const done = !habit?.done_today;
      await fetch(`${API_BASE}/habits/${id}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done }),
      });
      if (window.initHabits) window.initHabits();
      if (window.initReadiness) window.initReadiness();
      if (window.initWeek) window.initWeek();
    });
    row.querySelector('[data-action="edit"]')?.addEventListener("click", () => openEditor(id, habits));
    row.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este hábito? Se pierde su registro.")) return;
      await fetch(`${API_BASE}/habits/${id}`, { method: "DELETE" });
      if (window.initHabits) window.initHabits();
      if (window.initWeek) window.initWeek();
    });
  });
}

function habitHtml(h) {
  const dots = (h.week || []).map(d => `<span class="habit-dot ${d ? "on" : ""}"></span>`).join("");
  return `
  <div class="habit-row ${h.done_today ? "done" : ""}" data-habit-id="${h.id}">
    <button class="habit-check ${h.done_today ? "done" : ""}" data-action="toggle" title="Marcar hoy">${h.done_today ? "✓" : ""}</button>
    <div class="habit-info">
      <span class="habit-name">${h.icon ? `<span class="habit-icon">${escapeHtml(h.icon)}</span> ` : ""}${escapeHtml(h.name)}</span>
      <span class="habit-week" title="Esta semana (lun–dom)">${dots}</span>
    </div>
    <div class="tx-actions">
      <button class="tx-btn tx-btn-edit" data-action="edit" title="Editar">✎</button>
      <button class="tx-btn tx-btn-delete" data-action="delete" title="Eliminar">✕</button>
    </div>
  </div>`;
}

async function openEditor(id, habits) {
  const box = document.querySelector("#habit-editor");
  if (!box) return;
  const habit = habits.find(h => String(h.id) === String(id));
  if (!habit) return;
  const conditions = await fetchReadiness();
  const linked = conditions.find(c => c.source_type === "habit" && String(c.source_id) === String(id));

  box.style.display = "";
  box.innerHTML = `
    <div class="habit-editor-title">Editar hábito</div>
    <div class="form-group">
      <label>Nombre</label>
      <input type="text" id="habit-edit-name" value="${escapeAttr(habit.name)}" maxlength="100">
    </div>
    <div class="form-group">
      <label>Emoji</label>
      <input type="text" id="habit-edit-icon" value="${escapeAttr(habit.icon || "")}" maxlength="16">
    </div>
    <div class="form-group">
      <label>Al marcarlo, cuenta como listo <span class="optional">(opcional)</span></label>
      <select id="habit-edit-link">
        <option value="">Nada</option>
        ${conditions.map(c => `<option value="${c.id}" ${linked && String(linked.id) === String(c.id) ? "selected" : ""}>${escapeHtml(c.label)}</option>`).join("")}
      </select>
    </div>
    <div class="modal-actions">
      <button class="modal-btn modal-btn-secondary" id="habit-edit-cancel">Cancelar</button>
      <button class="modal-btn modal-btn-primary" id="habit-edit-save">Guardar</button>
    </div>
  `;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });

  box.querySelector("#habit-edit-cancel")?.addEventListener("click", () => { box.style.display = "none"; });
  box.querySelector("#habit-edit-save")?.addEventListener("click", async () => {
    const name = box.querySelector("#habit-edit-name")?.value.trim();
    const icon = box.querySelector("#habit-edit-icon")?.value.trim() || null;
    const linkId = box.querySelector("#habit-edit-link")?.value || null;
    if (!name) return;
    await fetch(`${API_BASE}/habits/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, icon }),
    });
    try {
      if (linked && String(linked.id) !== String(linkId)) {
        await fetch(`${API_BASE}/readiness/items/${linked.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_type: null, source_id: null }),
        });
      }
      if (linkId && (!linked || String(linked.id) !== String(linkId))) {
        await fetch(`${API_BASE}/readiness/items/${linkId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_type: "habit", source_id: Number(id) }),
        });
      }
    } catch (e) {
      console.error("Error vinculando condición:", e);
    }
    if (window.initHabits) window.initHabits();
    if (window.initReadiness) window.initReadiness();
    if (window.initWeek) window.initWeek();
  });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, "&#39;");
}

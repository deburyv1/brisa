/* ============================================
   BRISA - Habits Module
   Daily habits with today toggle + neutral week dots.
   No streaks, no scores: state only.
   A habit can count as a readiness condition
   (readiness_items.source_type='habit').
   ============================================ */

const API_BASE = "/api";

// Emoji picker loads lazily; if the vendor file is missing the app keeps working.
function lazyEmoji(input, btn) {
  if (!input || !btn) return;
  import("./emojiPicker.js")
    .then(m => m.attachEmojiPicker(input, btn))
    .catch(e => console.warn("Emoji picker no disponible:", e));
}
const QUICK_ICONS = ["🚿", "🛏️", "🍳", "📖", "🚶", "💧", "🧘", "🎸"];

function showHabitFeedback(section, message = "") {
  const el = section.querySelector("#habits-feedback");
  if (el) { el.textContent = message; el.hidden = !message; }
}

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
        <button class="habits-emoji-btn" id="habits-icon-btn" title="Elegir emoji">😀</button>
        <input type="text" id="habits-input" placeholder="Nuevo hábito (ej: tender la cama)" maxlength="100" autocomplete="off">
        <button class="habits-add-btn" id="habits-add" title="Agregar hábito">+</button>
      </div>
    </div>
    <div class="habits-feedback" id="habits-feedback" role="alert" hidden></div>
    <div class="habits-list">
      ${habits.length === 0
        ? `<div class="habits-empty-note">Sin hábitos todavía. Crea el primero arriba y aparece en Tu día.</div>`
        : habits.map(habitHtml).join("")}
    </div>
    <div class="habit-editor" id="habit-editor" style="display:none"></div>
  `;

  let pickedIcon = "";
  const iconInput = section.querySelector("#habits-icon");
  lazyEmoji(iconInput, section.querySelector("#habits-icon-btn"));
  section.querySelectorAll(".habits-emoji").forEach(btn => {
    btn.addEventListener("click", () => {
      pickedIcon = btn.dataset.emoji;
      if (iconInput) iconInput.value = pickedIcon;
      section.querySelectorAll(".habits-emoji").forEach(b => b.classList.toggle("sel", b === btn));
    });
  });

  const add = async () => {
    const input = section.querySelector("#habits-input");
    const name = input?.value.trim();
    if (!name) return;
    const button = section.querySelector("#habits-add");
    button.disabled = true;
    showHabitFeedback(section);
    try {
      const res = await fetch(`${API_BASE}/habits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon: iconInput?.value.trim() || null }),
      });
      if (!res.ok) throw new Error();
      if (window.initHabits) await window.initHabits();
      if (window.initWeek) await window.initWeek();
    } catch {
      button.disabled = false;
      showHabitFeedback(section, "No se pudo agregar el hábito. El nombre sigue ahí para que puedas reintentar.");
    }
  };
  section.querySelector("#habits-add")?.addEventListener("click", add);
  section.querySelector("#habits-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); add(); }
  });

  section.querySelectorAll(".habit-row").forEach(row => {
    const id = row.dataset.habitId;
    row.querySelector('[data-action="toggle"]')?.addEventListener("click", async (e) => {
      const habit = habits.find(h => String(h.id) === String(id));
      const done = !habit?.done_today;
      const button = e.currentTarget;
      button.disabled = true;
      try {
        const res = await fetch(`${API_BASE}/habits/${id}/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done }),
        });
        if (!res.ok) throw new Error();
        if (window.initHabits) await window.initHabits();
        if (window.initReadiness) await window.initReadiness();
        if (window.initWeek) await window.initWeek();
      } catch {
        button.disabled = false;
        showHabitFeedback(section, "No se pudo guardar el cambio de hoy. Intenta de nuevo.");
      }
    });
    row.querySelector('[data-action="edit"]')?.addEventListener("click", () => openEditor(id, habits));
    row.querySelector('[data-action="delete"]')?.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este hábito? Se pierde su registro.")) return;
      try {
        const res = await fetch(`${API_BASE}/habits/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        if (window.initHabits) await window.initHabits();
        if (window.initWeek) await window.initWeek();
      } catch {
        showHabitFeedback(section, "No se pudo eliminar el hábito. Intenta de nuevo.");
      }
    });
  });
}

const DOW_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // lun–dom para mostrar

function freqLabel(h) {
  if (!h || h.freq_type !== "custom" || !Array.isArray(h.freq_days) || h.freq_days.length === 0) return "";
  const days = h.freq_days.map(Number).sort();
  if (days.join() === "1,2,3,4,5") return "lun–vie";
  if (days.join() === "0,6") return "finde";
  return days.sort((a, b) => DOW_ORDER.indexOf(a) - DOW_ORDER.indexOf(b))
    .map(d => DOW_LABELS[d]).join(" · ");
}

function habitHtml(h) {
  const dots = (h.week || []).map(d => `<span class="habit-dot ${d ? "on" : ""}"></span>`).join("");
  const label = freqLabel(h);
  const due = h.due_today !== false;
  return `
  <div class="habit-row ${h.done_today ? "done" : ""} ${due ? "" : "off"}" data-habit-id="${h.id}">
    <button class="habit-check ${h.done_today ? "done" : ""}" data-action="toggle" title="${due ? "Marcar hoy" : "Hoy no toca"}" ${due ? "" : "disabled"}>${h.done_today ? "✓" : ""}</button>
    <div class="habit-info">
      <span class="habit-name">${h.icon ? `<span class="habit-icon">${escapeHtml(h.icon)}</span> ` : ""}${escapeHtml(h.name)}${due ? "" : ` <span class="habit-off">· hoy no toca</span>`}</span>
      <span class="habit-week" title="Esta semana (lun–dom)">${dots}${label ? `<span class="habit-freq">${escapeHtml(label)}</span>` : ""}</span>
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

  const initialDays = habit.freq_type === "custom" && Array.isArray(habit.freq_days)
    ? habit.freq_days.map(Number) : [0, 1, 2, 3, 4, 5, 6];

  box.style.display = "";
  box.innerHTML = `
    <div class="habit-editor-title">Editar hábito</div>
    <div class="form-group">
      <label>Nombre</label>
      <input type="text" id="habit-edit-name" value="${escapeAttr(habit.name)}" maxlength="100">
    </div>
    <div class="form-group">
      <label>Emoji</label>
      <div class="habit-emoji-row">
        <input type="text" id="habit-edit-icon" value="${escapeAttr(habit.icon || "")}" maxlength="16">
        <button class="habits-emoji-btn" id="habit-edit-icon-btn" title="Elegir emoji">😀</button>
      </div>
    </div>
    <div class="form-group">
      <label>¿Qué días toca?</label>
      <div class="freq-presets">
        <button class="freq-preset" data-preset="daily">Todos</button>
        <button class="freq-preset" data-preset="weekdays">Lun–vie</button>
        <button class="freq-preset" data-preset="weekend">Finde</button>
      </div>
      <div class="freq-days" id="habit-edit-days">
        ${DOW_ORDER.map(d => `<button class="freq-day ${initialDays.includes(d) ? "on" : ""}" data-day="${d}">${DOW_LABELS[d]}</button>`).join("")}
      </div>
    </div>
    <div class="form-group">
      <label>Hora preferida en el día <span class="optional">(opcional, para verlo en la agenda)</span></label>
      <input type="time" id="habit-edit-time" value="${escapeAttr(habit.default_time ? String(habit.default_time).slice(0, 5) : "")}">
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
    <div class="habits-feedback" id="habit-edit-feedback" role="alert" hidden></div>
  `;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  lazyEmoji(box.querySelector("#habit-edit-icon"), box.querySelector("#habit-edit-icon-btn"));

  const dayBtns = [...box.querySelectorAll(".freq-day")];
  const getDays = () => dayBtns.filter(b => b.classList.contains("on")).map(b => Number(b.dataset.day));
  dayBtns.forEach(b => b.addEventListener("click", () => b.classList.toggle("on")));
  box.querySelectorAll(".freq-preset").forEach(p => {
    p.addEventListener("click", () => {
      const preset = p.dataset.preset;
      const days = preset === "daily" ? [0, 1, 2, 3, 4, 5, 6]
        : preset === "weekdays" ? [1, 2, 3, 4, 5] : [0, 6];
      dayBtns.forEach(b => b.classList.toggle("on", days.includes(Number(b.dataset.day))));
    });
  });

  box.querySelector("#habit-edit-cancel")?.addEventListener("click", () => { box.style.display = "none"; });
  box.querySelector("#habit-edit-save")?.addEventListener("click", async () => {
    const name = box.querySelector("#habit-edit-name")?.value.trim();
    const icon = box.querySelector("#habit-edit-icon")?.value.trim() || null;
    const linkId = box.querySelector("#habit-edit-link")?.value || null;
    const error = box.querySelector("#habit-edit-feedback");
    if (!name) {
      error.textContent = "Escribe un nombre para el hábito.";
      error.hidden = false;
      box.querySelector("#habit-edit-name")?.focus();
      return;
    }
    const days = getDays();
    if (days.length === 0) {
      error.textContent = "Elige al menos un día.";
      error.hidden = false;
      return;
    }
    const timeVal = box.querySelector("#habit-edit-time")?.value || null;
    const saveButton = box.querySelector("#habit-edit-save");
    saveButton.disabled = true;
    error.hidden = true;
    try {
      const res = await fetch(`${API_BASE}/habits/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, icon,
          freq_type: days.length === 7 ? "daily" : "custom",
          freq_days: days,
          default_time: timeVal,
        }),
      });
      if (!res.ok) throw new Error();
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
    } catch {
      saveButton.disabled = false;
      error.textContent = "No se pudo guardar el hábito. Intenta de nuevo.";
      error.hidden = false;
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

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, "&#39;");
}

/* ============================================
   BRISA - People Module
   Fetches people from brisa DB
   ============================================ */
import { state } from "./state.js";

const API_BASE = "/api";

export async function fetchPeople() {
  try {
    const res = await fetch(`${API_BASE}/people`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data;
  } catch (e) {
    console.warn("No se pudieron cargar personas:", e);
    return null;
  }
}

function daysUntilBirthday(birthday) {
  const today = new Date();
  const birth = new Date(birthday);
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) {
    next.setFullYear(today.getFullYear() + 1);
  }
  return Math.ceil((next - today) / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
}

export function getDisplayName(person) {
  if (person.nickname) return person.nickname;
  const parts = person.name.split(" ");
  if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1]}`;
  return person.name;
}

export function getInitials(name) {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

export async function initBirthdays() {
  const container = document.querySelector(".birthdays");
  if (!container) return;

  const people = await fetchPeople();

  if (!people) {
    container.innerHTML = `
      <div class="birthdays-empty">
        <div class="birthdays-empty-icon">⚠️</div>
        <div class="birthdays-empty-text">No se pudo conectar con el servidor.<br>Revisa que el backend esté corriendo e intenta de nuevo.</div>
        <button class="birthdays-empty-btn" id="retry-birthdays">Reintentar</button>
      </div>
    `;
    container.querySelector("#retry-birthdays")?.addEventListener("click", () => {
      if (window.initBirthdays) window.initBirthdays();
    });
    return;
  }

  if (people.length === 0) {
    container.innerHTML = `
      <div class="birthdays-empty">
        <div class="birthdays-empty-icon">🎂</div>
        <div class="birthdays-empty-text">Todavía no tienes personas guardadas.<br>Crea la primera para ver sus cumpleaños.</div>
        <button class="birthdays-empty-btn" id="create-first-person">+ Crear primera persona</button>
      </div>
    `;
    const btn = document.querySelector("#create-first-person");
    if (btn) {
      btn.addEventListener("click", () => {
        if (window.openPersonModal) window.openPersonModal();
      });
    }
    return;
  }

  const sorted = [...people]
    .filter(p => p.birthday)
    .sort((a, b) => daysUntilBirthday(a.birthday) - daysUntilBirthday(b.birthday));

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="birthdays-empty">
        <div class="birthdays-empty-icon">🎂</div>
        <div class="birthdays-empty-text">No hay cumpleaños próximos.<br>Agregá personas con cumpleaños (día y mes alcanza).</div>
        <button class="birthdays-empty-btn" id="create-first-person">+ Crear primera persona</button>
      </div>
    `;
    const btn = document.querySelector("#create-first-person");
    if (btn) {
      btn.addEventListener("click", () => {
        if (window.openPersonModal) window.openPersonModal();
      });
    }
    return;
  }

  const next = sorted[0];
  const days = daysUntilBirthday(next.birthday);

  container.innerHTML = `
    <div class="birthdays-header">
      <div class="birthdays-title">Próximo cumpleaños</div>
    </div>
    <div class="birthdays-list">
      <div class="birthday-item">
        <div class="birthday-avatar">${getInitials(next.name)}</div>
        <div class="birthday-info">
          <div class="birthday-name">${getDisplayName(next)}</div>
          <div class="birthday-date">${formatDate(next.birthday)}</div>
        </div>
        <div class="birthday-days">${days} días</div>
      </div>
    </div>
  `;
}

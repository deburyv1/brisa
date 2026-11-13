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

function parseLocalDate(dateStr) {
  // Postgres DATE llega como "YYYY-MM-DD". Parseamos como UTC para evitar
  // el desplazamiento por zona horaria (UTC-4 en Chile).
  const s = String(dateStr || "").slice(0, 10);
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

function daysUntilBirthday(birthday) {
  const today = new Date();
  const birth = parseLocalDate(birthday);
  if (!birth) return 0;
  const next = new Date(today.getFullYear(), birth.month - 1, birth.day);
  if (next < today) {
    next.setFullYear(today.getFullYear() + 1);
  }
  return Math.ceil((next - today) / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr) {
  const birth = parseLocalDate(dateStr);
  if (!birth) return "";
  const d = new Date(Date.UTC(birth.year, birth.month - 1, birth.day));
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "long", timeZone: "UTC" });
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
        <div class="birthdays-empty-text">No hay cumpleaños próximos.<br>Agrega personas con cumpleaños; con el día y el mes basta.</div>
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

  // Los próximos 3, pero sin cortar un empate: si el 3º y el 4º caen el
  // mismo día, se muestra también el 4º (para no perderlo).
  const upcoming = sorted.slice(0, 3);
  const thirdDay = upcoming.length === 3 ? daysUntilBirthday(upcoming[2].birthday) : null;
  if (thirdDay != null) {
    for (let i = 3; i < sorted.length; i++) {
      if (daysUntilBirthday(sorted[i].birthday) === thirdDay) upcoming.push(sorted[i]);
      else break;
    }
  }

  const items = upcoming.map(p => {
    const days = daysUntilBirthday(p.birthday);
    const label = days === 0 ? "hoy" : days === 1 ? "mañana" : `${days} días`;
    return `
      <div class="birthday-item">
        <div class="birthday-avatar">${getInitials(p.name)}</div>
        <div class="birthday-info">
          <div class="birthday-name">${getDisplayName(p)}</div>
          <div class="birthday-date">${formatDate(p.birthday)}</div>
        </div>
        <div class="birthday-days">${label}</div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="birthdays-header">
      <div class="birthdays-title">Próximos cumpleaños</div>
    </div>
    <div class="birthdays-list">
      ${items}
    </div>
  `;
}

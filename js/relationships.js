/* ============================================
   BRISA - Relationships Module
   Full people list with add button
   ============================================ */
import { fetchPeople, getDisplayName, getInitials, formatDate } from "./people.js";

const API_BASE = "/api";

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (/^9\d{8}$/.test(digits)) return "56" + digits; // móvil chileno
  return digits || null;
}

function contactButtons(p) {
  const intl = normalizePhone(p.phone);
  if (!intl) return "";
  return `
    <a class="tx-btn tx-btn-edit" href="https://wa.me/${intl}" target="_blank" rel="noopener" title="WhatsApp">💬</a>
    <a class="tx-btn tx-btn-edit" href="tel:+${intl}" title="Llamar">📞</a>
  `;
}

const RELATION_LABELS = {
  family: "Familiar",
  friend: "Amigo/a",
  partner: "Pareja",
  work: "Trabajo",
  other: "Otro",
};

export function relationLabel(value) {
  return RELATION_LABELS[value] || "—";
}

export async function initRelationships() {
  const section = document.querySelector("#relationships-section");
  if (!section) return;

  const people = await fetchPeople();

  if (!people) {
    section.innerHTML = `
      <div class="relationships-empty">
        <div class="relationships-empty-icon">⚠️</div>
        <div class="relationships-empty-text">No se pudo conectar con el servidor.<br>Revisa que el backend esté corriendo e intenta de nuevo.</div>
        <button class="relationships-empty-btn" id="retry-people">Reintentar</button>
      </div>
    `;
    section.querySelector("#retry-people")?.addEventListener("click", () => {
      if (window.initRelationships) window.initRelationships();
    });
    return;
  }

  if (people.length === 0) {
    section.innerHTML = `
      <div class="relationships-empty">
        <div class="relationships-empty-icon">👥</div>
        <div class="relationships-empty-title">Tus relaciones viven acá</div>
        <div class="relationships-empty-text">Guardá a las personas importantes y Brisa te avisa sus cumpleaños.<br>Más adelante: ideas de regalo, anécdotas y recordatorios.</div>
        <button class="relationships-empty-btn" id="add-first-person">+ Nueva relación</button>
      </div>
    `;
    const btn = section.querySelector("#add-first-person");
    if (btn) {
      btn.addEventListener("click", () => {
        if (window.openPersonModal) window.openPersonModal();
      });
    }
    return;
  }

  section.innerHTML = `
    <div class="relationships-header">
      <div class="relationships-title">Relaciones</div>
      <button class="relationships-add-btn" id="add-person">+ Nueva</button>
    </div>
    <div class="relationships-list">
      ${people.map(p => `
        <div class="person-card" data-person-id="${p.id}">
          <div class="person-avatar">${getInitials(p.name)}</div>
          <div class="person-info">
            <div class="person-name">${getDisplayName(p)}</div>
            <div class="person-relation">${relationLabel(p.relation)}</div>
            ${p.birthday ? `<div class="person-birthday">🎂 ${formatDate(p.birthday)}</div>` : ""}
          </div>
          <div class="tx-actions">
            ${contactButtons(p)}
            <button class="tx-btn tx-btn-edit" data-action="edit">Editar</button>
            <button class="tx-btn tx-btn-delete" data-action="delete">Eliminar</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  const addBtn = section.querySelector("#add-person");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      if (window.openPersonModal) window.openPersonModal();
    });
  }

  section.querySelectorAll(".person-card").forEach(card => {
    const id = card.dataset.personId;

    card.querySelector('[data-action="edit"]')?.addEventListener("click", () => {
      if (window.openPersonModal) window.openPersonModal(id);
    });

    card.querySelector('[data-action="delete"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("¿Eliminar a esta persona?")) {
        await fetch(`${API_BASE}/people/${id}`, { method: "DELETE" });
        if (window.initRelationships) window.initRelationships();
        if (window.initBirthdays) window.initBirthdays();
      }
    });
  });
}

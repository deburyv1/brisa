/* ============================================
   BRISA - Account Module
   Profile view + required login gate (no skip:
   identity is mandatory).
   ============================================ */

const API_BASE = "/api/auth";

export function initAccount() {
  const section = document.querySelector("#account-section");
  if (section) renderAccount(section);
  maybeGate();
}

async function fetchStatus() {
  try {
    return await fetch(`${API_BASE}/status`).then(r => r.json());
  } catch {
    return { authenticated: false, user: null };
  }
}

async function renderAccount(section) {
  const data = await fetchStatus();
  if (data.authenticated && data.user) {
    const exp = data.expires
      ? new Date(data.expires).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
      : "—";
    let localPhoto = null;
    try { localPhoto = localStorage.getItem("brisa.avatar"); } catch { localPhoto = null; }
    const shown = localPhoto || data.user.avatar;
    section.innerHTML = `
      <div class="auth-card aero-panel">
        <div class="auth-title">Cuenta</div>
        ${shown ? `<img class="auth-avatar" src="${shown}" alt="">` : ""}
        <div class="auth-name">${escapeHtml(data.user.name || "")}</div>
        <div class="auth-email">${escapeHtml(data.user.email || "")}</div>
        <div class="auth-meta">Sesión activa hasta el ${escapeHtml(exp)}.</div>
        <div class="auth-meta">Foto: ${localPhoto ? "personalizada por ti" : "la de tu Google"}.</div>
        <div class="modal-actions">
          <button class="modal-btn modal-btn-secondary" id="account-photo">Cambiar foto</button>
          ${localPhoto ? `<button class="modal-btn modal-btn-secondary" id="account-photo-google">Usar foto de Google</button>` : ""}
          <button class="modal-btn modal-btn-secondary" id="account-logout">Cerrar sesión</button>
        </div>
      </div>`;
    section.querySelector("#account-logout")?.addEventListener("click", async () => {
      await fetch(`${API_BASE}/logout`, { method: "POST" });
      renderAccount(section);
      if (window.initAuth) window.initAuth();
      maybeGate();
    });
    section.querySelector("#account-photo")?.addEventListener("click", () => {
      if (window.openAvatarModal) window.openAvatarModal();
    });
    section.querySelector("#account-photo-google")?.addEventListener("click", async () => {
      try {
        await fetch("/api/settings/avatar", { method: "DELETE" });
      } catch { /* ignore */ }
      try { localStorage.removeItem("brisa.avatar"); } catch { /* ignore */ }
      if (window.refreshAvatar) window.refreshAvatar();
      renderAccount(section);
    });
  } else {
    section.innerHTML = `
      <div class="auth-card aero-panel">
        <div class="auth-title">Cuenta</div>
        <div class="auth-meta">Sin sesión. Brisa funciona igual en este equipo; entrar solo vincula tu identidad de Google.</div>
        <button class="modal-btn modal-btn-primary" id="account-login">Entrar con Google</button>
      </div>`;
    section.querySelector("#account-login")?.addEventListener("click", () => {
      window.location.href = `${API_BASE}/google/login`;
    });
  }
}

async function maybeGate() {
  const data = await fetchStatus();
  if (data.authenticated) return;
  const overlay = document.querySelector("#auth-gate");
  if (!overlay) return;
  overlay.classList.add("active");
  overlay.querySelector("#auth-gate-login")?.addEventListener("click", () => {
    window.location.href = `${API_BASE}/google/login`;
  }, { once: true });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
    section.innerHTML = `
      <div class="auth-card aero-panel">
        <div class="auth-title">Cuenta</div>
        ${data.user.avatar ? `<img class="auth-avatar" src="${data.user.avatar}" alt="">` : ""}
        <div class="auth-name">${escapeHtml(data.user.name || "")}</div>
        <div class="auth-email">${escapeHtml(data.user.email || "")}</div>
        <div class="auth-meta">Sesión activa hasta el ${escapeHtml(exp)}.</div>
        <div class="auth-meta">Tus datos siguen en este equipo; Google solo verifica quién eres.</div>
        <button class="modal-btn modal-btn-secondary" id="account-logout">Cerrar sesión</button>
      </div>`;
    section.querySelector("#account-logout")?.addEventListener("click", async () => {
      await fetch(`${API_BASE}/logout`, { method: "POST" });
      renderAccount(section);
      if (window.initAuth) window.initAuth();
      maybeGate();
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

/* ============================================
   BRISA - Account Module
   Profile view + optional login gate (dismissable,
   zero friction: local-first stays usable).
   ============================================ */

const API_BASE = "/api/auth";
const GATE_KEY = "brisa.skipGate";

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
      try { localStorage.removeItem(GATE_KEY); } catch { /* ignore */ }
      renderAccount(section);
      if (window.initAuth) window.initAuth();
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
  let skip = false;
  try { skip = localStorage.getItem(GATE_KEY) === "1"; } catch { skip = true; }
  if (skip) return;
  const data = await fetchStatus();
  if (data.authenticated) return;
  const overlay = document.querySelector("#auth-gate");
  if (!overlay) return;
  overlay.classList.add("active");
  overlay.querySelector("#auth-gate-login")?.addEventListener("click", () => {
    window.location.href = `${API_BASE}/google/login`;
  }, { once: true });
  overlay.querySelector("#auth-gate-skip")?.addEventListener("click", () => {
    try { localStorage.setItem(GATE_KEY, "1"); } catch { /* ignore */ }
    overlay.classList.remove("active");
  }, { once: true });
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

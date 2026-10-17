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
        <div class="auth-meta">Sin sesión. Entra con tu clave de Brisa o con Google.</div>
        <input type="password" class="auth-gate-input" id="account-key" placeholder="Clave de Brisa" autocomplete="current-password" autocapitalize="off" spellcheck="false">
        <p class="auth-gate-error" id="account-key-error" hidden></p>
        <div class="modal-actions">
          <button class="modal-btn modal-btn-primary" id="account-key-btn">Entrar con clave</button>
          <button class="modal-btn modal-btn-secondary" id="account-login">Entrar con Google</button>
        </div>
      </div>`;
    const keyInput = section.querySelector("#account-key");
    section.querySelector("#account-key-btn")?.addEventListener("click", () => {
      keyLogin(keyInput?.value, section.querySelector("#account-key-error"), section);
    });
    keyInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") keyLogin(keyInput.value, section.querySelector("#account-key-error"), section);
    });
    section.querySelector("#account-login")?.addEventListener("click", () => {
      window.location.href = `${API_BASE}/google/login`;
    });
  }
}

async function keyLogin(key, errEl, section) {
  const showError = (msg) => {
    if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
  };
  if (!key || !key.trim()) return showError("Escribe tu clave.");
  try {
    const res = await fetch(`${API_BASE}/key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: key.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return showError(res.status === 503 ? "El servidor no tiene clave configurada." : (data.error || "Clave incorrecta."));
    }
    window.location.reload();
  } catch {
    showError("No se pudo conectar.");
  }
}

async function maybeGate() {
  const data = await fetchStatus();
  if (data.authenticated) return;
  const overlay = document.querySelector("#auth-gate");
  if (!overlay) return;
  overlay.classList.add("active");
  const keyInput = overlay.querySelector("#auth-gate-key");
  const errEl = overlay.querySelector("#auth-gate-error");
  const submit = () => keyLogin(keyInput?.value, errEl, overlay);
  overlay.querySelector("#auth-gate-key-btn")?.addEventListener("click", submit);
  keyInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  setTimeout(() => keyInput?.focus(), 250);
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

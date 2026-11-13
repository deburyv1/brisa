/* ============================================
   BRISA - Account Module
   Profile view + required login gate (no skip:
   identity is mandatory).
   ============================================ */

import { syncUserCaches } from "./auth.js";
const API_BASE = "/api/auth";

export function initAccount({ render = true, gate = true, status = null } = {}) {
  const section = document.querySelector("#account-section");
  if (section && render) renderAccount(section);
  if (gate) maybeGate(status);
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
  // Navigation may have moved away while the session request was in flight.
  // Do not leave a hidden password input in the page for password managers.
  if (!section.isConnected || section.style.display === "none") return;
  syncUserCaches(data.user?.id);
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
      syncUserCaches(null);
      // Reload so another account can never briefly see this account's DOM data.
      window.location.reload();
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
        <div class="auth-meta">Crea tu espacio personal o entra a una cuenta existente.</div>
        ${data.key_enabled ? `<input type="password" class="auth-gate-input" id="account-key" placeholder="Clave de Brisa" autocomplete="current-password" autocapitalize="off" spellcheck="false">` : ""}
        <p class="auth-gate-error" id="account-key-error" hidden></p>
        <div class="modal-actions">
          ${data.key_enabled ? `<button class="modal-btn ${data.google_enabled ? "modal-btn-secondary" : "modal-btn-primary"}" id="account-key-btn">Entrar con clave</button>` : ""}
          ${data.google_enabled ? `<button class="modal-btn modal-btn-primary" id="account-login">Entrar o crear cuenta con Google</button>` : "<p class=\"auth-meta\">El acceso con Google aún no está configurado.</p>"}
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

async function maybeGate(status = null) {
  const data = status || await fetchStatus();
  if (data.authenticated) {
    // El portón se quita del DOM: si queda un input type="password" en la
    // página, el navegador trata cualquier guardado como un login y ofrece
    // "guardar contraseña" al capturar.
    document.querySelector("#auth-gate")?.remove();
    return;
  }
  const overlay = document.querySelector("#auth-gate");
  if (!overlay) return;
  overlay.classList.add("active");
  const actions = overlay.querySelector(".modal-actions");
  if (data.key_enabled) {
    const keyInput = document.createElement("input");
    keyInput.type = "password";
    keyInput.className = "auth-gate-input";
    keyInput.id = "auth-gate-key";
    keyInput.placeholder = "Clave de Brisa";
    keyInput.autocomplete = "current-password";
    keyInput.autocapitalize = "off";
    keyInput.spellcheck = false;
    overlay.querySelector(".auth-gate-text")?.after(keyInput);

    const keyButton = document.createElement("button");
    keyButton.type = "button";
    keyButton.className = `modal-btn ${data.google_enabled ? "modal-btn-secondary" : "modal-btn-primary"}`;
    keyButton.id = "auth-gate-key-btn";
    keyButton.textContent = "Entrar con clave";
    actions?.prepend(keyButton);
    keyButton.addEventListener("click", () => keyLogin(keyInput.value, overlay.querySelector("#auth-gate-error"), overlay));
    keyInput.addEventListener("keydown", e => {
      if (e.key === "Enter") keyLogin(keyInput.value, overlay.querySelector("#auth-gate-error"), overlay);
    });
  }
  if (!data.google_enabled) overlay.querySelector("#auth-gate-login")?.remove();
  if (!data.google_enabled && !data.key_enabled) {
    overlay.querySelector(".auth-gate-text").textContent = "El acceso todavía no está configurado en este servidor.";
    actions?.remove();
  }
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

/* ============================================
   BRISA - Auth Module
   Google sign-in, session status, logout.
   No frameworks: fetch + DOM.
   ============================================ */

const API_BASE = "/api/auth";

export function initAuth() {
  const btn = document.querySelector("#auth-btn");
  if (!btn) return;

  // Initial status
  fetch(`${API_BASE}/status`)
    .then(r => r.json())
    .then(data => {
      if (data.authenticated && data.user) {
        paintLoggedIn(btn, data.user);
      } else {
        paintLoggedOut(btn);
      }
    })
    .catch(() => paintLoggedOut(btn));

  btn.addEventListener("click", async () => {
    // Single clear path: everything auth-related lives in Cuenta.
    document.querySelector('.nav[data-nav="account"]')?.click();
  });
}

function paintLoggedOut(btn) {
  btn.textContent = "Entrar";
  btn.title = "Ir a Cuenta para entrar con Google";
  btn.disabled = false;
}

function paintLoggedIn(btn, user) {
  try {
    window.__googleAvatar = user.avatar || null;
    window.__googleName = user.name || user.email || "";
  } catch { /* ignore */ }
  if (window.refreshAvatar) window.refreshAvatar();
  if (user.avatar) {
    const img = document.createElement("img");
    img.src = user.avatar;
    img.alt = user.name || "Avatar";
    img.style.cssText = "width:22px;height:22px;border-radius:50%;object-fit:cover;";
    btn.innerHTML = "";
    btn.appendChild(img);
    const span = document.createElement("span");
    span.textContent = user.name || user.email;
    span.style.cssText = "font-size:11px;font-weight:700;color:var(--ink);text-shadow:var(--text-glow);";
    btn.appendChild(span);
  } else {
    btn.textContent = user.name || "Sesión activa";
  }
  btn.title = "Ir a tu Cuenta";
  btn.disabled = false;
}

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
    btn.disabled = true;
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data = await res.json();
      if (data.authenticated) {
        await fetch(`${API_BASE}/logout`, { method: "POST" });
        paintLoggedOut(btn);
      } else {
        // Redirect to Google (server handles callback + session)
        window.location.href = `${API_BASE}/google/login`;
      }
    } catch {
      btn.disabled = false;
    }
  });
}

function paintLoggedOut(btn) {
  btn.textContent = "Entrar con Google";
  btn.title = "Inicia sesión con tu cuenta Google";
  btn.disabled = false;
}

function paintLoggedIn(btn, user) {
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
  btn.title = "Cerrar sesión";
  btn.disabled = false;
}

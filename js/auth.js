/* ============================================
   BRISA - Auth Module
   Google sign-in, session status, logout.
   No frameworks: fetch + DOM.
   ============================================ */

const API_BASE = "/api/auth";
const CACHE_USER_KEY = "brisa.cacheUser";
const USER_LOCAL_KEYS = ["brisa.avatar", "brisa.bankCheck", "brisa.timerTask", "brisa.timerRun"];

export function syncUserCaches(userId) {
  let previous;
  try { previous = localStorage.getItem(CACHE_USER_KEY); } catch { return; }
  const current = userId == null ? "" : String(userId);
  if (previous === current) return;
  for (const key of USER_LOCAL_KEYS) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  try { sessionStorage.clear(); } catch { /* ignore */ }
  try {
    if (current) localStorage.setItem(CACHE_USER_KEY, current);
    else localStorage.removeItem(CACHE_USER_KEY);
  } catch { /* ignore */ }
}

function applyFeatures(user) {
  const enabled = new Set(Array.isArray(user?.features) ? user.features : []);
  document.querySelectorAll("[data-feature]").forEach(el => {
    el.hidden = !enabled.has(el.dataset.feature);
  });
  window.brisaFeatures = enabled;
}

export async function initAuth() {
  try {
    const response = await fetch(`${API_BASE}/status`);
    const data = await response.json();
    const user = data.authenticated ? data.user : null;
    syncUserCaches(user?.id);
    applyFeatures(user);
    window.__googleAvatar = user?.avatar || null;
    window.__googleName = user?.name || user?.email || "";
    if (window.refreshAvatar) window.refreshAvatar();
    return data;
  } catch {
    applyFeatures(null);
    return { authenticated: false, user: null, unavailable: true };
  }

}

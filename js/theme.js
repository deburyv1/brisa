/* ============================================
   BRISA - Theme Store
   Single source of truth for glass customization.
   Presets only write values; sliders write live.
   ============================================ */

const KEY = "brisa.theme";

export const PRESETS = {
  normal: { blur: 28, alpha: 55, sat: 140, sheen: false, night: true },
  full: { blur: 32, alpha: 62, sat: 180, sheen: true, night: true },
};

export function loadTheme() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    saved = null;
  }
  const theme = { ...PRESETS.normal, ...(saved || {}) };
  // Migration: themes saved before the readability flip had low alpha,
  // which made panels dark over dark wallpapers. Bump to readable.
  if (theme.alpha < 50) theme.alpha = 55;
  if (theme.blur < 24) theme.blur = 28;
  return theme;
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(KEY, JSON.stringify(theme));
  } catch {
    // storage unavailable: theme lasts for this session
  }
}

export function applyTheme(theme, { full = false } = {}) {
  const root = document.documentElement.style;
  root.setProperty("--glass-blur", `${theme.blur}px`);
  root.setProperty("--glass-sat", `${theme.sat}%`);
  root.setProperty("--glass-a1", (theme.alpha / 100).toFixed(2));
  root.setProperty("--glass-a2", (theme.alpha / 200).toFixed(2));
  document.body.classList.toggle("sheen", !!theme.sheen);
  document.body.classList.toggle("full-glass", full);
  const btn = document.querySelector("#glass-toggle");
  if (btn) btn.textContent = full ? "◑ Normal" : "◐ Vidrio";
}

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
  // Floor only absurd values; readability at clear settings
  // is handled by the clear-glass armor in applyTheme.
  if (theme.alpha < 10) theme.alpha = 10;
  if (theme.blur < 4) theme.blur = 4;
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
  // Milky retro-gloss: panels stay milky like the reference,
  // the slider modulates above the floor.
  const a1 = 0.45 + (theme.alpha / 100) * 0.50;
  const a2 = 0.30 + (theme.alpha / 100) * 0.35;
  root.setProperty("--glass-blur", `${theme.blur}px`);
  root.setProperty("--glass-sat", `${theme.sat}%`);
  root.setProperty("--glass-a1", a1.toFixed(2));
  root.setProperty("--glass-a2", a2.toFixed(2));
  document.body.classList.toggle("sheen", !!theme.sheen);
  document.body.classList.toggle("full-glass", full);
  // Clear glass keeps the look but needs stronger text armor
  document.body.classList.toggle("clear-glass", theme.alpha < 35 || theme.blur < 16);
  const btn = document.querySelector("#glass-toggle");
  if (btn) btn.textContent = full ? "◑ Normal" : "◐ Vidrio";
}

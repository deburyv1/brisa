/* ============================================
   BRISA - Wallpaper Module
   Day wallpaper (double-buffer crossfade) + auto night.
   Night window matches the greeting (19:00-05:59).
   Respects the theme setting (fondo nocturno automático).
   ============================================ */

const NIGHT_START = 19;
const NIGHT_END = 6;
const THEME_KEY = "brisa.theme";
const DEFAULT_WALLPAPER = "aero-background.jpg";

let activeLayer = "a";

export function isNight(date = new Date()) {
  const h = date.getHours();
  return h >= NIGHT_START || h < NIGHT_END;
}

function readTheme() {
  try {
    return JSON.parse(localStorage.getItem(THEME_KEY) || "null") || {};
  } catch {
    return {};
  }
}

function setDayImage(file) {
  const show = activeLayer === "a" ? "b" : "a";
  const hide = activeLayer;
  const showEl = document.querySelector(`#wallpaper-${show}`);
  const hideEl = document.querySelector(`#wallpaper-${hide}`);
  if (!showEl || !hideEl) return;
  const url = `aero-backgrounds/${file}`;
  const preload = new Image();
  preload.onload = () => {
    showEl.style.backgroundImage = `url("${url}")`;
    showEl.classList.add("on");
    hideEl.classList.remove("on");
    activeLayer = show;
  };
  preload.onerror = () => {
    console.warn("No se pudo cargar fondo:", file);
  };
  preload.src = url;
}

export function setWallpaper(file) {
  const theme = readTheme();
  theme.wallpaper = file;
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // storage unavailable: wallpaper lasts for this session
  }
  setDayImage(file);
  document.querySelectorAll(".wallpaper-thumb").forEach(t =>
    t.classList.toggle("selected", t.dataset.file === file));
}

export function initWallpaper() {
  const theme = readTheme();
  const file = theme.wallpaper || DEFAULT_WALLPAPER;

  // Preload night + current day so first paint never flashes
  const preloadNight = new Image();
  preloadNight.src = "aero-backgrounds/aero-night-background.jpg";
  const first = document.querySelector("#wallpaper-a");
  if (first) {
    first.style.backgroundImage = `url("aero-backgrounds/${file}")`;
    first.classList.add("on");
    activeLayer = "a";
  }

  const apply = () => {
    const nightOn = readTheme().night !== false;
    document.body.classList.toggle("night", nightOn && isNight());
  };
  apply();
  setInterval(apply, 60 * 1000);
}

/* ============================================
   BRISA - Wallpaper Module
   Day/night background with smooth crossfade.
   Night window matches the greeting (19:00-05:59).
   Respects the theme setting (fondo nocturno automático).
   ============================================ */

const NIGHT_START = 19;
const NIGHT_END = 6;
const THEME_KEY = "brisa.theme";

export function isNight(date = new Date()) {
  const h = date.getHours();
  return h >= NIGHT_START || h < NIGHT_END;
}

export function initWallpaper() {
  // Preload so the first fade doesn't flash
  const preload = new Image();
  preload.src = "aero-backgrounds/aero-night-background.jpg";

  const apply = () => {
    let nightOn = true;
    try {
      const saved = JSON.parse(localStorage.getItem(THEME_KEY) || "null");
      if (saved && saved.night === false) nightOn = false;
    } catch {
      nightOn = true;
    }
    document.body.classList.toggle("night", nightOn && isNight());
  };
  apply();
  setInterval(apply, 60 * 1000);
}

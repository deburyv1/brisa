/* ============================================
   BRISA - Wallpaper Module
   Day/night background with smooth crossfade.
   Night window matches the greeting (19:00-05:59).
   ============================================ */

const NIGHT_START = 19;
const NIGHT_END = 6;

export function isNight(date = new Date()) {
  const h = date.getHours();
  return h >= NIGHT_START || h < NIGHT_END;
}

export function initWallpaper() {
  // Preload so the first fade doesn't flash
  const preload = new Image();
  preload.src = "aero-backgrounds/aero-night-background.jpg";

  const apply = () => {
    document.body.classList.toggle("night", isNight());
  };
  apply();
  setInterval(apply, 60 * 1000);
}

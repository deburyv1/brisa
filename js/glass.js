/* ============================================
   BRISA - Glass Mode Module
   Preset toggle + Personalizar panel (all values live).
   ============================================ */
import { PRESETS, loadTheme, saveTheme, applyTheme } from "./theme.js";
import { setWallpaper } from "./wallpaper.js";

const DEFAULT_WALLPAPER = "aero-background.jpg";

let current = loadTheme();
if (!current.wallpaper) current.wallpaper = DEFAULT_WALLPAPER;
let isFull = false;

export function initGlass() {
  applyTheme(current, { full: false });

  document.querySelector("#theme-open")?.addEventListener("click", () => {
    syncPanel();
    loadWallpapers();
    document.querySelector("#theme-modal")?.classList.add("active");
  });

  document.querySelector("#theme-close")?.addEventListener("click", closeTheme);
  document.querySelector("#theme-done")?.addEventListener("click", closeTheme);
  document.querySelector("#theme-modal")?.addEventListener("click", (e) => {
    if (e.target.id === "theme-modal") closeTheme();
  });

  bindLive();
}

function closeTheme() {
  document.querySelector("#theme-modal")?.classList.remove("active");
}

function syncPanel() {
  const set = (id, value, label) => {
    const input = document.querySelector(id);
    if (input) input.value = value;
    const out = document.querySelector(label);
    if (out) out.textContent = value;
  };
  set("#theme-blur", current.blur, "#theme-blur-val");
  set("#theme-alpha", current.alpha, "#theme-alpha-val");
  set("#theme-sat", current.sat, "#theme-sat-val");
  const night = document.querySelector("#theme-night");
  if (night) night.checked = current.night !== false;
}

function bindLive() {
  const onSlider = () => {
    current = {
      ...current,
      blur: Number(document.querySelector("#theme-blur")?.value ?? current.blur),
      alpha: Number(document.querySelector("#theme-alpha")?.value ?? current.alpha),
      sat: Number(document.querySelector("#theme-sat")?.value ?? current.sat),
      night: document.querySelector("#theme-night")?.checked ?? current.night,
    };
    isFull = false;
    saveTheme(current);
    applyTheme(current, { full: false });
    syncLabels();
  };
  ["#theme-blur", "#theme-alpha", "#theme-sat", "#theme-night"].forEach(sel => {
    document.querySelector(sel)?.addEventListener("input", onSlider);
    document.querySelector(sel)?.addEventListener("change", onSlider);
  });

  document.querySelector("#theme-preset-normal")?.addEventListener("click", () => {
    current = { ...PRESETS.normal, wallpaper: current.wallpaper };
    isFull = false;
    saveTheme(current);
    applyTheme(current, { full: false });
    syncPanel();
  });
  document.querySelector("#theme-preset-full")?.addEventListener("click", () => {
    current = { ...PRESETS.full, wallpaper: current.wallpaper };
    isFull = true;
    saveTheme(current);
    applyTheme(current, { full: true });
    syncPanel();
  });
}

async function loadWallpapers() {
  const grid = document.querySelector("#wallpaper-grid");
  if (!grid) return;
  try {
    const res = await fetch("/api/wallpapers");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    grid.innerHTML = "";
    for (const w of list) {
      const btn = document.createElement("button");
      btn.className = "wallpaper-thumb" + (w.file === current.wallpaper ? " selected" : "");
      btn.dataset.file = w.file;
      btn.title = w.file;
      const img = document.createElement("img");
      img.src = w.url;
      img.alt = "";
      img.loading = "lazy";
      btn.appendChild(img);
      btn.addEventListener("click", () => {
        current.wallpaper = w.file;
        setWallpaper(w.file);
      });
      grid.appendChild(btn);
    }
    if (list.length === 0) {
      grid.innerHTML = `<span style="font-size:10px;color:rgba(255,255,255,.6)">Sin fondos disponibles.</span>`;
    }
  } catch (e) {
    console.warn("No se pudieron cargar fondos:", e);
    grid.innerHTML = `<span style="font-size:10px;color:rgba(255,255,255,.6)">No se pudieron cargar.</span>`;
  }
}

function syncLabels() {
  const out = (id, val, suffix = "") => {
    const el = document.querySelector(id);
    if (el) el.textContent = `${val}${suffix}`;
  };
  out("#theme-blur-val", current.blur, "px");
  out("#theme-alpha-val", current.alpha, "%");
  out("#theme-sat-val", current.sat, "%");
}

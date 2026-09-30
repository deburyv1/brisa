/* ============================================
   BRISA - Glass Mode Module
   Preset toggle + Personalizar panel (all values live).
   ============================================ */
import { PRESETS, loadTheme, saveTheme, applyTheme } from "./theme.js";

let current = loadTheme();
let isFull = false;

export function initGlass() {
  applyTheme(current, { full: false });

  document.querySelector("#glass-toggle")?.addEventListener("click", () => {
    isFull = !document.body.classList.contains("full-glass");
    current = { ...(isFull ? PRESETS.full : PRESETS.normal) };
    saveTheme(current);
    applyTheme(current, { full: isFull });
    syncPanel();
  });

  document.querySelector("#theme-open")?.addEventListener("click", () => {
    syncPanel();
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
  const sheen = document.querySelector("#theme-sheen");
  if (sheen) sheen.checked = !!current.sheen;
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
      sheen: document.querySelector("#theme-sheen")?.checked ?? current.sheen,
      night: document.querySelector("#theme-night")?.checked ?? current.night,
    };
    isFull = false;
    saveTheme(current);
    applyTheme(current, { full: false });
    syncLabels();
  };
  ["#theme-blur", "#theme-alpha", "#theme-sat", "#theme-sheen", "#theme-night"].forEach(sel => {
    document.querySelector(sel)?.addEventListener("input", onSlider);
    document.querySelector(sel)?.addEventListener("change", onSlider);
  });

  document.querySelector("#theme-preset-normal")?.addEventListener("click", () => {
    current = { ...PRESETS.normal };
    isFull = false;
    saveTheme(current);
    applyTheme(current, { full: false });
    syncPanel();
  });
  document.querySelector("#theme-preset-full")?.addEventListener("click", () => {
    current = { ...PRESETS.full };
    isFull = true;
    saveTheme(current);
    applyTheme(current, { full: true });
    syncPanel();
  });
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

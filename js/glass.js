/* ============================================
   BRISA - Glass Mode Module
   Toggles full Windows-7-style glass (persisted).
   ============================================ */

const STORAGE_KEY = "brisa.glass";

export function initGlass() {
  let mode = "normal";
  try {
    mode = localStorage.getItem(STORAGE_KEY) || "normal";
  } catch {
    mode = "normal";
  }
  apply(mode);

  document.querySelector("#glass-toggle")?.addEventListener("click", () => {
    mode = document.body.classList.contains("full-glass") ? "normal" : "full";
    apply(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // storage unavailable: mode lasts for this session
    }
  });
}

function apply(mode) {
  document.body.classList.toggle("full-glass", mode === "full");
  const btn = document.querySelector("#glass-toggle");
  if (btn) btn.textContent = mode === "full" ? "◑ Normal" : "◐ Vidrio";
}

/* ============================================
   BRISA - Emoji picker (vendored emoji-picker-element)
   Lazy popup with local data + Spanish UI. No CDN.
   ============================================ */
import "../vendor/emoji-picker/emoji-picker-element.js";
import Database from "../vendor/emoji-picker/emoji-database.js";
import i18nEs from "../vendor/emoji-picker/i18n-es.js";

let db = null;

function getDb() {
  if (!db) {
    db = new Database({
      dataSource: "/vendor/emoji-picker/emoji-data-es.json",
      locale: "es",
    });
  }
  return db;
}

function closeAllPops(except = null) {
  document.querySelectorAll(".emoji-pop.open").forEach(p => {
    if (p !== except) p.classList.remove("open");
  });
}

// Attaches a picker toggle next to a text input. Selecting an emoji
// replaces the input value. One popup per input, created lazily.
export function attachEmojiPicker(input, toggleBtn) {
  if (!input || !toggleBtn || toggleBtn.dataset.emojiReady) return;
  toggleBtn.dataset.emojiReady = "1";

  const pop = document.createElement("div");
  pop.className = "emoji-pop";
  const picker = document.createElement("emoji-picker");
  pop.appendChild(picker);
  toggleBtn.after(pop);

  let wired = false;
  const ensureWired = () => {
    if (wired) return;
    wired = true;
    try {
      picker.database = getDb();
      picker.i18n = i18nEs;
    } catch (e) {
      console.error("Error iniciando emoji picker:", e);
    }
  };

  picker.addEventListener("emoji-click", (e) => {
    const emoji = e.detail?.unicode || "";
    if (emoji) {
      input.value = emoji;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    pop.classList.remove("open");
    input.focus();
  });

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !pop.classList.contains("open");
    closeAllPops(pop);
    if (willOpen) {
      ensureWired();
      pop.classList.add("open");
    }
  });

  document.addEventListener("click", (e) => {
    if (!pop.classList.contains("open")) return;
    if (pop.contains(e.target) || toggleBtn.contains(e.target)) return;
    pop.classList.remove("open");
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") pop.classList.remove("open");
  });
}

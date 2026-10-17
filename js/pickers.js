/* ============================================
   BRISA - Pickers
   One pretty calendar/clock (flatpickr) for every
   date and time input, themed to match the glass UI.

   The real input keeps the app's formats (Y-m-d / H:i),
   so nothing else has to change: it only looks nicer.
   ============================================ */

const SELECTOR = 'input[type="date"], input[type="time"]';

function locale() {
  return (window.flatpickr && window.flatpickr.l10ns && window.flatpickr.l10ns.es) || undefined;
}

function isTime(el) {
  return el.type === "time";
}

/* Footer: "Limpiar" (optional fields must be clearable) and "Listo"
   (closes without hunting for empty space). */
function addFooter(inst) {
  const box = inst.calendarContainer;
  if (!box || box.querySelector(".fp-foot")) return;
  const foot = document.createElement("div");
  foot.className = "fp-foot";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "fp-foot-btn fp-foot-clear";
  clear.textContent = "Limpiar";
  clear.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    inst.clear();
    inst.close();
  });
  const done = document.createElement("button");
  done.type = "button";
  done.className = "fp-foot-btn fp-foot-done";
  done.textContent = "Listo";
  done.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    inst.close();
  });
  foot.append(clear, done);
  box.appendChild(foot);
}

function configFor(el) {
  const time = isTime(el);
  const common = {
    locale: locale(),
    disableMobile: true,      // same look on the phone as on the desktop
    allowInput: false,
    altInput: true,           // pretty text on screen, real value underneath
    altInputClass: `${el.className || ""} fp-alt ${time ? "fp-time" : "fp-date"}`.trim(),
    onReady: (_dates, _str, inst) => {
      const alt = inst.altInput;
      if (alt && !alt.placeholder) alt.placeholder = time ? "HH:MM" : "dd/mm/aaaa";
      addFooter(inst);
    },
  };
  if (time) {
    return {
      ...common,
      enableTime: true,
      noCalendar: true,
      dateFormat: "H:i",
      altFormat: "H:i",
      time_24hr: true,
    };
  }
  return {
    ...common,
    dateFormat: "Y-m-d",
    altFormat: "d/m/Y",
  };
}

export function createPicker(el) {
  if (!window.flatpickr || !el || el._flatpickr) return;
  if (el.type !== "date" && el.type !== "time") return;
  if (el.dataset.noPicker !== undefined) return;
  window.flatpickr(el, configFor(el));
}

export function initPickers(root = document) {
  if (!window.flatpickr) return;
  (root.querySelectorAll ? root.querySelectorAll(SELECTOR) : []).forEach(createPicker);
}

/* Programmatic writes must go through here, or the visible field
   (and the calendar) would disagree with the real value. */
export function setPickerValue(el, value) {
  if (!el) return;
  const clean = value === undefined || value === "" ? null : value;
  if (el._flatpickr) el._flatpickr.setDate(clean, false);
  else el.value = clean == null ? "" : clean;
}

/* form.reset() empties the inputs but flatpickr would still remember the
   old date. Call this right after every reset. */
export function resetPickers(root = document) {
  if (!root.querySelectorAll) return;
  root.querySelectorAll(".flatpickr-input").forEach((el) => el._flatpickr?.clear());
}

/* Modals are re-rendered on every open, so new inputs keep appearing. */
export function startPickerObserver() {
  if (!window.flatpickr) {
    console.warn("flatpickr no cargó: se usan los selectores nativos.");
    return;
  }
  initPickers(document);
  const mo = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.(SELECTOR)) createPicker(node);
        else node.querySelectorAll?.(SELECTOR).forEach(createPicker);
      }
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
}

export function initPickerBridge() {
  window.setPickerValue = setPickerValue;
  window.resetPickers = resetPickers;
  window.initPickers = initPickers;
  startPickerObserver();
}

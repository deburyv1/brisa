/* ============================================
   BRISA - Floating Timer Module
   Always at hand, loud finish: sound + flashing + title.
   Sound via Web Audio (no files needed).
   ============================================ */

let totalSec = 10 * 60;
let remainingSec = totalSec;
let timerId = null;
// Wall-clock deadline: the timer measures against Date.now(),
// so background-tab throttling or drift never steals time.
let endAt = null;
const TIMER_RUN_KEY = "brisa.timerRun";
let alarmTimers = [];
let originalTitle = document.title;

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function paint() {
  const pill = document.querySelector("#timer-time");
  if (pill) pill.textContent = fmt(remainingSec);
  const big = document.querySelector("#timer-big");
  if (big) big.textContent = fmt(remainingSec);
  const ring = document.querySelector("#timer-ring-fill");
  if (ring) {
    const C = 2 * Math.PI * 44;
    const frac = totalSec > 0 ? remainingSec / totalSec : 0;
    ring.style.strokeDashoffset = String(C * (1 - frac));
    ring.classList.toggle("urgent", remainingSec <= 60 && remainingSec > 0);
    ring.classList.toggle("running", !!timerId);
  }
}

function setMinutes(min) {
  stopTick();
  totalSec = Math.max(1, Math.round(min * 60));
  remainingSec = totalSec;
  clearRun();
  paint();
  document.querySelectorAll(".timer-preset").forEach(b =>
    b.classList.toggle("selected", Number(b.dataset.min) === min));
}

function stopTick() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  endAt = null;
}

function saveRun() {
  try {
    if (endAt) localStorage.setItem(TIMER_RUN_KEY, JSON.stringify({ endAt, totalSec }));
  } catch {
    // storage unavailable: no resume across reloads
  }
}

function clearRun() {
  try {
    localStorage.removeItem(TIMER_RUN_KEY);
  } catch {
    // ignore
  }
}

function tick() {
  if (!endAt) return;
  remainingSec = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  paint();
  if (remainingSec === 0) {
    stopTick();
    clearRun();
    startAlarm();
    remainingSec = totalSec;
    paint();
    syncButtons(false);
  }
}

function syncButtons(running) {
  const btn = document.querySelector("#timer-start-pause");
  const mini = document.querySelector("#timer-toggle-mini");
  if (btn) btn.textContent = running ? "Pausar" : "Iniciar";
  if (mini) mini.textContent = running ? "⏸" : "▶";
}

function beep(times = 4) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    let t = ctx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.55);
      t += 0.7;
    }
  } catch (e) {
    console.warn("Audio no disponible:", e);
  }
}

function startAlarm() {
  stopAlarm();
  stopTick();
  // Any key proves presence and stops the alarm.
  window.addEventListener("keydown", stopAlarmOnKey);
  // Sound loop
  beep(4);
  alarmTimers.push(setInterval(() => beep(4), 5000));
  // Flashing overlay
  const overlay = document.createElement("div");
  overlay.className = "timer-alarm";
  overlay.id = "timer-alarm";
  overlay.innerHTML = `
    <div class="timer-alarm-card">
      <h2>⏰ ¡Tiempo!</h2>
      <p>Lo que hiciste cuenta, aunque no esté terminado.</p>
      <button class="modal-btn modal-btn-primary" id="timer-alarm-stop">Detener</button>
    </div>
  `;
  overlay.querySelector("#timer-alarm-stop")?.addEventListener("click", stopAlarm);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) stopAlarm();
  });
  document.body.appendChild(overlay);
  // Flashing tab title
  let on = false;
  alarmTimers.push(setInterval(() => {
    on = !on;
    document.title = on ? "⏰ ¡TIEMPO! — Brisa" : originalTitle;
  }, 1000));
  // System notification (needs permission, asked on first start)
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Brisa — ¡Tiempo!", { body: "Tu temporizador terminó." });
    }
  } catch {
    // ignore
  }
}

function stopAlarmOnKey(e) {
  if (e.key === " " || e.key === "Spacebar") e.preventDefault();
  stopAlarm();
}

function stopAlarm() {
  if (!alarmTimers.length && !document.querySelector("#timer-alarm")) return;
  window.removeEventListener("keydown", stopAlarmOnKey);
  alarmTimers.forEach(clearInterval);
  alarmTimers = [];
  document.querySelector("#timer-alarm")?.remove();
  document.title = originalTitle;
}

const TIMER_POS_KEY = "brisa.timerPos";
const TIMER_SIZE_KEY = "brisa.timerSize";
const TIMER_VISIBLE_KEY = "brisa.timerVisible";
const TIMER_HOME = { left: 18, bottom: 18 };

function isVisible() {
  try {
    const raw = localStorage.getItem(TIMER_VISIBLE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function setVisible(v) {
  const pill = document.querySelector("#timer-pill");
  const panel = document.querySelector("#timer-panel");
  if (!pill) return;
  pill.style.display = v ? "" : "none";
  if (panel && !v) panel.style.display = "none";
  try {
    localStorage.setItem(TIMER_VISIBLE_KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
}

function restoreVisibility() {
  setVisible(isVisible());
}

function pillSize() {
  const pill = document.querySelector("#timer-pill");
  return pill?.offsetWidth || 96;
}

function applyTimerSize(px, save = true) {
  const pill = document.querySelector("#timer-pill");
  if (!pill) return;
  const size = Math.max(64, Math.min(1100, Math.round(px)));
  pill.style.width = `${size}px`;
  pill.style.height = `${size}px`;
  const time = pill.querySelector("#timer-time");
  if (time) time.style.fontSize = `${Math.round(size * 0.17)}px`;
  pill.querySelectorAll(".timer-mini").forEach(btn => {
    const b = Math.round(size * 0.22);
    btn.style.width = `${b}px`;
    btn.style.height = `${b}px`;
    btn.style.fontSize = `${Math.round(size * 0.1)}px`;
  });
  const slider = document.querySelector("#timer-size");
  if (slider) slider.value = String(size);
  if (save) {
    try {
      localStorage.setItem(TIMER_SIZE_KEY, String(size));
    } catch {
      // ignore
    }
  }
}

function restoreSize() {
  try {
    const raw = localStorage.getItem(TIMER_SIZE_KEY);
    applyTimerSize(raw ? Number(raw) || 96 : 96, false);
  } catch {
    applyTimerSize(96, false);
  }
}

function goHome() {
  const pill = document.querySelector("#timer-pill");
  if (!pill) return;
  pill.style.left = `${TIMER_HOME.left}px`;
  pill.style.top = "auto";
  pill.style.bottom = `${TIMER_HOME.bottom}px`;
  try {
    localStorage.removeItem(TIMER_POS_KEY);
  } catch {
    // ignore
  }
}

function centerPill() {
  const pill = document.querySelector("#timer-pill");
  if (!pill) return;
  const s = pill.offsetWidth || 96;
  pill.style.left = `${Math.max(0, (window.innerWidth - s) / 2)}px`;
  pill.style.top = `${Math.max(0, (window.innerHeight - s) / 2)}px`;
  pill.style.bottom = "auto";
  try {
    const r = pill.getBoundingClientRect();
    localStorage.setItem(TIMER_POS_KEY, JSON.stringify({ x: r.left, y: r.top }));
  } catch {
    // ignore
  }
}

function restorePos() {
  const pill = document.querySelector("#timer-pill");
  if (!pill) return;
  try {
    const raw = localStorage.getItem(TIMER_POS_KEY);
    if (!raw) return;
    const { x, y } = JSON.parse(raw);
    if (typeof x !== "number" || typeof y !== "number") return;
    const s = pillSize();
    pill.style.left = `${Math.max(0, Math.min(window.innerWidth - s, x))}px`;
    pill.style.top = `${Math.max(0, Math.min(window.innerHeight - s, y))}px`;
    pill.style.bottom = "auto";
  } catch {
    // corrupted position: keep default
  }
}

function makeDraggable(pill, panel) {
  let drag = null;

  pill.addEventListener("pointerdown", (e) => {
    if (e.target && typeof e.target.closest === "function" && e.target.closest(".timer-mini")) return;
    const r = pill.getBoundingClientRect();
    drag = { startX: e.clientX, startY: e.clientY, baseX: r.left, baseY: r.top, moved: false };
  });

  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 6) return;
    drag.moved = true;
    const s = pillSize();
    const x = Math.max(0, Math.min(window.innerWidth - s, drag.baseX + dx));
    const y = Math.max(0, Math.min(window.innerHeight - s, drag.baseY + dy));
    pill.style.left = `${x}px`;
    pill.style.top = `${y}px`;
    pill.style.bottom = "auto";
  });

  window.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    if (e.target && typeof e.target.closest === "function" && e.target.closest(".timer-mini")) return;
    if (!wasDrag) {
      panel.style.display = panel.style.display === "none" ? "" : "none";
      if (panel.style.display !== "none") dockPanel(pill, panel);
    } else {
      try {
        const r = pill.getBoundingClientRect();
        localStorage.setItem(TIMER_POS_KEY, JSON.stringify({ x: r.left, y: r.top }));
      } catch {
        // storage unavailable: position lasts for this session
      }
    }
  });

  window.addEventListener("pointercancel", () => { drag = null; });
}

function dockPanel(pill, panel) {
  const r = pill.getBoundingClientRect();
  const w = 240, h = 260;
  let x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  let y = r.top - h - 12;
  if (y < 8) y = Math.min(window.innerHeight - h - 8, r.bottom + 12);
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
  panel.style.bottom = "auto";
}

export function initTimer() {
  originalTitle = document.title;

  const pill = document.querySelector("#timer-pill");
  const panel = document.querySelector("#timer-panel");
  if (!pill || !panel) return;

  paint();
  restorePos();
  restoreSize();
  restoreVisibility();
  makeDraggable(pill, panel);

  pill.title = "Arrástrame · doble clic para guardar";
  pill.addEventListener("dblclick", (e) => {
    if (e.target.closest(".timer-mini")) return;
    setVisible(false);
  });
  document.querySelector("#timer-icon")?.addEventListener("click", () => {
    setVisible(pill.style.display === "none");
  });

  document.querySelector("#timer-toggle-mini")?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });
  document.querySelector("#timer-center-mini")?.addEventListener("click", (e) => {
    e.stopPropagation();
    centerPill();
  });

  document.querySelectorAll(".timer-preset").forEach(b =>
    b.addEventListener("click", () => setMinutes(Number(b.dataset.min))));

  document.querySelector("#timer-custom-set")?.addEventListener("click", () => {
    const v = Number(document.querySelector("#timer-custom-min")?.value);
    if (v > 0 && v <= 480) setMinutes(v);
  });

  document.querySelector("#timer-start-pause")?.addEventListener("click", () => toggle());
  document.querySelector("#timer-reset")?.addEventListener("click", () => {
    stopTick();
    clearRun();
    remainingSec = totalSec;
    syncButtons(false);
    paint();
  });
  document.querySelector("#timer-close")?.addEventListener("click", () => {
    panel.style.display = "none";
  });
  document.querySelector("#timer-size")?.addEventListener("input", (e) => {
    applyTimerSize(Number(e.target.value));
  });
  document.querySelector("#timer-home")?.addEventListener("click", () => {
    goHome();
    dockPanel(pill, panel);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.style.display !== "none" && !document.querySelector("#timer-alarm")) {
      panel.style.display = "none";
    }
  });

  function toggle() {
    if (timerId) {
      pauseTimer();
      return;
    }
    startTimer();
  }

  // Coming back to the tab (or reloading) shows the true time at once.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && timerId) tick();
  });
  resumeRun();

  window.brisaTimer = { setMinutes, start: startTimer, stop: pauseTimer, isRunning: () => !!timerId };
}

function startTimer() {
  if (timerId) return;
  setVisible(true); // a fresh session always brings the circle back
  if (remainingSec <= 0) remainingSec = totalSec;
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
  endAt = Date.now() + remainingSec * 1000;
  saveRun();
  syncButtons(true);
  timerId = setInterval(tick, 250);
  tick();
}

function pauseTimer() {
  if (!timerId) return;
  tick();
  stopTick();
  clearRun();
  syncButtons(false);
  paint();
}

function resumeRun() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(TIMER_RUN_KEY) || "null");
  } catch {
    saved = null;
  }
  if (!saved || typeof saved.endAt !== "number") return;
  if (saved.endAt <= Date.now()) {
    // It finished while away: show 00:00, no surprise alarm.
    clearRun();
    totalSec = saved.totalSec || totalSec;
    remainingSec = 0;
    paint();
    return;
  }
  totalSec = saved.totalSec || totalSec;
  endAt = saved.endAt;
  syncButtons(true);
  timerId = setInterval(tick, 250);
  tick();
}

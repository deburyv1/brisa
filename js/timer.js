/* ============================================
   BRISA - Floating Timer Module
   Always at hand, loud finish: sound + flashing + title.
   Sound via Web Audio (no files needed).
   ============================================ */

let totalSec = 10 * 60;
let remainingSec = totalSec;
let timerId = null;
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
}

function setMinutes(min) {
  stopTick();
  totalSec = Math.max(1, Math.round(min * 60));
  remainingSec = totalSec;
  paint();
  document.querySelectorAll(".timer-preset").forEach(b =>
    b.classList.toggle("selected", Number(b.dataset.min) === min));
}

function stopTick() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
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
  stopTick();
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

function stopAlarm() {
  alarmTimers.forEach(clearInterval);
  alarmTimers = [];
  document.querySelector("#timer-alarm")?.remove();
  document.title = originalTitle;
}

export function initTimer() {
  originalTitle = document.title;

  const pill = document.querySelector("#timer-pill");
  const panel = document.querySelector("#timer-panel");
  if (!pill || !panel) return;

  paint();

  pill.addEventListener("click", (e) => {
    if (e.target.closest(".timer-toggle-mini")) return;
    panel.style.display = panel.style.display === "none" ? "" : "none";
  });

  document.querySelector("#timer-toggle-mini")?.addEventListener("click", () => toggle());

  document.querySelectorAll(".timer-preset").forEach(b =>
    b.addEventListener("click", () => setMinutes(Number(b.dataset.min))));

  document.querySelector("#timer-custom-set")?.addEventListener("click", () => {
    const v = Number(document.querySelector("#timer-custom-min")?.value);
    if (v > 0 && v <= 480) setMinutes(v);
  });

  document.querySelector("#timer-start-pause")?.addEventListener("click", () => toggle());
  document.querySelector("#timer-reset")?.addEventListener("click", () => {
    stopTick();
    remainingSec = totalSec;
    paint();
  });
  document.querySelector("#timer-collapse")?.addEventListener("click", () => {
    panel.style.display = "none";
  });

  function toggle() {
    const btn = document.querySelector("#timer-start-pause");
    const mini = document.querySelector("#timer-toggle-mini");
    if (timerId) {
      stopTick();
      if (btn) btn.textContent = "Iniciar";
      if (mini) mini.textContent = "▶";
      paint();
      return;
    }
    if (remainingSec <= 0) remainingSec = totalSec;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    if (btn) btn.textContent = "Pausar";
    if (mini) mini.textContent = "⏸";
    timerId = setInterval(() => {
      remainingSec = Math.max(0, remainingSec - 1);
      paint();
      if (remainingSec === 0) {
        startAlarm();
        remainingSec = totalSec;
        paint();
      }
    }, 1000);
  }

  window.brisaTimer = { setMinutes };
}

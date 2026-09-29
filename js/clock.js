/* ============================================
   BRISA - Clock Module
   ============================================ */
export function initClock() {
  function pad(n) { return String(n).padStart(2, "0"); }

  function update() {
    const d = new Date();
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const sideTime = document.querySelector("#sideTime");
    if (sideTime) sideTime.textContent = time;
  }

  update();
  setInterval(update, 1000);
}

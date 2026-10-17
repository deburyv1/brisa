/* ============================================
   BRISA - Clock Module
   Live time, date and day-progress in the sidebar.
   Mirrors the welcome section data.
   ============================================ */
export function initClock() {
  function pad(n) { return String(n).padStart(2, "0"); }

  function update() {
    const d = new Date();
    const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const pct = ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100;

    const sideTime = document.querySelector("#sideTime");
    if (sideTime) sideTime.textContent = hhmm;

    const sideDate = document.querySelector("#sideDate");
    if (sideDate) {
      sideDate.textContent = d.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }

    const meter = document.querySelector("#tinyMeter");
    if (meter) meter.style.width = `${pct.toFixed(2)}%`;

    // Header clock: same bar everywhere, so the hour never leaves sight.
    const hcTime = document.querySelector("#hc-time");
    if (hcTime) hcTime.textContent = hhmm;
    const hcNow = document.querySelector("#hc-now");
    if (hcNow) hcNow.style.left = `${pct.toFixed(2)}%`;
  }

  const head = document.querySelector("#head-clock");
  if (head) {
    head.addEventListener("click", () => {
      document.querySelector('.nav[data-nav="home"]')?.click();
    });
  }

  update();
  setInterval(update, 1000);
}

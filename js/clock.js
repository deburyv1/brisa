/* ============================================
   BRISA - Clock Module
   Live time, date and day-progress in the sidebar.
   Mirrors the welcome section data.
   ============================================ */
export function initClock() {
  function pad(n) { return String(n).padStart(2, "0"); }

  function update() {
    const d = new Date();
    const sideTime = document.querySelector("#sideTime");
    if (sideTime) sideTime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    const sideDate = document.querySelector("#sideDate");
    if (sideDate) {
      sideDate.textContent = d.toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    }

    const meter = document.querySelector("#tinyMeter");
    if (meter) {
      const pct = ((d.getHours() * 60 + d.getMinutes()) / 1440) * 100;
      meter.style.width = `${pct.toFixed(1)}%`;
    }
  }

  update();
  setInterval(update, 1000);
}

/* ============================================
   BRISA - Greeting Module
   Dynamic greeting and date
   ============================================ */
export function initGreeting() {
  const USER_NAME = "Leonardo";

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 6) return `Buenas noches, ${USER_NAME}`;
    if (h < 12) return `Buenos días, ${USER_NAME}`;
    if (h < 19) return `Buenas tardes, ${USER_NAME}`;
    return `Buenas noches, ${USER_NAME}`;
  }

  function getDate() {
    const d = new Date();
    const options = { weekday: "long", day: "numeric", month: "long" };
    return `Hoy es ${d.toLocaleDateString("es-ES", options)}`;
  }

  function update() {
    const greetingEl = document.querySelector("#greeting");
    const dateEl = document.querySelector("#date");
    const pillEl = document.querySelector("#date-pill");
    if (greetingEl) greetingEl.textContent = getGreeting();
    if (dateEl) dateEl.textContent = getDate();
    if (pillEl) {
      pillEl.textContent = new Date().toLocaleDateString("es-ES", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
    }
  }

  update();
}

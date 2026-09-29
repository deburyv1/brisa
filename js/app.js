/* ============================================
   BRISA - Main Entry Point
   Wires all modules together
   ============================================ */
import { initClock } from "./clock.js";
import { initGreeting } from "./greeting.js";
import { initWeather } from "./weather.js";
import { renderGuidanceBanner } from "./guidance.js";
import { initBirthdays } from "./people.js";
import { initModal } from "./modal.js";
import { initRelationships } from "./relationships.js";
import { initToday } from "./today.js";
import { initTasks } from "./tasks.js";
import { initTaskModal } from "./taskModal.js";
import { initJournal } from "./journal.js";
import { initJournalModal } from "./journalModal.js";
import { initFinance } from "./finance.js";
import { initTransactionModal } from "./transactionModal.js";
import { initPlayer } from "./player.js";

window.initTasks = initTasks;
window.initJournal = initJournal;
window.initFinance = initFinance;
window.initRelationships = initRelationships;
window.initBirthdays = initBirthdays;

const NAV_LABELS = {
  home: "Inicio",
  tasks: "Acciones",
  journal: "Notas",
  finance: "Finanzas",
  people: "Relaciones",
};

const NAV_SECTIONS = {
  home: ["#welcome-section", "#today-section", "#birthdays-section"],
  tasks: ["#tasks-section"],
  journal: ["#journal-section"],
  finance: ["#finance-section"],
  people: ["#relationships-section"],
};

const ALL_SECTIONS = [
  "#welcome-section",
  "#today-section",
  "#birthdays-section",
  "#tasks-section",
  "#journal-section",
  "#finance-section",
  "#relationships-section",
];

function initNavigation() {
  const navButtons = document.querySelectorAll(".nav[data-nav]");
  const crumbCurrent = document.querySelector("#crumb-current");

  function showSection(nav) {
    const visible = NAV_SECTIONS[nav] || NAV_SECTIONS.home;
    ALL_SECTIONS.forEach(sel => {
      const el = document.querySelector(sel);
      if (el) el.style.display = visible.includes(sel) ? "" : "none";
    });

    if (crumbCurrent) crumbCurrent.textContent = NAV_LABELS[nav] || "Inicio";

    navButtons.forEach(btn => {
      btn.classList.toggle("active", btn.dataset.nav === nav);
    });
  }

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => showSection(btn.dataset.nav));
  });

  showSection("home");
}

async function main() {
  initClock();
  initGreeting();
  initModal();
  initTaskModal();
  initJournalModal();
  initTransactionModal();
  initPlayer();
  initNavigation();

  // Load data first so Today markers, badges and guidance see fresh state
  await Promise.all([
    initTasks(),
    initJournal(),
    initFinance(),
    initRelationships(),
    initBirthdays(),
  ]);
  initToday();
  initWeather();
  renderGuidanceBanner();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

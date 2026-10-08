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
import { initCapture, loadEntryIntoCapture } from "./capture.js";
import { initInbox } from "./inbox.js";
import { initNext, renderNext } from "./nextAction.js";
import { initJournal } from "./journal.js";
import { initJournalModal } from "./journalModal.js";
import { initFinance } from "./finance.js";
import { initTransactionModal } from "./transactionModal.js";
import { initAccountModal } from "./accountModal.js";
import { initPlayer } from "./player.js";
import { initAvatar } from "./avatar.js";
import { initFocus, openFocus } from "./focusMode.js";
import { initUpcoming } from "./upcoming.js";
import { initCalendar } from "./calendar.js";
import { initEventModal } from "./eventModal.js";
import { initEventDetail } from "./eventDetail.js";
import { initShopping } from "./shopping.js";
import { initReadiness } from "./readiness.js";
import { initHabits } from "./habits.js";
import { initIdeas } from "./ideas.js";
import { initTimer } from "./timer.js";
import { initWeek } from "./week.js";
import { initWallpaper } from "./wallpaper.js";
import { initGlass } from "./glass.js";

window.initTasks = initTasks;
window.initJournal = initJournal;
window.initFinance = initFinance;
window.initRelationships = initRelationships;
window.initBirthdays = initBirthdays;
window.initInbox = initInbox;
window.renderGuidanceBanner = renderGuidanceBanner;
window.initCalendar = initCalendar;
window.initShopping = initShopping;
window.initReadiness = initReadiness;
window.initHabits = initHabits;
window.initIdeas = initIdeas;
window.initWeek = initWeek;
window.initToday = initToday;
window.loadEntryIntoCapture = loadEntryIntoCapture;
window.renderNext = renderNext;
window.openFocus = openFocus;

const NAV_LABELS = {
  home: "Inicio",
  inbox: "Inbox",
  tasks: "Acciones",
  journal: "Notas",
  calendar: "Calendario",
  finance: "Finanzas",
  people: "Relaciones",
  shopping: "Compras",
  habits: "Hábitos",
  ideas: "Ideas",
};

const NAV_SECTIONS = {
  home: ["#welcome-section", "#capture-section", "#readiness-section", "#next-section", "#today-section", "#birthdays-section", "#week-section"],
  inbox: ["#inbox-section"],
  tasks: ["#tasks-section"],
  journal: ["#journal-section"],
  calendar: ["#calendar-section"],
  finance: ["#finance-section"],
  people: ["#relationships-section"],
  shopping: ["#shopping-section"],
  habits: ["#habits-section"],
  ideas: ["#ideas-section"],
};

const ALL_SECTIONS = [
  "#welcome-section",
  "#capture-section",
  "#next-section",
  "#today-section",
  "#birthdays-section",
  "#inbox-section",
  "#tasks-section",
  "#journal-section",
  "#calendar-section",
  "#finance-section",
  "#relationships-section",
  "#shopping-section",
  "#habits-section",
  "#ideas-section",
  "#readiness-section",
  "#week-section",
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
    btn.addEventListener("click", () => {
      // Manual navigation clears one-shot filters (banner sets its own after)
      if (btn.dataset.nav === "finance" && window.setFinanceUncategorized) {
        window.setFinanceUncategorized(false);
        if (window.initFinance) window.initFinance();
      }
      showSection(btn.dataset.nav);
    });
  });

  showSection("home");
}

async function main() {
  initClock();
  initGreeting();
  initWallpaper();
  initGlass();
  initModal();
  initTaskModal();
  initJournalModal();
  initTransactionModal();
  initAccountModal();
  initCapture();
  initNext();
  initAvatar();
  initFocus();
  initCalendar();
  initEventModal();
  initEventDetail();
  initShopping();
  initReadiness();
  initHabits();
  initIdeas();
  initTimer();
  initPlayer();
  initNavigation();

  // Load data first so Today markers, badges and guidance see fresh state
  await Promise.all([
    initTasks(),
    initJournal(),
    initFinance(),
    initRelationships(),
    initBirthdays(),
    initInbox(),
    initCalendar(),
    initShopping(),
    initReadiness(),
    initHabits(),
    initIdeas(),
  ]);
  initToday();
  renderNext();
  initWeek();
  initUpcoming();
  initWeather();
  renderGuidanceBanner();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}

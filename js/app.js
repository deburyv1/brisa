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
import { initToday } from "./today.js?v=20261023cierre3";
import { initTasks } from "./tasks.js?v=20261104due-limit2";
import { initTaskModal } from "./taskModal.js?v=20261021pairs1";
import { initTaskDetail } from "./tasks.js?v=20261104due-limit2";
import { initCapture, loadEntryIntoCapture } from "./capture.js?v=20261104due-limit";
import { initInbox } from "./inbox.js?v=20261021rtl9";
// nextAction se carga dinámicamente con cache-bust para evitar módulos viejos.
import { initNext, renderNext } from "./nextAction.js?v=20261113delete2";
import { initJournal } from "./journal.js?v=20261021rtl9";
import { initJournalModal } from "./journalModal.js?v=20261021rtl9";
import { initFinance } from "./finance.js";
import { initTransactionModal } from "./transactionModal.js";
import { initAccountModal } from "./accountModal.js";
import { initPlayer } from "./player.js";
import { initAvatar } from "./avatar.js";
import { initFocus, openFocus } from "./focusMode.js?v=20261102sched-action";
import { initUpcoming } from "./upcoming.js?v=20261019quiet-alerts";
import { initCalendar } from "./calendar.js?v=20261023cierre1";
import { initEventModal } from "./eventModal.js";
import { initEventDetail } from "./eventDetail.js?v=20261103picker-clear";
import { initEventClose } from "./eventClose.js?v=20261023cierre1";
import { initShopping } from "./shopping.js?v=20261103no-photos";
import { initReadiness } from "./readiness.js";
import { initHabits } from "./habits.js";
import { initIdeas } from "./ideas.js";
import { initTimer } from "./timer.js?v=20261024timer-remodel";
import { initWeek } from "./week.js?v=20261021ord6";
import { initWallpaper } from "./wallpaper.js";
import { initGlass } from "./glass.js";
import { initPickerBridge } from "./pickers.js";
import { initWorkmode, startWorkmode, initTaskNotes } from "./workmode.js?v=20261104due-limit2";
import { initAuth } from "./auth.js";
import { initAccount } from "./account.js";
import { initQuickCapture } from "./quickCapture.js";
import { initPwa } from "./pwa.js";
import { initStudio } from "./studio.js";
import { initTrash, renderTrash } from "./trash.js";
import { initDialogAccessibility } from "./modalGuard.js";

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
window.initNext = initNext;
window.renderNext = renderNext;
window.openFocus = openFocus;
window.initWorkmode = initWorkmode;
window.startWorkmode = startWorkmode;
window.initTrash = initTrash;
window.renderTrash = renderTrash;

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
  studio: "Estudio",
  workmode: "Enfoque",
  account: "Cuenta",
};

const NAV_SECTIONS = {
  home: ["#welcome-section", "#capture-section", "#next-section", "#today-section", "#birthdays-section", "#week-section"],
  inbox: ["#inbox-section"],
  tasks: ["#tasks-section"],
  journal: ["#journal-section"],
  calendar: ["#calendar-section"],
  finance: ["#finance-section"],
  people: ["#relationships-section"],
  shopping: ["#shopping-section"],
  habits: ["#habits-section"],
  ideas: ["#ideas-section"],
  studio: ["#studio-section"],
  workmode: ["#workmode-section"],
  account: ["#account-section"],
  trash: ["#trash-section"],
};

const ALL_SECTIONS = [
  "#welcome-section",
  "#today-section",
  "#capture-section",
  "#next-section",
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
  "#studio-section",
  "#workmode-section",
  "#account-section",
  "#week-section",
  "#trash-section",
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

    if (window.paintFocusChip) window.paintFocusChip();
  }

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      // Manual navigation clears one-shot filters (banner sets its own after)
      if (btn.dataset.nav === "finance" && window.setFinanceUncategorized) {
        window.setFinanceUncategorized(false);
        if (window.initFinance) window.initFinance();
      }
      if (btn.dataset.nav === "trash" && window.renderTrash) window.renderTrash();
      showSection(btn.dataset.nav);
      if (btn.dataset.nav === "account" && window.initAccount) {
        window.initAccount({ render: true, gate: false });
      } else {
        // The account view contains a password input when logged out. Remove
        // it while hidden so password managers do not mistake capture fields
        // elsewhere on the page for a login form.
        document.querySelector("#account-key")?.remove();
      }
      if (window.closeNavDrawer) window.closeNavDrawer();
      window.scrollTo({ top: 0, behavior: "smooth" });
      // La captura del navbar solo donde no hay ya la caja de captura (portada).
      const topCapture = document.querySelector("#top-capture");
      if (topCapture) topCapture.style.display = (btn.dataset.nav === "home") ? "none" : "";
    });
  });

  showSection("home");
}

/* Mobile off-canvas navigation: the sidebar becomes a drawer
   under 950px. Reuses the same nav; tap a link to close. */
function initNavDrawer() {
  const sidebar = document.querySelector(".sidebar");
  const backdrop = document.querySelector("#sidebar-backdrop");
  const toggle = document.querySelector("#nav-toggle");
  if (!sidebar || !toggle) return;

  const close = () => {
    sidebar.classList.remove("open");
    backdrop?.classList.remove("active");
  };
  const open = () => {
    sidebar.classList.add("open");
    backdrop?.classList.add("active");
  };

  toggle.addEventListener("click", () => {
    sidebar.classList.contains("open") ? close() : open();
  });
  backdrop?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 950) close();
  });

  window.closeNavDrawer = close;
}

async function main() {
  // Resolve the account before loading any per-user data or optional views.
  const authStatus = await initAuth();
  initDialogAccessibility();
  window.initAccount = initAccount;
  initAccount({ render: false, status: authStatus });
  if (!authStatus.authenticated) return;

  initClock();
  initGreeting();
  initWallpaper();
  initGlass();
  initPickerBridge();
  initModal();
  initTaskModal();

  initTaskDetail();
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
  initEventClose();
  initTaskNotes();
  // Keep the credential field out of the DOM until the account view is opened.
  initShopping();
  initReadiness();
  initHabits();
  initIdeas();
  initStudio();
  initTimer();
  initPlayer();
  initQuickCapture();
  initPwa();
  initNavigation();
  initNavDrawer();
  initTrash();

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
  await initWorkmode();
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

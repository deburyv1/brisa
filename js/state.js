/* ============================================
   BRISA - Central State Store
   Shared data across all modules
   ============================================ */
export const state = {
  user: { name: "Leonardo" },
  tasks: [],
  tasksStatus: "loading",
  transactions: [],
  people: [],
  habits: [],
  journal: [],
  reminders: [],
  entries: [],
  events: [],
  ideas: [],
  ui: {
    activeNav: "home",
    sidebarOpen: true
  }
};

export function set(key, value) {
  state[key] = value;
}

export function get(key) {
  return state[key];
}

export function getActiveNav() {
  return state.ui.activeNav;
}

export function setActiveNav(nav) {
  state.ui.activeNav = nav;
}

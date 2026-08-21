/**
 * Jeu de donnees pour les captures d ecran de reference.
 *
 * Sans lui, les 8 vues rendent un etat vide et la comparaison visuelle avant /
 * apres migration ne prouve rien. Injecte via `window.__E2E_PLANNER_SEED`, lu
 * par le stub Firestore (`tests/fixtures/firebase-stubs/firebase-firestore.js`).
 *
 * Les identifiants de personne correspondent au stub : `e2e-person-001`.
 */

const PERSON = "e2e-person-001";

/** Date figee : les captures ne doivent pas changer d un jour a l autre. */
export const FROZEN_DATE = "2026-08-21T09:30:00";

function dayKey(offset = 0) {
  const d = new Date(FROZEN_DATE);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function task(id, text, type, icon, extra = {}) {
  return {
    id, text, type, icon,
    createdAt: FROZEN_DATE,
    doneBy: [], recur: "none", priority: "normal", critical: false, overdue: false,
    order: 0, assignedPersonIds: [PERSON], assignedWholeFamily: false,
    assignedPersonId: PERSON, concernedPersonIds: [],
    displayPeriod: type, taskKind: "simple",
    recurrenceFrequency: type, recurrenceTime: "00:00",
    recurrenceDaysOfWeek: [], recurrenceDayOfMonth: 1,
    completedByPersonId: "", completedAt: "", missedCount: 0, currentCycleKey: "",
    dueDate: "", dueTime: "", notification: { reminder: "none" },
    staleNoticeDismissedAt: "", staleNoticeMissedCount: 0,
    ...extra,
  };
}

const RECIPES = [
  {
    id: "rec-001", name: "Gratin de courgettes", category: "plat", servings: 4,
    prepMinutes: 15, cookMinutes: 35, season: "ete", diet: "vegetarien",
    ingredients: [
      { name: "Courgettes", quantity: 4, unit: "" },
      { name: "Creme fraiche", quantity: 20, unit: "cl" },
      { name: "Gruyere rape", quantity: 100, unit: "g" },
    ],
    steps: ["Emincer les courgettes.", "Melanger creme et gruyere.", "Enfourner 35 min a 180 °C."],
    createdAt: FROZEN_DATE,
  },
  {
    id: "rec-002", name: "Soupe de potimarron", category: "entree", servings: 4,
    prepMinutes: 10, cookMinutes: 25, season: "automne", diet: "vegan",
    ingredients: [
      { name: "Potimarron", quantity: 1, unit: "" },
      { name: "Oignon", quantity: 1, unit: "" },
    ],
    steps: ["Couper le potimarron.", "Cuire 25 min.", "Mixer."],
    createdAt: FROZEN_DATE,
  },
  {
    id: "rec-003", name: "Crumble aux pommes", category: "dessert", servings: 6,
    prepMinutes: 20, cookMinutes: 30, season: "automne", diet: "vegetarien",
    ingredients: [
      { name: "Pommes", quantity: 6, unit: "" },
      { name: "Farine", quantity: 150, unit: "g" },
      { name: "Beurre", quantity: 100, unit: "g" },
    ],
    steps: ["Couper les pommes.", "Sabler farine et beurre.", "Enfourner 30 min."],
    createdAt: FROZEN_DATE,
  },
];

export const PLANNER_SEED = {
  tasks: [
    task("task-001", "Sortir les poubelles", "daily", "🗑️"),
    task("task-002", "Vaisselle du soir", "daily", "🍽️", { doneBy: [PERSON], completedByPersonId: PERSON, completedAt: FROZEN_DATE }),
    task("task-003", "Arroser les plantes", "daily", "🪴"),
    task("task-004", "Grand menage salon", "weekly", "🧹"),
    task("task-005", "Courses de la semaine", "weekly", "🛒"),
    task("task-006", "Changer les draps", "weekly", "🛏️", { doneBy: [PERSON] }),
    task("task-007", "Verifier la chaudiere", "monthly", "🔧"),
    task("task-008", "Payer le loyer", "monthly", "💸"),
    task("task-009", "Rendez-vous dentiste", "daily", "🦷", {
      priority: "deadline", displayPeriod: "deadline",
      dueDate: dayKey(0), dueTime: "16:30",
    }),
  ],
  meals: [
    {
      id: "meal-lun", day: "Lundi", order: 0, weekKey: "",
      lunchRecipeId: "rec-001", lunchText: "", lunchMode: "recipe", lunchCooked: false,
      lunchStarterRecipeId: "rec-002", lunchDessertRecipeId: "", lunchExtra: "",
      dinnerRecipeId: "", dinnerText: "Restes", dinnerMode: "free", dinnerCooked: false,
      dinnerStarterRecipeId: "", dinnerDessertRecipeId: "", dinnerExtra: "",
    },
    {
      id: "meal-mar", day: "Mardi", order: 1, weekKey: "",
      lunchRecipeId: "", lunchText: "Cantine", lunchMode: "free", lunchCooked: false,
      lunchStarterRecipeId: "", lunchDessertRecipeId: "", lunchExtra: "",
      dinnerRecipeId: "rec-001", dinnerText: "", dinnerMode: "recipe", dinnerCooked: true,
      dinnerStarterRecipeId: "", dinnerDessertRecipeId: "rec-003", dinnerExtra: "",
    },
    {
      id: "meal-mer", day: "Mercredi", order: 2, weekKey: "",
      lunchRecipeId: "rec-002", lunchText: "", lunchMode: "recipe", lunchCooked: false,
      lunchStarterRecipeId: "", lunchDessertRecipeId: "", lunchExtra: "",
      dinnerRecipeId: "", dinnerText: "", dinnerMode: "", dinnerCooked: false,
      dinnerStarterRecipeId: "", dinnerDessertRecipeId: "", dinnerExtra: "",
    },
      {
      id: "meal-ven", day: "Vendredi", order: 3, weekKey: "",
      lunchRecipeId: "rec-001", lunchText: "", lunchMode: "recipe", lunchCooked: false,
      lunchStarterRecipeId: "rec-002", lunchDessertRecipeId: "rec-003", lunchExtra: "Salade verte",
      dinnerRecipeId: "rec-002", dinnerText: "", dinnerMode: "recipe", dinnerCooked: false,
      dinnerStarterRecipeId: "", dinnerDessertRecipeId: "", dinnerExtra: "",
    },
  ],
  linkMealsToInventory: true,
  recipes: RECIPES,
  shopping: [],
  lists: [
    {
      id: "shopping-default", name: "Liste de courses", addToInventory: true, isShoppingList: true,
      items: [
        { id: "it-1", text: "Courgettes", quantity: 4, unit: "", checked: false, addedBy: PERSON },
        { id: "it-2", text: "Creme fraiche", quantity: 20, unit: "cl", checked: false, addedBy: PERSON },
        { id: "it-3", text: "Pain", quantity: 1, unit: "", checked: true, addedBy: PERSON },
        { id: "it-4", text: "Cafe", quantity: 250, unit: "g", checked: false, addedBy: PERSON },
      ],
    },
    {
      id: "list-brico", name: "Bricolage", addToInventory: false, isShoppingList: false,
      items: [
        { id: "it-5", text: "Vis 4x40", quantity: 1, unit: "boite", checked: false, addedBy: PERSON },
        { id: "it-6", text: "Peinture blanche", quantity: 2, unit: "l", checked: false, addedBy: PERSON },
      ],
    },
  ],
  inventory: [
    { id: "inv-1", text: "Riz", quantity: 500, unit: "g", state: "ok", location: "loc-1", addedAt: FROZEN_DATE },
    { id: "inv-2", text: "Pates", quantity: 1, unit: "kg", state: "ok", location: "loc-1", addedAt: FROZEN_DATE },
    { id: "inv-3", text: "Gruyere rape", quantity: 100, unit: "g", state: "low", location: "loc-2", addedAt: FROZEN_DATE },
    { id: "inv-4", text: "Lait", quantity: 1, unit: "l", state: "empty", location: "loc-2", addedAt: FROZEN_DATE },
    { id: "inv-5", text: "Farine", quantity: 1, unit: "kg", state: "ok", location: "loc-1", addedAt: FROZEN_DATE },
  ],
  storageLocations: [
    { id: "loc-1", name: "Placard", emoji: "🧺" },
    { id: "loc-2", name: "Frigo", emoji: "🧊" },
  ],
  productLocationMemory: {},
  notes: [
    { id: "note-1", text: "Penser a appeler le plombier avant vendredi.", createdAt: FROZEN_DATE, author: PERSON, visibility: "household", sharedWith: [] },
    { id: "note-2", text: "Code du portail : 4712", createdAt: FROZEN_DATE, author: PERSON, visibility: "household", sharedWith: [] },
    { id: "note-3", text: "Idees cadeaux anniversaire : livre de cuisine, plante verte, carnet.", createdAt: FROZEN_DATE, author: PERSON, visibility: "private", sharedWith: [] },
  ],
  inbox: [
    { id: "ib-1", text: "Reserver le garage pour la revision", createdAt: FROZEN_DATE, author: PERSON, done: false },
    { id: "ib-2", text: "Chercher une idee de sortie dimanche", createdAt: FROZEN_DATE, author: PERSON, done: false },
  ],
  history: [
    { id: "h-1", date: dayKey(-1), time: "19:12", user: PERSON, text: "Vaisselle du soir", icon: "🍽️" },
    { id: "h-2", date: dayKey(-1), time: "08:40", user: PERSON, text: "Sortir les poubelles", icon: "🗑️" },
    { id: "h-3", date: dayKey(-2), time: "20:05", user: PERSON, text: "Changer les draps", icon: "🛏️" },
  ],
  agenda: [
    {
      id: "ag-1", taskId: "", text: "Rendez-vous dentiste", icon: "🦷",
      dateKey: dayKey(0), start: "16:30", duration: 45, allDay: false,
      personIds: [PERSON], personId: PERSON, wholeFamily: false, childIds: [],
      concernedPersonIds: [], sourceType: "custom", notification: null,
    },
    {
      id: "ag-2", taskId: "", text: "Reunion ecole", icon: "🏫",
      dateKey: dayKey(1), start: "18:00", duration: 90, allDay: false,
      personIds: [PERSON], personId: PERSON, wholeFamily: true, childIds: [],
      concernedPersonIds: [], sourceType: "custom", notification: null,
    },
    {
      id: "ag-3", taskId: "", text: "Anniversaire Lea", icon: "🎂",
      dateKey: dayKey(3), start: "00:00", duration: 60, allDay: true,
      personIds: [], personId: "", wholeFamily: true, childIds: [],
      concernedPersonIds: [], sourceType: "custom", notification: null,
    },
  ],
  recurringEvents: [],
  lastResetDaily: "",
  lastResetWeekly: "",
  lastResetMonthly: "",
};

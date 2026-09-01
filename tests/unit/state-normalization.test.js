import test from "node:test";
import assert from "node:assert/strict";

import { createMealShell, normalizeState } from "../../src/app/utils/state.js";
import { setCurrentAppTimeMode, setSimulatedAppDateValue } from "../../src/app/utils/date.js";
import { installMockLocalStorage, uninstallMockLocalStorage } from "../helpers/browser-globals.js";

test.beforeEach(() => {
  installMockLocalStorage();
});

test.afterEach(() => {
  uninstallMockLocalStorage();
});

/**
 * Fige la date applicative — normalizeState horodate les taches sans createdAt
 * et elague le journal de notifications sur une fenetre glissante de 7 jours.
 *
 * A appeler DANS le test, pas dans un beforeEach : avec
 * `--experimental-test-isolation=none`, les beforeEach racine de tous les
 * fichiers importes s'executent avant chaque test, et ceux qui reinstallent un
 * localStorage neuf effaceraient l'horloge simulee posee ici.
 */
function pinAppDate(value = "2026-04-20T10:00") {
  setCurrentAppTimeMode("simulated");
  setSimulatedAppDateValue(value);
}

// ── Enveloppe generale ────────────────────────────────────────────────────

test("normalizeState : un etat vide produit toutes les collections attendues", () => {
  const state = normalizeState({});
  ["tasks", "meals", "recipes", "shopping", "lists", "storageLocations", "inventory", "notes", "history", "inbox", "agenda", "recurringEvents"].forEach((key) => {
    assert.ok(Array.isArray(state[key]), `${key} doit etre un tableau`);
  });
  assert.equal(state.linkMealsToInventory, false);
  assert.deepEqual(state.customCondiments, []);
  assert.equal(state.lastResetDaily, "");
});

test("normalizeState : les collections non tableau sont remplacees par des tableaux vides", () => {
  const state = normalizeState({ tasks: "oups", recipes: null, inventory: 42, agenda: {} });
  assert.deepEqual(state.tasks, []);
  assert.deepEqual(state.recipes, []);
  assert.deepEqual(state.inventory, []);
  assert.deepEqual(state.agenda, []);
});

test("normalizeState : l historique est plafonne a 400 entrees", () => {
  const state = normalizeState({ history: Array.from({ length: 500 }, (_, i) => ({ id: `h${i}` })) });
  assert.equal(state.history.length, 400);
  assert.equal(state.history[0].id, "h0");
});

test("normalizeState : les reglages de notification ont des defauts actifs", () => {
  const fresh = normalizeState({});
  assert.deepEqual(fresh.taskNotifications, {
    enabled: false,
    endOfDay: true,
    endOfDayTime: "18:00",
    urgent: true,
    due: true,
    weeklyReminder: true,
  });

  const custom = normalizeState({ taskNotifications: { enabled: true, endOfDay: false, endOfDayTime: "21:30", urgent: false } });
  assert.equal(custom.taskNotifications.enabled, true);
  assert.equal(custom.taskNotifications.endOfDay, false);
  assert.equal(custom.taskNotifications.endOfDayTime, "21:30");
  assert.equal(custom.taskNotifications.urgent, false);
  assert.equal(custom.taskNotifications.due, true, "les cles absentes gardent leur defaut actif");
});

test("normalizeState : les condiments personnalises sont nettoyes et dedupes", () => {
  const state = normalizeState({ customCondiments: ["  sumac ", "sumac", "", null, "zaatar"] });
  assert.deepEqual(state.customCondiments, ["sumac", "zaatar"]);
});

// ── Taches ────────────────────────────────────────────────────────────────

test("taches : sans priorite, on retombe sur normal", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "daily", priority: "urgent" },
      { id: "b", type: "daily", priority: "deadline" },
      { id: "c", type: "daily" },
      { id: "d", type: "daily", priority: "" },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.equal(byId.a.priority, "urgent");
  assert.equal(byId.b.priority, "deadline");
  assert.equal(byId.c.priority, "normal");
  assert.equal(byId.d.priority, "normal");
});

// Regression garde : ces valeurs venaient d'avant urgent/normal/deadline. Tant
// qu'elles ne sont pas traduites, HomeView, TaskCard et useTaskNotifications —
// qui ne testent que "urgent" — les traitent comme normales.
test("taches : les priorites historiques high/medium/low sont converties", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "daily", priority: "high" },
      { id: "b", type: "daily", priority: "medium" },
      { id: "c", type: "daily", priority: "low" },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.equal(byId.a.priority, "urgent");
  assert.equal(byId.b.priority, "normal");
  assert.equal(byId.c.priority, "normal");
});

test("taches : le genre est deduit de l ancien champ recur", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "weekly", recur: "weekly" },
      { id: "b", type: "weekly", recur: "none" },
      { id: "c", type: "weekly" },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.equal(byId.a.taskKind, "recurring");
  assert.equal(byId.a.recurrenceFrequency, "weekly");
  assert.equal(byId.b.taskKind, "single");
  assert.equal(byId.c.taskKind, "single");
});

test("taches : la date de creation est reconstruite depuis l ancien identifiant", () => {
  const timestamp = Date.UTC(2025, 0, 15, 8, 30);
  const state = normalizeState({ tasks: [{ id: `task-${timestamp}`, type: "daily" }] });
  assert.equal(state.tasks[0].createdAt, new Date(timestamp).toISOString());
});

test("taches : sans identifiant horodate, la date de creation est celle du jour applicatif", () => {
  pinAppDate();
  const state = normalizeState({ tasks: [{ id: "sans-horodatage", type: "daily" }] });
  assert.equal(state.tasks[0].createdAt.slice(0, 10), "2026-04-20");
});

test("taches : une tache faite via completedByPersonId remplit doneBy, et l inverse", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "daily", completedByPersonId: "p1" },
      { id: "b", type: "daily", doneBy: ["p2", "", null, "p3"] },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.deepEqual(byId.a.doneBy, ["p1"]);
  assert.deepEqual(byId.b.doneBy, ["p2", "p3"]);
  assert.equal(byId.b.completedByPersonId, "p3", "le dernier de doneBy devient le completeur");
});

test("taches : les anciens champs d assignation alimentent assignedPersonIds", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "daily", assigneeId: "p1" },
      { id: "b", type: "daily", assignedPersonId: "p2" },
      { id: "c", type: "daily", assignedPersonIds: ["p3", "", "p4"] },
      { id: "d", type: "daily" },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.deepEqual(byId.a.assignedPersonIds, ["p1"]);
  assert.equal(byId.a.assignedPersonId, "p1");
  assert.deepEqual(byId.b.assignedPersonIds, ["p2"]);
  assert.deepEqual(byId.c.assignedPersonIds, ["p3", "p4"]);
  assert.deepEqual(byId.d.assignedPersonIds, []);
});

test("taches : une recurrente hebdomadaire vise le lundi par defaut", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "weekly", taskKind: "recurring", recurrenceFrequency: "weekly" },
      { id: "b", type: "weekly", taskKind: "recurring", recurrenceFrequency: "weekly", recurrenceDaysOfWeek: [0, 3, 9, -1, "5"] },
      { id: "c", type: "daily", taskKind: "recurring", recurrenceFrequency: "daily" },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.deepEqual(byId.a.recurrenceDaysOfWeek, [1]);
  assert.deepEqual(byId.b.recurrenceDaysOfWeek, [0, 3, 5], "les jours hors 0-6 sont ecartes");
  assert.deepEqual(byId.c.recurrenceDaysOfWeek, []);
});

test("taches : le jour du mois est ramene dans 1-31", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "monthly", recurrenceDayOfMonth: 0 },
      { id: "b", type: "monthly", recurrenceDayOfMonth: 45 },
      { id: "c", type: "monthly", recurrenceDayOfMonth: 12 },
      { id: "d", type: "monthly" },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.equal(byId.a.recurrenceDayOfMonth, 1);
  assert.equal(byId.b.recurrenceDayOfMonth, 31);
  assert.equal(byId.c.recurrenceDayOfMonth, 12);
  assert.equal(byId.d.recurrenceDayOfMonth, 1);
});

test("taches : les rappels inconnus retombent sur aucun rappel", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "daily", notification: { reminder: "1h_before" } },
      { id: "b", type: "daily", notification: { reminder: "dans_3_lunes" } },
      { id: "c", type: "daily" },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.deepEqual(byId.a.notification, { reminder: "1h_before" });
  assert.deepEqual(byId.b.notification, { reminder: "none" });
  assert.deepEqual(byId.c.notification, { reminder: "none" });
});

test("taches : un rappel personnalise ne descend jamais sous 5 minutes", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "daily", notification: { reminder: "custom_before", customMinutes: 2 } },
      { id: "b", type: "daily", notification: { reminder: "custom_before", customMinutes: 90.4 } },
      { id: "c", type: "daily", notification: { reminder: "custom_before", customMinutes: "abc" } },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.deepEqual(byId.a.notification, { reminder: "custom_before", customMinutes: 5 });
  assert.deepEqual(byId.b.notification, { reminder: "custom_before", customMinutes: 90 });
  assert.deepEqual(byId.c.notification, { reminder: "custom_before", customMinutes: 15 });
});

test("taches : le journal de notifications est deduplique et elague a 7 jours", () => {
  pinAppDate();
  const state = normalizeState({
    tasks: [
      {
        id: "a",
        type: "daily",
        notificationLog: [
          "urgent-2026-04-19",   // recent → garde
          "urgent-2026-04-19",   // doublon → retire
          "urgent-2026-04-14",   // pile a la limite (J-6) → garde
          "urgent-2026-04-01",   // trop vieux → retire
          "sans-date",           // pas de date → garde
          "  ",                  // vide → retire
        ],
      },
    ],
  });
  assert.deepEqual(state.tasks[0].notificationLog, ["urgent-2026-04-19", "urgent-2026-04-14", "sans-date"]);
});

test("taches : le tri place quotidien, semaine puis mois, et renumerote chaque groupe", () => {
  const state = normalizeState({
    tasks: [
      { id: "m1", type: "monthly", order: 5 },
      { id: "d2", type: "daily", order: 9 },
      { id: "w1", type: "weekly", order: 2 },
      { id: "d1", type: "daily", order: 1 },
    ],
  });
  assert.deepEqual(state.tasks.map((task) => task.id), ["d1", "d2", "w1", "m1"]);
  assert.deepEqual(state.tasks.map((task) => task.order), [0, 1, 0, 0]);
});

test("taches : une recurrente n est jamais marquee en retard a la normalisation", () => {
  const state = normalizeState({
    tasks: [
      { id: "a", type: "daily", taskKind: "recurring", overdue: true },
      { id: "b", type: "daily", taskKind: "single", overdue: true },
    ],
  });
  const byId = Object.fromEntries(state.tasks.map((task) => [task.id, task]));
  assert.equal(byId.a.overdue, false);
  assert.equal(byId.b.overdue, true);
});

// ── Repas ─────────────────────────────────────────────────────────────────

test("createMealShell : l identifiant depend de la presence d une cle de semaine", () => {
  assert.equal(createMealShell("lundi", 0, "2026-04-20").id, "meal-2026-04-20-lundi");
  assert.equal(createMealShell("lundi", 3, "").id, "meal-lundi-3");
});

test("repas : le mode est deduit du contenu quand il manque", () => {
  const state = normalizeState({
    meals: [
      { day: "lundi", lunchRecipeId: "r1", dinnerText: "Restes" },
      { day: "mardi" },
      { day: "mercredi", lunchText: "Pizza", lunchMode: "recipe" },
    ],
  });
  assert.equal(state.meals[0].lunchMode, "recipe");
  assert.equal(state.meals[0].dinnerMode, "free");
  assert.equal(state.meals[1].lunchMode, "");
  assert.equal(state.meals[2].lunchMode, "recipe", "un mode explicite n est pas ecrase");
});

test("repas : les marqueurs de cuisson sont ramenes a des booleens", () => {
  const state = normalizeState({ meals: [{ day: "lundi", lunchCooked: 1, dinnerDessertCooked: "oui" }] });
  assert.equal(state.meals[0].lunchCooked, true);
  assert.equal(state.meals[0].dinnerDessertCooked, true);
  assert.equal(state.meals[0].dinnerCooked, false);
});

// ── Recettes ──────────────────────────────────────────────────────────────

test("recettes : une ancienne saison textuelle devient un mode saison complet", () => {
  const [recipe] = normalizeState({ recipes: [{ id: "r1", name: "Soupe", season: "winter" }] }).recipes;
  assert.equal(recipe.availabilityMode, "season");
  assert.equal(recipe.season, "winter");
  assert.deepEqual(recipe.seasons, ["winter"]);
  assert.deepEqual(recipe.months, [12, 1, 2]);
});

test("recettes : une ancienne saison numerique devient un mois", () => {
  const [recipe] = normalizeState({ recipes: [{ id: "r1", name: "Asperges", season: "5" }] }).recipes;
  assert.equal(recipe.availabilityMode, "months");
  assert.deepEqual(recipe.months, [5]);
});

test("recettes : sans saison, la recette est disponible toute l annee", () => {
  const [recipe] = normalizeState({ recipes: [{ id: "r1", name: "Pates" }] }).recipes;
  assert.equal(recipe.availabilityMode, "all_year");
  assert.deepEqual(recipe.months, []);
});

test("recettes : en mode saison, les mois sont derives des saisons declarees", () => {
  const [recipe] = normalizeState({
    recipes: [{ id: "r1", name: "Salade", availabilityMode: "season", seasons: ["spring", "summer", "inconnue"] }],
  }).recipes;
  assert.deepEqual(recipe.seasons, ["spring", "summer"], "une saison inconnue est ecartee");
  assert.deepEqual(recipe.months.sort((a, b) => a - b), [3, 4, 5, 6, 7, 8]);
});

test("recettes : les mois hors 1-12 sont ecartes", () => {
  const [recipe] = normalizeState({
    recipes: [{ id: "r1", name: "X", availabilityMode: "months", months: [0, 3, 13, 12, "7"] }],
  }).recipes;
  assert.deepEqual(recipe.months, [3, 12, 7]);
});

test("recettes : le nombre de parts est ramene dans 1-24", () => {
  const parts = normalizeState({
    recipes: [
      { id: "a", servings: 0 },
      { id: "b", servings: 99 },
      { id: "c", peopleCount: 6 },
      { id: "d", serves: 2 },
      { id: "e" },
    ],
  }).recipes.map((recipe) => recipe.servings);
  assert.deepEqual(parts, [4, 24, 6, 2, 4]);
});

test("recettes : des ingredients textuels historiques sont convertis en lignes structurees", () => {
  const [recipe] = normalizeState({
    recipes: [{ id: "r1", name: "Gateau", ingredients: "200 g farine\n3 unites oeuf, sucre vanille" }],
  }).recipes;
  assert.deepEqual(
    recipe.ingredients.map(({ name, quantity, unit }) => ({ name, quantity, unit })),
    [
      { name: "farine", quantity: "200", unit: "g" },
      { name: "oeuf", quantity: "3", unit: "unite" },
      { name: "sucre vanille", quantity: "", unit: "" },
    ],
  );
  assert.equal(recipe.ingredientsLegacy, "200 g farine\n3 unites oeuf, sucre vanille");
});

test("recettes : les unites sont normalisees et les virgules decimales converties", () => {
  const [recipe] = normalizeState({
    recipes: [
      {
        id: "r1",
        ingredients: [
          { name: "Lait", quantity: "0,5", unit: "L" },
          { name: "Beurre", quantity: "50", unit: "  G " },
          { name: "Oeufs", unit: "unités" },
          { name: "Pincee", unit: "poignee" },
        ],
      },
    ],
  }).recipes;
  assert.deepEqual(recipe.ingredients.map((item) => item.unit), ["l", "g", "unite", "poignee"]);
});

test("recettes : les ingredients sans nom sont supprimes", () => {
  const [recipe] = normalizeState({
    recipes: [{ id: "r1", ingredients: [{ name: "Farine" }, { name: "   " }, { quantity: "3" }] }],
  }).recipes;
  assert.equal(recipe.ingredients.length, 1);
  assert.equal(recipe.ingredients[0].name, "Farine");
});

test("recettes : les libelles sont dedupes et nettoyes", () => {
  const [recipe] = normalizeState({
    recipes: [{ id: "r1", labels: [" vegetarien ", "vegetarien", "", null, "sans_gluten"] }],
  }).recipes;
  assert.deepEqual(recipe.labels, ["vegetarien", "sans_gluten"]);
});

test("recettes : le titre historique et le nom vide retombent sur des valeurs sures", () => {
  const recipes = normalizeState({ recipes: [{ id: "a", title: "Tarte" }, { id: "b", name: "   " }] }).recipes;
  assert.equal(recipes[0].name, "Tarte");
  assert.equal(recipes[1].name, "Recette");
});

// ── Listes ────────────────────────────────────────────────────────────────

test("listes : une liste nommee « Liste de courses » est reconnue comme telle", () => {
  const state = normalizeState({ lists: [{ id: "l1", name: "liste de courses" }] });
  assert.equal(state.lists.length, 1);
  assert.equal(state.lists[0].isShoppingList, true);
  assert.equal(state.lists[0].addToInventory, true);
  assert.equal(state.lists[0].order, -1);
  assert.equal(state.lists[0].visibility, "household");
});

test("listes : la liste de courses est ajoutee si aucune n existe", () => {
  const state = normalizeState({ lists: [{ id: "l1", name: "Bricolage" }] });
  assert.equal(state.lists.length, 2);
  assert.equal(state.lists[0].isShoppingList, true);
  assert.equal(state.lists[1].name, "Bricolage");
});

test("listes : les listes ordinaires sont triees puis renumerotees a partir de 0", () => {
  const state = normalizeState({
    lists: [
      { id: "b", name: "Bricolage", order: 7 },
      { id: "s", name: "Liste de courses", isShoppingList: true },
      { id: "a", name: "Anniversaire", order: 2 },
    ],
  });
  assert.deepEqual(state.lists.map((list) => list.id), ["s", "a", "b"]);
  assert.deepEqual(state.lists.map((list) => list.order), [-1, 0, 1]);
});

test("listes : a ordre egal, le tri est alphabetique insensible a la casse et aux accents", () => {
  const state = normalizeState({
    lists: [
      { id: "z", name: "Zebre", order: 4 },
      { id: "e", name: "Éclair", order: 4 },
      { id: "a", name: "avion", order: 4 },
    ],
  });
  assert.deepEqual(state.lists.slice(1).map((list) => list.name), ["avion", "Éclair", "Zebre"]);
});

test("listes : sans ordre explicite, l ordre de saisie est conserve", () => {
  const state = normalizeState({
    lists: [{ id: "z", name: "Zebre" }, { id: "e", name: "Éclair" }, { id: "a", name: "avion" }],
  });
  assert.deepEqual(state.lists.slice(1).map((list) => list.name), ["Zebre", "Éclair", "avion"]);
});

test("listes : l ancienne cle shopping est convertie en liste de courses", () => {
  const state = normalizeState({ shopping: [{ id: "i1", text: "Pain" }] });
  assert.equal(state.lists.length, 1);
  assert.equal(state.lists[0].isShoppingList, true);
  assert.equal(state.lists[0].items[0].text, "Pain");
});

test("listes : une quantite collee au texte est extraite", () => {
  const state = normalizeState({
    lists: [{ id: "s", name: "Liste de courses", isShoppingList: true, items: [{ id: "i1", text: "2 baguettes" }, { id: "i2", text: "3,5 pommes" }] }],
  });
  const items = state.lists[0].items;
  assert.deepEqual(items.map((item) => [item.text, item.quantity]), [["baguettes", "2"], ["pommes", "3.5"]]);
});

test("listes : une quantite explicite empeche l extraction depuis le texte", () => {
  const state = normalizeState({
    lists: [{ id: "s", name: "Liste de courses", isShoppingList: true, items: [{ id: "i1", text: "2 baguettes", quantity: "4" }] }],
  });
  assert.equal(state.lists[0].items[0].text, "2 baguettes");
  assert.equal(state.lists[0].items[0].quantity, "4");
});

test("listes : fusionner deux entrees d unites differentes ne somme pas les quantites", () => {
  const state = normalizeState({
    lists: [
      {
        id: "s",
        name: "Liste de courses",
        isShoppingList: true,
        items: [
          { id: "i1", text: "Lait", quantity: "1", unit: "l" },
          { id: "i2", text: "lait", quantity: "500", unit: "ml" },
        ],
      },
    ],
  });
  const items = state.lists[0].items;
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, "1", "unites differentes : on garde la premiere quantite");
  assert.equal(items[0].unit, "l");
});

test("listes : fusionner somme les quantites et remet l article a acheter", () => {
  const state = normalizeState({
    lists: [
      {
        id: "s",
        name: "Liste de courses",
        isShoppingList: true,
        items: [
          { id: "i1", text: "Tomates", quantity: "2", unit: "", done: true, purchasedAt: "2026-04-01" },
          { id: "i2", text: "tomate", quantity: "3", unit: "" },
        ],
      },
    ],
  });
  assert.equal(state.lists[0].items.length, 1);
  const [item] = state.lists[0].items;
  assert.equal(item.quantity, "5");
  assert.equal(item.done, false);
  assert.equal(item.purchasedAt, "");
});

test("listes : la somme accepte les decimales et la virgule francaise", () => {
  const state = normalizeState({
    lists: [
      {
        id: "s",
        name: "Liste de courses",
        isShoppingList: true,
        items: [
          { id: "i1", text: "Farine", quantity: "0,5", unit: "kg" },
          { id: "i2", text: "farine", quantity: "1,25", unit: "kg" },
        ],
      },
    ],
  });
  assert.equal(state.lists[0].items[0].quantity, "1,75");
});

// Regression garde : la deduplication des lettres doublees raccourcit le radical
// avant la regle de pluriel. Avec un garde trop haut, « Pommes » et « pomme »
// tombaient sur deux valeurs differentes et la liste gardait un doublon.
test("listes : pluriel et singulier fusionnent meme avec une consonne doublee", () => {
  const state = normalizeState({
    lists: [
      {
        id: "s",
        name: "Liste de courses",
        isShoppingList: true,
        items: [
          { id: "i1", text: "Pommes", quantity: "2", unit: "" },
          { id: "i2", text: "pomme", quantity: "3", unit: "" },
        ],
      },
    ],
  });
  assert.equal(state.lists[0].items.length, 1);
  assert.equal(state.lists[0].items[0].quantity, "5");
});

// ── Inventaire et rangements ──────────────────────────────────────────────

test("inventaire : un article vide est automatiquement a racheter", () => {
  const state = normalizeState({
    inventory: [
      { id: "a", name: "Riz", stockState: "empty" },
      { id: "b", name: "Pates", stockState: "autre-chose" },
    ],
  });
  const byId = Object.fromEntries(state.inventory.map((item) => [item.id, item]));
  assert.equal(byId.a.stockState, "empty");
  assert.equal(byId.a.needsRestock, true);
  assert.equal(byId.b.stockState, "in_stock", "un etat inconnu retombe sur en stock");
  assert.equal(byId.b.needsRestock, false);
});

test("inventaire : le tri suit l ordre puis le nom, et renumerote", () => {
  const state = normalizeState({
    inventory: [
      { id: "c", name: "Courgette" },
      { id: "a", name: "Aubergine", order: 0 },
      { id: "b", name: "Betterave", order: 0 },
    ],
  });
  assert.deepEqual(state.inventory.map((item) => item.id), ["a", "b", "c"]);
  assert.deepEqual(state.inventory.map((item) => item.order), [0, 1, 2]);
});

test("rangements : un rangement sans nom recoit un libelle numerote", () => {
  const state = normalizeState({ storageLocations: [{ id: "loc-1", name: "  " }, { id: "loc-2", name: "Congelo", emoji: "🧊" }] });
  assert.equal(state.storageLocations[0].name, "Rangement 1");
  assert.equal(state.storageLocations[1].name, "Congelo");
  assert.equal(state.storageLocations[1].emoji, "🧊");
});

// ── Agenda, notes, boite de reception ─────────────────────────────────────

test("agenda : un evenement toute la journee demarre a minuit", () => {
  const state = normalizeState({ agenda: [{ id: "e1", allDay: true, start: "14:00" }, { id: "e2" }] });
  assert.equal(state.agenda[0].start, "00:00");
  assert.equal(state.agenda[1].start, "09:00", "sans heure, on propose 09:00");
  assert.equal(state.agenda[1].duration, 60);
});

test("agenda : les anciens champs personId / child alimentent les listes", () => {
  const state = normalizeState({ agenda: [{ id: "e1", personId: "p1", child: "c1" }] });
  assert.deepEqual(state.agenda[0].personIds, ["p1"]);
  assert.equal(state.agenda[0].personId, "p1");
  assert.deepEqual(state.agenda[0].childIds, ["c1"]);
  assert.deepEqual(state.agenda[0].concernedPersonIds, ["c1"]);
});

test("agenda : la notification est nulle si absente, normalisee sinon", () => {
  const state = normalizeState({
    agenda: [
      { id: "e1" },
      { id: "e2", notification: { enabled: true, minutesBefore: -5, customMessage: "  Pense a  ", sentKeys: ["k1", "k1", ""] } },
    ],
  });
  assert.equal(state.agenda[0].notification, null);
  assert.deepEqual(state.agenda[1].notification, {
    enabled: true,
    minutesBefore: 0,
    customMessage: "Pense a",
    sentKeys: ["k1"],
  });
});

test("agenda : les cles anti-doublon sont purgees au-dela de 7 jours", () => {
  pinAppDate(); // 2026-04-20
  const state = normalizeState({
    agenda: [
      {
        id: "e1",
        notification: {
          enabled: true,
          sentKeys: [
            "agenda-1755000000000-0-2026-04-19-09:00-30",  // hier → garde
            "agenda-1755000000000-0-2026-04-19-09:00-30",  // doublon → retire
            "agenda-1755000000000-0-2026-04-14-08:00-15",  // J-6, limite → garde
            "agenda-1755000000000-0-2026-04-12-08:00-15",  // J-8 → retire
            "recur-agenda-42-2026-04-18-07:30-0",          // recurrent recent → garde
            "recur-agenda-42-2026-03-01-07:30-0",          // recurrent vieux → retire
            "cle-sans-date",                               // illisible → garde
            "   ",                                          // vide → retire
          ],
        },
      },
    ],
  });
  assert.deepEqual(state.agenda[0].notification.sentKeys, [
    "agenda-1755000000000-0-2026-04-19-09:00-30",
    "agenda-1755000000000-0-2026-04-14-08:00-15",
    "recur-agenda-42-2026-04-18-07:30-0",
    "cle-sans-date",
  ]);
});

test("agenda : un identifiant numerique n est pas confondu avec une date", () => {
  pinAppDate();
  // `1755000000000` ne doit pas etre lu comme une date : la cle n'a pas la queue
  // `-HH:MM-<minutes>`, donc elle est conservee telle quelle.
  const state = normalizeState({
    agenda: [{ id: "e1", notification: { enabled: true, sentKeys: ["agenda-1755000000000-0"] } }],
  });
  assert.deepEqual(state.agenda[0].notification.sentKeys, ["agenda-1755000000000-0"]);
});

test("agenda : les cles des evenements recurrents suivent la meme purge", () => {
  pinAppDate();
  const state = normalizeState({
    recurringEvents: [
      {
        id: "r1",
        notification: {
          enabled: true,
          sentKeys: ["recur-r1-2026-04-20-07:30-10", "recur-r1-2026-01-05-07:30-10"],
        },
      },
    ],
  });
  assert.deepEqual(state.recurringEvents[0].notification.sentKeys, ["recur-r1-2026-04-20-07:30-10"]);
});

test("recurrents : le jour de semaine et le jour du mois sont normalises", () => {
  const state = normalizeState({
    recurringEvents: [
      { id: "r1", weekday: 3, dayOfMonth: "12" },
      { id: "r2" },
    ],
  });
  assert.equal(state.recurringEvents[0].weekday, 3);
  assert.equal(state.recurringEvents[0].dayOfMonth, 12);
  assert.equal(state.recurringEvents[1].weekday, 0);
  assert.equal(state.recurringEvents[1].dayOfMonth, null);
});

test("notes : visibilite domestique par defaut", () => {
  const state = normalizeState({ notes: [{ id: "n1", text: "Coucou" }, { id: "n2", text: "Perso", visibility: "private" }] });
  assert.equal(state.notes[0].visibility, "household");
  assert.deepEqual(state.notes[0].sharedWith, []);
  assert.equal(state.notes[1].visibility, "private");
});

test("boite de reception : seuls les trois types connus sont gardes comme indice", () => {
  const state = normalizeState({
    inbox: [
      { id: "i1", text: "A", hint: "task" },
      { id: "i2", text: "B", hint: "recette" },
      { id: "i3", text: "C" },
    ],
  });
  assert.deepEqual(state.inbox.map((item) => item.hint), ["task", null, null]);
});

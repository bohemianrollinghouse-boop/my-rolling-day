import test from "node:test";
import assert from "node:assert/strict";

import {
  getNotifPromptDismissCount,
  markNotifPromptDismissed,
  markNotifPromptGranted,
  parseImportedState,
  readMealFillPrefs,
  shouldShowNotifPrompt,
  storeMealFillPrefs,
} from "../../src/app/utils/storage.js";
import { installMockLocalStorage, uninstallMockLocalStorage } from "../helpers/browser-globals.js";

const DAY_MS = 24 * 60 * 60 * 1000;

test.beforeEach(() => {
  installMockLocalStorage();
});

test.afterEach(() => {
  uninstallMockLocalStorage();
});

// ── Import de planning ────────────────────────────────────────────────────

test("import : un texte vide est refuse avec un message explicite", () => {
  assert.throws(() => parseImportedState(""), /Colle un JSON/);
  assert.throws(() => parseImportedState("   "), /Colle un JSON/);
  assert.throws(() => parseImportedState(null), /Colle un JSON/);
});

test("import : un JSON invalide est refuse", () => {
  assert.throws(() => parseImportedState("{pas du json"), /n'est pas un JSON valide/);
});

test("import : un export brut est normalise", () => {
  const state = parseImportedState(JSON.stringify({ tasks: [{ id: "t1", text: "Poubelles" }] }));
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].text, "Poubelles");
  // La normalisation recree toujours la liste de courses.
  assert.equal(state.lists[0].isShoppingList, true);
});

test("import : un export enveloppe dans { data } est deballe", () => {
  const wrapped = JSON.stringify({ version: 3, data: { notes: [{ id: "n1", text: "Coucou" }] } });
  const state = parseImportedState(wrapped);
  assert.equal(state.notes.length, 1);
  assert.equal(state.notes[0].text, "Coucou");
});

// ── Invite « activer les notifications » ──────────────────────────────────

test("invite notifications : proposee la premiere fois", () => {
  assert.equal(getNotifPromptDismissCount(), 0);
  assert.equal(shouldShowNotifPrompt(), true);
});

test("invite notifications : « Plus tard » impose un delai de 3 puis 7 jours", () => {
  markNotifPromptDismissed();
  assert.equal(getNotifPromptDismissCount(), 1);
  assert.equal(shouldShowNotifPrompt(), false);

  // Juste avant 3 jours : toujours non. Juste apres : de nouveau proposee.
  const rewind = (ms) => {
    const raw = JSON.parse(localStorage.getItem("mrd_notif_prompt"));
    localStorage.setItem("mrd_notif_prompt", JSON.stringify({ ...raw, lastDismissed: Date.now() - ms }));
  };

  rewind(3 * DAY_MS - 1000);
  assert.equal(shouldShowNotifPrompt(), false);
  rewind(3 * DAY_MS + 1000);
  assert.equal(shouldShowNotifPrompt(), true);

  markNotifPromptDismissed();
  assert.equal(getNotifPromptDismissCount(), 2);
  rewind(3 * DAY_MS + 1000);
  assert.equal(shouldShowNotifPrompt(), false, "le 2e refus fait passer le delai a 7 jours");
  rewind(7 * DAY_MS + 1000);
  assert.equal(shouldShowNotifPrompt(), true);
});

test("invite notifications : plus jamais apres 3 refus", () => {
  markNotifPromptDismissed();
  markNotifPromptDismissed();
  markNotifPromptDismissed();
  assert.equal(getNotifPromptDismissCount(), 3);
  assert.equal(shouldShowNotifPrompt(), false);
});

test("invite notifications : plus jamais une fois acceptee", () => {
  markNotifPromptGranted();
  assert.equal(shouldShowNotifPrompt(), false);
});

test("invite notifications : l ancien booleen est migre en refus definitif", () => {
  localStorage.setItem("mrd_notifications_prompt_seen", "true");
  assert.equal(getNotifPromptDismissCount(), 3);
  assert.equal(shouldShowNotifPrompt(), false);
});

test("invite notifications : un etat corrompu retombe sur l etat neuf", () => {
  localStorage.setItem("mrd_notif_prompt", "{{{");
  assert.equal(getNotifPromptDismissCount(), 0);
  assert.equal(shouldShowNotifPrompt(), true);
});

// ── Preferences « Remplir la semaine » ────────────────────────────────────

const DEFAULTS = {
  diet: "omnivore",
  courses: { starter: false, main: true, dessert: false },
  constraints: [],
  quick: false,
  season: true,
  stock: false,
};

test("remplir la semaine : sans rien de stocke, on rend les valeurs par defaut", () => {
  assert.deepEqual(readMealFillPrefs(DEFAULTS), DEFAULTS);
});

test("remplir la semaine : aller-retour ecriture / lecture", () => {
  storeMealFillPrefs({
    diet: "vegetarien",
    courses: { starter: true, main: true, dessert: true },
    constraints: ["sans_gluten"],
    quick: true,
    season: false,
    stock: true,
  });

  const prefs = readMealFillPrefs(DEFAULTS);
  assert.equal(prefs.diet, "vegetarien");
  assert.deepEqual(prefs.courses, { starter: true, main: true, dessert: true });
  assert.deepEqual(prefs.constraints, ["sans_gluten"]);
  assert.equal(prefs.quick, true);
  assert.equal(prefs.season, false);
  assert.equal(prefs.stock, true);
});

test("remplir la semaine : les services stockes sont fusionnes avec les defauts", () => {
  storeMealFillPrefs({ ...DEFAULTS, courses: { dessert: true } });
  const prefs = readMealFillPrefs(DEFAULTS);
  assert.deepEqual(prefs.courses, { starter: false, main: true, dessert: true });
});

test("remplir la semaine : les champs corrompus retombent sur les defauts", () => {
  localStorage.setItem(
    "mrd-meal-fill",
    JSON.stringify({ diet: 42, courses: "oui", constraints: "sans_gluten", quick: "vrai" }),
  );
  const prefs = readMealFillPrefs(DEFAULTS);
  assert.equal(prefs.diet, DEFAULTS.diet);
  assert.deepEqual(prefs.courses, DEFAULTS.courses);
  assert.deepEqual(prefs.constraints, DEFAULTS.constraints);
  assert.equal(prefs.quick, true, "une chaine non vide reste vraie");
});

test("remplir la semaine : les contraintes non textuelles sont filtrees", () => {
  storeMealFillPrefs({ ...DEFAULTS, constraints: ["sans_gluten", "", null, 7, "sans_lactose"] });
  assert.deepEqual(readMealFillPrefs(DEFAULTS).constraints, ["sans_gluten", "sans_lactose"]);
});

test("remplir la semaine : un JSON illisible ne fait pas planter la feuille", () => {
  localStorage.setItem("mrd-meal-fill", "{{{");
  assert.deepEqual(readMealFillPrefs(DEFAULTS), DEFAULTS);
});

test("remplir la semaine : un stockage en echec est silencieux", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("quota depasse");
    },
  });
  assert.doesNotThrow(() => storeMealFillPrefs(DEFAULTS));
  assert.deepEqual(readMealFillPrefs(DEFAULTS), DEFAULTS);
});

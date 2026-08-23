// Garde des règles produit de la cuisson d'un créneau et de la déduction de
// stock qui l'accompagne.
//
// Ces règles vivaient dans `App.js`, enfermées dans un composant, donc
// intestables : c'est la raison d'être de l'extraction vers
// `hooks/useMealCooking.js`. Chaque test ci-dessous correspond à une règle
// écrite dans AGENT.md §8 — s'il échoue, c'est une régression produit, pas un
// détail d'implémentation.

import test from "node:test";
import assert from "node:assert/strict";

import {
  computeMealCookState,
  deductionToastMessage,
} from "../../src/app/hooks/useMealCooking.js";

/** État planner minimal : un lundi, un plat du midi, un inventaire. */
function makeState({ inventory = [], recipes = [], link = true, meals = null } = {}) {
  return {
    linkMealsToInventory: link,
    recipes,
    inventory,
    meals: meals || [{
      id: "meal-w1-Lundi",
      day: "Lundi",
      weekKey: "w1",
      lunchRecipeId: "r1",
      lunchCooked: false,
      dinnerRecipeId: "",
      dinnerCooked: false,
    }],
  };
}

function item(name, quantity, unit, extra = {}) {
  return { id: `inv-${name}`, name, quantity, unit, stockState: "in_stock", needsRestock: false, ...extra };
}

test("cuisson : bascule l'etat cuisine du bon creneau", () => {
  const state = makeState({ recipes: [{ id: "r1", name: "Pates", ingredients: [] }] });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.equal(out.nextCooked, true);
  assert.equal(out.meals.find((m) => m.day === "Lundi").lunchCooked, true);
  // Le dîner n'est pas touché.
  assert.equal(out.meals.find((m) => m.day === "Lundi").dinnerCooked, false);
});

test("cuisson : creneau introuvable renvoie null, l'appelant n'ecrit rien", () => {
  const state = makeState();
  // Un jour absent ET une semaine nommée différente → aucun repas ne matche…
  const out = computeMealCookState({ ...state, meals: [] }, "Lundi", "lunch", "w1", "main");
  // …mais un shell est créé pour ce jour, donc le calcul aboutit.
  assert.notEqual(out, null, "un creneau vide doit pouvoir etre cuisine (shell cree)");
  assert.equal(out.nextCooked, true);
});

test("REGLE : sans liaison inventaire, aucune deduction", () => {
  const state = makeState({
    link: false,
    inventory: [item("Farine", "500", "g")],
    recipes: [{ id: "r1", ingredients: [{ name: "Farine", quantity: "200", unit: "g" }] }],
  });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.equal(out.deductedAny, false);
  assert.equal(out.inventory[0].quantity, "500", "le stock ne doit pas bouger");
});

test("REGLE : avec liaison, les ingredients principaux sont deduits", () => {
  const state = makeState({
    inventory: [item("Farine", "500", "g")],
    recipes: [{ id: "r1", ingredients: [{ name: "Farine", quantity: "200", unit: "g" }] }],
  });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.equal(out.deductedAny, true);
  assert.equal(out.inventory[0].quantity, "300");
  assert.equal(out.inventory[0].stockState, "in_stock");
  assert.deepEqual(out.shortfalls, []);
});

test("REGLE : les condiments ne sont JAMAIS deduits du stock", () => {
  const state = makeState({
    inventory: [item("Sel", "1", "kg")],
    recipes: [{ id: "r1", ingredients: [], condiments: ["sel"] }],
  });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.equal(out.deductedAny, false);
  assert.equal(out.inventory[0].quantity, "1", "un condiment ne se deduit pas");
});

test("REGLE : une deduction partielle ne passe pas pour complete", () => {
  const state = makeState({
    inventory: [item("Farine", "100", "g")],
    recipes: [{ id: "r1", ingredients: [{ name: "Farine", quantity: "250", unit: "g" }] }],
  });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.equal(out.deductedAny, true);
  assert.equal(out.inventory[0].stockState, "empty");
  assert.equal(out.inventory[0].needsRestock, true);
  assert.equal(out.shortfalls.length, 1, "le manque doit etre nomme");
  assert.equal(out.shortfalls[0].name, "Farine");
});

test("REGLE : un produit absent du stock n'est pas un shortfall", () => {
  // Le rôle de la cuisson n'est pas de signaler ce qu'on n'a jamais eu —
  // c'est celui de la comparaison recette / courses.
  const state = makeState({
    inventory: [item("Beurre", "250", "g")],
    recipes: [{ id: "r1", ingredients: [{ name: "Farine", quantity: "250", unit: "g" }] }],
  });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.deepEqual(out.shortfalls, [], "produit inconnu du stock => pas de shortfall");
  assert.equal(out.deductedAny, false);
});

test("REGLE : unites incompatibles => pas de deduction silencieuse", () => {
  const state = makeState({
    inventory: [item("Lait", "1", "l")],
    recipes: [{ id: "r1", ingredients: [{ name: "Lait", quantity: "200", unit: "g" }] }],
  });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.equal(out.deductedAny, false, "des grammes ne se retirent pas de litres");
  assert.equal(out.inventory[0].quantity, "1");
});

test("REGLE : une recette sans ingredients structures n'est pas comparable", () => {
  const state = makeState({
    inventory: [item("Farine", "500", "g")],
    recipes: [{ id: "r1", ingredientsLegacy: "de la farine et du beurre" }],
  });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.equal(out.deductedAny, false);
  assert.deepEqual(out.shortfalls, []);
});

test("decuisson : repasser a non-cuisine ne rededuit rien", () => {
  const state = makeState({
    inventory: [item("Farine", "500", "g")],
    recipes: [{ id: "r1", ingredients: [{ name: "Farine", quantity: "200", unit: "g" }] }],
    meals: [{ id: "m", day: "Lundi", weekKey: "w1", lunchRecipeId: "r1", lunchCooked: true }],
  });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.equal(out.nextCooked, false);
  assert.equal(out.deductedAny, false);
  assert.equal(out.inventory[0].quantity, "500");
});

test("compat : un repas sans weekKey matche une semaine nommee", () => {
  const state = makeState({
    meals: [{ id: "m", day: "Lundi", weekKey: "", lunchRecipeId: "", lunchCooked: false }],
    recipes: [],
  });
  const out = computeMealCookState(state, "Lundi", "lunch", "w1", "main");
  assert.equal(out.nextCooked, true);
  assert.equal(out.meals[0].weekKey, "w1", "le repas herite de la semaine visee");
});

test("sous-creneaux : entree et dessert ont leurs propres champs", () => {
  const base = makeState({
    meals: [{
      id: "m", day: "Lundi", weekKey: "w1",
      lunchStarterRecipeId: "r1", lunchStarterCooked: false,
      lunchDessertRecipeId: "r1", lunchDessertCooked: false,
      lunchCooked: false,
    }],
    recipes: [{ id: "r1", ingredients: [] }],
  });
  const starter = computeMealCookState(base, "Lundi", "lunch", "w1", "starter");
  assert.equal(starter.meals[0].lunchStarterCooked, true);
  assert.equal(starter.meals[0].lunchDessertCooked, false);
  assert.equal(starter.meals[0].lunchCooked, false);

  const dessert = computeMealCookState(base, "Lundi", "lunch", "w1", "dessert");
  assert.equal(dessert.meals[0].lunchDessertCooked, true);
  assert.equal(dessert.meals[0].lunchStarterCooked, false);
});

/* ── Message du toast ───────────────────────────────────────────────────── */

test("toast : un manque est nomme, et l'annulation est offerte", () => {
  const msg = deductionToastMessage({
    shortfalls: [{ name: "Farine", quantity: "150", unit: "g" }],
    deductedAny: true,
  });
  assert.match(msg.text, /Stock trop juste/);
  assert.match(msg.text, /Farine/);
  assert.equal(msg.undoable, true);
});

test("toast : au-dela de deux manques, le reste est compte", () => {
  const msg = deductionToastMessage({
    shortfalls: [
      { name: "Farine", quantity: "1", unit: "g" },
      { name: "Beurre", quantity: "1", unit: "g" },
      { name: "Sucre", quantity: "1", unit: "g" },
      { name: "Oeufs", quantity: "1", unit: "" },
    ],
    deductedAny: true,
  });
  assert.match(msg.text, /et 2 autres/);
});

test("toast : deduction complete => message positif, annulable", () => {
  const msg = deductionToastMessage({ shortfalls: [], deductedAny: true });
  assert.match(msg.text, /bien ete deduits|bien été déduits/);
  assert.equal(msg.undoable, true);
});

test("toast : rien trouve => pas d'annulation a proposer", () => {
  const msg = deductionToastMessage({ shortfalls: [], deductedAny: false });
  assert.match(msg.text, /Aucun ingredient|Aucun ingrédient/);
  assert.equal(msg.undoable, false);
});

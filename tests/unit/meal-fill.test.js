import test from "node:test";
import assert from "node:assert/strict";

import { buildFillPlan } from "../../src/utils/mealFill.js";
import {
  isQuickRecipe,
  matchesAvailability,
  matchesPeriod,
  periodLabel,
  periodPhrase,
  recipeMonths,
} from "../../src/utils/recipeFilters.js";

/* Tirage déterministe : le mélange devient l'identité. */
const noShuffle = () => 0.999999;

const RECIPES = [
  { id: "r1", name: "Ratatouille", category: "main", labels: ["vegetarian"], availabilityMode: "season", seasons: ["summer"], prepTime: "15", cookTime: "40" },
  { id: "r2", name: "Soupe", category: "main", labels: ["vegan", "gluten_free"], availabilityMode: "all_year", prepTime: "10", cookTime: "20" },
  { id: "r3", name: "Omelette", category: "main", labels: ["vegetarian"], availabilityMode: "all_year", quick: true },
  { id: "r4", name: "Sirop", category: "drink", labels: [], availabilityMode: "all_year" },
];

function emptyWeek() {
  return ["lunch", "dinner"].flatMap((slot) => (
    [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => ({ dayIndex, slot, recipeId: "" }))
  ));
}

test("buildFillPlan ne remplit que les cases vides par défaut", () => {
  const slots = emptyWeek();
  slots[0].recipeId = "r1";
  const { entries: plan } = buildFillPlan({ recipes: RECIPES, slots, currentMonth: 7, random: noShuffle });
  assert.equal(plan.some((entry) => entry.dayIndex === slots[0].dayIndex && entry.slot === slots[0].slot), false);
});

test("buildFillPlan ne place jamais deux fois la même recette dans la semaine", () => {
  const { entries: plan } = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), currentMonth: 7, random: noShuffle });
  const ids = plan.map((entry) => entry.recipeId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(plan.length, RECIPES.length); // 4 recettes → 4 créneaux remplis, pas 14
});

test("buildFillPlan ne réutilise pas une recette déjà posée ailleurs dans la semaine", () => {
  const slots = emptyWeek();
  slots[0].recipeId = "r2";
  const { entries: plan } = buildFillPlan({ recipes: RECIPES, slots, currentMonth: 7, random: noShuffle });
  assert.equal(plan.some((entry) => entry.recipeId === "r2"), false);
});

test("buildFillPlan en portée « toute la semaine » écrase les cases déjà remplies", () => {
  const slots = emptyWeek();
  slots[0].recipeId = "r2";
  const { entries: plan } = buildFillPlan({ recipes: RECIPES, slots, filters: { scope: "all" }, currentMonth: 7, random: noShuffle });
  assert.equal(plan.some((entry) => entry.recipeId === "r2"), true);
  assert.equal(plan[0].dayIndex, slots[0].dayIndex);
});

test("buildFillPlan applique régime, contraintes, rapide et saison", () => {
  const { entries: vegan } = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { diet: "vegan" }, currentMonth: 7, random: noShuffle });
  assert.deepEqual(vegan.map((e) => e.recipeId), ["r2"]);

  const { entries: glutenFree } = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { constraints: ["gluten_free"] }, currentMonth: 7, random: noShuffle });
  assert.deepEqual(glutenFree.map((e) => e.recipeId), ["r2"]);

  const { entries: quick } = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { quick: true }, currentMonth: 7, random: noShuffle });
  assert.deepEqual(quick.map((e) => e.recipeId), ["r3"]);

  // En janvier, la ratatouille d'été sort du tirage « de saison ».
  const { entries: winter } = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { season: true }, currentMonth: 1, random: noShuffle });
  assert.equal(winter.some((e) => e.recipeId === "r1"), false);
});

test("buildFillPlan préfère les plats aux boissons", () => {
  const { entries: plan } = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), currentMonth: 7, random: noShuffle });
  assert.equal(plan[plan.length - 1].recipeId, "r4");
});

test("« avec mon stock » remplit quand meme quand rien n est faisable, et le signale", () => {
  const stockByRecipeId = new Map(RECIPES.map((recipe) => [recipe.id, { ready: false, known: true }]));
  const plan = buildFillPlan({
    recipes: RECIPES,
    slots: emptyWeek(),
    filters: { stock: true },
    currentMonth: 7,
    stockByRecipeId,
    random: noShuffle,
  });
  assert.equal(plan.entries.length, RECIPES.length);
  assert.equal(plan.stockCount, 0);
  assert.equal(plan.otherCount, RECIPES.length);
  assert.equal(plan.stockAsked, true);
  assert.equal(plan.entries.every((entry) => entry.fromStock === false), true);
});

test("« avec mon stock » place les faisables en premier puis complete le reste", () => {
  const stockByRecipeId = new Map([
    ["r1", { ready: false, known: true }],
    ["r2", { ready: true, known: true }],
    ["r3", { ready: true, known: true }],
    ["r4", { ready: false, known: true }],
  ]);
  const plan = buildFillPlan({
    recipes: RECIPES,
    slots: emptyWeek(),
    filters: { stock: true },
    currentMonth: 7,
    stockByRecipeId,
    random: noShuffle,
  });
  // Les deux faisables ouvrent la semaine, les deux autres la complètent :
  // aucun créneau ne reste vide sous prétexte que le stock est maigre.
  assert.deepEqual(plan.entries.map((entry) => entry.recipeId), ["r2", "r3", "r1", "r4"]);
  assert.deepEqual(plan.entries.map((entry) => entry.fromStock), [true, true, false, false]);
  assert.equal(plan.stockCount, 2);
  assert.equal(plan.otherCount, 2);
});

test("sans « avec mon stock », le tirage ne classe rien par faisabilite", () => {
  const stockByRecipeId = new Map([["r4", { ready: true, known: true }]]);
  const plan = buildFillPlan({
    recipes: RECIPES,
    slots: emptyWeek(),
    filters: {},
    currentMonth: 7,
    stockByRecipeId,
    random: noShuffle,
  });
  assert.equal(plan.stockAsked, false);
  assert.equal(plan.stockCount, 0);
  assert.equal(plan.entries[plan.entries.length - 1].recipeId, "r4"); // la boisson reste en dernier
});

test("buildFillPlan sans recette candidate ne renvoie rien", () => {
  const { entries: plan } = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { diet: "pescetarian" }, currentMonth: 7, random: noShuffle });
  assert.deepEqual(plan, []);
});

test("recipeFilters : saisonnalité et durée", () => {
  assert.deepEqual(recipeMonths({ availabilityMode: "season", seasons: ["summer"] }), [6, 7, 8]);
  assert.equal(matchesAvailability({ availabilityMode: "season", seasons: ["summer"] }, 7), true);
  assert.equal(matchesAvailability({ availabilityMode: "season", seasons: ["summer"] }, 1), false);
  assert.equal(matchesAvailability({ availabilityMode: "all_year" }, 1), true);
  // 20 min ou moins : le libellé du sélecteur fait foi.
  assert.equal(isQuickRecipe({ prepTime: "10", cookTime: "10" }), true);
  assert.equal(isQuickRecipe({ prepTime: "10", cookTime: "15" }), false);
  assert.equal(isQuickRecipe({ quick: true, prepTime: "60" }), true);
});

test("recipeFilters : periode choisie a la main (saison ou mois precis)", () => {
  const ete = { availabilityMode: "season", seasons: ["summer"] };
  const mars = { availabilityMode: "custom", months: [3] };
  const toujours = { availabilityMode: "all_year" };

  // Sans période, le mois courant fait foi — comportement d'avant le choix manuel.
  assert.equal(matchesPeriod(ete, "current", 7), true);
  assert.equal(matchesPeriod(ete, "current", 1), false);

  // Une saison : il suffit qu'un mois de la recette tombe dedans.
  assert.equal(matchesPeriod(ete, "season:summer", 1), true);
  assert.equal(matchesPeriod(ete, "season:winter", 7), false);
  assert.equal(matchesPeriod(mars, "season:spring", 12), true);
  assert.equal(matchesPeriod(toujours, "season:winter", 7), true);

  // Un mois précis, quel que soit le mois courant.
  assert.equal(matchesPeriod(mars, "month:3", 8), true);
  assert.equal(matchesPeriod(mars, "month:4", 3), false);
  assert.equal(matchesPeriod(ete, "month:8", 1), true);

  assert.equal(periodLabel("current", 8), "août");
  assert.equal(periodLabel("season:autumn", 8), "automne");
  assert.equal(periodLabel("month:3", 8), "mars");
  assert.equal(periodPhrase("season:spring", 8), "au printemps");
  assert.equal(periodPhrase("month:1", 8), "en janvier");
});

import test from "node:test";
import assert from "node:assert/strict";

import { buildFillPlan, normalizeCourses } from "../../src/app/utils/mealFill.js";
import {
  isQuickRecipe,
  matchesAvailability,
  matchesPeriod,
  periodLabel,
  periodPhrase,
  recipeMonths,
} from "../../src/app/utils/recipeFilters.js";

/* Tirage déterministe : le mélange devient l'identité. */
const noShuffle = () => 0.999999;

const RECIPES = [
  { id: "r1", name: "Ratatouille", category: "main", labels: ["vegetarian"], availabilityMode: "season", seasons: ["summer"], prepTime: "15", cookTime: "40" },
  { id: "r2", name: "Soupe", category: "main", labels: ["vegan", "gluten_free"], availabilityMode: "all_year", prepTime: "10", cookTime: "20" },
  { id: "r3", name: "Omelette", category: "main", labels: ["vegetarian"], availabilityMode: "all_year", quick: true },
  { id: "r4", name: "Sirop", category: "drink", labels: [], availabilityMode: "all_year" },
  { id: "r5", name: "Salade", category: "starter", labels: ["vegan"], availabilityMode: "all_year" },
  { id: "r6", name: "Tarte", category: "dessert", labels: ["vegetarian"], availabilityMode: "all_year" },
];

function emptyWeek() {
  return ["lunch", "dinner"].flatMap((slot) => (
    [0, 1, 2, 3, 4, 5, 6].map((dayIndex) => ({ dayIndex, slot, recipeId: "" }))
  ));
}

const ALL_COURSES = { starter: true, main: true, dessert: true };

test("buildFillPlan ne remplit que les cases vides par défaut", () => {
  const slots = emptyWeek();
  slots[0].recipeId = "r1";
  const { entries: plan } = buildFillPlan({ recipes: RECIPES, slots, currentMonth: 7, random: noShuffle });
  assert.equal(plan.some((entry) => entry.dayIndex === slots[0].dayIndex && entry.slot === slots[0].slot), false);
});

test("buildFillPlan ne touche pas non plus un créneau écrit en texte libre", () => {
  const slots = emptyWeek();
  slots[0].text = "Restaurant";
  const { entries: plan } = buildFillPlan({ recipes: RECIPES, slots, currentMonth: 7, random: noShuffle });
  assert.equal(plan.some((entry) => entry.dayIndex === slots[0].dayIndex && entry.slot === slots[0].slot), false);
});

test("buildFillPlan ne répète pas une recette tant que le pool n'est pas épuisé", () => {
  const { entries: plan } = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), currentMonth: 7, random: noShuffle });
  // Trois plats pour quatorze créneaux : les trois premiers sont distincts,
  // puis la bibliothèque se recycle dans le même ordre plutôt que de laisser
  // des cases vides — c'est ce que le compteur du bouton a promis.
  assert.equal(plan.length, 14);
  assert.deepEqual(plan.slice(0, 3).map((entry) => entry.recipeId), ["r1", "r2", "r3"]);
  assert.equal(plan[3].recipeId, "r1");
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
  assert.equal(plan.length, 14);
});

test("buildFillPlan applique régime, contraintes, rapide et saison", () => {
  const vegan = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { diet: "vegan" }, currentMonth: 7, random: noShuffle });
  assert.equal(vegan.entries.every((entry) => entry.recipeId === "r2"), true);

  const glutenFree = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { constraints: ["gluten_free"] }, currentMonth: 7, random: noShuffle });
  assert.equal(glutenFree.entries.every((entry) => entry.recipeId === "r2"), true);

  const quick = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { quick: true }, currentMonth: 7, random: noShuffle });
  assert.equal(quick.entries.every((entry) => entry.recipeId === "r3"), true);

  // En janvier, la ratatouille d'été sort du tirage « de saison ».
  const winter = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { season: true }, currentMonth: 1, random: noShuffle });
  assert.equal(winter.entries.some((entry) => entry.recipeId === "r1"), false);
});

test("« omnivore » n'exclut personne : c'est l'absence de contrainte", () => {
  // Aucune recette du jeu ne porte le label « omnivore ». Le filtrer comme un
  // label rendrait une semaine vide alors que c'est le régime par défaut.
  const plan = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { diet: "omnivore" }, currentMonth: 7, random: noShuffle });
  assert.equal(plan.entries.length, 14);
  assert.deepEqual(plan.entries.slice(0, 3).map((entry) => entry.recipeId), ["r1", "r2", "r3"]);
});

test("chaque service pioche dans sa propre catégorie", () => {
  const plan = buildFillPlan({
    recipes: RECIPES,
    slots: emptyWeek(),
    filters: { courses: ALL_COURSES },
    currentMonth: 7,
    random: noShuffle,
  });
  const byRole = (role) => plan.entries.filter((entry) => entry.role === role).map((entry) => entry.recipeId);
  assert.equal(byRole("starter").every((id) => id === "r5"), true);
  assert.equal(byRole("dessert").every((id) => id === "r6"), true);
  assert.deepEqual([...new Set(byRole("main"))].sort(), ["r1", "r2", "r3"]);
  // La boisson n'est le service de personne : elle ne sort jamais.
  assert.equal(plan.entries.some((entry) => entry.recipeId === "r4"), false);
  // Trois services par créneau, mais quatorze repas.
  assert.equal(plan.entries.length, 42);
  assert.equal(plan.slotCount, 14);
});

test("un service sans candidat est signalé au lieu d'être rempli au hasard", () => {
  const plan = buildFillPlan({
    recipes: RECIPES.filter((recipe) => recipe.category !== "dessert"),
    slots: emptyWeek(),
    filters: { courses: ALL_COURSES },
    currentMonth: 7,
    random: noShuffle,
  });
  assert.deepEqual(plan.emptyCourses, ["dessert"]);
  assert.equal(plan.entries.some((entry) => entry.role === "dessert"), false);
  assert.equal(plan.slotCount, 14);
});

test("une entrée déjà choisie reste en place en portée « cases vides »", () => {
  const slots = emptyWeek();
  slots[0].starterRecipeId = "r5";
  const plan = buildFillPlan({
    recipes: RECIPES,
    slots,
    filters: { courses: { starter: true, main: false, dessert: false } },
    currentMonth: 7,
    random: noShuffle,
  });
  assert.equal(plan.entries.some((entry) => entry.dayIndex === slots[0].dayIndex && entry.slot === slots[0].slot), false);
  assert.equal(plan.entries.length, 13);
});

test("normalizeCourses ramène le plat quand tout est décoché", () => {
  assert.deepEqual(normalizeCourses({ starter: false, main: false, dessert: false }), ["main"]);
  assert.deepEqual(normalizeCourses(undefined), ["main"]);
  assert.deepEqual(normalizeCourses(ALL_COURSES), ["starter", "main", "dessert"]);
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
  assert.equal(plan.entries.length, 14);
  assert.equal(plan.stockCount, 0);
  assert.equal(plan.otherCount, 14);
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
  // Les deux faisables ouvrent la semaine, le troisième plat la complète :
  // aucun créneau ne reste vide sous prétexte que le stock est maigre.
  assert.deepEqual(plan.entries.slice(0, 3).map((entry) => entry.recipeId), ["r2", "r3", "r1"]);
  assert.deepEqual(plan.entries.slice(0, 3).map((entry) => entry.fromStock), [true, true, false]);
});

test("sans « avec mon stock », le tirage ne classe rien par faisabilite", () => {
  const stockByRecipeId = new Map([["r3", { ready: true, known: true }]]);
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
  assert.deepEqual(plan.entries.slice(0, 3).map((entry) => entry.recipeId), ["r1", "r2", "r3"]);
});

test("buildFillPlan sans recette candidate ne renvoie rien", () => {
  const plan = buildFillPlan({ recipes: RECIPES, slots: emptyWeek(), filters: { diet: "pescetarian" }, currentMonth: 7, random: noShuffle });
  assert.deepEqual(plan.entries, []);
  assert.equal(plan.slotCount, 0);
  assert.deepEqual(plan.emptyCourses, ["main"]);
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

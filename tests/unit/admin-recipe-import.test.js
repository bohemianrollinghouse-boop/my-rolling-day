import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { recipeDocFromImport, createRecipeImporter, availabilityFromMonths } = require_("../../functions/admin/recipeImport.js");

// ── Document catalogue : meme forme que buildRecipePayload (RecipesView.js) ──

test("import admin : la disponibilite se deduit des mois comme dans l'app", () => {
  assert.deepEqual(availabilityFromMonths([]), { availabilityMode: "all_year", season: "", seasons: [], months: [] });
  assert.deepEqual(availabilityFromMonths([6, 7, 8]), { availabilityMode: "season", season: "summer", seasons: ["summer"], months: [6, 7, 8] });
  assert.equal(availabilityFromMonths([6, 7]).availabilityMode, "months");
  assert.equal(availabilityFromMonths([12, 1, 2, 3, 4, 5]).seasons.length, 2);
});

test("import admin : l'analyse IA prime sur le brut (titre traduit, ingredients structures, etapes numerotees)", () => {
  const doc = recipeDocFromImport({
    url: "https://www.example.com/pie",
    scraped: { title: "Apple pie", ingredients: ["3 apples"], instructions: "Bake.", yields: "8 servings", prep_time_min: 10, cook_time_min: 5, image_data_url: "data:image/jpeg;base64,AAA" },
    analysis: {
      category: "dessert", food_type: "vegetarian", constraints: ["gluten_free"], quick: false,
      availability_mode: "months", seasons: [], months: [10, 11, 13, 0], servings: 6,
      title_fr: "Tarte aux pommes", steps: ["Éplucher", "Cuire"], condiments: ["cannelle"],
      ingredients: [{ name: "pomme", quantity: "3", unit: "unite", group: "" }, { name: "", quantity: "", unit: "", group: "" }],
    },
    now: new Date("2026-09-07T10:00:00Z"),
  });
  assert.equal(doc.name, "Tarte aux pommes");
  assert.equal(doc.servings, 6);
  assert.equal(doc.category, "dessert");
  assert.deepEqual(doc.labels, ["vegetarian", "gluten_free"]);
  assert.equal(doc.quick, true, "10 + 5 min : rapide se deduit du temps, pas du drapeau IA");
  assert.equal(doc.prepTime, "10");
  assert.equal(doc.cookTime, "5");
  assert.equal(doc.method, "1. Éplucher\n\n2. Cuire");
  assert.equal(doc.ingredients.length, 1, "les ingredients sans nom sont ecartes");
  assert.deepEqual(doc.condiments, ["cannelle"]);
  assert.equal(doc.availabilityMode, "months");
  assert.deepEqual(doc.months, [10, 11], "mois hors 1-12 ecartes");
  assert.equal(doc.photo, "data:image/jpeg;base64,AAA");
  assert.equal(doc.ingredientsLegacy, "");
  assert.equal(doc.sourceHost, "example.com");
  assert.equal(doc.importedAt, "2026-09-07T10:00:00.000Z");
});

test("import admin : sans analyse, le brut fait la fiche et les portions viennent de yields", () => {
  const doc = recipeDocFromImport({
    url: "https://site.fr/x",
    scraped: { title: "Soupe", ingredients: ["1 poireau", " "], instructions: "Mixer.", yields: "4 servings", prep_time_min: 0, cook_time_min: 45 },
    analysis: null,
  });
  assert.equal(doc.name, "Soupe");
  assert.equal(doc.servings, 4);
  assert.equal(doc.category, "");
  assert.deepEqual(doc.labels, []);
  assert.equal(doc.quick, false);
  assert.equal(doc.method, "Mixer.");
  assert.deepEqual(doc.ingredients.map((i) => i.name), ["1 poireau"]);
  assert.equal(doc.availabilityMode, "all_year");
  assert.equal(doc.prepTime, "");
});

// ── Appel serveur a serveur ──────────────────────────────────────────────

function fakeFetch(status, body) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return { ok: status < 400, status, json: async () => body }; };
  fn.calls = calls;
  return fn;
}

test("import admin : l'appel porte le jeton d'identite et l'URL de la page", async () => {
  const fetchImpl = fakeFetch(200, { scraped: { title: "x" }, analysis: null, analysis_error: "" });
  const importRecipe = createRecipeImporter({
    url: "https://fn.example/import_recipe",
    getAuthHeaders: async (audience) => ({ Authorization: "Bearer jeton-pour-" + audience }),
    fetchImpl,
  });
  const out = await importRecipe("https://site.fr/recette");
  assert.equal(out.scraped.title, "x");
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, "https://fn.example/import_recipe");
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, "Bearer jeton-pour-https://fn.example/import_recipe");
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { url: "https://site.fr/recette" });
});

test("import admin : une erreur Python remonte avec son statut et son message", async () => {
  const importRecipe = createRecipeImporter({
    url: "https://fn.example/import_recipe",
    getAuthHeaders: async () => ({ Authorization: "Bearer t" }),
    fetchImpl: fakeFetch(404, { error: "not-found", message: "Aucune recette détectée." }),
  });
  await assert.rejects(importRecipe("https://site.fr/rien"), (e) => e.status === 404 && e.code === "not-found" && /Aucune recette/.test(e.message));
});

test("import admin : sans jeton d'identite, l'echec est nomme", async () => {
  const importRecipe = createRecipeImporter({
    url: "https://fn.example/import_recipe",
    getAuthHeaders: async () => { throw new Error("pas de metadata server"); },
    fetchImpl: fakeFetch(200, {}),
  });
  await assert.rejects(importRecipe("https://site.fr/x"), (e) => e.code === "no-identity" && e.status === 500);
});

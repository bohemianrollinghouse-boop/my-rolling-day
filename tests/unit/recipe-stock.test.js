import test from "node:test";
import assert from "node:assert/strict";

import {
  collectExpiringItems,
  collectUsedStockItems,
  countDistinctProducts,
  isAlreadyListed,
  splitAlreadyListed,
  computeMissingIngredients,
  computePriorityRecipes,
  computeRecipeStock,
  computeWeekStock,
  expiryShortLabel,
  recipeStockRank,
} from "../../src/app/utils/recipeStock.js";

function dateKeyIn(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const RECIPE_RATATOUILLE = {
  id: "r-rata",
  name: "Ratatouille",
  ingredients: [
    { id: "i1", name: "Courgettes", quantity: "2", unit: "unité" },
    { id: "i2", name: "Tomate", quantity: "500", unit: "g" },
  ],
};

test("computeRecipeStock declare faisable une recette entierement couverte", () => {
  const stock = computeRecipeStock(RECIPE_RATATOUILLE, [
    { id: "a", name: "courgette", quantity: "3", unit: "unité", stockState: "in_stock" },
    { id: "b", name: "Tomates", quantity: "800", unit: "g", stockState: "in_stock" },
  ]);
  assert.equal(stock.ready, true);
  assert.equal(stock.missingCount, 0);
  assert.equal(stock.total, 2);
});

test("computeRecipeStock compte les manquants, stock vide inclus", () => {
  const stock = computeRecipeStock(RECIPE_RATATOUILLE, [
    { id: "a", name: "Courgette", quantity: "3", unit: "unité", stockState: "empty" },
    { id: "b", name: "Tomate", quantity: "200", unit: "g", stockState: "in_stock" },
  ]);
  assert.equal(stock.ready, false);
  assert.equal(stock.missingCount, 2);
  // Quantite insuffisante : on ne redemande que le complement
  assert.equal(stock.missing.find((item) => item.name === "Tomate").quantity, "300");
});

test("computeRecipeStock ne juge pas les recettes sans ingredients structures", () => {
  const stock = computeRecipeStock({ id: "r-legacy", name: "Vieille fiche", ingredientsLegacy: "un peu de tout" }, []);
  assert.equal(stock.known, false);
  assert.equal(stock.ready, false);
  assert.equal(recipeStockRank(stock), Number.MAX_SAFE_INTEGER);
});

test("recipeStockRank trie faisable avant manquants", () => {
  const inventory = [{ id: "a", name: "Courgette", quantity: "3", unit: "unité", stockState: "in_stock" }];
  const partial = computeRecipeStock(RECIPE_RATATOUILLE, inventory);
  const full = computeRecipeStock({ ...RECIPE_RATATOUILLE, ingredients: [RECIPE_RATATOUILLE.ingredients[0]] }, inventory);
  assert.ok(recipeStockRank(full) < recipeStockRank(partial));
});

/* Regression : la comparaison utilisait l'egalite brute des unites, alors que
   l'inventaire stocke "unité" et les recettes "unite", et que 1 kg ne couvrait
   pas 200 g. Tout passait donc pour manquant. */
test("computeMissingIngredients convertit les unites comme la deduction de stock", () => {
  const covered = computeMissingIngredients(
    {
      ingredients: [
        { id: "i1", name: "Riz", quantity: "200", unit: "g" },
        { id: "i2", name: "Courgettes", quantity: "2", unit: "unite" },
      ],
    },
    [
      { id: "a", name: "Riz", quantity: "1", unit: "kg", stockState: "in_stock" },
      { id: "b", name: "Courgette", quantity: "3", unit: "unité", stockState: "in_stock" },
    ],
  );
  assert.deepEqual(covered, []);
});

test("computeMissingIngredients exprime le complement dans l unite de la recette", () => {
  const missing = computeMissingIngredients(
    { ingredients: [{ id: "i1", name: "Lait", quantity: "1", unit: "l" }] },
    [{ id: "a", name: "Lait", quantity: "500", unit: "ml", stockState: "in_stock" }],
  );
  assert.equal(missing.length, 1);
  assert.equal(missing[0].quantity, "0,5");
});

test("computeMissingIngredients se contente de la presence sans quantite exploitable", () => {
  const missing = computeMissingIngredients(
    { ingredients: [{ id: "i1", name: "Persil", quantity: "", unit: "" }] },
    [{ id: "a", name: "Persil", quantity: "", unit: "", stockState: "in_stock" }],
  );
  assert.deepEqual(missing, []);
});

test("computeMissingIngredients ne compense pas une masse par un compte", () => {
  const missing = computeMissingIngredients(
    { ingredients: [{ id: "i1", name: "Tomate", quantity: "500", unit: "g" }] },
    [{ id: "a", name: "Tomates", quantity: "4", unit: "unité", stockState: "in_stock" }],
  );
  assert.equal(missing.length, 1);
  assert.equal(missing[0].quantity, "500");
});

/* Le stock est un budget que les creneaux se partagent : deux repas qui veulent
   le meme paquet ne peuvent pas se declarer faisables tous les deux. */

const RECIPE_NOUILLES = {
  id: "r-nouilles",
  name: "Nouilles sautées",
  ingredients: [{ id: "n1", name: "Nouilles instantanées", quantity: "2", unit: "unité" }],
};

function weekSlots(entries) {
  return entries.map(([key, recipes, cooked]) => ({ key, label: key, cooked: Boolean(cooked), recipes }));
}

test("computeWeekStock sert le premier creneau et signale le suivant", () => {
  const inventory = [{ id: "a", name: "Nouilles instantanées", quantity: "2", unit: "unité", stockState: "in_stock" }];
  const week = computeWeekStock({
    slots: weekSlots([["Lun midi", [RECIPE_NOUILLES]], ["Jeu soir", [RECIPE_NOUILLES]]]),
    inventory,
  });

  assert.equal(week.get("Lun midi").ready, true);
  assert.equal(week.get("Jeu soir").ready, false);
  assert.equal(week.get("Jeu soir").missing[0].quantity, "2");
  // Seule la semaine explique ce manque : la recette seule etait faisable.
  assert.equal(week.get("Jeu soir").weekOnlyCount, 1);
  assert.deepEqual(week.get("Jeu soir").missing[0].takenBy, ["Lun midi"]);

  // Sans la lecture semaine, les deux creneaux se croyaient faisables.
  assert.equal(computeRecipeStock(RECIPE_NOUILLES, inventory).ready, true);
});

test("computeWeekStock laisse passer les deux quand le stock suffit", () => {
  const week = computeWeekStock({
    slots: weekSlots([["Lun midi", [RECIPE_NOUILLES]], ["Jeu soir", [RECIPE_NOUILLES]]]),
    inventory: [{ id: "a", name: "Nouilles instantanées", quantity: "4", unit: "unité", stockState: "in_stock" }],
  });
  assert.equal(week.get("Lun midi").ready, true);
  assert.equal(week.get("Jeu soir").ready, true);
  assert.equal(week.get("Jeu soir").weekOnlyCount, 0);
});

test("computeWeekStock ne recompte pas un repas deja cuisine", () => {
  // La cuisson a deja retire les ingredients du stock : les recompter les
  // deduirait deux fois et condamnerait le repas suivant a tort.
  const week = computeWeekStock({
    slots: weekSlots([["Lun midi", [RECIPE_NOUILLES], true], ["Jeu soir", [RECIPE_NOUILLES]]]),
    inventory: [{ id: "a", name: "Nouilles instantanées", quantity: "2", unit: "unité", stockState: "in_stock" }],
  });
  assert.equal(week.get("Lun midi").cooked, true);
  assert.equal(week.get("Jeu soir").ready, true);
});

test("computeWeekStock distingue le stock absent du stock deja pris", () => {
  const week = computeWeekStock({
    slots: weekSlots([["Lun midi", [RECIPE_NOUILLES]], ["Jeu soir", [RECIPE_NOUILLES]]]),
    inventory: [],
  });
  // Rien en stock : le manque n'est pas imputable a la semaine.
  assert.equal(week.get("Lun midi").missingCount, 1);
  assert.equal(week.get("Jeu soir").missingCount, 1);
  assert.equal(week.get("Jeu soir").weekOnlyCount, 0);
});

test("computeWeekStock partage le budget entre recettes differentes", () => {
  const inventory = [
    { id: "a", name: "Tomate", quantity: "600", unit: "g", stockState: "in_stock" },
    { id: "b", name: "Courgettes", quantity: "9", unit: "unité", stockState: "in_stock" },
  ];
  const salade = { id: "r-salade", name: "Salade", ingredients: [{ id: "s1", name: "Tomates", quantity: "400", unit: "g" }] };
  const week = computeWeekStock({
    slots: weekSlots([["Lun midi", [RECIPE_RATATOUILLE]], ["Lun soir", [salade]]]),
    inventory,
  });
  // La ratatouille prend 500 g, il reste 100 g pour la salade qui en veut 400.
  assert.equal(week.get("Lun midi").ready, true);
  assert.equal(week.get("Lun soir").missing[0].quantity, "300");
  assert.equal(week.get("Lun soir").weekOnlyCount, 1);
});

test("computeWeekStock cumule les roles d un meme creneau", () => {
  const week = computeWeekStock({
    slots: weekSlots([["Lun midi", [RECIPE_NOUILLES, RECIPE_NOUILLES]]]),
    inventory: [{ id: "a", name: "Nouilles instantanées", quantity: "3", unit: "unité", stockState: "in_stock" }],
  });
  // Entree et plat sur le meme paquet : 4 demandes pour 3 disponibles.
  assert.equal(week.get("Lun midi").missingCount, 1);
  assert.equal(week.get("Lun midi").missing[0].quantity, "1");
});

test("collectExpiringItems retient les DLC proches et exclut perime et stock vide", () => {
  const items = collectExpiringItems([
    { id: "a", name: "Creme", expiryDate: dateKeyIn(2), stockState: "in_stock" },
    { id: "b", name: "Yaourt", expiryDate: dateKeyIn(-1), stockState: "in_stock" },
    { id: "c", name: "Beurre", expiryDate: dateKeyIn(30), stockState: "in_stock" },
    { id: "d", name: "Oeufs", expiryDate: dateKeyIn(1), stockState: "empty" },
    { id: "e", name: "Farine", stockState: "in_stock" },
  ]);
  assert.deepEqual(items.map(({ item }) => item.id), ["a"]);
  assert.equal(items[0].days, 2);
});

test("computePriorityRecipes classe par articles urgents utilises puis DLC", () => {
  const inventory = [
    { id: "a", name: "Courgettes", quantity: "3", unit: "unité", expiryDate: dateKeyIn(3), stockState: "in_stock" },
    { id: "b", name: "Tomate", quantity: "800", unit: "g", expiryDate: dateKeyIn(1), stockState: "in_stock" },
    { id: "c", name: "Riz", quantity: "1", unit: "kg", stockState: "in_stock" },
  ];
  const recipes = [
    { id: "r-riz", name: "Riz nature", ingredients: [{ id: "x", name: "Riz" }] },
    { id: "r-tomate", name: "Salade de tomates", ingredients: [{ id: "y", name: "Tomates" }] },
    RECIPE_RATATOUILLE,
  ];

  const priority = computePriorityRecipes({ recipes, inventory });
  // La ratatouille utilise les deux articles urgents, la salade un seul, le riz aucun
  assert.deepEqual(priority.map((entry) => entry.recipe.id), ["r-rata", "r-tomate"]);
  assert.deepEqual(priority[0].expiringItems.map((item) => item.name), ["Tomate", "Courgettes"]);
  assert.equal(priority[0].stock.ready, true);
});

test("computePriorityRecipes ne renvoie rien sans DLC proche", () => {
  const priority = computePriorityRecipes({
    recipes: [RECIPE_RATATOUILLE],
    inventory: [{ id: "a", name: "Courgettes", expiryDate: dateKeyIn(40), stockState: "in_stock" }],
  });
  assert.deepEqual(priority, []);
});

test("collectUsedStockItems liste les articles du stock reellement couverts", () => {
  const inventory = [
    { id: "a", name: "Courgettes", stockState: "in_stock" },
    { id: "b", name: "Tomate", stockState: "in_stock" },
    { id: "c", name: "Riz", stockState: "in_stock" },
    { id: "d", name: "Beurre", stockState: "empty" },
  ];
  const recipes = [
    RECIPE_RATATOUILLE,
    { id: "r-beurre", ingredients: [{ id: "i", name: "Beurre" }, { id: "i2", name: "Courgette" }] },
  ];
  const used = collectUsedStockItems(recipes, inventory);
  // Le riz n'est dans aucune recette, le beurre est à zéro : ni l'un ni l'autre.
  // La courgette n'est comptée qu'une fois malgré singulier/pluriel.
  assert.deepEqual(used.sort(), ["Courgettes", "Tomate"]);
});

test("countDistinctProducts compte les produits, pas les lignes", () => {
  // Deux recettes qui manquent de tomates ne feront qu'une ligne de courses.
  const items = [
    { id: "1", name: "Tomate", quantity: "500", unit: "g" },
    { id: "2", name: "Tomates", quantity: "300", unit: "g" },
    { id: "3", name: "Chèvre", quantity: "1", unit: "unite" },
    { id: "4", name: "" },
  ];
  assert.equal(countDistinctProducts(items), 2);
  assert.equal(countDistinctProducts([]), 0);
  assert.equal(countDistinctProducts(null), 0);
});

test("splitAlreadyListed reconnait ce qui attend deja dans la liste de courses", () => {
  const missing = [
    { id: "1", name: "Tomates", quantity: "500", unit: "g" },
    { id: "2", name: "Chèvre", quantity: "1", unit: "unite" },
    { id: "3", name: "Asperges", quantity: "1", unit: "kg" },
  ];
  const shopping = [
    { id: "l1", text: "Tomate", done: false },      // même produit au singulier
    { id: "l2", text: "Asperges", done: true },     // déjà acheté : n'attend plus
    { id: "l3", text: "Pain", done: false },        // sans rapport
  ];
  const { listed, toAdd } = splitAlreadyListed(missing, shopping);
  assert.deepEqual(listed.map((item) => item.name), ["Tomates"]);
  assert.deepEqual(toAdd.map((item) => item.name), ["Chèvre", "Asperges"]);

  assert.equal(isAlreadyListed({ name: "tomate" }, shopping), true);
  assert.equal(isAlreadyListed({ name: "Chèvre" }, shopping), false);
  // Liste vide ou absente : rien n'est déjà demandé.
  assert.deepEqual(splitAlreadyListed(missing, []).toAdd.length, 3);
  assert.deepEqual(splitAlreadyListed(missing, null).listed, []);
});

test("expiryShortLabel reste lisible pour aujourd hui et demain", () => {
  assert.equal(expiryShortLabel(0), "aujourd'hui");
  assert.equal(expiryShortLabel(1), "demain");
  assert.equal(expiryShortLabel(5), "dans 5 j");
});

/**
 * Tirage automatique de la semaine (feuille « Remplir » de l'onglet Repas).
 *
 * Le tirage ne touche jamais l'état directement : il renvoie un plan
 * (`{ dayIndex, slot, recipeId }`) que la vue applique créneau par créneau via
 * `onUpdateMeal`. C'est ce qui le rend testable.
 */
import { isQuickRecipe, matchesAvailability, matchesConstraints, matchesDiet } from "./recipeFilters.js";

/** Les créneaux de la grille sont des repas complets : un plat vaut mieux qu'un sirop. */
const PREFERRED_CATEGORIES = ["main", ""];

function filterPool(recipes, { diet, constraints, quick, season, stock }, { currentMonth, stockByRecipeId }) {
  return recipes.filter((recipe) => {
    if (!recipe?.id) return false;
    if (!matchesDiet(recipe, diet)) return false;
    if (!matchesConstraints(recipe, constraints)) return false;
    if (quick && !isQuickRecipe(recipe)) return false;
    if (season && !matchesAvailability(recipe, currentMonth)) return false;
    if (stock && !stockByRecipeId?.get(recipe.id)?.ready) return false;
    return true;
  });
}

/**
 * Ordre de tirage : d'abord un mélange aléatoire (deux « Remplir » de suite ne
 * doivent pas donner la même semaine), puis les plats remontent devant.
 */
function drawOrder(pool, random) {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.sort((left, right) => {
    const leftRank = PREFERRED_CATEGORIES.includes(left.category || "") ? 0 : 1;
    const rightRank = PREFERRED_CATEGORIES.includes(right.category || "") ? 0 : 1;
    return leftRank - rightRank;
  });
}

/**
 * @param {object[]} recipes         toutes les recettes
 * @param {object[]} slots           les 14 créneaux : `{ dayIndex, slot, recipeId }`
 * @param {object}   filters         `{ diet, constraints[], quick, season, stock, scope }`
 * @param {number}   currentMonth    mois courant (1–12), pour « de saison »
 * @param {Map}      stockByRecipeId état de stock par recette (vide si l'inventaire n'est pas lié)
 * @param {Function} random          injectable pour les tests
 * @returns {{ entries: object[], stockCount: number, otherCount: number, stockAsked: boolean }}
 *   `entries` : `{ dayIndex, slot, recipeId, fromStock }` — uniquement les créneaux à écrire.
 */
export function buildFillPlan({
  recipes = [],
  slots = [],
  filters = {},
  currentMonth = 1,
  stockByRecipeId = new Map(),
  random = Math.random,
} = {}) {
  const stockAsked = Boolean(filters.stock);
  const empty = { entries: [], stockCount: 0, otherCount: 0, stockAsked };
  const baseFilters = {
    diet: filters.diet || "",
    constraints: Array.isArray(filters.constraints) ? filters.constraints : [],
    quick: Boolean(filters.quick),
    season: Boolean(filters.season),
    stock: false,
  };
  const targets = filters.scope === "all" ? slots : slots.filter((entry) => !entry.recipeId);
  if (!targets.length) return empty;

  const pool = filterPool(recipes, baseFilters, { currentMonth, stockByRecipeId });
  if (!pool.length) return empty;

  // « Avec mon stock » trie au lieu d'exclure : les recettes faisables passent
  // devant, les autres complètent la semaine. Une contrainte qui exclut aurait
  // laissé des créneaux vides dès que le stock est maigre — et rien à l'écran ne
  // l'aurait expliqué. La vue annonce le partage dans un bilan après le tirage.
  const isReady = (recipe) => Boolean(stockByRecipeId?.get(recipe.id)?.ready);
  const ready = stockAsked ? pool.filter(isReady) : [];
  const others = stockAsked ? pool.filter((recipe) => !isReady(recipe)) : pool;
  const ordered = [...drawOrder(ready, random), ...drawOrder(others, random)];

  // Pas de doublon dans la semaine : ce qui reste en place compte déjà comme tiré.
  const untouched = new Set(
    slots
      .filter((entry) => entry.recipeId && !targets.includes(entry))
      .map((entry) => entry.recipeId),
  );
  const queue = ordered.filter((recipe) => !untouched.has(recipe.id));

  const entries = targets.slice(0, queue.length).map((entry, index) => ({
    dayIndex: entry.dayIndex,
    slot: entry.slot,
    recipeId: queue[index].id,
    fromStock: stockAsked && isReady(queue[index]),
  }));

  return {
    entries,
    stockCount: entries.filter((entry) => entry.fromStock).length,
    otherCount: entries.filter((entry) => !entry.fromStock).length,
    stockAsked,
  };
}

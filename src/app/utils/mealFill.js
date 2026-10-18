/**
 * Tirage automatique de la semaine (feuille « Remplir » de l'onglet Repas).
 *
 * Le tirage ne touche jamais l'état directement : il renvoie un plan
 * (`{ dayIndex, slot, role, recipeId }`) que la vue applique service par
 * service via `onUpdateMeal`. C'est ce qui le rend testable.
 */
import { isQuickRecipe, matchesAvailability, matchesConstraints, matchesDiet } from "./recipeFilters.js";
import { createStockLedger, takeFromLedger } from "./recipeStock.js";

/** Les trois services d'un créneau, dans l'ordre où ils arrivent à table. */
export const FILL_COURSES = ["starter", "main", "dessert"];

/** Services cochés au premier lancement : un plat, rien d'autre. */
export const DEFAULT_FILL_COURSES = { starter: false, main: true, dessert: false };

/* Catégories de recettes piochées pour chaque service. Le plat accepte aussi
   les recettes sans catégorie : beaucoup de recettes importées n'en portent
   pas, et les exclure viderait le tirage chez qui n'a jamais rangé sa
   bibliothèque. Les autres catégories (boisson, petit-déjeuner, fait maison)
   ne sont pas des services : elles ne sortent jamais au tirage. */
const COURSE_CATEGORIES = {
  starter: ["starter"],
  main: ["main", ""],
  dessert: ["dessert"],
};

/** Champ de créneau qui porte chaque service (cf. `slotFields` de MealsView). */
const ROLE_FIELDS = {
  starter: "starterRecipeId",
  main: "recipeId",
  dessert: "dessertRecipeId",
};

/** La recette déjà posée sur ce service du créneau, s'il y en a une. */
function slotRoleId(slot, course) {
  return slot?.[ROLE_FIELDS[course]] || "";
}

function filterPool(recipes, course, { diet, constraints, quick, season }, { currentMonth }) {
  const categories = COURSE_CATEGORIES[course] || [];
  return recipes.filter((recipe) => {
    if (!recipe?.id) return false;
    if (!categories.includes(recipe.category || "")) return false;
    if (!matchesDiet(recipe, diet)) return false;
    if (!matchesConstraints(recipe, constraints)) return false;
    if (quick && !isQuickRecipe(recipe)) return false;
    if (season && !matchesAvailability(recipe, currentMonth)) return false;
    return true;
  });
}

/** Mélange : deux « Remplir » de suite ne doivent pas donner la même semaine. */
function shuffle(pool, random) {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Les services cochés, dans l'ordre du repas. Jamais aucun : décocher le
 * dernier ramène le plat, sinon le bouton promettrait de remplir des créneaux
 * sans rien y mettre.
 */
export function normalizeCourses(courses) {
  const source = courses || DEFAULT_FILL_COURSES;
  const picked = FILL_COURSES.filter((course) => Boolean(source[course]));
  return picked.length ? picked : ["main"];
}

/**
 * @param {object[]} recipes         toutes les recettes
 * @param {object[]} slots           les 14 créneaux : `{ dayIndex, slot, recipeId, text,
 *                                   starterRecipeId, dessertRecipeId, cooked }`
 * @param {object}   filters         `{ diet, constraints[], courses{}, quick, season, stock, scope }`
 * @param {number}   currentMonth    mois courant (1–12), pour « de saison »
 * @param {Map}      stockByRecipeId état de stock par recette face au stock COMPLET (vide si
 *                                   l'inventaire n'est pas lié) — ne sert plus qu'à ordonner la
 *                                   file (les recettes qui ont l'air faisables passent devant) ;
 *                                   la vérité finale (`fromStock`) vient du budget partagé ci-dessous.
 * @param {object[]} inventory       inventaire brut, pour le budget partagé entre tous les services
 *                                   tirés dans ce même appel (voir plus bas)
 * @param {Function} random          injectable pour les tests
 * @returns {{ entries: object[], slotCount: number, stockCount: number, otherCount: number,
 *            stockAsked: boolean, emptyCourses: string[] }}
 *   `entries` : `{ dayIndex, slot, role, recipeId, fromStock }` — uniquement ce qui est à écrire.
 *   `emptyCourses` : les services dont aucun candidat n'a survécu aux filtres.
 */
export function buildFillPlan({
  recipes = [],
  slots = [],
  filters = {},
  currentMonth = 1,
  stockByRecipeId = new Map(),
  inventory = [],
  random = Math.random,
} = {}) {
  const stockAsked = Boolean(filters.stock);
  const courses = normalizeCourses(filters.courses);
  const baseFilters = {
    diet: filters.diet || "",
    constraints: Array.isArray(filters.constraints) ? filters.constraints : [],
    quick: Boolean(filters.quick),
    season: Boolean(filters.season),
  };
  const empty = { entries: [], slotCount: 0, stockCount: 0, otherCount: 0, stockAsked, emptyCourses: [] };

  // Portée « cases vides » : un créneau déjà prévu — recette ou texte libre —
  // n'est pas touché du tout.
  const targets = filters.scope === "all" ? slots : slots.filter((slot) => !slot.recipeId && !slot.text);
  if (!targets.length) return empty;

  const isReady = (recipe) => Boolean(stockByRecipeId?.get(recipe.id)?.ready);
  const entries = [];
  const emptyCourses = [];

  /* Un seul budget de stock pour tout le tirage, comme `computeWeekStock` :
     deux services qui piochent dans le même produit — ou la même recette
     recyclée faute de mieux — ne doivent pas se croire chacun faisables avec
     le stock entier. Parti de l'inventaire, entamé par tout ce qui reste en
     place ailleurs dans la semaine (un créneau déjà cuisiné ne compte pas :
     l'inventaire porte déjà sa déduction). */
  let ledger = null;
  if (stockAsked) {
    ledger = createStockLedger(inventory);
    const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
    const targetedSlots = new Map(courses.map((course) => [
      course,
      new Set(filters.scope === "all" ? targets : targets.filter((slot) => !slotRoleId(slot, course))),
    ]));
    slots.forEach((slot) => {
      if (slot.cooked) return;
      FILL_COURSES.forEach((course) => {
        if (targetedSlots.get(course)?.has(slot)) return; // sera écrasé par ce tirage
        const existingId = slotRoleId(slot, course);
        if (!existingId) return;
        const recipe = recipeById.get(existingId);
        (Array.isArray(recipe?.ingredients) ? recipe.ingredients : [])
          .filter((item) => item?.name)
          .forEach((ingredient) => takeFromLedger(ledger, ingredient));
      });
    });
  }

  courses.forEach((course) => {
    // En portée « cases vides », une entrée ou un dessert déjà choisi reste en
    // place même si le plat du créneau, lui, est à tirer.
    const roleTargets = filters.scope === "all"
      ? targets
      : targets.filter((slot) => !slotRoleId(slot, course));
    if (!roleTargets.length) return;

    const pool = filterPool(recipes, course, baseFilters, { currentMonth });
    if (!pool.length) {
      emptyCourses.push(course);
      return;
    }

    // « Avec mon stock » trie au lieu d'exclure : les recettes faisables passent
    // devant, les autres complètent la semaine. Une contrainte qui exclut aurait
    // laissé des créneaux vides dès que le stock est maigre — et rien à l'écran ne
    // l'aurait expliqué. La vue annonce le partage dans un bilan après le tirage.
    const ready = stockAsked ? pool.filter(isReady) : [];
    const others = stockAsked ? pool.filter((recipe) => !isReady(recipe)) : pool;
    const ordered = [...shuffle(ready, random), ...shuffle(others, random)];

    // Pas de doublon dans la semaine : ce qui reste en place compte déjà comme tiré.
    const untouched = new Set(
      slots
        .filter((slot) => !roleTargets.includes(slot))
        .map((slot) => slotRoleId(slot, course))
        .filter(Boolean),
    );
    const fresh = ordered.filter((recipe) => !untouched.has(recipe.id));
    // Une bibliothèque plus courte que la semaine finit par se répéter : on
    // recycle dans le même ordre plutôt que de laisser des cases vides, ce que
    // le compteur du bouton a déjà promis de remplir.
    const queue = fresh.length ? fresh : ordered;

    roleTargets.forEach((slot, index) => {
      const recipe = queue[index % queue.length];
      /* `isReady` n'a servi qu'à ordonner la file plus haut — un recyclage
         (bibliothèque trop courte) ou un produit partagé avec un autre
         service peut très bien vider ce que ce premier passage croyait
         disponible. Seul le budget partagé, puisé pour de vrai à la pose,
         décide si CETTE pose précise est couverte. */
      let fromStock = false;
      if (ledger) {
        const ingredients = (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).filter((item) => item?.name);
        const shortfalls = ingredients.map((ingredient) => takeFromLedger(ledger, ingredient)).filter(Boolean);
        fromStock = ingredients.length > 0 && shortfalls.length === 0;
      }
      entries.push({
        dayIndex: slot.dayIndex,
        slot: slot.slot,
        role: course,
        recipeId: recipe.id,
        fromStock,
      });
    });
  });

  return {
    entries,
    slotCount: new Set(entries.map((entry) => `${entry.dayIndex}-${entry.slot}`)).size,
    stockCount: entries.filter((entry) => entry.fromStock).length,
    otherCount: entries.filter((entry) => !entry.fromStock).length,
    stockAsked,
    emptyCourses,
  };
}

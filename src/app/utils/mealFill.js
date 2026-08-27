/**
 * Tirage automatique de la semaine (feuille « Remplir » de l'onglet Repas).
 *
 * Le tirage ne touche jamais l'état directement : il renvoie un plan
 * (`{ dayIndex, slot, role, recipeId }`) que la vue applique service par
 * service via `onUpdateMeal`. C'est ce qui le rend testable.
 */
import { isQuickRecipe, matchesAvailability, matchesConstraints, matchesDiet } from "./recipeFilters.js";

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

/**
 * « Omnivore » n'est pas une contrainte, c'est l'absence de contrainte : un
 * omnivore mange aussi les plats végé. Le traiter comme un label rendrait une
 * semaine vide à tous ceux qui n'ont jamais coché « omnivore » sur leurs
 * recettes — c'est-à-dire presque tout le monde, puisque c'est le régime par
 * défaut de la feuille.
 */
function matchesFillDiet(recipe, diet) {
  if (!diet || diet === "omnivore") return true;
  return matchesDiet(recipe, diet);
}

function filterPool(recipes, course, { diet, constraints, quick, season }, { currentMonth }) {
  const categories = COURSE_CATEGORIES[course] || [];
  return recipes.filter((recipe) => {
    if (!recipe?.id) return false;
    if (!categories.includes(recipe.category || "")) return false;
    if (!matchesFillDiet(recipe, diet)) return false;
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
 *                                   starterRecipeId, dessertRecipeId }`
 * @param {object}   filters         `{ diet, constraints[], courses{}, quick, season, stock, scope }`
 * @param {number}   currentMonth    mois courant (1–12), pour « de saison »
 * @param {Map}      stockByRecipeId état de stock par recette (vide si l'inventaire n'est pas lié)
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
      entries.push({
        dayIndex: slot.dayIndex,
        slot: slot.slot,
        role: course,
        recipeId: recipe.id,
        fromStock: stockAsked && isReady(recipe),
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

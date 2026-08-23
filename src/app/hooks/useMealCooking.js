// Cuisson d'un créneau de repas, et la déduction de stock qui va avec.
//
// Extrait d'`App.js` : c'était le plus gros bloc de logique métier resté dans
// l'orchestrateur (~170 lignes). Il n'y avait aucune raison qu'il y vive, et
// une raison nette de l'en sortir : `computeMealCookState` est une fonction
// **pure** (elle reçoit l'état, elle renvoie le suivant), donc testable sans
// React ni navigateur dès qu'elle n'est plus enfermée dans un composant.
//
// Règles produit gardées ici, et à ne pas assouplir sans décision explicite :
//   - la déduction n'a lieu que si `linkMealsToInventory` est vrai ;
//   - seuls les ingrédients **principaux** sont déduits, jamais les condiments ;
//   - une déduction partielle ne doit jamais passer pour complète — d'où
//     `shortfalls`, qui nomme ce qui a manqué ;
//   - comparaison et déduction rapprochent les produits de la même façon que
//     `utils/recipeStock.js` : même clé produit, mêmes conversions d'unités.

import { createMealShell } from "../utils/state.js";
import { productMatchKey, toBaseQuantity, fromBaseQuantity } from "../utils/units.js";
import { formatQuantityUnit } from "../utils/productUtils.js";

/**
 * Repas d'un jour dans une semaine donnée.
 *
 * Même logique que `matchMeal` dans `useMeals` : un repas sans `weekKey` est un
 * repas d'avant l'introduction des semaines, il matche donc n'importe quelle
 * semaine nommée. Les deux copies doivent rester d'accord — si tu changes
 * celle-ci, change l'autre.
 */
function mealMatcher(day, weekKey) {
  return (meal) => {
    if (meal.day !== day) return false;
    const mealWeek = meal.weekKey || "";
    return mealWeek === weekKey || (mealWeek === "" && weekKey !== "");
  };
}

/** Champs `cooked` / `recipeId` du sous-créneau visé (entrée, plat, dessert). */
function slotKeys(slot, subSlot) {
  const isLunch = slot === "lunch";
  if (subSlot === "starter") {
    return {
      cookedKey: isLunch ? "lunchStarterCooked" : "dinnerStarterCooked",
      recipeKey: isLunch ? "lunchStarterRecipeId" : "dinnerStarterRecipeId",
    };
  }
  if (subSlot === "dessert") {
    return {
      cookedKey: isLunch ? "lunchDessertCooked" : "dinnerDessertCooked",
      recipeKey: isLunch ? "lunchDessertRecipeId" : "dinnerDessertRecipeId",
    };
  }
  return {
    cookedKey: isLunch ? "lunchCooked" : "dinnerCooked",
    recipeKey: isLunch ? "lunchRecipeId" : "dinnerRecipeId",
  };
}

/**
 * Bascule l'état cuisiné d'un créneau et calcule l'inventaire qui en résulte.
 *
 * Fonction **pure** : ne touche à rien, renvoie ce qu'il faudrait écrire.
 *
 * @returns {null | {
 *   meals: object[], inventory: object[], nextCooked: boolean,
 *   recipeId: string, deductedAny: boolean,
 *   shortfalls: {name: string, quantity: string, unit: string}[],
 * }}
 *   `null` si le créneau est introuvable — l'appelant ne doit alors rien écrire.
 */
export function computeMealCookState(previous, day, slot, weekKey, subSlot) {
  const week = weekKey || "";
  const sub = subSlot || "main";
  const matchFn = mealMatcher(day, week);

  const existing = previous.meals.find(matchFn);
  const baseMeals = existing
    ? [...previous.meals]
    : [...previous.meals, createMealShell(day, previous.meals.length, week)];

  const targetMeal = baseMeals.find(matchFn);
  if (!targetMeal) return null;

  const { cookedKey, recipeKey } = slotKeys(slot, sub);
  const nextCooked = !targetMeal[cookedKey];
  const recipeId = targetMeal[recipeKey];

  let nextInventory = previous.inventory;
  let deductedAny = false;
  /* Produits que le stock connaissait mais n'a pas couverts jusqu'au bout.
     Sans ça, la déduction ramenait l'article à zéro en annonçant « bien
     déduits » : le manque disparaissait sans que personne ne le voie. Les
     produits totalement absents de l'inventaire n'entrent pas ici — c'est le
     rôle de la comparaison recette / courses, pas de la cuisson. */
  const shortfalls = [];

  if (Boolean(previous.linkMealsToInventory) && nextCooked && recipeId) {
    const recipe = (previous.recipes || []).find((entry) => entry.id === recipeId);
    const recipeIngredients = Array.isArray(recipe?.ingredients)
      ? recipe.ingredients.filter((item) => item?.name)
      : [];

    nextInventory = [...previous.inventory];
    recipeIngredients.forEach((ingredient) => {
      const ingredientKey = productMatchKey(ingredient.name);
      const ingredientBase = toBaseQuantity(ingredient.quantity, ingredient.unit);
      if (!ingredientKey || !ingredientBase) return;

      let remainingToDeduct = ingredientBase.value;
      let productWasInStock = false;
      nextInventory = nextInventory.map((item) => {
        if (productMatchKey(item.name) !== ingredientKey) return item;
        if (item.stockState !== "empty") productWasInStock = true;
        if (remainingToDeduct <= 0) return item;
        const itemBase = toBaseQuantity(item.quantity, item.unit);
        if (!itemBase || itemBase.kind !== ingredientBase.kind || itemBase.value <= 0) return item;

        const consumed = Math.min(itemBase.value, remainingToDeduct);
        if (consumed > 0) deductedAny = true;
        remainingToDeduct -= consumed;
        const nextQtyBase = itemBase.value - consumed;

        return {
          ...item,
          quantity: nextQtyBase > 0 ? fromBaseQuantity(nextQtyBase, item.unit || ingredient.unit) : "0",
          stockState: nextQtyBase > 0 ? "in_stock" : "empty",
          needsRestock: nextQtyBase <= 0,
        };
      });

      if (productWasInStock && remainingToDeduct > 0) {
        shortfalls.push({
          name: ingredient.name,
          quantity: fromBaseQuantity(remainingToDeduct, ingredient.unit),
          unit: ingredient.unit || "",
        });
      }
    });
  }

  return {
    meals: baseMeals.map((meal) => (matchFn(meal) ? { ...meal, weekKey: week, [cookedKey]: nextCooked } : meal)),
    inventory: nextInventory,
    nextCooked,
    recipeId,
    deductedAny,
    shortfalls,
  };
}

/** Message du toast de déduction. Séparé pour être testable tel quel. */
export function deductionToastMessage({ shortfalls = [], deductedAny = false } = {}) {
  if (shortfalls.length) {
    const named = shortfalls
      .slice(0, 2)
      .map((item) => {
        const amount = formatQuantityUnit(item.quantity, item.unit);
        return amount ? `${item.name} (${amount})` : item.name;
      })
      .join(", ");
    const extra = shortfalls.length - 2;
    return {
      text: `Stock trop juste : il manquait ${named}${extra > 0 ? ` et ${extra} autre${extra > 1 ? "s" : ""}` : ""}`,
      duration: 5000,
      undoable: true,
    };
  }
  if (deductedAny) {
    return {
      text: "Les ingrédients ont bien été déduits de votre inventaire",
      duration: 3000,
      undoable: true,
    };
  }
  return {
    text: "Aucun ingrédient de cette recette n'a été trouvé dans l'inventaire",
    duration: 3000,
    undoable: false,
  };
}

/**
 * @param {object}   deps
 * @param {object}   deps.state         état planner courant
 * @param {Function} deps.updateState
 * @param {Function} deps.showToast     (message, action, duration)
 * @param {Function} deps.dismissToast  ferme le toast courant (annulation)
 */
export function useMealCooking({ state, updateState, showToast, dismissToast }) {
  function handleToggleMealsInventoryLink(enabled) {
    updateState((previous) => ({
      ...previous,
      linkMealsToInventory: Boolean(enabled),
    }));
  }

  function handleToggleCookWithInventory(day, slot, weekKey, subSlot) {
    const week = weekKey || "";
    const sub = subSlot || "main";
    const beforeInventory = state.inventory;
    const computed = computeMealCookState(state, day, slot, week, sub);
    if (!computed) return;

    /* Recalculé dans le producteur : entre la lecture ci-dessus et l'écriture,
       une synchro Firestore a pu changer l'état. Le premier calcul ne sert qu'à
       décider du message. */
    updateState((previous) => {
      const recomputed = computeMealCookState(previous, day, slot, week, sub);
      return recomputed
        ? { ...previous, meals: recomputed.meals, inventory: recomputed.inventory }
        : previous;
    });

    if (!(Boolean(state.linkMealsToInventory) && computed.nextCooked && computed.recipeId)) return;

    function undoCook() {
      updateState((previous) => {
        const matchFn = mealMatcher(day, week);
        const existing = previous.meals.find(matchFn);
        const baseMeals = existing
          ? [...previous.meals]
          : [...previous.meals, createMealShell(day, previous.meals.length, week)];
        const { cookedKey } = slotKeys(slot, sub);
        return {
          ...previous,
          meals: baseMeals.map((meal) => (matchFn(meal) ? { ...meal, [cookedKey]: false } : meal)),
          inventory: beforeInventory,
        };
      });
      dismissToast();
    }

    const message = deductionToastMessage(computed);
    showToast(
      message.text,
      message.undoable ? { label: "Annuler", onClick: undoCook } : null,
      message.duration,
    );
  }

  return { handleToggleCookWithInventory, handleToggleMealsInventoryLink };
}

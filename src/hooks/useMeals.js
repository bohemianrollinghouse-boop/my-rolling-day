import { createMealShell } from "../utils/state.js";
import { DEMO_RECIPES } from "../data/demoRecipes.js";

function normalizeRecipeIngredient(item, index) {
  return {
    id: item?.id || `ingr-${Date.now()}-${index}`,
    name: String(item?.name || item?.text || "").trim(),
    quantity: String(item?.quantity || "").trim(),
    unit: String(item?.unit || "").trim(),
  };
}

function normalizeIncomingRecipe(recipe) {
  const rawIngredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.filter((item) => item?.kind !== "pantry")
    : [];
  return {
    id: recipe.id || `recipe-${Date.now()}`,
    name: String(recipe.name || "").trim(),
    servings: Math.max(1, Math.min(24, Number(recipe.servings || recipe.peopleCount || recipe.serves || 4) || 4)),
    category: String(recipe.category || ""),
    quick: Boolean(recipe.quick),
    prepTime: String(recipe.prepTime || ""),
    cookTime: String(recipe.cookTime || ""),
    availabilityMode: recipe.availabilityMode || "all_year",
    season: recipe.season || "",
    seasons: Array.isArray(recipe.seasons) ? [...new Set(recipe.seasons.map((value) => String(value || "").trim()).filter(Boolean))] : [],
    months: Array.isArray(recipe.months) ? recipe.months.map((value) => Number(value)).filter((value) => value >= 1 && value <= 12) : [],
    labels: Array.isArray(recipe.labels) ? [...new Set(recipe.labels.map((value) => String(value || "").trim()).filter(Boolean))] : [],
    ingredients: rawIngredients.map(normalizeRecipeIngredient).filter((item) => item.name),
    ingredientsLegacy: typeof recipe.ingredients === "string" ? String(recipe.ingredients).trim() : String(recipe.ingredientsLegacy || "").trim(),
    condiments: Array.isArray(recipe.condiments) ? recipe.condiments.map((s) => String(s).trim()).filter(Boolean) : [],
    method: String(recipe.method || "").trim(),
    photo: String(recipe.photo || ""),
  };
}

function matchMeal(meal, day, weekKey) {
  if (meal.day !== day) return false;
  const mwk = meal.weekKey || "";
  const wk = weekKey || "";
  // Compat : anciens repas sans weekKey → semaine courante (weekKey vide ou non)
  return mwk === wk || (mwk === "" && wk !== "");
}

export function useMeals(updateState) {
  function handleUpdateMeal(day, slot, values, weekKey) {
    const wk = weekKey || "";
    updateState((previous) => {
      const existing = previous.meals.find((meal) => matchMeal(meal, day, wk));
      const meals = existing
        ? [...previous.meals]
        : [...previous.meals, createMealShell(day, previous.meals.length, wk)];
      return {
        ...previous,
        meals: meals.map((meal) => {
          if (!matchMeal(meal, day, wk)) return meal;
          const recipeKey  = slot === "lunch" ? "lunchRecipeId"        : "dinnerRecipeId";
          const textKey    = slot === "lunch" ? "lunchText"            : "dinnerText";
          const modeKey    = slot === "lunch" ? "lunchMode"            : "dinnerMode";
          const cookedKey  = slot === "lunch" ? "lunchCooked"          : "dinnerCooked";
          const starterKey = slot === "lunch" ? "lunchStarterRecipeId" : "dinnerStarterRecipeId";
          const dessertKey = slot === "lunch" ? "lunchDessertRecipeId" : "dinnerDessertRecipeId";
          const extraKey   = slot === "lunch" ? "lunchExtra"           : "dinnerExtra";
          const clearingRecipe = values.recipeId === "";
          return {
            ...meal,
            weekKey: wk,
            [recipeKey]:  values.recipeId  ?? meal[recipeKey],
            [textKey]:    values.text      ?? meal[textKey],
            [modeKey]:    values.recipeId ? "recipe" : values.text ? "free" : meal[modeKey],
            [cookedKey]:  clearingRecipe ? false : meal[cookedKey],
            [starterKey]: values.starterRecipeId ?? meal[starterKey],
            [dessertKey]: values.dessertRecipeId ?? meal[dessertKey],
            [extraKey]:   values.extra     ?? meal[extraKey],
          };
        }),
      };
    });
  }

  function handleToggleCook(day, slot, weekKey) {
    const wk = weekKey || "";
    updateState((previous) => {
      const existing = previous.meals.find((meal) => matchMeal(meal, day, wk));
      const meals = existing
        ? [...previous.meals]
        : [...previous.meals, createMealShell(day, previous.meals.length, wk)];
      return {
        ...previous,
        meals: meals.map((meal) => {
          if (!matchMeal(meal, day, wk)) return meal;
          const cookedKey = slot === "lunch" ? "lunchCooked" : "dinnerCooked";
          return { ...meal, weekKey: wk, [cookedKey]: !meal[cookedKey] };
        }),
      };
    });
  }

  function handleAddRecipe(recipe) {
    if (!recipe.name.trim()) return;
    updateState((previous) => ({
      ...previous,
      recipes: [
        ...previous.recipes,
        normalizeIncomingRecipe(recipe),
      ],
    }));
  }

  function handleUpdateRecipe(recipeId, recipe) {
    if (!recipeId || !recipe?.name?.trim()) return;
    updateState((previous) => ({
      ...previous,
      recipes: previous.recipes.map((entry) =>
        entry.id === recipeId
          ? { ...normalizeIncomingRecipe({ ...entry, ...recipe, id: recipeId }), id: recipeId }
          : entry,
      ),
    }));
  }

  function handleDeleteRecipe(recipeId) {
    updateState((previous) => ({
      ...previous,
      recipes: previous.recipes.filter((recipe) => recipe.id !== recipeId),
      meals: previous.meals.map((meal) => ({
        ...meal,
        lunchRecipeId: meal.lunchRecipeId === recipeId ? "" : meal.lunchRecipeId,
        dinnerRecipeId: meal.dinnerRecipeId === recipeId ? "" : meal.dinnerRecipeId,
      })),
    }));
  }

  function handleLoadDemoRecipes() {
    updateState((previous) => {
      const existingIds = new Set((previous.recipes || []).map((r) => r.id));
      const toAdd = DEMO_RECIPES.filter((r) => !existingIds.has(r.id)).map(normalizeIncomingRecipe);
      if (!toAdd.length) return previous;
      return { ...previous, recipes: [...previous.recipes, ...toAdd] };
    });
  }

  return { handleUpdateMeal, handleToggleCook, handleAddRecipe, handleUpdateRecipe, handleDeleteRecipe, handleLoadDemoRecipes };
}

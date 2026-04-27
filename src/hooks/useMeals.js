import { createMealShell } from "../utils/state.js?v=2026-04-26-storage-location-fix-1";
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
    availabilityMode: recipe.availabilityMode || "all_year",
    season: recipe.season || "",
    seasons: Array.isArray(recipe.seasons) ? [...new Set(recipe.seasons.map((value) => String(value || "").trim()).filter(Boolean))] : [],
    months: Array.isArray(recipe.months) ? recipe.months.map((value) => Number(value)).filter((value) => value >= 1 && value <= 12) : [],
    labels: Array.isArray(recipe.labels) ? [...new Set(recipe.labels.map((value) => String(value || "").trim()).filter(Boolean))] : [],
    ingredients: rawIngredients.map(normalizeRecipeIngredient).filter((item) => item.name),
    ingredientsLegacy: typeof recipe.ingredients === "string" ? String(recipe.ingredients).trim() : String(recipe.ingredientsLegacy || "").trim(),
    condiments: Array.isArray(recipe.condiments) ? recipe.condiments.map((s) => String(s).trim()).filter(Boolean) : [],
    method: String(recipe.method || "").trim(),
  };
}

export function useMeals(updateState) {
  function handleUpdateMeal(day, slot, values) {
    updateState((previous) => {
      const existing = previous.meals.find((meal) => meal.day === day);
      const meals = existing ? [...previous.meals] : [...previous.meals, createMealShell(day, previous.meals.length)];
      return {
        ...previous,
        meals: meals.map((meal) => {
          if (meal.day !== day) return meal;
          const recipeKey = slot === "lunch" ? "lunchRecipeId" : "dinnerRecipeId";
          const textKey = slot === "lunch" ? "lunchText" : "dinnerText";
          const modeKey = slot === "lunch" ? "lunchMode" : "dinnerMode";
          return {
            ...meal,
            [recipeKey]: values.recipeId ?? meal[recipeKey],
            [textKey]: values.text ?? meal[textKey],
            [modeKey]: values.recipeId ? "recipe" : values.text ? "free" : meal[modeKey],
          };
        }),
      };
    });
  }

  function handleToggleCook(day, slot) {
    updateState((previous) => {
      const existing = previous.meals.find((meal) => meal.day === day);
      const meals = existing ? [...previous.meals] : [...previous.meals, createMealShell(day, previous.meals.length)];
      return {
        ...previous,
        meals: meals.map((meal) => {
          if (meal.day !== day) return meal;
          const cookedKey = slot === "lunch" ? "lunchCooked" : "dinnerCooked";
          return { ...meal, [cookedKey]: !meal[cookedKey] };
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

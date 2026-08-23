// Import de recettes depuis une URL — appels vers le codebase Python « recipes »
// (functions-py/main.py : scrape_recipe puis categorize_recipe).

import { httpsCallable } from "firebase/functions";
import { functions } from "./core.js";

/**
 * Étape 1 : extrait la recette brute d'une page web (recipe-scrapers).
 * @returns {Promise<{title, ingredients: string[], instructions, yields,
 *   prep_time_min, cook_time_min, total_time_min, host, image_data_url}>}
 */
export async function scrapeRecipeFromUrl(url) {
  const callable = httpsCallable(functions, "scrape_recipe", { timeout: 65000 });
  const { data } = await callable({ url });
  return data;
}

/**
 * Étape 2 : catégorise la recette via l'IA (catégorie, régime, contraintes,
 * rapide, saisonnalité, ingrédients normalisés).
 */
export async function categorizeRecipe(recipe) {
  const callable = httpsCallable(functions, "categorize_recipe", { timeout: 125000 });
  const { data } = await callable({ recipe });
  return data;
}

/** Message d'erreur lisible pour l'UI d'import. */
export function importErrorMessage(error) {
  const code = String(error?.code || "");
  if (code.includes("unauthenticated")) return "Connecte-toi pour importer une recette.";
  if (code.includes("invalid-argument")) return error?.message || "Lien invalide.";
  if (code.includes("not-found")) return "Aucune recette détectée sur cette page.";
  if (code.includes("unavailable")) return "Impossible de charger la page. Vérifie le lien.";
  if (code.includes("failed-precondition")) return error?.message || "Configuration serveur manquante.";
  if (code.includes("deadline-exceeded")) return "Le site met trop de temps à répondre. Réessaie.";
  return error?.message || "L'import a échoué. Réessaie.";
}

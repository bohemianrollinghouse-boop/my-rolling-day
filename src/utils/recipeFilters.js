/**
 * Lecture des critères d'une recette : saisonnalité, durée, régime.
 *
 * Ces règles étaient recopiées dans MealsView et RecipesView. La grille semaine,
 * le sélecteur de recettes et le tirage automatique s'appuient tous les trois
 * dessus : elles vivent ici pour que « de saison » veuille dire la même chose
 * partout.
 */

export const SEASONS = [
  { id: "spring", label: "Printemps", months: [3, 4, 5] },
  { id: "summer", label: "Été", months: [6, 7, 8] },
  { id: "autumn", label: "Automne", months: [9, 10, 11] },
  { id: "winter", label: "Hiver", months: [12, 1, 2] },
];

export const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/** Au-delà, une recette n'est plus « rapide » (libellé du sélecteur : 20 min ou moins). */
export const QUICK_MAX_MINUTES = 20;

export function seasonById(seasonId) {
  return SEASONS.find((season) => season.id === seasonId) || SEASONS[0];
}

function uniqueMonths(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((value) => value >= 1 && value <= 12))];
}

/** Mois (1–12) où la recette est disponible. */
export function recipeMonths(recipe) {
  if (recipe?.availabilityMode === "all_year") return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (recipe?.availabilityMode === "season") {
    if (Array.isArray(recipe.months) && recipe.months.length) return uniqueMonths(recipe.months);
    const ids = Array.isArray(recipe.seasons) && recipe.seasons.length ? recipe.seasons : [recipe.season || "spring"];
    return uniqueMonths(ids.flatMap((id) => seasonById(id).months || []));
  }
  return uniqueMonths(recipe?.months);
}

/** La recette est-elle disponible ce mois-ci ? */
export function matchesAvailability(recipe, currentMonth) {
  return recipeMonths(recipe).includes(Number(currentMonth));
}

/**
 * Période visée par le filtre « de saison » : le mois courant par défaut, mais
 * on peut viser une saison (`season:summer`) ou un mois précis (`month:3`) —
 * indispensable pour préparer une semaine à l'avance ou piocher dans les
 * recettes d'une autre saison.
 */
export function matchesPeriod(recipe, period, currentMonth) {
  if (!period || period === "current") return matchesAvailability(recipe, currentMonth);
  if (period.startsWith("season:")) {
    const months = seasonById(period.slice("season:".length)).months;
    return recipeMonths(recipe).some((month) => months.includes(month));
  }
  if (period.startsWith("month:")) return recipeMonths(recipe).includes(Number(period.slice("month:".length)));
  return true;
}

/** « août » · « été » · « mars » — pour le sous-titre et la pastille de rappel. */
export function periodLabel(period, currentMonth) {
  if (!period || period === "current") return MONTH_NAMES[currentMonth - 1].toLowerCase();
  if (period.startsWith("season:")) return seasonById(period.slice("season:".length)).label.toLowerCase();
  if (period.startsWith("month:")) return MONTH_NAMES[Number(period.slice("month:".length)) - 1].toLowerCase();
  return "";
}

/** « en août » · « au printemps » — seul le printemps prend « au ». */
export function periodPhrase(period, currentMonth) {
  const label = periodLabel(period, currentMonth);
  return `${label === "printemps" ? "au" : "en"} ${label}`;
}

/** Préparation + cuisson, en minutes. 0 quand la recette ne dit rien. */
export function recipeTotalMinutes(recipe) {
  const prep = Number(recipe?.prepTime) || 0;
  const cook = Number(recipe?.cookTime) || 0;
  const total = prep + cook;
  if (total > 0) return total;
  return Number(recipe?.time) || 0;
}

export function isQuickRecipe(recipe) {
  if (recipe?.quick) return true;
  const total = recipeTotalMinutes(recipe);
  return total > 0 && total <= QUICK_MAX_MINUTES;
}

/** « 25 min » — null quand la durée est inconnue. */
export function durationLabel(recipe) {
  const total = recipeTotalMinutes(recipe);
  return total > 0 ? `${total} min` : null;
}

/** Le texte dans lequel cherche le champ de recherche du sélecteur. */
export function recipeSearchText(recipe, categoryLabel = "") {
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients.map((item) => item?.name || "").join(" ") : "";
  const condiments = Array.isArray(recipe?.condiments) ? recipe.condiments.join(" ") : "";
  return `${recipe?.name || ""} ${ingredients} ${recipe?.ingredientsLegacy || ""} ${condiments} ${categoryLabel}`.toLowerCase();
}

/** Les badges alimentaires sont tous dans `labels` (régime et contraintes mêlés). */
export function recipeLabels(recipe) {
  return Array.isArray(recipe?.labels) ? recipe.labels : [];
}

export function matchesDiet(recipe, dietId) {
  if (!dietId) return true;
  return recipeLabels(recipe).includes(dietId);
}

export function matchesConstraints(recipe, constraintIds) {
  if (!Array.isArray(constraintIds) || !constraintIds.length) return true;
  const labels = recipeLabels(recipe);
  return constraintIds.every((id) => labels.includes(id));
}

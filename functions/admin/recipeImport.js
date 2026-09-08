/**
 * Import d'une recette dans le catalogue depuis la console admin.
 *
 * Le travail lourd (scraping, analyse IA) est fait par la fonction Python
 * `import_recipe` du codebase `recipes` — la meme chaine que l'app. Ce module
 * ne fait que deux choses :
 *   - appeler cette fonction avec un jeton d'identite Google (serveur a serveur) ;
 *   - transformer sa reponse en document Firestore, au meme format que
 *     `buildRecipePayload` dans `src/app/pages/recipes/RecipesView.js`.
 *
 * Le second point est une copie volontaire : `functions/` est deploye seul et
 * ne peut pas importer `src/`. Si le format de recette change cote app, il
 * change ici aussi.
 */

const DEFAULT_IMPORT_URL = "https://europe-west1-my-rolling-day.cloudfunctions.net/import_recipe";

// Copie de SEASONS (src/app/utils/recipeFilters.js)
const SEASONS = [
  { id: "spring", months: [3, 4, 5] },
  { id: "summer", months: [6, 7, 8] },
  { id: "autumn", months: [9, 10, 11] },
  { id: "winter", months: [12, 1, 2] },
];
const QUICK_MAX_MINUTES = 20;

function uniqueMonths(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((v) => v >= 1 && v <= 12))];
}

function seasonMonths(seasonId) {
  const season = SEASONS.find((s) => s.id === seasonId);
  return season ? season.months : [];
}

/** Meme regle que `availabilityFromMonths` : les mois font foi, le mode se deduit. */
function availabilityFromMonths(monthValues) {
  const list = uniqueMonths(monthValues);
  if (!list.length) return { availabilityMode: "all_year", season: "", seasons: [], months: [] };
  const set = new Set(list);
  const covered = SEASONS.filter((s) => s.months.every((m) => set.has(m)));
  const coveredMonths = new Set(covered.flatMap((s) => s.months));
  if (covered.length && coveredMonths.size === set.size) {
    const seasons = covered.map((s) => s.id);
    return { availabilityMode: "season", season: seasons[0], seasons, months: list };
  }
  return { availabilityMode: "months", season: "", seasons: [], months: list };
}

function monthsFromAnalysis(analysis) {
  if (!analysis) return [];
  if (analysis.availability_mode === "season") {
    return uniqueMonths((analysis.seasons || []).flatMap(seasonMonths));
  }
  if (analysis.availability_mode === "months") return uniqueMonths(analysis.months);
  return [];
}

function clampServings(value, fallback = 4) {
  const n = Number(value) || 0;
  return n >= 1 && n <= 24 ? n : fallback;
}

/**
 * Construit le document `recipes/{id}` a partir de la reponse de `import_recipe`.
 * `analysis` peut etre null (IA en echec) : la recette brute suffit, la
 * categorie et le regime restent a choisir — exactement le repli de l'app.
 */
function recipeDocFromImport({ url, scraped, analysis, now = new Date() }) {
  const s = scraped || {};
  const a = analysis || null;
  const stamp = now.getTime();

  const name = String((a && a.title_fr) || s.title || "").trim();
  const prep = Number(s.prep_time_min) || 0;
  const cook = Number(s.cook_time_min) || 0;
  const total = prep + cook;

  const servingsFromYields = parseInt(String(s.yields || "").match(/\d+/)?.[0] || "", 10);
  const servings = clampServings(a && a.servings, clampServings(servingsFromYields, 4));

  const aiIngredients = a && Array.isArray(a.ingredients) && a.ingredients.length
    ? a.ingredients.map((item, index) => ({
        id: `recipe-ingredient-${stamp}-${index}`,
        name: String(item.name || "").trim(),
        quantity: String(item.quantity || "").trim(),
        unit: String(item.unit || "").trim(),
        group: String(item.group || "").trim(),
      })).filter((item) => item.name)
    : null;
  const rawIngredients = (Array.isArray(s.ingredients) ? s.ingredients : []).map((line, index) => ({
    id: `recipe-ingredient-${stamp}-${index}`, name: String(line).trim(), quantity: "", unit: "", group: "",
  })).filter((item) => item.name);
  const ingredients = aiIngredients && aiIngredients.length ? aiIngredients : rawIngredients;

  const steps = a && Array.isArray(a.steps) ? a.steps.map((x) => String(x).trim()).filter(Boolean) : [];
  const method = steps.length
    ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n\n")
    : String(s.instructions || "").trim();

  const foodType = a && a.food_type ? String(a.food_type) : "";
  const constraints = a && Array.isArray(a.constraints) ? a.constraints.map(String) : [];
  const labels = [...new Set([...(foodType ? [foodType] : []), ...constraints])];

  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch (_) { host = String(s.host || ""); }

  return {
    name,
    servings,
    category: a && a.category ? String(a.category) : "",
    quick: total > 0 ? total <= QUICK_MAX_MINUTES : Boolean(a && a.quick),
    prepTime: prep ? String(prep) : "",
    cookTime: cook ? String(cook) : "",
    photo: String(s.image_data_url || ""),
    labels,
    ingredients,
    ingredientsLegacy: "",
    condiments: a && Array.isArray(a.condiments) ? a.condiments.map(String) : [],
    method,
    ...availabilityFromMonths(monthsFromAnalysis(a)),
    // Propre au catalogue : d'ou vient la fiche, et quand.
    sourceUrl: String(url || ""),
    sourceHost: host,
    importedAt: now.toISOString(),
  };
}

/** Erreur renvoyee par la fonction Python, avec son statut HTTP. */
class ImportError extends Error {
  constructor(message, { status = 502, code = "import-failed" } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Fabrique l'appelant serveur a serveur.
 * @param {{ url?: string, getAuthHeaders?: (audience: string) => Promise<Record<string,string>>, fetchImpl?: typeof fetch }} deps
 * @returns {(url: string) => Promise<{scraped: object, analysis: object|null, analysis_error: string}>}
 */
function createRecipeImporter({ url = DEFAULT_IMPORT_URL, getAuthHeaders, fetchImpl = fetch } = {}) {
  const resolveHeaders = getAuthHeaders || (async (audience) => {
    // Jeton d'identite du compte de service de la fonction `admin`, signe par
    // Google pour l'audience exacte que verifie la fonction Python.
    const { GoogleAuth } = require("google-auth-library");
    const client = await new GoogleAuth().getIdTokenClient(audience);
    const headers = await client.getRequestHeaders();
    return headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
  });

  return async function importRecipe(pageUrl) {
    let headers;
    try {
      headers = await resolveHeaders(url);
    } catch (error) {
      throw new ImportError("Impossible d'obtenir un jeton d'identite pour appeler l'import.", { status: 500, code: "no-identity" });
    }
    let res;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ url: pageUrl }),
      });
    } catch (error) {
      throw new ImportError("La fonction d'import est injoignable.", { status: 502, code: "unreachable" });
    }
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    if (!res.ok) {
      const message = (body && body.message) || `La fonction d'import a repondu ${res.status}.`;
      throw new ImportError(message, { status: res.status >= 400 && res.status < 600 ? res.status : 502, code: (body && body.error) || "import-failed" });
    }
    if (!body || !body.scraped) throw new ImportError("Reponse d'import incomplete.", { status: 502, code: "bad-response" });
    return body;
  };
}

module.exports = { recipeDocFromImport, createRecipeImporter, ImportError, availabilityFromMonths, DEFAULT_IMPORT_URL };

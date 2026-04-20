/**
 * Normalise un nom de produit pour la comparaison exacte.
 * - minuscules, sans accents, sans ponctuation
 * - pluriel simple → singulier (pommes → pomme, courgettes → courgette)
 */
export function normalizeProductName(name) {
  if (!name) return "";
  let n = String(name).trim().toLowerCase();
  n = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  n = n.replace(/[^a-z0-9 -]/g, " ");
  n = n.replace(/\s+/g, " ").trim();
  n = n.replace(/([a-z])\1+/g, "$1");
  n = n.replace(/([a-z]+)eaux\b/g, "$1eau");
  n = n.replace(/\b([a-z]{4,}[^s])s\b/g, "$1");
  return n;
}

/**
 * Normalise pour la recherche souple (pas de dépluriel, juste minuscules + sans accents).
 */
function normalizeForSearch(name) {
  if (!name) return "";
  return String(name).trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/([a-z])\1+/g, "$1")
    .replace(/\s+/g, " ").trim();
}

/**
 * Cherche un article similaire (correspondance exacte normalisée).
 * Retourne { item, type: "exact" } ou null.
 * excludeId : id à ignorer lors de l'édition.
 */
export function findSimilarItem(inputName, items, excludeId = null) {
  const normalized = normalizeProductName(inputName);
  if (normalized.length < 2) return null;
  for (const item of (items || [])) {
    if (excludeId && item.id === excludeId) continue;
    if (normalizeProductName(item.name) === normalized) {
      return { item, type: "exact" };
    }
  }
  return null;
}

/**
 * Retourne les articles dont le nom contient la saisie en cours.
 * Pour l'autocomplétion en direct pendant la frappe.
 * excludeId : id à ignorer (lors de l'édition d'un article existant).
 */
export function suggestItems(inputName, items, excludeId = null, maxResults = 6) {
  const query = normalizeForSearch(inputName);
  if (query.length < 1) return [];
  return (items || []).filter((item) => {
    if (excludeId && item.id === excludeId) return false;
    return normalizeForSearch(item.name).includes(query);
  }).slice(0, maxResults);
}

/**
 * Construit une base dedupee de produits connus a partir de plusieurs modules.
 * Sert a retrouver des produits deja vus dans l'app, pas seulement dans l'inventaire.
 */
export function collectKnownProducts({ inventory = [], lists = [], recipes = [] } = {}) {
  const map = new Map();

  function addCandidate(candidate, source) {
    const name = String(candidate?.name || candidate?.text || "").trim();
    if (!name) return;
    const normalized = normalizeProductName(name);
    if (!normalized) return;
    if (map.has(normalized)) return;
    map.set(normalized, {
      id: candidate?.id || `${source}-${normalized}`,
      name,
      quantity: String(candidate?.quantity || "").trim(),
      unit: String(candidate?.unit || "").trim(),
      source,
      stockState: candidate?.stockState || "",
      normalizedName: normalized,
    });
  }

  (Array.isArray(inventory) ? inventory : []).forEach((item) => addCandidate(item, "inventory"));
  (Array.isArray(lists) ? lists : []).forEach((list) => {
    (Array.isArray(list?.items) ? list.items : []).forEach((item) => addCandidate(item, "list"));
  });
  (Array.isArray(recipes) ? recipes : []).forEach((recipe) => {
    (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).forEach((item) => addCandidate(item, "recipe"));
  });

  return [...map.values()];
}

/**
 * Formate la quantité et l'unité pour l'affichage.
 * Exemples :
 *   formatQuantityUnit("4", "unité") → "4 unités"
 *   formatQuantityUnit("500", "g")   → "500 g"
 *   formatQuantityUnit("1", "l")     → "1 l"
 *   formatQuantityUnit("3", "")      → "3"
 */
export function formatQuantityUnit(quantity, unit) {
  const q = String(quantity || "").trim();
  const u = String(unit || "").trim();
  if (!q && !u) return "";
  if (!q) return u;
  if (!u) return q;
  if (u === "unité") return `${q} unité${Number(q) > 1 ? "s" : ""}`;
  return `${q} ${u}`;
}

/**
 * Comparaison recettes ↔ inventaire.
 *
 * Deux sens de lecture, une seule logique de matching :
 *  - recette → inventaire : ce qu'il manque pour cuisiner (popup + liste de courses)
 *  - inventaire → recettes : ce qu'on peut cuisiner avec ce qui reste, et ce
 *    qui périme bientôt
 *
 * Rappel des règles produit : les condiments ne sont jamais deduits du stock,
 * ils sont donc comptes a part et n'entrent pas dans la faisabilite.
 */
import { CONDIMENTS } from "../data/condiments.js";
import { daysUntilExpiry } from "./date.js";
import { fromBaseQuantity, productMatchKey, toBaseQuantity } from "./units.js";

/** Au-delà, une DLC n'est plus considérée comme urgente. */
export const EXPIRY_SOON_DAYS = 7;

function getCondimentLabel(condimentId) {
  const found = CONDIMENTS.find((c) => c.id === condimentId);
  return found ? found.label : condimentId;
}

function looseNormalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function computeMissingCondiments(recipe, inventory) {
  const selectedCondiments = Array.isArray(recipe?.condiments) ? recipe.condiments : [];
  if (!selectedCondiments.length) return [];
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  return selectedCondiments
    .map((condimentId) => ({ id: condimentId, label: getCondimentLabel(condimentId) }))
    .filter(({ label }) => {
      const firstWord = looseNormalize(label).split(/\s+/)[0];
      return !safeInventory.some((item) => (
        looseNormalize(item.name).includes(firstWord) && item.stockState !== "empty"
      ));
    })
    .map(({ id, label }) => ({ id: `missing-cond-${id}`, condimentId: id, name: label }));
}

/**
 * Ingrédients principaux qu'il faut acheter pour cuisiner la recette.
 *
 * Le rapprochement suit exactement la deduction de stock (App.js, passage a
 * `OK`) : meme cle produit et meme conversion d'unites. Sans ca, la comparaison
 * declare manquant ce que la deduction consomme sans probleme — l'inventaire
 * garde ses unites telles quelles ("unité") la ou les recettes les normalisent
 * ("unite"), et 1 kg de riz ne couvrait pas 200 g.
 */
export function computeMissingIngredients(recipe, inventory) {
  const safeIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients.filter((item) => item.name) : [];
  const usableStock = (Array.isArray(inventory) ? inventory : []).filter((item) => item && item.stockState !== "empty");

  return safeIngredients.reduce((missing, ingredient) => {
    const key = productMatchKey(ingredient.name);
    const matches = usableStock.filter((item) => productMatchKey(item.name) === key);
    if (!matches.length) { missing.push({ ...ingredient, missingGroup: "main" }); return missing; }

    // Pas de quantité exploitable (« un peu de persil ») : la présence suffit.
    const required = toBaseQuantity(ingredient.quantity, ingredient.unit);
    if (!required) return missing;

    const available = matches.reduce((sum, item) => {
      const stock = toBaseQuantity(item.quantity, item.unit);
      return stock && stock.kind === required.kind ? sum + stock.value : sum;
    }, 0);
    if (available >= required.value) return missing;

    // On ne redemande que le complément, exprimé dans l'unité de la recette.
    const shortfall = fromBaseQuantity(required.value - available, ingredient.unit);
    missing.push({ ...ingredient, missingGroup: "main", quantity: shortfall || ingredient.quantity });
    return missing;
  }, []);
}

/**
 * Etat d'une recette face au stock.
 * `known` est faux pour les recettes sans ingredients structures (ancien texte
 * libre) : on ne sait rien de leur faisabilite, on ne les declare donc ni
 * faisables ni manquantes.
 */
export function computeRecipeStock(recipe, inventory) {
  const ingredients = (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).filter((item) => item?.name);
  const missing = computeMissingIngredients(recipe, inventory);
  const known = ingredients.length > 0;
  return {
    total: ingredients.length,
    missing,
    missingCount: missing.length,
    missingCondimentCount: computeMissingCondiments(recipe, inventory).length,
    known,
    ready: known && missing.length === 0,
  };
}

/**
 * Stock disponible sous forme de budget consommable.
 *
 * `present` répond à « ce produit est-il au stock ? » (pour « un peu de
 * persil », où la présence suffit), `amounts` à « combien en reste-t-il ? ».
 * Les deux sont nécessaires : un article sans quantité exploitable compte comme
 * présent sans rien peser.
 */
function createStockLedger(inventory) {
  const present = new Set();
  const amounts = new Map();
  (Array.isArray(inventory) ? inventory : [])
    .filter((item) => item && item.stockState !== "empty")
    .forEach((item) => {
      const key = productMatchKey(item.name);
      if (!key) return;
      present.add(key);
      const base = toBaseQuantity(item.quantity, item.unit);
      if (!base) return;
      const bucket = `${key}|${base.kind}`;
      amounts.set(bucket, (amounts.get(bucket) || 0) + base.value);
    });
  return { present, amounts, takenBy: new Map() };
}

/**
 * Puise un ingrédient dans le budget, et renvoie ce qui manque — `null` si tout
 * est couvert. Le rapprochement suit `computeMissingIngredients` : même clé
 * produit, mêmes conversions, même tolérance pour les ingrédients sans
 * quantité.
 *
 * `takenBy` nomme les créneaux qui ont déjà puisé dans ce produit : c'est ce
 * qui permet de dire « lundi midi cuisine la même chose » au lieu d'un « il
 * manque » sans explication.
 */
function takeFromLedger(ledger, ingredient, slotLabel) {
  const key = productMatchKey(ingredient?.name);
  if (!key) return null;
  if (!ledger.present.has(key)) return { ...ingredient, missingGroup: "main", takenBy: [] };

  const required = toBaseQuantity(ingredient.quantity, ingredient.unit);
  if (!required) return null;

  const bucket = `${key}|${required.kind}`;
  const available = ledger.amounts.get(bucket) || 0;
  const taken = Math.min(available, required.value);
  ledger.amounts.set(bucket, available - taken);

  const earlierSlots = ledger.takenBy.get(bucket) || [];
  if (taken > 0 && slotLabel && !earlierSlots.includes(slotLabel)) {
    ledger.takenBy.set(bucket, [...earlierSlots, slotLabel]);
  }

  if (taken >= required.value) return null;
  const shortfall = fromBaseQuantity(required.value - taken, ingredient.unit);
  return { ...ingredient, missingGroup: "main", quantity: shortfall || ingredient.quantity, takenBy: earlierSlots };
}

/**
 * Faisabilité d'une semaine entière, créneau par créneau.
 *
 * `computeRecipeStock` répond recette par recette, chacune face au stock
 * complet : deux repas qui veulent le même paquet de nouilles se croient donc
 * tous les deux faisables, et rien ne prévient qu'après le premier il ne
 * restera rien. Ici le stock est un budget que les créneaux consomment dans
 * l'ordre où ils arrivent — le premier sert, les suivants voient ce qui reste.
 *
 * Les créneaux déjà cuisinés sont ignorés : la liaison inventaire a retiré
 * leurs ingrédients au moment de la cuisson, les recompter les déduirait deux
 * fois.
 *
 * @param {object[]} slots `{ key, label, cooked, recipes[] }`, dans l'ordre
 *   chronologique — l'ordre décide qui sert en premier.
 * @returns {Map} `key` → `{ known, cooked, missing, missingCount, ready,
 *   weekOnlyMissing, weekOnlyCount }`. `weekOnlyMissing` isole ce qui ne manque
 *   que par la faute d'un repas plus tôt dans la semaine.
 */
export function computeWeekStock({ slots = [], inventory = [] } = {}) {
  const ledger = createStockLedger(inventory);
  const result = new Map();

  (Array.isArray(slots) ? slots : []).forEach((slot) => {
    if (!slot?.key) return;
    const ingredients = (Array.isArray(slot.recipes) ? slot.recipes : [])
      .filter(Boolean)
      .flatMap((recipe) => (Array.isArray(recipe?.ingredients) ? recipe.ingredients.filter((item) => item?.name) : []));
    const known = ingredients.length > 0;

    if (slot.cooked) {
      result.set(slot.key, {
        known, cooked: true, missing: [], missingCount: 0, ready: known, weekOnlyMissing: [], weekOnlyCount: 0,
      });
      return;
    }

    const missing = ingredients.map((ingredient) => takeFromLedger(ledger, ingredient, slot.label)).filter(Boolean);

    // Ce que ce créneau aurait trouvé seul face au stock complet : l'écart avec
    // le calcul de la semaine, c'est exactement ce que les repas précédents lui
    // prennent.
    const soloLedger = createStockLedger(inventory);
    const soloKeys = new Set(
      ingredients
        .map((ingredient) => takeFromLedger(soloLedger, ingredient))
        .filter(Boolean)
        .map((item) => productMatchKey(item.name)),
    );
    const weekOnlyMissing = missing.filter((item) => !soloKeys.has(productMatchKey(item.name)));

    result.set(slot.key, {
      known,
      cooked: false,
      missing,
      missingCount: missing.length,
      ready: known && missing.length === 0,
      weekOnlyMissing,
      weekOnlyCount: weekOnlyMissing.length,
    });
  });

  return result;
}

/** Rang de tri : d'abord les recettes faisables, les non comparables à la fin. */
export function recipeStockRank(stock) {
  if (!stock || !stock.known) return Number.MAX_SAFE_INTEGER;
  return stock.missingCount;
}

/**
 * Articles encore en stock dont la DLC arrive dans les `maxDays` jours.
 * Les DLC déjà dépassées sont exclues : on ne propose pas de cuisiner un
 * produit périmé.
 */
export function collectExpiringItems(inventory, maxDays = EXPIRY_SOON_DAYS) {
  return (Array.isArray(inventory) ? inventory : [])
    .filter((item) => item && item.stockState !== "empty")
    .map((item) => ({ item, days: daysUntilExpiry(item.expiryDate) }))
    .filter(({ days }) => days !== null && days >= 0 && days <= maxDays)
    .sort((left, right) => left.days - right.days);
}

/**
 * Recettes qui consomment ce qui périme bientôt.
 * Tri : le plus d'articles urgents utilisés, puis la DLC la plus proche, puis
 * le moins d'ingrédients manquants.
 */
export function computePriorityRecipes({ recipes = [], inventory = [], limit = 3, maxDays = EXPIRY_SOON_DAYS } = {}) {
  const expiring = collectExpiringItems(inventory, maxDays);
  if (!expiring.length) return [];

  // Un même produit peut être présent en plusieurs exemplaires : on garde la DLC la plus proche.
  const urgentByName = new Map();
  expiring.forEach(({ item, days }) => {
    const key = productMatchKey(item.name);
    if (!key) return;
    const current = urgentByName.get(key);
    if (!current || days < current.days) urgentByName.set(key, { name: item.name, days });
  });

  return (Array.isArray(recipes) ? recipes : [])
    .map((recipe) => {
      const seen = new Set();
      const expiringItems = [];
      (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).forEach((ingredient) => {
        const key = productMatchKey(ingredient?.name);
        if (!key || seen.has(key)) return;
        const urgent = urgentByName.get(key);
        if (!urgent) return;
        seen.add(key);
        expiringItems.push(urgent);
      });
      return { recipe, expiringItems: expiringItems.sort((a, b) => a.days - b.days), stock: computeRecipeStock(recipe, inventory) };
    })
    .filter((entry) => entry.expiringItems.length > 0)
    .sort((left, right) => {
      if (right.expiringItems.length !== left.expiringItems.length) return right.expiringItems.length - left.expiringItems.length;
      if (left.expiringItems[0].days !== right.expiringItems[0].days) return left.expiringItems[0].days - right.expiringItems[0].days;
      if (left.stock.missingCount !== right.stock.missingCount) return left.stock.missingCount - right.stock.missingCount;
      return String(left.recipe.name || "").localeCompare(String(right.recipe.name || ""), "fr", { sensitivity: "base" });
    })
    .slice(0, limit);
}

/**
 * Articles de l'inventaire couverts par ces recettes, sans doublon.
 * Sert au bilan du tirage automatique : « 7 articles de ton stock utilisés ».
 * Même rapprochement que la comparaison et la déduction (`productMatchKey`).
 */
export function collectUsedStockItems(recipes, inventory) {
  const nameByKey = new Map();
  (Array.isArray(inventory) ? inventory : [])
    .filter((item) => item && item.stockState !== "empty")
    .forEach((item) => {
      const key = productMatchKey(item.name);
      if (key && !nameByKey.has(key)) nameByKey.set(key, item.name);
    });

  const used = new Map();
  (Array.isArray(recipes) ? recipes : []).forEach((recipe) => {
    (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).forEach((ingredient) => {
      const key = productMatchKey(ingredient?.name);
      if (key && nameByKey.has(key)) used.set(key, nameByKey.get(key));
    });
  });
  return [...used.values()];
}

/**
 * Sépare les manquants selon qu'ils attendent déjà dans la liste de courses.
 *
 * L'état « déjà demandé » n'est stocké nulle part : il se lit dans la liste, ce
 * qui le garde juste après un rechargement, et le fait disparaître tout seul si
 * l'article est retiré de la liste. Un article coché (acheté) ne compte plus :
 * il n'attend plus rien.
 */
export function splitAlreadyListed(missingItems, shoppingItems) {
  const pending = new Set(
    (Array.isArray(shoppingItems) ? shoppingItems : [])
      .filter((item) => item && !item.done)
      .map((item) => productMatchKey(item.text || item.name))
      .filter(Boolean),
  );
  const listed = [];
  const toAdd = [];
  (Array.isArray(missingItems) ? missingItems : []).forEach((item) => {
    const key = productMatchKey(item?.name);
    (key && pending.has(key) ? listed : toAdd).push(item);
  });
  return { listed, toAdd, listedKeys: pending };
}

/** Cet ingrédient attend-il déjà dans la liste de courses ? */
export function isAlreadyListed(item, shoppingItems) {
  return splitAlreadyListed([item], shoppingItems).listed.length > 0;
}

/**
 * Nombre de produits distincts dans une liste d'ingrédients.
 * Deux recettes qui manquent toutes les deux de tomates ne font qu'une ligne de
 * courses (la liste fusionne les articles proches) : le compte annoncé doit
 * suivre, pas compter les doublons.
 */
export function countDistinctProducts(items) {
  const keys = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = productMatchKey(item?.name);
    if (key) keys.add(key);
  });
  return keys.size;
}

/** "aujourd'hui" / "demain" / "dans 4 j" — pour les puces d'articles urgents. */
export function expiryShortLabel(days) {
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  return `dans ${days} j`;
}

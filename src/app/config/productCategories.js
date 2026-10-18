/**
 * Classement des articles de la liste de courses par rayon, dans l'ordre
 * habituel d'un parcours en supermarché. Détection par mots-clés sur le nom
 * de l'article — pas d'appel IA : c'est gratuit, instantané, et suffisant
 * pour des noms de produits courts.
 */

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const PRODUCT_CATEGORIES = [
  {
    id: "fruits_legumes",
    label: "Fruits & légumes",
    emoji: "🥦",
    keywords: [
      "pomme", "poire", "banane", "orange", "citron", "fraise", "framboise", "myrtille",
      "cerise", "peche", "abricot", "prune", "raisin", "melon", "pasteque", "ananas",
      "mangue", "kiwi", "clementine", "mandarine", "pamplemousse", "figue", "datte",
      "tomate", "courgette", "aubergine", "poivron", "carotte", "oignon", "echalote",
      "ail", "pomme de terre", "pommes de terre", "patate", "salade", "laitue",
      "epinard", "brocoli", "chou", "concombre", "avocat", "champignon", "poireau",
      "radis", "betterave", "celeri", "potiron", "courge", "haricot vert",
      "haricots verts", "petit pois", "petits pois", "artichaut", "endive", "navet",
      "fenouil", "asperge", "persil", "ciboulette", "basilic", "menthe", "coriandre",
      "sauge", "romarin", "thym frais", "gingembre frais",
    ],
  },
  {
    id: "viande_poisson",
    label: "Viande & poisson",
    emoji: "🥩",
    keywords: [
      "boeuf", "poulet", "porc", "agneau", "veau", "dinde", "canard", "lapin",
      "jambon", "lardons", "saucisse", "saucisson", "steak", "merguez", "chorizo",
      "bacon", "cote de", "escalope", "boudin", "pate", "rillettes", "terrine",
      "poisson", "saumon", "thon", "cabillaud", "colin", "truite", "sardine",
      "maquereau", "crevette", "moule", "huitre", "coquille", "calamar", "poulpe",
      "surimi", "hache",
    ],
  },
  {
    id: "cremerie",
    label: "Crèmerie & œufs",
    emoji: "🥛",
    keywords: [
      "lait", "oeuf", "beurre", "creme fraiche", "creme liquide", "creme entiere",
      "fromage", "mozzarella", "parmesan", "gruyere", "comte", "emmental", "chevre",
      "feta", "mascarpone", "ricotta", "camembert", "brie", "yaourt", "yaourts",
      "fromage blanc", "petit suisse", "faisselle", "creme dessert",
    ],
  },
  {
    id: "boulangerie",
    label: "Boulangerie",
    emoji: "🥖",
    keywords: [
      "pain", "baguette", "brioche", "croissant", "pain au chocolat", "viennoiserie",
      "pain de mie", "biscotte", "chapelure",
    ],
  },
  {
    id: "epicerie",
    label: "Épicerie",
    emoji: "🛒",
    keywords: [
      "farine", "sucre", "riz", "pates", "spaghetti", "semoule", "quinoa", "lentille",
      "pois chiche", "pois chiches", "huile", "vinaigre", "sel", "poivre", "epice",
      "curry", "cumin", "paprika", "curcuma", "cannelle", "muscade",
      "herbes de provence", "conserve", "sauce tomate", "coulis", "sauce soja",
      "moutarde", "ketchup", "mayonnaise", "miel", "confiture", "pate a tartiner",
      "chocolat", "cafe", "the", "infusion", "biscuit", "gateau", "cereale",
      "levure", "bouillon", "sucre vanille", "vanille", "amande", "noisette",
      "noix", "raisin sec", "cornichon", "olive", "tapenade", "pesto", "vinaigrette",
    ],
  },
  {
    id: "surgeles",
    label: "Surgelés",
    emoji: "❄️",
    keywords: [
      "surgele", "glace", "sorbet", "frites surgel", "legumes surgeles",
      "pizza surgelee",
    ],
  },
  {
    id: "boissons",
    label: "Boissons",
    emoji: "🥤",
    keywords: [
      "eau", "jus de", "soda", "limonade", "vin", "biere", "champagne", "cidre",
      "sirop", "lait vegetal", "lait d amande", "lait de soja", "lait d avoine",
      "boisson",
    ],
  },
  {
    id: "hygiene",
    label: "Hygiène & entretien",
    emoji: "🧴",
    keywords: [
      "savon", "shampoing", "gel douche", "dentifrice", "brosse a dents",
      "deodorant", "lessive", "adoucissant", "eponge", "papier toilette",
      "sopalin", "essuie-tout", "liquide vaisselle", "sac poubelle", "javel",
      "nettoyant", "couche", "lingette",
    ],
  },
];

const AUTRE_CATEGORY = { id: "autre", label: "Autre", emoji: "📦" };

function buildKeywordRegex(keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // "s"/"x" final optionnel : couvre le pluriel courant (carotte/carottes,
  // poireau/poireaux) sans gérer toute la flexion française — les phrases
  // pluralisant leur premier mot (pommes de terre, petits pois…) sont
  // dupliquées telles quelles ci-dessus.
  return new RegExp(`\\b${escaped}(?:s|x)?\\b`);
}

// Priorité de détection différente de l'ordre d'affichage : une mention
// explicite "surgelé"/"jus de X" doit l'emporter sur le nom de l'ingrédient
// brut qu'elle contient (ex: "jus de pomme" -> Boissons, pas Fruits & légumes).
const PRIORITY_IDS = ["surgeles", "boissons"];
const MATCHERS = [...PRIORITY_IDS, ...PRODUCT_CATEGORIES.map((c) => c.id).filter((id) => !PRIORITY_IDS.includes(id))]
  .map((id) => PRODUCT_CATEGORIES.find((c) => c.id === id))
  .map((category) => ({
    id: category.id,
    label: category.label,
    emoji: category.emoji,
    regexes: category.keywords.map(buildKeywordRegex),
  }));

/** Catégorie {id, label, emoji} déduite du nom d'un article. */
export function categorizeProduct(name) {
  const normalized = normalize(name);
  if (!normalized) return AUTRE_CATEGORY;
  for (const category of MATCHERS) {
    if (category.regexes.some((re) => re.test(normalized))) {
      return { id: category.id, label: category.label, emoji: category.emoji };
    }
  }
  return AUTRE_CATEGORY;
}

export function groupItemsByCategory(items, getName = (item) => item.text) {
  const byId = new Map();
  for (const item of items) {
    const category = categorizeProduct(getName(item));
    if (!byId.has(category.id)) byId.set(category.id, { ...category, items: [] });
    byId.get(category.id).items.push(item);
  }
  const ordered = [...PRODUCT_CATEGORIES, AUTRE_CATEGORY]
    .map((category) => byId.get(category.id))
    .filter(Boolean);
  return ordered;
}

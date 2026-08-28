import { React, html, useEffect, useMemo, useRef, useState } from "../../lib.js";
import { findSimilarItem, formatQuantityUnit, suggestItems } from "../../utils/productUtils.js";
import { CONDIMENTS, CONDIMENT_ESSENTIALS } from "../../config/condiments.js";
import { CategoryIcon, categoryToneClass } from "./CategoryIcons.js";
import { RecipeSheet, groupIngredients, condimentLabel } from "./RecipeSheet.js";
import { RecipeLibrary } from "./RecipeLibrary.js";
import { scrapeRecipeFromUrl, categorizeRecipe, importErrorMessage } from "../../providers/clientRecipes.js";
import { confirmDialog } from "../../utils/dialogs.js";
import { MrdModal } from "../../components/MrdModal.js";

const ESSENTIAL_ID_SET = new Set(CONDIMENT_ESSENTIALS.map((e) => e.id));

const SEASONS = [
  { id: "spring", label: "Printemps", months: [3, 4, 5] },
  { id: "summer", label: "Été", months: [6, 7, 8] },
  { id: "autumn", label: "Automne", months: [9, 10, 11] },
  { id: "winter", label: "Hiver", months: [12, 1, 2] },
];

const MONTHS = [
  { id: 1, label: "Janvier" }, { id: 2, label: "Février" }, { id: 3, label: "Mars" },
  { id: 4, label: "Avril" }, { id: 5, label: "Mai" }, { id: 6, label: "Juin" },
  { id: 7, label: "Juillet" }, { id: 8, label: "Août" }, { id: 9, label: "Septembre" },
  { id: 10, label: "Octobre" }, { id: 11, label: "Novembre" }, { id: 12, label: "Décembre" },
];

/* Types alimentaires principaux (filtre + form, single-select) */
const FOOD_TYPES = [
  { id: "omnivore",    label: "Omnivore",    icon: "🍖" },
  { id: "vegetarian", label: "Végétarien", icon: "🥕" },
  { id: "vegan",      label: "Végan",   icon: "🌱" },
  { id: "pescetarian",label: "Pescétarien", icon: "🐟" },
];
const FOOD_TYPE_IDS = new Set(FOOD_TYPES.map((t) => t.id));

/* Contraintes alimentaires (filtre avancé + form, multi-select) */
const CONSTRAINT_LABELS = [
  { id: "gluten_free", label: "Sans gluten" },
  { id: "lactose_free", label: "Sans lactose" },
  { id: "egg_free",    label: "Sans œufs" },
  { id: "nut_free",    label: "Sans fruits à coque" },
  { id: "pork_free",   label: "Sans porc" },
  { id: "halal",       label: "Halal" },
  { id: "kosher",      label: "Casher" },
];
const CONSTRAINT_IDS = new Set(CONSTRAINT_LABELS.map((c) => c.id));

/* Pictogrammes des quatre saisons — la disponibilité se pose à plat dans le
   formulaire (handoff 7a) au lieu de vivre dans un menu flottant. */
const SEASON_ICONS = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };

/* Catégories de recettes */
const CATEGORIES = [
  { id: "starter",   label: "Entrée" },
  { id: "main",      label: "Plat" },
  { id: "dessert",   label: "Dessert" },
  { id: "breakfast", label: "Petit-déj / goûter" },
  { id: "drink",     label: "Boisson" },
  { id: "base",      label: "Base maison" },
];

const UNITS = [
  { value: "", label: "-" },
  { value: "unite", label: "unite" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "cl", label: "cl" },
  { value: "l", label: "l" },
];

/* Les quatre lignes que la feuille d'import coche une à une (handoff 7c) :
   plutôt qu'un rond qui tourne, on montre ce que l'app est allée chercher. */
const IMPORT_STEPS = [
  { id: "name", label: "Nom de la recette" },
  { id: "time", label: "Temps de préparation" },
  { id: "ingredients", label: "Ingrédients" },
  { id: "category", label: "Catégorie et régime" },
];

function defaultImportState() {
  return { step: "idle", error: "", warning: "", found: null, marks: {} };
}

function markGlyph(mark) {
  if (mark === "ok") return "✓";
  if (mark === "none") return "—";
  return "⋯";
}

function defaultIngredientDraft(group = "") {
  return { name: "", quantity: "", unit: "", group };
}

function defaultRecipeForm() {
  return {
    name: "", servings: 4, months: [],
    category: "",
    foodType: "",
    constraints: [],
    quick: false,
    prepTime: "",
    cookTime: "",
    photo: "",
    labels: [],
    ingredients: [], ingredientsLegacy: "", condiments: [], method: "",
  };
}

function normalizeRecipeIngredient(item, index) {
  return {
    id: item?.id || `recipe-ingredient-${Date.now()}-${index}`,
    name: String(item?.name || "").trim(),
    quantity: String(item?.quantity || "").trim(),
    unit: String(item?.unit || "").trim(),
    group: String(item?.group || "").trim(),
  };
}

function seasonById(seasonId) {
  return SEASONS.find((season) => season.id === seasonId) || SEASONS[0];
}

function uniqueMonths(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => value >= 1 && value <= 12))];
}

function formFromRecipe(recipe) {
  const availabilityMode = recipe?.availabilityMode || "all_year";
  const season = recipe?.season || "";
  const seasons = Array.isArray(recipe?.seasons) && recipe.seasons.length ? [...recipe.seasons] : (season ? [season] : []);
  const storedMonths = uniqueMonths(recipe?.months || []);
  /* Le formulaire ne connaît plus que les mois (handoff 7a). Certaines
     recettes anciennes — notamment celles créées par l'import — ont été
     enregistrées en mode « season » avec `months: []` : sans ce repli, ouvrir
     leur édition effacerait la saison en la lisant comme « toute l'année ». */
  const months = storedMonths.length
    ? storedMonths
    : availabilityMode === "season"
      ? uniqueMonths(seasons.flatMap((seasonId) => seasonById(seasonId).months || []))
      : [];
  const allLabels = Array.isArray(recipe?.labels) ? [...recipe.labels] : [];
  const foodType = allLabels.find((id) => FOOD_TYPE_IDS.has(id)) || "";
  const constraints = allLabels.filter((id) => CONSTRAINT_IDS.has(id));
  return {
    name: String(recipe?.name || "").trim(),
    servings: Math.max(1, Math.min(24, Number(recipe?.servings || 4) || 4)),
    months,
    category: String(recipe?.category || ""),
    foodType,
    constraints,
    quick: Boolean(recipe?.quick),
    prepTime: String(recipe?.prepTime || ""),
    cookTime: String(recipe?.cookTime || ""),
    labels: allLabels,
    ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients.map((item, index) => normalizeRecipeIngredient(item, index)) : [],
    ingredientsLegacy: String(recipe?.ingredientsLegacy || "").trim(),
    condiments: Array.isArray(recipe?.condiments) ? [...recipe.condiments] : [],
    method: String(recipe?.method || "").trim(),
    photo: String(recipe?.photo || ""),
  };
}

/* ── Disponibilité : les mois font foi (handoff 7a) ──────────────────────
   Le formulaire n'a plus de sélecteur de mode (« toute saison / par saison /
   mois précis ») : on coche des saisons et des mois, le mode se déduit. Rien
   de coché = toute l'année. Une sélection qui tombe exactement sur des saisons
   complètes est rangée en mode « season », le reste en mode « months » — le
   modèle stocké sur disque, lui, ne change pas. */
function seasonsFromMonths(monthValues) {
  const set = new Set(uniqueMonths(monthValues));
  if (!set.size) return [];
  const covered = SEASONS.filter((season) => season.months.every((month) => set.has(month)));
  const coveredMonths = new Set(covered.flatMap((season) => season.months));
  return coveredMonths.size === set.size ? covered.map((season) => season.id) : [];
}

function availabilityFromMonths(monthValues) {
  const list = uniqueMonths(monthValues);
  if (!list.length) return { availabilityMode: "all_year", season: "", seasons: [], months: [] };
  const seasons = seasonsFromMonths(list);
  if (seasons.length) return { availabilityMode: "season", season: seasons[0], seasons, months: list };
  return { availabilityMode: "months", season: "", seasons: [], months: list };
}

function formTotalTime(form) {
  return (Number(form.prepTime) || 0) + (Number(form.cookTime) || 0);
}

/* « Rapide » ne se coche plus : prépa + cuisson sous 20 min suffisent. Sans
   aucun temps saisi on garde ce que la recette portait déjà, pour ne pas
   effacer un marquage manuel en ouvrant simplement l'édition. */
function derivedQuick(form) {
  const total = formTotalTime(form);
  return total > 0 ? total <= 20 : Boolean(form.quick);
}

function toggleMonthSelection(currentMonths, monthId, allowedMonths = null) {
  const safeCurrent = uniqueMonths(currentMonths);
  const next = safeCurrent.includes(monthId) ? safeCurrent.filter((value) => value !== monthId) : [...safeCurrent, monthId];
  return uniqueMonths(allowedMonths ? next.filter((value) => allowedMonths.includes(value)) : next);
}

function buildRecipePayload(form) {
  /* Fusionner foodType + constraints dans labels (rétro-compat) */
  const baseLabels = Array.isArray(form.labels) ? form.labels.filter((id) => !FOOD_TYPE_IDS.has(id) && !CONSTRAINT_IDS.has(id)) : [];
  const constraints = Array.isArray(form.constraints) ? form.constraints : [];
  const labels = [...new Set([...(form.foodType ? [form.foodType] : []), ...constraints, ...baseLabels])];
  const ingredients = Array.isArray(form.ingredients) ? form.ingredients.map(normalizeRecipeIngredient).filter((item) => item.name) : [];
  const condiments = Array.isArray(form.condiments) ? [...form.condiments] : [];
  const servings = Math.max(1, Math.min(24, Number(form.servings) || 4));

  const base = {
    name: form.name,
    servings,
    category: form.category || "",
    quick: derivedQuick(form),
    prepTime: form.prepTime ? String(form.prepTime) : "",
    cookTime: form.cookTime ? String(form.cookTime) : "",
    photo: form.photo || "",
    labels,
    ingredients,
    ingredientsLegacy: "",
    condiments,
    method: form.method,
  };

  return { ...base, ...availabilityFromMonths(form.months) };
}

/** Comme compressImageToBase64, mais depuis une data URL (image importée d'un site). */
function compressImageDataUrl(dataUrl, maxSize = 300, quality = 0.60) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(img.width  * ratio);
      canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}

/** Redimensionne et compresse une image en JPEG base64 (max 300×300, qualité 0.60). */
function compressImageToBase64(file, maxSize = 300, quality = 0.60) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

export function RecipesView({
  recipes = [], inventory = [], knownProducts = [],
  customCondiments = [], onAddCustomCondiment, onDeleteCustomCondiment,
  onAddRecipe, onUpdateRecipe, onDeleteRecipe, onLoadDemoRecipes = null,
  onAddRecipeIngredientsToShopping = null,
  onOpenMealsTab = null,
  onToggleRecipeFavorite = null,
  linkInventory = false,
  onBack = null,
}) {

  /* ── Page création/édition ─────────────────────────────────── */
  const [showEditPage, setShowEditPage] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState("");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef(null);
  /* Seul repli restant du formulaire : les sept contraintes, trop longues pour
     tenir en tuiles (handoff 7a). Catégorie, régime, saisons et mois sont
     posés à plat — les quatre menus flottants et leur recalage dans la fenêtre
     ont disparu avec eux. */
  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [form, setForm] = useState(defaultRecipeForm());

  /* ── Point de départ d'une nouvelle recette (handoff 7b) ──── */
  const [sourceSheetOpen, setSourceSheetOpen] = useState(false);

  /* ── Import depuis un site (handoff 7c) ───────────────────── */
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  // step : idle | loading | done | failed
  const [importState, setImportState] = useState(defaultImportState());
  // Arrivée par l'import : le formulaire affiche le rappel « vérifie les champs »
  const [cameFromImport, setCameFromImport] = useState(false);

  /* ── Ingrédients ──────────────────────────────────────────── */
  const [ingredientDraft, setIngredientDraft] = useState(defaultIngredientDraft());
  const [ingredientSuggestions, setIngredientSuggestions] = useState([]);
  const [ingredientWarning, setIngredientWarning] = useState(null);
  const [allowDuplicateIngredient, setAllowDuplicateIngredient] = useState(false);

  /* ── Condiments ───────────────────────────────────────────── */
  const [showCondimentAdd, setShowCondimentAdd] = useState(false);
  const [showSavedCondiments, setShowSavedCondiments] = useState(false);
  const [customCondimentInput, setCustomCondimentInput] = useState("");

  /* ── Fiche recette ────────────────────────────────────────── */
  const [sheetRecipeId, setSheetRecipeId] = useState("");

  const productIndex = useMemo(() => {
    const base = Array.isArray(knownProducts) && knownProducts.length ? knownProducts : inventory;
    const currentIngredients = Array.isArray(form.ingredients)
      ? form.ingredients.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, source: "recipe-draft" }))
      : [];
    return [...base, ...currentIngredients];
  }, [knownProducts, inventory, form.ingredients]);

  const sheetRecipe = sheetRecipeId ? (Array.isArray(recipes) ? recipes : []).find((r) => r.id === sheetRecipeId) : null;

  useEffect(() => {
    if (!sheetRecipeId) return;
    const exists = (Array.isArray(recipes) ? recipes : []).some((r) => r.id === sheetRecipeId);
    if (!exists) setSheetRecipeId("");
  }, [recipes, sheetRecipeId]);

  function openRecipeSheet(recipe) {
    setSheetRecipeId(recipe.id);
  }

  function closeRecipeSheet() {
    setSheetRecipeId("");
  }

  function openEditModalFromSheet(recipe) {
    closeRecipeSheet();
    openEditModal(recipe);
  }

  function setServings(nextValue) {
    setForm((previous) => ({ ...previous, servings: Math.max(1, Math.min(24, Number(nextValue) || 1)) }));
  }

  function resetEditState() {
    setImportUrl("");
    setImportState(defaultImportState());
    setCameFromImport(false);
    setPhotoLoading(false);
    setPhotoError("");
    setForm(defaultRecipeForm());
    setIngredientDraft(defaultIngredientDraft());
    setIngredientSuggestions([]);
    setIngredientWarning(null);
    setAllowDuplicateIngredient(false);
    setShowCondimentAdd(false);
    setShowSavedCondiments(false);
    setCustomCondimentInput("");
    setConstraintsOpen(false);
  }

  /* ── Import depuis un site (handoff 7c) ────────────────────────
     Deux étapes réelles — récupération par `recipe-scrapers` côté serveur,
     puis analyse IA — mais la feuille ne montre plus une barre de
     progression : elle coche les quatre lignes de `IMPORT_STEPS` au fur et à
     mesure, puis rend compte champ par champ de ce qui a été trouvé. */
  async function handleImportFromUrl() {
    let url = importUrl.trim();
    if (!url || importState.step === "loading") return;
    // Liens collés sans schéma (« www.hellofresh.fr/… ») → https:// implicite
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    setImportState({
      step: "loading", error: "", warning: "", found: null,
      marks: { name: "pending", time: "pending", ingredients: "pending", category: "pending" },
    });

    // Étape 1 — récupération de la recette (recipe-scrapers côté serveur)
    let scraped;
    try {
      scraped = await scrapeRecipeFromUrl(url);
    } catch (error) {
      console.error("[recipes] import scrape error", error?.code, error?.message);
      setImportState({ ...defaultImportState(), step: "failed", error: importErrorMessage(error) });
      return;
    }

    /* Le compte rendu se construit ici, pas depuis `form` : les `setForm` de
       cette fonction ne sont pas encore appliqués quand on l'assemble. */
    const found = {
      name: String(scraped.title || "").trim(),
      prep: Number(scraped.prep_time_min) || 0,
      cook: Number(scraped.cook_time_min) || 0,
      servings: 0,
      ingredients: 0,
      category: "",
      foodType: "",
      host: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (_) { return url; } })(),
    };

    // Remplissage de base — les ingrédients bruts servent de filet si l'IA échoue
    const photo = scraped.image_data_url ? await compressImageDataUrl(scraped.image_data_url) : "";
    const servingsFromYields = parseInt(String(scraped.yields || "").match(/\d+/)?.[0] || "", 10);
    if (servingsFromYields >= 1 && servingsFromYields <= 24) found.servings = servingsFromYields;
    const stamp = Date.now();
    const scrapedIngredients = (scraped.ingredients || []).map((line, index) => ({
      id: `recipe-ingredient-${stamp}-${index}`,
      name: String(line), quantity: "", unit: "", group: "",
    }));
    found.ingredients = scrapedIngredients.length;

    setForm((prev) => ({
      ...prev,
      name: found.name || prev.name,
      servings: found.servings || prev.servings,
      prepTime: found.prep ? String(found.prep) : prev.prepTime,
      cookTime: found.cook ? String(found.cook) : prev.cookTime,
      method: scraped.instructions || prev.method,
      photo: photo || prev.photo,
      ingredients: scrapedIngredients,
    }));

    setImportState((current) => ({
      ...current,
      marks: {
        ...current.marks,
        name: found.name ? "ok" : "none",
        time: found.prep || found.cook ? "ok" : "none",
        ingredients: found.ingredients ? "ok" : "none",
      },
    }));

    // Étape 2 — catégorisation par l'IA
    let analysis;
    try {
      analysis = await categorizeRecipe(scraped);
    } catch (error) {
      console.error("[recipes] import categorize error", error?.code, error?.message);
      setImportState((current) => ({
        ...current,
        step: "done",
        warning: "L'analyse IA a échoué — la catégorie et le régime restent à choisir.",
        marks: { ...current.marks, category: "none" },
        found: buildImportReport(found),
      }));
      return;
    }

    const availability = analysis.availability_mode === "season"
      ? { months: uniqueMonths((analysis.seasons || []).flatMap((seasonId) => seasonById(seasonId).months || [])) }
      : analysis.availability_mode === "months"
        ? { months: uniqueMonths(analysis.months) }
        : { months: [] };

    // Condiments : uniquement des ids connus de l'app
    const knownCondimentIds = new Set(CONDIMENTS.map((c) => c.id));
    const condiments = (Array.isArray(analysis.condiments) ? analysis.condiments : [])
      .filter((id) => knownCondimentIds.has(id));

    // Étapes de préparation : liste numérotée aérée
    const steps = Array.isArray(analysis.steps) ? analysis.steps.map((s) => String(s).trim()).filter(Boolean) : [];
    const methodText = steps.length
      ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n\n")
      : "";

    const aiIngredients = Array.isArray(analysis.ingredients) && analysis.ingredients.length
      ? analysis.ingredients.map((item, index) => ({
          id: `recipe-ingredient-${Date.now()}-${index}`,
          name: String(item.name || "").trim(),
          quantity: String(item.quantity || "").trim(),
          unit: String(item.unit || "").trim(),
          group: String(item.group || "").trim(),
        })).filter((item) => item.name)
      : null;

    if (analysis.title_fr) found.name = analysis.title_fr;
    if (analysis.category) found.category = analysis.category;
    if (analysis.food_type) found.foodType = analysis.food_type;
    if (analysis.servings >= 1 && analysis.servings <= 24) found.servings = analysis.servings;
    if (aiIngredients) found.ingredients = aiIngredients.length;

    setForm((prev) => ({
      ...prev,
      ...availability,
      // Traduction : renseignée uniquement si la recette n'était pas en français
      name: found.name || prev.name,
      method: methodText || prev.method,
      category: found.category || prev.category,
      foodType: found.foodType || prev.foodType,
      constraints: Array.isArray(analysis.constraints) ? analysis.constraints : prev.constraints,
      servings: found.servings || prev.servings,
      condiments: condiments.length ? [...new Set([...(prev.condiments || []), ...condiments])] : prev.condiments,
      ingredients: aiIngredients || prev.ingredients,
    }));

    setImportState((current) => ({
      ...current,
      step: "done",
      marks: { ...current.marks, name: found.name ? "ok" : "none", category: found.category ? "ok" : "none" },
      found: buildImportReport(found),
    }));
  }

  /* Le relevé « Ce qu'on a trouvé » : une ligne par champ, ✓ ou —, pour que
     l'écart avec la page d'origine soit lisible avant d'ouvrir le formulaire. */
  function buildImportReport(found) {
    const totalMin = found.prep + found.cook;
    const categoryLabel = CATEGORIES.find((c) => c.id === found.category)?.label || "";
    const foodLabel = FOOD_TYPES.find((t) => t.id === found.foodType)?.label || "";
    return {
      name: found.name || "Recette sans nom",
      category: found.category || "main",
      host: found.host,
      meta: [
        totalMin ? `${totalMin} min` : null,
        found.servings ? `${found.servings} pers.` : null,
        categoryLabel || null,
      ].filter(Boolean).join(" · ") || "aucun détail",
      fields: [
        { label: "Nom", value: found.name || "à saisir", mark: found.name ? "ok" : "none" },
        { label: "Temps", value: totalMin ? `${totalMin} min` : "à saisir", mark: totalMin ? "ok" : "none" },
        { label: "Portions", value: found.servings ? `${found.servings} pers.` : "à saisir", mark: found.servings ? "ok" : "none" },
        { label: "Ingrédients", value: found.ingredients ? `${found.ingredients} lignes` : "aucun", mark: found.ingredients ? "ok" : "none" },
        { label: "Catégorie", value: categoryLabel || "à choisir", mark: found.category ? "ok" : "none" },
        { label: "Régime", value: foodLabel || "à choisir", mark: found.foodType ? "ok" : "none" },
      ],
    };
  }

  function closeEditPage() {
    setShowEditPage(false);
    setEditingRecipeId("");
    resetEditState();
  }

  /* Le « + » de la bibliothèque ne saute plus au formulaire : il demande
     d'abord d'où vient la recette (handoff 7b). */
  function openCreateModal() {
    setEditingRecipeId("");
    resetEditState();
    setSourceSheetOpen(true);
  }

  /* Les deux chemins de 7b arrivent sur le même formulaire : l'import le
     pré-remplit, la création part vierge. */
  function startManual() {
    const pendingUrl = importSheetOpen ? importUrl.trim() : "";
    setSourceSheetOpen(false);
    setImportSheetOpen(false);
    setCameFromImport(false);
    /* Sortie de l'échec d'import : le lien n'est pas perdu, il descend dans la
       préparation plutôt que de disparaître avec la feuille. */
    if (pendingUrl) {
      setForm((previous) => ({
        ...previous,
        method: previous.method ? `${previous.method}

Source : ${pendingUrl}` : `Source : ${pendingUrl}`,
      }));
    }
    setShowEditPage(true);
  }

  function startImport() {
    setSourceSheetOpen(false);
    setImportSheetOpen(true);
  }

  function closeImportSheet() {
    if (importState.step === "loading") return;
    setImportSheetOpen(false);
  }

  function openFormFromImport() {
    setImportSheetOpen(false);
    setCameFromImport(true);
    setShowEditPage(true);
  }

  async function pasteImportUrl() {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = String(text || "").trim();
      if (!trimmed) return;
      setImportUrl(trimmed);
      setImportState(defaultImportState());
    } catch (_) {
      setImportState((current) => ({
        ...current,
        error: "Le presse-papier n'est pas accessible — colle le lien à la main.",
      }));
    }
  }

  function stepTime(field, delta) {
    setForm((previous) => {
      const next = Math.max(0, Math.min(999, (Number(previous[field]) || 0) + delta));
      return { ...previous, [field]: next ? String(next) : "" };
    });
  }

  /* Une saison coche ou décoche ses trois mois — les mois restent la seule
     source de vérité (voir `availabilityFromMonths`). */
  function toggleSeason(season) {
    setForm((previous) => {
      const current = new Set(uniqueMonths(previous.months));
      const allIn = season.months.every((month) => current.has(month));
      season.months.forEach((month) => { if (allIn) current.delete(month); else current.add(month); });
      return { ...previous, months: uniqueMonths([...current]) };
    });
  }

  function openEditModal(recipe) {
    setEditingRecipeId(recipe.id);
    setForm(formFromRecipe(recipe));
    setIngredientDraft(defaultIngredientDraft());
    setIngredientSuggestions([]);
    setIngredientWarning(null);
    setAllowDuplicateIngredient(false);
    setShowCondimentAdd(false);
    setShowSavedCondiments(false);
    setCustomCondimentInput("");
    setConstraintsOpen(false);
    setCameFromImport(false);
    setShowEditPage(true);
  }

  function toggleFormConstraint(id) {
    setForm((previous) => {
      const current = Array.isArray(previous.constraints) ? previous.constraints : [];
      return {
        ...previous,
        constraints: current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
      };
    });
  }

  function toggleFormCondiment(condimentId) {
    setForm((previous) => {
      const current = Array.isArray(previous.condiments) ? previous.condiments : [];
      return {
        ...previous,
        condiments: current.includes(condimentId) ? current.filter((id) => id !== condimentId) : [...current, condimentId],
      };
    });
  }

  function submitCustomCondiment() {
    const name = customCondimentInput.trim();
    if (!name) return;
    onAddCustomCondiment?.(name);
    setForm((previous) => {
      const current = Array.isArray(previous.condiments) ? previous.condiments : [];
      if (current.includes(name)) return previous;
      return { ...previous, condiments: [...current, name] };
    });
    setCustomCondimentInput("");
    setShowSavedCondiments(true);
  }

  function removeCustomCondiment(name) {
    onDeleteCustomCondiment?.(name);
    setForm((previous) => ({
      ...previous,
      condiments: (Array.isArray(previous.condiments) ? previous.condiments : []).filter((id) => id !== name),
    }));
  }

  function handleIngredientNameInput(value) {
    setIngredientDraft((previous) => ({ ...previous, name: value }));
    setAllowDuplicateIngredient(false);
    setIngredientSuggestions(suggestItems(value, productIndex));
    const similar = findSimilarItem(value, productIndex);
    setIngredientWarning(similar?.item || null);
  }

  function useIngredientSuggestion(item) {
    setIngredientDraft((previous) => ({ ...previous, name: item?.name || "", unit: previous.unit || item?.unit || "" }));
    setIngredientWarning(null);
    setIngredientSuggestions([]);
    setAllowDuplicateIngredient(false);
  }

  function addIngredient() {
    if (!ingredientDraft.name.trim()) return;
    if (ingredientWarning && !allowDuplicateIngredient) return;
    setForm((previous) => ({
      ...previous,
      ingredients: [...previous.ingredients, normalizeRecipeIngredient(ingredientDraft, previous.ingredients.length)],
    }));
    // Garde le groupe courant : on saisit généralement plusieurs ingrédients par groupe
    setIngredientDraft(defaultIngredientDraft(ingredientDraft.group));
    setIngredientSuggestions([]);
    setIngredientWarning(null);
    setAllowDuplicateIngredient(false);
  }

  function removeIngredient(ingredientId) {
    setForm((previous) => ({ ...previous, ingredients: previous.ingredients.filter((item) => item.id !== ingredientId) }));
  }

  function submitRecipe(event) {
    if (event?.preventDefault) event.preventDefault();
    /* Nom + catégorie suffisent à créer (handoff 7a) — le pied de page dit
       lequel des deux manque plutôt que de griser un bouton sans explication.
       Plus de garde sur les mois : une sélection vide vaut « toute l'année ». */
    if (!form.name.trim() || !form.category) return;
    const payload = buildRecipePayload(form);
    if (editingRecipeId) {
      onUpdateRecipe?.(editingRecipeId, payload);
      closeEditPage();
      return;
    }
    // Création : on enchaîne sur la fiche de la recette qui vient d'être ajoutée
    const createdId = onAddRecipe(payload);
    closeEditPage();
    if (createdId) setSheetRecipeId(createdId);
  }

  async function deleteEditingRecipe() {
    if (!editingRecipeId) return;
    const ok = await confirmDialog({
      header: "Supprimer la recette",
      message: "Cette action est définitive.",
      confirmText: "Supprimer",
      destructive: true,
    });
    if (!ok) return;
    onDeleteRecipe?.(editingRecipeId);
    closeEditPage();
  }

  function handlePickPhoto() {
    setPhotoError("");
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
      photoInputRef.current.click();
    }
  }

  async function handlePhotoInputChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    setPhotoError("");
    try {
      const b64 = await compressImageToBase64(file);
      const sizeKB = Math.round(b64.length * 0.75 / 1024);
      if (sizeKB > 80) {
        setPhotoError(`Image trop lourde (${sizeKB} Ko). Choisis une photo plus petite.`);
        setPhotoLoading(false);
        return;
      }
      setForm((prev) => ({ ...prev, photo: b64 }));
    } catch (_) {
      setPhotoError("Impossible de charger cette photo.");
    }
    setPhotoLoading(false);
  }

  function renderEssentialToggle(condiment) {
    const isOn = Array.isArray(form.condiments) && form.condiments.includes(condiment.id);
    return html`
      <button key=${condiment.id} type="button" className=${`condiment-toggle ${isOn ? "on" : ""}`} onClick=${() => toggleFormCondiment(condiment.id)}>
        ${condiment.label}
      </button>
    `;
  }

  function renderCustomSavedToggle(name) {
    const isOn = Array.isArray(form.condiments) && form.condiments.includes(name);
    return html`
      <div key=${name} className="condiment-custom-item">
        <button type="button" className=${`condiment-toggle ${isOn ? "on" : ""}`} onClick=${() => toggleFormCondiment(name)}>
          ${name}
        </button>
        <button type="button" className="condiment-custom-remove" onClick=${() => removeCustomCondiment(name)}>X</button>
      </div>
    `;
  }

  function renderSuggestion(item) {
    return html`
      <button key=${item.id} type="button" className="suggest-item" onMouseDown=${() => useIngredientSuggestion(item)}>
        <span>${item.name}</span>
        ${formatQuantityUnit(item.quantity, item.unit)
          ? html`<span className="mini" style=${{ marginLeft: "auto" }}>${formatQuantityUnit(item.quantity, item.unit)}</span>`
          : null}
      </button>
    `;
  }

  const savedCustomCondiments = (Array.isArray(customCondiments) ? customCondiments : []).filter((name) => !ESSENTIAL_ID_SET.has(name));


  /* ── Page création / édition : un seul défilement (handoff 7a) ──
     Le formulaire empilait une carte d'import, un héros à quatre menus
     flottants et deux sous-onglets qui cachaient la moitié du travail. Il
     devient quatre sections nommées sur un seul défilement, dans l'ordre où
     on les remplit. L'import est parti dans sa propre feuille (7c), le choix
     du point de départ dans la sienne (7b). */
  function renderEditPage() {
    const isEdit = Boolean(editingRecipeId);

    const totalTime = formTotalTime(form);
    const isQuick = derivedQuick(form);
    const months = uniqueMonths(form.months);
    const activeSeasons = seasonsFromMonths(months);
    const constraintCount = (form.constraints || []).length;
    const ingredientCount = form.ingredients.length;
    const hasCondiments = Array.isArray(form.condiments) && form.condiments.length > 0;

    const missing = [];
    if (!form.name.trim()) missing.push("le nom");
    if (!form.category) missing.push("la catégorie");
    const ready = missing.length === 0;

    const availSummary = !months.length
      ? "Toute l'année"
      : activeSeasons.length
        ? activeSeasons.map((id) => seasonById(id).label).join(" + ")
        : `${months.length} mois`;

    const constraintSummary = constraintCount === 0
      ? "Aucune contrainte"
      : constraintCount <= 2
        ? (form.constraints || []).map((id) => CONSTRAINT_LABELS.find((c) => c.id === id)?.label || "").filter(Boolean).join(" · ")
        : `${constraintCount} contraintes`;

    const condimentSummary = hasCondiments
      ? form.condiments.slice(0, 3).map(condimentLabel).join(" · ") + (form.condiments.length > 3 ? ` +${form.condiments.length - 3}` : "")
      : "Sel, poivre, huile… ce qu'on ne met pas sur la liste de courses";

    return html`
      <div className="recipe-sheet recipe-sheet--edit nrec">

        <header className="nrec-hdr">
          <button type="button" className="nrec-back" onClick=${closeEditPage} aria-label="Annuler">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
          <span className="nrec-hdr-titles">
            <span className="nrec-hdr-title">${form.name.trim() || "Sans nom"}</span>
            <span className="nrec-hdr-sub">${isEdit ? "Modification" : "Nouvelle recette"}</span>
          </span>
          <button type="button"
            className=${`nrec-hdr-save ${ready ? "on" : ""}`}
            onClick=${submitRecipe}
            disabled=${!ready}>Enregistrer</button>
        </header>

        <div className="nrec-body">

          <!-- ── 1 · L'essentiel ──────────────────────────────── -->
          <section className="nrec-section">
            <div className="nrec-section-head">
              <span className="nrec-section-num">1 · L'essentiel</span>
              <span className=${`nrec-section-note ${ready ? "ok" : "todo"}`}>
                ${ready ? "complet" : `il manque ${missing.join(" et ")}`}
              </span>
            </div>

            ${cameFromImport ? html`
              <div className="nrec-import-reminder">
                ✓ Pré-rempli depuis le lien — vérifie les champs avant d'enregistrer.
              </div>
            ` : null}

            <!-- Input fichier attaché au DOM (évite le GC sur mobile) -->
            <input type="file" accept="image/*"
              style=${{ display: "none" }}
              ref=${photoInputRef}
              onChange=${handlePhotoInputChange} />

            ${form.photo ? html`
              <div className="nrec-photo nrec-photo--set">
                <img src=${form.photo} className="nrec-photo-img" alt="" />
                <button type="button" className="nrec-photo-remove"
                  onClick=${() => { setForm((prev) => ({ ...prev, photo: "" })); setPhotoError(""); }}
                  aria-label="Supprimer la photo">✕</button>
              </div>
            ` : html`
              <button type="button" className="nrec-photo" onClick=${handlePickPhoto}>
                ${photoLoading
                  ? html`<span className="nrec-photo-loading">⏳</span>`
                  : html`
                      <span className="nrec-photo-icon">📷</span>
                      <span className="nrec-photo-label">Ajouter une photo</span>
                      <span className="nrec-photo-hint">sinon l'icône de catégorie</span>
                    `}
              </button>
            `}
            ${photoError ? html`<div className="nrec-photo-error">${photoError}</div>` : null}

            <input
              className="nrec-name"
              type="text"
              placeholder="Nom de la recette"
              value=${form.name}
              onInput=${(e) => setForm({ ...form, name: e.target.value })}
              autoComplete="off"
            />

            <div className="nrec-field">
              <span className="nrec-label">Catégorie</span>
              <div className="nrec-cat-rail">
                ${CATEGORIES.map((cat) => {
                  const isOn = form.category === cat.id;
                  return html`
                    <button type="button" key=${cat.id}
                      className=${`nrec-cat-item ${categoryToneClass(cat.id)} ${isOn ? "on" : ""}`}
                      aria-pressed=${isOn}
                      onClick=${() => setForm({ ...form, category: isOn ? "" : cat.id })}>
                      <span className="nrec-cat-dot">
                        <${CategoryIcon} categoryId=${cat.id} size=${23} framed=${false}
                          color=${isOn ? "var(--mrd-white)" : "var(--cat)"} />
                      </span>
                      <span className="nrec-cat-label">${cat.label}</span>
                    </button>
                  `;
                })}
              </div>
            </div>

            <div className="nrec-times">
              ${[
                { id: "prepTime", label: "Prépa" },
                { id: "cookTime", label: "Cuisson" },
              ].map((field) => html`
                <div className="nrec-time" key=${field.id}>
                  <span className="nrec-time-label">${field.label}</span>
                  <span className="nrec-time-row">
                    <button type="button" className="nrec-step" aria-label=${`Moins de ${field.label.toLowerCase()}`}
                      onClick=${() => stepTime(field.id, -5)}>−</button>
                    <span className="nrec-time-value">${Number(form[field.id]) || 0}</span>
                    <button type="button" className="nrec-step" aria-label=${`Plus de ${field.label.toLowerCase()}`}
                      onClick=${() => stepTime(field.id, 5)}>+</button>
                  </span>
                </div>
              `)}
              <div className="nrec-time nrec-time--total">
                <span className="nrec-time-label">Total</span>
                <span className="nrec-time-value">${totalTime ? `${totalTime} min` : "—"}</span>
                <span className=${`nrec-time-note ${isQuick ? "quick" : ""}`}>
                  ${totalTime === 0 ? "temps non renseigné" : isQuick ? "⚡ marquée rapide" : "au-delà de 20 min"}
                </span>
              </div>
            </div>

            <div className="nrec-row">
              <span className="nrec-row-copy">
                <span className="nrec-row-title">Pour combien</span>
                <span className="nrec-row-sub">Les quantités se recalculent à la lecture</span>
              </span>
              <span className="nrec-row-stepper">
                <button type="button" className="nrec-step" aria-label="Moins de personnes"
                  onClick=${() => setServings((Number(form.servings) || 4) - 1)}>−</button>
                <span className="nrec-servings">${form.servings || 4} pers.</span>
                <button type="button" className="nrec-step" aria-label="Plus de personnes"
                  onClick=${() => setServings((Number(form.servings) || 4) + 1)}>+</button>
              </span>
            </div>
          </section>

          <!-- ── 2 · Classement ───────────────────────────────── -->
          <section className="nrec-section">
            <div className="nrec-section-head">
              <span className="nrec-section-num">2 · Classement</span>
              <span className="nrec-section-note">sert aux filtres de la page Recettes</span>
            </div>

            <div className="nrec-field">
              <span className="nrec-label">Type alimentaire</span>
              <div className="nrec-tiles nrec-tiles--4">
                ${FOOD_TYPES.map((type) => html`
                  <button type="button" key=${type.id}
                    className=${`nrec-tile ${form.foodType === type.id ? "on" : ""}`}
                    aria-pressed=${form.foodType === type.id}
                    onClick=${() => setForm({ ...form, foodType: form.foodType === type.id ? "" : type.id })}>
                    <span className="nrec-tile-icon">${type.icon}</span>
                    <span className="nrec-tile-label">${type.label}</span>
                  </button>
                `)}
              </div>
            </div>

            <div className="nrec-field">
              <span className="nrec-label">Contraintes</span>
              <button type="button"
                className=${`nrec-collapse ${constraintCount > 0 ? "on" : ""}`}
                aria-expanded=${constraintsOpen}
                onClick=${() => setConstraintsOpen((open) => !open)}>
                <span className="nrec-collapse-summary">${constraintSummary}</span>
                <span className="nrec-collapse-caret">${constraintsOpen ? "▴" : "▾"}</span>
              </button>
              ${constraintsOpen ? html`
                <div className="nrec-checklist">
                  ${CONSTRAINT_LABELS.map((c) => {
                    const isOn = (form.constraints || []).includes(c.id);
                    return html`
                      <button type="button" key=${c.id}
                        className=${`nrec-check-row ${isOn ? "on" : ""}`}
                        aria-pressed=${isOn}
                        onClick=${() => toggleFormConstraint(c.id)}>
                        <span className="nrec-check-box">${isOn ? "✓" : ""}</span>
                        <span className="nrec-check-label">${c.label}</span>
                      </button>
                    `;
                  })}
                </div>
              ` : null}
            </div>

            <div className="nrec-field">
              <span className="nrec-label nrec-label--split">
                Disponibilité
                <span className=${`nrec-label-value ${months.length ? "on" : ""}`}>${availSummary}</span>
              </span>
              <div className="nrec-tiles nrec-tiles--4">
                ${SEASONS.map((season) => {
                  const isOn = activeSeasons.includes(season.id);
                  return html`
                    <button type="button" key=${season.id}
                      className=${`nrec-tile ${isOn ? "on" : ""}`}
                      aria-pressed=${isOn}
                      onClick=${() => toggleSeason(season)}>
                      <span className="nrec-tile-icon">${SEASON_ICONS[season.id]}</span>
                      <span className="nrec-tile-label">${season.label}</span>
                    </button>
                  `;
                })}
              </div>
              <div className="nrec-months">
                ${MONTHS.map((month) => {
                  const isOn = months.includes(month.id);
                  return html`
                    <button type="button" key=${month.id}
                      className=${`nrec-month ${isOn ? "on" : ""}`}
                      aria-pressed=${isOn}
                      aria-label=${month.label}
                      title=${month.label}
                      onClick=${() => setForm({ ...form, months: toggleMonthSelection(form.months, month.id) })}>
                      ${month.label.slice(0, 1)}
                    </button>
                  `;
                })}
              </div>
              <span className="nrec-hint">Rien de coché = disponible toute l'année.</span>
            </div>
          </section>

          <!-- ── 3 · Ingrédients ──────────────────────────────── -->
          <section className="nrec-section">
            <div className="nrec-section-head">
              <span className="nrec-section-num">3 · Ingrédients</span>
              <span className=${`nrec-section-note ${ingredientCount ? "ok" : ""}`}>
                ${ingredientCount ? `${ingredientCount} ingrédient${ingredientCount > 1 ? "s" : ""}` : "aucun"}
              </span>
            </div>

            <div className="nrec-ing-composer">
              <div className="nrec-ing-row">
                <div className="nrec-ing-name-wrap">
                  <input className="nrec-inp nrec-ing-name"
                    placeholder="Ingrédient"
                    value=${ingredientDraft.name}
                    onInput=${(e) => handleIngredientNameInput(e.target.value)}
                    onBlur=${() => { setTimeout(() => setIngredientSuggestions([]), 150); }}
                  />
                  ${ingredientSuggestions.length ? html`<div className="suggest-dropdown">${ingredientSuggestions.map(renderSuggestion)}</div>` : null}
                </div>
                <input className="nrec-inp nrec-ing-qty" placeholder="Qté"
                  value=${ingredientDraft.quantity}
                  onInput=${(e) => setIngredientDraft({ ...ingredientDraft, quantity: e.target.value })} />
                <select className="nrec-inp nrec-ing-unit" value=${ingredientDraft.unit}
                  onChange=${(e) => setIngredientDraft({ ...ingredientDraft, unit: e.target.value })}>
                  ${UNITS.map((u) => html`<option key=${u.value} value=${u.value}>${u.label}</option>`)}
                </select>
                <button type="button"
                  className=${`nrec-ing-add ${ingredientDraft.name.trim() ? "on" : ""}`}
                  onClick=${addIngredient} aria-label="Ajouter l'ingrédient">+</button>
              </div>
              <input className="nrec-ing-group" list="recipe-ing-groups"
                placeholder="Groupe (optionnel) — ex : Pour la pâte"
                value=${ingredientDraft.group}
                onInput=${(e) => setIngredientDraft({ ...ingredientDraft, group: e.target.value })} />
              <datalist id="recipe-ing-groups">
                ${[...new Set(form.ingredients.map((item) => String(item.group || "").trim()).filter(Boolean))]
                  .map((g) => html`<option key=${g} value=${g}></option>`)}
              </datalist>
              ${ingredientWarning && !allowDuplicateIngredient ? html`
                <div className="nrec-ing-warning">
                  <span className="nrec-ing-warning-text">Similaire : <strong>${ingredientWarning.name}</strong></span>
                  <span className="nrec-ing-warning-actions">
                    <button type="button" className="nrec-mini-btn on" onClick=${() => useIngredientSuggestion(ingredientWarning)}>Utiliser</button>
                    <button type="button" className="nrec-mini-btn" onClick=${() => setAllowDuplicateIngredient(true)}>Créer quand même</button>
                  </span>
                </div>
              ` : null}
            </div>

            ${ingredientCount
              ? groupIngredients(form.ingredients).map((section, sectionIndex) => html`
                  <div className="nrec-ing-group-block" key=${`edit-grp-${sectionIndex}`}>
                    ${section.group ? html`<span className="nrec-ing-group-title">${section.group}</span>` : null}
                    ${section.items.map((ing, i) => html`
                      <div key=${ing.id || `ing-${sectionIndex}-${i}`} className="nrec-ing-item">
                        <span className="nrec-ing-item-name">${ing.name}</span>
                        ${formatQuantityUnit(ing.quantity, ing.unit)
                          ? html`<span className="nrec-ing-item-qty">${formatQuantityUnit(ing.quantity, ing.unit)}</span>`
                          : null}
                        <button type="button" className="nrec-ing-item-remove"
                          onClick=${() => removeIngredient(ing.id)} aria-label=${`Retirer ${ing.name}`}>×</button>
                      </div>
                    `)}
                  </div>
                `)
              : html`<div className="nrec-empty">Aucun ingrédient — c'est ce qui alimente la liste de courses.</div>`}

            <div className="nrec-row nrec-row--dashed">
              <span className="nrec-row-copy">
                <span className="nrec-row-title">Condiments</span>
                <span className="nrec-row-sub">${condimentSummary}</span>
              </span>
              <button type="button" className="nrec-mini-btn"
                onClick=${() => setShowCondimentAdd((open) => !open)}>
                ${showCondimentAdd ? "Réduire" : "Modifier"}
              </button>
            </div>

            ${showCondimentAdd ? html`
              <div className="condiment-section-box">
                <div className="condiment-grid">
                  ${CONDIMENT_ESSENTIALS.map(renderEssentialToggle)}
                </div>
                ${savedCustomCondiments.length ? html`
                  <div className="condiment-extra-actions">
                    <button type="button" className="condiment-add-more" onClick=${() => setShowSavedCondiments((v) => !v)}>
                      ${showSavedCondiments ? "Masquer mes condiments" : `+ Mes condiments (${savedCustomCondiments.length})`}
                    </button>
                  </div>
                  ${showSavedCondiments ? html`<div className="condiment-grid condiment-grid-extra">${savedCustomCondiments.map(renderCustomSavedToggle)}</div>` : null}
                ` : null}
                <div className="condiment-add-row" style=${{ marginTop: "8px" }}>
                  <input className="ainp" style=${{ fontSize: "12px", padding: "5px 9px", flex: "1" }}
                    placeholder="Ajouter un condiment…"
                    value=${customCondimentInput}
                    onInput=${(e) => setCustomCondimentInput(e.target.value)}
                    onKeyDown=${(e) => { if (e.key === "Enter") { e.preventDefault(); submitCustomCondiment(); } }}
                  />
                  <button type="button" className="task-choice on" style=${{ fontSize: "12px", padding: "5px 10px" }} onClick=${submitCustomCondiment}>OK</button>
                </div>
              </div>
            ` : null}
          </section>

          <!-- ── 4 · Préparation ──────────────────────────────── -->
          <section className="nrec-section">
            <div className="nrec-section-head">
              <span className="nrec-section-num">4 · Préparation</span>
              <span className="nrec-section-note">optionnel</span>
            </div>
            <textarea
              className="nrec-method"
              placeholder="Décris les étapes, les astuces…"
              value=${form.method}
              onInput=${(e) => setForm({ ...form, method: e.target.value })}
            ></textarea>
            <span className="nrec-hint">Une étape par ligne : le mode cuisson vocal les lira une à une.</span>
          </section>

          ${isEdit ? html`
            <button type="button" className="nrec-delete" onClick=${deleteEditingRecipe}>
              Supprimer la recette
            </button>
          ` : null}
        </div>

        <footer className="nrec-foot">
          <span className="nrec-foot-copy">
            <span className=${`nrec-foot-label ${ready ? "ok" : ""}`}>
              ${ready ? "Prêt à enregistrer" : `Il manque ${missing.join(" et ")}`}
            </span>
            <span className="nrec-foot-sub">
              ${ready ? "Le reste peut venir plus tard." : "Nom + catégorie suffisent, le reste peut venir après."}
            </span>
          </span>
          <button type="button"
            className=${`nrec-cta ${ready ? "on" : ""}`}
            onClick=${submitRecipe}
            disabled=${!ready}>
            ${isEdit ? "Enregistrer" : "Créer la recette"}
          </button>
        </footer>
      </div>
    `;
  }

  /* ── 7b · D'où vient cette recette ? ────────────────────────
     Le « + » de la bibliothèque demandait le formulaire directement, carte
     d'import en tête — elle passait pour une étape obligatoire. Il ouvre
     maintenant une feuille de deux chemins, qui arrivent tous deux sur le
     formulaire de 7a. */
  function renderSourceSheet() {
    const options = [
      {
        id: "import",
        icon: "🔗",
        title: "Importer un lien",
        sub: "On lit la page et on remplit la fiche pour toi.",
        meta: "le plus rapide",
        accent: true,
        pick: startImport,
      },
      {
        id: "manual",
        icon: "✏️",
        title: "Créer à la main",
        sub: "Un formulaire vierge, à remplir dans l'ordre.",
        meta: "à partir de zéro",
        accent: false,
        pick: startManual,
      },
    ];

    return html`
      <${MrdModal}
        isOpen=${sourceSheetOpen}
        onClose=${() => setSourceSheetOpen(false)}
        sheet=${true}
        sheetBreakpoint=${0.46}
        className="rsrc-sheet"
      >
        <div className="rsrc">
          <div className="rsrc-head">
            <span className="rsrc-title">D'où vient cette recette ?</span>
            <span className="rsrc-sub">Tu pourras tout modifier ensuite.</span>
          </div>
          ${options.map((option) => html`
            <button type="button" key=${option.id}
              className=${`rsrc-option ${option.accent ? "accent" : ""}`}
              onClick=${option.pick}>
              <span className="rsrc-option-icon">${option.icon}</span>
              <span className="rsrc-option-copy">
                <span className="rsrc-option-title">${option.title}</span>
                <span className="rsrc-option-sub">${option.sub}</span>
                <span className="rsrc-option-meta">${option.meta}</span>
              </span>
              <span className="rsrc-option-caret">›</span>
            </button>
          `)}
          <button type="button" className="rsrc-cancel" onClick=${() => setSourceSheetOpen(false)}>Annuler</button>
        </div>
      <//>
    `;
  }

  /* ── 7c · Importer, sans quitter la liste ───────────────────
     L'import était une carte en tête du formulaire, doublée d'une modale de
     progression non fermable. Il devient une feuille qui ne demande qu'une
     chose — le lien — et raconte sa lecture champ par champ plutôt que de
     faire tourner un rond. */
  function renderImportSheet() {
    const { step, marks, found, error } = importState;
    const stepLabel = step === "loading" ? "lecture en cours"
      : step === "done" ? "étape 2 · vérification"
      : step === "failed" ? "échec de la lecture"
      : "étape 1 · le lien";

    const footLabel = step === "loading" ? "Lecture en cours…"
      : step === "done" ? "Recette lue"
      : step === "failed" ? "Rien à importer"
      : "Colle un lien pour commencer";
    const footSub = step === "done"
      ? (found?.name || "")
      : step === "failed"
        ? "Tu peux réessayer ou saisir à la main."
        : "Marmiton, 750g, un blog de cuisine…";
    const ctaLabel = step === "done" ? "Vérifier et compléter" : step === "failed" ? "Saisir à la main" : "Importer";
    const ctaEnabled = step === "done" || step === "failed" || Boolean(importUrl.trim());

    function onCta() {
      if (step === "done") { openFormFromImport(); return; }
      if (step === "failed") { startManual(); return; }
      handleImportFromUrl();
    }

    return html`
      <${MrdModal}
        isOpen=${importSheetOpen}
        onClose=${closeImportSheet}
        sheet=${true}
        sheetBreakpoint=${0.88}
        backdropDismiss=${step !== "loading"}
        className="rimp-sheet"
      >
        <div className="rimp">
          <div className="rimp-head">
            <span className="rimp-head-copy">
              <span className="rimp-title">Importer une recette</span>
              <span className="rimp-step">${stepLabel}</span>
            </span>
            <button type="button" className="rimp-close" onClick=${closeImportSheet} aria-label="Fermer">✕</button>
          </div>

          <div className="rimp-body">
            <div className="rimp-field-block">
              <div className=${`rimp-field ${error ? "err" : ""}`}>
                <span className="rimp-field-icon">🔗</span>
                <input className="rimp-input" type="url"
                  placeholder="Colle l'adresse de la recette"
                  value=${importUrl}
                  disabled=${step === "loading"}
                  onInput=${(e) => { setImportUrl(e.target.value); if (importState.step !== "idle") setImportState(defaultImportState()); }}
                />
                ${importUrl ? html`
                  <button type="button" className="rimp-field-clear" onClick=${() => { setImportUrl(""); setImportState(defaultImportState()); }} aria-label="Effacer">✕</button>
                ` : null}
              </div>
              <button type="button" className="rimp-paste" onClick=${pasteImportUrl} disabled=${step === "loading"}>
                📋 Coller depuis le presse-papier
              </button>
              <span className=${`rimp-hint ${error ? "err" : ""}`}>
                ${error || "La plupart des sites de cuisine fonctionnent. Le lien reste en note si la lecture échoue."}
              </span>
            </div>

            ${step === "loading" ? html`
              <div className="rimp-card">
                <span className="rimp-loading-head">
                  <span className="rimp-spinner"></span>
                  <span className="rimp-loading-label">Lecture de la page…</span>
                </span>
                ${IMPORT_STEPS.map((s) => html`
                  <span className="rimp-step-row" key=${s.id}>
                    <span className=${`rimp-mark ${marks[s.id] || "pending"}`}>${markGlyph(marks[s.id])}</span>
                    <span className=${`rimp-step-label ${marks[s.id] === "pending" || !marks[s.id] ? "waiting" : ""}`}>${s.label}</span>
                  </span>
                `)}
              </div>
            ` : null}

            ${step === "done" && found ? html`
              <div className="rimp-result">
                <div className="rimp-ok">
                  <span className="rimp-ok-mark">✓</span>
                  <span className="rimp-ok-label">Recette lue — vérifie avant d'enregistrer</span>
                </div>

                <div className="rimp-found">
                  <${CategoryIcon} categoryId=${found.category || "main"} size=${58} />
                  <span className="rimp-found-copy">
                    <span className="rimp-found-name">${found.name}</span>
                    <span className="rimp-found-meta">${found.meta}</span>
                    <span className="rimp-found-host">${found.host}</span>
                  </span>
                </div>

                <div className="rimp-fields">
                  <span className="rimp-fields-title">Ce qu'on a trouvé</span>
                  ${found.fields.map((field) => html`
                    <div className=${`rimp-field-row ${field.mark}`} key=${field.label}>
                      <span className=${`rimp-mark ${field.mark}`}>${markGlyph(field.mark)}</span>
                      <span className="rimp-field-label">${field.label}</span>
                      <span className="rimp-field-value">${field.value}</span>
                    </div>
                  `)}
                  <span className="rimp-gap-note">
                    ${found.fields.some((f) => f.mark === "none")
                      ? "Ce qui manque reste à compléter dans le formulaire."
                      : "Tout y est — un dernier coup d'œil et c'est enregistré."}
                  </span>
                </div>
              </div>
            ` : null}

            ${step === "failed" ? html`
              <div className="rimp-failed">
                <span className="rimp-failed-title">Page illisible</span>
                <span className="rimp-failed-copy">
                  Le site bloque la lecture, ou la page n'est pas une recette. Tu peux réessayer,
                  ou passer à la saisie à la main — tu garderas le lien en note.
                </span>
                <span className="rimp-failed-actions">
                  <button type="button" className="rimp-retry" onClick=${handleImportFromUrl}>Réessayer</button>
                  <button type="button" className="rimp-manual" onClick=${startManual}>Saisir à la main</button>
                </span>
              </div>
            ` : null}
          </div>

          <div className="rimp-foot">
            <span className="rimp-foot-copy">
              <span className=${`rimp-foot-label ${step === "done" ? "ok" : ""}`}>${footLabel}</span>
              <span className="rimp-foot-sub">${footSub}</span>
            </span>
            <button type="button"
              className=${`rimp-cta ${ctaEnabled ? "on" : ""}`}
              onClick=${onCta}
              disabled=${!ctaEnabled || step === "loading"}>${ctaLabel}</button>
          </div>
        </div>
      <//>
    `;
  }

  const sectionClass = `rwrap recipes-page${sheetRecipe ? " recipes-page--sheet" : ""}${showEditPage ? " recipes-page--edit" : ""}`;

  /* La bibliothèque est un écran à part entière (handoff 6a) : elle porte son
     propre en-tête et ses propres filtres, et remplace la liste dès que ni la
     fiche ni le formulaire ne sont ouverts. */
  if (!sheetRecipe && !showEditPage) {
    /* Les deux feuilles de 7b et 7c se posent PAR-DESSUS la bibliothèque :
       « on reste sur ses recettes, ✕ annule sans rien perdre ». Elles vivent
       donc sur ce chemin de rendu, pas sur celui du formulaire. */
    return html`
      <${React.Fragment}>
        <${RecipeLibrary}
          recipes=${recipes}
          inventory=${inventory}
          linkInventory=${linkInventory}
          onOpenRecipe=${openRecipeSheet}
          onCreateRecipe=${openCreateModal}
          onLoadDemoRecipes=${onLoadDemoRecipes}
          onPlanRecipe=${onOpenMealsTab ? () => onOpenMealsTab() : null}
          onToggleFavorite=${onToggleRecipeFavorite ? (recipe) => onToggleRecipeFavorite(recipe.id, !recipe.favorite) : null}
          onBack=${onBack}
        />
        ${renderSourceSheet()}
        ${renderImportSheet()}
      <//>
    `;
  }

  return html`
    <section className=${sectionClass}>
      ${sheetRecipe
        ? html`<${RecipeSheet}
            key=${sheetRecipe.id}
            recipe=${sheetRecipe}
            onClose=${closeRecipeSheet}
            onEdit=${openEditModalFromSheet}
            onPlan=${onOpenMealsTab ? () => { onOpenMealsTab(); closeRecipeSheet(); } : null}
            onAddToShopping=${onAddRecipeIngredientsToShopping}
          />`
        : null}
      ${showEditPage ? renderEditPage() : null}
    </section>
  `;
}

import { html, useEffect, useMemo, useRef, useState } from "../../lib.js";
import { findSimilarItem, formatQuantityUnit, suggestItems } from "../../utils/productUtils.js";
import { CONDIMENTS, CONDIMENT_ESSENTIALS } from "../../config/condiments.js";
import { CategoryIcon, categoryToneClass } from "./CategoryIcons.js";
import { RecipeSheet, groupIngredients, condimentLabel } from "./RecipeSheet.js";
import { RecipeLibrary } from "./RecipeLibrary.js";
import drinkFallbackIllustration from "../../../assets/recipe-drink-fallback.svg";
import { scrapeRecipeFromUrl, categorizeRecipe, importErrorMessage } from "../../providers/clientRecipes.js";
import { confirmDialog } from "../../utils/dialogs.js";
import { MrdModal } from "../../components/MrdModal.js";
import { IonProgressBar } from "@ionic/react";

const DRINK_FALLBACK_ILLUSTRATION = drinkFallbackIllustration;

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

/* Catégories de recettes */
const CATEGORIES = [
  { id: "starter",   label: "Entrée" },
  { id: "main",      label: "Plat" },
  { id: "dessert",   label: "Dessert" },
  { id: "breakfast", label: "Petit-déj / goûter" },
  { id: "drink",     label: "Boisson" },
  { id: "base",      label: "Base maison" },
];

/* Conservé pour l'affichage des badges sur les cartes (rétro-compatibilité) */
const FOOD_LABELS = [
  { id: "vegetarian",  label: "Végétarien",  icon: "🥕" },
  { id: "vegan",       label: "Vegan",        icon: "🌱" },
  { id: "omnivore",    label: "Omnivore",     icon: "🍖" },
  { id: "pescetarian", label: "Pescétarien", icon: "🐟" },
  { id: "flexitarian", label: "Flexitarien",  icon: "🌿" },
  { id: "lactose_free",label: "Sans lactose", icon: "🥛" },
  { id: "gluten_free", label: "Sans gluten",  icon: "🌾" },
  { id: "egg_free",    label: "Sans œufs",icon: "🥚" },
  { id: "nut_free",    label: "Sans fruits à coque", icon: "🥜" },
  { id: "pork_free",   label: "Sans porc",    icon: "🐷" },
  { id: "halal",       label: "Halal",        icon: "🕌" },
  { id: "kosher",      label: "Casher",       icon: "✡️" },
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

function defaultIngredientDraft(group = "") {
  return { name: "", quantity: "", unit: "", group };
}

function defaultRecipeForm() {
  return {
    name: "", servings: 4, availabilityMode: "all_year", season: "spring", seasons: ["spring"],
    seasonScope: "full", months: [],
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
  const season = recipe?.season || "spring";
  const seasons = Array.isArray(recipe?.seasons) && recipe.seasons.length ? [...recipe.seasons] : (season ? [season] : ["spring"]);
  const seasonMonths = [...new Set(seasons.flatMap((seasonId) => seasonById(seasonId).months || []))];
  const months = uniqueMonths(recipe?.months || []);
  const seasonScope = availabilityMode === "season" && months.length && seasonMonths.length
    && !(months.length === seasonMonths.length && months.every((month) => seasonMonths.includes(month)))
    ? "custom" : "full";
  const allLabels = Array.isArray(recipe?.labels) ? [...recipe.labels] : [];
  const foodType = allLabels.find((id) => FOOD_TYPE_IDS.has(id)) || "";
  const constraints = allLabels.filter((id) => CONSTRAINT_IDS.has(id));
  return {
    name: String(recipe?.name || "").trim(),
    servings: Math.max(1, Math.min(24, Number(recipe?.servings || 4) || 4)),
    availabilityMode, season, seasons, seasonScope, months,
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

function recipeMonths(recipe) {
  if (recipe.availabilityMode === "all_year") return MONTHS.map((month) => month.id);
  if (recipe.availabilityMode === "season") {
    if (Array.isArray(recipe.months) && recipe.months.length) return uniqueMonths(recipe.months);
    if (Array.isArray(recipe.seasons) && recipe.seasons.length) return uniqueMonths(recipe.seasons.flatMap((seasonId) => seasonById(seasonId).months || []));
    return [...(seasonById(recipe.season).months || [])];
  }
  return uniqueMonths(recipe.months);
}

function toggleMonthSelection(currentMonths, monthId, allowedMonths = null) {
  const safeCurrent = uniqueMonths(currentMonths);
  const next = safeCurrent.includes(monthId) ? safeCurrent.filter((value) => value !== monthId) : [...safeCurrent, monthId];
  return uniqueMonths(allowedMonths ? next.filter((value) => allowedMonths.includes(value)) : next);
}

function buildRecipePayload(form) {
  const season = seasonById(form.season);
  const seasons = Array.isArray(form.seasons) && form.seasons.length ? [...new Set(form.seasons)] : (form.season ? [form.season] : []);
  /* Fusionner foodType + constraints dans labels (retro-compat) */
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
    quick: Boolean(form.quick),
    prepTime: form.prepTime ? String(form.prepTime) : "",
    cookTime: form.cookTime ? String(form.cookTime) : "",
    photo: form.photo || "",
    labels,
    ingredients,
    ingredientsLegacy: "",
    condiments,
    method: form.method,
  };

  if (form.availabilityMode === "all_year") {
    return { ...base, availabilityMode: "all_year", season: "", months: [] };
  }
  if (form.availabilityMode === "season") {
    const allowedMonths = [...new Set(seasons.flatMap((seasonId) => seasonById(seasonId).months || []))];
    const months = form.seasonScope === "full" ? allowedMonths : uniqueMonths(form.months).filter((monthId) => allowedMonths.includes(monthId));
    return { ...base, availabilityMode: "season", season: seasons[0] || season.id, seasons, months };
  }
  return { ...base, availabilityMode: "months", season: "", months: uniqueMonths(form.months) };
}

function renderRecipeFallbackVisual(recipeLike, variant = "thumb", size = 56) {
  const isDrink = String(recipeLike?.category || "").trim() === "drink";
  // Pour "thumb", on utilise toujours CategoryIcon (masque CSS sans fond) comme MealsView.
  // Le SVG illustré avec fond vert n'est utilisé que pour hero et edit (contextes plus grands).
  if (isDrink && !recipeLike?.photo && variant !== "thumb") {
    const className =
      variant === "hero"
        ? "recipe-drink-fallback-svg recipe-drink-fallback-svg--hero"
        : "recipe-drink-fallback-svg recipe-drink-fallback-svg--edit";
    return html`<img src=${DRINK_FALLBACK_ILLUSTRATION} alt="" className=${className} />`;
  }
  return html`<${CategoryIcon} categoryId=${recipeLike?.category} size=${size} framed=${false} />`;
}

/** Icône affichée sur la carte : emoji perso ou premier badge alimentaire. */
function recipeCardEmoji(recipe) {
  const raw = recipe?.emoji != null ? String(recipe.emoji).trim() : "";
  if (raw) return raw;
  const labels = Array.isArray(recipe?.labels) ? recipe.labels : [];
  const first = labels.length ? FOOD_LABELS.find((entry) => entry.id === labels[0]) : null;
  return first ? first.icon : "🍳";
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
  const [editTab, setEditTab] = useState("ingredients");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef(null);
  const [openDropdown, setOpenDropdown] = useState(null); // "category" | "foodType" | "avail" | "constraints" | null

  // Recale le menu flottant dans la fenêtre : ancré left:0 sur sa capsule, il
  // déborde à droite quand la capsule est en fin de rangée (ex. Spécialités).
  useEffect(() => {
    if (!openDropdown) return;
    const el = document.querySelector(".recipe-edit-float");
    if (!el) return;
    el.style.left = "";
    const MARGIN = 12;
    const rect = el.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - MARGIN);
    const overflowLeft = MARGIN - rect.left;
    if (overflowRight > 0) el.style.left = `${-overflowRight}px`;
    else if (overflowLeft > 0) el.style.left = `${overflowLeft}px`;
  }, [openDropdown]);
  const [form, setForm] = useState(defaultRecipeForm());

  /* ── Import depuis un site ────────────────────────────────── */
  const [importUrl, setImportUrl] = useState("");
  // step : idle | scraping | categorizing | done ; warning = étape 2 échouée (recette quand même remplie)
  // modal : modale de progression visible ; pct : avancement de la barre
  const [importState, setImportState] = useState({ step: "idle", error: "", warning: "", modal: false, pct: 0 });

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
    setImportState({ step: "idle", error: "", warning: "" });
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
    setEditTab("ingredients");
    setOpenDropdown(null);
  }

  /* ── Import depuis un site (2 étapes : scraping puis analyse IA) ── */
  async function handleImportFromUrl() {
    let url = importUrl.trim();
    if (!url || importState.step === "scraping" || importState.step === "categorizing") return;
    // Liens collés sans schéma (« www.hellofresh.fr/… ») → https:// implicite
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    // Étape 1 — récupération de la recette (recipe-scrapers côté serveur)
    setImportState({ step: "scraping", error: "", warning: "", modal: true, pct: 30 });
    let scraped;
    try {
      scraped = await scrapeRecipeFromUrl(url);
    } catch (error) {
      console.error("[recipes] import scrape error", error?.code, error?.message);
      setImportState({ step: "idle", error: importErrorMessage(error), warning: "", modal: true, pct: 30 });
      return;
    }

    // Remplissage de base — les ingrédients bruts servent de filet si l'IA échoue
    const photo = scraped.image_data_url ? await compressImageDataUrl(scraped.image_data_url) : "";
    const servingsFromYields = parseInt(String(scraped.yields || "").match(/\d+/)?.[0] || "", 10);
    const stamp = Date.now();
    setForm((prev) => ({
      ...prev,
      name: scraped.title || prev.name,
      servings: servingsFromYields >= 1 && servingsFromYields <= 24 ? servingsFromYields : prev.servings,
      prepTime: scraped.prep_time_min ? String(scraped.prep_time_min) : prev.prepTime,
      cookTime: scraped.cook_time_min ? String(scraped.cook_time_min) : prev.cookTime,
      method: scraped.instructions || prev.method,
      photo: photo || prev.photo,
      ingredients: (scraped.ingredients || []).map((line, index) => ({
        id: `recipe-ingredient-${stamp}-${index}`,
        name: String(line), quantity: "", unit: "", group: "",
      })),
    }));

    // Étape 2 — catégorisation par l'IA
    setImportState({ step: "categorizing", error: "", warning: "", modal: true, pct: 72 });
    let analysis;
    try {
      analysis = await categorizeRecipe(scraped);
    } catch (error) {
      console.error("[recipes] import categorize error", error?.code, error?.message);
      setImportState({
        step: "done", error: "", modal: true, pct: 72,
        warning: "Recette récupérée, mais l'analyse IA a échoué — remplis les catégories à la main.",
      });
      return;
    }

    const availability =
      analysis.availability_mode === "season"
        ? { availabilityMode: "season", seasons: analysis.seasons, season: analysis.seasons[0], seasonScope: "full", months: [] }
        : analysis.availability_mode === "months"
          ? { availabilityMode: "months", months: analysis.months, season: "", seasons: ["spring"] }
          : { availabilityMode: "all_year", months: [] };

    // Condiments : uniquement des ids connus de l'app
    const knownCondimentIds = new Set(CONDIMENTS.map((c) => c.id));
    const condiments = (Array.isArray(analysis.condiments) ? analysis.condiments : [])
      .filter((id) => knownCondimentIds.has(id));

    // Étapes de préparation : liste numérotée aérée
    const steps = Array.isArray(analysis.steps) ? analysis.steps.map((s) => String(s).trim()).filter(Boolean) : [];
    const methodText = steps.length
      ? steps.map((step, index) => `${index + 1}. ${step}`).join("\n\n")
      : "";

    const aiStamp = Date.now();
    setForm((prev) => ({
      ...prev,
      ...availability,
      // Traduction : renseignée uniquement si la recette n'était pas en français
      name: analysis.title_fr || prev.name,
      method: methodText || prev.method,
      category: analysis.category || prev.category,
      foodType: analysis.food_type || prev.foodType,
      constraints: Array.isArray(analysis.constraints) ? analysis.constraints : prev.constraints,
      quick: Boolean(analysis.quick),
      servings: analysis.servings >= 1 && analysis.servings <= 24 ? analysis.servings : prev.servings,
      condiments: condiments.length ? [...new Set([...(prev.condiments || []), ...condiments])] : prev.condiments,
      ingredients: Array.isArray(analysis.ingredients) && analysis.ingredients.length
        ? analysis.ingredients.map((item, index) => ({
            id: `recipe-ingredient-${aiStamp}-${index}`,
            name: String(item.name || "").trim(),
            quantity: String(item.quantity || "").trim(),
            unit: String(item.unit || "").trim(),
            group: String(item.group || "").trim(),
          })).filter((item) => item.name)
        : prev.ingredients,
    }));
    setImportState({ step: "done", error: "", warning: "", modal: true, pct: 100 });
    setTimeout(() => {
      setImportState((current) => (current.step === "done" && !current.warning ? { ...current, modal: false } : current));
    }, 900);
  }

  function closeEditPage() {
    setShowEditPage(false);
    setEditingRecipeId("");
    resetEditState();
  }

  function openCreateModal() {
    setEditingRecipeId("");
    resetEditState();
    setShowEditPage(true);
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
    setEditTab("ingredients");
    setOpenDropdown(null);
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
    if (!form.name.trim()) return;
    const payload = buildRecipePayload(form);
    if (payload.availabilityMode === "months" && !payload.months.length) return;
    if (payload.availabilityMode === "season" && !payload.months.length) return;
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

  function renderCondimentBadge(condimentId) {
    return html`<span key=${condimentId} className="condiment-badge">${condimentLabel(condimentId)}</span>`;
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

  function renderIngredientChipEditable(item) {
    return html`
      <div className="recipe-ingredient-chip recipe-ingredient-chip-removable" key=${item.id}>
        <div className="recipe-ingredient-chip-main">
          <span className="recipe-ingredient-chip-name">${item.name}</span>
          ${formatQuantityUnit(item.quantity, item.unit)
            ? html`<span className="recipe-ingredient-chip-qty">${formatQuantityUnit(item.quantity, item.unit)}</span>`
            : null}
        </div>
        <button type="button" className="recipe-ingredient-chip-remove" onClick=${() => removeIngredient(item.id)}>X</button>
      </div>
    `;
  }

  const savedCustomCondiments = (Array.isArray(customCondiments) ? customCondiments : []).filter((name) => !ESSENTIAL_ID_SET.has(name));


  /* ── Page création / édition compacte avec menus flottants ── */
  function renderEditPage() {
    const isEdit = Boolean(editingRecipeId);
    const currentSeasons = Array.isArray(form.seasons) && form.seasons.length ? form.seasons : (form.season ? [form.season] : ["spring"]);

    /* Labels pour les capsules */
    const categoryObj = form.category ? CATEGORIES.find((c) => c.id === form.category) : null;
    const foodTypeObj = form.foodType ? FOOD_TYPES.find((t) => t.id === form.foodType) : null;
    const availLabelShort = form.availabilityMode === "all_year"
      ? "Toute saison"
      : form.availabilityMode === "season"
        ? currentSeasons.map((id) => seasonById(id).label).join(" + ")
        : (() => {
            const ms = recipeMonths(form);
            if (!ms.length) return "Mois…";
            if (ms.length <= 2) return ms.map((id) => MONTHS.find((m) => m.id === id)?.label || "").filter(Boolean).join(" · ");
            return `${ms.length} mois`;
          })();
    const constraintCount = (form.constraints || []).length;
    const thumbEmoji = foodTypeObj ? foodTypeObj.icon : "🍳";
    const hasCondiments = Array.isArray(form.condiments) && form.condiments.length > 0;

    function closeDropdown() { setOpenDropdown(null); }

    return html`
      <div className="recipe-sheet recipe-sheet--edit">

        <header className="mrd-back-hdr mrd-back-hdr-with-side recipe-sheet-header">
          <div className="mrd-back-hdr-main">
            <button type="button" className="mrd-back-btn" onClick=${closeEditPage} aria-label="Annuler">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <span className="mrd-screen-title recipe-sheet-hdr-title">
              ${form.name.trim() || (isEdit ? "Modifier" : "Nouvelle recette")}
            </span>
          </div>
          <div className="mrd-back-hdr-side recipe-sheet-header-actions">
            <button type="button" className="aok recipe-edit-hdr-save" onClick=${submitRecipe}>
              ${isEdit ? "Enregistrer" : "Créer"}
            </button>
          </div>
        </header>

        <div className="recipe-sheet-body">

          <!-- Backdrop invisible — ferme le dropdown ouvert -->
          ${openDropdown ? html`<div className="recipe-edit-backdrop" onClick=${closeDropdown} />` : null}

          <!-- Import depuis un site (création uniquement) -->
          ${!isEdit ? html`
            <div className="mrd-meal-card recipe-import-card">
              <div className="recipe-import-title">🔗 Importer depuis un site</div>
              <div className="recipe-import-row">
                <input
                  className="ainp recipe-import-input"
                  type="url"
                  placeholder="Colle le lien d'une recette (Marmiton, 750g…)"
                  value=${importUrl}
                  onInput=${(e) => { setImportUrl(e.target.value); if (importState.error) setImportState({ step: "idle", error: "", warning: "" }); }}
                  disabled=${importState.step === "scraping" || importState.step === "categorizing"}
                />
                <button type="button" className="aok recipe-import-btn"
                  onClick=${handleImportFromUrl}
                  disabled=${!importUrl.trim() || importState.step === "scraping" || importState.step === "categorizing"}>
                  ${importState.step === "scraping" || importState.step === "categorizing" ? "…" : "Importer"}
                </button>
              </div>
              ${importState.step === "done" && !importState.modal && !importState.warning ? html`
                <div className="recipe-import-status recipe-import-status--ok">✓ Recette importée — vérifie et ajuste avant de créer.</div>` : null}
              ${!importState.modal && importState.warning ? html`
                <div className="recipe-import-status recipe-import-status--warn">${importState.warning}</div>` : null}
              ${!importState.modal && importState.error ? html`
                <div className="recipe-import-status recipe-import-status--error">${importState.error}</div>` : null}
            </div>

            <!-- Modale de progression de l'import -->
            ${importState.modal ? html`
              ${/* Dernier overlay maison de la phase 7, laisse de cote parce
                   qu il n etait pas fermable : ce n est pas une modale au sens
                   « boite qu on ferme », c est un ecran d attente. Il devient
                   une `MrdModal` avec `backdropDismiss` conditionnel — un tap
                   a cote ne doit rien faire pendant l import, mais doit
                   pouvoir fermer une fois l issue connue. */null}
              <${MrdModal}
                isOpen=${true}
                onClose=${() => setImportState((current) => ({ ...current, modal: false }))}
                backdropDismiss=${Boolean(importState.error || importState.warning || importState.pct >= 100)}
                className="recipe-import-modal mrd-modal-narrow"
              >
                  <div className="recipe-import-modal-icon">${importState.error ? "😕" : importState.warning ? "⚠️" : importState.pct >= 100 ? "✅" : "🔗"}</div>
                  <div className="recipe-import-modal-title">
                    ${importState.error ? "Import impossible"
                      : importState.warning ? "Import partiel"
                      : importState.pct >= 100 ? "Recette importée !"
                      : "Import de la recette"}
                  </div>
                  ${/* La barre etait un `<div>` dont on pilotait la largeur en
                       ligne. `ion-progress-bar` prend une valeur de 0 a 1 et
                       porte la semantique de barre de progression. */null}
                  <${IonProgressBar}
                    className=${`recipe-import-progress ${importState.error ? "recipe-import-progress--error" : ""} ${importState.warning ? "recipe-import-progress--warn" : ""}`}
                    value=${Math.max(0, Math.min(1, (importState.pct || 0) / 100))}
                  />
                  <div className="recipe-import-modal-label">
                    ${importState.error ? importState.error
                      : importState.warning ? importState.warning
                      : importState.step === "scraping" ? "Récupération de la recette sur le site…"
                      : importState.step === "categorizing" ? "Analyse et catégorisation par l'IA…"
                      : "Vérifie et ajuste avant de créer."}
                  </div>
                  ${importState.error || importState.warning ? html`
                    <button type="button" className="aok recipe-import-modal-close"
                      onClick=${() => setImportState((current) => ({ ...current, modal: false }))}>
                      ${importState.warning ? "Continuer" : "Fermer"}
                    </button>
                  ` : null}
              <//>
            ` : null}
          ` : null}

          <!-- Carte héros compacte -->
          <div className="mrd-meal-card recipe-sheet-hero recipe-sheet-hero--edit">

            <!-- Input fichier attaché au DOM (évite le GC sur mobile) -->
            <input type="file" accept="image/*"
              style=${{ display: "none" }}
              ref=${photoInputRef}
              onChange=${handlePhotoInputChange} />

            <!-- Photo ou placeholder -->
            <div className="recipe-edit-photo-area"
              onClick=${handlePickPhoto}>
              ${photoLoading
                ? html`<div className="recipe-edit-photo-loading">⏳</div>`
                : form.photo
                  ? html`
                      <img src=${form.photo} className="recipe-edit-photo-img" alt="" />
                      <button type="button" className="recipe-edit-photo-remove"
                        onClick=${(e) => { e.stopPropagation(); setForm((prev) => ({ ...prev, photo: "" })); setPhotoError(""); }}
                        aria-label="Supprimer la photo">✕</button>`
                  : form.category === "drink"
                    ? html`
                          <div className="recipe-edit-photo-placeholder recipe-edit-photo-placeholder--drink">
                           ${renderRecipeFallbackVisual(form, "edit", 72)}
                           <span className="recipe-edit-photo-hint">Ajouter une photo</span>
                          </div>`
                  : html`
                      <div className="recipe-edit-photo-placeholder">
                        <span className="recipe-edit-photo-icon">📷</span>
                        <span className="recipe-edit-photo-hint">Ajouter une photo</span>
                      </div>`}
            </div>
            ${photoError ? html`<div className="recipe-edit-photo-error">${photoError}</div>` : null}

            <!-- Titre centré éditable -->
            <input
              className="recipe-sheet-hero-title--input"
              type="text"
              placeholder="Nom de la recette…"
              value=${form.name}
              onInput=${(e) => setForm({ ...form, name: e.target.value })}
              autoComplete="off"
            />

            <!-- Régime alimentaire : 4 boutons directs -->
            <div className="recipe-edit-diet-row">
              ${FOOD_TYPES.map((type) => html`
                <button type="button" key=${type.id}
                  className=${`recipe-edit-diet-btn ${form.foodType === type.id ? "on" : ""}`}
                  onClick=${() => setForm({ ...form, foodType: form.foodType === type.id ? "" : type.id })}>
                  <span className="recipe-edit-diet-icon">${type.icon}</span>
                  <span className="recipe-edit-diet-label">${type.label}</span>
                </button>
              `)}
            </div>

            <!-- Rangée de capsules avec menus flottants -->
            <div className="recipe-edit-caps-row">

              <!-- Catégorie -->
              <div className="recipe-edit-cap-wrap">
                <button type="button"
                  className=${`recipe-edit-cap recipe-edit-cap--category ${categoryObj ? `recipe-edit-cap--set ${categoryToneClass(form.category)}` : ""}`}
                  onClick=${() => setOpenDropdown(openDropdown === "category" ? null : "category")}>
                  🍽 ${categoryObj ? categoryObj.label : "Catégorie"} ▾
                </button>
                ${openDropdown === "category" ? html`
                  <div className="recipe-edit-float" role="menu">
                    ${CATEGORIES.map((cat) => html`
                      <button type="button" key=${cat.id} role="menuitem"
                        className=${`recipe-edit-float-item ${form.category === cat.id ? "on" : ""}`}
                        onClick=${() => { setForm({ ...form, category: cat.id }); closeDropdown(); }}>
                        ${cat.label}
                      </button>
                    `)}
                    ${form.category ? html`
                      <button type="button" role="menuitem"
                        className="recipe-edit-float-item recipe-edit-float-item--clear"
                        onClick=${() => { setForm({ ...form, category: "" }); closeDropdown(); }}>
                        ✕ Aucune catégorie
                      </button>
                    ` : null}
                  </div>
                ` : null}
              </div>

              <!-- Disponibilité -->
              <div className="recipe-edit-cap-wrap">
                <button type="button"
                  className="recipe-edit-cap recipe-edit-cap--set"
                  onClick=${() => setOpenDropdown(openDropdown === "avail" ? null : "avail")}>
                  📅 ${availLabelShort} ▾
                </button>
                ${openDropdown === "avail" ? html`
                  <div className="recipe-edit-float recipe-edit-float--wide" role="menu">
                    <div className="recipe-edit-float-section">
                      ${[
                        { id: "all_year", label: "Toute saison" },
                        { id: "season",   label: "Par saison" },
                        { id: "months",   label: "Mois précis" },
                      ].map((mode) => html`
                        <button type="button" key=${mode.id}
                          className=${`recipe-edit-float-item ${form.availabilityMode === mode.id ? "on" : ""}`}
                          onClick=${() => setForm({ ...form, availabilityMode: mode.id })}>
                          ${mode.label}
                        </button>
                      `)}
                    </div>
                    ${form.availabilityMode === "season" ? html`
                      <div className="recipe-edit-float-chips">
                        ${SEASONS.map((season) => html`
                          <button type="button" key=${season.id}
                            className=${`recipe-edit-float-chip ${currentSeasons.includes(season.id) ? "on" : ""}`}
                            onClick=${() => {
                              const nextSeasons = currentSeasons.includes(season.id)
                                ? currentSeasons.filter((id) => id !== season.id)
                                : [...currentSeasons, season.id];
                              const safeSeasons = nextSeasons.length ? nextSeasons : [season.id];
                              setForm({ ...form, season: safeSeasons[0], seasons: safeSeasons, seasonScope: "full", months: [] });
                            }}>
                            ${season.label}
                          </button>
                        `)}
                      </div>
                    ` : null}
                    ${form.availabilityMode === "months" ? html`
                      <div className="recipe-edit-float-chips">
                        ${MONTHS.map((month) => html`
                          <button type="button" key=${month.id}
                            className=${`recipe-edit-float-chip ${form.months.includes(month.id) ? "on" : ""}`}
                            onClick=${() => setForm({ ...form, months: toggleMonthSelection(form.months, month.id) })}>
                            ${month.label}
                          </button>
                        `)}
                      </div>
                    ` : null}
                    <button type="button" className="recipe-edit-float-close" onClick=${closeDropdown}>✓ Valider</button>
                  </div>
                ` : null}
              </div>

              <!-- Rapide (toggle simple, pas de dropdown) -->
              <button type="button"
                className=${`recipe-edit-cap ${form.quick ? "recipe-edit-cap--set" : ""}`}
                onClick=${() => setForm({ ...form, quick: !form.quick })}>
                ⚡ Rapide
              </button>

              <!-- Spécialités / contraintes alimentaires -->
              <div className="recipe-edit-cap-wrap">
                <button type="button"
                  className=${`recipe-edit-cap ${constraintCount > 0 ? "recipe-edit-cap--set" : ""}`}
                  onClick=${() => setOpenDropdown(openDropdown === "constraints" ? null : "constraints")}>
                  🥗 ${constraintCount > 0 ? `${constraintCount} spécialité${constraintCount > 1 ? "s" : ""}` : "Spécialités"} ▾
                </button>
                ${openDropdown === "constraints" ? html`
                  <div className="recipe-edit-float recipe-edit-float--wide" role="menu">
                    <div className="recipe-edit-float-chips">
                      ${CONSTRAINT_LABELS.map((c) => html`
                        <button type="button" key=${c.id}
                          className=${`recipe-edit-float-chip ${(form.constraints || []).includes(c.id) ? "on" : ""}`}
                          onClick=${() => toggleFormConstraint(c.id)}>
                          ${c.label}
                        </button>
                      `)}
                    </div>
                    <button type="button" className="recipe-edit-float-close" onClick=${closeDropdown}>✓ Valider</button>
                  </div>
                ` : null}
              </div>

            </div>

            <!-- Temps de préparation / cuisson -->
            <div className="recipe-edit-time-row--hero">
              <div className="recipe-edit-time-field">
                <span className="recipe-edit-time-unit">Min prépa</span>
                <input className="ainp recipe-edit-time-input" type="number" min="0" max="999" placeholder="0"
                  value=${form.prepTime} onInput=${(e) => setForm({ ...form, prepTime: e.target.value })} />
              </div>
              <div className="recipe-edit-time-field">
                <span className="recipe-edit-time-unit">Min cuisson</span>
                <input className="ainp recipe-edit-time-input" type="number" min="0" max="999" placeholder="0"
                  value=${form.cookTime} onInput=${(e) => setForm({ ...form, cookTime: e.target.value })} />
              </div>
            </div>

            <!-- Compteur personnes — identique à la fiche -->
            <div className="recipe-sheet-servings">
              <button type="button" className="recipe-sheet-servings-btn" onClick=${() => setServings((Number(form.servings) || 4) - 1)}>−</button>
              <div className="recipe-sheet-servings-center">
                <div className="recipe-sheet-servings-value">${form.servings || 4}</div>
                <div className="recipe-sheet-servings-label">personnes</div>
              </div>
              <button type="button" className="recipe-sheet-servings-btn" onClick=${() => setServings((Number(form.servings) || 4) + 1)}>+</button>
            </div>

          </div>

          <!-- Onglets — identiques à la fiche -->
          <div className="mrd-subtabs recipe-sheet-tabs">
            <button type="button" className=${`mrd-subtab-btn ${editTab === "ingredients" ? "on" : ""}`} onClick=${() => setEditTab("ingredients")}>Ingrédients</button>
            <button type="button" className=${`mrd-subtab-btn ${editTab === "method" ? "on" : ""}`} onClick=${() => setEditTab("method")}>Préparation</button>
          </div>

          ${editTab === "ingredients" ? html`
            <div className="recipe-sheet-panel recipe-sheet-panel-ingredients recipe-sheet-panel-ingredients--edit">

              <!-- Formulaire ajout ingrédient — ligne unique -->
              <div className="recipe-edit-ing-form">
                <div className="recipe-edit-section-label">Ajouter un ingrédient</div>
                <div className="recipe-edit-ing-add-row">
                  <div style=${{ position: "relative", flex: 1, minWidth: 0 }}>
                    <input className="ainp recipe-edit-ing-name-inp"
                      placeholder="Ingrédient"
                      value=${ingredientDraft.name}
                      onInput=${(e) => handleIngredientNameInput(e.target.value)}
                      onBlur=${() => { setTimeout(() => setIngredientSuggestions([]), 150); }}
                    />
                    ${ingredientSuggestions.length ? html`<div className="suggest-dropdown">${ingredientSuggestions.map(renderSuggestion)}</div>` : null}
                  </div>
                  <input className="ainp recipe-edit-ing-qty-inp" placeholder="Qté"
                    value=${ingredientDraft.quantity}
                    onInput=${(e) => setIngredientDraft({ ...ingredientDraft, quantity: e.target.value })} />
                  <select className="asel recipe-edit-ing-unit-sel" value=${ingredientDraft.unit}
                    onChange=${(e) => setIngredientDraft({ ...ingredientDraft, unit: e.target.value })}>
                    ${UNITS.map((u) => html`<option key=${u.value} value=${u.value}>${u.label}</option>`)}
                  </select>
                  <button type="button" className="aok recipe-edit-ing-add-btn" onClick=${addIngredient}>+</button>
                </div>
                <input className="ainp recipe-edit-ing-group-inp" list="recipe-ing-groups"
                  placeholder="Groupe (optionnel) — ex : Pour la pâte"
                  value=${ingredientDraft.group}
                  onInput=${(e) => setIngredientDraft({ ...ingredientDraft, group: e.target.value })} />
                <datalist id="recipe-ing-groups">
                  ${[...new Set(form.ingredients.map((item) => String(item.group || "").trim()).filter(Boolean))]
                    .map((g) => html`<option key=${g} value=${g}></option>`)}
                </datalist>
                ${ingredientWarning && !allowDuplicateIngredient ? html`
                  <div className="ncard" style=${{ padding: "8px 10px", marginTop: "4px" }}>
                    <div className="mini">Similaire : <strong>${ingredientWarning.name}</strong></div>
                    <div className="task-choice-row" style=${{ marginTop: "6px", gap: "6px" }}>
                      <button type="button" className="task-choice on" style=${{ padding: "6px 10px", fontSize: "12px" }} onClick=${() => useIngredientSuggestion(ingredientWarning)}>Utiliser</button>
                      <button type="button" className="task-choice" style=${{ padding: "6px 10px", fontSize: "12px" }} onClick=${() => setAllowDuplicateIngredient(true)}>Créer quand même</button>
                    </div>
                  </div>
                ` : null}
              </div>

              <!-- Liste des ingrédients : nom + quantité empilés, groupés si besoin -->
              ${form.ingredients.length
                ? groupIngredients(form.ingredients).map((section, sectionIndex) => html`
                    <div key=${`edit-grp-${sectionIndex}`}>
                      ${section.group ? html`<div className="recipe-sheet-ing-group">${section.group}</div>` : null}
                      ${section.items.map((ing, i) => html`
                        <div key=${ing.id || `ing-${sectionIndex}-${i}`} className="recipe-sheet-ing-row recipe-sheet-ing-row--edit">
                          <div className="recipe-edit-ing-info">
                            <span className="recipe-sheet-ing-name">${ing.name}</span>
                            ${formatQuantityUnit(ing.quantity, ing.unit)
                              ? html`<span className="recipe-edit-ing-qty-sub">${formatQuantityUnit(ing.quantity, ing.unit)}</span>`
                              : null}
                          </div>
                          <button type="button" className="recipe-sheet-ing-remove" onClick=${() => removeIngredient(ing.id)}>×</button>
                        </div>
                      `)}
                    </div>
                  `)
                : html`<div className="recipe-sheet-empty-block">Aucun ingrédient ajouté.</div>`}

              <!-- Condiments : résumé compact si déjà renseignés, panneau complet sinon -->
              ${hasCondiments && !showCondimentAdd ? html`
                <div className="recipe-edit-condiments-summary">
                  <div className="condiment-badge-list">
                    ${form.condiments.slice(0, 4).map(renderCondimentBadge)}
                    ${form.condiments.length > 4 ? html`<span className="condiment-badge">+${form.condiments.length - 4}</span>` : null}
                  </div>
                  <button type="button" className="recipe-edit-condiments-edit-btn"
                    onClick=${() => setShowCondimentAdd(true)}>
                    ✎ Modifier condiments
                  </button>
                </div>
              ` : html`
                <div className="condiment-section-box">
                  <div className="condiment-section-box-title condiment-section-box-title--flex">
                    <span>Condiments / épices</span>
                    ${hasCondiments ? html`
                      <button type="button" className="recipe-edit-condiments-collapse-btn"
                        onClick=${() => setShowCondimentAdd(false)}>
                        Réduire ▲
                      </button>
                    ` : null}
                  </div>
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
              `}

            </div>
          ` : null}

          ${editTab === "method" ? html`
            <div className="recipe-sheet-panel recipe-sheet-panel-method">
              <textarea
                className="nta recipe-sheet-method-textarea--edit"
                placeholder="Décris les étapes, les astuces de préparation…"
                value=${form.method}
                onInput=${(e) => setForm({ ...form, method: e.target.value })}
              ></textarea>
            </div>
          ` : null}

          <footer className="recipe-sheet-footer recipe-sheet-footer--edit">
            ${isEdit ? html`
              <button type="button" className="recipe-edit-delete" onClick=${deleteEditingRecipe}>
                Supprimer la recette
              </button>
            ` : null}
            <button type="button" className="recipe-edit-cta" onClick=${submitRecipe}>
              ${isEdit ? "✔ Enregistrer les modifications" : "✔ Créer la recette"}
            </button>
          </footer>

        </div>
      </div>
    `;
  }

  const sectionClass = `rwrap recipes-page${sheetRecipe ? " recipes-page--sheet" : ""}${showEditPage ? " recipes-page--edit" : ""}`;

  /* La bibliothèque est un écran à part entière (handoff 6a) : elle porte son
     propre en-tête et ses propres filtres, et remplace la liste dès que ni la
     fiche ni le formulaire ne sont ouverts. */
  if (!sheetRecipe && !showEditPage) {
    return html`<${RecipeLibrary}
      recipes=${recipes}
      inventory=${inventory}
      linkInventory=${linkInventory}
      onOpenRecipe=${openRecipeSheet}
      onCreateRecipe=${openCreateModal}
      onLoadDemoRecipes=${onLoadDemoRecipes}
      onPlanRecipe=${onOpenMealsTab ? () => onOpenMealsTab() : null}
      onToggleFavorite=${onToggleRecipeFavorite ? (recipe) => onToggleRecipeFavorite(recipe.id, !recipe.favorite) : null}
      onBack=${onBack}
    />`;
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

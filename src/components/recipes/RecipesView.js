import { html, useEffect, useMemo, useRef, useState } from "../../lib.js";
import { findSimilarItem, formatQuantityUnit, suggestItems } from "../../utils/productUtils.js";
import { CONDIMENTS, CONDIMENT_ESSENTIALS } from "../../data/condiments.js";
import { CategoryIcon, categoryToneClass } from "./CategoryIcons.js";

const DRINK_FALLBACK_ILLUSTRATION = "./src/assets/recipe-drink-fallback.svg";

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

function defaultIngredientDraft() {
  return { name: "", quantity: "", unit: "" };
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

function matchesAvailability(recipe, filterValue) {
  if (filterValue === "all") return true;
  if (filterValue === "all_year") return recipe.availabilityMode === "all_year";
  if (filterValue.startsWith("season:")) {
    const seasonId = filterValue.split(":")[1];
    return recipeMonths(recipe).some((month) => seasonById(seasonId).months.includes(month));
  }
  if (filterValue.startsWith("month:")) {
    const monthId = Number(filterValue.split(":")[1]);
    return recipeMonths(recipe).includes(monthId);
  }
  return true;
}

function availabilityLabel(recipe) {
  if (recipe.availabilityMode === "all_year") return "Toute saison";
  if (recipe.availabilityMode === "season") {
    const seasonIds = Array.isArray(recipe.seasons) && recipe.seasons.length ? recipe.seasons : [recipe.season];
    const seasonLabels = seasonIds.map((seasonId) => seasonById(seasonId).label);
    const seasonMonths = [...new Set(seasonIds.flatMap((seasonId) => seasonById(seasonId).months || []))];
    const selectedMonths = recipeMonths(recipe);
    if (selectedMonths.length === seasonMonths.length && selectedMonths.every((month) => seasonMonths.includes(month))) return seasonLabels.filter(Boolean).join(" + ");
    return `${seasonLabels.filter(Boolean).join(" + ")} - ${selectedMonths.map((monthId) => MONTHS.find((month) => month.id === monthId)?.label).filter(Boolean).join(", ")}`;
  }
  return recipeMonths(recipe).map((monthId) => MONTHS.find((month) => month.id === monthId)?.label).filter(Boolean).join(", ");
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

function condimentLabel(condimentId) {
  const found = CONDIMENTS.find((c) => c.id === condimentId);
  return found ? found.label : condimentId;
}

/** Icône affichée sur la carte : emoji perso ou premier badge alimentaire. */
function recipeCardEmoji(recipe) {
  const raw = recipe?.emoji != null ? String(recipe.emoji).trim() : "";
  if (raw) return raw;
  const labels = Array.isArray(recipe?.labels) ? recipe.labels : [];
  const first = labels.length ? FOOD_LABELS.find((entry) => entry.id === labels[0]) : null;
  return first ? first.icon : "🍳";
}

/** Quantité numérique mise à l'échelle des portions (virgule française). */
function fmtScaledQty(quantity, ratio) {
  const q = String(quantity ?? "").trim();
  if (!q) return "";
  const n = Number.parseFloat(q.replace(",", "."));
  if (Number.isNaN(n)) return q;
  const result = n * ratio;
  const rounded = Math.round(result);
  if (Math.abs(result - rounded) < 1e-6) return String(rounded);
  return result.toFixed(1).replace(".", ",");
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
  onBack = null,
}) {
  /* ── Filtres ──────────────────────────────────────────────── */
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [activeLabelFilters, setActiveLabelFilters] = useState([]);
  const [activeConstraintFilters, setActiveConstraintFilters] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showDietAccordion, setShowDietAccordion] = useState(false);
  const [showConstraintAccordion, setShowConstraintAccordion] = useState(false);

  /* ── Page création/édition ─────────────────────────────────── */
  const [showEditPage, setShowEditPage] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState("");
  const [editTab, setEditTab] = useState("ingredients");
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const photoInputRef = useRef(null);
  const [openDropdown, setOpenDropdown] = useState(null); // "category" | "foodType" | "avail" | "constraints" | null
  const [form, setForm] = useState(defaultRecipeForm());

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
  const [sheetServings, setSheetServings] = useState(4);
  const [sheetTab, setSheetTab] = useState("ingredients");

  const productIndex = useMemo(() => {
    const base = Array.isArray(knownProducts) && knownProducts.length ? knownProducts : inventory;
    const currentIngredients = Array.isArray(form.ingredients)
      ? form.ingredients.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, source: "recipe-draft" }))
      : [];
    return [...base, ...currentIngredients];
  }, [knownProducts, inventory, form.ingredients]);

  /* ── Filtrage + tri par pertinence ───────────────────────── */
  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = (Array.isArray(recipes) ? recipes : []).filter((recipe) => {
      if (!matchesAvailability(recipe, availabilityFilter)) return false;
      if (categoryFilter && recipe.category !== categoryFilter) return false;
      const recipeLabels = Array.isArray(recipe.labels) ? recipe.labels : [];
      if (!activeLabelFilters.every((id) => recipeLabels.includes(id))) return false;
      if (!activeConstraintFilters.every((id) => recipeLabels.includes(id))) return false;
      if (query) {
        const titleMatch = (recipe.name || "").toLowerCase().includes(query);
        const ingredientText = (Array.isArray(recipe.ingredients) ? recipe.ingredients.map((i) => i.name || "").join(" ") : "").toLowerCase();
        const condimentText = (Array.isArray(recipe.condiments) ? recipe.condiments.map((id) => condimentLabel(id)).join(" ") : "").toLowerCase();
        const legacyText = (recipe.ingredientsLegacy || "").toLowerCase();
        const tagsText = (Array.isArray(recipe.tags) ? recipe.tags.join(" ") : "").toLowerCase();
        const categoryDef = recipe.category ? CATEGORIES.find((c) => c.id === recipe.category) : null;
        const catText = categoryDef ? categoryDef.label.toLowerCase() : "";
        if (!titleMatch && !ingredientText.includes(query) && !condimentText.includes(query) && !legacyText.includes(query) && !tagsText.includes(query) && !catText.includes(query)) return false;
      }
      return true;
    });

    if (query) {
      base.sort((a, b) => {
        const aTitle = (a.name || "").toLowerCase().includes(query) ? 0 : 1;
        const bTitle = (b.name || "").toLowerCase().includes(query) ? 0 : 1;
        if (aTitle !== bTitle) return aTitle - bTitle;
        const aIng = (Array.isArray(a.ingredients) ? a.ingredients.map((i) => i.name || "").join(" ") : "").toLowerCase().includes(query) ? 0 : 1;
        const bIng = (Array.isArray(b.ingredients) ? b.ingredients.map((i) => i.name || "").join(" ") : "").toLowerCase().includes(query) ? 0 : 1;
        if (aIng !== bIng) return aIng - bIng;
        return String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" });
      });
    } else {
      base.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" }));
    }
    return base;
  }, [recipes, search, availabilityFilter, categoryFilter, activeLabelFilters, activeConstraintFilters]);

  const sheetRecipe = sheetRecipeId ? (Array.isArray(recipes) ? recipes : []).find((r) => r.id === sheetRecipeId) : null;

  useEffect(() => {
    if (!sheetRecipeId) return;
    const exists = (Array.isArray(recipes) ? recipes : []).some((r) => r.id === sheetRecipeId);
    if (!exists) setSheetRecipeId("");
  }, [recipes, sheetRecipeId]);

  function openRecipeSheet(recipe) {
    setSheetRecipeId(recipe.id);
    setSheetServings(Math.max(1, Math.min(24, Number(recipe.servings) || 4)));
    setSheetTab("ingredients");
  }

  function closeRecipeSheet() {
    setSheetRecipeId("");
  }

  function openEditModalFromSheet(recipe) {
    closeRecipeSheet();
    openEditModal(recipe);
  }

  function sheetServingsRatio(recipe) {
    const base = Math.max(1, Number(recipe?.servings) || 1);
    return sheetServings / base;
  }

  function handleSheetAddToShopping(recipe) {
    const ratio = sheetServingsRatio(recipe);
    const items = (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
      .filter((ing) => ing?.name)
      .map((ing) => ({
        name: ing.name,
        quantity: fmtScaledQty(ing.quantity, ratio),
        unit: String(ing.unit || "").trim(),
      }));
    if (!items.length) return;
    onAddRecipeIngredientsToShopping?.(items);
  }

  function setServings(nextValue) {
    setForm((previous) => ({ ...previous, servings: Math.max(1, Math.min(24, Number(nextValue) || 1)) }));
  }

  function resetEditState() {
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

  function toggleFilterLabel(labelId) {
    setActiveLabelFilters((previous) =>
      previous.includes(labelId) ? [] : [labelId],
    );
  }

  function toggleConstraintFilter(id) {
    setActiveConstraintFilters((previous) =>
      previous.includes(id) ? previous.filter((v) => v !== id) : [...previous, id],
    );
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
    setIngredientDraft(defaultIngredientDraft());
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
    if (editingRecipeId) { onUpdateRecipe?.(editingRecipeId, payload); } else { onAddRecipe(payload); }
    closeEditPage();
  }

  function deleteEditingRecipe() {
    if (!editingRecipeId) return;
    if (!window.confirm("Supprimer cette recette ? Cette action est d\u00E9finitive.")) return;
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

  /* ── Fiche recette ────────────────────────────────────────── */
  function renderRecipeSheet(recipe) {
    const baseServings = Math.max(1, Number(recipe.servings) || 1);
    const ratio = sheetServings / baseServings;
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.filter((item) => item?.name) : [];
    const legacyIng = String(recipe.ingredientsLegacy || "").trim();
    const firstLabelId = Array.isArray(recipe.labels) && recipe.labels.length ? recipe.labels[0] : null;
    const firstLabelDef = firstLabelId ? FOOD_LABELS.find((entry) => entry.id === firstLabelId) : null;
    const prepTimeNum = recipe.prepTime ? Number(recipe.prepTime) : NaN;
    const cookTimeNum = recipe.cookTime ? Number(recipe.cookTime) : NaN;
    const legacyTimeNum = recipe.time != null && recipe.time !== "" ? Number(recipe.time) : NaN;
    const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
    const hasShoppingCta = Boolean(onAddRecipeIngredientsToShopping && ingredients.length);
    const categoryDef = recipe.category ? CATEGORIES.find((c) => c.id === recipe.category) : null;

    return html`
      <div className="recipe-sheet">
        <header className="mrd-back-hdr mrd-back-hdr-with-side recipe-sheet-header">
          <div className="mrd-back-hdr-main">
            <button type="button" className="mrd-back-btn" onClick=${closeRecipeSheet} aria-label="Retour à la liste">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <span className="mrd-screen-title recipe-sheet-hdr-title">${recipe.name}</span>
          </div>
          <div className="mrd-back-hdr-side recipe-sheet-header-actions">
            ${onOpenMealsTab
              ? html`<button type="button" className="mrd-task-mode-btn" onClick=${() => { onOpenMealsTab(); closeRecipeSheet(); }}>Planifier 📅</button>`
              : null}
            <button type="button" className="clrbtn" onClick=${() => openEditModalFromSheet(recipe)}>Modifier</button>
          </div>
        </header>

        <div className="recipe-sheet-body">
          <div className="mrd-meal-card recipe-sheet-hero">
            ${recipe.photo
              ? html`<div className="recipe-sheet-hero-photo"><img src=${recipe.photo} alt="" /></div>`
              : html`<div className="recipe-sheet-hero-cat-icon" aria-hidden="true">${renderRecipeFallbackVisual(recipe, "hero", 84)}</div>`}
            <h2 className="recipe-sheet-hero-title">${recipe.name}</h2>
            <div className="recipe-sheet-hero-pills">
              ${firstLabelDef
                ? html`<span className=${`recipe-sheet-hero-pill recipe-sheet-hero-pill--${firstLabelDef.id}`}>${firstLabelDef.icon} ${firstLabelDef.label}</span>`
                : null}
              ${categoryDef ? html`<span className=${`recipe-sheet-hero-pill recipe-sheet-hero-pill-cat ${categoryToneClass(recipe.category)}`}>${categoryDef.label}</span>` : null}
              <span className="recipe-sheet-hero-pill recipe-sheet-hero-pill-dim">📅 ${availabilityLabel(recipe)}</span>
              ${!Number.isNaN(prepTimeNum) && prepTimeNum > 0
                ? html`<span className="recipe-sheet-hero-pill recipe-sheet-hero-pill-dim">🔪 ${prepTimeNum} min</span>`
                : null}
              ${!Number.isNaN(cookTimeNum) && cookTimeNum > 0
                ? html`<span className="recipe-sheet-hero-pill recipe-sheet-hero-pill-dim">🍳 ${cookTimeNum} min</span>`
                : null}
              ${Number.isNaN(prepTimeNum) && Number.isNaN(cookTimeNum) && !Number.isNaN(legacyTimeNum) && legacyTimeNum > 0
                ? html`<span className="recipe-sheet-hero-pill recipe-sheet-hero-pill-dim">⏱ ${legacyTimeNum} min</span>`
                : null}
              ${recipe.quick ? html`<span className="recipe-sheet-hero-pill recipe-sheet-hero-pill-dim">⚡ Rapide</span>` : null}
              ${tags.map((tag) => html`<span key=${String(tag)} className="recipe-sheet-hero-pill recipe-sheet-tag">${tag}</span>`)}
            </div>

            <div className="recipe-sheet-servings">
              <button type="button" className="recipe-sheet-servings-btn" aria-label="Moins" onClick=${() => setSheetServings((s) => Math.max(1, s - 1))}>−</button>
              <div className="recipe-sheet-servings-center">
                <div className="recipe-sheet-servings-value">${sheetServings}</div>
                <div className="recipe-sheet-servings-label">personnes</div>
              </div>
              <button type="button" className="recipe-sheet-servings-btn" aria-label="Plus" onClick=${() => setSheetServings((s) => Math.min(24, s + 1))}>+</button>
            </div>
          </div>

          <div className="mrd-subtabs recipe-sheet-tabs">
            <button type="button" className=${`mrd-subtab-btn ${sheetTab === "ingredients" ? "on" : ""}`} onClick=${() => setSheetTab("ingredients")}>Ingrédients</button>
            <button type="button" className=${`mrd-subtab-btn ${sheetTab === "method" ? "on" : ""}`} onClick=${() => setSheetTab("method")}>Préparation</button>
          </div>

          ${sheetTab === "ingredients"
            ? html`
                <div className="recipe-sheet-panel recipe-sheet-panel-ingredients">
                  ${ingredients.length
                    ? ingredients.map((ing, i) => html`
                        <div key=${ing.id || `ing-${i}`} className="recipe-sheet-ing-row">
                          <span className="recipe-sheet-ing-name">${ing.name}</span>
                          <span className="recipe-sheet-ing-qty">${formatQuantityUnit(fmtScaledQty(ing.quantity, ratio), ing.unit)}</span>
                        </div>
                      `)
                    : legacyIng
                      ? html`<div className="recipe-sheet-legacy-ing">${legacyIng}</div>`
                      : html`<div className="recipe-sheet-empty-block">Aucun ingrédient structuré. Utilise « Modifier » pour en ajouter.</div>`}
                  ${Array.isArray(recipe.condiments) && recipe.condiments.length
                    ? html`
                        <div className="recipe-sheet-condiments-block">
                          <div className="recipe-sheet-condiments-title">Condiments</div>
                          <div className="condiment-badge-list">${recipe.condiments.map(renderCondimentBadge)}</div>
                        </div>
                      `
                    : null}
                </div>
              `
            : html`
                <div className="recipe-sheet-panel recipe-sheet-panel-method">
                  <div className="recipe-sheet-method-text">${recipe.method || "Aucune préparation renseignée."}</div>
                </div>
              `}

          ${hasShoppingCta
            ? html`
                <footer className="recipe-sheet-footer">
                  <button type="button" className="recipe-sheet-cta-shopping" onClick=${() => handleSheetAddToShopping(recipe)}>
                    🛒 Ajouter les ingrédients aux courses
                  </button>
                </footer>
              `
            : null}
        </div>
      </div>
    `;
  }

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
                           ${renderRecipeFallbackVisual(form, "edit", 56)}
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

              <!-- Liste des ingrédients : nom + quantité empilés -->
              ${form.ingredients.length
                ? form.ingredients.map((ing, i) => html`
                    <div key=${ing.id || `ing-${i}`} className="recipe-sheet-ing-row recipe-sheet-ing-row--edit">
                      <div className="recipe-edit-ing-info">
                        <span className="recipe-sheet-ing-name">${ing.name}</span>
                        ${formatQuantityUnit(ing.quantity, ing.unit)
                          ? html`<span className="recipe-edit-ing-qty-sub">${formatQuantityUnit(ing.quantity, ing.unit)}</span>`
                          : null}
                      </div>
                      <button type="button" className="recipe-sheet-ing-remove" onClick=${() => removeIngredient(ing.id)}>×</button>
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

  const searchIcon = html`
    <span className="recipes-page-search-icon" aria-hidden="true">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" />
        <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </span>
  `;

  function renderIngredientPreview(recipe) {
    const list = Array.isArray(recipe.ingredients) ? recipe.ingredients.filter((item) => item?.name) : [];
    if (list.length) {
      const shown = list.slice(0, 4);
      const rest = list.length - shown.length;
      return html`
        <div className="rcard-recipe-ingredients">
          ${shown.map((item) => html`<span className="recipe-preview-chip" key=${item.id}>${item.name}</span>`)}
          ${rest > 0 ? html`<span className="recipe-preview-chip recipe-preview-chip-more">+${rest}</span>` : null}
        </div>
      `;
    }
    const legacy = String(recipe.ingredientsLegacy || "").trim();
    return html`<div className="rcard-recipe-ingredients rcard-recipe-ingredients--legacy"><span className="recipe-preview-chip recipe-preview-chip-muted">${legacy || "Aucun ingrédient"}</span></div>`;
  }

  /** Label court de disponibilité pour les cartes. */
  function availabilityLabelShort(recipe) {
    if (recipe.availabilityMode === "all_year") return "Toute saison";
    if (recipe.availabilityMode === "season") {
      const ids = Array.isArray(recipe.seasons) && recipe.seasons.length ? recipe.seasons : (recipe.season ? [recipe.season] : ["spring"]);
      const labels = ids.map((id) => seasonById(id).label);
      return labels.length <= 2 ? labels.join(" · ") : "Multi-saison";
    }
    const months = recipeMonths(recipe);
    if (months.length === 12) return "Toute saison";
    if (months.length <= 3) return months.map((id) => MONTHS.find((m) => m.id === id)?.label || "").filter(Boolean).join(" · ");
    return `${months.length} mois`;
  }

  /** Label de durée pour les cartes (null si inconnu). */
  function recipeDurationLabel(recipe) {
    if (recipe.quick) return "⚡ Rapide";
    const prep = recipe.prepTime ? Number(recipe.prepTime) : 0;
    const cook = recipe.cookTime ? Number(recipe.cookTime) : 0;
    const total = (Number.isNaN(prep) ? 0 : prep) + (Number.isNaN(cook) ? 0 : cook);
    if (total > 0) return total <= 20 ? "⚡ Rapide" : `⏱ ${total} min`;
    const legacy = recipe.time != null && recipe.time !== "" ? Number(recipe.time) : NaN;
    if (!Number.isNaN(legacy) && legacy > 0) return legacy <= 20 ? "⚡ Rapide" : `⏱ ${legacy} min`;
    return null;
  }

  const activeConstraintCount = activeConstraintFilters.length;
  const sectionClass = `rwrap recipes-page${sheetRecipe ? " recipes-page--sheet" : ""}${showEditPage ? " recipes-page--edit" : ""}`;

  return html`
    <section className=${sectionClass}>
      ${sheetRecipe ? renderRecipeSheet(sheetRecipe) : null}
      ${showEditPage ? renderEditPage() : null}

      ${!sheetRecipe && !showEditPage ? html`

        <!-- ── Header liste : ← Recettes … Démo + ──────────────── -->
        <div className="recipes-list-hdr">
          <div className="mrd-back-hdr-main">
            ${onBack ? html`
              <button type="button" className="mrd-back-btn" onClick=${onBack} aria-label="Retour">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            ` : null}
            <span className="mrd-screen-title">Recettes</span>
          </div>
          <div className="recipes-list-hdr-actions">
            ${onLoadDemoRecipes
              ? html`<button type="button" className="clrbtn recipes-page-demo-btn" onClick=${onLoadDemoRecipes}>Démo</button>`
              : null}
            <button type="button" className="recipes-page-add-btn" onClick=${openCreateModal} title="Ajouter une recette">+</button>
          </div>
        </div>

        <!-- ── Contrôles de filtrage ───────────────────────────── -->
        <div className="recipes-page-controls">
          <div className="recipes-page-search-wrap">
            ${searchIcon}
            <input
              className="ainp recipes-page-search-input"
              type="search"
              enterkeyhint="search"
              placeholder="Rechercher une recette…"
              value=${search}
              onInput=${(event) => setSearch(event.target.value)}
            />
            ${search.trim()
              ? html`
                  <button type="button" className="recipes-page-search-clear" onClick=${() => setSearch("")} aria-label="Effacer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                    </svg>
                  </button>
                `
              : null}
          </div>

          <div className="recipes-page-selects-row">
            <div className="recipes-page-select-col">
              <select className="asel recipes-page-select" value=${availabilityFilter} onChange=${(e) => setAvailabilityFilter(e.target.value)}>
                <option value="all">Toute période</option>
                ${SEASONS.map((s) => html`<option value=${`season:${s.id}`} key=${s.id}>${s.label}</option>`)}
                <option disabled>──</option>
                ${MONTHS.map((m) => html`<option value=${`month:${m.id}`} key=${m.id}>${m.label}</option>`)}
              </select>

              <!-- Accordéon régime alimentaire -->
              <div className="pick-diet-accordion">
                <button type="button" className="pick-diet-toggle"
                  onClick=${() => setShowDietAccordion((o) => !o)}>
                  <span className="pick-diet-toggle-label">
                    🥗 Régime alimentaire
                    ${activeLabelFilters.length ? html`<span className="pick-diet-badge pick-diet-badge--dot"></span>` : null}
                  </span>
                  <svg className=${`pick-diet-chevron${showDietAccordion ? " open" : ""}`}
                    width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                ${showDietAccordion ? html`
                  <div className="pick-diet-body">
                    ${FOOD_TYPES.map((type) => html`
                      <button type="button" key=${type.id}
                        className=${`recipes-filter-chip ${activeLabelFilters.includes(type.id) ? "on" : ""}`}
                        onClick=${() => toggleFilterLabel(type.id)}>
                        <span className="recipes-filter-chip-icon">${type.icon}</span>
                        <span>${type.label}</span>
                      </button>
                    `)}
                  </div>
                ` : null}
              </div>
            </div>

            <div className="recipes-page-select-col">
              <select className="asel recipes-page-select" value=${categoryFilter} onChange=${(e) => setCategoryFilter(e.target.value)}>
                <option value="">Toute catégorie</option>
                ${CATEGORIES.map((cat) => html`<option value=${cat.id} key=${cat.id}>${cat.label}</option>`)}
              </select>

              <!-- Accordéon restrictions alimentaires -->
              <div className="pick-diet-accordion">
                <button type="button" className="pick-diet-toggle"
                  onClick=${() => setShowConstraintAccordion((o) => !o)}>
                  <span className="pick-diet-toggle-label">
                    🚫 Restrictions
                    ${activeConstraintFilters.length ? html`<span className="pick-diet-badge">${activeConstraintFilters.length}</span>` : null}
                  </span>
                  <svg className=${`pick-diet-chevron${showConstraintAccordion ? " open" : ""}`}
                    width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2"
                      stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                ${showConstraintAccordion ? html`
                  <div className="pick-diet-body">
                    ${CONSTRAINT_LABELS.map((c) => html`
                      <button type="button" key=${c.id}
                        className=${`recipes-filter-chip ${activeConstraintFilters.includes(c.id) ? "on" : ""}`}
                        onClick=${() => toggleConstraintFilter(c.id)}>
                        ${c.label}
                      </button>
                    `)}
                  </div>
                ` : null}
              </div>
            </div>
          </div>
        </div>

        <div className="recipes-page-list-head">
          ${filteredRecipes.length} recette${filteredRecipes.length !== 1 ? "s" : ""}
        </div>

        <div className="rlist recipes-page-rlist">
          ${filteredRecipes.length
            ? filteredRecipes.map((recipe) => html`
                <article
                  className="rcard rcard-recipe"
                  key=${recipe.id}
                  tabIndex=${0}
                  role="button"
                  aria-label=${`Ouvrir la fiche : ${recipe.name || "Recette"}`}
                  onClick=${() => openRecipeSheet(recipe)}
                  onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRecipeSheet(recipe); } }}
                >
                  ${(() => {
                    const firstFoodType = FOOD_TYPES.find((t) => (Array.isArray(recipe.labels) ? recipe.labels : []).includes(t.id));
                    const categoryLabel = recipe.category ? (CATEGORIES.find((c) => c.id === recipe.category)?.label || null) : null;
                    const shortAvail = availabilityLabelShort(recipe);
                    const durationInfo = recipeDurationLabel(recipe);
                    const servings = Number(recipe.servings) || 4;
                    return html`
                      <div className="rcard-recipe-thumb" aria-hidden="true">
                        ${recipe.photo
                          ? html`<img src=${recipe.photo} alt="" />`
                          : renderRecipeFallbackVisual(recipe, "thumb", 64)}
                      </div>
                      <div className="rcard-recipe-info">
                        <div className="rcard-recipe-name">${recipe.name || "Sans titre"}</div>
                        <div className="rcard-recipe-badges">
                          ${categoryLabel ? html`<span className=${`rcard-badge rcard-badge--cat ${categoryToneClass(recipe.category)}`}>${categoryLabel}</span>` : null}
                          <span className="rcard-badge rcard-badge--dim">📅 ${shortAvail}</span>
                          <span className="rcard-badge rcard-badge--dim">👥 ${servings} pers.</span>
                          ${durationInfo ? html`<span className="rcard-badge rcard-badge--dim">${durationInfo}</span>` : null}
                          ${firstFoodType ? html`<span className="rcard-badge rcard-badge--diet">${firstFoodType.icon} ${firstFoodType.label}</span>` : null}
                        </div>
                      </div>
                    `;
                  })()}
                </article>
              `)
            : html`
                <div className="empty recipes-page-empty">
                  <div className="recipes-page-empty-emoji" aria-hidden="true">🍳</div>
                  <div>Aucune recette ne correspond à ce filtre.</div>
                </div>
              `}
        </div>
      ` : null}
    </section>
  `;
}

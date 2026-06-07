import { DAYS } from "../../constants.js";
import { html, useMemo, useState } from "../../lib.js";
import { getCurrentAppDate } from "../../utils/date.js";
import { createMealShell } from "../../utils/state.js";
import { formatQuantityUnit, normalizeProductName } from "../../utils/productUtils.js";
import { CONDIMENTS } from "../../data/condiments.js";
import { CategoryIcon, categoryToneClass } from "../recipes/CategoryIcons.js";

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

const FOOD_TYPES = [
  { id: "omnivore",    label: "Omnivore",    icon: "🍖" },
  { id: "vegetarian", label: "Végétarien",   icon: "🥕" },
  { id: "vegan",      label: "Végan",        icon: "🌱" },
  { id: "pescetarian",label: "Pescétarien",  icon: "🐟" },
];

const CATEGORIES = [
  { id: "starter",   label: "Entrée" },
  { id: "main",      label: "Plat" },
  { id: "dessert",   label: "Dessert" },
  { id: "breakfast", label: "Petit-déj / goûter" },
  { id: "drink",     label: "Boisson" },
  { id: "base",      label: "Base maison" },
];

const FOOD_LABELS = [
  { id: "vegetarian", label: "Végétarien", icon: "🥕" },
  { id: "vegan", label: "Vegan", icon: "🌱" },
  { id: "omnivore", label: "Omnivore", icon: "🍖" },
  { id: "pescetarian", label: "Pescétarien", icon: "🐟" },
  { id: "flexitarian", label: "Flexitarien", icon: "🌿" },
  { id: "lactose_free", label: "Sans lactose", icon: "🥛" },
  { id: "gluten_free", label: "Sans gluten", icon: "🌾" },
  { id: "halal", label: "Halal", icon: "🕌" },
  { id: "kosher", label: "Casher", icon: "✡️" },
];

const RESTRICTIONS = [
  { id: "gluten_free", label: "Sans gluten" },
  { id: "lactose_free", label: "Sans lactose" },
  { id: "egg_free", label: "Sans œufs" },
  { id: "nut_free", label: "Sans fruits à coque" },
  { id: "pork_free", label: "Sans porc" },
  { id: "halal", label: "Halal" },
  { id: "kosher", label: "Casher" },
];

function seasonById(seasonId) {
  return SEASONS.find((s) => s.id === seasonId) || SEASONS[0];
}

function uniqueMonths(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter((v) => v >= 1 && v <= 12))];
}

function recipeMonths(recipe) {
  if (recipe.availabilityMode === "all_year") return MONTHS.map((m) => m.id);
  if (recipe.availabilityMode === "season") {
    if (Array.isArray(recipe.months) && recipe.months.length) return uniqueMonths(recipe.months);
    const ids = Array.isArray(recipe.seasons) && recipe.seasons.length ? recipe.seasons : [recipe.season || "spring"];
    return [...new Set(ids.flatMap((id) => seasonById(id).months || []))];
  }
  return uniqueMonths(recipe.months);
}

function matchesAvailability(recipe, filterValue, currentMonth) {
  if (filterValue === "all") return true;
  if (filterValue === "all_year") return recipe.availabilityMode === "all_year";
  if (filterValue === "current") return recipeMonths(recipe).includes(currentMonth);
  if (filterValue.startsWith("season:")) {
    const seasonId = filterValue.split(":")[1];
    return recipeMonths(recipe).some((m) => seasonById(seasonId).months.includes(m));
  }
  if (filterValue.startsWith("month:")) {
    return recipeMonths(recipe).includes(Number(filterValue.split(":")[1]));
  }
  return true;
}

function availabilityLabel(recipe) {
  if (recipe.availabilityMode === "all_year") return "Toute saison";
  if (recipe.availabilityMode === "season") {
    const season = seasonById(recipe.season);
    const seasonMonths = season.months || [];
    const selected = recipeMonths(recipe);
    if (selected.length === seasonMonths.length && selected.every((m) => seasonMonths.includes(m))) return season.label;
    return `${season.label} - ${selected.map((id) => MONTHS.find((m) => m.id === id)?.label).filter(Boolean).join(", ")}`;
  }
  return recipeMonths(recipe).map((id) => MONTHS.find((m) => m.id === id)?.label).filter(Boolean).join(", ");
}

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

function isQuickRecipe(recipe) {
  if (recipe.quick) return true;
  const prep = Number(recipe.prepTime) || 0;
  const cook = Number(recipe.cookTime) || 0;
  const total = prep + cook;
  if (total > 0 && total <= 10) return true;
  const legacy = Number(recipe.time) || 0;
  return legacy > 0 && legacy <= 10;
}

function recipeCardEmoji(recipe) {
  const raw = recipe?.emoji != null ? String(recipe.emoji).trim() : "";
  if (raw) return raw;
  const labels = Array.isArray(recipe?.labels) ? recipe.labels : [];
  const first = labels.length ? FOOD_LABELS.find((e) => e.id === labels[0]) : null;
  return first ? first.icon : "🍳";
}

function parseNumericQuantity(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function getCondimentLabel(condimentId) {
  const found = CONDIMENTS.find((c) => c.id === condimentId);
  return found ? found.label : condimentId;
}

function computeMissingCondiments(recipe, inventory) {
  const selectedCondiments = Array.isArray(recipe?.condiments) ? recipe.condiments : [];
  if (!selectedCondiments.length) return [];
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  return selectedCondiments
    .map((condimentId) => ({ id: condimentId, label: getCondimentLabel(condimentId) }))
    .filter(({ label }) => {
      const normalizedLabel = label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const firstWord = normalizedLabel.split(/\s+/)[0];
      return !safeInventory.some((item) => {
        const normalizedItem = (item.name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        return normalizedItem.includes(firstWord) && item.stockState !== "empty";
      });
    })
    .map(({ id, label }) => ({ id: `missing-cond-${id}`, condimentId: id, name: label }));
}

function computeMissingIngredients(recipe, inventory) {
  const safeIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients.filter((item) => item.name) : [];
  return safeIngredients.reduce((missing, ingredient) => {
    const normalized = normalizeProductName(ingredient.name);
    const matches = (Array.isArray(inventory) ? inventory : []).filter((item) => normalizeProductName(item.name) === normalized && item.stockState !== "empty");
    if (!matches.length) { missing.push({ ...ingredient, missingGroup: "main" }); return missing; }
    const requiredQty = parseNumericQuantity(ingredient.quantity);
    const ingredientUnit = String(ingredient.unit || "").trim();
    if (requiredQty == null || !ingredientUnit) return missing;
    const sameUnitMatches = matches.filter((item) => String(item.unit || "").trim() === ingredientUnit);
    if (!sameUnitMatches.length) { missing.push({ ...ingredient, missingGroup: "main" }); return missing; }
    const availableQty = sameUnitMatches.reduce((sum, item) => sum + (parseNumericQuantity(item.quantity) || 0), 0);
    if (availableQty < requiredQty) missing.push({ ...ingredient, missingGroup: "main", quantity: String(requiredQty - availableQty).replace(".", ",") });
    return missing;
  }, []);
}

const MONTH_NAMES = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function dateToKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function computeMonday(date) {
  const d = new Date(date);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function MealsView({
  meals,
  recipes,
  inventory = [],
  linkMealsToInventory = false,
  onToggleLinkMealsToInventory,
  onAddMissingIngredients,
  onUpdateMeal,
  onToggleCook,
}) {
  const safeRecipes = Array.isArray(recipes) ? recipes : [];
  const today = getCurrentAppDate();
  const currentMonth = today.getMonth() + 1;

  /* ── Navigation semaines ── */
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState("week"); // "week" | "month"

  const todayMonday = computeMonday(today);
  const targetMonday = addDays(todayMonday, weekOffset * 7);
  const targetWeekKey = dateToKey(targetMonday);
  // Compat : repas sans weekKey = semaine courante (offset 0)
  const isCurrentWeek = weekOffset === 0;

  const weekDates = DAYS.map((_, i) => addDays(targetMonday, i));
  const todayIdx = (() => { const d = today.getDay(); return d === 0 ? 6 : d - 1; })();

  // Repas filtrés pour la semaine affichée
  const safeMeals = Array.isArray(meals) ? meals : [];
  const mealRows = DAYS.map((day, index) => {
    const found = safeMeals.find((m) => m.day === day && (m.weekKey === targetWeekKey || (isCurrentWeek && (!m.weekKey || m.weekKey === ""))));
    return found || createMealShell(day, index, targetWeekKey);
  });

  const [selectedDayIdx, setSelectedDayIdx] = useState(todayIdx);
  const [accordionOpen, setAccordionOpen] = useState({});
  const [pickModal, setPickModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [viewSheetServings, setViewSheetServings] = useState(4);
  const [viewSheetTab, setViewSheetTab] = useState("ingredients");
  const [missingModal, setMissingModal] = useState(null);
  const [pickSearch, setPickSearch] = useState("");
  const [pickAvailFilter, setPickAvailFilter] = useState("all");
  const [pickCategoryFilter, setPickCategoryFilter] = useState("");
  const [pickFoodTypeFilter, setPickFoodTypeFilter] = useState("");
  const [pickRestrictionFilter, setPickRestrictionFilter] = useState("");
  const [pickQuickOnly, setPickQuickOnly] = useState(false);

  const filteredPickerRecipes = useMemo(() => {
    const query = pickSearch.trim().toLowerCase();
    return safeRecipes
      .filter((recipe) => {
        if (!matchesAvailability(recipe, pickAvailFilter, currentMonth)) return false;
        if (pickCategoryFilter && recipe.category !== pickCategoryFilter) return false;
        const recipeLabels = Array.isArray(recipe.labels) ? recipe.labels : [];
        if (pickFoodTypeFilter && !recipeLabels.includes(pickFoodTypeFilter)) return false;
        if (pickRestrictionFilter && !recipeLabels.includes(pickRestrictionFilter)) return false;
        if (pickQuickOnly && !isQuickRecipe(recipe)) return false;
        if (query) {
          const text = `${recipe.name || ""} ${(Array.isArray(recipe.ingredients) ? recipe.ingredients.map((i) => i.name || "").join(" ") : "")} ${recipe.ingredientsLegacy || ""}`.toLowerCase();
          if (!text.includes(query)) return false;
        }
        return true;
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "fr", { sensitivity: "base" }));
  }, [safeRecipes, pickSearch, pickAvailFilter, pickCategoryFilter, pickFoodTypeFilter, pickRestrictionFilter, pickQuickOnly, currentMonth]);

  function openPicker(day, slot, weekKey, subSlot) {
    const sub = subSlot || "main";
    setPickModal({ day, slot, weekKey: weekKey || targetWeekKey, subSlot: sub });
    setPickSearch("");
    setPickAvailFilter("all");
    setPickCategoryFilter(sub === "starter" ? "starter" : sub === "dessert" ? "dessert" : "");
    setPickFoodTypeFilter("");
    setPickRestrictionFilter("");
    setPickQuickOnly(false);
  }

  function closePicker() { setPickModal(null); }

  function checkInventoryAfterPick(recipe) {
    if (!linkMealsToInventory || !recipe) return;
    const missing = computeMissingIngredients(recipe, inventory);
    const missingCondiments = computeMissingCondiments(recipe, inventory);
    if (!missing.length && !missingCondiments.length) return;
    setMissingModal({ recipeName: recipe.name, mode: "inventory", items: missing, condimentItems: missingCondiments, selectedIds: missing.map((i) => i.id), selectedCondiments: [] });
  }

  function selectRecipe(recipeId) {
    if (!pickModal) return;
    const recipe = safeRecipes.find((e) => e.id === recipeId);
    const sub = pickModal.subSlot || "main";
    if (sub === "starter") {
      onUpdateMeal(pickModal.day, pickModal.slot, { starterRecipeId: recipeId }, pickModal.weekKey);
      closePicker();
      checkInventoryAfterPick(recipe);
      return;
    }
    if (sub === "dessert") {
      onUpdateMeal(pickModal.day, pickModal.slot, { dessertRecipeId: recipeId }, pickModal.weekKey);
      closePicker();
      checkInventoryAfterPick(recipe);
      return;
    }
    onUpdateMeal(pickModal.day, pickModal.slot, { recipeId }, pickModal.weekKey);
    closePicker();
    checkInventoryAfterPick(recipe);
  }

  function openManualIngredientPicker(recipe) {
    if (!recipe) return;
    const mainItems = Array.isArray(recipe.ingredients) ? recipe.ingredients.filter((i) => i?.name) : [];
    if (!mainItems.length) return;
    setMissingModal({ recipeName: recipe.name, mode: "manual", items: mainItems, condimentItems: [], selectedIds: [], selectedCondiments: [] });
  }

  function clearSlot(day, slot, weekKey) { onUpdateMeal(day, slot, { recipeId: "" }, weekKey || targetWeekKey); }

  function toggleMissingIngredient(ingredientId) {
    setMissingModal((prev) => {
      if (!prev) return prev;
      const selectedIds = prev.selectedIds.includes(ingredientId)
        ? prev.selectedIds.filter((id) => id !== ingredientId)
        : [...prev.selectedIds, ingredientId];
      return { ...prev, selectedIds };
    });
  }

  function toggleMissingCondiment(condimentId) {
    setMissingModal((prev) => {
      if (!prev) return prev;
      const selectedCondiments = (prev.selectedCondiments || []).includes(condimentId)
        ? (prev.selectedCondiments || []).filter((id) => id !== condimentId)
        : [...(prev.selectedCondiments || []), condimentId];
      return { ...prev, selectedCondiments };
    });
  }

  function addSelectedMissingIngredients() {
    if (!missingModal) return;
    const selectedItems = missingModal.items.filter((i) => missingModal.selectedIds.includes(i.id));
    const selectedCondimentItems = (missingModal.condimentItems || [])
      .filter((i) => (missingModal.selectedCondiments || []).includes(i.id))
      .map((i) => ({ id: i.id, name: i.name, quantity: "", unit: "" }));
    const allItems = [...selectedItems, ...selectedCondimentItems];
    if (allItems.length) onAddMissingIngredients?.(allItems);
    setMissingModal(null);
  }

  function renderFoodBadge(labelId) {
    const label = FOOD_LABELS.find((item) => item.id === labelId);
    if (!label) return null;
    return html`<span key=${labelId} className="mrd-meals-tag">${label.icon} ${label.label}</span>`;
  }

  function renderIngredientLine(item) {
    return html`
      <div className="recipe-ingredient-chip" key=${item.id}>
        <div className="recipe-ingredient-chip-main">
          <span className="recipe-ingredient-chip-name">${item.name}</span>
          ${formatQuantityUnit(item.quantity, item.unit)
            ? html`<span className="recipe-ingredient-chip-qty">${formatQuantityUnit(item.quantity, item.unit)}</span>`
            : null}
        </div>
      </div>
    `;
  }

  function renderSlot(meal, slot) {
    const isLunch = slot === "lunch";
    const recipeId = isLunch ? meal.lunchRecipeId : meal.dinnerRecipeId;
    const text = isLunch ? meal.lunchText : meal.dinnerText;
    const cooked = isLunch ? meal.lunchCooked : meal.dinnerCooked;
    const recipe = recipeId ? safeRecipes.find((e) => e.id === recipeId) : null;

    return html`
      <div className="mrd-meals-slot-card" key=${`${meal.id}-${slot}`}>
        <div className="mrd-meals-slot-head">
          <div className="mrd-meals-slot-left">
            <span className="mrd-meals-slot-icon">${isLunch ? "☀️" : "🌙"}</span>
            <span className="mrd-meals-slot-label">${isLunch ? "DÉJEUNER" : "DÎNER"}</span>
          </div>
          <button className=${`mrd-meals-cook-btn ${cooked ? "on" : ""}`} onClick=${() => onToggleCook(meal.day, slot, meal.weekKey || targetWeekKey)}>
            ${cooked ? "✓ Cuisiné" : "Marquer cuisiné"}
          </button>
        </div>
        <div className="mrd-meals-slot-body">
          ${recipe
            ? html`
                <div className="mrd-meals-selected-row">
                  <span className="mrd-meals-selected-emoji" aria-hidden="true"><${CategoryIcon} categoryId=${recipe.category} size=${44} framed=${false} /></span>
                  <span className="mrd-meals-selected-name">${recipe.name}</span>
                  <div className="mrd-meals-selected-btns">
                    <button type="button" className="mrd-meals-icon-btn" onClick=${() => setViewModal(recipe)} aria-label="Voir la recette">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
                      </svg>
                    </button>
                    <button type="button" className="mrd-meals-icon-btn" onClick=${() => openPicker(meal.day, slot, meal.weekKey || targetWeekKey)} aria-label="Modifier la recette">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                    <button type="button" className="mrd-meals-icon-btn danger" onClick=${() => clearSlot(meal.day, slot, meal.weekKey || targetWeekKey)} aria-label="Retirer la recette">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              `
            : html`
                <button className="mrd-meals-pick-btn" onClick=${() => openPicker(meal.day, slot, targetWeekKey)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                  </svg>
                  Choisir un repas
                </button>
              `}
        </div>
        ${renderSlotExtras(meal, slot)}
      </div>
    `;
  }

  /* ── Accordéon entrée / dessert / autre ── */
  function renderSlotExtras(meal, slot) {
    const key = `${meal.id}-${slot}`;
    const isOpen = Boolean(accordionOpen[key]);
    const isLunch = slot === "lunch";
    const wk = meal.weekKey || targetWeekKey;

    const starterRecipeId = isLunch ? meal.lunchStarterRecipeId : meal.dinnerStarterRecipeId;
    const dessertRecipeId = isLunch ? meal.lunchDessertRecipeId : meal.dinnerDessertRecipeId;
    const extra           = isLunch ? meal.lunchExtra           : meal.dinnerExtra;
    const starterCooked   = isLunch ? meal.lunchStarterCooked   : meal.dinnerStarterCooked;
    const dessertCooked   = isLunch ? meal.lunchDessertCooked   : meal.dinnerDessertCooked;

    const starter = starterRecipeId ? safeRecipes.find((r) => r.id === starterRecipeId) : null;
    const dessert = dessertRecipeId ? safeRecipes.find((r) => r.id === dessertRecipeId) : null;

    const hasContent = starterRecipeId || dessertRecipeId || extra;

    function extraRecipeRow(recipe, onEdit, onRemove, cooked, onCook) {
      return html`
        <div className="mrd-meals-selected-row mrd-meals-selected-row--extra" style=${{ marginBottom: 0 }}>
          <span className="mrd-meals-selected-emoji" aria-hidden="true"><${CategoryIcon} categoryId=${recipe.category} size=${44} framed=${false} /></span>
          <span className="mrd-meals-selected-name">${recipe.name}</span>
          <div className="mrd-meals-selected-btns">
            <button type="button" className=${`mrd-meals-cook-btn mrd-meals-cook-btn--sm ${cooked ? "on" : ""}`} onClick=${onCook} title=${cooked ? "Démarquer" : "Marquer cuisiné"}>
              ${cooked ? "✓" : "✓"}
            </button>
            <button type="button" className="mrd-meals-icon-btn" onClick=${() => setViewModal(recipe)} aria-label="Voir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
            <button type="button" className="mrd-meals-icon-btn" onClick=${onEdit} aria-label="Modifier">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button type="button" className="mrd-meals-icon-btn danger" onClick=${onRemove} aria-label="Retirer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    return html`
      <div className=${`mrd-extras-accordion${hasContent && !isOpen ? " has-content" : ""}`}>
        <button type="button" className="mrd-extras-toggle"
          onClick=${() => setAccordionOpen((prev) => ({ ...prev, [key]: !isOpen }))}>
          <span>${isOpen ? "Masquer entrée / dessert / autre" : `Ajouter entrée, dessert, autre…${hasContent ? " ●" : ""}`}</span>
          <svg className=${`mrd-extras-chevron${isOpen ? " open" : ""}`} width="13" height="13" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>

        ${isOpen ? html`
          <div className="mrd-extras-body">

            <!-- Entrée -->
            <div className="mrd-extras-section">
              <span className="mrd-extras-label">Entrée</span>
              ${starter
                ? extraRecipeRow(
                    starter,
                    () => openPicker(meal.day, slot, wk, "starter"),
                    () => onUpdateMeal(meal.day, slot, { starterRecipeId: "" }, wk),
                    starterCooked,
                    () => onToggleCook(meal.day, slot, wk, "starter"),
                  )
                : html`<button type="button" className="mrd-extras-pick-btn" onClick=${() => openPicker(meal.day, slot, wk, "starter")}>
                    + Choisir une entrée
                  </button>`
              }
            </div>

            <!-- Dessert -->
            <div className="mrd-extras-section">
              <span className="mrd-extras-label">Dessert</span>
              ${dessert
                ? extraRecipeRow(
                    dessert,
                    () => openPicker(meal.day, slot, wk, "dessert"),
                    () => onUpdateMeal(meal.day, slot, { dessertRecipeId: "" }, wk),
                    dessertCooked,
                    () => onToggleCook(meal.day, slot, wk, "dessert"),
                  )
                : html`<button type="button" className="mrd-extras-pick-btn" onClick=${() => openPicker(meal.day, slot, wk, "dessert")}>
                    + Choisir un dessert
                  </button>`
              }
            </div>

            <!-- Autre -->
            <div className="mrd-extras-section">
              <span className="mrd-extras-label">Autre à cuisiner</span>
              <input className="mtext" placeholder="Pain, salade, apéro, etc."
                value=${extra}
                onInput=${(e) => onUpdateMeal(meal.day, slot, { extra: e.target.value }, wk)} />
            </div>

          </div>
        ` : null}
      </div>
    `;
  }

  /* ── Picker plein écran — même présentation que la page Recettes ── */
  function renderPicker() {
    if (!pickModal) return null;
    const slotLabel = pickModal.slot === "lunch" ? "Déjeuner" : "Dîner";
    const sub = pickModal.subSlot || "main";
    const pickerTitle = sub === "starter" ? "Choisir une entrée" : sub === "dessert" ? "Choisir un dessert" : "Choisir une recette";

    const searchIcon = html`
      <span className="recipes-page-search-icon" aria-hidden="true">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </span>
    `;

    return html`
      <div className="modal-backdrop meal-picker-backdrop" onClick=${closePicker}>
      <div className="modal-card meal-picker-modal" onClick=${(e) => e.stopPropagation()}>

        <div className="task-modal-head">
          <div>
            <div className="miniTitle">${pickModal.day} — ${slotLabel}</div>
            <div className="st">${pickerTitle}</div>
          </div>
          <button type="button" className="delbtn" onClick=${closePicker}>✕</button>
        </div>

        <div className="meal-picker-overlay-body">

          <!-- Barre de recherche -->
          <div className="recipes-page-search-wrap">
            ${searchIcon}
            <input
              className="ainp recipes-page-search-input"
              type="search"
              placeholder="Rechercher une recette…"
              value=${pickSearch}
              onInput=${(e) => setPickSearch(e.target.value)}
              autocomplete="off"
            />
            ${pickSearch.trim() ? html`
              <button type="button" className="recipes-page-search-clear" onClick=${() => setPickSearch("")} aria-label="Effacer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            ` : null}
          </div>

          <!-- Filtres disponibilité + catégorie -->
          <div className="recipes-page-selects-row">
            <select className="asel recipes-page-select" value=${pickAvailFilter} onChange=${(e) => setPickAvailFilter(e.target.value)}>
              <option value="all">Toute période</option>
              <option value="current">Du moment</option>
              <option value="all_year">Toute saison</option>
              ${SEASONS.map((s) => html`<option key=${s.id} value=${`season:${s.id}`}>${s.label}</option>`)}
              <option disabled>──</option>
              ${MONTHS.map((m) => html`<option key=${m.id} value=${`month:${m.id}`}>${m.label}</option>`)}
            </select>
            <select className="asel recipes-page-select" value=${pickCategoryFilter} onChange=${(e) => setPickCategoryFilter(e.target.value)}>
              <option value="">Toute catégorie</option>
              ${CATEGORIES.map((cat) => html`<option key=${cat.id} value=${cat.id}>${cat.label}</option>`)}
            </select>
          </div>

          <!-- Filtres régime + restriction (même style que période/catégorie) -->
          <div className="recipes-page-selects-row">
            <select className="asel recipes-page-select" value=${pickFoodTypeFilter} onChange=${(e) => setPickFoodTypeFilter(e.target.value)}>
              <option value="">Tout régime</option>
              ${FOOD_TYPES.map((t) => html`<option key=${t.id} value=${t.id}>${t.icon} ${t.label}</option>`)}
            </select>
            <select className="asel recipes-page-select" value=${pickRestrictionFilter} onChange=${(e) => setPickRestrictionFilter(e.target.value)}>
              <option value="">Toute restriction</option>
              ${RESTRICTIONS.map((r) => html`<option key=${r.id} value=${r.id}>${r.label}</option>`)}
            </select>
          </div>

          <!-- Bouton Rapide -->
          <button type="button"
            className=${`pick-quick-btn ${pickQuickOnly ? "on" : ""}`}
            onClick=${() => setPickQuickOnly((v) => !v)}>
            ⚡ Rapide (moins de 10 min)
          </button>

          <!-- Compteur -->
          <div className="recipes-page-list-head">
            ${filteredPickerRecipes.length} recette${filteredPickerRecipes.length !== 1 ? "s" : ""}
          </div>

          <!-- Liste de recettes — même cartes que la page Recettes -->
          <div className="rlist recipes-page-rlist">
            ${filteredPickerRecipes.length
              ? filteredPickerRecipes.map((recipe) => {
                  const firstFoodType = FOOD_TYPES.find((t) => (Array.isArray(recipe.labels) ? recipe.labels : []).includes(t.id));
                  const categoryLabel = recipe.category ? (CATEGORIES.find((c) => c.id === recipe.category)?.label || null) : null;
                  const shortAvail = availabilityLabelShort(recipe);
                  const durationInfo = recipeDurationLabel(recipe);
                  const servings = Number(recipe.servings) || 4;
                  return html`
                    <article
                      className="rcard rcard-recipe"
                      key=${recipe.id}
                      tabIndex=${0}
                      role="button"
                      aria-label=${`Choisir : ${recipe.name || "Recette"}`}
                      onClick=${() => selectRecipe(recipe.id)}
                      onKeyDown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectRecipe(recipe.id); } }}
                    >
                      <div className="rcard-recipe-thumb" aria-hidden="true">
                        ${recipe.photo
                          ? html`<img src=${recipe.photo} alt="" style=${{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />`
                          : html`<${CategoryIcon} categoryId=${recipe.category} size=${64} framed=${false} />`}
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
                    </article>
                  `;
                })
              : html`
                  <div className="empty recipes-page-empty">
                    <div className="recipes-page-empty-emoji" aria-hidden="true">🍳</div>
                    <div>Aucune recette ne correspond.</div>
                  </div>
                `}
          </div>

        </div>
      </div>
      </div>
    `;
  }

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

  function renderCondimentBadge(condimentId) {
    const c = CONDIMENTS.find((x) => x.id === condimentId);
    return c ? html`<span key=${condimentId} className="condiment-badge">${c.label}</span>` : null;
  }

  function renderRecipeDetail() {
    if (!viewModal) return null;
    const recipe = viewModal;
    const baseServings = Math.max(1, Number(recipe.servings) || 1);
    const ratio = viewSheetServings / baseServings;
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.filter((item) => item?.name) : [];
    const legacyIng = String(recipe.ingredientsLegacy || "").trim();
    const firstLabelId = Array.isArray(recipe.labels) && recipe.labels.length ? recipe.labels[0] : null;
    const firstLabelDef = firstLabelId ? FOOD_LABELS.find((entry) => entry.id === firstLabelId) : null;
    const prepTimeNum = recipe.prepTime ? Number(recipe.prepTime) : NaN;
    const cookTimeNum = recipe.cookTime ? Number(recipe.cookTime) : NaN;
    const legacyTimeNum = recipe.time != null && recipe.time !== "" ? Number(recipe.time) : NaN;
    const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
    const categoryDef = recipe.category ? CATEGORIES.find((c) => c.id === recipe.category) : null;

    function close() {
      setViewModal(null);
      setViewSheetTab("ingredients");
      setViewSheetServings(4);
    }

    return html`
      <div className="modal-backdrop mrd-recipe-view-backdrop" onClick=${close}>
        <div className="recipe-sheet mrd-recipe-view-sheet" onClick=${(e) => e.stopPropagation()}>

          <header className="mrd-back-hdr recipe-sheet-header" style=${{ position: "sticky", top: 0, zIndex: 10 }}>
            <div className="mrd-back-hdr-main">
              <button type="button" className="mrd-back-btn" onClick=${close} aria-label="Fermer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M6 18L18 6M6 6l12 12" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
              <span className="mrd-screen-title recipe-sheet-hdr-title">${recipe.name}</span>
            </div>
          </header>

          <div className="recipe-sheet-body">

            <div className="mrd-meal-card recipe-sheet-hero">
              ${recipe.photo
                ? html`<div className="recipe-sheet-hero-photo"><img src=${recipe.photo} alt="" /></div>`
                : html`<div className="recipe-sheet-hero-cat-icon" aria-hidden="true"><${CategoryIcon} categoryId=${recipe.category} size=${84} framed=${false}/></div>`}
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
                <button type="button" className="recipe-sheet-servings-btn" aria-label="Moins"
                  onClick=${() => setViewSheetServings((s) => Math.max(1, s - 1))}>−</button>
                <div className="recipe-sheet-servings-center">
                  <div className="recipe-sheet-servings-value">${viewSheetServings}</div>
                  <div className="recipe-sheet-servings-label">personnes</div>
                </div>
                <button type="button" className="recipe-sheet-servings-btn" aria-label="Plus"
                  onClick=${() => setViewSheetServings((s) => Math.min(24, s + 1))}>+</button>
              </div>
            </div>

            <div className="mrd-subtabs recipe-sheet-tabs">
              <button type="button" className=${`mrd-subtab-btn ${viewSheetTab === "ingredients" ? "on" : ""}`}
                onClick=${() => setViewSheetTab("ingredients")}>Ingrédients</button>
              <button type="button" className=${`mrd-subtab-btn ${viewSheetTab === "method" ? "on" : ""}`}
                onClick=${() => setViewSheetTab("method")}>Préparation</button>
            </div>

            ${viewSheetTab === "ingredients"
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
                        : html`<div className="recipe-sheet-empty-block">Aucun ingrédient renseigné.</div>`}
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

          </div>
        </div>
      </div>
    `;
  }

  function renderMissingModal() {
    if (!missingModal) return null;
    const isManualMode = missingModal.mode === "manual";
    const condimentItems = missingModal.condimentItems || [];
    const hasIngredients = missingModal.items.length > 0;
    const hasCondiments = condimentItems.length > 0;
    const nothingMissing = !hasIngredients && !hasCondiments;
    const canSubmit = isManualMode ? missingModal.selectedIds.length > 0 : !nothingMissing;

    return html`
      <div className="modal-backdrop" onClick=${() => setMissingModal(null)}>
        <div className="modal-card task-modal" onClick=${(e) => e.stopPropagation()}>
          <div className="task-modal-head">
            <div>
              <div className="miniTitle">${isManualMode ? "Liste de courses" : "Inventaire"}</div>
              <div className="st">${missingModal.recipeName}</div>
            </div>
            <button className="delbtn" onClick=${() => setMissingModal(null)}>X</button>
          </div>
          ${!isManualMode && nothingMissing
            ? html`<div className="mini" style=${{ marginBottom: "16px", color: "#7A8C6A" }}>✓ Tout est disponible dans votre inventaire.</div>`
            : null}
          ${hasIngredients ? html`
            <div className="miniTitle" style=${{ marginBottom: "6px" }}>${isManualMode ? "Ingrédients principaux" : "Manquants"}</div>
            <div className="settings-stack" style=${{ gap: "6px", marginBottom: "14px" }}>
              ${missingModal.items.map((item) => html`
                <label key=${item.id} className="sitem" style=${{ justifyContent: "space-between", padding: "8px 10px", marginBottom: "0" }}>
                  <div className="help" style=${{ gap: "10px" }}>
                    <input type="checkbox" checked=${missingModal.selectedIds.includes(item.id)} onChange=${() => toggleMissingIngredient(item.id)}/>
                    <span>${item.name}</span>
                  </div>
                  ${formatQuantityUnit(item.quantity, item.unit) ? html`<span className="mini">${formatQuantityUnit(item.quantity, item.unit)}</span>` : null}
                </label>
              `)}
            </div>
          ` : null}
          ${hasCondiments ? html`
            <div className="miniTitle" style=${{ marginBottom: "4px" }}>Condiments manquants</div>
            <div className="settings-stack" style=${{ gap: "6px", marginBottom: "14px" }}>
              ${condimentItems.map((item) => html`
                <label key=${item.id} className="sitem" style=${{ padding: "8px 10px", marginBottom: "0" }}>
                  <div className="help" style=${{ gap: "10px" }}>
                    <input type="checkbox" checked=${(missingModal.selectedCondiments || []).includes(item.id)} onChange=${() => toggleMissingCondiment(item.id)}/>
                    <span>${item.name}</span>
                  </div>
                </label>
              `)}
            </div>
          ` : null}
          <div className="task-modal-actions">
            <button type="button" className="acn" onClick=${() => setMissingModal(null)}>Fermer</button>
            ${canSubmit ? html`<button type="button" className="aok" onClick=${addSelectedMissingIngredients}>Ajouter à la liste</button>` : null}
          </div>
        </div>
      </div>
    `;
  }

  const DAY_ABBR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const selectedMeal = mealRows[selectedDayIdx];

  /* ── Label de la semaine affichée ── */
  const weekSunday = addDays(targetMonday, 6);
  const sameMonth = targetMonday.getMonth() === weekSunday.getMonth();
  const weekLabel = sameMonth
    ? `${targetMonday.getDate()} – ${weekSunday.getDate()} ${MONTH_NAMES[weekSunday.getMonth()]}`
    : `${targetMonday.getDate()} ${MONTH_NAMES[targetMonday.getMonth()]} – ${weekSunday.getDate()} ${MONTH_NAMES[weekSunday.getMonth()]}`;

  /* ── Vue mois : 4-5 semaines du mois de la semaine affichée ── */
  function renderMonthView() {
    const refMonth = targetMonday.getMonth();
    const refYear = targetMonday.getFullYear();
    // Premier lundi avant ou égal au 1er du mois
    const firstOfMonth = new Date(refYear, refMonth, 1);
    const firstMonday = computeMonday(firstOfMonth);
    // On affiche jusqu'à 6 semaines pour couvrir tout le mois
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      const wMonday = addDays(firstMonday, w * 7);
      // Arrêter si la semaine dépasse le mois
      if (wMonday.getMonth() > refMonth && wMonday.getFullYear() >= refYear) break;
      weeks.push(wMonday);
    }

    return html`
      <div className="mrd-month-view">
        ${weeks.map((wMonday) => {
          const wKey = dateToKey(wMonday);
          const wSunday = addDays(wMonday, 6);
          const isActiveWeek = wKey === targetWeekKey;
          const wSameMonth = wMonday.getMonth() === wSunday.getMonth();
          const wLabel = wSameMonth
            ? `${wMonday.getDate()} – ${wSunday.getDate()} ${MONTH_NAMES[wSunday.getMonth()]}`
            : `${wMonday.getDate()} ${MONTH_NAMES[wMonday.getMonth()].slice(0,3)} – ${wSunday.getDate()} ${MONTH_NAMES[wSunday.getMonth()].slice(0,3)}`;

          return html`
            <div key=${wKey} className=${`mrd-month-week ${isActiveWeek ? "active" : ""}`}>
              <button className="mrd-month-week-head" onClick=${() => {
                const diff = Math.round((wMonday - todayMonday) / (7 * 86400000));
                setWeekOffset(diff);
                setViewMode("week");
              }}>
                <span className="mrd-month-week-label">${wLabel}</span>
                <span className="mrd-month-week-arrow">›</span>
              </button>
              ${DAYS.map((day, idx) => {
                const date = addDays(wMonday, idx);
                const isCurrentMonth = date.getMonth() === refMonth;
                const isToday = dateToKey(date) === dateToKey(today);
                const wMeal = safeMeals.find((m) => m.day === day && (m.weekKey === wKey || (wKey === dateToKey(todayMonday) && (!m.weekKey || m.weekKey === ""))));
                const lr = wMeal?.lunchRecipeId ? safeRecipes.find((r) => r.id === wMeal.lunchRecipeId) : null;
                const dr = wMeal?.dinnerRecipeId ? safeRecipes.find((r) => r.id === wMeal.dinnerRecipeId) : null;
                return html`
                  <div key=${idx} className=${`mrd-meals-overview-row${isToday ? " today" : ""}${!isCurrentMonth ? " out-of-month" : ""}`}
                    style=${{ cursor: "default" }}>
                    <div className="mrd-meals-overview-day">
                      <span className="mrd-meals-overview-abbr">${DAY_ABBR[idx]}</span>
                      <span className="mrd-meals-overview-date">${date.getDate()}</span>
                    </div>
                    <div className="mrd-meals-overview-slots">
                      <div className="mrd-meals-overview-slot">
                        <span className="mrd-meals-overview-slot-icon">☀️</span>
                        <span className=${`mrd-meals-overview-slot-name${lr ? "" : " empty"}`}>${lr ? lr.name : "—"}</span>
                      </div>
                      <div className="mrd-meals-overview-slot">
                        <span className="mrd-meals-overview-slot-icon">🌙</span>
                        <span className=${`mrd-meals-overview-slot-name${dr ? "" : " empty"}`}>${dr ? dr.name : "—"}</span>
                      </div>
                    </div>
                  </div>
                `;
              })}
            </div>
          `;
        })}
      </div>
    `;
  }

  return html`
    <section className="rwrap">

      ${/* ── Barre de navigation semaine ── */null}
      <div className="mrd-meals-week-nav">
        <button className="mrd-meals-week-btn" onClick=${() => setWeekOffset((n) => n - 1)} aria-label="Semaine précédente">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button className="mrd-meals-week-label-btn" onClick=${() => { setWeekOffset(0); setViewMode("week"); }}>
          ${isCurrentWeek ? "Cette semaine" : weekLabel}
        </button>
        <button className="mrd-meals-week-btn" onClick=${() => setWeekOffset((n) => n + 1)} aria-label="Semaine suivante">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button className=${`mrd-meals-view-toggle ${viewMode === "month" ? "on" : ""}`}
          onClick=${() => setViewMode((m) => m === "month" ? "week" : "month")}>
          Mois
        </button>
      </div>

      ${viewMode === "month" ? renderMonthView() : html`

        ${/* ── Bande de jours centrée ── */null}
        <div className="mrd-meals-day-strip">
          ${DAYS.map((_, idx) => {
            const date = weekDates[idx];
            const isToday = isCurrentWeek && idx === todayIdx;
            const isOn = idx === selectedDayIdx;
            return html`
              <button key=${idx}
                className=${`mrd-meals-day-pill ${isOn ? "on" : ""} ${isToday && !isOn ? "today" : ""}`}
                onClick=${() => setSelectedDayIdx(idx)}>
                <span className="mrd-meals-day-abbr">${DAY_ABBR[idx]}</span>
                <span className="mrd-meals-day-num">${date.getDate()}</span>
              </button>
            `;
          })}
        </div>

        ${/* ── Cartes du jour sélectionné ── */null}
        ${selectedMeal ? html`
          <div className="mrd-meals-day-slots">
            ${renderSlot(selectedMeal, "lunch")}
            ${renderSlot(selectedMeal, "dinner")}
          </div>
        ` : null}

        ${/* ── Lien inventaire ── */null}
        <button type="button"
          className=${`mrd-inv-badge${linkMealsToInventory ? " on" : ""}`}
          style=${{ marginBottom: "14px" }}
          onClick=${() => onToggleLinkMealsToInventory?.(!linkMealsToInventory)}
        >${linkMealsToInventory ? "●" : "○"} Lié à l'inventaire</button>

        ${/* ── Aperçu de la semaine ── */null}
        <div className="mrd-section-head" style=${{ marginBottom: "10px" }}>
          <span className="mrd-section-title">Aperçu de la semaine</span>
        </div>
        ${mealRows.map((meal, idx) => {
          const date = weekDates[idx];
          const lr = meal.lunchRecipeId ? safeRecipes.find((r) => r.id === meal.lunchRecipeId) : null;
          const dr = meal.dinnerRecipeId ? safeRecipes.find((r) => r.id === meal.dinnerRecipeId) : null;
          const isToday = isCurrentWeek && idx === todayIdx;
          const isOn = idx === selectedDayIdx;
          return html`
            <button key=${meal.id}
              className=${`mrd-meals-overview-row ${isToday ? "today" : ""} ${isOn ? "selected" : ""}`}
              onClick=${() => setSelectedDayIdx(idx)}>
              <div className="mrd-meals-overview-day">
                <span className="mrd-meals-overview-abbr">${DAY_ABBR[idx]}</span>
                <span className="mrd-meals-overview-date">${date.getDate()}</span>
              </div>
              <div className="mrd-meals-overview-slots">
                <div className="mrd-meals-overview-slot">
                  <span className="mrd-meals-overview-slot-icon">☀️</span>
                  <span className=${`mrd-meals-overview-slot-name${lr ? "" : " empty"}`}>${lr ? lr.name : "—"}</span>
                </div>
                <div className="mrd-meals-overview-slot">
                  <span className="mrd-meals-overview-slot-icon">🌙</span>
                  <span className=${`mrd-meals-overview-slot-name${dr ? "" : " empty"}`}>${dr ? dr.name : "—"}</span>
                </div>
              </div>
            </button>
          `;
        })}
      `}

      ${renderPicker()}
      ${renderRecipeDetail()}
      ${renderMissingModal()}
    </section>
  `;
}

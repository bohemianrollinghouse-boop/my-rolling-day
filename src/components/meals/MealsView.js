import { DAYS } from "../../constants.js";
import { html, useMemo, useState } from "../../lib.js";
import { getCurrentAppDate } from "../../utils/date.js?v=2026-04-19-time-sim-2";
import { createMealShell } from "../../utils/state.js?v=2026-04-26-storage-location-fix-1";
import { formatQuantityUnit, normalizeProductName } from "../../utils/productUtils.js";
import { CONDIMENTS } from "../../data/condiments.js";

const SEASONS = [
  { id: "spring", label: "Printemps", months: [3, 4, 5] },
  { id: "summer", label: "Ete", months: [6, 7, 8] },
  { id: "autumn", label: "Automne", months: [9, 10, 11] },
  { id: "winter", label: "Hiver", months: [12, 1, 2] },
];

const MONTHS = [
  { id: 1, label: "Janvier" }, { id: 2, label: "Fevrier" }, { id: 3, label: "Mars" },
  { id: 4, label: "Avril" }, { id: 5, label: "Mai" }, { id: 6, label: "Juin" },
  { id: 7, label: "Juillet" }, { id: 8, label: "Aout" }, { id: 9, label: "Septembre" },
  { id: 10, label: "Octobre" }, { id: 11, label: "Novembre" }, { id: 12, label: "Decembre" },
];

const FOOD_LABELS = [
  { id: "vegetarian", label: "Vegetarien", icon: "🥕" },
  { id: "vegan", label: "Vegan", icon: "🌱" },
  { id: "omnivore", label: "Omnivore", icon: "🍽️" },
  { id: "pescetarian", label: "Pescetarien", icon: "🐟" },
  { id: "flexitarian", label: "Flexitarien", icon: "🌿" },
  { id: "lactose_free", label: "Sans lactose", icon: "🥛" },
  { id: "gluten_free", label: "Sans gluten", icon: "🌾" },
  { id: "halal", label: "Halal", icon: "🕌" },
  { id: "kosher", label: "Casher", icon: "✡️" },
];

const AVAIL_FILTERS = [
  { value: "all", label: "Toutes" },
  { value: "current", label: "Du moment" },
  { value: "all_year", label: "Toutes saisons" },
  { value: "season:spring", label: "Printemps" },
  { value: "season:summer", label: "Ete" },
  { value: "season:autumn", label: "Automne" },
  { value: "season:winter", label: "Hiver" },
];

function seasonById(seasonId) {
  return SEASONS.find((season) => season.id === seasonId) || SEASONS[0];
}

function uniqueMonths(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => Number(value)).filter((value) => value >= 1 && value <= 12))];
}

function recipeMonths(recipe) {
  if (recipe.availabilityMode === "all_year") return MONTHS.map((month) => month.id);
  if (recipe.availabilityMode === "season") {
    if (Array.isArray(recipe.months) && recipe.months.length) return uniqueMonths(recipe.months);
    return [...(seasonById(recipe.season).months || [])];
  }
  return uniqueMonths(recipe.months);
}

function matchesAvailability(recipe, filterValue, currentMonth) {
  if (filterValue === "all") return true;
  if (filterValue === "current") return recipeMonths(recipe).includes(currentMonth);
  if (filterValue === "all_year") return recipe.availabilityMode === "all_year";
  if (filterValue.startsWith("season:")) {
    const seasonId = filterValue.split(":")[1];
    return recipeMonths(recipe).some((month) => seasonById(seasonId).months.includes(month));
  }
  return true;
}

function availabilityLabel(recipe) {
  if (recipe.availabilityMode === "all_year") return "Toute saison";
  if (recipe.availabilityMode === "season") {
    const season = seasonById(recipe.season);
    const seasonMonths = season.months || [];
    const selected = recipeMonths(recipe);
    if (selected.length === seasonMonths.length && selected.every((month) => seasonMonths.includes(month))) return season.label;
    return `${season.label} - ${selected.map((id) => MONTHS.find((month) => month.id === id)?.label).filter(Boolean).join(", ")}`;
  }
  return recipeMonths(recipe).map((id) => MONTHS.find((month) => month.id === id)?.label).filter(Boolean).join(", ");
}

function recipeSearchText(recipe) {
  const ingredientNames = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((item) => item.name || "").join(" ")
    : "";
  return `${recipe.name || ""} ${ingredientNames} ${recipe.ingredientsLegacy || ""}`.toLowerCase();
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
      const normalizedLabel = label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const firstWord = normalizedLabel.split(/\s+/)[0];
      return !safeInventory.some((item) => {
        const normalizedItem = (item.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

    if (!matches.length) {
      missing.push({ ...ingredient, missingGroup: "main" });
      return missing;
    }

    const requiredQty = parseNumericQuantity(ingredient.quantity);
    const ingredientUnit = String(ingredient.unit || "").trim();
    if (requiredQty == null || !ingredientUnit) return missing;

    const sameUnitMatches = matches.filter((item) => String(item.unit || "").trim() === ingredientUnit);
    if (!sameUnitMatches.length) {
      missing.push({ ...ingredient, missingGroup: "main" });
      return missing;
    }

    const availableQty = sameUnitMatches.reduce((sum, item) => sum + (parseNumericQuantity(item.quantity) || 0), 0);
    if (availableQty < requiredQty) {
      missing.push({ ...ingredient, missingGroup: "main", quantity: String(requiredQty - availableQty).replace(".", ",") });
    }
    return missing;
  }, []);
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
  const mealRows = DAYS.map((day, index) => meals.find((meal) => meal.day === day) || createMealShell(day, index));

  // Compute dates for the current week (Mon–Sun)
  const monday = (() => {
    const d = new Date(today);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const weekDates = DAYS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const todayIdx = (() => { const d = today.getDay(); return d === 0 ? 6 : d - 1; })();

  const [selectedDayIdx, setSelectedDayIdx] = useState(todayIdx);
  const [pickModal, setPickModal] = useState(null);
  const [viewModal, setViewModal] = useState(null);
  const [missingModal, setMissingModal] = useState(null);
  const [pickSearch, setPickSearch] = useState("");
  const [pickAvailFilter, setPickAvailFilter] = useState("all");
  const [pickLabels, setPickLabels] = useState([]);

  const filteredPickerRecipes = useMemo(() => {
    const query = pickSearch.trim().toLowerCase();
    return safeRecipes
      .filter((recipe) => {
        const haystack = recipeSearchText(recipe);
        if (query && !haystack.includes(query)) return false;
        if (!matchesAvailability(recipe, pickAvailFilter, currentMonth)) return false;
        const recipeLabels = Array.isArray(recipe.labels) ? recipe.labels : [];
        return pickLabels.every((labelId) => recipeLabels.includes(labelId));
      })
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "fr", { sensitivity: "base" }));
  }, [safeRecipes, pickSearch, pickAvailFilter, pickLabels, currentMonth]);

  function openPicker(day, slot) {
    setPickModal({ day, slot });
    setPickSearch("");
    setPickAvailFilter("all");
    setPickLabels([]);
  }

  function closePicker() {
    setPickModal(null);
  }

  function selectRecipe(recipeId) {
    if (!pickModal) return;
    const recipe = safeRecipes.find((entry) => entry.id === recipeId);
    onUpdateMeal(pickModal.day, pickModal.slot, { recipeId });
    closePicker();

    if (!linkMealsToInventory || !recipe) return;

    const missing = computeMissingIngredients(recipe, inventory);
    const missingCondiments = computeMissingCondiments(recipe, inventory);
    if (!missing.length && !missingCondiments.length) return;

    setMissingModal({
      recipeName: recipe.name,
      mode: "inventory",
      items: missing,
      condimentItems: missingCondiments,
      selectedIds: missing.map((item) => item.id),
      selectedCondiments: [],
    });
  }

  function openManualIngredientPicker(recipe) {
    if (!recipe) return;
    const mainItems = Array.isArray(recipe.ingredients)
      ? recipe.ingredients.filter((item) => item?.name)
      : [];
    if (!mainItems.length) return;

    setMissingModal({
      recipeName: recipe.name,
      mode: "manual",
      items: mainItems,
      condimentItems: [],
      selectedIds: [],
      selectedCondiments: [],
    });
  }

  function clearSlot(day, slot) {
    onUpdateMeal(day, slot, { recipeId: "" });
  }

  function togglePickLabel(labelId) {
    setPickLabels((previous) => previous.includes(labelId) ? previous.filter((id) => id !== labelId) : [...previous, labelId]);
  }

  function toggleMissingIngredient(ingredientId) {
    setMissingModal((previous) => {
      if (!previous) return previous;
      const selectedIds = previous.selectedIds.includes(ingredientId)
        ? previous.selectedIds.filter((id) => id !== ingredientId)
        : [...previous.selectedIds, ingredientId];
      return { ...previous, selectedIds };
    });
  }

  function toggleMissingCondiment(condimentId) {
    setMissingModal((previous) => {
      if (!previous) return previous;
      const selectedCondiments = (previous.selectedCondiments || []).includes(condimentId)
        ? (previous.selectedCondiments || []).filter((id) => id !== condimentId)
        : [...(previous.selectedCondiments || []), condimentId];
      return { ...previous, selectedCondiments };
    });
  }

  function addSelectedMissingIngredients() {
    if (!missingModal) return;
    const selectedItems = missingModal.items.filter((item) => missingModal.selectedIds.includes(item.id));
    const selectedCondimentItems = (missingModal.condimentItems || [])
      .filter((item) => (missingModal.selectedCondiments || []).includes(item.id))
      .map((item) => ({ id: item.id, name: item.name, quantity: "", unit: "" }));
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
    const recipe = recipeId ? safeRecipes.find((entry) => entry.id === recipeId) : null;

    return html`
      <div className="mrd-meals-slot-card" key=${`${meal.id}-${slot}`}>
        <div className="mrd-meals-slot-head">
          <div className="mrd-meals-slot-left">
            <span className="mrd-meals-slot-icon">${isLunch ? "☀️" : "🌙"}</span>
            <span className="mrd-meals-slot-label">${isLunch ? "DÉJEUNER" : "DÎNER"}</span>
          </div>
          <button className=${`mrd-meals-cook-btn ${cooked ? "on" : ""}`} onClick=${() => onToggleCook(meal.day, slot)}>
            ${cooked ? "✓ Cuisiné" : "Marquer cuisiné"}
          </button>
        </div>
        <div className="mrd-meals-slot-body">
          ${recipe
            ? html`
                <div className="mrd-meals-recipe-name">${recipe.name}</div>
                <div className="mrd-meals-tags">
                  <span className="mrd-meals-tag">Recette</span>
                  <span className="mrd-meals-tag">${recipe.servings || 4} pers.</span>
                  ${Array.isArray(recipe.labels) ? recipe.labels.map(renderFoodBadge) : null}
                </div>
                <div className="mrd-meals-slot-actions">
                  <button className="mrd-meals-action-link" onClick=${() => setViewModal(recipe)}>Voir la recette</button>
                  <button className="mrd-meals-action-link" onClick=${() => openPicker(meal.day, slot)}>Modifier</button>
                  ${!linkMealsToInventory
                    ? html`<button className="mrd-meals-action-link" onClick=${() => openManualIngredientPicker(recipe)}>Ajouter les ingrédients à ma liste</button>`
                    : null}
                  <button className="mrd-meals-action-link danger" onClick=${() => clearSlot(meal.day, slot)}>Retirer</button>
                </div>
              `
            : html`
                <button className="mrd-meals-pick-btn" onClick=${() => openPicker(meal.day, slot)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                  </svg>
                  Choisir un repas
                </button>
              `}
          <input className="mtext" style=${{ marginTop: "8px" }} placeholder="Notes libres…"
            value=${text} onInput=${(event) => onUpdateMeal(meal.day, slot, { text: event.target.value })} />
        </div>
      </div>
    `;
  }

  function renderPickerCard(recipe) {
    return html`
      <button key=${recipe.id} type="button" className="meal-picker-card" onClick=${() => selectRecipe(recipe.id)}>
        <div className="meal-picker-card-top">
          <span className="meal-picker-card-name">${recipe.name}</span>
          <span className="mini" style=${{ color: "var(--muted, #9A8978)", flexShrink: "0", marginLeft: "8px" }}>${availabilityLabel(recipe)}</span>
        </div>
        ${Array.isArray(recipe.labels) && recipe.labels.length
          ? html`<div style=${{ display: "flex", gap: "4px", marginTop: "5px", flexWrap: "wrap" }}>${recipe.labels.map(renderFoodBadge)}</div>`
          : null}
      </button>
    `;
  }

  function renderPicker() {
    if (!pickModal) return null;
    const slotLabel = pickModal.slot === "lunch" ? "Midi" : "Soir";

    return html`
      <div className="modal-backdrop" onClick=${closePicker}>
        <div className="modal-card task-modal meal-picker-modal" onClick=${(event) => event.stopPropagation()}>
          <div className="task-modal-head">
            <div>
              <div className="miniTitle">Repas - ${pickModal.day} ${slotLabel}</div>
              <div className="st">Choisir une recette</div>
            </div>
            <button className="delbtn" onClick=${closePicker}>X</button>
          </div>

          <input
            className="ainp"
            placeholder="Rechercher une recette..."
            value=${pickSearch}
            onInput=${(event) => setPickSearch(event.target.value)}
            autocomplete="off"
            style=${{ marginBottom: "10px" }}
          />

          <div className="meal-picker-filters">
            ${AVAIL_FILTERS.map((filter) => html`
              <button
                key=${filter.value}
                type="button"
                className=${`task-choice ${pickAvailFilter === filter.value ? "on" : ""}`}
                style=${{ fontSize: "12px", padding: "5px 10px", minHeight: "30px", whiteSpace: "nowrap" }}
                onClick=${() => setPickAvailFilter(filter.value)}
              >
                ${filter.label}
              </button>
            `)}
          </div>

          <div className="meal-picker-filters" style=${{ marginBottom: "4px" }}>
            ${FOOD_LABELS.map((label) => html`
              <button
                key=${label.id}
                type="button"
                className=${`task-choice ${pickLabels.includes(label.id) ? "on" : ""}`}
                style=${{ fontSize: "11px", padding: "4px 8px", minHeight: "28px" }}
                onClick=${() => togglePickLabel(label.id)}
                title=${label.label}
              >
                ${label.icon}
              </button>
            `)}
          </div>

          <div className="meal-picker-list">
            ${filteredPickerRecipes.length
              ? filteredPickerRecipes.map(renderPickerCard)
              : html`<div className="empty" style=${{ padding: "24px 0" }}>Aucune recette pour ce filtre.</div>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderRecipeDetail() {
    if (!viewModal) return null;
    const recipe = viewModal;

    return html`
      <div className="modal-backdrop" onClick=${() => setViewModal(null)}>
        <div className="modal-card task-modal" onClick=${(event) => event.stopPropagation()}>
          <div className="task-modal-head">
            <div>
              <div className="miniTitle">${availabilityLabel(recipe)}</div>
              <div className="st">${recipe.name}</div>
            </div>
            <button className="delbtn" onClick=${() => setViewModal(null)}>X</button>
          </div>

          ${Array.isArray(recipe.labels) && recipe.labels.length
            ? html`<div style=${{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "14px" }}>${recipe.labels.map(renderFoodBadge)}</div>`
            : null}

          <div className="recipe-servings-note" style=${{ marginBottom: "14px" }}>
            <strong>Recette pour ${recipe.servings || 4} ${Number(recipe.servings || 4) > 1 ? "personnes" : "personne"}</strong>
            <span>Pensez a adapter les quantites si vous cuisinez pour un autre nombre de personnes.</span>
          </div>

          <div className="miniTitle">Ingredients</div>
          ${Array.isArray(recipe.ingredients) && recipe.ingredients.length
            ? html`<div className="recipe-ingredient-chip-list" style=${{ marginBottom: "12px" }}>${recipe.ingredients.map(renderIngredientLine)}</div>`
            : html`<div className="rbody" style=${{ marginBottom: "12px" }}>${recipe.ingredientsLegacy || "Non renseignes."}</div>`}

          ${Array.isArray(recipe.condiments) && recipe.condiments.length
            ? html`
                <div className="miniTitle">Condiments / epices</div>
                <div className="condiment-badge-list" style=${{ marginBottom: "16px" }}>
                  ${recipe.condiments.map((condimentId) => {
                    const condiment = CONDIMENTS.find((c) => c.id === condimentId);
                    return condiment
                      ? html`<span key=${condimentId} className="condiment-badge">${condiment.label}</span>`
                      : null;
                  })}
                </div>
              `
            : null}

          <div className="miniTitle">Preparation</div>
          <div className="rbody" style=${{ marginBottom: "16px" }}>${recipe.method || "Non renseignee."}</div>

          <div className="task-modal-actions">
            <button type="button" className="clrbtn" onClick=${() => setViewModal(null)}>Fermer</button>
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
        <div className="modal-card task-modal" onClick=${(event) => event.stopPropagation()}>
          <div className="task-modal-head">
            <div>
              <div className="miniTitle">${isManualMode ? "Liste de courses" : "Inventaire"}</div>
              <div className="st">${missingModal.recipeName}</div>
            </div>
            <button className="delbtn" onClick=${() => setMissingModal(null)}>X</button>
          </div>

          ${isManualMode
            ? html`<div className="mini" style=${{ marginBottom: "16px", color: "#9A8978" }}>Choisis les ingrédients principaux à ajouter à ta liste de courses.</div>`
            : null}

          ${!isManualMode && nothingMissing
            ? html`<div className="mini" style=${{ marginBottom: "16px", color: "#7A8C6A" }}>✓ Tout est disponible dans votre inventaire. Bonne cuisine !</div>`
            : null}

          ${hasIngredients
            ? html`
                <div className="miniTitle" style=${{ marginBottom: "6px" }}>${isManualMode ? "Ingrédients principaux" : "Ingrédients principaux manquants"}</div>
                <div className="settings-stack" style=${{ gap: "6px", marginBottom: "14px" }}>
                  ${missingModal.items.map((item) => html`
                    <label key=${item.id} className="sitem" style=${{ justifyContent: "space-between", padding: "8px 10px", marginBottom: "0" }}>
                      <div className="help" style=${{ gap: "10px" }}>
                        <input type="checkbox" checked=${missingModal.selectedIds.includes(item.id)} onChange=${() => toggleMissingIngredient(item.id)} />
                        <span>${item.name}</span>
                      </div>
                      ${formatQuantityUnit(item.quantity, item.unit) ? html`<span className="mini">${formatQuantityUnit(item.quantity, item.unit)}</span>` : null}
                    </label>
                  `)}
                </div>
              `
            : null}

          ${hasCondiments
            ? html`
                <div className="miniTitle" style=${{ marginBottom: "4px" }}>Condiments / epices manquants</div>
                <div className="mini" style=${{ marginBottom: "8px", color: "#9A8978" }}>Non deduits automatiquement — cochez ceux que vous voulez ajouter a la liste.</div>
                <div className="settings-stack" style=${{ gap: "6px", marginBottom: "14px" }}>
                  ${condimentItems.map((item) => html`
                    <label key=${item.id} className="sitem" style=${{ padding: "8px 10px", marginBottom: "0" }}>
                      <div className="help" style=${{ gap: "10px" }}>
                        <input type="checkbox" checked=${(missingModal.selectedCondiments || []).includes(item.id)} onChange=${() => toggleMissingCondiment(item.id)} />
                        <span>${item.name}</span>
                      </div>
                    </label>
                  `)}
                </div>
              `
            : null}

          <div className="task-modal-actions">
            <button type="button" className="acn" onClick=${() => setMissingModal(null)}>Fermer</button>
            ${canSubmit
              ? html`<button type="button" className="aok" onClick=${addSelectedMissingIngredients}>Ajouter la sélection à la liste</button>`
              : null}
          </div>
        </div>
      </div>
    `;
  }

  const DAY_ABBR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const selectedMeal = mealRows[selectedDayIdx];

  return html`
    <section className="rwrap">

      ${/* ── Bande de jours ── */null}
      <div className="mrd-meals-day-strip">
        ${DAYS.map((_, idx) => {
          const date = weekDates[idx];
          const isToday = idx === todayIdx;
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
        aria-label="Lier \u00e0 l\u2019inventaire"
      >${linkMealsToInventory ? "\u25cf" : "\u25cb"} Lié à l\u2019inventaire</button>

      ${/* ── Aperçu de la semaine ── */null}
      <div className="mrd-section-head" style=${{ marginBottom: "10px" }}>
        <span className="mrd-section-title">Aperçu de la semaine</span>
      </div>
      ${mealRows.map((meal, idx) => {
        const date = weekDates[idx];
        const lr = meal.lunchRecipeId ? safeRecipes.find((r) => r.id === meal.lunchRecipeId) : null;
        const dr = meal.dinnerRecipeId ? safeRecipes.find((r) => r.id === meal.dinnerRecipeId) : null;
        const label = [lr?.name, dr?.name].filter(Boolean).join(" · ");
        const isToday = idx === todayIdx;
        const isOn = idx === selectedDayIdx;
        return html`
          <button key=${meal.id}
            className=${`mrd-meals-overview-row ${isToday ? "today" : ""} ${isOn ? "selected" : ""}`}
            onClick=${() => setSelectedDayIdx(idx)}>
            <div className="mrd-meals-overview-day">
              <span className="mrd-meals-overview-abbr">${DAY_ABBR[idx]}</span>
              <span className="mrd-meals-overview-date">${date.getDate()}</span>
            </div>
            <span className="mrd-meals-overview-meals">
              ${label || html`<span style=${{ color: "var(--mrd-fg3)", fontStyle: "italic" }}>Rien de prévu</span>`}
            </span>
          </button>
        `;
      })}

      ${renderPicker()}
      ${renderRecipeDetail()}
      ${renderMissingModal()}
    </section>
  `;
}

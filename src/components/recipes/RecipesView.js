import { html, useMemo, useState } from "../../lib.js";
import { findSimilarItem, formatQuantityUnit, suggestItems } from "../../utils/productUtils.js";
import { CONDIMENTS, CONDIMENT_ESSENTIALS } from "../../data/condiments.js";

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

const FOOD_LABELS = [
  { id: "vegetarian", label: "V\u00E9g\u00E9tarien", icon: "\uD83E\uDD55" },
  { id: "vegan", label: "Vegan", icon: "\uD83C\uDF31" },
  { id: "omnivore", label: "Omnivore", icon: "\uD83C\uDF56" },
  { id: "pescetarian", label: "Pesc\u00E9tarien", icon: "\uD83D\uDC1F" },
  { id: "flexitarian", label: "Flexitarien", icon: "\uD83C\uDF3F" },
  { id: "lactose_free", label: "Sans lactose", icon: "\uD83E\uDD5B" },
  { id: "gluten_free", label: "Sans gluten", icon: "\uD83C\uDF3E" },
  { id: "halal", label: "Halal", icon: "\uD83D\uDD4C" },
  { id: "kosher", label: "Casher", icon: "\u2721\uFE0F" },
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
    seasonScope: "full", months: [], labels: [],
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
  return {
    name: String(recipe?.name || "").trim(),
    servings: Math.max(1, Math.min(24, Number(recipe?.servings || 4) || 4)),
    availabilityMode, season, seasons, seasonScope, months,
    labels: Array.isArray(recipe?.labels) ? [...recipe.labels] : [],
    ingredients: Array.isArray(recipe?.ingredients) ? recipe.ingredients.map((item, index) => normalizeRecipeIngredient(item, index)) : [],
    ingredientsLegacy: String(recipe?.ingredientsLegacy || "").trim(),
    condiments: Array.isArray(recipe?.condiments) ? [...recipe.condiments] : [],
    method: String(recipe?.method || "").trim(),
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

function recipeSearchText(recipe) {
  const ingredientNames = Array.isArray(recipe.ingredients) ? recipe.ingredients.map((item) => item.name || "").join(" ") : "";
  return `${recipe.name || ""} ${ingredientNames} ${recipe.ingredientsLegacy || ""}`.toLowerCase();
}

function buildRecipePayload(form) {
  const season = seasonById(form.season);
  const seasons = Array.isArray(form.seasons) && form.seasons.length ? [...new Set(form.seasons)] : (form.season ? [form.season] : []);
  const labels = Array.isArray(form.labels) ? [...new Set(form.labels)] : [];
  const ingredients = Array.isArray(form.ingredients) ? form.ingredients.map(normalizeRecipeIngredient).filter((item) => item.name) : [];
  const condiments = Array.isArray(form.condiments) ? [...form.condiments] : [];
  const servings = Math.max(1, Math.min(24, Number(form.servings) || 4));

  if (form.availabilityMode === "all_year") {
    return { name: form.name, servings, availabilityMode: "all_year", season: "", months: [], labels, ingredients, ingredientsLegacy: "", condiments, method: form.method };
  }
  if (form.availabilityMode === "season") {
    const allowedMonths = [...new Set(seasons.flatMap((seasonId) => seasonById(seasonId).months || []))];
    const months = form.seasonScope === "full" ? allowedMonths : uniqueMonths(form.months).filter((monthId) => allowedMonths.includes(monthId));
    return { name: form.name, servings, availabilityMode: "season", season: seasons[0] || season.id, seasons, months, labels, ingredients, ingredientsLegacy: "", condiments, method: form.method };
  }
  return { name: form.name, servings, availabilityMode: "months", season: "", months: uniqueMonths(form.months), labels, ingredients, ingredientsLegacy: "", condiments, method: form.method };
}

function condimentLabel(condimentId) {
  const found = CONDIMENTS.find((c) => c.id === condimentId);
  return found ? found.label : condimentId;
}

export function RecipesView({
  recipes = [], inventory = [], knownProducts = [],
  customCondiments = [], onAddCustomCondiment, onDeleteCustomCondiment,
  onAddRecipe, onUpdateRecipe, onDeleteRecipe, onLoadDemoRecipes = null,
}) {
  const [search, setSearch] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [activeLabelFilters, setActiveLabelFilters] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState("");
  const [form, setForm] = useState(defaultRecipeForm());
  const [ingredientDraft, setIngredientDraft] = useState(defaultIngredientDraft());
  const [ingredientSuggestions, setIngredientSuggestions] = useState([]);
  const [ingredientWarning, setIngredientWarning] = useState(null);
  const [allowDuplicateIngredient, setAllowDuplicateIngredient] = useState(false);
  const [showCondimentAdd, setShowCondimentAdd] = useState(false);
  const [showSavedCondiments, setShowSavedCondiments] = useState(false);
  const [customCondimentInput, setCustomCondimentInput] = useState("");

  const compactChoiceStyle = { padding: "6px 10px", minHeight: "34px", fontSize: "12px" };
  const compactTagStyle = { fontSize: "11px", padding: "4px 8px" };
  const compactInputStyle = { padding: "8px 10px", fontSize: "13px" };

  const productIndex = useMemo(() => {
    const base = Array.isArray(knownProducts) && knownProducts.length ? knownProducts : inventory;
    const currentIngredients = Array.isArray(form.ingredients)
      ? form.ingredients.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit, source: "recipe-draft" }))
      : [];
    return [...base, ...currentIngredients];
  }, [knownProducts, inventory, form.ingredients]);

  const filteredRecipes = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = (Array.isArray(recipes) ? recipes : []).filter((recipe) => {
      const haystack = recipeSearchText(recipe);
      if (query && !haystack.includes(query)) return false;
      if (!matchesAvailability(recipe, availabilityFilter)) return false;
      const recipeLabels = Array.isArray(recipe.labels) ? recipe.labels : [];
      return activeLabelFilters.every((labelId) => recipeLabels.includes(labelId));
    });
    return base.slice().sort((left, right) => {
      return String(left.name || "").localeCompare(String(right.name || ""), "fr", { sensitivity: "base" });
    });
  }, [recipes, search, availabilityFilter, activeLabelFilters]);

  function setServings(nextValue) {
    setForm((previous) => ({ ...previous, servings: Math.max(1, Math.min(24, Number(nextValue) || 1)) }));
  }

  function closeCreateModal() {
    setShowCreateModal(false);
    setEditingRecipeId("");
    setForm(defaultRecipeForm());
    setIngredientDraft(defaultIngredientDraft());
    setIngredientSuggestions([]);
    setIngredientWarning(null);
    setAllowDuplicateIngredient(false);
    setShowCondimentAdd(false);
    setShowSavedCondiments(false);
    setCustomCondimentInput("");
  }

  function openCreateModal() {
    setEditingRecipeId("");
    setForm(defaultRecipeForm());
    setIngredientDraft(defaultIngredientDraft());
    setIngredientSuggestions([]);
    setIngredientWarning(null);
    setAllowDuplicateIngredient(false);
    setShowCondimentAdd(false);
    setShowSavedCondiments(false);
    setCustomCondimentInput("");
    setShowCreateModal(true);
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
    setShowCreateModal(true);
  }

  function toggleFilterLabel(labelId) {
    setActiveLabelFilters((previous) =>
      previous.includes(labelId) ? previous.filter((value) => value !== labelId) : [...previous, labelId],
    );
  }

  function toggleFormLabel(labelId) {
    setForm((previous) => ({
      ...previous,
      labels: previous.labels.includes(labelId) ? previous.labels.filter((value) => value !== labelId) : [...previous.labels, labelId],
    }));
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
    // Persiste dans l'état global
    onAddCustomCondiment?.(name);
    // Active dans la recette en cours
    setForm((previous) => {
      const current = Array.isArray(previous.condiments) ? previous.condiments : [];
      if (current.includes(name)) return previous;
      return { ...previous, condiments: [...current, name] };
    });
    setCustomCondimentInput("");
    setShowCondimentAdd(false);
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
    event.preventDefault();
    if (!form.name.trim()) return;
    const payload = buildRecipePayload(form);
    if (payload.availabilityMode === "months" && !payload.months.length) return;
    if (payload.availabilityMode === "season" && !payload.months.length) return;
    if (editingRecipeId) { onUpdateRecipe?.(editingRecipeId, payload); } else { onAddRecipe(payload); }
    closeCreateModal();
  }

  function renderFoodBadge(labelId) {
    const label = FOOD_LABELS.find((item) => item.id === labelId);
    if (!label) return null;
    return html`<span key=${label.id} className="ttag" style=${compactTagStyle}>${label.icon} ${label.label}</span>`;
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

  // Condiments perso enregistrés qui ne sont pas des essentiels
  const savedCustomCondiments = (Array.isArray(customCondiments) ? customCondiments : []).filter((name) => !ESSENTIAL_ID_SET.has(name));

  return html`
    <section className="rwrap recipes-page">
      <div className="recipes-page-top">
        <div className="recipes-page-header">
          <span className="st">Recettes</span>
          <span className="mini">Base de recettes du foyer, classée par disponibilité et facile à retrouver.</span>
        </div>
        <div className="recipes-page-top-actions">
          ${onLoadDemoRecipes
            ? html`<button className="clrbtn" style=${{ fontSize: "13px" }} onClick=${onLoadDemoRecipes}>Démo</button>`
            : null}
          <button type="button" className="recipes-page-add-btn" onClick=${openCreateModal} title="Ajouter une recette">+</button>
        </div>
      </div>

      <div className="recipes-page-controls">
        <div className="fstack recipes-page-search-stack">
          <span className="miniTitle">Recherche</span>
          <input className="ainp recipes-page-search-input" placeholder="Rechercher une recette..." value=${search} onInput=${(event) => setSearch(event.target.value)} />
        </div>

        <div className="arow recipes-page-filter-stack" style=${{ gap: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div className="fstack recipes-page-season-block" style=${{ flex: "1 1 180px", minWidth: "160px" }}>
            <span className="miniTitle">Disponibilité</span>
            <select className="asel" value=${availabilityFilter} onChange=${(event) => setAvailabilityFilter(event.target.value)}>
              <option value="all">Toutes saisons</option>
              ${SEASONS.map((season) => html`<option value=${`season:${season.id}`} key=${season.id}>${season.label}</option>`)}
            </select>
          </div>

          <div className="fstack recipes-page-sort-block" style=${{ flex: "0 1 140px", minWidth: "130px" }}>
            <span className="miniTitle">Tri</span>
            <select className="asel" value="az" disabled>
              <option value="az">A a Z</option>
              <option value="za">Z a A</option>
            </select>
          </div>

          <div className="fstack recipes-page-badges-block" style=${{ flex: "2 1 360px", minWidth: "220px" }}>
            <span className="miniTitle">Badges alimentaires</span>
            <div className="recipes-page-label-row">
              ${FOOD_LABELS.map((label) => html`
                <button type="button" key=${label.id} className=${`recipes-filter-chip ${activeLabelFilters.includes(label.id) ? "on" : ""}`} onClick=${() => toggleFilterLabel(label.id)}>
                  <span className="recipes-filter-chip-icon">${label.icon}</span>
                  <span>${label.label}</span>
                </button>
              `)}
            </div>
            <div className="mini">Si plusieurs badges sont cochés, la recette doit correspondre à tous les badges sélectionnés.</div>
          </div>
        </div>
      </div>

      <div className="rlist">
        ${filteredRecipes.length
          ? filteredRecipes.map((recipe) => html`
              <article className="rcard" key=${recipe.id}>
                <div className="rtop">
                  <div>
                    <div className="rname">${recipe.name}</div>
                    <div className="mini">${availabilityLabel(recipe)}</div>
                    ${Array.isArray(recipe.labels) && recipe.labels.length
                      ? html`<div className="task-choice-row" style=${{ marginTop: "8px", gap: "6px" }}>${recipe.labels.map(renderFoodBadge)}</div>`
                      : null}
                    <div className="mini" style=${{ marginTop: "6px" }}>Recette pour ${recipe.servings || 4} ${Number(recipe.servings || 4) > 1 ? "personnes" : "personne"}</div>
                  </div>
                  <div className="settings-inline-actions">
                    <button className="clrbtn" style=${{ fontSize: "12px", padding: "6px 10px" }} onClick=${() => openEditModal(recipe)}>Modifier</button>
                    <button className="delbtn" onClick=${() => onDeleteRecipe(recipe.id)}>X</button>
                  </div>
                </div>

                <div className="miniTitle">Ingredients</div>
                ${Array.isArray(recipe.ingredients) && recipe.ingredients.length
                  ? html`<div className="recipe-ingredient-chip-list">${recipe.ingredients.map(renderIngredientLine)}</div>`
                  : html`<div className="rbody">${recipe.ingredientsLegacy || "Aucun ingrédient renseigné."}</div>`}

                ${Array.isArray(recipe.condiments) && recipe.condiments.length
                  ? html`
                      <div className="condiment-card-row">
                        <span className="condiment-card-label">Condiments :</span>
                        <div className="condiment-badge-list">${recipe.condiments.map(renderCondimentBadge)}</div>
                      </div>
                    `
                  : null}

                <div className="miniTitle" style=${{ marginTop: "10px" }}>Préparation</div>
                <div className="rbody">${recipe.method || "Aucune préparation renseignée."}</div>
              </article>
            `)
          : html`<div className="empty">Aucune recette ne correspond a ce filtre.</div>`}
      </div>

      ${showCreateModal
        ? html`
            <div className="modal-backdrop" onClick=${closeCreateModal}>
              <div className="modal-card task-modal" onClick=${(event) => event.stopPropagation()}>
                <div className="task-modal-head">
                  <div>
                    <div className="miniTitle">Recettes</div>
                    <div className="st">${editingRecipeId ? "Modifier la recette" : "Ajouter une recette"}</div>
                  </div>
                  <button className="delbtn" onClick=${closeCreateModal}>X</button>
                </div>

                <form className="task-create-form" onSubmit=${submitRecipe}>
                  <div className="fstack">
                    <span className="miniTitle">Nom / titre de la recette</span>
                    <input className="ainp" placeholder="Nom de la recette" value=${form.name} onInput=${(event) => setForm({ ...form, name: event.target.value })} />
                  </div>

                  <div className="fstack">
                    <span className="miniTitle">Nombre de personnes</span>
                    <div className="recipe-servings-row">
                      <button type="button" className="recipe-servings-btn" onClick=${() => setServings((Number(form.servings) || 4) - 1)}>-</button>
                      <div className="recipe-servings-value">${form.servings || 4} ${Number(form.servings || 4) > 1 ? "personnes" : "personne"}</div>
                      <button type="button" className="recipe-servings-btn" onClick=${() => setServings((Number(form.servings) || 4) + 1)}>+</button>
                    </div>
                  </div>

                  <div className="fstack">
                    <span className="miniTitle">Disponibilité</span>
                    <div className="task-choice-row">
                      <button type="button" className=${`task-choice ${form.availabilityMode === "all_year" ? "on" : ""}`} onClick=${() => setForm({ ...form, availabilityMode: "all_year" })}>Toute saison</button>
                      <button type="button" className=${`task-choice ${form.availabilityMode === "season" ? "on" : ""}`} onClick=${() => setForm({ ...form, availabilityMode: "season" })}>Saison</button>
                      <button type="button" className=${`task-choice ${form.availabilityMode === "months" ? "on" : ""}`} onClick=${() => setForm({ ...form, availabilityMode: "months" })}>Mois précis</button>
                    </div>
                  </div>

                  ${form.availabilityMode === "season"
                    ? html`
                        <div className="fstack">
                          <span className="miniTitle">Choisir une ou plusieurs saisons</span>
                          <div className="task-choice-row">
                            ${SEASONS.map((season) => html`
                              <button type="button" key=${season.id} className=${`task-choice ${(form.seasons || []).includes(season.id) ? "on" : ""}`}
                                onClick=${() => {
                                  const currentSeasons = Array.isArray(form.seasons) && form.seasons.length ? form.seasons : [form.season || "spring"];
                                  const nextSeasons = currentSeasons.includes(season.id)
                                    ? currentSeasons.filter((seasonId) => seasonId !== season.id)
                                    : [...currentSeasons, season.id];
                                  const safeSeasons = nextSeasons.length ? nextSeasons : [season.id];
                                  const allowedMonths = [...new Set(safeSeasons.flatMap((seasonId) => seasonById(seasonId).months || []))];
                                  setForm({
                                    ...form,
                                    season: safeSeasons[0],
                                    seasons: safeSeasons,
                                    months: form.seasonScope === "custom" ? form.months.filter((monthId) => allowedMonths.includes(monthId)) : [],
                                  });
                                }}>
                                ${season.label}
                              </button>
                            `)}
                          </div>
                        </div>

                        <div className="fstack">
                          <span className="miniTitle">Étendue de la saison</span>
                          <div className="task-choice-row">
                            <button type="button" className=${`task-choice ${form.seasonScope === "full" ? "on" : ""}`} onClick=${() => setForm({ ...form, seasonScope: "full", months: [] })}>Toute la saison</button>
                          <button
                            type="button"
                            className=${`task-choice ${form.seasonScope === "custom" ? "on" : ""}`}
                            onClick=${() => {
                              const allowedMonths = [...new Set((form.seasons || [form.season || "spring"]).flatMap((seasonId) => seasonById(seasonId).months || []))];
                              setForm({ ...form, seasonScope: "custom", months: form.months.filter((monthId) => allowedMonths.includes(monthId)) });
                            }}
                          >
                            Choisir certains mois
                          </button>
                          </div>
                        </div>

                        ${form.seasonScope === "custom"
                          ? html`
                              <div className="fstack">
                                <span className="miniTitle">Mois retenus</span>
                                <div className="task-choice-row">
                                  ${[...new Set((form.seasons || [form.season || "spring"]).flatMap((seasonId) => seasonById(seasonId).months || []))].map((monthId) => html`
                                    <button type="button" key=${monthId} className=${`task-choice ${form.months.includes(monthId) ? "on" : ""}`}
                                      onClick=${() => setForm({ ...form, months: toggleMonthSelection(form.months, monthId, [...new Set((form.seasons || [form.season || "spring"]).flatMap((seasonId) => seasonById(seasonId).months || []))]) })}>
                                      ${MONTHS.find((month) => month.id === monthId)?.label}
                                    </button>
                                  `)}
                                </div>
                              </div>
                            `
                          : null}
                      `
                    : null}

                  ${form.availabilityMode === "months"
                    ? html`
                        <div className="fstack">
                          <span className="miniTitle">Mois précis</span>
                          <div className="task-choice-row">
                            ${MONTHS.map((month) => html`
                              <button type="button" key=${month.id} className=${`task-choice ${form.months.includes(month.id) ? "on" : ""}`}
                                onClick=${() => setForm({ ...form, months: toggleMonthSelection(form.months, month.id) })}>
                                ${month.label}
                              </button>
                            `)}
                          </div>
                        </div>
                      `
                    : null}

                  <div className="fstack">
                    <span className="miniTitle">Badges alimentaires</span>
                    <div className="task-choice-row" style=${{ gap: "6px" }}>
                      ${FOOD_LABELS.map((label) => html`
                        <button type="button" key=${label.id} className=${`task-choice ${form.labels.includes(label.id) ? "on" : ""}`} style=${compactChoiceStyle} onClick=${() => toggleFormLabel(label.id)}>
                          ${label.icon} ${label.label}
                        </button>
                      `)}
                    </div>
                  </div>

                  <div className="fstack">
                    <span className="miniTitle">Ingredients</span>
                    <div style=${{ position: "relative" }}>
                      <input
                        className="ainp"
                        style=${compactInputStyle}
                        placeholder="Nom de l’ingrédient"
                        value=${ingredientDraft.name}
                        onInput=${(event) => handleIngredientNameInput(event.target.value)}
                        onBlur=${() => { setTimeout(() => setIngredientSuggestions([]), 150); }}
                      />
                      ${ingredientSuggestions.length
                        ? html`<div className="suggest-dropdown">${ingredientSuggestions.map(renderSuggestion)}</div>`
                        : null}
                    </div>
                    <div className="quantity-unit-row" style=${{ gap: "6px", alignItems: "stretch" }}>
                      <input className="ainp" style=${{ ...compactInputStyle, flex: "0 0 92px" }} placeholder="Quantité" value=${ingredientDraft.quantity} onInput=${(event) => setIngredientDraft({ ...ingredientDraft, quantity: event.target.value })} />
                      <select className="asel" style=${{ ...compactInputStyle, flex: "0 0 98px" }} value=${ingredientDraft.unit} onChange=${(event) => setIngredientDraft({ ...ingredientDraft, unit: event.target.value })}>
                        ${UNITS.map((unit) => html`<option key=${unit.value} value=${unit.value}>${unit.label}</option>`)}
                      </select>
                      <button type="button" className="aok" style=${{ padding: "8px 12px", minHeight: "36px" }} onClick=${addIngredient}>Ajouter</button>
                    </div>

                    ${ingredientWarning && !allowDuplicateIngredient
                      ? html`
                          <div className="ncard" style=${{ padding: "8px 10px" }}>
                            <div className="mini">Un produit similaire existe déjà : <strong>${ingredientWarning.name}</strong></div>
                            <div className="task-choice-row" style=${{ marginTop: "6px", gap: "6px" }}>
                              <button type="button" className="task-choice on" style=${compactChoiceStyle} onClick=${() => useIngredientSuggestion(ingredientWarning)}>Utiliser le produit existant</button>
                              <button type="button" className="task-choice" style=${compactChoiceStyle} onClick=${() => setAllowDuplicateIngredient(true)}>Créer quand même</button>
                            </div>
                          </div>
                        `
                      : null}

                    ${form.ingredients.length
                      ? html`<div className="recipe-ingredient-chip-list">${form.ingredients.map(renderIngredientChipEditable)}</div>`
                      : html`<div className="mini">Ajoute les ingrédients ligne par ligne.</div>`}
                  </div>

                  <div className="condiment-section-box">
                    <div className="condiment-section-box-title">Condiments / épices</div>
                    <div className="condiment-grid">
                      ${CONDIMENT_ESSENTIALS.map(renderEssentialToggle)}
                    </div>

                    ${savedCustomCondiments.length
                      ? html`
                          <div className="condiment-extra-actions">
                            <button type="button" className="condiment-add-more" onClick=${() => setShowSavedCondiments((value) => !value)}>
                              ${showSavedCondiments ? "Masquer mes condiments" : `+ Voir mes condiments (${savedCustomCondiments.length})`}
                            </button>
                          </div>
                          ${showSavedCondiments
                            ? html`<div className="condiment-grid condiment-grid-extra">${savedCustomCondiments.map(renderCustomSavedToggle)}</div>`
                            : null}
                        `
                      : null}

                    ${showCondimentAdd
                      ? html`
                          <div className="condiment-add-row">
                            <input
                              className="ainp"
                              style=${{ fontSize: "12px", padding: "5px 9px", flex: "1" }}
                              placeholder="Nom du condiment..."
                              value=${customCondimentInput}
                              onInput=${(event) => setCustomCondimentInput(event.target.value)}
                              onKeyDown=${(event) => { if (event.key === "Enter") { event.preventDefault(); submitCustomCondiment(); } }}
                            />
                            <button type="button" className="task-choice on" style=${{ fontSize: "12px", padding: "5px 10px" }} onClick=${submitCustomCondiment}>OK</button>
                            <button type="button" className="task-choice" style=${{ fontSize: "12px", padding: "5px 10px" }} onClick=${() => { setShowCondimentAdd(false); setCustomCondimentInput(""); }}>Annuler</button>
                          </div>
                        `
                      : html`<button type="button" className="condiment-add-more" onClick=${() => setShowCondimentAdd(true)}>+ Ajouter plus</button>`}
                  </div>

                  <div className="fstack">
                    <span className="miniTitle">Préparation</span>
                    <textarea className="nta" placeholder="Étapes de préparation" value=${form.method} onInput=${(event) => setForm({ ...form, method: event.target.value })}></textarea>
                  </div>

                  <div className="task-modal-actions">
                    <button type="button" className="acn" onClick=${closeCreateModal}>Annuler</button>
                    <button type="submit" className="aok">Enregistrer</button>
                  </div>
                </form>
              </div>
            </div>
          `
        : null}
    </section>
  `;
}

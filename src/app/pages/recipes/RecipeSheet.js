import { html, useEffect, useMemo, useState } from "../../lib.js";
import { CONDIMENTS } from "../../config/condiments.js";
import { CategoryIcon, categoryToneClass } from "./CategoryIcons.js";
import { VoiceCookingMode, parseMethodGroups } from "./VoiceCookingMode.js";
import { MrdModal } from "../../components/MrdModal.js";
import { computeMissingIngredients } from "../../utils/recipeStock.js";
import { productMatchKey } from "../../utils/units.js";
import { confirmDialog } from "../../utils/dialogs.js";

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

const CATEGORIES = [
  { id: "starter",   label: "Entrée" },
  { id: "main",      label: "Plat" },
  { id: "dessert",   label: "Dessert" },
  { id: "breakfast", label: "Petit-déj / goûter" },
  { id: "drink",     label: "Boisson" },
  { id: "base",      label: "Base maison" },
];

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
  { id: "kosher",       label: "Casher",       icon: "✡️" },
];

/* Le régime (un seul, en principe) et les exclusions vivent tous les deux
   dans `recipe.labels` (badges mêlés, cf. `recipeFilters.js`). La ligne de
   fait du handoff 18b les distingue par position (régime avant exclusions) —
   ce sous-ensemble sert à les trier sans toucher au stockage. */
const DIET_LABEL_IDS = new Set(["vegetarian", "vegan", "omnivore", "pescetarian", "flexitarian"]);

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
    if (Array.isArray(recipe.seasons) && recipe.seasons.length) return uniqueMonths(recipe.seasons.flatMap((seasonId) => seasonById(seasonId).months || []));
    return [...(seasonById(recipe.season).months || [])];
  }
  return uniqueMonths(recipe.months);
}

/**
 * Faits de la ligne d'en-tête : catégorie, régime, exclusions, saisonnalité —
 * seulement ceux qui sont renseignés (handoff 18b, « Ne garder que les faits
 * renseignés »). Toute l'année n'est pas une restriction : elle ne produit
 * aucun fait, comme un régime ou une exclusion absents.
 */
function recipeFacts(recipe, categoryDef) {
  const labels = Array.isArray(recipe.labels) ? recipe.labels : [];
  const facts = [];
  if (categoryDef) facts.push(categoryDef.label);
  FOOD_LABELS.forEach((entry) => { if (DIET_LABEL_IDS.has(entry.id) && labels.includes(entry.id)) facts.push(entry.label); });
  FOOD_LABELS.forEach((entry) => { if (!DIET_LABEL_IDS.has(entry.id) && labels.includes(entry.id)) facts.push(entry.label); });
  if (recipe.availabilityMode !== "all_year") {
    const months = recipeMonths(recipe).map((monthId) => MONTHS.find((month) => month.id === monthId)?.label.toLowerCase()).filter(Boolean);
    if (months.length) facts.push(`De saison · ${months.join(", ")}`);
  }
  return facts;
}

/** Regroupe les ingrédients par `group` en conservant l'ordre d'apparition. */
export function groupIngredients(ingredients) {
  const groups = [];
  const byName = new Map();
  for (const item of ingredients) {
    const key = String(item.group || "").trim();
    if (!byName.has(key)) {
      const entry = { group: key, items: [] };
      byName.set(key, entry);
      groups.push(entry);
    }
    byName.get(key).items.push(item);
  }
  return groups;
}

/** Quantité numérique mise à l'échelle des portions (virgule française). */
export function fmtScaledQty(quantity, ratio) {
  const q = String(quantity ?? "").trim();
  if (!q) return "";
  const n = Number.parseFloat(q.replace(",", "."));
  if (Number.isNaN(n)) return q;
  const result = n * ratio;
  const rounded = Math.round(result);
  if (Math.abs(result - rounded) < 1e-6) return String(rounded);
  return result.toFixed(1).replace(".", ",");
}

function scaleIngredients(ingredients, ratio) {
  return ingredients.map((item) => ({ ...item, quantity: fmtScaledQty(item.quantity, ratio) }));
}

/** "500 g" pour un ingrédient pesé/mesuré, "×3" pour un simple compte. */
function compactQuantityLabel(quantity, unit) {
  const q = String(quantity ?? "").trim();
  const u = String(unit || "").trim();
  if (!q) return u;
  if (!u || u === "unité") return `×${q}`;
  return `${q} ${u}`;
}

function normalizeForMatch(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Ingrédients que mentionne le texte d'une étape. Rien ne relie les deux
 * dans les données : on rapproche donc le nom (ou son premier segment
 * significatif — « Petits pois frais » n'est repris que par « petits pois »
 * dans le texte) du texte normalisé de l'étape.
 */
function stepIngredients(stepText, ingredients) {
  const normalizedStep = normalizeForMatch(stepText);
  return ingredients.filter((ing) => {
    const words = normalizeForMatch(ing.name).split(/\s+/).filter(Boolean);
    for (let n = words.length; n >= 1; n -= 1) {
      const phrase = words.slice(0, n).join(" ");
      if (phrase.length >= 3 && normalizedStep.includes(phrase)) return true;
    }
    return false;
  });
}

export function condimentLabel(condimentId) {
  const found = CONDIMENTS.find((c) => c.id === condimentId);
  return found ? found.label : condimentId;
}

function clampServings(value) {
  return Math.max(1, Math.min(24, Number(value) || 4));
}

/**
 * Fiche recette — source unique pour l'onglet Recettes (pleine page) et pour
 * l'aperçu 👁 de l'onglet Repas (`variant="modal"`, même fiche dans une modale).
 * Handoff 18b « Rangée pour la cuisine ».
 */
export function RecipeSheet({
  recipe,
  variant = "page",
  inventory = [],
  linkInventory = false,
  onClose = null,
  onEdit = null,
  onPlan = null,
  onDelete = null,
  onAddToShopping = null,
  onToggleFavorite = null,
  initialServings = null,
}) {
  // `initialServings` : la grille semaine ouvre la fiche au nombre de couverts
  // choisi dans son panneau, pas au nombre de personnes de la recette.
  const [servings, setServings] = useState(() => clampServings(initialServings || recipe?.servings));
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [doneSteps, setDoneSteps] = useState(() => new Set());
  const [menuOpen, setMenuOpen] = useState(false);

  // Changement de recette → portions, étapes cochées et menus repartent de zéro.
  useEffect(() => {
    setServings(clampServings(initialServings || recipe?.servings));
    setVoiceOpen(false);
    setDoneSteps(new Set());
    setMenuOpen(false);
  }, [recipe?.id]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    function handlePointerDown(event) {
      if (typeof event.target?.closest === "function" && event.target.closest(".mrd-recipe-menu-wrap")) return;
      setMenuOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  const stepGroups = useMemo(() => parseMethodGroups(recipe?.method), [recipe?.method]);
  const steps = useMemo(() => stepGroups.flatMap((section) => section.steps), [stepGroups]);
  // Étiquette de groupe affichée seulement sur le premier pas de sa section.
  const stepItems = useMemo(() => {
    const items = [];
    let index = 0;
    for (const section of stepGroups) {
      section.steps.forEach((text, i) => {
        items.push({ index, text, groupTitle: i === 0 ? section.group : "" });
        index += 1;
      });
    }
    return items;
  }, [stepGroups]);

  if (!recipe) return null;

  const isModal = variant === "modal";
  const baseServings = Math.max(1, Number(recipe.servings) || 1);
  const ratio = servings / baseServings;
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.filter((item) => item?.name) : [];
  const legacyIng = String(recipe.ingredientsLegacy || "").trim();
  const scaledIngredients = scaleIngredients(ingredients, ratio);
  const categoryDef = recipe.category ? CATEGORIES.find((c) => c.id === recipe.category) : null;
  const facts = recipeFacts(recipe, categoryDef);
  const isFavorite = Boolean(recipe.favorite);

  const prepTimeNum = recipe.prepTime ? Number(recipe.prepTime) : NaN;
  const cookTimeNum = recipe.cookTime ? Number(recipe.cookTime) : NaN;
  const legacyTimeNum = recipe.time != null && recipe.time !== "" ? Number(recipe.time) : NaN;
  const hasPrep = !Number.isNaN(prepTimeNum) && prepTimeNum > 0;
  const hasCook = !Number.isNaN(cookTimeNum) && cookTimeNum > 0;
  const hasLegacy = !Number.isNaN(legacyTimeNum) && legacyTimeNum > 0;
  const totalMinutes = hasPrep || hasCook ? (hasPrep ? prepTimeNum : 0) + (hasCook ? cookTimeNum : 0) : (hasLegacy ? legacyTimeNum : null);
  const hasTimes = hasPrep || hasCook || totalMinutes != null;

  /* Répartition « à acheter / déjà chez toi » : seulement si l'inventaire est
     lié, sinon la comparaison n'a pas de sens (règle produit déjà suivie
     ailleurs — sélecteur de recettes, tirage automatique). Sans liaison, la
     carte retombe sur une liste plate, pour ne pas perdre la possibilité
     d'envoyer les ingrédients aux courses. */
  const missingIngredients = linkInventory
    ? computeMissingIngredients({ ...recipe, ingredients: scaledIngredients }, inventory)
    : [];
  const missingKeys = new Set(missingIngredients.map((item) => productMatchKey(item.name)));
  const haveEnoughIngredients = linkInventory
    ? scaledIngredients.filter((item) => !missingKeys.has(productMatchKey(item.name)))
    : [];

  const currentStepIndex = steps.findIndex((_, index) => !doneSteps.has(index));

  function toggleStep(index) {
    setDoneSteps((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }

  function handleAddMissingToShopping() {
    if (!missingIngredients.length) return;
    onAddToShopping?.(missingIngredients.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit })));
  }

  function handleAddAllToShopping() {
    if (!scaledIngredients.length) return;
    onAddToShopping?.(scaledIngredients.map((item) => ({ name: item.name, quantity: item.quantity, unit: item.unit })));
  }

  async function handleDelete() {
    setMenuOpen(false);
    const ok = await confirmDialog({
      header: "Supprimer la recette",
      message: "Cette action est définitive.",
      confirmText: "Supprimer",
      destructive: true,
    });
    if (!ok) return;
    onDelete?.(recipe);
  }

  const hero = html`
    <div className="mrd-recipe-hero">
      ${recipe.photo
        ? html`<img className="mrd-recipe-hero-photo" src=${recipe.photo} alt="" />`
        : html`
            <span className="mrd-recipe-hero-fallback" aria-hidden="true">
              <${CategoryIcon} categoryId=${recipe.category} size=${96} framed=${false} color="var(--mrd-amber)" />
            </span>
          `}

      ${onClose ? html`
        <div className="mrd-recipe-hero-actions mrd-recipe-hero-actions--left">
          <button type="button" className="mrd-recipe-hero-btn" onClick=${() => onClose?.()} aria-label=${isModal ? "Fermer" : "Retour"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      ` : null}

      <div className="mrd-recipe-hero-actions mrd-recipe-hero-actions--right">
        ${onToggleFavorite ? html`
          <button type="button" className=${`mrd-recipe-hero-btn${isFavorite ? " on" : ""}`}
            onClick=${() => onToggleFavorite?.(recipe)}
            aria-pressed=${isFavorite ? "true" : "false"}
            aria-label=${isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
          >${isFavorite ? "★" : "☆"}</button>
        ` : null}
        ${onEdit || onDelete ? html`
          <span className="mrd-recipe-menu-wrap">
            <button type="button" className="mrd-recipe-hero-btn" onClick=${() => setMenuOpen((v) => !v)} aria-label="Plus d'options">⋯</button>
            ${menuOpen ? html`
              <div className="task-menu-dropdown mrd-recipe-menu-dropdown">
                ${onEdit ? html`<button type="button" className="task-menu-item" onClick=${() => { setMenuOpen(false); onEdit(recipe); }}>Modifier</button>` : null}
                ${onDelete ? html`<button type="button" className="task-menu-item task-menu-item-danger" onClick=${handleDelete}>Supprimer</button>` : null}
              </div>
            ` : null}
          </span>
        ` : null}
      </div>

      <div className="mrd-recipe-hero-titlewrap">
        <h2 className="mrd-recipe-title">${recipe.name}</h2>
        ${facts.length ? html`
          <div className="mrd-recipe-facts">
            ${facts.map((fact, index) => html`
              <span key=${`fact-${index}`}>
                ${index > 0 ? html`<span className="mrd-recipe-facts-dot">·</span>` : null}
                <span>${fact}</span>
              </span>
            `)}
          </div>
        ` : null}
      </div>
    </div>
  `;

  const timesBand = hasTimes ? html`
    <div className="mrd-recipe-times">
      ${hasPrep ? html`
        <span className="mrd-recipe-times-cell">
          <span className="mrd-recipe-times-label">Prépa</span>
          <span className="mrd-recipe-times-value">${prepTimeNum} min</span>
        </span>
      ` : null}
      ${hasPrep && hasCook ? html`<span className="mrd-recipe-times-sep"></span>` : null}
      ${hasCook ? html`
        <span className="mrd-recipe-times-cell">
          <span className="mrd-recipe-times-label">Cuisson</span>
          <span className="mrd-recipe-times-value">${cookTimeNum} min</span>
        </span>
      ` : null}
      ${(hasPrep || hasCook) && totalMinutes != null ? html`<span className="mrd-recipe-times-sep"></span>` : null}
      ${totalMinutes != null ? html`
        <span className="mrd-recipe-times-cell mrd-recipe-times-cell--total">
          <span className="mrd-recipe-times-label">Total</span>
          <span className="mrd-recipe-times-value">${totalMinutes} min</span>
        </span>
      ` : null}
    </div>
  ` : null;

  const servingsBand = html`
    <div className="mrd-recipe-servings">
      <span className="mrd-recipe-servings-copy">
        <span className="mrd-recipe-servings-title">${servings} personne${servings > 1 ? "s" : ""}</span>
        <span className="mrd-recipe-servings-sub">Les quantités suivent</span>
      </span>
      <span className="mrd-recipe-servings-btns">
        <button type="button" className="mrd-recipe-servings-btn" aria-label="Moins" onClick=${() => setServings((s) => Math.max(1, s - 1))}>−</button>
        <button type="button" className="mrd-recipe-servings-btn" aria-label="Plus" onClick=${() => setServings((s) => Math.min(24, s + 1))}>+</button>
      </span>
    </div>
  `;

  const ingredientsCard = html`
    <div className="mrd-recipe-card">
      <span className="mrd-recipe-card-title">Ingrédients</span>

      ${ingredients.length ? (linkInventory ? html`
        ${missingIngredients.length ? html`
          <div key="buy">
            <div className="mrd-recipe-buy-head">
              <span className="mrd-recipe-buy-title">À acheter · ${missingIngredients.length}</span>
              ${onAddToShopping ? html`<button type="button" className="mrd-recipe-buy-addall" onClick=${handleAddMissingToShopping}>Tout ajouter</button>` : null}
            </div>
            <div className="mrd-recipe-buy-list">
              ${missingIngredients.map((item, index) => html`
                <span key=${item.id || `buy-${index}`} className="mrd-recipe-buy-row">
                  <span className="mrd-recipe-buy-row-name">${item.name}</span>
                  <span className="mrd-recipe-buy-row-qty">${compactQuantityLabel(item.quantity, item.unit)}</span>
                </span>
              `)}
            </div>
          </div>
        ` : null}

        ${haveEnoughIngredients.length ? html`
          <div key="have">
            <span className="mrd-recipe-have-title">Déjà chez toi · ${haveEnoughIngredients.length}</span>
            <div className="mrd-recipe-have-list">
              ${haveEnoughIngredients.map((item, index) => html`
                <span key=${item.id || `have-${index}`} className="mrd-recipe-have-pill">${item.name} ${compactQuantityLabel(item.quantity, item.unit)}</span>
              `)}
            </div>
          </div>
        ` : null}
      ` : html`
        <div key="plain-list" className="mrd-recipe-buy-list mrd-recipe-buy-list--plain">
          ${scaledIngredients.map((item, index) => html`
            <span key=${item.id || `ing-${index}`} className="mrd-recipe-buy-row">
              <span className="mrd-recipe-buy-row-name">${item.name}</span>
              <span className="mrd-recipe-buy-row-qty">${compactQuantityLabel(item.quantity, item.unit)}</span>
            </span>
          `)}
        </div>
        ${onAddToShopping ? html`<button key="plain-addall" type="button" className="mrd-recipe-buy-addall mrd-recipe-buy-addall--plain" onClick=${handleAddAllToShopping}>Ajouter les ingrédients à la liste</button>` : null}
      `) : legacyIng
        ? html`<div className="mrd-recipe-legacy-ing">${legacyIng}</div>`
        : html`<div className="mrd-recipe-empty">Aucun ingrédient structuré. Utilise « Modifier » pour en ajouter.</div>`}

      ${Array.isArray(recipe.condiments) && recipe.condiments.length ? html`
        <div className="mrd-recipe-condiments">
          <span className="mrd-recipe-condiments-title">Condiments</span>
          ${recipe.condiments.map((id) => html`<span key=${id} className="mrd-recipe-condiment-pill">${condimentLabel(id)}</span>`)}
        </div>
      ` : null}
    </div>
  `;

  const stepsDoneCount = doneSteps.size;
  const preparationCard = html`
    <div className="mrd-recipe-card">
      <div className="mrd-recipe-steps-head">
        <span className="mrd-recipe-steps-headcopy">
          <span className="mrd-recipe-card-title">Préparation</span>
          ${steps.length ? html`<span className="mrd-recipe-steps-count">${steps.length} étape${steps.length > 1 ? "s" : ""} · ${stepsDoneCount} faite${stepsDoneCount > 1 ? "s" : ""}</span>` : null}
        </span>
        ${steps.length ? html`<button type="button" className="mrd-recipe-voice-btn" onClick=${() => setVoiceOpen(true)}>🎙 Mains libres</button>` : null}
      </div>

      ${steps.length ? html`
        <div className="mrd-recipe-steps">
          ${stepItems.map((item) => {
            const done = doneSteps.has(item.index);
            const isCurrent = !done && item.index === currentStepIndex;
            const bulletState = done ? "done" : isCurrent ? "current" : "upcoming";
            const badges = stepIngredients(item.text, scaledIngredients);
            return html`
              <div key=${`step-wrap-${item.index}`} className="mrd-recipe-step-wrap">
                ${item.groupTitle ? html`<span className="mrd-recipe-step-group-title">${item.groupTitle}</span>` : null}
                <button type="button" className="mrd-recipe-step" onClick=${() => toggleStep(item.index)}>
                  <span className=${`mrd-recipe-step-bullet mrd-recipe-step-bullet--${bulletState}`}>${done ? "✓" : item.index + 1}</span>
                  <span className="mrd-recipe-step-body">
                    <span className=${`mrd-recipe-step-text${done ? " done" : ""}`}>${item.text}</span>
                    ${badges.length ? html`
                      <span className="mrd-recipe-step-badges">
                        ${badges.map((badge, badgeIndex) => html`<span key=${badge.id || `badge-${item.index}-${badgeIndex}`} className="mrd-recipe-step-badge">${badge.name} ${compactQuantityLabel(badge.quantity, badge.unit)}</span>`)}
                      </span>
                    ` : null}
                  </span>
                </button>
              </div>
            `;
          })}
        </div>
      ` : html`<div className="mrd-recipe-empty">Aucune préparation renseignée.</div>`}
    </div>
  `;

  const actionBar = (onEdit || onPlan) ? html`
    <div className="mrd-recipe-actionbar">
      ${onEdit ? html`<button type="button" className="mrd-recipe-actionbar-edit" onClick=${() => onEdit(recipe)}>Modifier</button>` : null}
      ${onPlan ? html`<button type="button" className="mrd-recipe-actionbar-plan" onClick=${() => onPlan(recipe)}>Planifier cette recette</button>` : null}
    </div>
  ` : null;

  const content = html`
    <div className="recipe-sheet">
      <div className="mrd-recipe-scroll">
        ${hero}
        ${timesBand}
        ${servingsBand}
        ${ingredientsCard}
        ${preparationCard}
      </div>
      ${actionBar}
      ${voiceOpen ? html`<${VoiceCookingMode} recipe=${recipe} onClose=${() => setVoiceOpen(false)} />` : null}
    </div>
  `;

  if (isModal) {
    return html`
      <${MrdModal} sheet=${true} isOpen=${true} onClose=${() => onClose?.()} className="mrd-recipe-view-sheet">
        ${content}
      <//>
    `;
  }

  return content;
}

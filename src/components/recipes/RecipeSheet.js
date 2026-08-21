import { html, useEffect, useState } from "../../lib.js";
import { formatQuantityUnit } from "../../utils/productUtils.js";
import { CONDIMENTS } from "../../data/condiments.js";
import { CategoryIcon, categoryToneClass } from "./CategoryIcons.js";
import { VoiceCookingMode, parseMethodSteps } from "./VoiceCookingMode.js";
import drinkFallbackIllustration from "../../assets/recipe-drink-fallback.svg";

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
  { id: "kosher",      label: "Casher",       icon: "✡️" },
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
    if (Array.isArray(recipe.seasons) && recipe.seasons.length) return uniqueMonths(recipe.seasons.flatMap((seasonId) => seasonById(seasonId).months || []));
    return [...(seasonById(recipe.season).months || [])];
  }
  return uniqueMonths(recipe.months);
}

/** Libellé de disponibilité complet (« Printemps + Été - Mars, Avril »). */
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

export function condimentLabel(condimentId) {
  const found = CONDIMENTS.find((c) => c.id === condimentId);
  return found ? found.label : condimentId;
}

function renderCondimentBadge(condimentId) {
  return html`<span key=${condimentId} className="condiment-badge">${condimentLabel(condimentId)}</span>`;
}

function renderHeroVisual(recipe) {
  const isDrink = String(recipe?.category || "").trim() === "drink";
  if (isDrink && !recipe?.photo) {
    return html`<img src=${drinkFallbackIllustration} alt="" className="recipe-drink-fallback-svg recipe-drink-fallback-svg--hero" />`;
  }
  return html`<${CategoryIcon} categoryId=${recipe?.category} size=${108} framed=${false} />`;
}

function clampServings(value) {
  return Math.max(1, Math.min(24, Number(value) || 4));
}

/**
 * Fiche recette — source unique pour l'onglet Recettes (pleine page) et pour
 * l'aperçu 👁 de l'onglet Repas (`variant="modal"`, même fiche dans une modale).
 */
export function RecipeSheet({
  recipe,
  variant = "page",
  onClose = null,
  onEdit = null,
  onPlan = null,
  onAddToShopping = null,
  initialServings = null,
}) {
  // `initialServings` : la grille semaine ouvre la fiche au nombre de couverts
  // choisi dans son panneau, pas au nombre de personnes de la recette.
  const [servings, setServings] = useState(() => clampServings(initialServings || recipe?.servings));
  const [tab, setTab] = useState("ingredients");
  const [voiceOpen, setVoiceOpen] = useState(false);

  // Changement de recette → portions et onglets repartent de zéro
  useEffect(() => {
    setServings(clampServings(initialServings || recipe?.servings));
    setTab("ingredients");
    setVoiceOpen(false);
  }, [recipe?.id]);

  if (!recipe) return null;

  const isModal = variant === "modal";
  const baseServings = Math.max(1, Number(recipe.servings) || 1);
  const ratio = servings / baseServings;
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients.filter((item) => item?.name) : [];
  const legacyIng = String(recipe.ingredientsLegacy || "").trim();
  const firstLabelId = Array.isArray(recipe.labels) && recipe.labels.length ? recipe.labels[0] : null;
  const firstLabelDef = firstLabelId ? FOOD_LABELS.find((entry) => entry.id === firstLabelId) : null;
  const prepTimeNum = recipe.prepTime ? Number(recipe.prepTime) : NaN;
  const cookTimeNum = recipe.cookTime ? Number(recipe.cookTime) : NaN;
  const legacyTimeNum = recipe.time != null && recipe.time !== "" ? Number(recipe.time) : NaN;
  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
  const categoryDef = recipe.category ? CATEGORIES.find((c) => c.id === recipe.category) : null;
  const hasShoppingCta = Boolean(onAddToShopping && ingredients.length);
  const hasHeaderActions = Boolean(onPlan || onEdit);

  function handleAddToShopping() {
    const items = ingredients.map((ing) => ({
      name: ing.name,
      quantity: fmtScaledQty(ing.quantity, ratio),
      unit: String(ing.unit || "").trim(),
    }));
    if (!items.length) return;
    onAddToShopping?.(items);
  }

  const header = html`
    <header
      className=${`mrd-back-hdr ${hasHeaderActions ? "mrd-back-hdr-with-side " : ""}recipe-sheet-header`}
      style=${isModal ? { position: "sticky", top: 0, zIndex: 10 } : null}
    >
      <div className="mrd-back-hdr-main">
        <button type="button" className="mrd-back-btn" onClick=${() => onClose?.()} aria-label=${isModal ? "Fermer" : "Retour à la liste"}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            ${isModal
              ? html`<path d="M6 18L18 6M6 6l12 12" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" />`
              : html`<path d="M15 18l-6-6 6-6" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`}
          </svg>
        </button>
        <span className="mrd-screen-title recipe-sheet-hdr-title">${recipe.name}</span>
      </div>
      ${hasHeaderActions
        ? html`
            <div className="mrd-back-hdr-side recipe-sheet-header-actions">
              ${onPlan ? html`<button type="button" className="mrd-task-mode-btn" onClick=${() => onPlan(recipe)}>Planifier 📅</button>` : null}
              ${onEdit ? html`<button type="button" className="clrbtn" onClick=${() => onEdit(recipe)}>Modifier</button>` : null}
            </div>
          `
        : null}
    </header>
  `;

  const body = html`
    <div className="recipe-sheet-body">
      <div className="mrd-meal-card recipe-sheet-hero">
        ${recipe.photo
          ? html`<div className="recipe-sheet-hero-photo"><img src=${recipe.photo} alt="" /></div>`
          : html`<div className="recipe-sheet-hero-cat-icon" aria-hidden="true">${renderHeroVisual(recipe)}</div>`}
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
          <button type="button" className="recipe-sheet-servings-btn" aria-label="Moins" onClick=${() => setServings((s) => Math.max(1, s - 1))}>−</button>
          <div className="recipe-sheet-servings-center">
            <div className="recipe-sheet-servings-value">${servings}</div>
            <div className="recipe-sheet-servings-label">personnes</div>
          </div>
          <button type="button" className="recipe-sheet-servings-btn" aria-label="Plus" onClick=${() => setServings((s) => Math.min(24, s + 1))}>+</button>
        </div>
      </div>

      <div className="mrd-subtabs recipe-sheet-tabs">
        <button type="button" className=${`mrd-subtab-btn ${tab === "ingredients" ? "on" : ""}`} onClick=${() => setTab("ingredients")}>Ingrédients</button>
        <button type="button" className=${`mrd-subtab-btn ${tab === "method" ? "on" : ""}`} onClick=${() => setTab("method")}>Préparation</button>
      </div>

      ${tab === "ingredients"
        ? html`
            <div className="recipe-sheet-panel recipe-sheet-panel-ingredients">
              ${ingredients.length
                ? groupIngredients(ingredients).map((section, sectionIndex) => html`
                    <div key=${`grp-${sectionIndex}`}>
                      ${section.group ? html`<div className="recipe-sheet-ing-group">${section.group}</div>` : null}
                      ${section.items.map((ing, i) => html`
                        <div key=${ing.id || `ing-${sectionIndex}-${i}`} className="recipe-sheet-ing-row">
                          <span className="recipe-sheet-ing-name">${ing.name}</span>
                          <span className="recipe-sheet-ing-qty">${formatQuantityUnit(fmtScaledQty(ing.quantity, ratio), ing.unit)}</span>
                        </div>
                      `)}
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
              ${parseMethodSteps(recipe.method).length
                ? html`
                    <button type="button" className="voice-cook-launch" onClick=${() => setVoiceOpen(true)}>
                      🎙 Mode cuisine mains libres
                    </button>
                  `
                : null}
              <div className="recipe-sheet-method-text">${recipe.method || "Aucune préparation renseignée."}</div>
            </div>
          `}

      ${voiceOpen ? html`<${VoiceCookingMode} recipe=${recipe} onClose=${() => setVoiceOpen(false)} />` : null}

      ${hasShoppingCta
        ? html`
            <footer className="recipe-sheet-footer">
              <button type="button" className="recipe-sheet-cta-shopping" onClick=${handleAddToShopping}>
                🛒 Ajouter les ingrédients aux courses
              </button>
            </footer>
          `
        : null}
    </div>
  `;

  if (isModal) {
    return html`
      <div className="modal-backdrop mrd-recipe-view-backdrop" onClick=${() => onClose?.()}>
        <div className="recipe-sheet mrd-recipe-view-sheet" onClick=${(e) => e.stopPropagation()}>
          ${header}
          ${body}
        </div>
      </div>
    `;
  }

  return html`
    <div className="recipe-sheet">
      ${header}
      ${body}
    </div>
  `;
}

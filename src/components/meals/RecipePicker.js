/**
 * Sélecteur de recettes d'un créneau (écran 5a du handoff « refonte Repas »).
 *
 * Plein écran, jamais modal : il remplace la grille semaine le temps du choix.
 * Le créneau visé reste écrit en haut, et rien ne part tant que le bouton du
 * bas n'est pas tapé.
 *
 * Les catégories tiennent sur une seule rangée d'icônes ; tout le reste
 * (rapide / stock / saison, régime, contraintes) vit sous « Affiner », avec un
 * rappel en pastilles retirables une fois le panneau refermé.
 */
import { html, useMemo, useState } from "../../lib.js";
import { computePriorityRecipes, computeRecipeStock, expiryShortLabel } from "../../utils/recipeStock.js";
import {
  SEASONS,
  durationLabel,
  isQuickRecipe,
  matchesConstraints,
  matchesDiet,
  matchesPeriod,
  periodLabel,
  periodPhrase,
  recipeSearchText,
  recipeTotalMinutes,
} from "../../utils/recipeFilters.js";
import { CategoryIcon, categoryToneClass } from "../recipes/CategoryIcons.js";
import { IonSearchbar, IonToggle } from "@ionic/react";

/* Mêmes listes que l'onglet Recettes — les libellés doivent rester identiques. */
const CATEGORIES = [
  { id: "starter",   label: "Entrée" },
  { id: "main",      label: "Plat" },
  { id: "dessert",   label: "Dessert" },
  { id: "breakfast", label: "Petit-déj" },
  { id: "drink",     label: "Boisson" },
  { id: "base",      label: "Base" },
];

const FOOD_TYPES = [
  { id: "omnivore",    label: "Omnivore" },
  { id: "vegetarian",  label: "Végétarien" },
  { id: "vegan",       label: "Végan" },
  { id: "pescetarian", label: "Pescétarien" },
];

const CONSTRAINT_LABELS = [
  { id: "gluten_free",  label: "Sans gluten" },
  { id: "lactose_free", label: "Sans lactose" },
  { id: "egg_free",     label: "Sans œufs" },
  { id: "nut_free",     label: "Sans fruits à coque" },
  { id: "pork_free",    label: "Sans porc" },
  { id: "halal",        label: "Halal" },
  { id: "kosher",       label: "Casher" },
];

const SORTS = [
  { id: "season", label: "De saison" },
  { id: "time",   label: "Temps" },
  { id: "stock",  label: "Stock" },
  { id: "az",     label: "A → Z" },
];

const ROLE_LABELS = { starter: "Entrée", main: "Plat", dessert: "Dessert" };

/* Périodes du filtre « de saison ». Le mois courant reste le défaut ; les
   saisons et les mois se choisissent à la main juste en dessous. */
const PERIOD_SCOPES = [
  { id: "current", label: "Ce mois-ci" },
  ...SEASONS.map((s) => ({ id: `season:${s.id}`, label: s.label })),
];
const MONTH_ABBR = ["Janv", "Févr", "Mars", "Avr", "Mai", "Juin", "Juil", "Août", "Sept", "Oct", "Nov", "Déc"];
const PERIOD_MONTHS = MONTH_ABBR.map((label, index) => ({ id: `month:${index + 1}`, label }));

function categoryLabel(categoryId) {
  return CATEGORIES.find((cat) => cat.id === categoryId)?.label || "";
}

export function RecipePicker({
  recipes = [],
  inventory = [],
  linkInventory = false,
  currentMonth = 1,
  slotLabel = "",
  role = "main",
  currentRecipeId = "",
  onRemove,
  onCancel,
  onSelect,
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(role === "starter" || role === "dessert" ? role : "");
  const [diet, setDiet] = useState("");
  const [constraints, setConstraints] = useState([]);
  const [quick, setQuick] = useState(false);
  const [stockOnly, setStockOnly] = useState(false);
  const [season, setSeason] = useState(false);
  const [period, setPeriod] = useState("current"); // "current" | "season:<id>" | "month:<n>"
  const [sort, setSort] = useState("season");
  const [panelOpen, setPanelOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");

  // Sans liaison inventaire, aucune comparaison au stock n'a lieu : ni badge,
  // ni filtre, ni tri (règle produit).
  const stockByRecipeId = useMemo(() => {
    const map = new Map();
    if (!linkInventory) return map;
    recipes.forEach((recipe) => map.set(recipe.id, computeRecipeStock(recipe, inventory)));
    return map;
  }, [recipes, inventory, linkInventory]);

  const visibleRecipes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = recipes.filter((recipe) => {
      if (category && recipe.category !== category) return false;
      if (!matchesDiet(recipe, diet)) return false;
      if (!matchesConstraints(recipe, constraints)) return false;
      if (quick && !isQuickRecipe(recipe)) return false;
      if (season && !matchesPeriod(recipe, period, currentMonth)) return false;
      if (stockOnly && !stockByRecipeId.get(recipe.id)?.ready) return false;
      if (needle && !recipeSearchText(recipe, categoryLabel(recipe.category)).includes(needle)) return false;
      return true;
    });

    const byName = (left, right) => String(left.name || "").localeCompare(String(right.name || ""), "fr", { sensitivity: "base" });
    const missingOf = (recipe) => {
      const stock = stockByRecipeId.get(recipe.id);
      return stock?.known ? stock.missingCount : Number.MAX_SAFE_INTEGER;
    };
    const durationOf = (recipe) => recipeTotalMinutes(recipe) || Number.MAX_SAFE_INTEGER;

    return filtered.sort((left, right) => {
      if (sort === "time") {
        const diff = durationOf(left) - durationOf(right);
        return diff || byName(left, right);
      }
      if (sort === "stock") {
        const diff = missingOf(left) - missingOf(right);
        return diff || byName(left, right);
      }
      if (sort === "az") return byName(left, right);
      // De saison : les recettes de la période visée d'abord, puis les plus rapides.
      const leftSeason = matchesPeriod(left, period, currentMonth) ? 0 : 1;
      const rightSeason = matchesPeriod(right, period, currentMonth) ? 0 : 1;
      if (leftSeason !== rightSeason) return leftSeason - rightSeason;
      const diff = durationOf(left) - durationOf(right);
      return diff || byName(left, right);
    });
  }, [recipes, category, diet, constraints, quick, season, period, stockOnly, query, sort, currentMonth, stockByRecipeId]);

  // Anti-gaspi (règle produit) : les recettes qui consomment ce qui périme
  // bientôt, calculées sur la liste déjà filtrée pour rester cohérentes avec ce
  // qui est affiché. Une seule rangée, elle ne coûte pas de hauteur de liste.
  const urgentRecipes = useMemo(() => (
    linkInventory ? computePriorityRecipes({ recipes: visibleRecipes, inventory, limit: 3 }) : []
  ), [linkInventory, visibleRecipes, inventory]);

  /* Les filtres du panneau — ceux que « Affiner » compte et que les pastilles rappellent. */
  const activeFilters = [
    quick ? { id: "quick", label: "⚡ Rapide", clear: () => setQuick(false) } : null,
    stockOnly ? { id: "stock", label: "🥫 Déjà en stock", clear: () => setStockOnly(false) } : null,
    season ? { id: "season", label: `🍂 ${periodLabel(period, currentMonth)}`, clear: () => setSeason(false) } : null,
    diet ? { id: `diet-${diet}`, label: FOOD_TYPES.find((t) => t.id === diet)?.label || diet, clear: () => setDiet("") } : null,
    ...constraints.map((id) => ({
      id: `constraint-${id}`,
      label: CONSTRAINT_LABELS.find((c) => c.id === id)?.label || id,
      clear: () => setConstraints((prev) => prev.filter((value) => value !== id)),
    })),
  ].filter(Boolean);

  function clearAll() {
    setDiet("");
    setConstraints([]);
    setQuick(false);
    setStockOnly(false);
    setSeason(false);
    setPeriod("current");
  }

  function toggleConstraint(id) {
    setConstraints((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  const selectedRecipe = selectedId ? visibleRecipes.find((recipe) => recipe.id === selectedId) : null;
  const countLabel = `${visibleRecipes.length} recette${visibleRecipes.length !== 1 ? "s" : ""}`;
  const roleSuffix = role && role !== "main" ? ` · ${ROLE_LABELS[role]}` : "";

  const switches = [
    { id: "quick", label: "⚡ Rapide", sub: "20 min ou moins", on: quick, toggle: () => setQuick((v) => !v) },
    ...(linkInventory
      ? [{ id: "stock", label: "🥫 Déjà en stock", sub: "Aucun ingrédient manquant", on: stockOnly, toggle: () => setStockOnly((v) => !v) }]
      : []),
    { id: "season", label: "🍂 De saison", sub: `Disponible ${periodPhrase(period, currentMonth)}`, on: season, toggle: () => setSeason((v) => !v) },
  ];

  function renderRailItem({ id, label, all = false }) {
    const on = category === id;
    return html`
      <button
        type="button"
        key=${id || "all"}
        className=${`mpick-rail-item${on ? " on" : ""}`}
        aria-pressed=${on ? "true" : "false"}
        onClick=${() => setCategory(on ? "" : id)}
      >
        <span className=${`mpick-rail-dot ${categoryToneClass(id)}`}>
          ${all
            ? html`<span className="mpick-rail-all" aria-hidden="true">•••</span>`
            : html`<${CategoryIcon} categoryId=${id} size=${22} framed=${false} color=${on ? "var(--mrd-white)" : ""} />`}
        </span>
        <span className="mpick-rail-label">${label}</span>
      </button>
    `;
  }

  function renderRow(recipe) {
    const on = selectedId === recipe.id;
    const stock = stockByRecipeId.get(recipe.id);
    // Une recette marquée rapide sans durée saisie n'a rien à afficher : le
    // libellé « Rapide » vaut mieux qu'une sous-ligne réduite à la catégorie.
    const duration = durationLabel(recipe) || (recipe.quick ? "⚡ Rapide" : null);
    const meta = [duration, categoryLabel(recipe.category)].filter(Boolean).join(" · ");
    return html`
      <button
        type="button"
        key=${recipe.id}
        className=${`mpick-row${on ? " on" : ""}`}
        aria-pressed=${on ? "true" : "false"}
        onClick=${() => setSelectedId(on ? "" : recipe.id)}
      >
        <span className=${`mpick-row-thumb ${categoryToneClass(recipe.category)}`}>
          <${CategoryIcon} categoryId=${recipe.category} size=${29} framed=${false} />
        </span>
        <span className="mpick-row-main">
          <span className="mpick-row-name">${recipe.name || "Sans titre"}</span>
          <span className="mpick-row-sub">
            ${meta ? html`<span className="mpick-row-meta">${meta}</span>` : null}
            ${stock?.known
              ? html`<span className=${`mpick-row-stock${stock.ready ? " ok" : " missing"}`}>
                  ${stock.ready ? "en stock" : `${stock.missingCount} manquant${stock.missingCount > 1 ? "s" : ""}`}
                </span>`
              : null}
          </span>
        </span>
        <span className="mpick-row-check" aria-hidden="true">${on ? "✓" : ""}</span>
      </button>
    `;
  }

  return html`
    <section className="mpick">

      <div className="mpick-hdr">
        <button type="button" className="mpick-back" onClick=${onCancel} aria-label="Revenir à la semaine">‹</button>
        <span className="mpick-title">${slotLabel}${roleSuffix}</span>
      </div>

      <div className="mpick-searchrow">
        ${/* Le `<span class="mpick-search">` et son SVG de loupe ont disparu :
             ils faisaient doublon avec la pilule et l icone d `ion-searchbar`.
             La classe du conteneur passe sur la barre elle-meme. */null}
        <${IonSearchbar}
          className="mpick-search"
          value=${query}
          placeholder="Chercher…"
          onIonInput=${(event) => setQuery(event.detail.value ?? "")}
          debounce=${0}
          enterkeyhint="search"
          autocomplete="off"
          aria-label="Chercher une recette"
        />
        <button
          type="button"
          className=${`mpick-refine${activeFilters.length ? " on" : ""}`}
          aria-expanded=${panelOpen ? "true" : "false"}
          onClick=${() => setPanelOpen((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          ${activeFilters.length ? `Affiner · ${activeFilters.length}` : "Affiner"}
        </button>
      </div>

      <div className="mpick-rail">
        ${renderRailItem({ id: "", label: "Tout", all: true })}
        ${CATEGORIES.map((cat) => renderRailItem(cat))}
      </div>

      ${panelOpen ? html`
        <div className="mpick-panel">
          ${switches.map((item) => html`
            <div key=${item.id} className="mpick-switch-block">
              <button type="button" className="mpick-switch" aria-pressed=${item.on ? "true" : "false"} onClick=${item.toggle}>
                <span className="mpick-switch-text">
                  <span className="mpick-switch-label">${item.label}</span>
                  <span className="mpick-switch-sub">${item.sub}</span>
                </span>
                <${IonToggle}
                  className="mpick-switch-track"
                  checked=${Boolean(item.on)}
                  onClick=${(event) => event.stopPropagation()}
                  onIonChange=${item.toggle}
                  aria-label=${item.label}
                />
              </button>
              ${item.id === "season" && season ? html`
                <div className="mpick-period">
                  <div className="mpick-chips">
                    ${PERIOD_SCOPES.map((scope) => html`
                      <button type="button" key=${scope.id}
                        className=${`mpick-chip mpick-chip--sm${period === scope.id ? " on" : ""}`}
                        onClick=${() => setPeriod(scope.id)}>
                        ${scope.label}
                      </button>
                    `)}
                  </div>
                  <div className="mpick-months">
                    ${PERIOD_MONTHS.map((month) => html`
                      <button type="button" key=${month.id}
                        className=${`mpick-chip mpick-chip--sm${period === month.id ? " on" : ""}`}
                        onClick=${() => setPeriod(month.id)}>
                        ${month.label}
                      </button>
                    `)}
                  </div>
                </div>
              ` : null}
            </div>
          `)}

          <span className="mpick-panel-sep"></span>

          <div className="mpick-group">
            <span className="mpick-group-label">Type alimentaire</span>
            <div className="mpick-chips">
              ${FOOD_TYPES.map((type) => html`
                <button type="button" key=${type.id}
                  className=${`mpick-chip${diet === type.id ? " on" : ""}`}
                  onClick=${() => setDiet((prev) => (prev === type.id ? "" : type.id))}>
                  ${type.label}
                </button>
              `)}
            </div>
          </div>

          <div className="mpick-group">
            <span className="mpick-group-label">Contraintes</span>
            <div className="mpick-chips">
              ${CONSTRAINT_LABELS.map((item) => html`
                <button type="button" key=${item.id}
                  className=${`mpick-chip${constraints.includes(item.id) ? " on" : ""}`}
                  onClick=${() => toggleConstraint(item.id)}>
                  ${item.label}
                </button>
              `)}
            </div>
          </div>

          <div className="mpick-panel-foot">
            <button type="button" className="mpick-panel-clear" onClick=${clearAll}>Tout effacer</button>
            <button type="button" className="mpick-panel-see" onClick=${() => setPanelOpen(false)}>Voir ${countLabel}</button>
          </div>
        </div>
      ` : null}

      ${!panelOpen && activeFilters.length ? html`
        <div className="mpick-active">
          ${activeFilters.map((filter) => html`
            <button type="button" key=${filter.id} className="mpick-active-chip" onClick=${filter.clear}>
              ${filter.label}<span className="mpick-active-x" aria-hidden="true">✕</span>
            </button>
          `)}
        </div>
      ` : null}

      ${urgentRecipes.length ? html`
        <div className="mpick-urgent">
          <span className="mpick-urgent-label" aria-hidden="true">⏳</span>
          ${urgentRecipes.map(({ recipe, expiringItems }) => html`
            <button type="button" key=${recipe.id} className="mpick-urgent-chip" onClick=${() => setSelectedId(recipe.id)}>
              ${recipe.name || "Sans titre"}
              <span className="mpick-urgent-item">${expiringItems[0].name} · ${expiryShortLabel(expiringItems[0].days)}</span>
            </button>
          `)}
        </div>
      ` : null}

      <div className="mpick-countrow">
        <span className="mpick-count">${countLabel}</span>
        <span className="mpick-sorts">
          ${SORTS.map((item) => html`
            <button type="button" key=${item.id}
              className=${`mpick-sort${sort === item.id ? " on" : ""}`}
              onClick=${() => setSort(item.id)}>
              ${item.label}
            </button>
          `)}
        </span>
      </div>

      <div className="mpick-list">
        ${visibleRecipes.length
          ? visibleRecipes.map(renderRow)
          : html`
            <div className="mpick-empty">
              <span className="mpick-empty-title">Aucune recette</span>
              <span className="mpick-empty-sub">Tes filtres sont trop serrés.</span>
              <button type="button" className="mpick-empty-clear" onClick=${() => { clearAll(); setCategory(""); setQuery(""); }}>Tout effacer</button>
            </div>
          `}
      </div>

      <div className="mpick-foot">
        ${currentRecipeId ? html`
          <button type="button" className="mpick-remove" onClick=${() => onRemove?.()}>
            Retirer ${ROLE_LABELS[role] ? ROLE_LABELS[role].toLowerCase() : "la recette"} du créneau
          </button>
        ` : null}
        <button
          type="button"
          className=${`mpick-cta${selectedRecipe ? " on" : ""}`}
          disabled=${!selectedRecipe}
          onClick=${() => selectedRecipe && onSelect?.(selectedRecipe.id)}
        >
          ${selectedRecipe ? `Choisir « ${selectedRecipe.name || "Sans titre"} »` : "Choisis une recette"}
        </button>
      </div>

    </section>
  `;
}

/**
 * Bibliothèque de recettes — vue liste de l'onglet Recettes (handoff « page
 * Recettes », option 6a).
 *
 * Même grammaire que le sélecteur de recettes des repas : une rangée de
 * catégories en icônes, un seul bouton « Affiner » qui range tous les autres
 * filtres, et un rappel des filtres actifs en pastilles retirables. Les deux
 * écrans partagent volontairement leurs règles CSS (`mpick-*` / `rlib-*`) :
 * chercher une recette doit se faire au même endroit, du même geste, qu'on
 * remplisse la semaine ou qu'on parcoure sa bibliothèque.
 *
 * Ce que la liste montre en plus du sélecteur : durée détaillée, régime,
 * contraintes, état du stock, mois de disponibilité et deux actions par carte.
 */
import { html, useMemo, useState } from "../../lib.js";
import { computeRecipeStock } from "../../utils/recipeStock.js";
import {
  SEASONS,
  isQuickRecipe,
  matchesConstraints,
  matchesDiet,
  recipeMonths,
  recipeSearchText,
  recipeTotalMinutes,
} from "../../utils/recipeFilters.js";
import { CategoryIcon, categoryToneClass } from "./CategoryIcons.js";

/* Mêmes libellés que le sélecteur des repas — ils doivent rester identiques. */
const CATEGORIES = [
  { id: "starter",   label: "Entrée" },
  { id: "main",      label: "Plat" },
  { id: "dessert",   label: "Dessert" },
  { id: "breakfast", label: "Petit-déj" },
  { id: "drink",     label: "Boisson" },
  { id: "base",      label: "Base maison" },
];

const FOOD_TYPES = [
  { id: "omnivore",    label: "Omnivore",     icon: "🍖" },
  { id: "vegetarian",  label: "Végé",         icon: "🥕" },
  { id: "vegan",       label: "Végan",        icon: "🌱" },
  { id: "pescetarian", label: "Pescé",        icon: "🐟" },
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

const SEASON_ICONS = { spring: "🌱", summer: "☀️", autumn: "🍂", winter: "❄️" };

/* Initiales des mois pour la grille 12 colonnes du panneau. */
const MONTH_INITIALS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

/* Abrégés pour la ligne de disponibilité des cartes. */
const MONTH_SHORT = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
];

const SORTS = [
  { id: "az",     label: "A → Z" },
  { id: "time",   label: "Temps" },
  { id: "season", label: "De saison" },
  { id: "stock",  label: "Stock" },
];

/** Recherche insensible à la casse ET aux accents (« crepe » trouve « crêpe »). */
function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function categoryLabel(categoryId) {
  return CATEGORIES.find((cat) => cat.id === categoryId)?.label || "";
}

function seasonById(seasonId) {
  return SEASONS.find((season) => season.id === seasonId) || SEASONS[0];
}

/**
 * « 20 + 15 min · 35 min au total ». Sans cuisson le total répète la prépa :
 * on n'écrit alors que « 20 min de prépa ». Null quand la durée est inconnue.
 */
function durationSentence(recipe) {
  const prep = Number(recipe?.prepTime) || 0;
  const cook = Number(recipe?.cookTime) || 0;
  const total = recipeTotalMinutes(recipe);
  if (!total) return null;
  if (!cook) return prep ? `${prep} min de prépa` : `${total} min au total`;
  if (!prep) return `${cook} min de cuisson · ${total} min au total`;
  return `${prep} + ${cook} min · ${total} min au total`;
}

export function RecipeLibrary({
  recipes = [],
  inventory = [],
  linkInventory = false,
  currentMonth = new Date().getMonth() + 1,
  onOpenRecipe,
  onCreateRecipe,
  onLoadDemoRecipes = null,
  onPlanRecipe = null,
  onToggleFavorite = null,
  onBack = null,
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [onlyQuick, setOnlyQuick] = useState(false);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [seasons, setSeasons] = useState([]);
  const [months, setMonths] = useState([]);
  const [diet, setDiet] = useState("");
  const [constraints, setConstraints] = useState([]);
  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [sort, setSort] = useState("az");

  const safeRecipes = Array.isArray(recipes) ? recipes : [];

  // Sans liaison inventaire, aucune comparaison au stock n'a lieu : ni ligne
  // sur la carte, ni filtre, ni tri (même règle produit que le sélecteur).
  const stockByRecipeId = useMemo(() => {
    const map = new Map();
    if (!linkInventory) return map;
    safeRecipes.forEach((recipe) => map.set(recipe.id, computeRecipeStock(recipe, inventory)));
    return map;
  }, [safeRecipes, inventory, linkInventory]);

  /* Mois réellement visés : ceux cochés un par un, plus ceux des saisons cochées. */
  const wantedMonths = useMemo(() => {
    const wanted = new Set(months);
    seasons.forEach((seasonId) => seasonById(seasonId).months.forEach((month) => wanted.add(month)));
    return wanted;
  }, [months, seasons]);

  const visibleRecipes = useMemo(() => {
    const needle = normalize(query.trim());
    const filtered = safeRecipes.filter((recipe) => {
      if (category && recipe.category !== category) return false;
      if (onlyFavorites && !recipe.favorite) return false;
      if (onlyQuick && !isQuickRecipe(recipe)) return false;
      if (onlyInStock && !stockByRecipeId.get(recipe.id)?.ready) return false;
      // Rien de coché = aucun filtre de période. Sinon on garde « toute
      // l'année » et les recettes qui couvrent au moins un mois voulu.
      if (wantedMonths.size) {
        if (recipe.availabilityMode !== "all_year"
          && !recipeMonths(recipe).some((month) => wantedMonths.has(month))) return false;
      }
      if (!matchesDiet(recipe, diet)) return false;
      if (!matchesConstraints(recipe, constraints)) return false;
      if (needle && !normalize(recipeSearchText(recipe, categoryLabel(recipe.category))).includes(needle)) return false;
      return true;
    });

    const byName = (left, right) => String(left.name || "").localeCompare(String(right.name || ""), "fr", { sensitivity: "base" });
    const missingOf = (recipe) => {
      const stock = stockByRecipeId.get(recipe.id);
      return stock?.known ? stock.missingCount : Number.MAX_SAFE_INTEGER;
    };
    const durationOf = (recipe) => recipeTotalMinutes(recipe) || Number.MAX_SAFE_INTEGER;

    return filtered.sort((left, right) => {
      if (sort === "time") return (durationOf(left) - durationOf(right)) || byName(left, right);
      if (sort === "stock") return (missingOf(left) - missingOf(right)) || byName(left, right);
      if (sort === "season") {
        const leftSeason = recipeMonths(left).includes(currentMonth) ? 0 : 1;
        const rightSeason = recipeMonths(right).includes(currentMonth) ? 0 : 1;
        if (leftSeason !== rightSeason) return leftSeason - rightSeason;
        return (durationOf(left) - durationOf(right)) || byName(left, right);
      }
      return byName(left, right);
    });
  }, [
    safeRecipes, category, onlyFavorites, onlyQuick, onlyInStock, wantedMonths,
    diet, constraints, query, sort, currentMonth, stockByRecipeId,
  ]);

  /* ── Filtres du panneau : ce que « Affiner » compte et que les pastilles rappellent ── */
  const seasonMonths = useMemo(() => {
    const covered = new Set();
    seasons.forEach((seasonId) => seasonById(seasonId).months.forEach((month) => covered.add(month)));
    return covered;
  }, [seasons]);

  const activeFilters = [
    onlyFavorites ? { id: "fav", label: "★ Favoris", clear: () => setOnlyFavorites(false) } : null,
    onlyQuick ? { id: "quick", label: "⚡ Rapide", clear: () => setOnlyQuick(false) } : null,
    onlyInStock ? { id: "stock", label: "🥫 En stock", clear: () => setOnlyInStock(false) } : null,
    ...seasons.map((seasonId) => {
      const def = seasonById(seasonId);
      return {
        id: `season-${seasonId}`,
        label: `${SEASON_ICONS[seasonId] || ""} ${def.label}`.trim(),
        clear: () => {
          setSeasons((prev) => prev.filter((value) => value !== seasonId));
          setMonths((prev) => prev.filter((month) => !def.months.includes(month)));
        },
      };
    }),
    // Un mois déjà porté par une saison cochée n'a pas sa propre pastille.
    ...months.filter((month) => !seasonMonths.has(month)).map((month) => ({
      id: `month-${month}`,
      label: MONTH_SHORT[month - 1],
      clear: () => setMonths((prev) => prev.filter((value) => value !== month)),
    })),
    diet ? {
      id: `diet-${diet}`,
      label: FOOD_TYPES.find((type) => type.id === diet)?.label || diet,
      clear: () => setDiet(""),
    } : null,
    ...constraints.map((id) => ({
      id: `constraint-${id}`,
      label: CONSTRAINT_LABELS.find((item) => item.id === id)?.label || id,
      clear: () => setConstraints((prev) => prev.filter((value) => value !== id)),
    })),
  ].filter(Boolean);

  /* « Tout effacer » remet la recherche et le panneau à zéro, sans toucher
     à la catégorie ni au tri (règle du handoff). */
  function clearAll() {
    setQuery("");
    setOnlyFavorites(false);
    setOnlyQuick(false);
    setOnlyInStock(false);
    setSeasons([]);
    setMonths([]);
    setDiet("");
    setConstraints([]);
  }

  /* Cocher une saison coche ses trois mois ; la décocher les décoche. */
  function toggleSeason(seasonId) {
    const def = seasonById(seasonId);
    if (seasons.includes(seasonId)) {
      setSeasons((prev) => prev.filter((value) => value !== seasonId));
      setMonths((prev) => prev.filter((month) => !def.months.includes(month)));
      return;
    }
    setSeasons((prev) => [...prev, seasonId]);
    setMonths((prev) => [...new Set([...prev, ...def.months])]);
  }

  /* Décocher un mois décoche la saison qui le contenait — les autres mois
     de cette saison, eux, restent cochés. */
  function toggleMonth(month) {
    const next = months.includes(month) || seasonMonths.has(month)
      ? [...wantedMonths].filter((value) => value !== month)
      : [...wantedMonths, month];
    setMonths(next);
    setSeasons((prev) => prev.filter((seasonId) => seasonById(seasonId).months.every((value) => next.includes(value))));
  }

  function toggleConstraint(id) {
    setConstraints((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  const countLabel = `${visibleRecipes.length} recette${visibleRecipes.length !== 1 ? "s" : ""}`;
  const favoriteCount = safeRecipes.filter((recipe) => recipe.favorite).length;
  const subtitle = `${safeRecipes.length} recette${safeRecipes.length !== 1 ? "s" : ""} · ${favoriteCount} favorite${favoriteCount !== 1 ? "s" : ""}`;

  const availabilitySummary = !wantedMonths.size
    ? "toute l'année"
    : (seasons.length && wantedMonths.size === seasons.length * 3
      ? seasons.map((seasonId) => seasonById(seasonId).label).join(" + ")
      : `${wantedMonths.size} mois`);

  const constraintsSummary = !constraints.length
    ? "Aucune contrainte"
    : (constraints.length === 1
      ? (CONSTRAINT_LABELS.find((item) => item.id === constraints[0])?.label || constraints[0])
      : `${constraints.length} contraintes`);

  const switches = [
    { id: "fav", label: "★ Favoris", sub: "Uniquement mes recettes étoilées", on: onlyFavorites, toggle: () => setOnlyFavorites((v) => !v) },
    { id: "quick", label: "⚡ Rapide", sub: "20 min ou moins", on: onlyQuick, toggle: () => setOnlyQuick((v) => !v) },
    ...(linkInventory
      ? [{ id: "stock", label: "🥫 Déjà en stock", sub: "Aucun ingrédient manquant", on: onlyInStock, toggle: () => setOnlyInStock((v) => !v) }]
      : []),
  ];

  function renderRailItem({ id, label, all = false }) {
    const on = category === id;
    return html`
      <button
        type="button"
        key=${id || "all"}
        className=${`rlib-rail-item${on ? " on" : ""}`}
        aria-pressed=${on ? "true" : "false"}
        onClick=${() => setCategory(on ? "" : id)}
      >
        <span className=${`rlib-rail-dot ${categoryToneClass(id)}`}>
          ${all
            ? html`<span className="rlib-rail-all" aria-hidden="true">•••</span>`
            : html`<${CategoryIcon} categoryId=${id} size=${22} framed=${false} color=${on ? "var(--mrd-white)" : ""} />`}
        </span>
        <span className="rlib-rail-label">${label}</span>
      </button>
    `;
  }

  function renderCard(recipe) {
    const stock = stockByRecipeId.get(recipe.id);
    const catLabel = categoryLabel(recipe.category);
    const duration = durationSentence(recipe);
    const quick = isQuickRecipe(recipe);
    const labels = Array.isArray(recipe.labels) ? recipe.labels : [];
    const shownLabels = labels.slice(0, 4);
    const extraLabels = labels.length - shownLabels.length;
    const isFavorite = Boolean(recipe.favorite);

    const availabilityText = recipe.availabilityMode === "all_year"
      ? "Disponible toute l'année"
      : (() => {
        const list = recipeMonths(recipe);
        if (!list.length) return "Disponibilité non renseignée";
        const inSeason = list.includes(currentMonth);
        return `${inSeason ? "De saison" : "Hors saison"} · ${list.map((month) => MONTH_SHORT[month - 1]).join(", ")}`;
      })();

    return html`
      <article className=${`rlib-card ${categoryToneClass(recipe.category)}`} key=${recipe.id}>

        <div className="rlib-card-head">
          <button
            type="button"
            className="rlib-card-open"
            aria-label=${`Ouvrir la fiche : ${recipe.name || "Recette"}`}
            onClick=${() => onOpenRecipe?.(recipe)}
          >
            <span className="rlib-card-thumb" aria-hidden="true">
              ${recipe.photo
                ? html`<img src=${recipe.photo} alt="" />`
                : html`<${CategoryIcon} categoryId=${recipe.category} size=${38} framed=${false} />`}
            </span>
            <span className="rlib-card-headtext">
              <span className="rlib-card-name">${recipe.name || "Sans titre"}</span>
              <span className="rlib-card-meta">
                ${catLabel ? html`<span className="rlib-card-cat">${catLabel}</span>` : null}
                ${duration ? html`<span className="rlib-card-time">${duration}</span>` : null}
                ${quick ? html`<span className="rlib-card-quick">⚡ rapide</span>` : null}
              </span>
            </span>
          </button>
          <button
            type="button"
            className=${`rlib-card-star${isFavorite ? " on" : ""}`}
            aria-pressed=${isFavorite ? "true" : "false"}
            aria-label=${isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
            onClick=${() => onToggleFavorite?.(recipe)}
          >${isFavorite ? "★" : "☆"}</button>
        </div>

        ${shownLabels.length ? html`
          <div className="rlib-card-tags">
            ${shownLabels.map((id) => {
              const food = FOOD_TYPES.find((type) => type.id === id);
              const constraint = CONSTRAINT_LABELS.find((item) => item.id === id);
              return html`
                <span key=${id} className=${`rlib-tag${food ? " rlib-tag--diet" : ""}`}>
                  ${food ? `${food.icon} ${food.label}` : (constraint ? constraint.label : id)}
                </span>
              `;
            })}
            ${extraLabels > 0 ? html`<span className="rlib-tag rlib-tag--more">+${extraLabels}</span>` : null}
          </div>
        ` : null}

        <div className="rlib-card-foot">
          <div className="rlib-card-status">
            ${stock?.known ? html`
              <span className=${`rlib-card-stock${stock.ready ? " ok" : " missing"}`}>
                ${stock.ready
                  ? "✓ Tous les ingrédients en stock"
                  : `${stock.missingCount} ingrédient${stock.missingCount > 1 ? "s" : ""} manquant${stock.missingCount > 1 ? "s" : ""}`}
              </span>
            ` : null}
            <span className="rlib-card-avail">${availabilityText}</span>
          </div>
          <div className="rlib-card-actions">
            <button type="button" className="rlib-card-btn" onClick=${() => onOpenRecipe?.(recipe)}>Ouvrir</button>
            ${onPlanRecipe ? html`
              <button type="button" className="rlib-card-btn rlib-card-btn--plan" onClick=${() => onPlanRecipe(recipe)}>Planifier</button>
            ` : null}
          </div>
        </div>

      </article>
    `;
  }

  return html`
    <section className="rwrap recipes-page recipes-page--lib">

      <!-- ── En-tête : ← Recettes … Démo + ─────────────────────── -->
      <div className="rlib-hdr">
        <div className="mrd-back-hdr-main">
          ${onBack ? html`
            <button type="button" className="mrd-back-btn" onClick=${onBack} aria-label="Retour">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          ` : null}
          <span className="rlib-titles">
            <span className="rlib-title">Recettes</span>
            <span className="rlib-subtitle">${subtitle}</span>
          </span>
        </div>
        <div className="rlib-hdr-actions">
          ${onLoadDemoRecipes
            ? html`<button type="button" className="recipes-page-demo-btn" onClick=${onLoadDemoRecipes}>Démo</button>`
            : null}
          <button type="button" className="rlib-add" onClick=${() => onCreateRecipe?.()} title="Ajouter une recette" aria-label="Ajouter une recette">+</button>
        </div>
      </div>

      <!-- ── Recherche + Affiner ───────────────────────────────── -->
      <div className="rlib-searchrow">
        <span className="rlib-search">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2" />
            <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          <input
            className="rlib-search-input"
            type="search"
            enterkeyhint="search"
            placeholder="Rechercher une recette…"
            value=${query}
            onInput=${(event) => setQuery(event.target.value)}
            autocomplete="off"
          />
        </span>
        <button
          type="button"
          className=${`rlib-refine${activeFilters.length ? " on" : ""}`}
          aria-expanded=${panelOpen ? "true" : "false"}
          onClick=${() => setPanelOpen((open) => !open)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
          ${activeFilters.length ? `Affiner · ${activeFilters.length}` : "Affiner"}
        </button>
      </div>

      <!-- ── Rangée de catégories ──────────────────────────────── -->
      <div className="rlib-rail">
        ${renderRailItem({ id: "", label: "Tout", all: true })}
        ${CATEGORIES.map((cat) => renderRailItem(cat))}
      </div>

      <!-- ── Panneau « Affiner » ───────────────────────────────── -->
      ${panelOpen ? html`
        <div className="rlib-panel">

          ${switches.map((item) => html`
            <button
              key=${item.id}
              type="button"
              className="rlib-switch"
              aria-pressed=${item.on ? "true" : "false"}
              onClick=${item.toggle}
            >
              <span className="rlib-switch-text">
                <span className="rlib-switch-label">${item.label}</span>
                <span className="rlib-switch-sub">${item.sub}</span>
              </span>
              <span className=${`rlib-switch-track${item.on ? " on" : ""}`}><span className="rlib-switch-knob"></span></span>
            </button>
          `)}

          <div className="rlib-panel-sep"></div>

          <div className="rlib-group">
            <div className="rlib-group-head">
              <span className="rlib-group-label">Disponibilité</span>
              <span className=${`rlib-group-summary${wantedMonths.size ? " on" : ""}`}>${availabilitySummary}</span>
            </div>
            <div className="rlib-seasons">
              ${SEASONS.map((season) => {
                const on = seasons.includes(season.id);
                return html`
                  <button
                    key=${season.id}
                    type="button"
                    className=${`rlib-season${on ? " on" : ""}`}
                    aria-pressed=${on ? "true" : "false"}
                    onClick=${() => toggleSeason(season.id)}
                  >
                    <span className="rlib-season-icon" aria-hidden="true">${SEASON_ICONS[season.id]}</span>
                    <span className="rlib-season-label">${season.label}</span>
                  </button>
                `;
              })}
            </div>
            <div className="rlib-months">
              ${MONTH_INITIALS.map((initial, index) => {
                const month = index + 1;
                const on = wantedMonths.has(month);
                return html`
                  <button
                    key=${month}
                    type="button"
                    className=${`rlib-month${on ? " on" : ""}`}
                    aria-pressed=${on ? "true" : "false"}
                    aria-label=${MONTH_SHORT[index]}
                    onClick=${() => toggleMonth(month)}
                  >${initial}</button>
                `;
              })}
            </div>
            <div className="rlib-group-note">Une saison cochée coche ses trois mois ; on peut aussi taper un mois seul.</div>
          </div>

          <div className="rlib-panel-sep"></div>

          <div className="rlib-group">
            <span className="rlib-group-label">Type alimentaire</span>
            <div className="rlib-chips">
              ${FOOD_TYPES.map((type) => html`
                <button
                  key=${type.id}
                  type="button"
                  className=${`rlib-chip${diet === type.id ? " on" : ""}`}
                  aria-pressed=${diet === type.id ? "true" : "false"}
                  onClick=${() => setDiet((prev) => (prev === type.id ? "" : type.id))}
                >${type.icon} ${type.label}</button>
              `)}
            </div>
          </div>

          <div className="rlib-panel-sep"></div>

          <div className="rlib-group">
            <span className="rlib-group-label">Contraintes</span>
            <button
              type="button"
              className=${`rlib-select${constraints.length ? " on" : ""}`}
              aria-expanded=${constraintsOpen ? "true" : "false"}
              onClick=${() => setConstraintsOpen((open) => !open)}
            >
              <span className="rlib-select-summary">${constraintsSummary}</span>
              <span className="rlib-select-caret" aria-hidden="true">${constraintsOpen ? "▲" : "▼"}</span>
            </button>
            ${constraintsOpen ? html`
              <div className="rlib-select-list">
                ${CONSTRAINT_LABELS.map((item) => {
                  const on = constraints.includes(item.id);
                  return html`
                    <button
                      key=${item.id}
                      type="button"
                      className=${`rlib-select-row${on ? " on" : ""}`}
                      aria-pressed=${on ? "true" : "false"}
                      onClick=${() => toggleConstraint(item.id)}
                    >
                      <span className=${`rlib-select-box${on ? " on" : ""}`} aria-hidden="true">${on ? "✓" : ""}</span>
                      <span className="rlib-select-label">${item.label}</span>
                    </button>
                  `;
                })}
              </div>
            ` : null}
          </div>

          <div className="rlib-panel-foot">
            <button type="button" className="rlib-panel-clear" onClick=${clearAll}>Tout effacer</button>
            <button type="button" className="rlib-panel-see" onClick=${() => setPanelOpen(false)}>Voir ${countLabel}</button>
          </div>

        </div>
      ` : null}

      <!-- ── Rappel des filtres actifs ─────────────────────────── -->
      ${activeFilters.length ? html`
        <div className="rlib-active">
          ${activeFilters.map((filter) => html`
            <button key=${filter.id} type="button" className="rlib-active-chip" onClick=${filter.clear}>
              ${filter.label}<span className="rlib-active-x" aria-hidden="true">✕</span>
            </button>
          `)}
        </div>
      ` : null}

      <!-- ── Compteur + tri ────────────────────────────────────── -->
      <div className="rlib-countrow">
        <span className="rlib-count">${countLabel}</span>
        <div className="rlib-sorts">
          ${SORTS.filter((option) => option.id !== "stock" || linkInventory).map((option) => html`
            <button
              key=${option.id}
              type="button"
              className=${`rlib-sort${sort === option.id ? " on" : ""}`}
              aria-pressed=${sort === option.id ? "true" : "false"}
              onClick=${() => setSort(option.id)}
            >${option.label}</button>
          `)}
        </div>
      </div>

      <!-- ── Liste ─────────────────────────────────────────────── -->
      <div className="rlib-list">
        ${visibleRecipes.length
          ? visibleRecipes.map((recipe) => renderCard(recipe))
          : html`
              <div className="rlib-empty">
                <div className="rlib-empty-title">Aucune recette</div>
                <div className="rlib-empty-sub">Tes filtres sont trop serrés, ou la recherche ne donne rien.</div>
                <button type="button" className="rlib-empty-clear" onClick=${clearAll}>Tout effacer</button>
              </div>
            `}
      </div>

    </section>
  `;
}

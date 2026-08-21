/**
 * Onglet Repas — grille semaine (écran 2a du handoff « refonte Repas »).
 *
 * Les 14 créneaux (midi + soir × 7 jours) tiennent dans un écran mobile sans
 * défilement, et le détail du créneau sélectionné vit dans un panneau bas
 * permanent — jamais dans une modale, pour que la semaine reste lisible pendant
 * qu'on remplit un trou.
 *
 * Le choix d'une recette part dans `RecipePicker` (écran 5a), qui remplace la
 * grille le temps de la sélection.
 */
import { DAYS } from "../../constants.js";
import { html, useEffect, useMemo, useState } from "../../lib.js";
import { getCurrentAppDate } from "../../utils/date.js";
import { createMealShell } from "../../utils/state.js";
import { formatQuantityUnit } from "../../utils/productUtils.js";
import { buildFillPlan } from "../../utils/mealFill.js";
import { MONTH_NAMES } from "../../utils/recipeFilters.js";
import {
  collectUsedStockItems,
  computeMissingCondiments,
  computeMissingIngredients,
  computeRecipeStock,
  computeWeekStock,
  countDistinctProducts,
  isAlreadyListed,
  splitAlreadyListed,
} from "../../utils/recipeStock.js";
import { productMatchKey } from "../../utils/units.js";
import { CategoryIcon, categoryToneClass } from "../recipes/CategoryIcons.js";
import { RecipeSheet, fmtScaledQty } from "../recipes/RecipeSheet.js";
import { RecipePicker } from "./RecipePicker.js";

const DAY_ABBR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SLOTS = ["lunch", "dinner"];
const SLOT_LABELS = { lunch: "Déjeuner", dinner: "Dîner" };
const SLOT_SHORT = { lunch: "midi", dinner: "soir" };

/* Feuille « Remplir » : un sous-ensemble volontairement court des filtres du
   sélecteur — au-delà, la feuille ne tient plus dans le panneau bas. */
const FILL_DIETS = [
  { id: "omnivore",    label: "Omnivore" },
  { id: "vegetarian",  label: "Végé" },
  { id: "vegan",       label: "Végan" },
  { id: "pescetarian", label: "Pescé" },
];

const FILL_CONSTRAINTS = [
  { id: "gluten_free",  label: "Sans gluten" },
  { id: "lactose_free", label: "Sans lactose" },
  { id: "pork_free",    label: "Sans porc" },
];

const FILL_SCOPES = [
  { id: "empty", label: "Cases vides" },
  { id: "all",   label: "Toute la semaine" },
];

const EMPTY_FILL = { diet: "", constraints: [], quick: false, season: false, stock: false, scope: "empty" };

function dateToKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function computeMonday(date) {
  const monday = new Date(date);
  const dow = monday.getDay();
  monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

/** Champs de `meal` pour un créneau : ils sont préfixés lunch/dinner. */
function slotFields(slot) {
  const prefix = slot === "lunch" ? "lunch" : "dinner";
  return {
    recipeId: `${prefix}RecipeId`,
    text: `${prefix}Text`,
    cooked: `${prefix}Cooked`,
    starter: `${prefix}StarterRecipeId`,
    dessert: `${prefix}DessertRecipeId`,
  };
}

/** Identifiant d'un créneau dans la semaine affichée. */
function slotKeyOf(dayIndex, slot) {
  return `${dayIndex}-${slot}`;
}

/** La recette aux portions demandées — mêmes arrondis que la fiche recette. */
function scaleRecipe(recipe, servings) {
  const base = Math.max(1, Number(recipe?.servings) || 1);
  const wanted = Math.max(1, Number(servings) || base);
  if (wanted === base || !Array.isArray(recipe?.ingredients)) return recipe;
  const ratio = wanted / base;
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((item) => ({ ...item, quantity: fmtScaledQty(item.quantity, ratio) })),
  };
}

export function MealsView({
  meals,
  recipes,
  inventory = [],
  shoppingItems = [],
  linkMealsToInventory = false,
  onToggleLinkMealsToInventory,
  onAddMissingIngredients,
  onUpdateMeal,
  onToggleCook,
}) {
  const safeRecipes = Array.isArray(recipes) ? recipes : [];
  const safeMeals = Array.isArray(meals) ? meals : [];
  const today = getCurrentAppDate();
  const currentMonth = today.getMonth() + 1;

  const [weekOffset, setWeekOffset] = useState(0);
  const [selected, setSelected] = useState(() => {
    const dow = today.getDay();
    return { dayIndex: dow === 0 ? 6 : dow - 1, slot: today.getHours() < 15 ? "lunch" : "dinner" };
  });
  const [servings, setServings] = useState(null); // null → le nombre de personnes de la recette
  const [fillOpen, setFillOpen] = useState(false);
  const [fill, setFill] = useState(EMPTY_FILL);
  const [picker, setPicker] = useState(null); // { dayIndex, slot, role }
  const [viewModal, setViewModal] = useState(null);
  const [missingModal, setMissingModal] = useState(null);
  const [fillReport, setFillReport] = useState(null);

  const todayMonday = computeMonday(today);
  const targetMonday = addDays(todayMonday, weekOffset * 7);
  const targetWeekKey = dateToKey(targetMonday);
  const isCurrentWeek = weekOffset === 0;
  const weekDates = DAYS.map((_, index) => addDays(targetMonday, index));
  const todayIdx = (() => { const dow = today.getDay(); return dow === 0 ? 6 : dow - 1; })();
  const todayKey = dateToKey(today);

  // Compat : un repas sans weekKey appartient à la semaine courante.
  const mealRows = DAYS.map((day, index) => (
    safeMeals.find((meal) => meal.day === day && (meal.weekKey === targetWeekKey || (isCurrentWeek && !meal.weekKey)))
    || createMealShell(day, index, targetWeekKey)
  ));

  const recipeById = useMemo(() => new Map(safeRecipes.map((recipe) => [recipe.id, recipe])), [safeRecipes]);

  // Comparaison au stock uniquement quand la liaison inventaire est active.
  // Cette carte reste volontairement recette par recette : elle sert au tirage
  // automatique, qui choisit des recettes et non des créneaux.
  const stockByRecipeId = useMemo(() => {
    const map = new Map();
    if (!linkMealsToInventory) return map;
    safeRecipes.forEach((recipe) => map.set(recipe.id, computeRecipeStock(recipe, inventory)));
    return map;
  }, [safeRecipes, inventory, linkMealsToInventory]);

  /**
   * Les 14 créneaux de la semaine dans l'ordre chronologique, prêts pour
   * `computeWeekStock`. `overrides` permet de poser une recette sans attendre
   * que l'état soit à jour — le sélecteur et le tirage s'en servent pour
   * répondre juste au moment où on choisit.
   */
  function buildWeekSlots(overrides = []) {
    return mealRows.flatMap((meal, dayIndex) => SLOTS.map((slot) => {
      const fields = slotFields(slot);
      const roleIds = {
        starter: meal[fields.starter] || "",
        main: meal[fields.recipeId] || "",
        dessert: meal[fields.dessert] || "",
      };
      overrides
        .filter((entry) => entry.dayIndex === dayIndex && entry.slot === slot)
        .forEach((entry) => { roleIds[entry.role || "main"] = entry.recipeId; });
      return {
        key: slotKeyOf(dayIndex, slot),
        label: `${DAY_ABBR[dayIndex]} ${SLOT_SHORT[slot]}`,
        cooked: Boolean(meal[fields.cooked]),
        recipes: [roleIds.starter, roleIds.main, roleIds.dessert]
          .filter(Boolean)
          .map((id) => recipeById.get(id))
          .filter(Boolean),
      };
    }));
  }

  /* Faisabilité à l'échelle de la semaine : le stock est un budget que les
     créneaux se partagent dans l'ordre. Sans ça, deux repas qui veulent le même
     paquet de nouilles se croient tous les deux faisables, et rien ne prévient
     qu'après le premier il ne restera rien. */
  const weekStock = linkMealsToInventory
    ? computeWeekStock({ slots: buildWeekSlots(), inventory })
    : new Map();

  function readSlot(dayIndex, slot) {
    const meal = mealRows[dayIndex];
    const fields = slotFields(slot);
    const recipeId = meal[fields.recipeId] || "";
    const recipe = recipeId ? recipeById.get(recipeId) || null : null;
    // Le manque se lit à l'échelle de la semaine, pas de la recette seule.
    const stock = weekStock.get(slotKeyOf(dayIndex, slot)) || null;
    return {
      meal,
      day: meal.day,
      weekKey: meal.weekKey || targetWeekKey,
      slot,
      recipeId,
      recipe,
      text: meal[fields.text] || "",
      cooked: Boolean(meal[fields.cooked]),
      starter: meal[fields.starter] ? recipeById.get(meal[fields.starter]) || null : null,
      dessert: meal[fields.dessert] ? recipeById.get(meal[fields.dessert]) || null : null,
      missingCount: stock?.known ? stock.missingCount : 0,
      stockKnown: Boolean(stock?.known),
      // Ce qui ne manque qu'à cause d'un repas plus tôt dans la semaine.
      weekOnlyMissing: stock?.weekOnlyMissing || [],
    };
  }

  const slotList = DAYS.flatMap((_, dayIndex) => SLOTS.map((slot) => ({ dayIndex, slot, ...readSlot(dayIndex, slot) })));
  const filledCount = slotList.filter((entry) => entry.recipeId || entry.text).length;

  const current = readSlot(selected.dayIndex, selected.slot);
  const currentDate = weekDates[selected.dayIndex];
  const baseServings = Math.max(1, Number(current.recipe?.servings) || 4);
  const effectiveServings = servings == null ? baseServings : servings;

  // Manquants du créneau sélectionné, au nombre de couverts affiché.
  const scaledMissingForCurrent = linkMealsToInventory && current.recipe
    ? computeMissingIngredients(scaleRecipe(current.recipe, effectiveServings), inventory)
    : [];

  /* Ce que la semaine réserve avant ce créneau vient s'ajouter. Le calcul
     semaine ignore les couverts personnalisés — il travaille sur la recette
     telle quelle — donc les deux listes se complètent au lieu de se remplacer :
     la version à l'échelle donne les quantités affichées, la semaine ajoute les
     produits qu'un repas plus tôt a déjà pris. Restreint au plat : l'entrée et
     le dessert ont leurs propres lignes dans le panneau. */
  const currentMainKeys = new Set(
    (Array.isArray(current.recipe?.ingredients) ? current.recipe.ingredients : [])
      .map((item) => productMatchKey(item?.name))
      .filter(Boolean),
  );
  const weekOnlyForCurrent = current.weekOnlyMissing.filter((item) => currentMainKeys.has(productMatchKey(item.name)));
  const scaledMissingKeys = new Set(scaledMissingForCurrent.map((item) => productMatchKey(item.name)));
  const missingForCurrent = [
    ...scaledMissingForCurrent,
    ...weekOnlyForCurrent.filter((item) => !scaledMissingKeys.has(productMatchKey(item.name))),
  ];

  // Changer de créneau (ou de recette) remet les couverts sur la recette.
  useEffect(() => { setServings(null); }, [selected.dayIndex, selected.slot, current.recipeId, targetWeekKey]);

  /* ── Actions ── */

  function openPicker(dayIndex, slot, role = "main") {
    setSelected({ dayIndex, slot });
    setFillOpen(false);
    setPicker({ dayIndex, slot, role });
  }

  /**
   * Juste après avoir posé une recette : ce qui manque pour elle, en tenant
   * compte des repas déjà prévus plus tôt dans la semaine. C'est le moment où
   * poser deux fois le même plat doit se voir — avant, les deux créneaux se
   * déclaraient faisables avec le même paquet.
   */
  function checkInventoryAfterPick(recipe, dayIndex, slot, role) {
    if (!linkMealsToInventory || !recipe) return;
    const slotStock = computeWeekStock({
      slots: buildWeekSlots([{ dayIndex, slot, role, recipeId: recipe.id }]),
      inventory,
    }).get(slotKeyOf(dayIndex, slot));
    // Les autres rôles du créneau ont leur propre ligne : la popup ne parle que
    // de la recette qu'on vient de choisir, dont elle porte le nom.
    const pickedKeys = new Set(
      (Array.isArray(recipe.ingredients) ? recipe.ingredients : [])
        .map((item) => productMatchKey(item?.name))
        .filter(Boolean),
    );
    const missing = (slotStock?.missing || []).filter((item) => pickedKeys.has(productMatchKey(item.name)));
    const missingCondiments = computeMissingCondiments(recipe, inventory);
    if (!missing.length && !missingCondiments.length) return;
    setMissingModal({
      recipeName: recipe.name,
      mode: "inventory",
      items: missing,
      condimentItems: missingCondiments,
      // Ce qui attend déjà sur la liste part décoché : rien ne sert de le redemander.
      selectedIds: splitAlreadyListed(missing, shoppingItems).toAdd.map((item) => item.id),
      selectedCondiments: [],
    });
  }

  function applyPick(recipeId) {
    if (!picker) return;
    const { dayIndex, slot: pickedSlot, role } = picker;
    const target = readSlot(dayIndex, pickedSlot);
    const key = role === "starter" ? "starterRecipeId" : role === "dessert" ? "dessertRecipeId" : "recipeId";
    onUpdateMeal(target.day, target.slot, { [key]: recipeId }, target.weekKey);
    setPicker(null);
    if (recipeId) checkInventoryAfterPick(recipeById.get(recipeId), dayIndex, pickedSlot, role);
  }

  function fillPlanFor(filters) {
    return buildFillPlan({
      recipes: safeRecipes,
      slots: slotList.map(({ dayIndex, slot, recipeId }) => ({ dayIndex, slot, recipeId })),
      filters,
      currentMonth,
      stockByRecipeId,
    });
  }

  function runFill() {
    const plan = fillPlanFor(fill);
    plan.entries.forEach((entry) => {
      const target = readSlot(entry.dayIndex, entry.slot);
      onUpdateMeal(target.day, target.slot, { recipeId: entry.recipeId }, target.weekKey);
    });
    setFillOpen(false);
    if (!plan.entries.length) return;

    /* Ce qu'il faudra acheter pour cuisiner la semaine qu'on vient de tirer,
       sans ce qui attend déjà sur la liste. Le compte se fait sur la semaine
       entière : deux repas tirés qui veulent le même produit en demandent deux
       fois la quantité, alors que le calcul recette par recette n'en voyait
       qu'un. Les doublons restants sont laissés tels quels — la liste fusionne
       les articles proches et additionne les quantités. */
    const planKeys = new Set(plan.entries.map((entry) => slotKeyOf(entry.dayIndex, entry.slot)));
    const planStock = linkMealsToInventory
      ? computeWeekStock({
          slots: buildWeekSlots(plan.entries.map((entry) => ({ ...entry, role: "main" }))),
          inventory,
        })
      : new Map();
    const missingSplit = splitAlreadyListed(
      [...planStock.entries()]
        .filter(([key]) => planKeys.has(key))
        .flatMap(([, entry]) => entry.missing),
      shoppingItems,
    );
    const missingItems = missingSplit.toAdd;

    // Bilan : sans lui, « avec mon stock » range silencieusement des recettes
    // qu'il faudra acheter — on dit ce qui a été puisé et ce qui reste à acheter.
    setFillReport({
      total: plan.entries.length,
      stockCount: plan.stockCount,
      otherCount: plan.otherCount,
      stockAsked: plan.stockAsked,
      items: plan.stockAsked
        ? collectUsedStockItems(
            plan.entries.filter((entry) => entry.fromStock).map((entry) => recipeById.get(entry.recipeId)),
            inventory,
          )
        : [],
      missingItems,
      missingCount: countDistinctProducts(missingItems),
      alreadyListedCount: countDistinctProducts(missingSplit.listed),
    });
  }

  function addFillMissingToShopping() {
    if (!fillReport?.missingItems?.length) return;
    onAddMissingIngredients?.(fillReport.missingItems);
    setFillReport(null);
  }

  function openShopping() {
    if (!current.recipe) return;
    const scaled = scaleRecipe(current.recipe, effectiveServings);
    if (!linkMealsToInventory) {
      // Sans liaison : pas de comparaison au stock, on propose la liste complète.
      const items = Array.isArray(scaled.ingredients) ? scaled.ingredients.filter((item) => item?.name) : [];
      if (!items.length) return;
      setMissingModal({ recipeName: scaled.name, mode: "manual", items, condimentItems: [], selectedIds: [], selectedCondiments: [] });
      return;
    }
    // La même liste que le bouton : sinon il annonce « Courses · 1 » et la
    // popup répond que tout est disponible.
    const missing = missingForCurrent;
    const missingCondiments = computeMissingCondiments(scaled, inventory);
    setMissingModal({
      recipeName: scaled.name,
      mode: "inventory",
      items: missing,
      condimentItems: missingCondiments,
      selectedIds: splitAlreadyListed(missing, shoppingItems).toAdd.map((item) => item.id),
      selectedCondiments: [],
    });
  }

  function toggleMissingIngredient(ingredientId) {
    setMissingModal((prev) => prev && ({
      ...prev,
      selectedIds: prev.selectedIds.includes(ingredientId)
        ? prev.selectedIds.filter((id) => id !== ingredientId)
        : [...prev.selectedIds, ingredientId],
    }));
  }

  function toggleMissingCondiment(condimentId) {
    setMissingModal((prev) => {
      if (!prev) return prev;
      const selected = prev.selectedCondiments || [];
      return {
        ...prev,
        selectedCondiments: selected.includes(condimentId) ? selected.filter((id) => id !== condimentId) : [...selected, condimentId],
      };
    });
  }

  function addSelectedMissingIngredients() {
    if (!missingModal) return;
    const items = missingModal.items.filter((item) => missingModal.selectedIds.includes(item.id));
    const condiments = (missingModal.condimentItems || [])
      .filter((item) => (missingModal.selectedCondiments || []).includes(item.id))
      .map((item) => ({ id: item.id, name: item.name, quantity: "", unit: "" }));
    const all = [...items, ...condiments];
    if (all.length) onAddMissingIngredients?.(all);
    setMissingModal(null);
  }

  /* ── Libellés ── */

  const weekSunday = addDays(targetMonday, 6);
  const sameMonth = targetMonday.getMonth() === weekSunday.getMonth();
  const weekRange = sameMonth
    ? `${targetMonday.getDate()} – ${weekSunday.getDate()} ${MONTH_NAMES[weekSunday.getMonth()].toLowerCase()}`
    : `${targetMonday.getDate()} ${MONTH_NAMES[targetMonday.getMonth()].toLowerCase()} – ${weekSunday.getDate()} ${MONTH_NAMES[weekSunday.getMonth()].toLowerCase()}`;
  const weekKicker = weekOffset === 0 ? "cette semaine" : weekOffset === 1 ? "semaine prochaine" : weekOffset === -1 ? "semaine passée" : `${weekOffset > 0 ? "+" : ""}${weekOffset} semaines`;

  /* ── Sélecteur de recettes : il remplace la grille ── */

  if (picker) {
    const target = readSlot(picker.dayIndex, picker.slot);
    const currentIdByRole = picker.role === "starter" ? target.starter?.id : picker.role === "dessert" ? target.dessert?.id : target.recipeId;
    return html`
      <${RecipePicker}
        recipes=${safeRecipes}
        inventory=${inventory}
        linkInventory=${linkMealsToInventory}
        currentMonth=${currentMonth}
        slotLabel=${`${DAYS[picker.dayIndex]} ${weekDates[picker.dayIndex].getDate()}, ${SLOT_SHORT[picker.slot]}`}
        role=${picker.role}
        currentRecipeId=${currentIdByRole || ""}
        onRemove=${() => applyPick("")}
        onCancel=${() => setPicker(null)}
        onSelect=${applyPick}
      />
    `;
  }

  /* ── Grille ── */

  function renderCell(dayIndex, slot) {
    const entry = readSlot(dayIndex, slot);
    const date = weekDates[dayIndex];
    const isPast = dateToKey(date) < todayKey;
    const isOn = selected.dayIndex === dayIndex && selected.slot === slot;
    const name = entry.recipe?.name || entry.text || "Ajouter";
    const hasContent = Boolean(entry.recipeId || entry.text);
    const showDot = linkMealsToInventory && entry.missingCount > 0;
    /* Un manque causé par un autre repas de la semaine se distingue d'un manque
       ordinaire : la réponse n'est pas la même — décaler le repas ou racheter,
       plutôt que simplement compléter la liste. */
    const takenByWeek = showDot && entry.weekOnlyMissing.length > 0;
    const stockNote = takenByWeek
      ? " — stock déjà pris par un autre repas"
      : showDot ? ` — ${entry.missingCount} ingrédient${entry.missingCount > 1 ? "s" : ""} manquant${entry.missingCount > 1 ? "s" : ""}` : "";

    return html`
      <button
        type="button"
        key=${`${dayIndex}-${slot}`}
        className=${`mrd-week-cell${hasContent ? "" : " is-empty"}${isOn ? " on" : ""}${isPast ? " past" : ""}${entry.cooked ? " cooked" : ""}`}
        aria-pressed=${isOn ? "true" : "false"}
        aria-label=${`${DAYS[dayIndex]} ${SLOT_LABELS[slot].toLowerCase()} : ${hasContent ? name : "libre"}${stockNote}`}
        onClick=${() => (hasContent ? setSelected({ dayIndex, slot }) : openPicker(dayIndex, slot))}
      >
        <span className="mrd-week-cell-bar" aria-hidden="true"></span>
        <span className=${`mrd-week-cell-icon ${categoryToneClass(entry.recipe?.category)}`} aria-hidden="true">
          ${entry.recipe
            ? html`<${CategoryIcon} categoryId=${entry.recipe.category} size=${15} framed=${false} />`
            : html`<span className="mrd-week-cell-plus">+</span>`}
        </span>
        <span className="mrd-week-cell-name">${name}</span>
        <span className=${`mrd-week-cell-dot${showDot ? (takenByWeek ? " taken" : " on") : ""}`} aria-hidden="true"></span>
      </button>
    `;
  }

  function renderDetailPanel() {
    const roles = [
      { id: "starter", label: "Entrée", recipe: current.starter, empty: "Ajouter une entrée" },
      { id: "main",    label: "Plat",   recipe: current.recipe,  empty: "Ajouter un plat" },
      { id: "dessert", label: "Dessert", recipe: current.dessert, empty: "Ajouter un dessert" },
    ];
    const stock = weekStock.get(slotKeyOf(selected.dayIndex, selected.slot)) || null;
    // Ce qui reste vraiment à demander : les manquants déjà posés sur la liste
    // de courses ne comptent plus. Sinon le bouton réclame indéfiniment la même
    // chose et on ne sait pas si on l'a déjà fait.
    const stillToBuy = splitAlreadyListed(missingForCurrent, shoppingItems).toAdd;
    const allListed = missingForCurrent.length > 0 && stillToBuy.length === 0;
    const shopState = !linkMealsToInventory || !stock?.known
      ? "off"
      : missingForCurrent.length === 0 ? "ok" : allListed ? "listed" : "missing";
    const shopLabel = shopState === "missing"
      ? `Courses · ${stillToBuy.length}`
      : shopState === "listed" ? "✓ Sur la liste" : "Courses";

    /* Le manque qui vient de la semaine mérite une phrase, pas juste un point :
       « il manque des nouilles » alors qu'on vient d'en acheter est incompréhensible
       tant qu'on ne dit pas quel repas les prend déjà. */
    const takenSlots = [...new Set(weekOnlyForCurrent.flatMap((item) => item.takenBy || []))];
    const takenNames = [...new Set(weekOnlyForCurrent.map((item) => item.name))];

    return html`
      <div className="mrd-week-panel">
        <div className=${`mrd-week-panel-hdr${current.recipe ? "" : " is-empty"}`}>
          <span className=${`mrd-week-panel-thumb ${categoryToneClass(current.recipe?.category)}`} aria-hidden="true">
            ${current.recipe ? html`<${CategoryIcon} categoryId=${current.recipe.category} size=${30} framed=${false} />` : null}
          </span>
          <span className="mrd-week-panel-titles">
            <span className="mrd-week-panel-kicker">
              ${DAYS[selected.dayIndex]} ${currentDate.getDate()} · ${SLOT_LABELS[selected.slot]}
            </span>
            <span className=${`mrd-week-panel-title${current.recipe ? "" : " is-empty"}`}>
              ${current.recipe?.name || current.text || "Rien de prévu"}
            </span>
          </span>
          <button
            type="button"
            className=${`mrd-week-cook${current.cooked ? " on" : ""}`}
            disabled=${!current.recipeId}
            onClick=${() => onToggleCook(current.day, current.slot, current.weekKey)}
          >${current.cooked ? "✓ Cuisiné" : "Marquer cuisiné"}</button>
        </div>

        <div className="mrd-week-panel-body">
          <div className="mrd-week-panel-rows">
            ${roles.map((role) => html`
              <button type="button" key=${role.id} className="mrd-week-panel-row"
                onClick=${() => openPicker(selected.dayIndex, selected.slot, role.id)}>
                <span className="mrd-week-panel-role">${role.label}</span>
                <span className=${`mrd-week-panel-name${role.recipe ? "" : " is-empty"}`}>${role.recipe?.name || role.empty}</span>
                <span className="mrd-week-panel-cue" aria-hidden="true">${role.recipe ? "›" : "+"}</span>
              </button>
            `)}
          </div>

          ${takenNames.length ? html`
            <div className="mrd-week-taken">
              <span className="mrd-week-taken-dot" aria-hidden="true"></span>
              <span>
                <strong>${takenNames.join(", ")}</strong> : ton stock part déjà dans
                ${takenSlots.length ? html` ${takenSlots.join(", ")}` : html` un autre repas`}.
                Il en faut une deuxième fois.
              </span>
            </div>
          ` : null}

          <div className="mrd-week-panel-actions">
            <span className="mrd-week-servings">
              <button type="button" className="mrd-week-servings-btn" aria-label="Moins de couverts"
                onClick=${() => setServings(Math.max(1, effectiveServings - 1))}>−</button>
              <span className="mrd-week-servings-value">${effectiveServings} couv.</span>
              <button type="button" className="mrd-week-servings-btn" aria-label="Plus de couverts"
                onClick=${() => setServings(Math.min(24, effectiveServings + 1))}>+</button>
            </span>
            <button type="button" className=${`mrd-week-shop ${shopState}`} disabled=${!current.recipe} onClick=${openShopping}>
              <span className="mrd-week-shop-dot" aria-hidden="true"></span>${shopLabel}
            </button>
            <button type="button" className="mrd-week-recipe" disabled=${!current.recipe} onClick=${() => setViewModal(current.recipe)}>
              Recette →
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderFillSheet() {
    // Le compteur annonce ce qui sera vraiment posé, pas le nombre de créneaux
    // visés : sans assez de recettes filtrées, le tirage en remplit moins.
    const targetCount = fillPlanFor(fill).entries.length;
    // Contraintes et options partagent la même rangée : une seule liste, sinon
    // React voit deux tableaux frères sans clé propre et le prévient en console.
    const constraintChips = [
      ...FILL_CONSTRAINTS.map((item) => ({
        id: item.id,
        label: item.label,
        on: fill.constraints.includes(item.id),
        toggle: () => setFill((prev) => ({
          ...prev,
          constraints: prev.constraints.includes(item.id)
            ? prev.constraints.filter((id) => id !== item.id)
            : [...prev.constraints, item.id],
        })),
      })),
      { id: "quick",  label: "⚡ Rapide",    on: fill.quick,  toggle: () => setFill((prev) => ({ ...prev, quick: !prev.quick })) },
      { id: "season", label: "🍂 De saison", on: fill.season, toggle: () => setFill((prev) => ({ ...prev, season: !prev.season })) },
      ...(linkMealsToInventory
        ? [{ id: "stock", label: "🥫 Avec mon stock", on: fill.stock, toggle: () => setFill((prev) => ({ ...prev, stock: !prev.stock })) }]
        : []),
    ];

    return html`
      <div className="mrd-week-panel">
        <div className="mrd-week-fill-hdr">
          <span className="mrd-week-fill-title">Remplir la semaine</span>
          <span className="mrd-week-fill-hdr-btns">
            <button type="button" className="mrd-week-fill-reset" onClick=${() => setFill(EMPTY_FILL)}>Vider</button>
            <button type="button" className="mrd-week-fill-close" onClick=${() => setFillOpen(false)} aria-label="Fermer">✕</button>
          </span>
        </div>
        <div className="mrd-week-fill-body">
          <div className="mrd-week-fill-chips">
            ${FILL_DIETS.map((diet) => html`
              <button type="button" key=${diet.id}
                className=${`mrd-week-chip${fill.diet === diet.id ? " on" : ""}`}
                onClick=${() => setFill((prev) => ({ ...prev, diet: prev.diet === diet.id ? "" : diet.id }))}>
                ${diet.label}
              </button>
            `)}
          </div>
          <div className="mrd-week-fill-chips">
            ${constraintChips.map((item) => html`
              <button type="button" key=${item.id} className=${`mrd-week-chip${item.on ? " on" : ""}`} onClick=${item.toggle}>
                ${item.label}
              </button>
            `)}
          </div>
          <div className="mrd-week-fill-run">
            <span className="mrd-week-fill-scope">
              ${FILL_SCOPES.map((scope) => html`
                <button type="button" key=${scope.id}
                  className=${`mrd-week-scope${fill.scope === scope.id ? " on" : ""}`}
                  onClick=${() => setFill((prev) => ({ ...prev, scope: scope.id }))}>
                  ${scope.label}
                </button>
              `)}
            </span>
            <button type="button" className="mrd-week-fill-cta" disabled=${!targetCount} onClick=${runFill}>
              Remplir ${targetCount} repas
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /** Bilan du tirage : ce qui vient du stock, ce qu'il reste à acheter. */
  function renderFillReport() {
    if (!fillReport) return null;
    const { total, stockCount, otherCount, stockAsked, items, missingCount, alreadyListedCount } = fillReport;
    const meals = (count) => `${count} repas`;

    return html`
      <div className="modal-backdrop" onClick=${() => setFillReport(null)}>
        <div className="modal-card task-modal" onClick=${(e) => e.stopPropagation()}>
          <div className="task-modal-head">
            <div>
              <div className="miniTitle">Semaine remplie</div>
              <div className="st">${meals(total)} ajouté${total > 1 ? "s" : ""}</div>
            </div>
            <button className="delbtn" onClick=${() => setFillReport(null)}>✕</button>
          </div>

          ${stockAsked ? html`
            <div className="mrd-fill-report">
              ${stockCount ? html`
                <div className="mrd-fill-report-line ok">
                  <span className="mrd-fill-report-dot" aria-hidden="true"></span>
                  <span><strong>${meals(stockCount)}</strong> avec ce que tu as déjà : ${items.length} article${items.length > 1 ? "s" : ""} du stock</span>
                </div>
                ${items.length ? html`
                  <div className="mrd-fill-report-items">
                    ${items.map((name) => html`<span className="mrd-fill-report-item" key=${name}>${name}</span>`)}
                  </div>
                ` : null}
              ` : html`
                <div className="mrd-fill-report-line">
                  <span className="mrd-fill-report-dot" aria-hidden="true"></span>
                  <span>Aucune recette n'était faisable avec ton stock.</span>
                </div>
              `}
              ${otherCount ? html`
                <div className="mrd-fill-report-line miss">
                  <span className="mrd-fill-report-dot" aria-hidden="true"></span>
                  <span><strong>${meals(otherCount)}</strong> demande${otherCount > 1 ? "nt" : ""} des courses.</span>
                </div>
              ` : null}
            </div>
          ` : null}

          ${!stockAsked && missingCount ? html`
            <div className="mrd-fill-report">
              <div className="mrd-fill-report-line miss">
                <span className="mrd-fill-report-dot" aria-hidden="true"></span>
                <span><strong>${missingCount} article${missingCount > 1 ? "s" : ""}</strong> manque${missingCount > 1 ? "nt" : ""} pour cuisiner cette semaine.</span>
              </div>
            </div>
          ` : null}

          ${!missingCount && alreadyListedCount ? html`
            <div className="mrd-fill-report">
              <div className="mrd-fill-report-line ok">
                <span className="mrd-fill-report-dot" aria-hidden="true"></span>
                <span>Rien de plus à acheter : les <strong>${alreadyListedCount} article${alreadyListedCount > 1 ? "s" : ""}</strong> qui manquent attendent déjà dans ta liste de courses.</span>
              </div>
            </div>
          ` : null}

          <div className="task-modal-actions">
            <button type="button" className="acn" onClick=${() => setFillReport(null)}>Voir la semaine</button>
            ${missingCount ? html`
              <button type="button" className="aok" onClick=${addFillMissingToShopping}>
                🛒 Ajouter ${missingCount} article${missingCount > 1 ? "s" : ""}
              </button>
            ` : null}
          </div>
        </div>
      </div>
    `;
  }

  function renderMissingModal() {
    if (!missingModal) return null;
    const isManual = missingModal.mode === "manual";
    const condimentItems = missingModal.condimentItems || [];
    const hasIngredients = missingModal.items.length > 0;
    const nothingMissing = !hasIngredients && !condimentItems.length;
    const stillToAdd = splitAlreadyListed(missingModal.items, shoppingItems).toAdd;
    const allAlreadyListed = hasIngredients && !stillToAdd.length;
    // Le bouton ne s'affiche que s'il y a vraiment quelque chose à envoyer :
    // « Ajouter à la liste » qui n'ajoute rien est pire que pas de bouton.
    const canSubmit = missingModal.selectedIds.length > 0 || (missingModal.selectedCondiments || []).length > 0;

    return html`
      <div className="modal-backdrop" onClick=${() => setMissingModal(null)}>
        <div className="modal-card task-modal" onClick=${(e) => e.stopPropagation()}>
          <div className="task-modal-head">
            <div>
              <div className="miniTitle">${isManual ? "Liste de courses" : "Inventaire"}</div>
              <div className="st">${missingModal.recipeName}</div>
            </div>
            <button className="delbtn" onClick=${() => setMissingModal(null)}>✕</button>
          </div>
          ${!isManual && nothingMissing
            ? html`<div className="mini" style=${{ marginBottom: "16px", color: "var(--mrd-sageDeep)" }}>✓ Tout est disponible dans votre inventaire.</div>`
            : null}
          ${!isManual && allAlreadyListed
            ? html`<div className="mini" style=${{ marginBottom: "16px", color: "var(--mrd-sageDeep)" }}>✓ Tout ce qui manque attend déjà dans ta liste de courses.</div>`
            : null}
          ${hasIngredients ? html`
            <div className="miniTitle" style=${{ marginBottom: "6px" }}>${isManual ? "Ingrédients" : "Manquants"}</div>
            <div className="settings-stack" style=${{ gap: "6px", marginBottom: "14px" }}>
              ${missingModal.items.map((item) => {
                const listed = isAlreadyListed(item, shoppingItems);
                return html`
                  <label key=${item.id} className="sitem" style=${{ justifyContent: "space-between", padding: "8px 10px", marginBottom: "0" }}>
                    <div className="help" style=${{ gap: "10px" }}>
                      <input type="checkbox" checked=${missingModal.selectedIds.includes(item.id)} onChange=${() => toggleMissingIngredient(item.id)}/>
                      <span>${item.name}</span>
                      ${listed ? html`<span className="mrd-listed-tag">✓ déjà demandé</span>` : null}
                      ${item.takenBy?.length ? html`<span className="mrd-taken-tag">déjà pris par ${item.takenBy.join(", ")}</span>` : null}
                    </div>
                    ${formatQuantityUnit(item.quantity, item.unit) ? html`<span className="mini">${formatQuantityUnit(item.quantity, item.unit)}</span>` : null}
                  </label>
                `;
              })}
            </div>
          ` : null}
          ${condimentItems.length ? html`
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

  return html`
    <section className="mrd-week">

      ${/* Le titre « Repas » vient d'ici et non du shell, pour rester au-dessus
           du sélecteur de semaine sans que le shell ait à connaître l'offset.
           Classe partagée = rendu identique aux autres onglets. */null}
      <div className="mrd-week-hdr">
        <span className="mrd-screen-hdr-title">Repas</span>
      </div>

      <div className="mrd-week-nav">
        <button type="button" className="mrd-week-arrow" aria-label="Semaine précédente" onClick=${() => setWeekOffset((n) => n - 1)}>‹</button>
        <span className="mrd-week-title">
          <span className="mrd-week-range">${weekRange}</span>
          <span className="mrd-week-kicker">${weekKicker}</span>
        </span>
        <button type="button" className="mrd-week-arrow" aria-label="Semaine suivante" onClick=${() => setWeekOffset((n) => n + 1)}>›</button>
      </div>

      <div className="mrd-week-progress">
        <span className="mrd-week-track" aria-hidden="true">
          <span className="mrd-week-track-fill" style=${{ width: `${Math.round((filledCount / slotList.length) * 100)}%` }}></span>
        </span>
        <span className="mrd-week-ratio">${filledCount} / ${slotList.length}</span>
        <button
          type="button"
          className=${`mrd-week-pill${linkMealsToInventory ? " on" : ""}`}
          aria-pressed=${linkMealsToInventory ? "true" : "false"}
          onClick=${() => onToggleLinkMealsToInventory?.(!linkMealsToInventory)}
        >${linkMealsToInventory ? "🔗 Inventaire" : "Lier stock"}</button>
        <button
          type="button"
          className=${`mrd-week-pill mrd-week-pill--fill${fillOpen ? " on" : ""}`}
          onClick=${() => setFillOpen((open) => !open)}
        >✨ Remplir</button>
      </div>

      <div className="mrd-week-heads" aria-hidden="true">
        <span></span>
        <span>☀️ Midi</span>
        <span>🌙 Soir</span>
      </div>

      <div className="mrd-week-grid">
        ${DAYS.map((day, dayIndex) => {
          const date = weekDates[dayIndex];
          const dateKey = dateToKey(date);
          const isToday = dateKey === todayKey;
          const isPast = dateKey < todayKey;
          return html`
            <div className="mrd-week-row" key=${day}>
              <div className=${`mrd-week-rail${isToday ? " today" : ""}${isPast ? " past" : ""}`}>
                <span className="mrd-week-rail-abbr">${DAY_ABBR[dayIndex]}</span>
                <span className="mrd-week-rail-num">${date.getDate()}</span>
              </div>
              ${SLOTS.map((slot) => renderCell(dayIndex, slot))}
            </div>
          `;
        })}
      </div>

      <div className="mrd-week-spacer"></div>

      ${fillOpen ? renderFillSheet() : renderDetailPanel()}

      ${viewModal ? html`<${RecipeSheet}
        key=${viewModal.id}
        recipe=${viewModal}
        variant="modal"
        initialServings=${effectiveServings}
        onClose=${() => setViewModal(null)}
      />` : null}
      ${renderMissingModal()}
      ${renderFillReport()}
    </section>
  `;
}

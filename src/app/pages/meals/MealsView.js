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
import { DAYS } from "../../config/constants.js";
import { html, useEffect, useMemo, useState } from "../../lib.js";
import { getCurrentAppDate } from "../../utils/date.js";
import { createMealShell } from "../../utils/state.js";
import { formatQuantityUnit } from "../../utils/productUtils.js";
import { DEFAULT_FILL_COURSES, buildFillPlan } from "../../utils/mealFill.js";
import { MONTH_NAMES } from "../../utils/recipeFilters.js";
import { readMealFillPrefs, storeMealFillPrefs } from "../../utils/storage.js";
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
import { MrdModal } from "../../components/MrdModal.js";

const DAY_ABBR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SLOTS = ["lunch", "dinner"];
const SLOT_LABELS = { lunch: "Déjeuner", dinner: "Dîner" };
const SLOT_SHORT = { lunch: "midi", dinner: "soir" };

/* Feuille « Remplir » : une décision par ligne, chaque ligne étiquetée à
   gauche. Le tout doit tenir dans le panneau bas sans défilement — c'est ce qui
   dicte les tailles serrées des contrôles et la longueur des libellés. */

/** Régimes — mêmes ids que le champ régime des recettes (`RecipeLibrary.js`). */
const FILL_DIETS = [
  { id: "omnivore",    label: "Omnivore", icon: "🍖" },
  { id: "vegetarian",  label: "Végé",     icon: "🥕" },
  { id: "vegan",       label: "Végan",    icon: "🌱" },
  { id: "pescetarian", label: "Pescé",    icon: "🐟" },
];

/** Services — mêmes ids que les catégories de recettes (`CategoryIcons.js`). */
const FILL_COURSES = [
  { id: "starter", label: "Entrée" },
  { id: "main",    label: "Plat" },
  { id: "dessert", label: "Dessert" },
];

const FILL_PREFS = [
  { id: "quick",  label: "Rapide", icon: "⚡" },
  { id: "season", label: "Saison", icon: "🍂" },
  { id: "stock",  label: "Stock",  icon: "🥫" },
];

/** Règles alimentaires — mêmes ids que les contraintes des recettes. */
const FILL_RESTRICTIONS = [
  { id: "gluten_free",  label: "Sans gluten" },
  { id: "lactose_free", label: "Sans lactose" },
  { id: "egg_free",     label: "Sans œufs" },
  { id: "nut_free",     label: "Sans fruits à coque" },
  { id: "pork_free",    label: "Sans porc" },
  { id: "halal",        label: "Halal" },
  { id: "kosher",       label: "Casher" },
];

const FILL_SCOPES = [
  { id: "empty", label: "Cases vides" },
  { id: "all",   label: "Toute la semaine" },
];

/* « De saison » est coché d'office : sans lui, une semaine d'août se remplit de
   gratins d'hiver et il faut décocher pour comprendre pourquoi. */
const DEFAULT_FILL = {
  diet: "omnivore",
  courses: DEFAULT_FILL_COURSES,
  constraints: [],
  quick: false,
  season: true,
  stock: false,
  scope: "empty",
};

/** Le champ de `onUpdateMeal` qui porte chaque service. */
const ROLE_VALUE_KEYS = {
  starter: "starterRecipeId",
  main: "recipeId",
  dessert: "dessertRecipeId",
};

/* « Planifier cette recette » (RecipeLibrary) : le service pré-sélectionné
   suit la catégorie de la recette quand elle correspond à un service du
   repas (entrée/dessert) ; les autres catégories (boisson, base maison...)
   n'ont pas de service dédié et retombent sur « Plat ». */
function defaultPlanRole(recipe) {
  const category = recipe?.category;
  return category === "starter" || category === "dessert" ? category : "main";
}

const PLAN_ROLE_PHRASE = { starter: "en entrée", main: "en plat", dessert: "en dessert" };

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

/* ── Hauteur de la feuille « Semaine remplie » (handoff 17c) ────────────
   Même raison que la feuille source des recettes (RecipesView.js) : `ion-modal`
   fige `initialBreakpoint` en fraction d'écran, pas en pixels. Le contenu
   varie avec le tirage — jusqu'à 3 lignes de manquants visibles (le reste
   défile dans sa carte), phrase d'exception présente ou non, pied réduit à
   la seule sortie quand rien ne manque — d'où un calcul plutôt qu'une
   constante unique. */
function fillReportSheetHeight(report) {
  if (!report) return 420;
  const missingCount = report.missingCount || 0;
  const rows = Math.min(3, report.missingItems?.length || 0);
  const hasNote = Boolean(report.alreadyListedCount) || Boolean((report.emptyCourses || []).length);
  // 86, pas 70 : la ligne-hauteur par défaut de Cormorant Garamond sur le
  // chiffre 24px dépasse largement 1.2, mesuré dans le navigateur — un
  // premier calcul à 70 laissait un vide sous « Voir la semaine ».
  const blocks = [44, 86]; // en-tête (vignette) · rangée des trois chiffres
  if (missingCount > 0) blocks.push(14, rows ? rows * 44 + 4 : 44); // titre de section + liste
  if (hasNote) blocks.push(33);
  if (missingCount > 0) blocks.push(46); // bouton plein
  blocks.push(42); // sortie en texte nu
  const gaps = (blocks.length - 1) * 12;
  return blocks.reduce((sum, h) => sum + h, 0) + gaps + 16 + 8; // padding haut + bas
}

/* ── Hauteur de la feuille « ce qui manque » (handoff 20a) ──────────────
   Même logique que `fillReportSheetHeight` ci-dessus : le contenu varie avec
   la recette (nombre d'ingrédients manquants, condiments ou non) et avec
   l'état (rien ne manque → une seule ligne + un bouton). */
function missingSheetHeight(modal, shoppingItems) {
  if (!modal) return 420;
  const isManual = modal.mode === "manual";
  const condimentItems = modal.condimentItems || [];
  const hasIngredients = modal.items.length > 0;
  const nothingMissing = !isManual && !hasIngredients && !condimentItems.length;

  const blocks = [4, 46]; // poignée + en-tête
  if (nothingMissing) {
    blocks.push(44, 42); // ligne de compte (sauge) + bouton « Fermer » seul
  } else {
    blocks.push(44); // ligne de compte
    // Carte de la liste : au-delà de 6 lignes (300px), elle défile plutôt que
    // de pousser la feuille plus haut que l'écran.
    if (hasIngredients) blocks.push(Math.min(6, modal.items.length) * 50);
    if (condimentItems.length) {
      const rows = Math.ceil(condimentItems.length / 3);
      blocks.push(16 + rows * 34 + (rows - 1) * 7);
    }
    blocks.push(100); // les deux boutons d'action
  }
  const gaps = (blocks.length - 1) * 14;
  return blocks.reduce((sum, h) => sum + h, 0) + gaps + 32; // padding haut (12) + bas (20)
}

/* `env(safe-area-inset-bottom)` n'est pas lisible depuis JS : le padding bas
   de la feuille l'inclut, donc sa hauteur grandit d'autant sur les écrans à
   indicateur d'accueil. Une sonde d'un élément le rend mesurable. */
function safeAreaBottom() {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:-9999px;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);
  const inset = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(inset) ? inset : 0;
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
  onEditRecipe,
  onDeleteRecipe,
  onToggleRecipeFavorite,
  pendingPlanRecipe = null,
  onConsumePendingPlanRecipe,
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
  const [fill, setFill] = useState(() => readMealFillPrefs(DEFAULT_FILL));
  const [fillAvoidOpen, setFillAvoidOpen] = useState(false);
  // Ce que le dernier tirage a posé : « Vider » n'efface que ça, jamais un
  // repas choisi à la main. Le planning ne garde aucune trace de provenance,
  // c'est donc à la vue de la tenir — le temps de la session et de la semaine.
  const [fillTrace, setFillTrace] = useState({ weekKey: "", entries: [] });
  const [picker, setPicker] = useState(null); // { dayIndex, slot, role }
  // Sélecteur jour/repas ouvert depuis « Planifier cette recette » : la
  // recette est déjà choisie, il ne reste qu'à choisir le créneau.
  const [planPick, setPlanPick] = useState(null); // { recipe, dayIndex, slot }
  // Le bandeau « stock déjà pris » se ferme sans redevenir permanent : on ne
  // retient que la signature de la dernière alerte fermée, pas un simple
  // booléen — sinon changer de créneau avec un nouveau conflit resterait
  // muet après une première fermeture.
  const [dismissedTakenKey, setDismissedTakenKey] = useState("");
  const [viewModal, setViewModal] = useState(null);
  const [missingModal, setMissingModal] = useState(null);
  const [fillReport, setFillReport] = useState(null);
  /* Recalculée à chaque tirage : le contenu change avec le rapport, la
     hauteur d'écran avec la rotation et la barre d'adresse mobile. */
  const fillReportBreakpoint = useMemo(() => {
    if (!fillReport) return 0.5;
    const viewport = window.innerHeight || 812;
    const wanted = (fillReportSheetHeight(fillReport) + safeAreaBottom()) / viewport;
    return Math.min(0.9, Math.max(0.25, Math.round(wanted * 1000) / 1000));
  }, [fillReport]);
  /* Recalculée à chaque ouverture : le contenu change avec la recette posée,
     la hauteur d'écran avec la rotation et la barre d'adresse mobile. */
  const missingSheetBreakpoint = useMemo(() => {
    if (!missingModal) return 0.5;
    const viewport = window.innerHeight || 812;
    const wanted = (missingSheetHeight(missingModal, shoppingItems) + safeAreaBottom()) / viewport;
    return Math.min(0.92, Math.max(0.25, Math.round(wanted * 1000) / 1000));
  }, [missingModal, shoppingItems]);

  const todayMonday = computeMonday(today);
  const targetMonday = addDays(todayMonday, weekOffset * 7);
  const targetWeekKey = dateToKey(targetMonday);
  const isCurrentWeek = weekOffset === 0;
  const weekDates = DAYS.map((_, index) => addDays(targetMonday, index));
  const todayIdx = (() => { const dow = today.getDay(); return dow === 0 ? 6 : dow - 1; })();
  const todayKey = dateToKey(today);
  // Le créneau réel affiché en surtitre de la popup « ce qui manque » — figé
  // à l'ouverture, pas relu depuis `missingModal` : si la semaine affichée
  // change pendant que la feuille est ouverte, le libellé ne doit pas bouger
  // sous l'utilisateur.
  function slotLabelOf(dayIndex, slot) {
    return `${DAYS[dayIndex]} ${weekDates[dayIndex].getDate()} · ${SLOT_LABELS[slot]}`;
  }

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

  // Arrivée depuis « Planifier cette recette » (onglet Recettes) : le
  // sélecteur jour/repas s'ouvre directement, préréglé sur le créneau
  // actuellement affiché.
  useEffect(() => {
    if (!pendingPlanRecipe) return;
    setPicker(null);
    closeFill();
    setPlanPick({
      recipe: pendingPlanRecipe,
      dayIndex: selected.dayIndex,
      slot: selected.slot,
      role: defaultPlanRole(pendingPlanRecipe),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlanRecipe]);

  // La façon de manger ne change pas d'une semaine à l'autre : on la retient.
  useEffect(() => { storeMealFillPrefs(fill); }, [fill]);

  /* ── Actions ── */

  function openPicker(dayIndex, slot, role = "main") {
    setSelected({ dayIndex, slot });
    closeFill();
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
      category: recipe.category,
      slotLabel: slotLabelOf(dayIndex, slot),
      mode: "inventory",
      items: missing,
      condimentItems: missingCondiments,
      totalCount: (Array.isArray(recipe.ingredients) ? recipe.ingredients : []).filter((item) => item?.name).length,
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

  function closeFill() {
    setFillOpen(false);
    setFillAvoidOpen(false);
  }

  function fillPlanFor(filters) {
    return buildFillPlan({
      recipes: safeRecipes,
      slots: slotList.map(({ dayIndex, slot, recipeId, text, starter, dessert, cooked }) => ({
        dayIndex,
        slot,
        recipeId,
        text,
        starterRecipeId: starter?.id || "",
        dessertRecipeId: dessert?.id || "",
        cooked,
      })),
      filters,
      currentMonth,
      stockByRecipeId,
      inventory,
    });
  }

  /** Un seul `onUpdateMeal` par créneau : trois services, un seul écrit. */
  function writeRoles(entries) {
    const bySlot = new Map();
    entries.forEach((entry) => {
      const key = slotKeyOf(entry.dayIndex, entry.slot);
      const patch = bySlot.get(key) || { dayIndex: entry.dayIndex, slot: entry.slot, values: {} };
      patch.values[ROLE_VALUE_KEYS[entry.role] || "recipeId"] = entry.recipeId;
      bySlot.set(key, patch);
    });
    bySlot.forEach(({ dayIndex, slot, values }) => {
      const target = readSlot(dayIndex, slot);
      onUpdateMeal(target.day, target.slot, values, target.weekKey);
    });
  }

  /** Ce que le tirage a posé sur la semaine affichée, et qui peut être repris. */
  const clearableEntries = fillTrace.weekKey === targetWeekKey ? fillTrace.entries : [];

  /** « Vider » : on retire ce que le tirage a mis, pas ce que l'utilisateur a choisi. */
  function clearFilledMeals() {
    writeRoles(clearableEntries.map((entry) => ({ ...entry, recipeId: "" })));
    setFillTrace({ weekKey: "", entries: [] });
    closeFill();
  }

  function runFill() {
    const plan = fillPlanFor(fill);
    writeRoles(plan.entries);
    closeFill();
    if (!plan.entries.length) return;

    // Ce tirage remplace le précédent : « Vider » ne doit reprendre que ce qui
    // est effectivement à l'écran.
    setFillTrace({
      weekKey: targetWeekKey,
      entries: plan.entries.map(({ dayIndex, slot, role }) => ({ dayIndex, slot, role })),
    });

    /* Ce qu'il faudra acheter pour cuisiner la semaine qu'on vient de tirer,
       sans ce qui attend déjà sur la liste. Le compte se fait sur la semaine
       entière : deux repas tirés qui veulent le même produit en demandent deux
       fois la quantité, alors que le calcul recette par recette n'en voyait
       qu'un. Les doublons restants sont laissés tels quels — la liste fusionne
       les articles proches et additionne les quantités. */
    const planKeys = new Set(plan.entries.map((entry) => slotKeyOf(entry.dayIndex, entry.slot)));
    const planStock = linkMealsToInventory
      ? computeWeekStock({ slots: buildWeekSlots(plan.entries), inventory })
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
      // Le bilan compte des repas, pas des recettes : un créneau entrée + plat
      // + dessert reste un repas.
      total: plan.slotCount,
      courseCount: plan.entries.length,
      emptyCourses: plan.emptyCourses,
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
    const slotLabel = slotLabelOf(selected.dayIndex, selected.slot);
    if (!linkMealsToInventory) {
      // Sans liaison : pas de comparaison au stock, on propose la liste complète.
      const items = Array.isArray(scaled.ingredients) ? scaled.ingredients.filter((item) => item?.name) : [];
      if (!items.length) return;
      setMissingModal({
        recipeName: scaled.name,
        category: scaled.category,
        slotLabel,
        mode: "manual",
        items,
        condimentItems: [],
        servings: effectiveServings,
        selectedIds: [],
        selectedCondiments: [],
      });
      return;
    }
    // La même liste que le bouton : sinon il annonce « Courses · 1 » et la
    // popup répond que tout est disponible.
    const missing = missingForCurrent;
    const missingCondiments = computeMissingCondiments(scaled, inventory);
    setMissingModal({
      recipeName: scaled.name,
      category: scaled.category,
      slotLabel,
      mode: "inventory",
      items: missing,
      condimentItems: missingCondiments,
      totalCount: (Array.isArray(scaled.ingredients) ? scaled.ingredients : []).filter((item) => item?.name).length,
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
        weekSlots=${buildWeekSlots()}
        targetSlotKey=${slotKeyOf(picker.dayIndex, picker.slot)}
        onRemove=${() => applyPick("")}
        onCancel=${() => setPicker(null)}
        onSelect=${applyPick}
      />
    `;
  }

  /* ── Sélecteur jour/repas : la recette est déjà choisie ── */

  if (planPick) {
    const recipe = planPick.recipe;
    const chosenDate = weekDates[planPick.dayIndex];

    const cancelPlanPick = () => {
      setPlanPick(null);
      onConsumePendingPlanRecipe?.();
    };

    const planRoleKey = ROLE_VALUE_KEYS[planPick.role] || "recipeId";

    const confirmPlanPick = () => {
      const target = readSlot(planPick.dayIndex, planPick.slot);
      onUpdateMeal(target.day, target.slot, { [planRoleKey]: recipe.id }, target.weekKey);
      checkInventoryAfterPick(recipe, planPick.dayIndex, planPick.slot, planPick.role);
      setSelected({ dayIndex: planPick.dayIndex, slot: planPick.slot });
      setPlanPick(null);
      onConsumePendingPlanRecipe?.();
    };

    // Ce que le créneau choisi porte déjà pour chaque service — permet de
    // voir, avant de valider, si « Planifier » va remplacer un plat déjà posé.
    const targetEntry = readSlot(planPick.dayIndex, planPick.slot);
    const planRoles = [
      { id: "starter", label: "Entrée", recipe: targetEntry.starter, text: "" },
      { id: "main", label: "Plat", recipe: targetEntry.recipe, text: targetEntry.text },
      { id: "dessert", label: "Dessert", recipe: targetEntry.dessert, text: "" },
    ];

    const renderPlanCell = (dayIndex, slot) => {
      const entry = readSlot(dayIndex, slot);
      const date = weekDates[dayIndex];
      const isPast = dateToKey(date) < todayKey;
      const isOn = planPick.dayIndex === dayIndex && planPick.slot === slot;
      // Le contenu affiché suit le service en cours de choix : planifier un
      // dessert doit montrer ce qui est déjà en dessert sur chaque créneau,
      // pas le plat principal.
      const roleRecipe = planPick.role === "starter" ? entry.starter
        : planPick.role === "dessert" ? entry.dessert
        : entry.recipe;
      const roleText = planPick.role === "main" ? entry.text : "";
      const hasContent = Boolean(roleRecipe || roleText);
      const name = roleRecipe?.name || roleText || "Libre";
      return html`
        <button
          type="button"
          key=${`${dayIndex}-${slot}`}
          className=${`mrd-week-cell${hasContent ? "" : " is-empty"}${isOn ? " on" : ""}${isPast ? " past" : ""}`}
          aria-pressed=${isOn ? "true" : "false"}
          aria-label=${`${DAYS[dayIndex]} ${SLOT_LABELS[slot].toLowerCase()} : ${hasContent ? name : "libre"}`}
          onClick=${() => setPlanPick((prev) => prev && ({ ...prev, dayIndex, slot }))}
        >
          <span className="mrd-week-cell-bar" aria-hidden="true"></span>
          <span className=${`mrd-week-cell-icon ${categoryToneClass(roleRecipe?.category)}`} aria-hidden="true">
            ${roleRecipe
              ? html`<${CategoryIcon} categoryId=${roleRecipe.category} size=${15} framed=${false} />`
              : html`<span className="mrd-week-cell-plus">+</span>`}
          </span>
          <span className="mrd-week-cell-name">${name}</span>
        </button>
      `;
    };

    return html`
      <section className="mpick">
        <div className="mpick-hdr">
          <button type="button" className="mpick-back" onClick=${cancelPlanPick} aria-label="Annuler">‹</button>
          <span className="mpick-title">Planifier</span>
        </div>

        <div className="mrd-week-panel">
          <div className="mrd-week-panel-hdr">
            <span className=${`mrd-week-panel-thumb ${categoryToneClass(recipe.category)}`} aria-hidden="true">
              <${CategoryIcon} categoryId=${recipe.category} size=${26} framed=${false} />
            </span>
            <span className="mrd-week-panel-titles">
              <span className="mrd-week-panel-kicker">Recette choisie</span>
              <span className="mrd-week-panel-title">${recipe.name || "Sans titre"}</span>
            </span>
          </div>
          <div className="mrd-week-panel-body">
            <div className="mrd-week-panel-rows">
              ${planRoles.map((role) => html`
                <button type="button" key=${role.id}
                  className=${`mrd-week-panel-row${planPick.role === role.id ? " on" : ""}`}
                  aria-pressed=${planPick.role === role.id ? "true" : "false"}
                  onClick=${() => setPlanPick((prev) => prev && ({ ...prev, role: role.id }))}>
                  <span className="mrd-week-panel-role">${role.label}</span>
                  <span className=${`mrd-week-panel-name${role.recipe || role.text ? "" : " is-empty"}`}>${role.recipe?.name || role.text || "Libre"}</span>
                  <span className="mrd-week-panel-cue" aria-hidden="true">${planPick.role === role.id ? "✓" : ""}</span>
                </button>
              `)}
            </div>
          </div>
        </div>

        <div className="mrd-week-nav">
          <button type="button" className="mrd-week-arrow" aria-label="Semaine précédente" onClick=${() => setWeekOffset((n) => n - 1)}>‹</button>
          <span className="mrd-week-title">
            <span className="mrd-week-range">${weekRange}</span>
            <span className="mrd-week-kicker">${weekKicker}</span>
          </span>
          <button type="button" className="mrd-week-arrow" aria-label="Semaine suivante" onClick=${() => setWeekOffset((n) => n + 1)}>›</button>
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
                ${SLOTS.map((slot) => renderPlanCell(dayIndex, slot))}
              </div>
            `;
          })}
        </div>

        <div className="mpick-foot">
          <button type="button" className="mpick-cta on" onClick=${confirmPlanPick}>
            Ajouter ${PLAN_ROLE_PHRASE[planPick.role] || "en plat"} à ${DAY_ABBR[planPick.dayIndex]} ${chosenDate.getDate()} · ${SLOT_LABELS[planPick.slot]}
          </button>
        </div>
      </section>
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
    // Signature de cette alerte précise : changer de créneau, ou revenir sur
    // celui-ci avec un stock différent, doit la faire réapparaître même si la
    // précédente a été fermée.
    const takenKey = takenNames.length
      ? `${selected.dayIndex}-${selected.slot}-${takenNames.join("|")}-${takenSlots.join("|")}`
      : "";
    const showTaken = takenKey && takenKey !== dismissedTakenKey;

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

        ${showTaken ? html`
          <div className="mrd-week-taken" role="status">
            <span className="mrd-week-taken-dot" aria-hidden="true"></span>
            <span className="mrd-week-taken-copy">
              <strong>${takenNames.join(", ")}</strong> : ton stock part déjà dans
              ${takenSlots.length ? html` ${takenSlots.join(", ")}` : html` un autre repas`}.
              Il en faut une deuxième fois.
            </span>
            <button type="button" className="mrd-week-taken-close" aria-label="Fermer"
              onClick=${() => setDismissedTakenKey(takenKey)}>✕</button>
          </div>
        ` : null}
      </div>
    `;
  }

  /**
   * Feuille « Remplir la semaine » : une décision par ligne — régime, services,
   * filtres, règles, portée — puis un seul bouton qui tire dans les recettes.
   * Elle remplace le panneau de détail : les deux ne coexistent jamais.
   */
  function renderFillSheet() {
    const plan = fillPlanFor(fill);
    // Le compteur annonce des repas, pas des recettes : cocher entrée + plat +
    // dessert ne triple pas le nombre de créneaux touchés.
    const targetCount = plan.slotCount;
    // Le filtre stock n'a de sens que si l'inventaire est lié — sinon aucune
    // recette n'est « faisable » et la puce ne ferait rien.
    const prefs = FILL_PREFS.filter((pref) => pref.id !== "stock" || linkMealsToInventory);
    const restrictionSummary = fill.constraints.length
      ? FILL_RESTRICTIONS
          .filter((item) => fill.constraints.includes(item.id))
          .map((item) => item.label.toLowerCase())
          .join(", ")
      : "Aucune règle";

    const toggleCourse = (id) => setFill((prev) => {
      const next = { ...prev.courses, [id]: !prev.courses[id] };
      // On ne peut pas tout décocher : sans service, le bouton n'aurait rien à
      // poser. Le plat reprend la main.
      if (!next.starter && !next.main && !next.dessert) next.main = true;
      return { ...prev, courses: next };
    });

    const toggleRestriction = (id) => setFill((prev) => ({
      ...prev,
      constraints: prev.constraints.includes(id)
        ? prev.constraints.filter((entry) => entry !== id)
        : [...prev.constraints, id],
    }));

    return html`
      <div className="mrd-week-panel mrd-week-panel--fill">
        <div className="mrd-week-fill-hdr">
          <span className="mrd-week-fill-title">Remplir la semaine</span>
          <span className="mrd-week-fill-hdr-btns">
            <button type="button" className="mrd-week-fill-reset"
              disabled=${!clearableEntries.length} onClick=${clearFilledMeals}>Vider</button>
            <button type="button" className="mrd-week-fill-close" onClick=${closeFill} aria-label="Fermer">✕</button>
          </span>
        </div>

        <div className="mrd-fill-body">
          <div className="mrd-fill-row">
            <span className="mrd-fill-label">Régime</span>
            <span className="mrd-fill-seg">
              ${FILL_DIETS.map((diet) => html`
                <button type="button" key=${diet.id}
                  className=${`mrd-fill-seg-btn${fill.diet === diet.id ? " on" : ""}`}
                  aria-pressed=${fill.diet === diet.id ? "true" : "false"}
                  onClick=${() => setFill((prev) => ({ ...prev, diet: diet.id }))}>
                  <span aria-hidden="true">${diet.icon}</span>${diet.label}
                </button>
              `)}
            </span>
          </div>

          <div className="mrd-fill-row">
            <span className="mrd-fill-label">Services</span>
            <span className="mrd-fill-chips">
              ${FILL_COURSES.map((course) => html`
                <button type="button" key=${course.id}
                  className=${`mrd-fill-chip${fill.courses[course.id] ? " on" : ""}`}
                  aria-pressed=${fill.courses[course.id] ? "true" : "false"}
                  onClick=${() => toggleCourse(course.id)}>
                  ${course.label}
                </button>
              `)}
            </span>
          </div>

          <div className="mrd-fill-row">
            <span className="mrd-fill-label">Filtres</span>
            <span className="mrd-fill-chips">
              ${prefs.map((pref) => html`
                <button type="button" key=${pref.id}
                  className=${`mrd-fill-chip${fill[pref.id] ? " on" : ""}`}
                  aria-pressed=${fill[pref.id] ? "true" : "false"}
                  onClick=${() => setFill((prev) => ({ ...prev, [pref.id]: !prev[pref.id] }))}>
                  <span className="mrd-fill-chip-lbl"><span aria-hidden="true">${pref.icon}</span> ${pref.label}</span>
                </button>
              `)}
            </span>
          </div>

          <div className="mrd-fill-row">
            <span className="mrd-fill-label">Règles</span>
            <span className="mrd-fill-avoid">
              <button type="button" className="mrd-fill-avoid-btn"
                aria-expanded=${fillAvoidOpen ? "true" : "false"}
                onClick=${() => setFillAvoidOpen((open) => !open)}>
                <span className="mrd-fill-avoid-summary">${restrictionSummary}</span>
                <span className="mrd-fill-avoid-chevron" aria-hidden="true">${fillAvoidOpen ? "⌃" : "⌄"}</span>
              </button>
              ${/* Le menu s'ouvre vers le haut : la feuille est déjà en bas de l'écran. */null}
              ${fillAvoidOpen ? html`
                <div className="mrd-fill-menu">
                  <div className="mrd-fill-menu-list">
                    ${FILL_RESTRICTIONS.map((item) => {
                      const on = fill.constraints.includes(item.id);
                      return html`
                        <button type="button" key=${item.id}
                          className=${`mrd-fill-menu-row${on ? " on" : ""}`}
                          aria-pressed=${on ? "true" : "false"}
                          onClick=${() => toggleRestriction(item.id)}>
                          <span className="mrd-fill-menu-box" aria-hidden="true">${on ? "✓" : ""}</span>
                          <span className="mrd-fill-menu-lbl">${item.label}</span>
                        </button>
                      `;
                    })}
                  </div>
                  <div className="mrd-fill-menu-foot">
                    <span className="mrd-fill-menu-count">
                      ${fill.constraints.length ? `${fill.constraints.length} sélectionnées` : ""}
                    </span>
                    <span className="mrd-fill-menu-acts">
                      <button type="button" className="mrd-fill-menu-clear"
                        onClick=${() => setFill((prev) => ({ ...prev, constraints: [] }))}>Tout décocher</button>
                      <button type="button" className="mrd-fill-menu-ok"
                        onClick=${() => setFillAvoidOpen(false)}>OK</button>
                    </span>
                  </div>
                </div>
              ` : null}
            </span>
          </div>

          <div className="mrd-fill-run">
            <span className="mrd-fill-seg mrd-fill-seg--scope">
              ${FILL_SCOPES.map((scope) => html`
                <button type="button" key=${scope.id}
                  className=${`mrd-fill-seg-btn${fill.scope === scope.id ? " on" : ""}`}
                  aria-pressed=${fill.scope === scope.id ? "true" : "false"}
                  onClick=${() => setFill((prev) => ({ ...prev, scope: scope.id }))}>
                  ${scope.label}
                </button>
              `)}
            </span>
            <button type="button" className="mrd-fill-cta" disabled=${!targetCount} onClick=${runFill}>
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
    const { total, stockCount, missingItems, missingCount, alreadyListedCount, emptyCourses } = fillReport;
    // Un service coché dont aucune recette ne passe les filtres reste vide :
    // le dire, sinon la case « Dessert » a l'air de ne rien faire.
    const missingCourseLabels = (emptyCourses || [])
      .map((id) => FILL_COURSES.find((course) => course.id === id)?.label.toLowerCase())
      .filter(Boolean);

    const noteParts = [];
    if (alreadyListedCount) {
      noteParts.push(alreadyListedCount > 1
        ? `${alreadyListedCount} ingrédients sont déjà sur la liste de courses.`
        : `Un ingrédient est déjà sur la liste de courses.`);
    }
    if (missingCourseLabels.length) {
      const plural = missingCourseLabels.length > 1;
      noteParts.push(`Aucune recette de ${missingCourseLabels.join(", ")} ne passait tes filtres : service${plural ? "s" : ""} resté${plural ? "s" : ""} vide${plural ? "s" : ""}.`);
    }

    const addLabel = missingCount === 1
      ? "Ajouter l'élément à la liste"
      : `Ajouter les ${missingCount} éléments à la liste`;

    return html`
      <${MrdModal}
        isOpen=${true}
        onClose=${() => setFillReport(null)}
        sheet=${true}
        sheetBreakpoint=${fillReportBreakpoint}
        className="mrd-fillsheet-modal"
      >
        <div className="mrd-fillsheet">
          <div className="mrd-fillsheet-head">
            <span className="mrd-fillsheet-icon" aria-hidden="true">🍽️</span>
            <span className="mrd-fillsheet-head-copy">
              <span className="mrd-fillsheet-kicker">${weekRange}</span>
              <span className="mrd-fillsheet-title">Semaine remplie</span>
            </span>
            <button type="button" className="mrd-fillsheet-close" onClick=${() => setFillReport(null)} aria-label="Fermer">✕</button>
          </div>

          <div className="mrd-fillsheet-stats">
            <span className="mrd-fillsheet-stat">
              <span className="mrd-fillsheet-stat-num">${total}</span>
              <span className="mrd-fillsheet-stat-label">repas</span>
            </span>
            <span className="mrd-fillsheet-stat">
              <span className="mrd-fillsheet-stat-num">${stockCount}</span>
              <span className="mrd-fillsheet-stat-label">déjà en stock</span>
            </span>
            <span className="mrd-fillsheet-stat">
              <span className="mrd-fillsheet-stat-num">${missingCount}</span>
              <span className="mrd-fillsheet-stat-label">à acheter</span>
            </span>
          </div>

          ${missingCount ? html`
            <span className="mrd-fillsheet-section-title">Ingrédients manquants</span>
            <div className="mrd-fillsheet-list">
              ${missingItems.map((item) => {
                const qty = formatQuantityUnit(item.quantity, item.unit);
                return html`
                  <span className="mrd-fillsheet-row" key=${item.id || item.name}>
                    <span className="mrd-fillsheet-row-name">${item.name}</span>
                    ${qty ? html`<span className="mrd-fillsheet-row-qty">${qty}</span>` : null}
                  </span>
                `;
              })}
            </div>
          ` : null}

          ${noteParts.length ? html`<span className="mrd-fillsheet-note">${noteParts.join(" ")}</span>` : null}

          ${missingCount ? html`
            <button type="button" className="mrd-fillsheet-cta" onClick=${addFillMissingToShopping}>${addLabel}</button>
          ` : null}
          <button type="button" className="mrd-fillsheet-exit" onClick=${() => setFillReport(null)}>Voir la semaine</button>
        </div>
      <//>
    `;
  }

  /**
   * Popup « ce qui manque » (handoff 20a) : feuille basse déclenchée juste
   * après avoir posé une recette (`checkInventoryAfterPick`) ou depuis le
   * bouton Courses du panneau de détail (`openShopping`). Dit le créneau réel
   * et le compte, une seule liste cochable, les motifs (« déjà pris par… »,
   * « déjà sur ta liste ») sous le nom plutôt qu'en pastille de bout de ligne.
   */
  function renderMissingModal() {
    if (!missingModal) return null;
    const isManual = missingModal.mode === "manual";
    const condimentItems = missingModal.condimentItems || [];
    const hasIngredients = missingModal.items.length > 0;
    const nothingMissing = !isManual && !hasIngredients && !condimentItems.length;
    const closeModal = () => setMissingModal(null);
    const iconTone = categoryToneClass(missingModal.category);
    const head = html`
      <div className="mrd-miss-head">
        <span className=${`mrd-miss-icon ${iconTone}`} aria-hidden="true">
          <${CategoryIcon} categoryId=${missingModal.category} size=${21} framed=${false} />
        </span>
        <span className="mrd-miss-head-copy">
          <span className="mrd-miss-kicker">${missingModal.slotLabel}</span>
          <span className="mrd-miss-title">${missingModal.recipeName}</span>
        </span>
        <button type="button" className="mrd-miss-close" onClick=${closeModal} aria-label="Fermer">✕</button>
      </div>
    `;

    // « Rien ne manque » : uniquement atteignable depuis le bouton Courses —
    // checkInventoryAfterPick sort avant d'ouvrir la feuille dans ce cas.
    if (nothingMissing) {
      return html`
        <${MrdModal} isOpen=${true} onClose=${closeModal} sheet=${true} sheetBreakpoint=${missingSheetBreakpoint} className="mrd-miss-modal">
          <div className="mrd-miss">
            ${head}
            <div className="mrd-miss-count mrd-miss-count--ok">
              <span className="mrd-miss-count-dot" aria-hidden="true"></span>
              <span className="mrd-miss-count-text">✓ Tout est disponible dans ton inventaire.</span>
            </div>
            <div className="mrd-miss-actions">
              <button type="button" className="mrd-miss-submit" onClick=${closeModal}>Fermer</button>
            </div>
          </div>
        <//>
      `;
    }

    const split = splitAlreadyListed(missingModal.items, shoppingItems);
    const allAlreadyListed = !isManual && hasIngredients && !split.toAdd.length;
    // Ce qui reste à demander d'abord, ce qui attend déjà sur la liste ensuite.
    const orderedItems = isManual ? missingModal.items : [...split.toAdd, ...split.listed];
    const n = missingModal.selectedIds.length + (missingModal.selectedCondiments || []).length;

    const countTone = isManual ? "mrd-miss-count--neutral" : allAlreadyListed ? "mrd-miss-count--ok" : "mrd-miss-count--warn";
    const countText = isManual
      ? html`Les ${missingModal.items.length} ingrédients de la recette, à ${missingModal.servings} couvert${missingModal.servings > 1 ? "s" : ""}.`
      : allAlreadyListed
        ? "✓ Tout ce qui manque attend déjà dans ta liste de courses."
        : html`<strong>${missingModal.items.length} ingrédient${missingModal.items.length > 1 ? "s" : ""} sur ${missingModal.totalCount}</strong> ne ${missingModal.items.length > 1 ? "sont" : "est"} pas dans ton inventaire.`;

    return html`
      <${MrdModal} isOpen=${true} onClose=${closeModal} sheet=${true} sheetBreakpoint=${missingSheetBreakpoint} className="mrd-miss-modal">
        <div className="mrd-miss">
          ${head}

          <div className=${`mrd-miss-count ${countTone}`}>
            <span className="mrd-miss-count-dot" aria-hidden="true"></span>
            <span className="mrd-miss-count-text">${countText}</span>
          </div>

          ${hasIngredients ? html`
            <div className="mrd-miss-list">
              ${orderedItems.map((item) => {
                const checked = missingModal.selectedIds.includes(item.id);
                const listed = !isManual && isAlreadyListed(item, shoppingItems);
                const taken = !isManual && item.takenBy?.length;
                const qty = formatQuantityUnit(item.quantity, item.unit);
                return html`
                  <label key=${item.id} className="mrd-miss-row">
                    <input type="checkbox" className="mrd-miss-native-cb" checked=${checked} onChange=${() => toggleMissingIngredient(item.id)}/>
                    <span className=${`mrd-miss-check${checked ? " on" : ""}`} aria-hidden="true">${checked ? "✓" : ""}</span>
                    <span className="mrd-miss-row-body">
                      <span className="mrd-miss-row-name">${item.name}</span>
                      ${taken ? html`<span className="mrd-miss-row-reason mrd-miss-row-reason--warn">déjà prise par ${item.takenBy.join(", ")}</span>` : null}
                      ${listed ? html`<span className="mrd-miss-row-reason mrd-miss-row-reason--ok">✓ déjà sur ta liste</span>` : null}
                    </span>
                    ${qty ? html`<span className="mrd-miss-row-qty">${qty}</span>` : null}
                  </label>
                `;
              })}
            </div>
          ` : null}

          ${condimentItems.length ? html`
            <div className="mrd-miss-condiments">
              <span className="mrd-miss-kicker">Condiments</span>
              <div className="mrd-miss-pills">
                ${condimentItems.map((item) => {
                  const on = (missingModal.selectedCondiments || []).includes(item.id);
                  return html`
                    <button type="button" key=${item.id}
                      className=${`mrd-miss-pill${on ? " on" : ""}`}
                      aria-pressed=${on ? "true" : "false"}
                      onClick=${() => toggleMissingCondiment(item.id)}>
                      ${on ? "✓" : "＋"} ${item.name}
                    </button>
                  `;
                })}
              </div>
            </div>
          ` : null}

          <div className="mrd-miss-actions">
            <button type="button" className="mrd-miss-submit" disabled=${n === 0} onClick=${addSelectedMissingIngredients}>Ajouter ${n} article${n > 1 ? "s" : ""} à la liste</button>
            <button type="button" className="mrd-miss-later" onClick=${closeModal}>Plus tard</button>
          </div>
        </div>
      <//>
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
          aria-expanded=${fillOpen ? "true" : "false"}
          onClick=${() => (fillOpen ? closeFill() : setFillOpen(true))}
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
        inventory=${inventory}
        linkInventory=${linkMealsToInventory}
        initialServings=${effectiveServings}
        onClose=${() => setViewModal(null)}
        onEdit=${onEditRecipe ? (recipe) => onEditRecipe(recipe.id) : null}
        onDelete=${onDeleteRecipe ? (recipe) => { onDeleteRecipe(recipe.id); setViewModal(null); } : null}
        onToggleFavorite=${onToggleRecipeFavorite ? (recipe) => onToggleRecipeFavorite(recipe.id, !recipe.favorite) : null}
        onAddToShopping=${onAddMissingIngredients}
        onPlan=${(recipe) => { setViewModal(null); setPlanPick({ recipe, dayIndex: selected.dayIndex, slot: selected.slot, role: defaultPlanRole(recipe) }); }}
      />` : null}
      ${renderMissingModal()}
      ${renderFillReport()}
    </section>
  `;
}

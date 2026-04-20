import { DAYS } from "../constants.js";
import { normalizeProductName } from "./productUtils.js?v=2026-04-19-meals-stock-3";
import { getCurrentAppDate, utcDateKey, utcMonthKey, utcWeekKey } from "./date.js?v=2026-04-19-time-sim-2";

export function createMealShell(day, index) {
  return {
    id: `meal-${day}-${index}`,
    day,
    lunchText: "",
    lunchRecipeId: "",
    lunchCooked: false,
    lunchMode: "",
    dinnerText: "",
    dinnerRecipeId: "",
    dinnerCooked: false,
    dinnerMode: "",
  };
}

function normalizeTask(task, index) {
  const legacyDoneBy = Array.isArray(task.doneBy) ? task.doneBy : [];
  const legacyPriority =
    task.priority === "high" || task.priority === "urgent"
      ? "urgent"
      : task.priority === "medium" || task.priority === "important"
        ? "normal"
        : task.priority === "low" || task.priority === "normal"
          ? "normal"
          : "";
  const recurrenceFrequency =
    task.recurrenceFrequency || (task.recur === "daily" || task.recur === "weekly" || task.recur === "monthly" ? task.recur : task.type || "daily");
  const taskKind = task.taskKind || (task.recur && task.recur !== "none" ? "recurring" : "single");
  return {
    id: task.id || `task-${Date.now()}-${index}`,
    text: task.text || "Tache",
    type: task.type || "daily",
    icon: task.icon || "",
    doneBy: Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean) : task.completedByPersonId ? [task.completedByPersonId] : [],
    recur: task.recur || "none",
    priority: task.priority || legacyPriority || "normal",
    critical: Boolean(task.critical),
    overdue: Boolean(task.overdue),
    order: typeof task.order === "number" ? task.order : index,
    assignedPersonId: task.assignedPersonId || task.assigneeId || "",
    taskKind,
    recurrenceFrequency,
    recurrenceTime: task.recurrenceTime || "00:00",
    recurrenceDaysOfWeek: Array.isArray(task.recurrenceDaysOfWeek)
      ? task.recurrenceDaysOfWeek.map((value) => Number(value)).filter((value) => value >= 0 && value <= 6)
      : recurrenceFrequency === "weekly"
        ? [1]
        : [],
    recurrenceDayOfMonth: Math.max(1, Math.min(31, Number(task.recurrenceDayOfMonth) || 1)),
    completedByPersonId: task.completedByPersonId || legacyDoneBy[legacyDoneBy.length - 1] || "",
    completedAt: task.completedAt || "",
    missedCount: Number(task.missedCount) || 0,
    currentCycleKey: task.currentCycleKey || "",
    dueDate: task.dueDate || "",
    dueTime: task.dueTime || "",
  };
}

function normalizeMeal(meal, index) {
  const base = createMealShell(meal?.day || DAYS[index] || `Jour ${index + 1}`, index);
  return {
    ...base,
    ...meal,
    lunchText: meal?.lunchText || "",
    lunchRecipeId: meal?.lunchRecipeId || "",
    lunchCooked: Boolean(meal?.lunchCooked),
    lunchMode: meal?.lunchMode || (meal?.lunchRecipeId ? "recipe" : meal?.lunchText ? "free" : ""),
    dinnerText: meal?.dinnerText || "",
    dinnerRecipeId: meal?.dinnerRecipeId || "",
    dinnerCooked: Boolean(meal?.dinnerCooked),
    dinnerMode: meal?.dinnerMode || (meal?.dinnerRecipeId ? "recipe" : meal?.dinnerText ? "free" : ""),
  };
}

const SEASON_MONTHS = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
};

function normalizeRecipeUnit(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "u" || raw === "unite" || raw === "unites" || raw === "unité" || raw === "unités") return "unite";
  if (["g", "kg", "ml", "cl", "l"].includes(raw)) return raw;
  return raw;
}

function makeNormalizedId(prefix, index) {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
}

// Conservé pour compatibilité ascendante (anciens imports en cache).
export function inferRecipeIngredientKind() { return "main"; }

function pantryNameToCondimentId(name) {
  const n = String(name || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ").trim();
  if (!n) return null;
  if (n === "sel" || n.startsWith("sel ")) return "sel";
  if (n === "poivre" || n.startsWith("poivre ")) return "poivre";
  if (n.includes("olive")) return "huile_olive";
  if (n === "huile" || n.startsWith("huile ")) return "huile";
  if (n === "ail" || n.startsWith("ail ")) return "ail";
  if (n === "curry") return "curry";
  if (n === "cumin") return "cumin";
  if (n === "paprika") return "paprika";
  if (n === "curcuma") return "curcuma";
  if (n.includes("gingembre")) return "gingembre";
  if (n === "cannelle") return "cannelle";
  if (n === "safran") return "safran";
  if (n.includes("piment")) return "piment";
  if (n.includes("muscade")) return "muscade";
  if (n.includes("ras el hanout")) return "ras_el_hanout";
  if (n.includes("herbes") || n.includes("provence")) return "herbes_provence";
  if (n === "thym") return "thym";
  if (n === "romarin") return "romarin";
  if (n === "laurier") return "laurier";
  if (n === "basilic") return "basilic";
  if (n === "origan") return "origan";
  if (n === "persil") return "persil";
  if (n.includes("coriandre")) return "coriandre";
  if (n === "menthe") return "menthe";
  if (n === "sauge") return "sauge";
  if (n.includes("vinaigre")) return "vinaigre";
  if (n.includes("sauce") && n.includes("soja")) return "sauce_soja";
  if (n.includes("moutarde")) return "moutarde";
  return null;
}

function normalizeRecipeIngredient(item, index) {
  return {
    id: item?.id || makeNormalizedId("ingr", index),
    name: String(item?.name || item?.text || "").trim(),
    quantity: String(item?.quantity || "").trim(),
    unit: normalizeRecipeUnit(item?.unit),
  };
}

function parseLegacyRecipeIngredients(text) {
  return String(text || "")
    .split(/[\n,]/)
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk, index) => {
      const matched = chunk.match(/^(\d+(?:[.,]\d+)?)\s*(unite|unites|unité|unités|u|g|kg|ml|cl|l)?\s+(.+)$/i);
      if (!matched) {
        return normalizeRecipeIngredient({ id: `legacy-ingr-${index}`, name: chunk }, index);
      }
      return normalizeRecipeIngredient(
        {
          id: `legacy-ingr-${index}`,
          quantity: matched[1].replace(",", "."),
          unit: normalizeRecipeUnit(matched[2]),
          name: matched[3],
        },
        index,
      );
    })
    .filter((item) => item.name);
}

function normalizeRecipe(recipe, index) {
  const legacySeason = String(recipe?.season || "").trim();
  let availabilityMode = recipe?.availabilityMode || "all_year";
  let season = recipe?.seasonKey || recipe?.seasonLabel || "";
  let seasons = Array.isArray(recipe?.seasons)
    ? [...new Set(recipe.seasons.map((value) => String(value || "").trim()).filter((value) => SEASON_MONTHS[value]))]
    : [];
  let months = Array.isArray(recipe?.months)
    ? recipe.months.map((value) => Number(value)).filter((value) => value >= 1 && value <= 12)
    : [];

  if (!recipe?.availabilityMode) {
    if (!legacySeason || legacySeason === "all") {
      availabilityMode = "all_year";
    } else if (/^\d+$/.test(legacySeason)) {
      availabilityMode = "months";
      months = [Number(legacySeason)];
    } else if (SEASON_MONTHS[legacySeason]) {
      availabilityMode = "season";
      season = legacySeason;
      seasons = [legacySeason];
      months = [...SEASON_MONTHS[legacySeason]];
    }
  }

  if (availabilityMode === "season") {
    if (!seasons.length && season && SEASON_MONTHS[season]) seasons = [season];
    if (!season && seasons.length === 1) season = seasons[0];
    if (!months.length && seasons.length) {
      months = [...new Set(seasons.flatMap((seasonId) => SEASON_MONTHS[seasonId] || []))];
    } else if (!months.length && season) {
      months = [...(SEASON_MONTHS[season] || [])];
    }
  }

  const legacyIngredientsText =
    typeof recipe?.ingredients === "string"
      ? String(recipe.ingredients).trim()
      : String(recipe?.ingredientsLegacy || "").trim();

  let structuredIngredients;
  let derivedCondiments = [];

  if (Array.isArray(recipe?.ingredients)) {
    // Migration : anciens items kind:"pantry" → IDs condiments
    const pantryItems = recipe.ingredients.filter((item) => item?.kind === "pantry");
    derivedCondiments = pantryItems
      .map((item) => pantryNameToCondimentId(item?.name || item?.text || ""))
      .filter(Boolean);
    structuredIngredients = recipe.ingredients
      .filter((item) => item?.kind !== "pantry")
      .map(normalizeRecipeIngredient)
      .filter((item) => item.name);
  } else {
    structuredIngredients = parseLegacyRecipeIngredients(legacyIngredientsText);
  }

  const existingCondiments = Array.isArray(recipe?.condiments)
    ? recipe.condiments.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const condiments = [...new Set([...existingCondiments, ...derivedCondiments])];

  const servings = Math.max(1, Math.min(24, Number(recipe?.servings || recipe?.peopleCount || recipe?.serves || 4) || 4));

  return {
    id: recipe?.id || `recipe-${Date.now()}-${index}`,
    name: String(recipe?.name || recipe?.title || "").trim() || "Recette",
    servings,
    availabilityMode,
    season,
    seasons,
    months,
    labels: Array.isArray(recipe?.labels)
      ? [...new Set(recipe.labels.map((value) => String(value || "").trim()).filter(Boolean))]
      : [],
    ingredients: structuredIngredients,
    ingredientsLegacy: legacyIngredientsText,
    condiments,
    method: String(recipe?.method || "").trim(),
  };
}

function normalizeListItem(item, index) {
  const rawText = String(item?.text || "");
  const rawQuantity = String(item?.quantity || "").trim();
  const parsedLegacy = rawText.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  return {
    id: item?.id || makeNormalizedId("list-item", index),
    text: parsedLegacy && !rawQuantity ? parsedLegacy[2].trim() : rawText,
    quantity: rawQuantity || (parsedLegacy ? parsedLegacy[1].replace(",", ".") : ""),
    unit: String(item?.unit || "").trim(),
    done: Boolean(item?.done),
    purchasedAt: item?.purchasedAt || "",
  };
}

function parseListQuantityValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatListQuantityValue(value) {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(value).replace(".", ",");
}

function mergeNormalizedListItems(existingItem, incomingItem) {
  const currentQuantity = parseListQuantityValue(existingItem.quantity);
  const nextQuantity = parseListQuantityValue(incomingItem.quantity);
  const sameUnit = String(existingItem.unit || "").trim() === String(incomingItem.unit || "").trim();
  const canSum = currentQuantity != null && nextQuantity != null && sameUnit;

  return {
    ...existingItem,
    text: existingItem.text || incomingItem.text,
    quantity: canSum ? formatListQuantityValue(currentQuantity + nextQuantity) : (existingItem.quantity || incomingItem.quantity || ""),
    unit: existingItem.unit || incomingItem.unit || "",
    done: false,
    purchasedAt: "",
  };
}

function dedupeListItems(items) {
  const seenIds = new Set();
  return (Array.isArray(items) ? items : []).reduce((accumulator, item) => {
    const normalizedItem = normalizeListItem(item, accumulator.length);
    if (!normalizedItem.id || seenIds.has(normalizedItem.id)) {
      normalizedItem.id = makeNormalizedId("list-item", accumulator.length);
    }
    seenIds.add(normalizedItem.id);
    const normalizedName = normalizeProductName(normalizedItem.text);
    const existingIndex = accumulator.findIndex((entry) => normalizeProductName(entry.text) === normalizedName);
    if (existingIndex < 0) {
      accumulator.push(normalizedItem);
      return accumulator;
    }
    accumulator[existingIndex] = mergeNormalizedListItems(accumulator[existingIndex], normalizedItem);
    return accumulator;
  }, []);
}

function normalizeList(list, index) {
  const rawName = String(list?.name || "").trim();
  const isShopping = Boolean(list?.isShoppingList) || rawName.toLowerCase() === "liste de courses";
  return {
    id: list?.id || (isShopping ? "shopping-default" : `list-${Date.now()}-${index}`),
    name: rawName || (isShopping ? "Liste de courses" : `Liste ${index + 1}`),
    addToInventory: Boolean(list?.addToInventory ?? isShopping),
    isShoppingList: isShopping,
    items: dedupeListItems(list?.items),
    createdBy: list?.createdBy || "",
    visibility: isShopping ? "household" : (list?.visibility || "household"),
    sharedWith: Array.isArray(list?.sharedWith) ? list.sharedWith : [],
  };
}

function normalizeInventoryItem(item, index) {
  const normalizedStockState = item?.stockState === "empty" ? "empty" : "in_stock";
  return {
    id: item?.id || makeNormalizedId("inventory", index),
    name: item?.name || item?.text || "",
    quantity: item?.quantity || "",
    unit: String(item?.unit || "").trim(),
    purchaseDate: item?.purchaseDate || "",
    expiryDate: item?.expiryDate || "",
    price: item?.price || "",
    stockState: normalizedStockState,
    needsRestock: normalizedStockState === "empty" ? true : Boolean(item?.needsRestock),
  };
}

function normalizeAgendaItem(item, index) {
  const oldChildIds = item?.child ? [item.child] : [];
  const personIds = Array.isArray(item?.personIds) ? item.personIds.filter(Boolean) : item?.personId || item?.user ? [item.personId || item.user] : [];
  return {
    id: item?.id || `agenda-${Date.now()}-${index}`,
    text: item?.text || "",
    icon: item?.icon || "",
    taskId: item?.taskId || "",
    dateKey: item?.dateKey || "",
    start: item?.allDay ? "00:00" : item?.start || "09:00",
    duration: Number(item?.duration) || 60,
    allDay: Boolean(item?.allDay),
    personIds,
    personId: personIds[0] || "",
    wholeFamily: Boolean(item?.wholeFamily),
    childIds: Array.isArray(item?.childIds) ? item.childIds : oldChildIds,
    sourceType: item?.sourceType || item?.mode || "custom",
  };
}

function normalizeRecurringItem(item, index) {
  const oldChildIds = item?.child ? [item.child] : [];
  const personIds = Array.isArray(item?.personIds) ? item.personIds.filter(Boolean) : item?.personId || item?.user ? [item.personId || item.user] : [];
  return {
    id: item?.id || `rec-${Date.now()}-${index}`,
    text: item?.text || "",
    icon: item?.icon || "",
    taskId: item?.taskId || "",
    weekday: typeof item?.weekday === "number" ? item.weekday : 0,
    start: item?.allDay ? "00:00" : item?.start || "09:00",
    duration: Number(item?.duration) || 60,
    allDay: Boolean(item?.allDay),
    personIds,
    personId: personIds[0] || "",
    wholeFamily: Boolean(item?.wholeFamily),
    childIds: Array.isArray(item?.childIds) ? item.childIds : oldChildIds,
    sourceType: item?.sourceType || item?.mode || "custom",
  };
}

export function normalizeState(rawState = {}) {
  const state = { ...rawState };
  state.tasks = Array.isArray(state.tasks) ? state.tasks.map(normalizeTask) : [];
  state.tasks.sort((left, right) => {
    const rank = { daily: 0, weekly: 1, monthly: 2 };
    if (left.type !== right.type) return rank[left.type] - rank[right.type];
    return left.order - right.order;
  });
  ["daily", "weekly", "monthly"].forEach((type) => {
    state.tasks
      .filter((task) => task.type === type)
      .forEach((task, index) => {
        task.order = index;
      });
  });

  state.meals = Array.isArray(state.meals) ? state.meals.map(normalizeMeal) : [];
  state.linkMealsToInventory = Boolean(state.linkMealsToInventory);
  state.customCondiments = Array.isArray(state.customCondiments)
    ? [...new Set(state.customCondiments.map((s) => String(s || "").trim()).filter(Boolean))]
    : [];
  state.recipes = Array.isArray(state.recipes) ? state.recipes.map(normalizeRecipe) : [];
  state.shopping = Array.isArray(state.shopping) ? state.shopping : [];
  state.lists = Array.isArray(state.lists) ? state.lists.map(normalizeList) : [];
  state.inventory = Array.isArray(state.inventory) ? state.inventory.map(normalizeInventoryItem) : [];
  if (!state.lists.length && state.shopping.length) {
    state.lists = [
      normalizeList(
        {
          id: "shopping-default",
          name: "Liste de courses",
          addToInventory: true,
          isShoppingList: true,
          items: state.shopping,
        },
        0,
      ),
    ];
  }
  if (!state.lists.length) {
    state.lists = [
      normalizeList(
        {
          id: "shopping-default",
          name: "Liste de courses",
          addToInventory: true,
          isShoppingList: true,
          items: [],
        },
        0,
      ),
    ];
  }
  if (state.lists.length) {
    const shoppingList = state.lists.find((list) => list.isShoppingList) || state.lists.find((list) => list.name === "Liste de courses");
    if (!shoppingList) {
      state.lists.unshift(
        normalizeList(
          {
            id: "shopping-default",
            name: "Liste de courses",
            addToInventory: true,
            isShoppingList: true,
            items: [],
          },
          0,
        ),
      );
    }
  }
  state.notes = Array.isArray(state.notes)
    ? state.notes.map((note, index) => ({
        id: note.id || `note-${Date.now()}-${index}`,
        text: note.text || "",
        date: note.date || "",
        createdBy: note.createdBy || "",
        visibility: note.visibility || "household",
        sharedWith: Array.isArray(note.sharedWith) ? note.sharedWith : [],
      }))
    : [];
  state.history = Array.isArray(state.history) ? state.history.slice(0, 400) : [];
  state.agenda = Array.isArray(state.agenda) ? state.agenda.map(normalizeAgendaItem) : [];
  state.recurringEvents = Array.isArray(state.recurringEvents) ? state.recurringEvents.map(normalizeRecurringItem) : [];
  state.lastResetDaily = state.lastResetDaily || "";
  state.lastResetWeekly = state.lastResetWeekly || "";
  state.lastResetMonthly = state.lastResetMonthly || "";
  return state;
}

function parseTimeParts(value) {
  const [hourValue, minuteValue] = String(value || "00:00").split(":");
  const hour = Math.max(0, Math.min(23, Number(hourValue) || 0));
  const minute = Math.max(0, Math.min(59, Number(minuteValue) || 0));
  return { hour, minute };
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function setTime(date, timeValue) {
  const { hour, minute } = parseTimeParts(timeValue);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0, 0));
}

function getDailyBoundary(now, timeValue) {
  const boundary = setTime(now, timeValue);
  if (boundary > now) {
    boundary.setUTCDate(boundary.getUTCDate() - 1);
  }
  return boundary;
}

function getWeeklyBoundary(now, daysOfWeek, timeValue) {
  const selectedDays = Array.isArray(daysOfWeek) && daysOfWeek.length ? daysOfWeek : [1];
  for (let offset = 0; offset <= 7; offset += 1) {
    const probe = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    probe.setUTCDate(probe.getUTCDate() - offset);
    if (!selectedDays.includes(probe.getUTCDay())) continue;
    const candidate = setTime(probe, timeValue);
    if (candidate <= now) return candidate;
  }
  const fallback = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  fallback.setUTCDate(fallback.getUTCDate() - 7);
  return setTime(fallback, timeValue);
}

function getMonthlyBoundary(now, dayOfMonth, timeValue) {
  const targetDay = Math.max(1, Math.min(31, Number(dayOfMonth) || 1));
  const currentMonthDay = Math.min(targetDay, lastDayOfMonth(now.getUTCFullYear(), now.getUTCMonth()));
  const currentCandidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), currentMonthDay));
  const currentBoundary = setTime(currentCandidate, timeValue);
  if (currentBoundary <= now) return currentBoundary;
  const previousMonth = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
  const previousYear = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const previousDay = Math.min(targetDay, lastDayOfMonth(previousYear, previousMonth));
  return setTime(new Date(Date.UTC(previousYear, previousMonth, previousDay)), timeValue);
}

function getCycleBoundary(task, now) {
  if (task.recurrenceFrequency === "daily") return getDailyBoundary(now, task.recurrenceTime);
  if (task.recurrenceFrequency === "weekly") return getWeeklyBoundary(now, task.recurrenceDaysOfWeek, task.recurrenceTime);
  return getMonthlyBoundary(now, task.recurrenceDayOfMonth, task.recurrenceTime);
}

function toCycleKey(date) {
  return `${utcDateKey(date)}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function applyTaskCycles(state, now) {
  let changed = false;

  state.tasks = state.tasks.filter((task) => {
    const completed = (Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || Boolean(task.completedByPersonId);

    if (task.taskKind !== "recurring") {
      if (completed) {
        return true;
      }
      task.overdue = false;
      return true;
    }

    const cycleBoundary = getCycleBoundary(task, now);
    const cycleKey = toCycleKey(cycleBoundary);

    if (!task.currentCycleKey) {
      task.currentCycleKey = cycleKey;
      changed = true;
      return true;
    }

    if (task.currentCycleKey !== cycleKey) {
      if (!completed) {
        task.overdue = true;
        task.missedCount = (Number(task.missedCount) || 0) + 1;
      } else {
        task.overdue = false;
      }
      task.completedByPersonId = "";
      task.completedAt = "";
      task.doneBy = [];
      task.currentCycleKey = cycleKey;
      changed = true;
    }

    return true;
  });

  return changed;
}

export function checkReset(inputState, currentDate = getCurrentAppDate()) {
  const state = normalizeState(inputState);
  const today = new Date(currentDate);
  const dayKey = utcDateKey(today);
  const weekKey = utcWeekKey(today);
  const monthKey = utcMonthKey(today);
  let changed = false;

  changed = applyTaskCycles(state, today) || changed;
  if (state.lastResetDaily !== dayKey) state.lastResetDaily = dayKey;
  if (state.lastResetWeekly !== weekKey) state.lastResetWeekly = weekKey;
  if (state.lastResetMonthly !== monthKey) state.lastResetMonthly = monthKey;

  return { state: normalizeState(state), changed };
}

import { BottomNav } from "./components/nav/BottomNav.js?v=2026-04-20-redesign-1";
import { HomeView } from "./components/home/HomeView.js?v=2026-04-20-redesign-1";
import { InventoryView } from "./components/inventory/InventoryView.js?v=2026-04-19-inventory-clear-1";
import { ListsView } from "./components/lists/ListsView.js?v=2026-04-19-recipe-structure-1";
import { AgendaView } from "./components/agenda/AgendaView.js?v=2026-04-19-time-sim-1";
import { AuthScreen } from "./components/auth/AuthScreen.js";
import { HistoryView } from "./components/history/HistoryView.js?v=2026-04-19-user-profile-1";
import { MealsView } from "./components/meals/MealsView.js?v=2026-04-19-condiments-1";
import { NotesView } from "./components/notes/NotesView.js";
import { RecipesView } from "./components/recipes/RecipesView.js?v=2026-04-19-condiments-2";
import { SettingsView } from "./components/settings/SettingsView.js?v=2026-04-19-meals-link-1";
import { TasksView } from "./components/tasks/TasksView.js?v=2026-04-20-redesign-1";
import { createDefaultState } from "./data/defaultState.js";
import {
  canChangePassword,
  getCurrentAuthMode,
  renameFamily,
  setCurrentFamily,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
  updateFamilyPerson,
} from "./firebase/client.js";
import { html, useEffect, useMemo, useState } from "./lib.js";
import { collectKnownProducts, normalizeProductName } from "./utils/productUtils.js?v=2026-04-19-meals-stock-3";
import {
  formatDateTimeInputValue,
  formatHeaderDate,
  getCurrentAppDate,
  getCurrentAppTimeMode,
  getSimulatedAppDateValue,
  localDateKey,
  pad2,
  resetSimulatedAppDateToNow,
  setCurrentAppTimeMode,
  setSimulatedAppDateValue,
  shiftSimulatedAppDate,
} from "./utils/date.js?v=2026-04-19-time-sim-2";
import { checkReset, createMealShell } from "./utils/state.js?v=2026-04-19-lists-fix-3";
import { parseImportedState } from "./utils/storage.js?v=2026-04-19-lists-fix-3";
import { usePlannerSync } from "./hooks/usePlannerSync.js";
import { useAuth } from "./hooks/useAuth.js";
import { useTasks } from "./hooks/useTasks.js";
import { useMeals } from "./hooks/useMeals.js?v=2026-04-19-condiments-1";
import { useLists, ensureShoppingList } from "./hooks/useLists.js?v=2026-04-19-lists-fix-4";
import { useAgenda } from "./hooks/useAgenda.js";

function activePersonStorageKey(familyId) {
  return `mrd-active-person-${familyId}`;
}

function deviceModeStorageKey(familyId) {
  return `mrd-device-mode-${familyId}`;
}

function normalizeUnitValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const cleaned = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (cleaned === "u" || cleaned === "unite" || cleaned === "unites") return "unite";
  if (["g", "kg", "ml", "cl", "l"].includes(cleaned)) return cleaned;
  return cleaned;
}

function parseQuantityValue(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatQuantityValue(value) {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(value).replace(".", ",");
}

const PRODUCT_STOPWORDS = new Set(["de", "du", "des", "d", "la", "le", "les", "a", "au", "aux", "un", "une"]);

function productMatchKey(name) {
  const normalized = normalizeProductName(name);
  const filtered = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !PRODUCT_STOPWORDS.has(token));
  return filtered.join(" ") || normalized;
}

function normalizeUnitForStock(unit, quantity) {
  const normalized = normalizeUnitValue(unit);
  if (normalized) return normalized;
  return parseQuantityValue(quantity) != null ? "unite" : "";
}

function toBaseQuantity(quantity, unit) {
  const normalizedUnit = normalizeUnitForStock(unit, quantity);
  const parsedQuantity = parseQuantityValue(quantity);
  if (parsedQuantity == null || !normalizedUnit) return null;

  if (normalizedUnit === "kg") return { kind: "mass", value: parsedQuantity * 1000, unit: normalizedUnit };
  if (normalizedUnit === "g") return { kind: "mass", value: parsedQuantity, unit: normalizedUnit };
  if (normalizedUnit === "l") return { kind: "volume", value: parsedQuantity * 1000, unit: normalizedUnit };
  if (normalizedUnit === "cl") return { kind: "volume", value: parsedQuantity * 10, unit: normalizedUnit };
  if (normalizedUnit === "ml") return { kind: "volume", value: parsedQuantity, unit: normalizedUnit };
  if (normalizedUnit === "unite") return { kind: "count", value: parsedQuantity, unit: normalizedUnit };
  return null;
}

function fromBaseQuantity(baseValue, originalUnit) {
  const normalizedUnit = normalizeUnitForStock(originalUnit, 1);
  if (!Number.isFinite(baseValue) || !normalizedUnit) return "";
  if (normalizedUnit === "kg") return formatQuantityValue(baseValue / 1000);
  if (normalizedUnit === "g") return formatQuantityValue(baseValue);
  if (normalizedUnit === "l") return formatQuantityValue(baseValue / 1000);
  if (normalizedUnit === "cl") return formatQuantityValue(baseValue / 10);
  if (normalizedUnit === "ml") return formatQuantityValue(baseValue);
  if (normalizedUnit === "unite") return formatQuantityValue(baseValue);
  return "";
}

function readStoredActivePerson(familyId) {
  if (!familyId) return "";
  try {
    return localStorage.getItem(activePersonStorageKey(familyId)) || "";
  } catch (error) {
    return "";
  }
}

function storeActivePerson(familyId, personId) {
  if (!familyId) return;
  try {
    localStorage.setItem(activePersonStorageKey(familyId), personId || "");
  } catch (error) {
    console.warn("[app] impossible d enregistrer la personne active", error);
  }
}

function readDeviceMode(familyId) {
  if (!familyId) return "personal";
  try {
    return localStorage.getItem(deviceModeStorageKey(familyId)) === "shared" ? "shared" : "personal";
  } catch (error) {
    return "personal";
  }
}

function storeDeviceMode(familyId, mode) {
  if (!familyId) return;
  try {
    localStorage.setItem(deviceModeStorageKey(familyId), mode === "shared" ? "shared" : "personal");
  } catch (error) {
    console.warn("[app] impossible d enregistrer le mode appareil", error);
  }
}

function completedIds(task) {
  const doneBy = Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean) : [];
  if (doneBy.length) return doneBy;
  return task?.completedByPersonId ? [task.completedByPersonId] : [];
}

function parsePlanningDate(dateKey) {
  if (!dateKey) return null;
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const parsed = new Date(year || 0, (month || 1) - 1, day || 1);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTaskActiveTab(task, planning) {
  if (!task) return "";
  if (completedIds(task).length > 0) return task.type;
  if (!planning?.dateKey) return task.type;

  const dueDate = parsePlanningDate(planning.dateKey);
  if (!dueDate) return task.type;

  const today = getCurrentAppDate();
  today.setHours(0, 0, 0, 0);
  const dueStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const diffDays = Math.round((dueStart - today) / (24 * 60 * 60 * 1000));

  if (task.type === "monthly") {
    if (diffDays <= 0) return "daily";
    if (diffDays <= 7) return "weekly";
    return "monthly";
  }

  if (task.type === "weekly") {
    if (diffDays <= 0) return "daily";
    return "weekly";
  }

  return task.type;
}

function taskAppearsInTab(task, tab, planning) {
  return getTaskActiveTab(task, planning) === tab;
}


export function App() {
  const {
    user, authReady, authPhase,
    startupStage, startupError, setStartupStage, setStartupError,
    userProfile, currentFamilyId, currentFamily, currentRole,
    safeFamilies, safeMembers, safePeople, appPeopleRaw, invitations,
    linkedPerson, householdPeople, agendaPeople,
    memberDirectory, linkedAccountChoices, linkedAccountLabels,
    authError, familyError, bootstrapError, setBootstrapError,
    accountMessage, setAccountMessage,
    emailMessage, passwordMessage,
    busy,
    runAuth, runFamilyAction,
    setPendingInviteCode, handleForgotPassword,
    handleChangeEmail, handleChangePassword,
    handleCreateFamily, handleJoinFamily, handleCreateInvitation,
    handleAddPerson, handleUpdatePerson, handleDeletePerson, handleMovePerson,
  } = useAuth();

  const [activeTab, setActiveTab] = useState("home");
  const [toast, setToast] = useState(null);
  const [dataMessage, setDataMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [taskFabTrigger, setTaskFabTrigger] = useState(0);
  const [profilePersonId, setProfilePersonId] = useState("");
  const [activePersonId, setActivePersonId] = useState("");
  const [deviceMode, setDeviceMode] = useState("personal");
  const [profileDraft, setProfileDraft] = useState({ displayName: "", color: "#8B7355", mood: "", message: "" });
  const [appTimeMode, setAppTimeModeState] = useState(() => getCurrentAppTimeMode());
  const [simulatedDateTime, setSimulatedDateTimeState] = useState(() => getSimulatedAppDateValue() || formatDateTimeInputValue(getCurrentAppDate()));
  const [appTimeVersion, setAppTimeVersion] = useState(0);

  const { state, setState, status, plannerError } = usePlannerSync(currentFamilyId, user?.uid);

  const activeHouseholdPerson = appPeopleRaw.find((person) => person.id === activePersonId) || null;
  const selectedProfile = householdPeople.find((person) => person.id === profilePersonId) || null;
  const canEditSelectedProfile = Boolean(selectedProfile && linkedPerson && selectedProfile.id === linkedPerson.id);
  const hasFamily = Boolean(currentFamilyId && currentFamily);
  const plannerUnlocked = hasFamily && safePeople.length > 0;
  const needsActivePersonChoice = plannerUnlocked && deviceMode === "shared" && !activeHouseholdPerson;
  const authMode = getCurrentAuthMode();
  const passwordAvailable = canChangePassword();
  const currentAppDate = useMemo(() => getCurrentAppDate(), [appTimeVersion]);
  const currentAppDateLabel = `${formatHeaderDate(currentAppDate)} - ${pad2(currentAppDate.getHours())}:${pad2(currentAppDate.getMinutes())}`;

  const stats = useMemo(() => {
    const total = state.tasks.length;
    const done = state.tasks.filter((task) => (Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || task.completedByPersonId).length;
    return {
      percentDone: total ? Math.round((done / total) * 100) : 0,
      remaining: {
        daily: state.tasks.filter((task) => task.type === "daily" && !((Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || task.completedByPersonId)).length,
        weekly: state.tasks.filter((task) => task.type === "weekly" && !((Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || task.completedByPersonId)).length,
        monthly: state.tasks.filter((task) => task.type === "monthly" && !((Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || task.completedByPersonId)).length,
      },
    };
  }, [state]);

  const taskPlanningById = useMemo(() => {
    const map = {};

    const addEntry = (entry, recurring = false) => {
      if (!entry?.taskId) return;
      if (map[entry.taskId]) return;
      map[entry.taskId] = {
        dateKey: entry.dateKey || "",
        start: entry.start || "",
        allDay: Boolean(entry.allDay),
        personIds: Array.isArray(entry.personIds) ? entry.personIds : entry.personId ? [entry.personId] : [],
        childIds: Array.isArray(entry.childIds) ? entry.childIds : [],
        wholeFamily: Boolean(entry.wholeFamily),
        durationLabel: entry.allDay ? "Toute la journee" : `${entry.duration || 60} min`,
        recurring,
      };
    };

    state.agenda.forEach((entry) => addEntry(entry, false));
    state.recurringEvents.forEach((entry) => addEntry(entry, true));
    return map;
  }, [state.agenda, state.recurringEvents]);

  const visibleTasksByTab = useMemo(() => {
    return {
      daily: state.tasks.filter((task) => taskAppearsInTab(task, "daily", taskPlanningById[task.id])),
      weekly: state.tasks.filter((task) => taskAppearsInTab(task, "weekly", taskPlanningById[task.id])),
      monthly: state.tasks.filter((task) => taskAppearsInTab(task, "monthly", taskPlanningById[task.id])),
    };
  }, [state.tasks, taskPlanningById]);

  const knownProducts = useMemo(
    () => collectKnownProducts({ inventory: state.inventory, lists: state.lists, recipes: state.recipes }),
    [state.inventory, state.lists, state.recipes],
  );

  useEffect(() => {
    if (!selectedProfile) return;
    setProfileDraft({
      displayName: selectedProfile.label || "",
      color: selectedProfile.color || "#8B7355",
      mood: selectedProfile.mood || "",
      message: selectedProfile.message || "",
    });
  }, [selectedProfile?.id, selectedProfile?.label, selectedProfile?.color, selectedProfile?.mood, selectedProfile?.message]);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("mrd-theme") || "light";
      document.documentElement.setAttribute("data-theme", savedTheme === "dark" ? "dark" : "light");
    } catch (error) {
      console.warn("[app] impossible d appliquer le theme en cache", error);
    }
  }, []);

  useEffect(() => {
    setState((previous) => checkReset(previous, getCurrentAppDate()).state);
  }, [appTimeVersion]);


  useEffect(() => {
    if (!currentFamilyId) {
      setActivePersonId("");
      return;
    }
    const nextMode = readDeviceMode(currentFamilyId);
    setDeviceMode(nextMode);
    const availableIds = appPeopleRaw.map((person) => person.id);
    if (!availableIds.length) {
      setActivePersonId("");
      return;
    }

    if (nextMode === "personal") {
      const linkedId = linkedPerson?.id && availableIds.includes(linkedPerson.id) ? linkedPerson.id : "";
      setActivePersonId(linkedId);
      storeActivePerson(currentFamilyId, linkedId);
      return;
    }

    const storedId = readStoredActivePerson(currentFamilyId);
    const preferredId = storedId && availableIds.includes(storedId) ? storedId : "";

    if (preferredId) {
      setActivePersonId((current) => (current === preferredId ? current : preferredId));
      storeActivePerson(currentFamilyId, preferredId);
      return;
    }

    setActivePersonId((current) => (current && availableIds.includes(current) ? current : ""));
  }, [currentFamilyId, appPeopleRaw, linkedPerson?.id]);

  useEffect(() => {
    if (!user) {
      setDeviceMode("personal");
      setShowSettings(false);
      setDataMessage("");
      setToast(null);
    }
  }, [user]);

  useEffect(() => {
    if (!plannerError) return;
    setBootstrapError(plannerError);
    setStartupError(plannerError);
    setStartupStage("error");
  }, [plannerError]);

  useEffect(() => {
    if (!toast?.id) return undefined;
    console.log("[toast] mounted", toast.text);
    const timeoutId = setTimeout(() => setToast(null), toast.duration || 2200);
    return () => clearTimeout(timeoutId);
  }, [toast?.id]);

  function updateState(producer) {
    setState((previous) => checkReset(producer(previous), getCurrentAppDate()).state);
  }

  function showToast(message, action = null, duration = 2200) {
    if (!message) return;
    const nextToast = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text: message,
      action,
      duration,
    };
    console.log("[toast] showToast", nextToast.text, Boolean(action));
    setToast(nextToast);
  }

  const { handleAddTask, handleUpdateTask, handleToggleTask, handleDeleteTask, handleMoveTask } = useTasks(updateState);
  const { handleUpdateMeal, handleToggleCook, handleAddRecipe, handleUpdateRecipe, handleDeleteRecipe, handleLoadDemoRecipes } = useMeals(updateState);

  function handleAddCustomCondiment(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    updateState((previous) => {
      const existing = Array.isArray(previous.customCondiments) ? previous.customCondiments : [];
      if (existing.includes(trimmed)) return previous;
      return { ...previous, customCondiments: [...existing, trimmed] };
    });
  }

  function handleDeleteCustomCondiment(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    updateState((previous) => ({
      ...previous,
      customCondiments: (Array.isArray(previous.customCondiments) ? previous.customCondiments : []).filter((entry) => entry !== trimmed),
      recipes: (Array.isArray(previous.recipes) ? previous.recipes : []).map((recipe) => ({
        ...recipe,
        condiments: (Array.isArray(recipe.condiments) ? recipe.condiments : []).filter((entry) => entry !== trimmed),
      })),
    }));
  }
  const {
    handleCreateList, handleDeleteList, handleUpdateList,
    handleAddListItem, handleUpdateListItem, handleToggleListItem, handleDeleteListItem, handleClearShoppingList,
    handleAddInventoryItem, handleUpdateInventoryItem, handleDeleteInventoryItem, handleClearFinishedInventory, handleClearAllInventory, handleSendInventoryToShopping,
  } = useLists(state, updateState, showToast);
  const {
    handleAddAgenda, handleUpdateAgenda, handleDeleteAgenda,
    handleAddRecurring, handleUpdateRecurring, handleDeleteRecurring,
  } = useAgenda(state, updateState);

  function handleSetActivePerson(personId) {
    const nextId = appPeopleRaw.some((person) => person.id === personId) ? personId : "";
    setActivePersonId(nextId);
    storeActivePerson(currentFamilyId, nextId);
  }

  function handleSetDeviceMode(mode) {
    const nextMode = mode === "shared" ? "shared" : "personal";
    setDeviceMode(nextMode);
    storeDeviceMode(currentFamilyId, nextMode);
    if (nextMode === "personal") {
      const linkedId = linkedPerson?.id || "";
      setActivePersonId(linkedId);
      storeActivePerson(currentFamilyId, linkedId);
      return;
    }
    const stored = readStoredActivePerson(currentFamilyId);
    setActivePersonId(stored || "");
  }

  function openOwnProfile() {
    if (!linkedPerson?.id) return;
    setProfilePersonId(linkedPerson.id);
  }

  function openProfileCard(personId) {
    if (!personId) return;
    setProfilePersonId(personId);
  }

  async function handleSaveProfileCard() {
    if (!currentFamilyId || !selectedProfile || !canEditSelectedProfile) return;
    await updateFamilyPerson(currentFamilyId, selectedProfile.id, {
      displayName: String(profileDraft.displayName || "").trim() || selectedProfile.label,
      color: profileDraft.color || selectedProfile.color,
      mood: String(profileDraft.mood || "").trim(),
      message: String(profileDraft.message || "").trim(),
    });
    setAccountMessage("Ton profil a ete mis a jour.");
  }

  function handleAddNote(text, visibility = "household", sharedWith = []) {
    if (!text.trim()) return;
    const now = getCurrentAppDate();
    const date = `${localDateKey(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    updateState((previous) => ({
      ...previous,
      notes: [{
        id: `note-${Date.now()}`,
        text: text.trim(),
        date,
        createdBy: activePersonId,
        visibility,
        sharedWith: Array.isArray(sharedWith) ? sharedWith : [],
      }, ...previous.notes],
    }));
  }

  function handleDeleteNote(noteId) {
    updateState((previous) => ({
      ...previous,
      notes: previous.notes.filter((note) => note.id !== noteId),
    }));
  }

  function handleUpdateNote(noteId, updates) {
    updateState((previous) => ({
      ...previous,
      notes: previous.notes.map((note) => note.id === noteId ? { ...note, ...updates } : note),
    }));
  }

  function handleClearHistory() {
    updateState((previous) => ({ ...previous, history: [] }));
  }

  function handleManualImport() {
    try {
      setDataMessage("");
      const imported = checkReset(parseImportedState(importText), getCurrentAppDate()).state;
      setState(imported);
      setDataMessage("Import manuel termine.");
      setShowImport(false);
      setImportText("");
    } catch (error) {
      setDataMessage(error.message || "Import impossible.");
    }
  }

  function handleExportData() {
    try {
      const payload = JSON.stringify(state, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `my-rolling-day-${currentFamily?.name || "foyer"}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setDataMessage("Export lance.");
    } catch (error) {
      setDataMessage(error.message || "Export impossible.");
    }
  }

  function handleResetPlanner() {
    setState(checkReset(createDefaultState(), getCurrentAppDate()).state);
    setDataMessage("Planner reinitialise.");
  }

  function syncAppTimeControls() {
    setAppTimeModeState(getCurrentAppTimeMode());
    setSimulatedDateTimeState(getSimulatedAppDateValue() || formatDateTimeInputValue(getCurrentAppDate()));
    setAppTimeVersion((value) => value + 1);
  }

  function handleSetRealDateMode() {
    setCurrentAppTimeMode("real");
    syncAppTimeControls();
  }

  function handleSetSimulatedDateMode() {
    if (!getSimulatedAppDateValue()) {
      resetSimulatedAppDateToNow();
    }
    setCurrentAppTimeMode("simulated");
    syncAppTimeControls();
  }

  function handleChangeSimulatedDate(dateValue) {
    const currentValue = getSimulatedAppDateValue() || formatDateTimeInputValue(getCurrentAppDate());
    const currentTime = currentValue.slice(11, 16) || "09:00";
    setSimulatedAppDateValue(`${dateValue}T${currentTime}`);
    setCurrentAppTimeMode("simulated");
    syncAppTimeControls();
  }

  function handleChangeSimulatedTime(timeValue) {
    const currentValue = getSimulatedAppDateValue() || formatDateTimeInputValue(getCurrentAppDate());
    const currentDatePart = currentValue.slice(0, 10) || localDateKey(getCurrentAppDate());
    setSimulatedAppDateValue(`${currentDatePart}T${timeValue}`);
    setCurrentAppTimeMode("simulated");
    syncAppTimeControls();
  }

  function handleShiftSimulatedDate(days) {
    setCurrentAppTimeMode("simulated");
    shiftSimulatedAppDate(days);
    syncAppTimeControls();
  }

  function handleResetSimulatedDateToToday() {
    setCurrentAppTimeMode("simulated");
    resetSimulatedAppDateToNow();
    syncAppTimeControls();
  }

  function handleToggleMealsInventoryLink(enabled) {
    updateState((previous) => ({
      ...previous,
      linkMealsToInventory: Boolean(enabled),
    }));
  }

  function computeMealCookState(previous, day, slot) {
    const existing = previous.meals.find((meal) => meal.day === day);
    const baseMeals = existing
      ? [...previous.meals]
      : [...previous.meals, createMealShell(day, previous.meals.length)];

    const targetMeal = baseMeals.find((meal) => meal.day === day);
    if (!targetMeal) return null;

    const cookedKey = slot === "lunch" ? "lunchCooked" : "dinnerCooked";
    const recipeKey = slot === "lunch" ? "lunchRecipeId" : "dinnerRecipeId";
    const nextCooked = !targetMeal[cookedKey];
    const recipeId = targetMeal[recipeKey];
    let nextInventory = previous.inventory;
    let deductedAny = false;

    if (Boolean(previous.linkMealsToInventory) && nextCooked && recipeId) {
      const recipe = (previous.recipes || []).find((entry) => entry.id === recipeId);
      const recipeIngredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients.filter((item) => item?.name) : [];

      nextInventory = [...previous.inventory];
      recipeIngredients.forEach((ingredient) => {
        const ingredientKey = productMatchKey(ingredient.name);
        const ingredientBase = toBaseQuantity(ingredient.quantity, ingredient.unit);
        if (!ingredientKey || !ingredientBase) return;

        let remainingToDeduct = ingredientBase.value;
        nextInventory = nextInventory.map((item) => {
          if (remainingToDeduct <= 0) return item;
          if (productMatchKey(item.name) !== ingredientKey) return item;
          const itemBase = toBaseQuantity(item.quantity, item.unit);
          if (!itemBase || itemBase.kind !== ingredientBase.kind || itemBase.value <= 0) return item;

          const consumed = Math.min(itemBase.value, remainingToDeduct);
          if (consumed > 0) deductedAny = true;
          remainingToDeduct -= consumed;
          const nextQtyBase = itemBase.value - consumed;

          return {
            ...item,
            quantity: nextQtyBase > 0 ? fromBaseQuantity(nextQtyBase, item.unit || ingredient.unit) : "0",
            stockState: nextQtyBase > 0 ? "in_stock" : "empty",
            needsRestock: nextQtyBase <= 0,
          };
        });
      });
    }

    return {
      meals: baseMeals.map((meal) => (meal.day === day ? { ...meal, [cookedKey]: nextCooked } : meal)),
      inventory: nextInventory,
      nextCooked,
      recipeId,
      deductedAny,
    };
  }

  function handleToggleCookWithInventory(day, slot) {
    const beforeInventory = state.inventory;
    const computed = computeMealCookState(state, day, slot);
    if (!computed) return;

    updateState((previous) => {
      const recomputed = computeMealCookState(previous, day, slot);
      return recomputed
        ? { ...previous, meals: recomputed.meals, inventory: recomputed.inventory }
        : previous;
    });

    if (Boolean(state.linkMealsToInventory) && computed.nextCooked && computed.recipeId && computed.deductedAny) {
      showToast(
        "Les ingrédients ont bien été déduits de votre inventaire",
        {
          label: "Annuler",
          onClick: () => {
            updateState((previous) => {
              const existing = previous.meals.find((meal) => meal.day === day);
              const baseMeals = existing
                ? [...previous.meals]
                : [...previous.meals, createMealShell(day, previous.meals.length)];
              const cookedKey = slot === "lunch" ? "lunchCooked" : "dinnerCooked";
              return {
                ...previous,
                meals: baseMeals.map((meal) => (meal.day === day ? { ...meal, [cookedKey]: false } : meal)),
                inventory: beforeInventory,
              };
            });
            setToast(null);
          },
        },
        3000,
      );
    }
  }


  if (!authReady) {
    return html`<div className="ldr"><div className="spin"></div>Vérification de la session...</div>`;
  }

  if (startupStage === "error" && startupError) {
    return html`
      <div className="auth-shell">
        <div className="auth-card">
          <div className="hdr-sub">Démarrage</div>
          <h1 className="auth-title">Chargement impossible</h1>
          <div className="error-box">${startupError}</div>
          <div className="aform">
            <button className="aok" onClick=${() => window.location.reload()}>Réessayer</button>
          </div>
        </div>
      </div>
    `;
  }

  if (!user) {
    return html`
      <${AuthScreen}
        errorMessage=${authError}
        infoMessage=${`État auth : ${authPhase === "checking" ? "vérification" : authPhase === "signed_out" ? "non connecté" : "connecté"}`}
        loading=${busy}
        onGoogleLogin=${() => runAuth(() => signInWithGoogle())}
        onEmailLogin=${(form) => runAuth(() => signInWithEmail(form.email, form.password))}
        onEmailSignup=${(form) => runAuth(() => signUpWithEmail(form))}
        onForgotPassword=${(email) => handleForgotPassword(email)}
        onJoinWithCode=${(form) => {
          setPendingInviteCode(form.code.trim().toUpperCase());
          if (form.mode === "signup") return runAuth(() => signUpWithEmail(form));
          return runAuth(() => signInWithEmail(form.email, form.password));
        }}
        onGoogleJoin=${(code) => {
          setPendingInviteCode(code.trim().toUpperCase());
          return runAuth(() => signInWithGoogle());
        }}
      />
    `;
  }

  let plannerContent = null;
  if (plannerUnlocked && !showSettings) {
    if (activeTab === "mine" || activeTab === "daily" || activeTab === "weekly" || activeTab === "monthly") {
      const visibleTasks =
        activeTab === "mine"
          ? state.tasks.filter((task) => task.assignedPersonId && task.assignedPersonId === activePersonId)
          : visibleTasksByTab[activeTab] || [];
      plannerContent = html`
        <${TasksView}
          tab=${activeTab}
          tasks=${visibleTasks}
          allTasks=${state.tasks}
          people=${householdPeople}
          childProfiles=${agendaPeople.filter((person) => person.profileMode === "context" || person.type === "child" || person.type === "animal")}
          planningByTask=${taskPlanningById}
          activePersonId=${activePersonId}
          activePersonLabel=${activeHouseholdPerson?.displayName || activeHouseholdPerson?.label || ""}
          externalOpenCreate=${taskFabTrigger}
          onAddTask=${handleAddTask}
          onUpdateTask=${handleUpdateTask}
          onToggleTask=${handleToggleTask}
          onDeleteTask=${handleDeleteTask}
          onMoveTask=${handleMoveTask}
        />
      `;
    } else if (activeTab === "agenda") {
      plannerContent = html`
        <${AgendaView}
          tasks=${state.tasks}
          people=${agendaPeople}
          agenda=${state.agenda}
          recurringEvents=${state.recurringEvents}
          onAddAgenda=${handleAddAgenda}
          onUpdateAgenda=${handleUpdateAgenda}
          onDeleteAgenda=${handleDeleteAgenda}
          onAddRecurring=${handleAddRecurring}
          onUpdateRecurring=${handleUpdateRecurring}
          onDeleteRecurring=${handleDeleteRecurring}
          onDeleteTask=${handleDeleteTask}
          onToggleTask=${handleToggleTask}
          activePersonId=${activePersonId}
        />
      `;
    } else if (activeTab === "meals") {
      const shoppingList = ensureShoppingList(state.lists).find((list) => list.isShoppingList);
      plannerContent = html`
        <${MealsView}
          meals=${state.meals}
          recipes=${state.recipes}
          inventory=${state.inventory}
          linkMealsToInventory=${Boolean(state.linkMealsToInventory)}
          onToggleLinkMealsToInventory=${handleToggleMealsInventoryLink}
          onAddMissingIngredients=${(items) => {
            if (!shoppingList?.id || !Array.isArray(items) || !items.length) return;
            items.forEach((item) =>
              handleAddListItem(shoppingList.id, {
                text: item.name,
                quantity: item.quantity || "",
                unit: item.unit || "",
              }),
            );
            showToast("Ingrédients ajoutés à votre liste de courses.");
          }}
          onUpdateMeal=${handleUpdateMeal}
          onToggleCook=${handleToggleCookWithInventory}
        />
      `;
    } else if (activeTab === "lists") {
      const allLists = ensureShoppingList(state.lists);
      const visibleLists = allLists.filter((list) => {
        if (list.isShoppingList) return true;
        if (list.visibility === "private") return !list.createdBy || list.createdBy === activePersonId;
        if (list.visibility === "shared") return list.createdBy === activePersonId || (list.sharedWith || []).includes(activePersonId);
        return true;
      });
      plannerContent = html`
        <${ListsView}
          lists=${visibleLists}
          activePersonId=${activePersonId}
          people=${householdPeople}
          inventory=${state.inventory}
          onCreateList=${(form) => handleCreateList({ ...form, createdBy: activePersonId })}
          onUpdateList=${handleUpdateList}
          onAddListItem=${handleAddListItem}
          onUpdateListItem=${handleUpdateListItem}
          onToggleListItem=${handleToggleListItem}
          onDeleteListItem=${handleDeleteListItem}
          onDeleteList=${handleDeleteList}
          onClearShoppingList=${handleClearShoppingList}
        />
      `;
    } else if (activeTab === "inventory") {
      plannerContent = html`
        <${InventoryView}
          inventory=${state.inventory}
          knownProducts=${knownProducts}
          onAddInventoryItem=${handleAddInventoryItem}
          onUpdateInventoryItem=${handleUpdateInventoryItem}
          onDeleteInventoryItem=${handleDeleteInventoryItem}
          onClearFinishedInventory=${handleClearFinishedInventory}
          onClearAllInventory=${handleClearAllInventory}
          onSendInventoryToShopping=${handleSendInventoryToShopping}
        />
      `;
    } else if (activeTab === "recipes") {
      plannerContent = html`<${RecipesView} recipes=${state.recipes} inventory=${state.inventory} knownProducts=${knownProducts} customCondiments=${state.customCondiments || []} onAddCustomCondiment=${handleAddCustomCondiment} onDeleteCustomCondiment=${handleDeleteCustomCondiment} onAddRecipe=${handleAddRecipe} onUpdateRecipe=${handleUpdateRecipe} onDeleteRecipe=${handleDeleteRecipe} onLoadDemoRecipes=${handleLoadDemoRecipes} />`;
    } else if (activeTab === "notes") {
      const visibleNotes = state.notes.filter((note) => {
        if (note.visibility === "private") return !note.createdBy || note.createdBy === activePersonId;
        if (note.visibility === "shared") return note.createdBy === activePersonId || (note.sharedWith || []).includes(activePersonId);
        return true;
      });
      plannerContent = html`<${NotesView} notes=${visibleNotes} activePersonId=${activePersonId} people=${householdPeople} onAddNote=${handleAddNote} onDeleteNote=${handleDeleteNote} onUpdateNote=${handleUpdateNote} />`;
    } else if (activeTab === "history") {
      plannerContent = html`<${HistoryView} history=${state.history} users=${householdPeople} onClearHistory=${handleClearHistory} />`;
    }
  }

  /* ── Back-header for secondary screens ────────────────── */
  const secondaryScreens = ["notes", "inventory", "recipes", "history"];
  const isSecondaryScreen = secondaryScreens.includes(activeTab);

  return html`
    <div className="mrd-outer">
      <div className="mrd-shell">

        ${/* Status bar */null}
        <div className="mrd-statusbar">
          <span>9:41</span>
          <div className="mrd-statusbar-icons">
            <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
              <rect x="0" y="4" width="3" height="7" rx="1" fill="var(--mrd-fg)"/>
              <rect x="4" y="2.5" width="3" height="8.5" rx="1" fill="var(--mrd-fg)"/>
              <rect x="8" y="1" width="3" height="10" rx="1" fill="var(--mrd-fg)"/>
              <rect x="12" y="0" width="3" height="11" rx="1" fill="var(--mrd-fg)"/>
            </svg>
            <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
              <rect x="0.5" y="0.5" width="13" height="10" rx="2.5" stroke="var(--mrd-fg)" stroke-width="1.2"/>
              <rect x="14" y="3.5" width="1.5" height="4" rx="0.75" fill="var(--mrd-fg)"/>
              <rect x="2" y="2" width="9" height="7" rx="1.5" fill="var(--mrd-fg)"/>
            </svg>
          </div>
        </div>

        ${/* Main screen area */null}
        <div className="mrd-screen">

          ${/* Back header for secondary screens */null}
          ${isSecondaryScreen && !showSettings ? html`
            <div className="mrd-back-hdr">
              <button className="mrd-back-btn" onClick=${() => setActiveTab("home")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <span className="mrd-screen-title">
                ${{ notes: "Notes", inventory: "Inventaire", recipes: "Recettes", history: "Historique" }[activeTab] || ""}
              </span>
            </div>
          ` : null}

          ${/* Settings close header */null}
          ${showSettings && plannerUnlocked ? html`
            <div className="mrd-back-hdr">
              <button className="mrd-back-btn" onClick=${() => setShowSettings(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <span className="mrd-screen-title">Réglages</span>
            </div>
          ` : null}

          ${/* Errors */null}
          ${familyError || bootstrapError ? html`
            <div style=${{ padding: "0 14px" }}>
              ${familyError ? html`<div className="error-box">${familyError}</div>` : null}
              ${bootstrapError ? html`<div className="error-box">${bootstrapError}</div>` : null}
            </div>
          ` : null}

          ${/* Active person choice prompt */null}
          ${needsActivePersonChoice && !showSettings ? html`
            <section className="ncard active-person-card" style=${{ margin: "12px" }}>
              <div className="miniTitle">Cet appareil</div>
              <div className="st">Qui utilise l’application sur cet appareil ?</div>
              <div className="mini">Choisis une personne du foyer pour activer Mes tâches et les usages personnels sur ce téléphone.</div>
              <div className="tych active-person-choices">
                ${appPeopleRaw.map(
                  (person) => html`
                    <button key=${person.id} className="pc" onClick=${() => handleSetActivePerson(person.id)}>
                      ${person.displayName}
                    </button>
                  `,
                )}
              </div>
            </section>
          ` : null}

          ${/* Settings */null}
          ${showSettings || !plannerUnlocked
            ? html`
                <div className="cnt">
                  <${SettingsView}
                    isOnboarding=${!plannerUnlocked}
                    currentFamily=${currentFamily}
                    families=${safeFamilies}
                    currentRole=${currentRole}
                    userProfile=${userProfile}
                    linkedPerson=${linkedPerson}
                    memberDirectory=${memberDirectory}
                    activePersonId=${activePersonId}
                    deviceMode=${deviceMode}
                    people=${safePeople}
                    invitations=${invitations}
                    authMode=${passwordAvailable ? "password" : authMode}
                    syncLabel=${status}
                    dataMessage=${dataMessage}
                    emailMessage=${emailMessage}
                    passwordMessage=${passwordMessage}
                    accountMessage=${accountMessage}
                    appTimeMode=${appTimeMode}
                    simulatedDateTime=${simulatedDateTime}
                    currentAppDateLabel=${currentAppDateLabel}
                    linkedAccountChoices=${linkedAccountChoices}
                    linkedAccountLabels=${linkedAccountLabels}
                    importText=${importText}
                    showImport=${showImport}
                    onCreateFamily=${(name) => runFamilyAction(() => handleCreateFamily(name))}
                    onJoinFamily=${(code) => runFamilyAction(() => handleJoinFamily(code))}
                    onSwitchFamily=${(familyId) => runFamilyAction(() => setCurrentFamily(user.uid, familyId))}
                    onRenameFamily=${(name) => runFamilyAction(() => renameFamily(currentFamilyId, name))}
                    onAddPerson=${(person) => runFamilyAction(() => handleAddPerson(person))}
                    onUpdatePerson=${(personId, updates) => runFamilyAction(() => handleUpdatePerson(personId, updates))}
                    onDeletePerson=${(personId) => runFamilyAction(() => handleDeletePerson(personId))}
                    onMovePerson=${(personId, direction) => runFamilyAction(() => handleMovePerson(personId, direction))}
                    onChangeEmail=${handleChangeEmail}
                    onChangePassword=${handleChangePassword}
                    onChangeActivePerson=${handleSetActivePerson}
                    onChangeDeviceMode=${handleSetDeviceMode}
                    onCreateInvitation=${(personId, email) => runFamilyAction(() => handleCreateInvitation(personId, email))}
                    onToggleImport=${() => setShowImport((value) => !value)}
                    onUseRealDate=${handleSetRealDateMode}
                    onUseSimulatedDate=${handleSetSimulatedDateMode}
                    onChangeSimulatedDate=${handleChangeSimulatedDate}
                    onChangeSimulatedTime=${handleChangeSimulatedTime}
                    onShiftSimulatedDate=${handleShiftSimulatedDate}
                    onResetSimulatedDate=${handleResetSimulatedDateToToday}
                    onImportTextChange=${setImportText}
                    onImportData=${handleManualImport}
                    onExportData=${handleExportData}
                    onClearHistory=${handleClearHistory}
                    onResetPlanner=${handleResetPlanner}
                    onLogout=${() => signOutUser()}
                  />
                </div>
              `
            : activeTab === "home"
            ? html`
                <${HomeView}
                  tasks=${state.tasks}
                  meals=${state.meals}
                  recipes=${state.recipes}
                  agenda=${state.agenda}
                  people=${householdPeople}
                  familyName=${currentFamily?.name || ""}
                  currentDate=${getCurrentAppDate()}
                  onNavigate=${(tab) => { setShowSettings(false); setActiveTab(tab); }}
                  onOpenSettings=${() => setShowSettings(true)}
                />
              `
            : html`
                ${/* Screen header for main tabs */null}
                ${!isSecondaryScreen ? html`
                  <div className="mrd-screen-hdr">
                    <div className="mrd-screen-hdr-row">
                      <span className="mrd-screen-hdr-title">
                        ${{
                          daily: "Tâches", weekly: "Tâches", monthly: "Tâches", mine: "Tâches",
                          agenda: "Agenda", meals: "Repas", lists: "Listes",
                        }[activeTab] || ""}
                      </span>
                    </div>
                    ${["daily", "weekly", "monthly", "mine"].includes(activeTab) ? html`
                      <div className="mrd-subtabs">
                        ${[
                          { id: "daily",   label: "Aujourd’hui", icon: "☀️" },
                          { id: "weekly",  label: "Semaine",     icon: "🗓" },
                          { id: "monthly", label: "Mois",        icon: "📆" },
                          { id: "mine",    label: "Mes tâches",  icon: "👤" },
                        ].map(({ id, label, icon }) => html`
                          <button key=${id}
                            className=${"mrd-subtab-btn" + (activeTab === id ? " on" : "")}
                            onClick=${() => setActiveTab(id)}
                          >${icon} ${label}</button>
                        `)}
                      </div>
                    ` : null}
                  </div>
                ` : null}
                <main className="cnt">
                  ${plannerContent}
                </main>
              `}
        </div>

        ${/* Bottom nav — only for planner (not settings) */null}
        ${plannerUnlocked && !showSettings ? html`
          <${BottomNav}
            activeTab=${activeTab}
            onChange=${(tab) => { setShowSettings(false); setActiveTab(tab); }}
          />
        ` : null}

        ${/* FAB — tâches (ouvre la modale de création) */null}
        ${plannerUnlocked && !showSettings && ["daily","weekly","monthly","mine"].includes(activeTab) ? html`
          <button
            className="mrd-fab"
            onClick=${() => setTaskFabTrigger((n) => n + 1)}
            title="Nouvelle tâche"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
            </svg>
          </button>
        ` : null}

        ${/* Modals — absolute-positioned within the shell */null}
        ${selectedProfile
        ? html`
            <div className="modal-backdrop" onClick=${() => setProfilePersonId("")}>
              <div className="modal-card profile-card" onClick=${(event) => event.stopPropagation()}>
                <div className="task-modal-head">
                  <div>
                    <div className="miniTitle">${canEditSelectedProfile ? "Mon profil" : "Profil public"}</div>
                    <div className="st">${selectedProfile.label}</div>
                  </div>
                  <button className="delbtn" onClick=${() => setProfilePersonId("")}>X</button>
                </div>
                <div className="profile-hero">
                  <div className="profile-avatar" style=${{ background: (canEditSelectedProfile ? profileDraft.color : selectedProfile.color) || "#8B7355" }}>
                    ${(canEditSelectedProfile ? profileDraft.mood : selectedProfile.mood) || selectedProfile.shortId}
                  </div>
                  <div className="profile-meta">
                    <div className="profile-name">${canEditSelectedProfile ? profileDraft.displayName || selectedProfile.label : selectedProfile.label}</div>
                    ${selectedProfile.email ? html`<div className="mini">${selectedProfile.email}</div>` : null}
                    <div className="profile-message">
                      ${canEditSelectedProfile ? profileDraft.message || "Ajoute un petit mot visible par le foyer." : selectedProfile.message || "Aucun message public pour le moment."}
                    </div>
                  </div>
                </div>
                ${canEditSelectedProfile
                  ? html`
                      <div className="settings-actions">
                        <div className="miniTitle">Nom visible</div>
                        <input className="ainp" value=${profileDraft.displayName} onInput=${(event) => setProfileDraft({ ...profileDraft, displayName: event.target.value })} />
                      </div>
                      <div className="settings-actions">
                        <div className="miniTitle">Couleur personnelle</div>
                        <input className="ainp profile-color-input" type="color" value=${profileDraft.color || "#8B7355"} onInput=${(event) => setProfileDraft({ ...profileDraft, color: event.target.value })} />
                      </div>
                      <div className="settings-actions">
                        <div className="miniTitle">Humeur</div>
                        <div className="task-choice-row">
                          ${["😊", "😴", "😡", "🤍", "🌿", "✨"].map(
                            (mood) => html`<button type="button" className=${`task-choice ${profileDraft.mood === mood ? "on" : ""}`} onClick=${() => setProfileDraft({ ...profileDraft, mood })}>${mood}</button>`,
                          )}
                        </div>
                      </div>
                      <div className="settings-actions">
                        <div className="miniTitle">Petit message public</div>
                        <textarea className="nta profile-message-input" rows="3" maxlength="160" value=${profileDraft.message} onInput=${(event) => setProfileDraft({ ...profileDraft, message: event.target.value })}></textarea>
                      </div>
                      <div className="task-modal-actions">
                        <button className="acn" onClick=${() => setProfilePersonId("")}>Fermer</button>
                        <button className="aok" onClick=${() => runFamilyAction(() => handleSaveProfileCard())}>Enregistrer</button>
                      </div>
                    `
                  : html`
                      <div className="settings-actions">
                        <div className="miniTitle">Humeur</div>
                        <div className="profile-public-line">${selectedProfile.mood || "Aucune humeur partagee pour le moment."}</div>
                      </div>
                    `}
              </div>
            </div>
          `
        : null}
      ${toast?.text
        ? html`
            <div className="app-toast-wrap">
              <div className="app-toast">
                <span>${toast.text}</span>
                ${toast.action?.label
                  ? html`<button className="app-toast-action" onClick=${toast.action.onClick}>${toast.action.label}</button>`
                  : null}
              </div>
            </div>
          `
        : null}
      </div>
    </div>
  `;
}

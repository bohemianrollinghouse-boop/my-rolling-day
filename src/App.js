import { BottomNav } from "./components/nav/BottomNav.js?v=2026-04-24-tasks-nav-dnd-1";
import { FeedbackWidget } from "./components/feedback/FeedbackWidget.js?v=2026-05-06-feedback-1";
import { HomeView } from "./components/home/HomeView.js?v=2026-05-05-recipe-category-colors-1";
import { InventoryView } from "./components/inventory/InventoryView.js?v=2026-05-05-stability-fix-1";
import { ListsView } from "./components/lists/ListsView.js?v=2026-04-26-lists-ui-1";
import { AgendaView } from "./components/agenda/AgendaView.js?v=2026-05-05-agenda-notif-1";
import { AuthScreen } from "./components/auth/AuthScreen.js?v=2026-05-06-cocon-1";
import { OnboardingFlow } from "./components/auth/OnboardingFlow.js?v=2026-05-08-invite-fix-1";
import { HistoryView } from "./components/history/HistoryView.js?v=2026-04-19-user-profile-1";
import { MealsView } from "./components/meals/MealsView.js?v=2026-05-05-recipe-category-colors-1";
import { NotesView } from "./components/notes/NotesView.js?v=2026-05-05-notes-modal-2";
import { RecipesView } from "./components/recipes/RecipesView.js?v=2026-05-05-recipe-category-colors-2";
import { SettingsView } from "./components/settings/SettingsView.js?v=2026-05-08-invite-fix-1";
import { TasksView } from "./components/tasks/TasksView.js?v=2026-05-06-no-arrow-btns-1";
import { SegmentedTabs } from "./components/common/SegmentedTabs.js?v=2026-04-25-segmented-nav-1";
import { ProfileModal, NotifPromptModal, InviteCodesModal, HouseholdWelcomeModal } from "./components/modals/AppModals.js";
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
} from "./firebase/client.js?v=2026-05-08-offline-cache-1";
import { html, useEffect, useMemo, useRef, useState } from "./lib.js";
import { collectKnownProducts } from "./utils/productUtils.js?v=2026-04-19-meals-stock-3";
import { productMatchKey, toBaseQuantity, fromBaseQuantity } from "./utils/units.js";
import { readStoredActivePerson, storeActivePerson, readDeviceMode, storeDeviceMode } from "./utils/personStorage.js";
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
import { checkReset, createMealShell } from "./utils/state.js?v=2026-05-05-notifications-fix-1";
import { parseImportedState } from "./utils/storage.js?v=2026-05-05-notifications-fix-1";
import { usePlannerSync } from "./hooks/usePlannerSync.js?v=2026-05-08-offline-cache-1";
import { useAuth } from "./hooks/useAuth.js?v=2026-05-08-boot-timeout-1";
import { usePushMessaging } from "./hooks/usePushMessaging.js?v=2026-05-08-offline-cache-1";
import { useTasks } from "./hooks/useTasks.js?v=2026-05-05-notifications-fix-1";
import { useMeals } from "./hooks/useMeals.js?v=2026-05-05-notifications-fix-1";
import { useLists, ensureShoppingList } from "./hooks/useLists.js?v=2026-04-26-inventory-drag-note-1";
import { useAgenda } from "./hooks/useAgenda.js?v=2026-05-05-notifications-fix-1";
import { useTaskNotifications } from "./hooks/useTaskNotifications.js?v=2026-05-05-notifications-fix-1";
import { useAppRouting } from "./hooks/useAppRouting.js";




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
  return task.type;
}

function taskAppearsInTab(task, tab, planning) {
  return getTaskActiveTab(task, planning) === tab;
}



export function App() {
  const {
    user, authReady, bootLoading,
    startupStage, startupError, setStartupStage, setStartupError,
    userProfile, currentFamilyId, currentFamily, currentRole,
    safeFamilies, safeMembers, safePeople, appPeopleRaw, invitations,
    linkedPerson, householdPeople, agendaPeople, peopleBootstrapped,
    memberDirectory, linkedAccountChoices, linkedAccountLabels,
    authError, familyError, bootstrapError, setBootstrapError,
    accountMessage, setAccountMessage,
    emailMessage, passwordMessage,
    busy,
    runAuth, runFamilyAction,
    handleForgotPassword,
    handleChangeEmail, handleChangePassword,
    handlePreviewHouseholdInvitation,
    handleCreateHouseholdOnboarding,
    handleJoinHouseholdOnboarding,
    handleCreateFamily, handleJoinFamily, handleCreateInvitation,
    handleAddPerson, handleUpdatePerson, handleUpdateMemberRole, handleCompleteProfileSetup, handleDeletePerson, handleMovePerson,
    handleLeaveFamily, handleDeleteAccount, handleCancelProfileSetup,
  } = useAuth();

  const {
    pushToken,
    pushSyncing,
    pushError,
    requestPushPermission,
  } = usePushMessaging({
    userId: user?.uid || "",
    familyId: currentFamilyId || "",
    linkedPersonId: linkedPerson?.id || "",
  });

  const [activeTab, setActiveTab] = useState("home");
  const [toast, setToast] = useState(null);
  const [dataMessage, setDataMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [taskFabTrigger, setTaskFabTrigger] = useState(0);
  const [lastTaskTab, setLastTaskTab] = useState("daily");
  const [inventoryOrganiserMode, setInventoryOrganiserMode] = useState(
    () => { try { return localStorage.getItem("mrd-organiser-mode") === "true"; } catch { return false; } }
  );
  const [profilePersonId, setProfilePersonId] = useState("");
  const [activePersonId, setActivePersonId] = useState("");
  const [deviceMode, setDeviceMode] = useState("personal");
  const [profileDraft, setProfileDraft] = useState({ displayName: "", color: "#8B7355", mood: "", message: "" });
  const [authEntryPage, setAuthEntryPage] = useState("welcome");
  const [pendingSignupSetup, setPendingSignupSetup] = useState(false);
  const [pendingSignupDraftName, setPendingSignupDraftName] = useState("");
  const [showHouseholdWelcomeModal, setShowHouseholdWelcomeModal] = useState(false);
  const [postOnboardingState, setPostOnboardingState] = useState(null);
  const [postOnboardingInviteCodes, setPostOnboardingInviteCodes] = useState([]);
  const pendingPostOnboardingRef = useRef(null);
  const [settingsAutoOpenAddPersonSignal, setSettingsAutoOpenAddPersonSignal] = useState(0);
  const [settingsSupportPage, setSettingsSupportPage] = useState("");
  const [settingsSubPage, setSettingsSubPage] = useState("main");
  const [appTimeMode, setAppTimeModeState] = useState(() => getCurrentAppTimeMode());
  const [simulatedDateTime, setSimulatedDateTimeState] = useState(() => getSimulatedAppDateValue() || formatDateTimeInputValue(getCurrentAppDate()));
  const [appTimeVersion, setAppTimeVersion] = useState(0);

  // Guard : ouvre le setup à la connexion si l'user n'a pas encore de foyer.
  // Une fois activé, seul onDone() le ferme (évite la fermeture prématurée quand Firebase répond).
  const { state, setState, status, plannerError } = usePlannerSync(currentFamilyId, user?.uid);

  const activeHouseholdPerson = appPeopleRaw.find((person) => person.id === activePersonId) || null;
  const selectedProfile = householdPeople.find((person) => person.id === profilePersonId) || null;
  const canEditSelectedProfile = Boolean(selectedProfile && linkedPerson && selectedProfile.id === linkedPerson.id);
  const hasFamily = Boolean(currentFamilyId && currentFamily);
  const plannerUnlocked = hasFamily && safePeople.length > 0;
  // bootLoading comes from useAuth — single source of truth for the loading screen.
  // Only derive routing state once bootLoading is false.
  const { needsFamilySetup, profileGuardActive } = useAppRouting({
    bootLoading, user, userProfile, currentFamilyId, currentFamily, linkedPerson,
  });

  useEffect(() => {
    if (!profileGuardActive && pendingPostOnboardingRef.current) {
      const pending = pendingPostOnboardingRef.current;
      pendingPostOnboardingRef.current = null;
      document.querySelector(".mrd-home")?.scrollTo(0, 0);
      if (pending.inviteCodes.length) setPostOnboardingInviteCodes(pending.inviteCodes);
      if (pending.notifState) setPostOnboardingState(pending.notifState);
    }
  }, [profileGuardActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const canDiscardPendingSignup = pendingSignupSetup && !currentFamilyId && !linkedPerson?.id;
  const needsActivePersonChoice = plannerUnlocked && deviceMode === "shared" && !activeHouseholdPerson;
  const authMode = getCurrentAuthMode();
  const passwordAvailable = canChangePassword();
  const currentAppDate = useMemo(() => getCurrentAppDate(), [appTimeVersion]);
  const currentAppDateLabel = `${formatHeaderDate(currentAppDate)} - ${pad2(currentAppDate.getHours())}:${pad2(currentAppDate.getMinutes())}`;

  const stats = useMemo(() => {
    const total = state.tasks.length;
    const done = state.tasks.filter((task) => (Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || task.completedByPersonId).length;
    const nowMs = currentAppDate.getTime();
    const overdue = state.tasks.filter((task) => {
      if (task.taskKind === "recurring" || task.priority !== "deadline") return false;
      const doneBy = Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean) : [];
      if (doneBy.length || task.completedByPersonId) return false;
      if (task.overdue) return true;
      if (!task.dueDate) return false;
      const composed = task.dueTime ? `${task.dueDate}T${task.dueTime}` : `${task.dueDate}T23:59`;
      const parsed = new Date(composed);
      return !Number.isNaN(parsed.getTime()) && parsed.getTime() < nowMs;
    }).length;
    return {
      percentDone: total ? Math.round((done / total) * 100) : 0,
      overdueTaskCount: overdue,
      remaining: {
        daily: state.tasks.filter((task) => task.type === "daily" && !((Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || task.completedByPersonId)).length,
        weekly: state.tasks.filter((task) => task.type === "weekly" && !((Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || task.completedByPersonId)).length,
        monthly: state.tasks.filter((task) => task.type === "monthly" && !((Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || task.completedByPersonId)).length,
      },
    };
  }, [state, currentAppDate]);

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
        duration: entry.allDay ? 1440 : (entry.duration || 60),
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
    try { localStorage.setItem("mrd-organiser-mode", String(inventoryOrganiserMode)); } catch {}
  }, [inventoryOrganiserMode]);


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
      setShowHouseholdWelcomeModal(false);
      setPostOnboardingState(null);
      setPostOnboardingInviteCodes([]);
      setSettingsSupportPage("");
      setSettingsSubPage("main");
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

  useEffect(() => {
    if (["daily", "weekly", "monthly", "mine"].includes(activeTab)) {
      setLastTaskTab(activeTab);
    }
  }, [activeTab]);

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

  function handleBottomNavChange(tab) {
    setShowSettings(false);
    if (tab === "tasks") {
      setActiveTab(lastTaskTab || "daily");
      return;
    }
    setActiveTab(tab);
  }

  const { handleAddTask, handleUpdateTask, handleToggleTask, handleDeleteTask, handleMoveTask } = useTasks(updateState);

  useTaskNotifications({
    tasks: state.tasks,
    taskNotifications: state.taskNotifications,
    updateState,
  });

  function handleUpdateTaskNotifications(updates) {
    updateState((prev) => ({
      ...prev,
      taskNotifications: { ...(prev.taskNotifications || {}), ...updates },
    }));
  }
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
    handleCreateList, handleDeleteList, handleUpdateList, handleMoveList,
    handleAddListItem, handleUpdateListItem, handleToggleListItem, handleDeleteListItem, handleClearShoppingList, handleClearCheckedItems, handleCheckAllItems,
    handleAddInventoryItem, handleUpdateInventoryItem, handleDeleteInventoryItem, handleClearFinishedInventory, handleClearAllInventory, handleSendInventoryToShopping, handleReorderInventoryItems,
    handleAddStorageLocation, handleRenameStorageLocation, handleDeleteStorageLocation, handleSetItemLocation,
  } = useLists(state, updateState, showToast);
  const {
    handleAddAgenda, handleUpdateAgenda, handleDeleteAgenda,
    handleAddRecurring, handleUpdateRecurring, handleDeleteRecurring,
  } = useAgenda(state, updateState);

  function handleReorderStorageLocations(orderedIds) {
    updateState((previous) => {
      const locs = Array.isArray(previous.storageLocations) ? previous.storageLocations : [];
      const reordered = orderedIds.map((id) => locs.find((l) => l.id === id)).filter(Boolean);
      const missing = locs.filter((l) => !orderedIds.includes(l.id));
      return { ...previous, storageLocations: [...reordered, ...missing] };
    });
  }

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
    showToast("✓ Profil mis à jour");
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

  function computeMealCookState(previous, day, slot, weekKey) {
    const wk = weekKey || "";
    // Même logique que matchMeal dans useMeals : les repas sans weekKey matchent toujours
    const matchFn = (meal) => {
      if (meal.day !== day) return false;
      const mwk = meal.weekKey || "";
      return mwk === wk || (mwk === "" && wk !== "");
    };
    const existing = previous.meals.find(matchFn);
    const baseMeals = existing
      ? [...previous.meals]
      : [...previous.meals, createMealShell(day, previous.meals.length, wk)];

    const targetMeal = baseMeals.find(matchFn);
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
      meals: baseMeals.map((meal) => (matchFn(meal) ? { ...meal, weekKey: wk, [cookedKey]: nextCooked } : meal)),
      inventory: nextInventory,
      nextCooked,
      recipeId,
      deductedAny,
    };
  }

  function handleToggleCookWithInventory(day, slot, weekKey) {
    const wk = weekKey || "";
    const beforeInventory = state.inventory;
    const computed = computeMealCookState(state, day, slot, wk);
    if (!computed) return;

    updateState((previous) => {
      const recomputed = computeMealCookState(previous, day, slot, wk);
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
              const matchFn = (meal) => { if (meal.day !== day) return false; const mwk = meal.weekKey || ""; return mwk === wk || (mwk === "" && wk !== ""); };
              const existing = previous.meals.find(matchFn);
              const baseMeals = existing
                ? [...previous.meals]
                : [...previous.meals, createMealShell(day, previous.meals.length, wk)];
              const cookedKey = slot === "lunch" ? "lunchCooked" : "dinnerCooked";
              return {
                ...previous,
                meals: baseMeals.map((meal) => (matchFn(meal) ? { ...meal, [cookedKey]: false } : meal)),
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


  // ── Routing: single decision tree, zero intermediate renders ───────────────
  // 1. Error
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

  // 2. Splash — one single element kept in place throughout all boot phases so
  //    the CSS animation never restarts. bootLoading comes from useAuth and is
  //    the only place that decides "we don't know enough yet".
  if (bootLoading) {
    return html`
      <div className="ldr" aria-label="Chargement">
        <div className="ldr-mark">
          <svg viewBox="0 0 96 96" width="96" height="96" fill="none">
            <circle className="spl-ring" cx="48" cy="48" r="34" stroke="#B85F4A" stroke-width="3" stroke-linecap="round" stroke-dasharray="4 8" opacity="0.55"/>
            <circle className="spl-inner" cx="48" cy="48" r="22" stroke="#B85F4A" stroke-width="3" stroke-linecap="round"/>
            <circle className="spl-dot" cx="48" cy="14" r="5" fill="#B85F4A"/>
          </svg>
        </div>
        <div className="ldr-wordmark">my <em>rolling</em> day</div>
        <div className="ldr-tag">Le foyer, jour après jour</div>
        <div className="ldr-text">On prépare ta journée…</div>
      </div>
    `;
  }

  // 3. Auth — bootLoading is false AND user is null → definitively logged out
  if (!user) {
    return html`
      <${AuthScreen}
        initialPage=${authEntryPage}
        errorMessage=${authError}
        loading=${busy}
        onGoogleLogin=${() => {
          setPendingSignupSetup(false);
          setPendingSignupDraftName("");
          return runAuth(() => signInWithGoogle());
        }}
        onEmailLogin=${(form) => {
          setAuthEntryPage("login");
          setPendingSignupSetup(false);
          setPendingSignupDraftName("");
          return runAuth(() => signInWithEmail(form.email, form.password));
        }}
        onEmailSignup=${(form) => {
          setPendingSignupSetup(true);
          setPendingSignupDraftName("");
          return runAuth(() => signUpWithEmail(form));
        }}
        onForgotPassword=${(email) => handleForgotPassword(email)}
      />
    `;
  }

  // 4. (Onboarding handled below via profileGuardActive, which is also gated on !bootLoading)

  if (profileGuardActive) {
    return html`
      <${OnboardingFlow}
        user=${user}
        userProfile=${userProfile}
        currentFamily=${currentFamily}
        linkedPerson=${linkedPerson}
        draftDisplayName=${pendingSignupDraftName}
        accountMessage=${accountMessage}
        busy=${busy}
        errorMessage=${familyError}
        onPreviewInvitationCode=${(code) => runFamilyAction(() => handlePreviewHouseholdInvitation(code))}
        onCreateHousehold=${(payload) => runFamilyAction(async () => {
          const result = await handleCreateHouseholdOnboarding(payload);
          setPendingSignupSetup(false);
          setPendingSignupDraftName("");
          setShowSettings(false);
          setActiveTab("home");
          const inviteCodes = Array.isArray(result?.invitations) ? result.invitations.filter((item) => item.code) : [];
          const alreadySeen = localStorage.getItem("mrd_notifications_prompt_seen") === "true";
          const notifState = !alreadySeen ? "notify" : (inviteCodes.length ? "invite-codes" : null);
          if (notifState || inviteCodes.length) {
            pendingPostOnboardingRef.current = { notifState, inviteCodes };
          }
        })}
        onJoinHousehold=${(payload) => runFamilyAction(async () => {
          await handleJoinHouseholdOnboarding(payload);
          setPendingSignupSetup(false);
          setPendingSignupDraftName("");
          setShowSettings(false);
          setActiveTab("home");
          const alreadySeen = localStorage.getItem("mrd_notifications_prompt_seen") === "true";
          if (!alreadySeen) {
            pendingPostOnboardingRef.current = { notifState: "notify", inviteCodes: [] };
          }
        })}
        onCompleteExistingProfile=${(payload) => runFamilyAction(async () => {
          await handleCompleteProfileSetup(payload);
          setPendingSignupSetup(false);
          setPendingSignupDraftName("");
          setShowSettings(false);
          setActiveTab("home");
          const alreadySeen = localStorage.getItem("mrd_notifications_prompt_seen") === "true";
          if (!alreadySeen) {
            pendingPostOnboardingRef.current = { notifState: "notify", inviteCodes: [] };
          }
        })}
        onChangeAccount=${() => {
          setAuthEntryPage("login");
          setPendingSignupDraftName("");
          const discardDraft = canDiscardPendingSignup;
          setPendingSignupSetup(false);
          return runFamilyAction(() => handleCancelProfileSetup({ discardDraft }));
        }}
      />
    `;
  }

  let plannerContent = null;
  if (plannerUnlocked && !showSettings) {
    if (activeTab === "mine" || activeTab === "daily" || activeTab === "weekly" || activeTab === "monthly") {
      function isMineTask(task) {
        if (!activePersonId) return false;
        // Tâche explicitement assignée à cette personne
        if (Array.isArray(task.assignedPersonIds) && task.assignedPersonIds.includes(activePersonId)) return true;
        // Compatibilité ancienne structure (champ unique assignedPersonId)
        if (!Array.isArray(task.assignedPersonIds) || !task.assignedPersonIds.length) {
          return Boolean(task.assignedPersonId && task.assignedPersonId === activePersonId);
        }
        // assignedWholeFamily seul (= pas d'assignation explicite) → n'apparaît pas dans "Mes tâches"
        return false;
      }
      const visibleTasks =
        activeTab === "mine"
          ? state.tasks.filter(isMineTask)
          : visibleTasksByTab[activeTab] || [];
      // Pour "Mes tâches" : n'exposer que les tâches de l'utilisateur actif,
      // y compris les tâches "à faire avant", pour éviter qu'elles apparaissent
      // dans la section deadline sans être assignées à cet utilisateur.
      const allTasksForTab =
        activeTab === "mine"
          ? state.tasks.filter(isMineTask)
          : state.tasks;
      plannerContent = html`
        <${TasksView}
          tab=${activeTab}
          tasks=${visibleTasks}
          allTasks=${allTasksForTab}
          people=${householdPeople}
          childProfiles=${agendaPeople.filter((person) => person.profileMode === "context" || person.type === "child" || person.type === "animal")}
          planningByTask=${taskPlanningById}
          activePersonId=${activePersonId}
          activePersonLabel=${activeHouseholdPerson?.displayName || activeHouseholdPerson?.label || ""}
          externalOpenCreate=${taskFabTrigger}
          onAddTask=${(task) => { handleAddTask(task); showToast("✓ Tâche créée"); }}
          onUpdateTask=${(id, updates) => { handleUpdateTask(id, updates); showToast("✓ Tâche mise à jour"); }}
          onToggleTask=${handleToggleTask}
          onDeleteTask=${(id) => { handleDeleteTask(id); showToast("Tâche supprimée"); }}
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
          onAddAgenda=${(ev) => { handleAddAgenda(ev); showToast("✓ Événement ajouté"); }}
          onUpdateAgenda=${(id, updates) => { handleUpdateAgenda(id, updates); showToast("✓ Événement mis à jour"); }}
          onDeleteAgenda=${(id) => { handleDeleteAgenda(id); showToast("Événement supprimé"); }}
          onAddRecurring=${(ev) => { handleAddRecurring(ev); showToast("✓ Événement récurrent ajouté"); }}
          onUpdateRecurring=${(id, updates) => { handleUpdateRecurring(id, updates); showToast("✓ Événement mis à jour"); }}
          onDeleteRecurring=${(id) => { handleDeleteRecurring(id); showToast("Événement supprimé"); }}
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
            showToast(`✓ ${items.length} ingrédient${items.length > 1 ? "s" : ""} ajouté${items.length > 1 ? "s" : ""} à la liste de courses`);
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
          onMoveList=${handleMoveList}
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
          organiserMode=${inventoryOrganiserMode}
          storageLocations=${state.storageLocations || []}
          productLocationMemory=${state.productLocationMemory || {}}
          onAddInventoryItem=${handleAddInventoryItem}
          onUpdateInventoryItem=${handleUpdateInventoryItem}
          onDeleteInventoryItem=${handleDeleteInventoryItem}
          onClearFinishedInventory=${handleClearFinishedInventory}
          onClearAllInventory=${handleClearAllInventory}
          onSendInventoryToShopping=${handleSendInventoryToShopping}
          onAddStorageLocation=${handleAddStorageLocation}
          onRenameStorageLocation=${handleRenameStorageLocation}
          onDeleteStorageLocation=${handleDeleteStorageLocation}
          onSetItemLocation=${handleSetItemLocation}
          onReorderStorageLocations=${handleReorderStorageLocations}
          onReorderInventoryItems=${handleReorderInventoryItems}
        />
      `;
    } else if (activeTab === "recipes") {
      const recipesShoppingList = ensureShoppingList(state.lists).find((list) => list.isShoppingList);
      plannerContent = html`<${RecipesView}
        recipes=${state.recipes}
        inventory=${state.inventory}
        knownProducts=${knownProducts}
        customCondiments=${state.customCondiments || []}
        onAddCustomCondiment=${handleAddCustomCondiment}
        onDeleteCustomCondiment=${handleDeleteCustomCondiment}
        onAddRecipe=${(recipe) => { handleAddRecipe(recipe); showToast("✓ Recette ajoutée"); }}
        onUpdateRecipe=${(id, updates) => { handleUpdateRecipe(id, updates); showToast("✓ Recette mise à jour"); }}
        onDeleteRecipe=${(id) => { handleDeleteRecipe(id); showToast("Recette supprimée"); }}
        onLoadDemoRecipes=${handleLoadDemoRecipes}
        onAddRecipeIngredientsToShopping=${(items) => {
          if (!recipesShoppingList?.id || !Array.isArray(items) || !items.length) return;
          items.forEach((item) =>
            handleAddListItem(recipesShoppingList.id, {
              text: item.name,
              quantity: item.quantity || "",
              unit: item.unit || "",
            }),
          );
          showToast(`✓ ${items.length} ingrédient${items.length > 1 ? "s" : ""} ajouté${items.length > 1 ? "s" : ""} à la liste de courses`);
        }}
        onOpenMealsTab=${() => setActiveTab("meals")}
        onBack=${() => setActiveTab("home")}
      />`;
    } else if (activeTab === "notes") {
      const visibleNotes = state.notes.filter((note) => {
        if (note.visibility === "private") return !note.createdBy || note.createdBy === activePersonId;
        if (note.visibility === "shared") return note.createdBy === activePersonId || (note.sharedWith || []).includes(activePersonId);
        return true;
      });
      plannerContent = html`<${NotesView}
        notes=${visibleNotes}
        activePersonId=${activePersonId}
        people=${householdPeople}
        onAddNote=${(text, vis, shared) => { handleAddNote(text, vis, shared); showToast("✓ Note enregistrée"); }}
        onDeleteNote=${(id) => { handleDeleteNote(id); showToast("Note supprimée"); }}
        onUpdateNote=${(id, updates) => { handleUpdateNote(id, updates); showToast("✓ Note mise à jour"); }}
      />`;
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


        ${/* Main screen area */null}
        <div className="mrd-screen">

          ${/* Back header for secondary screens */null}
          ${isSecondaryScreen && !showSettings && activeTab !== "recipes" ? html`
            <div className=${`mrd-back-hdr${activeTab === "inventory" ? " mrd-back-hdr-with-side" : ""}`}>
              <div className="mrd-back-hdr-main">
                <button className="mrd-back-btn" onClick=${() => setActiveTab("home")}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="var(--mrd-fg2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <span className="mrd-screen-title">
                  ${{ notes: "Notes", inventory: "Inventaire", recipes: "Recettes", history: "Historique" }[activeTab] || ""}
                </span>
              </div>
              ${activeTab === "inventory" ? html`
                <div className="mrd-back-hdr-side">
                  <span className=${`mrd-hdr-switch-label${inventoryOrganiserMode ? " on" : ""}`}>Organiser</span>
                  <button
                    type="button"
                    className=${`mrd-hdr-switch${inventoryOrganiserMode ? " on" : ""}`}
                    onClick=${() => setInventoryOrganiserMode((value) => !value)}
                    aria-pressed=${inventoryOrganiserMode ? "true" : "false"}
                  >
                    <span className="mrd-hdr-switch-knob"></span>
                  </button>
                </div>
              ` : null}
            </div>
          ` : null}

          ${/* Settings close header */null}
          ${showSettings && plannerUnlocked ? html`
            <div className="mrd-back-hdr">
              <button className="mrd-back-btn" onClick=${() => {
                if (settingsSupportPage) {
                  setSettingsSupportPage("");
                  return;
                }
                if (settingsSubPage !== "main") {
                  setSettingsSubPage("main");
                  return;
                }
                setShowSettings(false);
              }}>
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
                <div className="cnt cnt--settings">
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
                    onUpdateMemberRole=${(uid, role) => runFamilyAction(() => handleUpdateMemberRole(uid, role))}
                    onDeletePerson=${(personId) => runFamilyAction(() => handleDeletePerson(personId))}
                    onMovePerson=${(personId, direction) => runFamilyAction(() => handleMovePerson(personId, direction))}
                    onChangeEmail=${handleChangeEmail}
                    onChangePassword=${handleChangePassword}
                    onLeaveFamily=${() => runFamilyAction(() => handleLeaveFamily())}
                    onDeleteAccount=${(currentPassword) => runFamilyAction(async () => {
                      await handleDeleteAccount(currentPassword);
                      setAuthEntryPage("login");
                    })}
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
                    autoOpenAddPersonSignal=${settingsAutoOpenAddPersonSignal}
                    onConsumeAutoOpenAddPersonSignal=${() => setSettingsAutoOpenAddPersonSignal(0)}
                    taskNotifications=${state.taskNotifications}
                    onUpdateTaskNotifications=${handleUpdateTaskNotifications}
                    pushToken=${pushToken}
                    pushSyncing=${pushSyncing}
                    pushError=${pushError}
                    onRequestPushPermission=${requestPushPermission}
                    settingsPage=${settingsSubPage}
                    onSettingsPageChange=${setSettingsSubPage}
                    supportPage=${settingsSupportPage}
                    onSupportPageChange=${setSettingsSupportPage}
                    busy=${busy}
                    onLogout=${() => {
                      setAuthEntryPage("welcome");
                      return signOutUser();
                    }}
                  />
                </div>
              `
            : activeTab === "home"
            ? html`
                <${HomeView}
                  tasks=${state.tasks}
                  meals=${state.meals}
                  recipes=${state.recipes}
                  notes=${state.notes}
                  lists=${state.lists}
                  inventory=${state.inventory}
                  agenda=${state.agenda}
                  recurringEvents=${state.recurringEvents}
                  people=${householdPeople}
                  familyName=${currentFamily?.name || ""}
                  currentDate=${getCurrentAppDate()}
                  activePersonId=${activePersonId}
                  pendingShoppingCount=${(() => {
                    const sl = state.lists.find((l) => l.isShoppingList);
                    return sl ? (sl.items || []).filter((i) => !i.checked).length : 0;
                  })()}
                  onToggleTask=${handleToggleTask}
                  onNavigate=${(tab) => { setShowSettings(false); setActiveTab(tab); }}
                  onOpenSettings=${() => setShowSettings(true)}
                />
              `
            : html`
                ${/* Screen header for main tabs */null}
                ${!isSecondaryScreen && activeTab !== "lists" ? html`
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
                      <${SegmentedTabs}
                        ariaLabel="Navigation des tâches"
                        options=${[
                          { id: "daily",   emoji: "☀️",  label: "Aujourd’hui" },
                          { id: "weekly",  emoji: "📆",  label: "Semaine" },
                          { id: "monthly", emoji: "🗓️", label: "Mois" },
                          { id: "mine",    emoji: "👤",  label: "Mes tâches" },
                        ]}
                        activeId=${activeTab}
                        onChange=${setActiveTab}
                      />
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
            onChange=${handleBottomNavChange}
            overdueTaskCount=${stats.overdueTaskCount}
          />
        ` : null}

        ${/* FAB — tâches (ouvre la modale de création) */null}
        ${plannerUnlocked && !showSettings && ["home","daily","weekly","monthly","mine"].includes(activeTab) ? html`
          <button
            className="mrd-fab"
            onClick=${() => {
              if (activeTab === "home") {
                setActiveTab("daily");
                setTimeout(() => setTaskFabTrigger((n) => n + 1), 60);
              } else {
                setTaskFabTrigger((n) => n + 1);
              }
            }}
            title="Nouvelle tâche"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
            </svg>
          </button>
        ` : null}

        ${/* Modals — absolute-positioned within the shell */null}
        ${selectedProfile ? html`
          <${ProfileModal}
            profile=${selectedProfile}
            canEdit=${canEditSelectedProfile}
            draft=${profileDraft}
            onDraftChange=${setProfileDraft}
            onClose=${() => setProfilePersonId("")}
            onSave=${() => runFamilyAction(() => handleSaveProfileCard())}
          />
        ` : null}
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

      ${postOnboardingState === "notify" ? html`
        <${NotifPromptModal}
          onActivate=${async () => {
            localStorage.setItem("mrd_notifications_prompt_seen", "true");
            try { await requestPushPermission(); } catch (_) {}
            setPostOnboardingState(postOnboardingInviteCodes.length ? "invite-codes" : null);
          }}
          onLater=${() => {
            localStorage.setItem("mrd_notifications_prompt_seen", "true");
            setPostOnboardingState(postOnboardingInviteCodes.length ? "invite-codes" : null);
          }}
        />
      ` : null}

      ${postOnboardingState === "invite-codes" && postOnboardingInviteCodes.length ? html`
        <${InviteCodesModal}
          inviteCodes=${postOnboardingInviteCodes}
          onClose=${() => { setPostOnboardingState(null); setPostOnboardingInviteCodes([]); }}
        />
      ` : null}

      ${plannerUnlocked && showHouseholdWelcomeModal ? html`
        <${HouseholdWelcomeModal}
          onClose=${() => setShowHouseholdWelcomeModal(false)}
          onAddMembers=${() => {
            setShowHouseholdWelcomeModal(false);
            setShowSettings(true);
            setSettingsAutoOpenAddPersonSignal((value) => value + 1);
          }}
        />
      ` : null}
      </div>

      <${FeedbackWidget} user=${user} currentPage=${activeTab || ""} />
    </div>
  `;
}

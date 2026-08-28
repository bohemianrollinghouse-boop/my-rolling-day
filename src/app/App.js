import { DEFAULT_MEMBER_COLOR } from "./config/constants.js";
import { BottomNav, QUICK_MENU_ITEMS } from "./components/nav/BottomNav.js";
import { FeedbackWidget } from "./components/FeedbackWidget.js";
import { HomeView } from "./pages/home/HomeView.js";
import { AuthScreen } from "./pages/auth/AuthScreen.js";
import { SegmentedTabs } from "./components/SegmentedTabs.js";
import { ProfileModal, NotifPromptModal, InviteCodesModal, HouseholdWelcomeModal, NotificationModal, StaleTaskModal } from "./modals/AppModals.js";
import {
  canChangePassword,
  getCurrentAuthMode,
  renameFamily,
  setFamilyPremiumOverride,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
  updateFamilyPerson,
} from "./providers/client.js";
import { html, lazy, Suspense, useEffect, useMemo, useRef, useState } from "./lib.js";

/* ── Vues chargees a la demande ─────────────────────────────────────────
   Chaque vue devient son propre fichier, telecharge au premier affichage
   de l'ecran plutot qu'au demarrage.

   Deux vues restent volontairement statiques : `HomeView` et
   `AuthScreen`. Ce sont les deux ecrans d'arrivee — l'un pour une session
   ouverte, l'autre pour une session fermee. Les rendre paresseux
   ajouterait une attente au demarrage au lieu d'en retirer une.

   `lazy()` attend un export par defaut ; toutes les vues du depot sont des
   exports nommes, d'ou le `.then()` qui reemballe. C'est la seule raison
   de cette forme, il n'y a rien de subtil derriere.

   Chaque site de rendu est enveloppe dans un `Suspense` — voir
   `screenPage` et le retour anticipe des reglages. */
/* Repli affiche pendant le telechargement d'une vue.

   Volontairement vide plutot qu'un spinner : en natif, les chunks sont
   servis depuis le systeme de fichiers et l'attente dure une image ou
   deux — un spinner ne ferait que clignoter. Le conteneur garde la classe
   d'ecran pour que la zone ne se replie pas pendant l'echange. */
const SCREEN_FALLBACK = html`<div className="mrd-screen mrd-screen--loading" />`;

const InboxView = lazy(() => import("./pages/inbox/InboxView.js").then((m) => ({ default: m.InboxView })));
const InventoryView = lazy(() => import("./pages/inventory/InventoryView.js").then((m) => ({ default: m.InventoryView })));
const ListsView = lazy(() => import("./pages/lists/ListsView.js").then((m) => ({ default: m.ListsView })));
const AgendaView = lazy(() => import("./pages/agenda/AgendaView.js").then((m) => ({ default: m.AgendaView })));
const OnboardingFlow = lazy(() => import("./pages/auth/OnboardingFlow.js").then((m) => ({ default: m.OnboardingFlow })));
const HistoryView = lazy(() => import("./pages/history/HistoryView.js").then((m) => ({ default: m.HistoryView })));
const MealsView = lazy(() => import("./pages/meals/MealsView.js").then((m) => ({ default: m.MealsView })));
const NotesView = lazy(() => import("./pages/notes/NotesView.js").then((m) => ({ default: m.NotesView })));
const RecipesView = lazy(() => import("./pages/recipes/RecipesView.js").then((m) => ({ default: m.RecipesView })));
const SettingsView = lazy(() => import("./pages/settings/SettingsView.js").then((m) => ({ default: m.SettingsView })));
const TasksView = lazy(() => import("./pages/tasks/TasksView.js").then((m) => ({ default: m.TasksView })));
const PremiumLockScreen = lazy(() => import("./pages/premium/PremiumLockScreen.js").then((m) => ({ default: m.PremiumLockScreen })));
import { collectKnownProducts } from "./utils/productUtils.js";
import { readStoredActivePerson, storeActivePerson, readDeviceMode, storeDeviceMode } from "./utils/personStorage.js";
import {
  formatHeaderDate,
  getCurrentAppDate,
  localDateKey,
  pad2,
} from "./utils/date.js";
import { checkReset } from "./utils/state.js";
import { shouldShowNotifPrompt, markNotifPromptGranted, markNotifPromptDismissed, getNotifPromptDismissCount } from "./utils/storage.js";
import { Capacitor } from "@capacitor/core";
import { initNotifications, requestNotificationPermission } from "./plugins/notifications.js";
import { applyTheme, readStoredTheme } from "./utils/theme.js";
import { usePlannerSync } from "./hooks/usePlannerSync.js";
import { useAuth } from "./hooks/useAuth.js";
import { usePushMessaging } from "./hooks/usePushMessaging.js";
import { useTasks } from "./hooks/useTasks.js";
import { useMeals } from "./hooks/useMeals.js";
import { useLists, ensureShoppingList } from "./hooks/useLists.js";
import { useAgenda } from "./hooks/useAgenda.js";
import { useTaskNotifications } from "./hooks/useTaskNotifications.js";
import { useStaleTaskAlerts } from "./hooks/useStaleTaskAlerts.js";
import { useAppRouting } from "./hooks/useAppRouting.js";
import { useNotes } from "./hooks/useNotes.js";
import { useInbox } from "./hooks/useInbox.js";
import { useAppTime } from "./hooks/useAppTime.js";
import { usePlannerData } from "./hooks/usePlannerData.js";
import { useMealCooking } from "./hooks/useMealCooking.js";
import {
  IonActionSheet,
  IonApp,
  IonBackButton,
  IonToast,
  IonToggle,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  IonRoute,
  IonRouterOutlet,
  IonTabs,
} from "@ionic/react";
import { IonReactRouter } from "@ionic/react-router";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { isPremiumTab } from "./utils/premium.js";
import {
  HOME_PATH,
  SETTINGS_PATH,
  SETTINGS_SECTIONS,
  SUPPORT_PAGES,
  TASK_PERIODS,
  isSecondaryScreen as isSecondaryScreenId,
  isSettingsPath,
  pathForTab,
  settingsPathFor,
  settingsStateFromPath,
  tabFromPath,
} from "./routes.js";




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
  // Si la tâche est planifiée dans l'agenda pour aujourd'hui → elle remonte dans le quotidien
  if (tab === "daily" && planning?.dateKey) {
    if (planning.dateKey === localDateKey(getCurrentAppDate())) return true;
  }
  return getTaskActiveTab(task, planning) === tab;
}



/**
 * Racine de l'application.
 *
 * `IonApp` et `IonReactRouter` doivent envelopper tout le reste : `AppShell`
 * utilise `useLocation` / `useNavigate`, qui exigent d'être sous le routeur.
 * D'où la séparation en deux composants — `AppShell` est l'ancien `App`.
 */
export function App() {
  return html`
    <${IonApp}>
      <${IonReactRouter}>
        <${AppShell} />
      <//>
    <//>
  `;
}

function AppShell() {
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
    handleCreateFamily, handleJoinFamily, handleSwitchFamily, handleCreateInvitation,
    handleAddPerson, handleUpdatePerson, handleUpdateMemberRole, handleCompleteProfileSetup, handleDeletePerson, handleMovePerson,
    handleLeaveFamily, handleDeleteFamily, handleDeleteFamilyById, handleDeleteAccount, handleCancelProfileSetup,
  } = useAuth();

  // État popup notification — défini avant usePushMessaging pour pouvoir le passer en callback
  const [notifPopup, setNotifPopup] = useState(null);

  const {
    pushToken,
    pushSyncing,
    pushError,
    pushPermission,
    requestPushPermission,
  } = usePushMessaging({
    userId: user?.uid || "",
    familyId: currentFamilyId || "",
    linkedPersonId: linkedPerson?.id || "",
    onForegroundMessage: setNotifPopup,
  });

  /* ── Écran courant : dérivé de l'URL, plus d'un useState ──────────────
     Le routeur est désormais la source de vérité. `activeTab` et
     `setActiveTab` gardent volontairement leur nom et leur vocabulaire
     historique (« daily », « weekly »… et non « tasks ») : les 34 lectures
     et 17 écritures réparties dans ce fichier continuent de fonctionner
     sans être touchées, et la traduction vit dans `src/routes.js`.

     `replace` sert au retour depuis les réglages : on remplace l'entrée
     d'historique au lieu d'en empiler une, sinon le bouton retour du
     téléphone ramènerait dans les réglages qu'on vient de quitter. */
  const location = useLocation();
  const navigate = useNavigate();
  const showSettings = isSettingsPath(location.pathname);
  const activeTab = tabFromPath(location.pathname);

  /* `go` remplace les appels directs a `navigate` pour une raison precise :
     plusieurs endroits enchaînent deux changements d'etat qui visaient la meme
     destination (par exemple « efface la sous-page » puis « ouvre la section »).
     Avec des routes, cela empilait deux entrees d'historique identiques et le
     bouton retour paraissait ne rien faire au premier appui. */
  function go(path, { replace = false } = {}) {
    if (path === location.pathname) return;
    navigate(path, { replace });
  }

  function setActiveTab(tab, { replace = false } = {}) {
    go(pathForTab(tab), { replace });
  }

  /* Dernier écran hors réglages, pour savoir où revenir en fermant les
     réglages. `navigate(-1)` serait plus court mais faux : on entre aussi
     dans les réglages depuis l'onboarding ou depuis un lien direct, où
     l'entrée précédente n'existe pas ou n'est pas un écran de planning. */
  const lastPlannerPathRef = useRef(HOME_PATH);
  useEffect(() => {
    if (!isSettingsPath(location.pathname)) lastPlannerPathRef.current = location.pathname;
  }, [location.pathname]);

  function setShowSettings(open) {
    if (open) {
      go(SETTINGS_PATH);
      return;
    }
    go(lastPlannerPathRef.current || HOME_PATH, { replace: true });
  }

  /* Sous-pages des réglages : dérivées de l'URL, comme `activeTab`. Les noms
     et le vocabulaire des props de `SettingsView` sont conservés (`"main"` pour
     le sommaire, `""` pour « pas dans une page de support »), donc la vue n'a
     pas été touchée. */
  const {
    appTimeMode, simulatedDateTime, appTimeVersion,
    handleSetRealDateMode, handleSetSimulatedDateMode,
    handleChangeSimulatedDate, handleChangeSimulatedTime,
    handleShiftSimulatedDate, handleResetSimulatedDateToToday,
  } = useAppTime();

  const { section: settingsSubPage, support: settingsSupportPage } =
    settingsStateFromPath(location.pathname);

  function setSettingsSubPage(section) {
    go(settingsPathFor(section));
  }

  function setSettingsSupportPage(page) {
    go(settingsPathFor(settingsSubPage, page));
  }

  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [taskFabTrigger, setTaskFabTrigger] = useState(0);
  const [lastTaskTab, setLastTaskTab] = useState("daily");
  const [inventoryOrganiserMode, setInventoryOrganiserMode] = useState(
    () => { try { return localStorage.getItem("mrd-organiser-mode") === "true"; } catch { return false; } }
  );
  const [profilePersonId, setProfilePersonId] = useState("");
  const [activePersonId, setActivePersonId] = useState("");
  const [deviceMode, setDeviceMode] = useState("personal");
  const [profileDraft, setProfileDraft] = useState({ displayName: "", color: DEFAULT_MEMBER_COLOR, mood: "", message: "" });
  const [authEntryPage, setAuthEntryPage] = useState("welcome");
  const [pendingSignupSetup, setPendingSignupSetup] = useState(false);
  const [pendingSignupDraftName, setPendingSignupDraftName] = useState("");
  const [showHouseholdWelcomeModal, setShowHouseholdWelcomeModal] = useState(false);
  const [postOnboardingState, setPostOnboardingState] = useState(null);
  const [postOnboardingInviteCodes, setPostOnboardingInviteCodes] = useState([]);
  const pendingPostOnboardingRef = useRef(null);
  // Connexion explicite (bouton) dans cette session — déclenche la proposition
  // de notifications une fois le foyer chargé.
  const justLoggedInRef = useRef(false);
  const [settingsAutoOpenAddPersonSignal, setSettingsAutoOpenAddPersonSignal] = useState(0);
  const isPremium = Boolean(currentFamily?.premiumOverride);
  const openPremiumSettings = () => { setSettingsSubPage("main"); setShowSettings(true); };
  const handleActivatePremium = () => runFamilyAction(() => setFamilyPremiumOverride(currentFamilyId, true));

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
    if (profileGuardActive) return;
    // Post-onboarding : consommer le pending (création / rejoindre / profil existant)
    if (pendingPostOnboardingRef.current) {
      const pending = pendingPostOnboardingRef.current;
      pendingPostOnboardingRef.current = null;
      document.querySelector(".mrd-home")?.scrollTo(0, 0);
      if (pending.inviteCodes.length) setPostOnboardingInviteCodes(pending.inviteCodes);
      if (pending.notifState) setPostOnboardingState(pending.notifState);
    }
  }, [profileGuardActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proposition des notifications après une connexion explicite (bouton login),
  // une fois le foyer chargé — jamais au simple lancement de l'app.
  // L'autre déclencheur est la fin d'onboarding (pendingPostOnboardingRef ci-dessus).
  useEffect(() => {
    if (!justLoggedInRef.current) return;
    if (bootLoading || !user) return;
    if (profileGuardActive || !currentFamilyId) return; // pas de foyer → onboarding s'en charge
    justLoggedInRef.current = false;
    if (shouldShowNotifPrompt()) {
      setPostOnboardingState("notify");
    }
  }, [bootLoading, user, currentFamilyId, profileGuardActive]); // eslint-disable-line react-hooks/exhaustive-deps

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
      color: selectedProfile.color || DEFAULT_MEMBER_COLOR,
      mood: selectedProfile.mood || "",
      message: selectedProfile.message || "",
    });
  }, [selectedProfile?.id, selectedProfile?.label, selectedProfile?.color, selectedProfile?.mood, selectedProfile?.message]);

  useEffect(() => {
    applyTheme(readStoredTheme());
    // Natif : amorce le cache de permission + le listener de tap sur notification
    initNotifications().catch(() => {});
  }, []);

  /* Bouton retour Android.
     Il reimplementait la cascade a la main : sous-page Réglages → Réglages →
     onglet accueil → sortie. Cette cascade est exactement ce que fait la pile
     d'historique depuis que chaque ecran a une route, et le routeur d'Ionic
     anime la transition sur `popstate` — comme le font deja le geste de
     balayage et le retour du navigateur, tous deux verifies.

     Ionic n'intercepte pas ce bouton a notre place : `ion-app` ecoute
     l'evenement DOM `backbutton`, convention Cordova que Capacitor ne
     declenche pas. Ce gestionnaire reste donc le seul — pas de double retour.

     ⚠️ A valider sur device : rien n'est verifie en natif (cf. TODO_NATIF). */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let listenerHandle = null;
    let cancelled = false;
    import("@capacitor/app").then(({ App: CapacitorApp }) => {
      if (cancelled) return;
      CapacitorApp.addListener("backButton", () => {
        const path = window.location.pathname;
        if (path === HOME_PATH || path === "/") {
          CapacitorApp.exitApp();
          return;
        }
        window.history.back();
      }).then((handle) => {
        if (cancelled) handle.remove();
        else listenerHandle = handle;
      });
    }).catch((error) => console.warn("[app] backButton listener impossible", error));
    return () => {
      cancelled = true;
      listenerHandle?.remove?.();
    };
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

  /* Remise à zéro à la déconnexion.
     `wasSignedInRef` distingue une vraie déconnexion du démarrage : cet effet
     tourne aussi au premier rendu, `user` valant `null` avant la réponse de
     Firebase. La nuance était sans conséquence quand tout ici n'était que des
     `setState` ; elle en a une maintenant qu'un écran est une URL. */
  const wasSignedInRef = useRef(false);
  useEffect(() => {
    if (user) {
      wasSignedInRef.current = true;
      return;
    }
    setDeviceMode("personal");
    setShowHouseholdWelcomeModal(false);
    setPostOnboardingState(null);
    setPostOnboardingInviteCodes([]);
    setDataMessage("");
    setToast(null);

    /* Trois appels ont disparu d'ici : `setShowSettings(false)`,
       `setSettingsSupportPage("")` et `setSettingsSubPage("main")`. C'étaient
       des resets de `useState` ; devenus des navigations, ils empilaient
       **deux** entrées `/settings` — et comme cet effet tourne au démarrage,
       deux retours depuis n'importe quel écran ramenaient dans les réglages
       après l'onboarding. Une seule navigation les remplace, et seulement sur
       une vraie déconnexion : au démarrage, toucher à l'URL détruirait un lien
       profond avant même que l'utilisateur soit connu. */
    if (wasSignedInRef.current) {
      wasSignedInRef.current = false;
      go(HOME_PATH, { replace: true });
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

  // ── Navigation depuis la popup de notification ─────────────────────────────
  function handleNotifPopupNavigate(notif) {
    const { eventId, taskId, notifType, tab } = notif || {};
    if (eventId || notifType === "event") {
      setActiveTab("agenda");
    } else if (taskId || notifType === "end-of-day" || notifType === "urgent" || notifType === "due") {
      setActiveTab(tab || "daily");
    } else {
      setActiveTab("home");
    }
  }

  const {
    handleAddTask,
    handleUpdateTask,
    handleToggleTask,
    handleDeleteTask,
    handleMoveTask,
    handleChangeTaskPeriod,
    handleDismissStaleNotice,
  } = useTasks(updateState);

  useTaskNotifications({
    tasks: state.tasks,
    taskNotifications: state.taskNotifications,
    updateState,
    onNotification: setNotifPopup,
  });

  const staleTaskAlerts = useStaleTaskAlerts(state.tasks);
  const activeStaleTaskAlert = staleTaskAlerts[0] || null;
  const activeStaleTask = activeStaleTaskAlert
    ? state.tasks.find((task) => task.id === activeStaleTaskAlert.taskId) || null
    : null;

  function handleDismissStaleTaskAlert() {
    if (activeStaleTaskAlert) handleDismissStaleNotice(activeStaleTaskAlert.taskId);
  }

  function handleMoveStaleTaskToPeriod(period) {
    if (activeStaleTaskAlert) handleChangeTaskPeriod(activeStaleTaskAlert.taskId, period);
  }

  function handleUpdateTaskNotifications(updates) {
    updateState((prev) => ({
      ...prev,
      taskNotifications: { ...(prev.taskNotifications || {}), ...updates },
    }));
  }
  const {
    handleUpdateMeal, handleToggleCook,
    handleAddRecipe, handleUpdateRecipe, handleToggleRecipeFavorite, handleDeleteRecipe, handleLoadDemoRecipes,
    handleAddCustomCondiment, handleDeleteCustomCondiment,
  } = useMeals(updateState);

  const {
    handleCreateList, handleDeleteList, handleUpdateList, handleMoveList,
    handleAddListItem, handleUpdateListItem, handleToggleListItem, handleDeleteListItem, handleClearShoppingList, handleClearCheckedItems, handleCheckAllItems,
    handleAddInventoryItem, handleUpdateInventoryItem, handleDeleteInventoryItem, handleClearFinishedInventory, handleClearAllInventory, handleSendInventoryToShopping, handleReorderInventoryItems,
    handleAddStorageLocation, handleRenameStorageLocation, handleDeleteStorageLocation, handleSetItemLocation, handleReorderStorageLocations,
  } = useLists(state, updateState, showToast);
  const {
    handleAddAgenda, handleUpdateAgenda, handleDeleteAgenda,
    handleAddRecurring, handleUpdateRecurring, handleDeleteRecurring,
  } = useAgenda(state, updateState);

  const { handleAddNote, handleDeleteNote, handleUpdateNote } = useNotes(updateState, activePersonId);

  const {
    handleAddInboxItem, handleDeleteInboxItem,
    handleDispatchToTask, handleDispatchToAgenda, handleDispatchToNote,
  } = useInbox({
    updateState, activePersonId, showToast,
    handleAddTask, handleAddAgenda, handleAddRecurring, handleAddNote,
  });

  const { handleToggleCookWithInventory, handleToggleMealsInventoryLink } = useMealCooking({
    state,
    updateState,
    showToast,
    dismissToast: () => setToast(null),
  });

  const {
    dataMessage, setDataMessage, importText, setImportText, showImport, setShowImport,
    handleManualImport, handleExportData, handleResetPlanner,
  } = usePlannerData({ state, setState, familyName: currentFamily?.name || "" });

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

  function handleClearHistory() {
    updateState((previous) => ({ ...previous, history: [] }));
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
          justLoggedInRef.current = true;
          return runAuth(() => signInWithGoogle());
        }}
        onEmailLogin=${(form) => {
          setAuthEntryPage("login");
          setPendingSignupSetup(false);
          setPendingSignupDraftName("");
          justLoggedInRef.current = true;
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
      <${Suspense} fallback=${SCREEN_FALLBACK}><${OnboardingFlow}
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
          setActiveTab("home");
          const inviteCodes = Array.isArray(result?.invitations) ? result.invitations.filter((item) => item.code) : [];
          const notifState = shouldShowNotifPrompt() ? "notify" : (inviteCodes.length ? "invite-codes" : null);
          if (notifState || inviteCodes.length) {
            pendingPostOnboardingRef.current = { notifState, inviteCodes };
          }
        })}
        onJoinHousehold=${(payload) => runFamilyAction(async () => {
          await handleJoinHouseholdOnboarding(payload);
          setPendingSignupSetup(false);
          setPendingSignupDraftName("");
          setActiveTab("home");
          if (shouldShowNotifPrompt()) {
            pendingPostOnboardingRef.current = { notifState: "notify", inviteCodes: [] };
          }
        })}
        onCompleteExistingProfile=${(payload) => runFamilyAction(async () => {
          await handleCompleteProfileSetup(payload);
          setPendingSignupSetup(false);
          setPendingSignupDraftName("");
          setActiveTab("home");
          if (shouldShowNotifPrompt()) {
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
      /><//>
    `;
  }

  /* Foyer créé mais encore sans personne : le planificateur n'a rien à
     afficher, et c'est dans les réglages que se fait l'ajout de membres.
     `plannerUnlocked = hasFamily && people.length > 0`.

     Un **rendu** et non une redirection, et la nuance a coûté un test :
     `hasFamily` passe à vrai avant que les personnes n'arrivent de Firestore.
     Rediriger vers `/settings` dans cette fenêtre marchait, mais rien ne
     ramenait ensuite l'utilisateur : l'app restait sur les réglages une fois
     l'onboarding fini. Un rendu conditionnel est réversible, une entrée
     d'historique ne l'est pas.

     La route `/settings` existe toujours, pour la navigation volontaire. */
  if (showSettings || !plannerUnlocked) {
    return html`
      <div className="mrd-outer">
        <div className="mrd-shell">
          ${settingsPage()}
        </div>
        <${FeedbackWidget} user=${user} currentPage="settings" />
      </div>
    `;
  }

  /* ── Contenu d'un écran ────────────────────────────────────────────────
     C'était une valeur (`plannerContent`) calculée pour l'onglet courant.
     Avec `IonRouterOutlet`, la page sortante reste montée le temps de la
     transition : si elle relisait `activeTab`, elle afficherait le contenu de
     la page entrante pendant l'animation. Chaque route rend donc son propre
     contenu, en passant son identifiant d'écran — indépendamment de l'URL du
     moment. */
  function renderScreen(tab) {
    if (!plannerUnlocked) return null;
    if (tab === "mine" || tab === "daily" || tab === "weekly" || tab === "monthly") {
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
        tab === "mine"
          ? state.tasks.filter(isMineTask)
          : visibleTasksByTab[tab] || [];
      // Pour "Mes tâches" : n'exposer que les tâches de l'utilisateur actif,
      // y compris les tâches "à faire avant", pour éviter qu'elles apparaissent
      // dans la section deadline sans être assignées à cet utilisateur.
      const allTasksForTab =
        tab === "mine"
          ? state.tasks.filter(isMineTask)
          : state.tasks;
      return html`
        <${TasksView}
          tab=${tab}
          tasks=${visibleTasks}
          allTasks=${allTasksForTab}
          people=${householdPeople}
          childProfiles=${agendaPeople.filter((person) => person.profileMode === "context" || person.type === "child" || person.type === "animal")}
          planningByTask=${taskPlanningById}
          activePersonId=${activePersonId}
          activePersonLabel=${activeHouseholdPerson?.displayName || activeHouseholdPerson?.label || ""}
          externalOpenCreate=${taskFabTrigger}
          onAddTask=${(tab, form) => { handleAddTask(tab, form); showToast("✓ Tâche créée"); }}
          onUpdateTask=${(id, updates) => { handleUpdateTask(id, updates); showToast("✓ Tâche mise à jour"); }}
          onToggleTask=${handleToggleTask}
          onDeleteTask=${(id) => { handleDeleteTask(id); showToast("Tâche supprimée"); }}
          onMoveTask=${handleMoveTask}
        />
      `;
    }
    if (tab === "agenda") {
      return html`
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
          onNotification=${setNotifPopup}
          activePersonId=${activePersonId}
        />
      `;
    }
    if (tab === "meals") {
      const shoppingList = ensureShoppingList(state.lists).find((list) => list.isShoppingList);
      return !isPremium ? html`
        <${PremiumLockScreen} feature="meals" onActivatePremium=${handleActivatePremium} onOpenPremiumSettings=${openPremiumSettings} />
      ` : html`
        <${MealsView}
          meals=${state.meals}
          recipes=${state.recipes}
          inventory=${state.inventory}
          shoppingItems=${shoppingList?.items || []}
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
    }
    if (tab === "lists") {
      const allLists = ensureShoppingList(state.lists);
      const visibleLists = allLists.filter((list) => {
        if (list.isShoppingList) return true;
        if (list.visibility === "private") return !list.createdBy || list.createdBy === activePersonId;
        if (list.visibility === "shared") return list.createdBy === activePersonId || (list.sharedWith || []).includes(activePersonId);
        return true;
      });
      return html`
        <${ListsView}
          lists=${visibleLists}
          activePersonId=${activePersonId}
          people=${householdPeople}
          inventory=${state.inventory}
          isPremium=${isPremium}
          onRequirePremium=${() => showToast("⭐ Fonction Premium — active le premium pour lier une liste à l'inventaire")}
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
    }
    if (tab === "inventory") {
      return !isPremium ? html`
        <${PremiumLockScreen} feature="inventory" onActivatePremium=${handleActivatePremium} onOpenPremiumSettings=${openPremiumSettings} />
      ` : html`
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
    }
    if (tab === "recipes") {
      const recipesShoppingList = ensureShoppingList(state.lists).find((list) => list.isShoppingList);
      return !isPremium ? html`
        <${PremiumLockScreen} feature="recipes" onActivatePremium=${handleActivatePremium} onOpenPremiumSettings=${openPremiumSettings} />
      ` : html`<${RecipesView}
        recipes=${state.recipes}
        inventory=${state.inventory}
        knownProducts=${knownProducts}
        customCondiments=${state.customCondiments || []}
        onAddCustomCondiment=${handleAddCustomCondiment}
        onDeleteCustomCondiment=${handleDeleteCustomCondiment}
        onAddRecipe=${(recipe) => { const id = handleAddRecipe(recipe); showToast("✓ Recette ajoutée"); return id; }}
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
        onToggleRecipeFavorite=${handleToggleRecipeFavorite}
        linkInventory=${Boolean(state.linkMealsToInventory)}
        onBack=${() => setActiveTab("home")}
      />`;
    }
    if (tab === "notes") {
      const visibleNotes = state.notes.filter((note) => {
        if (note.visibility === "private") return !note.createdBy || note.createdBy === activePersonId;
        if (note.visibility === "shared") return note.createdBy === activePersonId || (note.sharedWith || []).includes(activePersonId);
        return true;
      });
      return html`<${NotesView}
        notes=${visibleNotes}
        activePersonId=${activePersonId}
        people=${householdPeople}
        onAddNote=${(text, vis, shared) => { handleAddNote(text, vis, shared); showToast("✓ Note enregistrée"); }}
        onDeleteNote=${(id) => { handleDeleteNote(id); showToast("Note supprimée"); }}
        onUpdateNote=${(id, updates) => { handleUpdateNote(id, updates); showToast("✓ Note mise à jour"); }}
      />`;
    }
    if (tab === "history") {
      return html`<${HistoryView} history=${state.history} users=${householdPeople} onClearHistory=${handleClearHistory} />`;
    }
    if (tab === "inbox") {
      return html`
        <${InboxView}
          inbox=${state.inbox || []}
          activePersonId=${activePersonId}
          people=${householdPeople}
          childProfiles=${agendaPeople.filter((p) => p.profileMode === "context" || p.type === "child" || p.type === "animal")}
          onAddInboxItem=${handleAddInboxItem}
          onDeleteInboxItem=${handleDeleteInboxItem}
          onDispatchToTask=${handleDispatchToTask}
          onDispatchToAgenda=${handleDispatchToAgenda}
          onDispatchToNote=${handleDispatchToNote}
          onOpenNotes=${() => setActiveTab("notes")}
        />
      `;
    }
    return null;
  }

  /* ── Une page par écran ────────────────────────────────────────────────
     `IonRouterOutlet` exige que chaque route rende un `IonPage` : c'est ce
     qu'il empile pour animer les transitions et gérer le geste de retour.

     L'intérieur (`.mrd-screen`, `.cnt`, les en-têtes) reste le balisage
     existant : le passage à `IonHeader` / `IonContent` est l'objet de la
     phase 3, et mélanger les deux ici rendrait la régression visuelle
     impossible à attribuer. */
  /* ── En-tête d'écran ──────────────────────────────────────────────────
     Passe de `<div class="mrd-screen-hdr">` / `<div class="mrd-back-hdr">` à
     `IonHeader` > `IonToolbar` > `IonTitle`. Le gain n'est pas cosmétique :
     Ionic accroche l'en-tête hors du flux de défilement, calcule le décalage
     haut d'`ion-content` en conséquence, et gère la safe area du haut — trois
     choses qui étaient écrites à la main.

     Quatre écrans n'ont PAS d'en-tête de coque, et c'était déjà le cas avant :
       – `home` : le bonjour et l'engrenage sont dans `HomeView` et défilent
         avec le contenu ;
       – `lists` : pose son propre titre, sur la ligne de « + Nouvelle » ;
       – `meals` débloqué : `MealsView` pose le sien (sous le paywall, non — la
         coque titre, sinon l'écran n'a plus de nom) ;
       – `recipes` : pose son propre en-tête, avec ses actions.
     Leur ajouter un `IonHeader` empilerait deux titres. */

  const MAIN_TITLES = {
    daily: "Tâches", weekly: "Tâches", monthly: "Tâches", mine: "Tâches",
    agenda: "Agenda", meals: "Repas",
  };
  const SECONDARY_TITLES = {
    notes: "Notes", inventory: "Inventaire", recipes: "Recettes",
    history: "Historique", inbox: "Pense-bête 📥",
  };

  function renderPageHeader(tab) {
    if (isSecondaryScreenId(tab)) {
      if (tab === "recipes") return null;
      return html`
        <${IonHeader} className="mrd-ion-header">
          <${IonToolbar} className="mrd-ion-toolbar">
            <${IonButtons} slot="start">
              ${/* `IonBackButton` plutôt qu'un bouton maison : il remonte la
                   pile de navigation d'Ionic au lieu de sauter en dur sur
                   l'accueil, ce qui rend le retour cohérent avec le geste de
                   balayage iOS et avec le bouton retour d'Android — les trois
                   font désormais la même chose.

                   `defaultHref` est le repli quand la pile est vide : arrivée
                   directe par URL, ou reprise de l'app sur un deep link.
                   `text=""` retire le libellé « Retour » qu'Ionic affiche en
                   mode ios à côté du chevron ; le design maison n'a que le
                   chevron, dans un disque. */null}
              <${IonBackButton} defaultHref=${HOME_PATH} text="" className="mrd-ion-back" aria-label="Retour" />
            <//>
            <${IonTitle} className="mrd-ion-title">${SECONDARY_TITLES[tab] || ""}<//>
            ${tab === "inventory" ? html`
              <${IonButtons} slot="end" className="mrd-back-hdr-side">
                <span className=${`mrd-hdr-switch-label${inventoryOrganiserMode ? " on" : ""}`}>Organiser</span>
                <${IonToggle}
                  className="mrd-hdr-switch"
                  checked=${inventoryOrganiserMode}
                  onIonChange=${(event) => setInventoryOrganiserMode(event.detail.checked)}
                  aria-label="Organiser l'inventaire"
                />
              <//>
            ` : null}
          <//>
        <//>
      `;
    }

    if (tab === "home" || tab === "lists" || (tab === "meals" && isPremium)) return null;

    return html`
      <${IonHeader} className="mrd-ion-header">
        <${IonToolbar} className="mrd-ion-toolbar mrd-ion-toolbar-title">
          <${IonTitle} className="mrd-ion-title mrd-screen-hdr-title">${MAIN_TITLES[tab] || ""}<//>
        <//>
        ${TASK_PERIODS.includes(tab) ? html`
          <${IonToolbar} className="mrd-ion-toolbar mrd-ion-toolbar-segment">
                      <${SegmentedTabs}
                        ariaLabel="Navigation des tâches"
                        options=${[
                          { id: "daily",   emoji: "☀️",  label: "Aujourd’hui" },
                          { id: "weekly",  emoji: "📆",  label: "Semaine" },
                          { id: "monthly", emoji: "🗓️", label: "Mois" },
                          { id: "mine",    emoji: "👤",  label: "Mes tâches" },
                        ]}
                        activeId=${tab}
                        onChange=${setActiveTab}
                      />
          <//>
        ` : null}
      <//>
    `;
  }

  /* Bandeaux communs à tous les écrans : erreurs de foyer et choix de la
     personne qui utilise l'appareil. Ils défilent avec le contenu. */
  function renderPageBanners() {
    return html`
      ${familyError || bootstrapError ? html`
        <div style=${{ padding: "0 14px" }}>
          ${familyError ? html`<div className="error-box">${familyError}</div>` : null}
          ${bootstrapError ? html`<div className="error-box">${bootstrapError}</div>` : null}
        </div>
      ` : null}

      ${needsActivePersonChoice ? html`
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
    `;
  }

  /* FAB « nouvelle tâche » — `IonFab` en `slot="fixed"` : il sort du flux de
     défilement d'`ion-content`, et Ionic le place au-dessus de la safe area.
     Remplace un `position: absolute; bottom: calc(96px + env(safe-area-inset-bottom))`
     qui compensait la barre d'onglets à la main.

     Il vit désormais DANS la page et non plus dans la coque : c'est ce qui
     permet de supprimer la condition `["daily",…].includes(activeTab)` — la
     page des tâches est la seule à en poser un. */
  function renderPageFab(tab) {
    if (!TASK_PERIODS.includes(tab)) return null;
    return html`
      <${IonFab} slot="fixed" vertical="bottom" horizontal="end">
        <${IonFabButton} className="mrd-fab" title="Nouvelle tâche" onClick=${() => setTaskFabTrigger((n) => n + 1)}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="var(--mrd-white)" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        <//>
      <//>
    `;
  }

  function screenPage(tab) {
    return html`
      <${IonPage} className="mrd-ion-page">
        ${renderPageHeader(tab)}
        <${IonContent} className="cnt">
          ${renderPageBanners()}
          <${Suspense} fallback=${SCREEN_FALLBACK}>
          ${tab === "home"
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
                  inbox=${state.inbox || []}
                  people=${householdPeople}
                  familyName=${currentFamily?.name || ""}
                  currentUserName=${linkedPerson?.displayName || userProfile?.displayName || user?.displayName || ""}
                  currentDate=${getCurrentAppDate()}
                  activePersonId=${activePersonId}
                  pendingShoppingCount=${(() => {
                    const sl = state.lists.find((l) => l.isShoppingList);
                    return sl ? (sl.items || []).filter((i) => !i.checked).length : 0;
                  })()}
                  families=${safeFamilies}
                  currentFamily=${currentFamily}
                  onSwitchFamily=${(id) => runFamilyAction(() => handleSwitchFamily(id))}
                  onCreateFamily=${(name) => runFamilyAction(() => handleCreateFamily(name))}
                  onJoinFamily=${(code) => runFamilyAction(() => handleJoinFamily(code))}
                  onToggleTask=${handleToggleTask}
                  onNavigate=${(tab) => setActiveTab(tab)}
                  onOpenSettings=${() => setShowSettings(true)}
                  onOpenAddTask=${plannerUnlocked ? () => {
                    setActiveTab("daily");
                    setTimeout(() => setTaskFabTrigger((n) => n + 1), 60);
                  } : null}
                />`
            : renderScreen(tab)}
          <//>
        <//>
        ${renderPageFab(tab)}
      <//>
    `;
  }

  /* ── Page Réglages ─────────────────────────────────────────────────────
     Les réglages sont rendus **hors** de l'outlet des onglets, en retour
     anticipé. Trois structures ont été essayées, dans cet ordre :

       1. Dans l'outlet, barre d'onglets masquée. Donnait la transition de
          page, mais Ionic protestait à chaque navigation — « [ion-tabs] Tab
          with id: "undefined" does not exist », la route des réglages n'ayant
          aucun onglet correspondant — et l'arbre d'éléments de `SettingsView`
          était reconstruit trois fois (une par route) à chaque rendu. Sous la
          charge de la suite e2e complète, le navigateur finissait par mourir.
       2. Un outlet parent (`/settings/*` d'un côté, les onglets de l'autre) :
          c'est la structure canonique d'Ionic, et ce serait le bon choix — mais
          les outlets imbriqués avec react-router v6 sont précisément là où se
          cachent les bugs, et il n'y a pas de documentation pour s'y appuyer.
          Écarté faute de pouvoir le valider.
       3. Retour anticipé, la structure d'avant la phase 5. Retenue.

     Ce qu'on perd : l'animation de poussée en entrant dans les réglages.
     Ce qu'on garde : l'URL comme source de vérité, les sous-pages en routes,
     l'`IonBackButton` (qui remonte la pile même hors outlet) et la disparition
     de la cascade de retour codée à la main.

     Les sous-pages viennent de l'URL :
       `/settings`                    → sommaire
       `/settings/:section`           → une des 9 sections
       `/settings/support/:page`      → une des 5 pages de support
     La cascade de retour codée à la main (support → section → sortie) est
     remplacée par un `IonBackButton` : chaque niveau est une entrée
     d'historique, donc la pile fait le travail. */
  function settingsPage() {
    return html`
      <${IonPage} className="mrd-ion-page mrd-settings-page">
        ${plannerUnlocked ? html`
          <${IonHeader} className="mrd-ion-header">
            <${IonToolbar} className="mrd-ion-toolbar">
              <${IonButtons} slot="start">
                <${IonBackButton} defaultHref=${lastPlannerPathRef.current || HOME_PATH} text="" className="mrd-ion-back" aria-label="Retour" />
              <//>
              <${IonTitle} className="mrd-ion-title">Réglages<//>
            <//>
          <//>
        ` : null}
        <${IonContent} className="cnt cnt--settings">
          ${renderPageBanners()}
<${Suspense} fallback=${SCREEN_FALLBACK}><${SettingsView}
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
            onCreateFamilyWizard=${(payload) => runFamilyAction(() => handleCreateHouseholdOnboarding(payload))}
            onJoinFamily=${(code) => runFamilyAction(() => handleJoinFamily(code))}
            onSwitchFamily=${(familyId) => runFamilyAction(() => handleSwitchFamily(familyId))}
            onRenameFamily=${(name) => runFamilyAction(() => renameFamily(currentFamilyId, name))}
            isPremium=${isPremium}
            onSetPremiumOverride=${(value) => runFamilyAction(() => setFamilyPremiumOverride(currentFamilyId, value))}
            onAddPerson=${(person) => runFamilyAction(() => handleAddPerson(person))}
            onUpdatePerson=${(personId, updates) => runFamilyAction(() => handleUpdatePerson(personId, updates))}
            onUpdateMemberRole=${(uid, role) => runFamilyAction(() => handleUpdateMemberRole(uid, role))}
            onDeletePerson=${(personId) => runFamilyAction(() => handleDeletePerson(personId))}
            onMovePerson=${(personId, direction) => runFamilyAction(() => handleMovePerson(personId, direction))}
            onChangeEmail=${handleChangeEmail}
            onChangePassword=${handleChangePassword}
            onLeaveFamily=${() => runFamilyAction(() => handleLeaveFamily())}
            onDeleteFamily=${() => runFamilyAction(() => handleDeleteFamily())}
            onDeleteFamilyById=${(familyId) => runFamilyAction(() => handleDeleteFamilyById(familyId))}
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
          /><//>
        <//>
      <//>
    `;
  }

  /* ── Routes ────────────────────────────────────────────────────────────
     Les commentaires restent ici, hors du template : dans un template HTM on
     les écrirait `${/* … *\/null}`, ce qui injecte un enfant `null` dans
     `IonRouterOutlet`. Le gestionnaire de routes d'Ionic itère ces enfants
     sans filtrer les valeurs nulles et lève « Cannot read properties of null
     (reading 'type') » — l'app monte, puis meurt à la première navigation.

     Une seule route pour les 4 périodes de tâches : passer de « Semaine » à
     « Mois » change un segment, pas de page. Quatre routes distinctes
     déclencheraient une animation de transition entre deux onglets segmentés,
     ce qui n'est pas le geste.

     La période vient de l'URL, avec un repli sur `lastTaskTab` : pendant la
     transition qui QUITTE les tâches, `activeTab` vaut déjà l'écran de
     destination, et la page sortante afficherait le contenu de la page
     entrante le temps de l'animation. */
  const taskPeriodForPage = TASK_PERIODS.includes(activeTab) ? activeTab : (lastTaskTab || "daily");

  /* `BottomNav` n'a plus de prop `onChange` : ses boutons portent un `href`,
     donc c'est Ionic qui navigue — c'est la condition pour qu'il tienne une
     pile de navigation par onglet. `handleBottomNavChange` ne faisait que
     rouvrir la dernière période de Tâches, ce qu'Ionic fait nativement via
     `locationHistory.getCurrentRouteInfoForTab()`. */

  /* Repli : « / » au premier lancement, et tout chemin inconnu (deep link
     périmé). Sans lui l'outlet ne rend rien — écran blanc, sans erreur. */
  const homeRedirect = html`<${Navigate} to=${HOME_PATH} replace />`;

  return html`
    <div className="mrd-outer">
      <div className="mrd-shell">

        <${IonTabs} className="mrd-tabs-host">
          <${IonRouterOutlet}>
            <${IonRoute} path="/home" element=${screenPage("home")} />
            <${IonRoute} path="/agenda" element=${screenPage("agenda")} />
            <${IonRoute} path="/meals" element=${screenPage("meals")} />
            <${IonRoute} path="/lists" element=${screenPage("lists")} />
            <${IonRoute} path="/notes" element=${screenPage("notes")} />
            <${IonRoute} path="/inventory" element=${screenPage("inventory")} />
            <${IonRoute} path="/recipes" element=${screenPage("recipes")} />
            <${IonRoute} path="/history" element=${screenPage("history")} />
            <${IonRoute} path="/inbox" element=${screenPage("inbox")} />
            <${IonRoute} path="/tasks" element=${screenPage(taskPeriodForPage)} />
            <${IonRoute} path="/tasks/:period" element=${screenPage(taskPeriodForPage)} />
            <${IonRoute} path="*" element=${homeRedirect} />
          <//>

          <${BottomNav}
            activeTab=${activeTab}
            onOpenQuickMenu=${() => setQuickMenuOpen(true)}
            overdueTaskCount=${stats.overdueTaskCount}
            isPremium=${isPremium}
          />
        <//>

        <${IonActionSheet}
          isOpen=${quickMenuOpen}
          header="Plus"
          className="mrd-quick-sheet"
          onDidDismiss=${() => setQuickMenuOpen(false)}
          buttons=${[
            ...QUICK_MENU_ITEMS.map((item) => ({
              text: isPremiumTab(item.id) && !isPremium ? `${item.emoji}  ${item.label} ⭐` : `${item.emoji}  ${item.label}`,
              handler: () => setActiveTab(item.id),
            })),
            { text: "Annuler", role: "cancel" },
          ]}
        />

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
      ${notifPopup ? html`
        <${NotificationModal}
          notification=${notifPopup}
          onClose=${() => setNotifPopup(null)}
          onNavigate=${handleNotifPopupNavigate}
        />
      ` : null}

      ${!notifPopup && activeStaleTask ? html`
        <${StaleTaskModal}
          task=${activeStaleTask}
          alert=${activeStaleTaskAlert}
          onClose=${handleDismissStaleTaskAlert}
          onMoveToDaily=${() => handleMoveStaleTaskToPeriod("daily")}
          onMoveToWeekly=${() => handleMoveStaleTaskToPeriod("weekly")}
        />
      ` : null}

      ${/* Les 40 appels a `showToast` n ont pas change : seul le rendu passe a
           `ion-toast`, qui apporte le placement au-dessus de la safe area, la
           file d attente et l annonce aux lecteurs d ecran.

           `key` force un remontage a chaque message : sans lui, deux toasts
           consecutifs avec le meme texte ne rejouent pas l animation. Le
           minuteur reste cote App (`useEffect` sur `toast.id`) plutot que de
           passer par `duration`, pour garder le comportement d origine. */null}
      <${IonToast}
        key=${toast?.id || "toast"}
        isOpen=${Boolean(toast?.text)}
        message=${toast?.text || ""}
        position="bottom"
        className="app-toast"
        onDidDismiss=${() => setToast(null)}
        buttons=${toast?.action?.label
          ? [{ text: toast.action.label, handler: toast.action.onClick }]
          : []}
      />

      ${postOnboardingState === "notify" ? html`
        <${NotifPromptModal}
          dismissCount=${getNotifPromptDismissCount()}
          onActivate=${async () => {
            markNotifPromptGranted();
            // 1. Dialog OS seul (rapide) — la modale se ferme dès la réponse.
            try { await requestNotificationPermission(); } catch (_) {}
            setPostOnboardingState(postOnboardingInviteCodes.length ? "invite-codes" : null);
            // 2. Enregistrement du token push (peut prendre plusieurs secondes
            //    en natif : APNs) — en arrière-plan, sans bloquer la modale.
            requestPushPermission().catch(() => {});
          }}
          onLater=${() => {
            markNotifPromptDismissed();
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

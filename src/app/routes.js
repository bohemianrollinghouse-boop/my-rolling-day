// Table de routes de l'application — module pur, sans React.
//
// Avant la migration Ionic, l'écran affiché venait d'un `useState` dans
// `App.js` (`activeTab`). Ionic pilote sa barre d'onglets par le routeur : la
// vérité passe donc dans l'URL, et ce fichier est la seule traduction entre
// les deux vocabulaires.
//
// Volontairement sans dépendance : les tests unitaires vérifient ces règles
// sans navigateur ni build (`tests/unit/routes.test.js`).

/** Périodes de l'écran Tâches. Segments de `/tasks/:period`. */
export const TASK_PERIODS = ["daily", "weekly", "monthly", "mine"];

/** Période affichée quand on arrive sur Tâches sans en préciser une. */
export const DEFAULT_TASK_PERIOD = "daily";

/** Écrans atteints par le menu « Plus » — pas d'onglet dédié. */
export const QUICK_SCREENS = ["lists", "notes", "inventory", "recipes", "history"];

/**
 * Écrans secondaires : ils s'empilent par-dessus l'accueil et portent un bouton
 * retour, au lieu d'être une destination d'onglet.
 *
 * Ce n'est **pas** `QUICK_SCREENS + inbox`, et la nuance compte :
 *  - `lists` s'atteint par le menu « Plus » mais pose son propre titre, sur la
 *    même ligne que son bouton « + Nouvelle ». Lui ajouter un en-tête de retour
 *    empile deux titres. (Régression introduite puis rattrapée par les
 *    captures : le bouton retour était apparu au-dessus de « Listes ».)
 *  - `inbox` est secondaire sans être au menu « Plus » : on y arrive depuis
 *    l'accueil.
 */
export const SECONDARY_SCREENS = ["notes", "inventory", "recipes", "history", "inbox"];

export const SETTINGS_PATH = "/settings";
export const HOME_PATH = "/home";
export const AUTH_PATH = "/auth";

/**
 * Sections des réglages — les valeurs que `SettingsView` attend dans sa prop
 * `settingsPage`. « main » est le sommaire et correspond à `/settings` tout
 * court, pas à `/settings/main`.
 */
export const SETTINGS_SECTIONS = [
  "profile", "households", "household", "notifications",
  "appearance", "account", "privacy", "help", "about",
];

/** Sous-pages de support, sous `/settings/support/:page`. */
export const SUPPORT_PAGES = ["contact", "bug", "feature", "privacy", "terms"];

/** Chemin de chaque écran simple (hors Tâches, qui a un paramètre). */
const SIMPLE_PATHS = {
  home: HOME_PATH,
  agenda: "/agenda",
  meals: "/meals",
  lists: "/lists",
  notes: "/notes",
  inventory: "/inventory",
  recipes: "/recipes",
  history: "/history",
  inbox: "/inbox",
};

/**
 * Tous les chemins déclarés dans le routeur.
 *
 * L'ordre compte pour les réglages : `/settings/support/:page` doit précéder
 * `/settings/:section`, sinon « support » serait pris pour une section.
 */
export const ROUTE_PATHS = [
  ...Object.values(SIMPLE_PATHS),
  "/tasks/:period",
  `${SETTINGS_PATH}/support/:page`,
  `${SETTINGS_PATH}/:section`,
  SETTINGS_PATH,
];

/**
 * Chemin correspondant à un identifiant d'écran.
 *
 * Accepte aussi bien les identifiants d'onglet (`tasks`) que les valeurs
 * historiques d'`activeTab` (`daily`, `weekly`…), parce que tout le code
 * existant appelle `setActiveTab("daily")` et non `setActiveTab("tasks")`.
 */
export function pathForTab(tab) {
  const id = String(tab || "");
  if (id === "tasks") return `/tasks/${DEFAULT_TASK_PERIOD}`;
  if (TASK_PERIODS.includes(id)) return `/tasks/${id}`;
  return SIMPLE_PATHS[id] || HOME_PATH;
}

/**
 * Identifiant d'écran correspondant à un chemin — l'inverse de `pathForTab`.
 *
 * Renvoie les valeurs historiques d'`activeTab` (`daily` et non `tasks`) : tout
 * le reste de `App.js` raisonne encore dans ce vocabulaire, et le traduire ici
 * évite d'avoir à toucher les 34 endroits qui lisent `activeTab`.
 *
 * Un chemin inconnu renvoie `home` — même repli que l'ancien `getBottomId`.
 */
export function tabFromPath(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";

  const taskMatch = path.match(/^\/tasks\/([^/]+)/);
  if (taskMatch) {
    return TASK_PERIODS.includes(taskMatch[1]) ? taskMatch[1] : DEFAULT_TASK_PERIOD;
  }
  if (path === "/tasks") return DEFAULT_TASK_PERIOD;

  const found = Object.entries(SIMPLE_PATHS).find(([, value]) => value === path);
  return found ? found[0] : "home";
}

/** true si ce chemin est celui des réglages (ou d'une de ses sous-pages). */
export function isSettingsPath(pathname) {
  const path = String(pathname || "");
  return path === SETTINGS_PATH || path.startsWith(`${SETTINGS_PATH}/`);
}

/**
 * Onglet de la barre du bas qui doit s'allumer pour un écran donné.
 *
 * Les quatre périodes de Tâches allument `tasks`, et les écrans du menu
 * « Plus » allument `quick`. Reprend `getBottomId`, qui vivait dans
 * `BottomNav.js` et était recopié à l'identique dans
 * `tests/e2e/navigation.test.js`.
 */
export function bottomIdForTab(tab) {
  const id = String(tab || "");
  if (TASK_PERIODS.includes(id)) return "tasks";
  if (QUICK_SCREENS.includes(id)) return "quick";
  if (id === "agenda" || id === "meals" || id === "home") return id;
  return "home";
}

/** true si l'écran s'empile par-dessus l'accueil (bouton retour, pas d'onglet). */
export function isSecondaryScreen(tab) {
  return SECONDARY_SCREENS.includes(String(tab || ""));
}

/**
 * Chemin d'un état des réglages.
 *
 * @param {string} section  section des réglages, ou « main » pour le sommaire
 * @param {string} [support] sous-page de support ; l'emporte sur `section`
 */
export function settingsPathFor(section, support = "") {
  const page = String(support || "");
  if (SUPPORT_PAGES.includes(page)) return `${SETTINGS_PATH}/support/${page}`;
  const id = String(section || "");
  return SETTINGS_SECTIONS.includes(id) ? `${SETTINGS_PATH}/${id}` : SETTINGS_PATH;
}

/**
 * État des réglages porté par un chemin — l'inverse de `settingsPathFor`.
 *
 * Renvoie le vocabulaire que `SettingsView` attend déjà (`section: "main"` pour
 * le sommaire, `support: ""` quand on n'est pas dans une page de support), ce
 * qui évite de toucher aux 4 props concernées.
 */
export function settingsStateFromPath(pathname) {
  const path = String(pathname || "").replace(/\/+$/, "");
  if (!isSettingsPath(path)) return { section: "main", support: "" };

  const supportMatch = path.match(new RegExp(`^${SETTINGS_PATH}/support/([^/]+)$`));
  if (supportMatch) {
    const page = supportMatch[1];
    return { section: "main", support: SUPPORT_PAGES.includes(page) ? page : "" };
  }

  const sectionMatch = path.match(new RegExp(`^${SETTINGS_PATH}/([^/]+)$`));
  if (sectionMatch && SETTINGS_SECTIONS.includes(sectionMatch[1])) {
    return { section: sectionMatch[1], support: "" };
  }
  return { section: "main", support: "" };
}

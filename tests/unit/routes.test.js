/* Table de routes — la traduction entre l'URL et le vocabulaire historique
   d'`activeTab`. Ces fonctions sont le pivot de la navigation depuis la
   migration Ionic : une erreur ici envoie l'utilisateur sur le mauvais écran
   ou allume le mauvais onglet, sans jamais lever d'exception. */

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TASK_PERIOD,
  HOME_PATH,
  QUICK_SCREENS,
  ROUTE_PATHS,
  SECONDARY_SCREENS,
  SETTINGS_PATH,
  SETTINGS_SECTIONS,
  SUPPORT_PAGES,
  TAB_ROOTS,
  TASK_PERIODS,
  bottomIdForTab,
  isSecondaryScreen,
  isSettingsPath,
  pathForTab,
  settingsPathFor,
  settingsStateFromPath,
  tabFromPath,
} from "../../src/app/routes.js";

test("routes : pathForTab et tabFromPath sont réciproques", () => {
  const screens = ["home", "agenda", "meals", "lists", "notes", "inventory", "recipes", "history", "inbox", ...TASK_PERIODS];
  for (const screen of screens) {
    assert.equal(tabFromPath(pathForTab(screen)), screen, `aller-retour cassé pour « ${screen} »`);
  }
});

/* « tasks » est l'identifiant de l'onglet, pas d'un écran : tout le code
   existant appelle setActiveTab("daily"). L'onglet doit atterrir sur une
   période concrète, sinon la barre du bas mène à une page vide. */
test("routes : l'onglet « tasks » atterrit sur la période par défaut", () => {
  assert.equal(pathForTab("tasks"), `/tasks/${DEFAULT_TASK_PERIOD}`);
  assert.equal(tabFromPath("/tasks"), DEFAULT_TASK_PERIOD);
  assert.equal(tabFromPath(`/tasks/${DEFAULT_TASK_PERIOD}`), DEFAULT_TASK_PERIOD);
});

test("routes : une période inconnue retombe sur la période par défaut", () => {
  assert.equal(tabFromPath("/tasks/nimportequoi"), DEFAULT_TASK_PERIOD);
});

/* Repli obligatoire : un chemin inconnu (deep link périmé, faute de frappe,
   « / » au premier chargement) ne doit pas donner d'écran vide. */
test("routes : un chemin inconnu retombe sur l'accueil", () => {
  for (const path of ["/", "", null, undefined, "/nimportequoi", "/tasks/x/y/z"]) {
    const tab = tabFromPath(path);
    assert.ok(tab, `${JSON.stringify(path)} doit donner un écran`);
    if (path !== "/tasks/x/y/z") assert.equal(tab, "home", `${JSON.stringify(path)} → home`);
  }
  assert.equal(pathForTab("inconnu"), HOME_PATH);
  assert.equal(pathForTab(""), HOME_PATH);
});

test("routes : la barre du bas s'allume sur le bon onglet", () => {
  for (const period of TASK_PERIODS) assert.equal(bottomIdForTab(period), "tasks");
  for (const screen of QUICK_SCREENS) assert.equal(bottomIdForTab(screen), "quick");
  assert.equal(bottomIdForTab("home"), "home");
  assert.equal(bottomIdForTab("agenda"), "agenda");
  assert.equal(bottomIdForTab("meals"), "meals");
  assert.equal(bottomIdForTab("inconnu"), "home");
});

/* Les deux listes se ressemblent et ne se recouvrent pas — l'erreur est
   facile, elle a été commise et rattrapée par les captures d'écran.

   « inbox » est secondaire sans figurer au menu « Plus » (on y arrive depuis
   l'accueil), et « lists » est l'inverse : au menu « Plus », mais pas
   secondaire, parce qu'il pose son propre titre sur la ligne de son bouton
   « + Nouvelle ». Le déclarer secondaire empile deux titres. */
test("routes : inbox est secondaire mais pas dans le menu « Plus »", () => {
  assert.ok(isSecondaryScreen("inbox"));
  assert.ok(!QUICK_SCREENS.includes("inbox"));
  assert.ok(SECONDARY_SCREENS.includes("inbox"));
});

test("routes : lists est au menu « Plus » mais n'est pas un écran secondaire", () => {
  assert.ok(QUICK_SCREENS.includes("lists"));
  assert.ok(!isSecondaryScreen("lists"), "un en-tête de retour sur Listes empile deux titres");
});

/* Liste figée : elle reproduit exactement le `secondaryScreens` qui vivait
   dans App.js avant la migration. Toute addition doit être un choix, pas un
   effet de bord d'un refactor sur QUICK_SCREENS. */
test("routes : la liste des écrans secondaires est exactement celle d'avant", () => {
  assert.deepEqual([...SECONDARY_SCREENS].sort(),
    ["history", "inbox", "inventory", "notes", "recipes"]);
});

test("routes : les onglets principaux ne sont pas des écrans secondaires", () => {
  for (const tab of ["home", "agenda", "meals", ...TASK_PERIODS]) {
    assert.ok(!isSecondaryScreen(tab), `${tab} ne doit pas porter de bouton retour`);
  }
});

test("routes : les réglages sont reconnus, sous-pages incluses", () => {
  assert.ok(isSettingsPath(SETTINGS_PATH));
  assert.ok(isSettingsPath(`${SETTINGS_PATH}/foyer`));
  assert.ok(!isSettingsPath(HOME_PATH));
  assert.ok(!isSettingsPath("/settings-autre"));
  assert.ok(!isSettingsPath(""));
});

/* Chaque écran doit avoir une route déclarée, sinon IonRouterOutlet ne rend
   rien du tout — écran blanc, sans erreur. */
test("routes : chaque écran a une route déclarée dans le routeur", () => {
  const screens = ["home", "agenda", "meals", "lists", "notes", "inventory", "recipes", "history", "inbox"];
  for (const screen of screens) {
    assert.ok(ROUTE_PATHS.includes(pathForTab(screen)), `route absente pour « ${screen} »`);
  }
  assert.ok(ROUTE_PATHS.includes("/tasks/:period"), "route paramétrée des tâches absente");
});

/* Une seule route **paramétrée** pour les 4 périodes : passer de
   « Aujourd'hui » à « Semaine » change un segment, pas de page. Quatre routes
   distinctes déclencheraient une animation de transition entre deux onglets
   segmentés, ce qui n'est pas le geste.

   S'y ajoute `/tasks` tout court, la racine de l'onglet : c'est la valeur du
   `href` du bouton, indispensable pour qu'Ionic tienne une pile par onglet
   (`matchesTab()` compare par préfixe, et le préfixe doit couvrir les quatre
   périodes). Sans route déclarée, ce chemin tomberait sur le repli « * ». */
test("routes : les 4 périodes partagent une seule route paramétrée", () => {
  const taskRoutes = ROUTE_PATHS.filter((path) => path.startsWith("/tasks"));
  const parameterised = taskRoutes.filter((path) => path.includes(":"));
  assert.deepEqual(parameterised, ["/tasks/:period"],
    `attendu une seule route paramétrée, trouvé ${parameterised.join(", ") || "aucune"}`);
  assert.ok(taskRoutes.includes(TAB_ROOTS.tasks),
    `la racine de l'onglet (${TAB_ROOTS.tasks}) doit être une route déclarée`);
  assert.equal(taskRoutes.length, 2,
    `attendu la racine + la route paramétrée, trouvé ${taskRoutes.join(", ")}`);
});

/* Les `href` de la barre d'onglets doivent être des préfixes du chemin réel de
   leur écran, sinon `matchesTab()` échoue et l'onglet ne s'allume pas. C'est le
   piège qui avait fait retirer les `href` en phase 2 de la migration. */
test("routes : chaque racine d'onglet préfixe le chemin de son écran", () => {
  for (const [tab, root] of Object.entries(TAB_ROOTS)) {
    const real = pathForTab(tab);
    assert.ok(real === root || real.startsWith(`${root}/`),
      `onglet ${tab} : ${real} n'est pas couvert par la racine ${root}`);
  }
});

/* Repli des réglages sur le sommaire.

   Ce que ces cas protègent : `SettingsView` reçoit une section qu'elle ne
   connaît pas et ne rend rien — page blanche, sans erreur. Un deep link périmé
   ou une faute de frappe suffit.

   L'invariant était gardé par un test e2e qui posait le chemin avec
   `pushState` + un `popstate` synthétique. Cette technique contourne le routeur
   au lieu de le piloter (déjà noté comme peu fiable pendant la migration) et
   elle simule un état inatteignable dans l'app : en WebView il n'y a pas de
   barre d'adresse, et le retour matériel ne revisite que des entrées déjà
   enregistrées. La règle est pure : elle se teste mieux ici. */
test("réglages : une section inconnue retombe sur le sommaire", () => {
  for (const path of ["/settings/nimportequoi", "/settings/PROFILE", "/settings/x/y"]) {
    assert.deepEqual(settingsStateFromPath(path), { section: "main", support: "" },
      `${path} doit retomber sur le sommaire`);
  }
});

test("réglages : chaque section déclarée est reconnue dans les deux sens", () => {
  for (const section of SETTINGS_SECTIONS) {
    const path = settingsPathFor(section);
    assert.equal(path, `${SETTINGS_PATH}/${section}`);
    assert.deepEqual(settingsStateFromPath(path), { section, support: "" });
  }
});

test("réglages : les pages de support sont reconnues, les autres non", () => {
  for (const page of SUPPORT_PAGES) {
    const path = settingsPathFor("", page);
    assert.equal(path, `${SETTINGS_PATH}/support/${page}`);
    assert.deepEqual(settingsStateFromPath(path), { section: "main", support: page });
  }
  assert.deepEqual(settingsStateFromPath(`${SETTINGS_PATH}/support/inventee`),
    { section: "main", support: "" },
    "une page de support inconnue ne doit pas être propagée telle quelle");
});

test("réglages : le sommaire, avec ou sans barre oblique finale", () => {
  for (const path of [SETTINGS_PATH, `${SETTINGS_PATH}/`]) {
    assert.deepEqual(settingsStateFromPath(path), { section: "main", support: "" });
  }
});

test("réglages : un chemin hors réglages ne renvoie jamais de section", () => {
  for (const path of ["/home", "/tasks/weekly", "", null, undefined]) {
    assert.deepEqual(settingsStateFromPath(path), { section: "main", support: "" });
  }
});

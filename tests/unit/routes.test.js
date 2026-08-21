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
  TASK_PERIODS,
  bottomIdForTab,
  isSecondaryScreen,
  isSettingsPath,
  pathForTab,
  tabFromPath,
} from "../../src/routes.js";

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

/* Une seule route pour les 4 périodes : passer de « Aujourd'hui » à
   « Semaine » change un segment, pas de page. Quatre routes distinctes
   déclencheraient une animation de transition entre deux onglets segmentés,
   ce qui n'est pas le geste. */
test("routes : les 4 périodes partagent une seule route", () => {
  const taskRoutes = ROUTE_PATHS.filter((path) => path.startsWith("/tasks"));
  assert.equal(taskRoutes.length, 1, `attendu 1 route pour les tâches, trouvé ${taskRoutes.join(", ")}`);
});

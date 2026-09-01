import test from "node:test";
import assert from "node:assert/strict";

import {
  activePersonStorageKey,
  deviceModeStorageKey,
  readDeviceMode,
  readStoredActivePerson,
  storeActivePerson,
  storeDeviceMode,
} from "../../src/app/utils/personStorage.js";
import { PREMIUM_TABS, isPremiumTab } from "../../src/app/utils/premium.js";
import { installMockLocalStorage, uninstallMockLocalStorage } from "../helpers/browser-globals.js";

test.beforeEach(() => {
  installMockLocalStorage();
});

test.afterEach(() => {
  uninstallMockLocalStorage();
});

test("personne active : les cles sont cloisonnees par famille", () => {
  assert.equal(activePersonStorageKey("fam-1"), "mrd-active-person-fam-1");
  assert.equal(deviceModeStorageKey("fam-1"), "mrd-device-mode-fam-1");
  assert.notEqual(activePersonStorageKey("fam-1"), activePersonStorageKey("fam-2"));
});

test("personne active : aller-retour ecriture / lecture", () => {
  storeActivePerson("fam-1", "person-7");
  assert.equal(readStoredActivePerson("fam-1"), "person-7");
  // Une autre famille ne voit pas la personne active de la premiere.
  assert.equal(readStoredActivePerson("fam-2"), "");
});

test("personne active : sans familyId, on n ecrit ni ne lit rien", () => {
  storeActivePerson("", "person-7");
  assert.equal(localStorage.length, 0);
  assert.equal(readStoredActivePerson(""), "");
});

test("personne active : une valeur vide efface la selection", () => {
  storeActivePerson("fam-1", "person-7");
  storeActivePerson("fam-1", "");
  assert.equal(readStoredActivePerson("fam-1"), "");
});

test("mode appareil : personnel par defaut, partage seulement si explicite", () => {
  assert.equal(readDeviceMode("fam-1"), "personal");

  storeDeviceMode("fam-1", "shared");
  assert.equal(readDeviceMode("fam-1"), "shared");

  storeDeviceMode("fam-1", "personal");
  assert.equal(readDeviceMode("fam-1"), "personal");
});

test("mode appareil : une valeur inconnue retombe sur personnel", () => {
  storeDeviceMode("fam-1", "n-importe-quoi");
  assert.equal(localStorage.getItem(deviceModeStorageKey("fam-1")), "personal");
  assert.equal(readDeviceMode("fam-1"), "personal");
});

test("mode appareil : sans familyId, personnel et aucune ecriture", () => {
  storeDeviceMode("", "shared");
  assert.equal(localStorage.length, 0);
  assert.equal(readDeviceMode(""), "personal");
});

test("stockage : un localStorage indisponible ne fait pas planter la lecture", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("acces refuse");
    },
  });

  assert.equal(readStoredActivePerson("fam-1"), "");
  assert.equal(readDeviceMode("fam-1"), "personal");
  assert.doesNotThrow(() => storeActivePerson("fam-1", "p1"));
  assert.doesNotThrow(() => storeDeviceMode("fam-1", "shared"));
});

test("premium : seuls repas, inventaire et recettes sont premium", () => {
  assert.deepEqual(PREMIUM_TABS, ["meals", "inventory", "recipes"]);
  PREMIUM_TABS.forEach((tab) => assert.equal(isPremiumTab(tab), true));
  ["home", "tasks", "agenda", "lists", "notes", "settings", "", undefined].forEach((tab) => {
    assert.equal(isPremiumTab(tab), false);
  });
});

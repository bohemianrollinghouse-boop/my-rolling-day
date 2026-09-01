import test from "node:test";
import assert from "node:assert/strict";

import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "../../src/app/config/constants.js";
import { THEME_STORAGE_KEY, applyTheme, readStoredTheme } from "../../src/app/utils/theme.js";
import {
  installMockDocument,
  installMockLocalStorage,
  uninstallMockDocument,
  uninstallMockLocalStorage,
} from "../helpers/browser-globals.js";

let doc;

test.beforeEach(() => {
  installMockLocalStorage();
  doc = installMockDocument({ metas: ["theme-color", "apple-mobile-web-app-status-bar-style"] });
});

test.afterEach(() => {
  uninstallMockDocument();
  uninstallMockLocalStorage();
});

test("theme : clair par defaut, sombre seulement si explicitement stocke", () => {
  assert.equal(readStoredTheme(), "light");

  localStorage.setItem(THEME_STORAGE_KEY, "dark");
  assert.equal(readStoredTheme(), "dark");

  localStorage.setItem(THEME_STORAGE_KEY, "sepia");
  assert.equal(readStoredTheme(), "light");
});

test("theme : un localStorage indisponible retombe sur clair", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("acces refuse");
    },
  });
  assert.equal(readStoredTheme(), "light");
});

test("theme sombre : data-theme, classe Ionic et metas sont poses ensemble", () => {
  applyTheme("dark");

  assert.equal(doc.documentElement.getAttribute("data-theme"), "dark");
  assert.equal(doc.documentElement.classList.contains("ion-palette-dark"), true);
  assert.equal(doc.querySelector('meta[name="theme-color"]').getAttribute("content"), THEME_COLOR_DARK);
  assert.equal(
    doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content"),
    "black",
  );
});

test("theme clair : la classe Ionic est retiree et les metas repassent en clair", () => {
  applyTheme("dark");
  applyTheme("light");

  assert.equal(doc.documentElement.getAttribute("data-theme"), "light");
  assert.equal(doc.documentElement.classList.contains("ion-palette-dark"), false);
  assert.equal(doc.querySelector('meta[name="theme-color"]').getAttribute("content"), THEME_COLOR_LIGHT);
  assert.equal(
    doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content"),
    "default",
  );
});

test("theme : toute valeur autre que dark est traitee comme clair", () => {
  applyTheme("dark");
  applyTheme(undefined);
  assert.equal(doc.documentElement.getAttribute("data-theme"), "light");
  assert.equal(doc.documentElement.classList.contains("ion-palette-dark"), false);
});

test("theme : idempotent, appliquer deux fois donne le meme resultat", () => {
  applyTheme("dark");
  const first = doc.documentElement.getAttribute("data-theme");
  applyTheme("dark");
  assert.equal(doc.documentElement.getAttribute("data-theme"), first);
  assert.equal(doc.documentElement.classList.contains("ion-palette-dark"), true);
});

test("theme : sans persist, rien n est ecrit dans localStorage", () => {
  applyTheme("dark");
  assert.equal(localStorage.getItem(THEME_STORAGE_KEY), null);
});

test("theme : avec persist, le choix est memorise", () => {
  applyTheme("dark", { persist: true });
  assert.equal(localStorage.getItem(THEME_STORAGE_KEY), "dark");
  assert.equal(readStoredTheme(), "dark");

  applyTheme("light", { persist: true });
  assert.equal(localStorage.getItem(THEME_STORAGE_KEY), "light");
  assert.equal(readStoredTheme(), "light");
});

test("theme : toutes les metas theme-color sont mises a jour, pas seulement la premiere", () => {
  uninstallMockDocument();
  doc = installMockDocument({ metas: ["theme-color", "theme-color"] });

  applyTheme("dark");
  doc.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    assert.equal(meta.getAttribute("content"), THEME_COLOR_DARK);
  });
});

test("theme : une meta status-bar absente ne fait pas planter", () => {
  uninstallMockDocument();
  doc = installMockDocument({ metas: ["theme-color"] });
  assert.doesNotThrow(() => applyTheme("dark"));
  assert.equal(doc.documentElement.getAttribute("data-theme"), "dark");
});

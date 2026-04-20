import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultState } from "../../src/data/defaultState.js";
import { checkReset, normalizeState } from "../../src/utils/state.js";
import { installMockLocalStorage, uninstallMockLocalStorage } from "../helpers/browser-globals.js";

test.beforeEach(() => {
  installMockLocalStorage();
});

test.afterEach(() => {
  uninstallMockLocalStorage();
});

test("normalizeState cree la liste de courses par defaut si elle manque", () => {
  const state = normalizeState({});
  assert.equal(state.lists.length, 1);
  assert.equal(state.lists[0].name, "Liste de courses");
  assert.equal(state.lists[0].isShoppingList, true);
});

test("normalizeState migre les anciens ingredients pantry vers les condiments", () => {
  const state = normalizeState({
    recipes: [
      {
        id: "recipe-1",
        name: "Test",
        ingredients: [
          { id: "ing-1", name: "Carottes", quantity: "2", unit: "unite" },
          { id: "ing-2", name: "Sel", kind: "pantry" },
        ],
        condiments: ["poivre"],
      },
    ],
  });

  assert.equal(state.recipes[0].ingredients.length, 1);
  assert.equal(state.recipes[0].ingredients[0].name, "Carottes");
  assert.deepEqual(state.recipes[0].condiments.sort(), ["poivre", "sel"]);
});

test("normalizeState dedupe les items de liste et regenere les ids dupliques", () => {
  const state = normalizeState({
    lists: [
      {
        id: "shopping-default",
        name: "Liste de courses",
        isShoppingList: true,
        addToInventory: true,
        items: [
          { id: "dup", text: "Tomates", quantity: "1", unit: "unite" },
          { id: "dup", text: "tomate", quantity: "2", unit: "unite" },
          { id: "other", text: "Oignons", quantity: "3", unit: "unite" },
        ],
      },
    ],
  });

  const items = state.lists[0].items;
  assert.equal(items.length, 2);
  assert.equal(items[0].text.toLowerCase(), "tomates");
  assert.equal(items[0].quantity, "3");
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
});

test("checkReset met a jour les cles de reset avec la date fournie", () => {
  const baseState = createDefaultState();
  const { state } = checkReset(baseState, new Date(Date.UTC(2026, 3, 20, 10, 0, 0)));

  assert.equal(state.lastResetDaily, "2026-04-20");
  assert.equal(state.lastResetWeekly, "2026-04-20");
  assert.equal(state.lastResetMonthly, "2026-04");
});

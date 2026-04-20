import test from "node:test";
import assert from "node:assert/strict";

import {
  collectKnownProducts,
  findSimilarItem,
  formatQuantityUnit,
  normalizeProductName,
} from "../../src/utils/productUtils.js";

test("normalizeProductName harmonise accents, pluriels et variantes simples", () => {
  assert.equal(normalizeProductName("  Pommes  "), "pomes");
  assert.equal(normalizeProductName("Pâtes"), "pates");
  assert.equal(normalizeProductName("pattes"), "pates");
  assert.equal(normalizeProductName("Courgettes!"), "courgete");
});

test("findSimilarItem retrouve un produit sur le nom normalise", () => {
  const result = findSimilarItem("courgettes", [{ id: "1", name: "Courgette" }]);
  assert.ok(result);
  assert.equal(result.item.id, "1");
  assert.equal(result.type, "exact");
});

test("collectKnownProducts dedupe les doublons exacts et conserve les variantes prudentes", () => {
  const known = collectKnownProducts({
    inventory: [{ id: "inv-1", name: "Pomme", quantity: "2", unit: "unite", stockState: "ok" }],
    lists: [{ id: "list-1", items: [{ id: "item-1", text: "pommes", quantity: "4", unit: "unite" }] }],
    recipes: [{ id: "recipe-1", ingredients: [{ id: "ing-1", name: "POMME", quantity: "1", unit: "unite" }] }],
  });

  assert.equal(known.length, 2);
  assert.equal(known[0].id, "inv-1");
  assert.equal(known[0].source, "inventory");
  assert.equal(known[0].normalizedName, "pome");
  assert.equal(known[1].source, "list");
});

test("formatQuantityUnit affiche correctement les quantites", () => {
  assert.equal(formatQuantityUnit("4", "unité"), "4 unités");
  assert.equal(formatQuantityUnit("500", "g"), "500 g");
  assert.equal(formatQuantityUnit("3", ""), "3");
  assert.equal(formatQuantityUnit("", "kg"), "kg");
});

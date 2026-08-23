import test from "node:test";
import assert from "node:assert/strict";

import { addStockQuantities } from "../../src/app/utils/units.js";
import { inventoryEntriesCanMerge, mergeInventoryEntry } from "../../src/app/hooks/useLists.js";

/* Regression : la fusion additionnait les nombres sans jamais regarder les
   unites. « 500 g de riz » plus « 1 kg de riz » donnait 501 g. */

test("addStockQuantities convertit avant d additionner", () => {
  const sum = addStockQuantities({ quantity: "500", unit: "g" }, { quantity: "1", unit: "kg" });
  assert.equal(sum.mergeable, true);
  assert.equal(sum.quantity, "1500");
  assert.equal(sum.unit, "g");
});

test("addStockQuantities garde l unite de la ligne existante", () => {
  const sum = addStockQuantities({ quantity: "1", unit: "kg" }, { quantity: "500", unit: "g" });
  assert.equal(sum.quantity, "1,5");
  assert.equal(sum.unit, "kg");
});

test("addStockQuantities refuse d additionner des unites incompatibles", () => {
  assert.equal(addStockQuantities({ quantity: "500", unit: "g" }, { quantity: "1", unit: "l" }).mergeable, false);
  assert.equal(addStockQuantities({ quantity: "2", unit: "unité" }, { quantity: "200", unit: "g" }).mergeable, false);
  // Unites maison : pas de conversion possible, seule l egalite stricte compte.
  assert.equal(addStockQuantities({ quantity: "2", unit: "sachet" }, { quantity: "1", unit: "boite" }).mergeable, false);
  const sameHomeUnit = addStockQuantities({ quantity: "2", unit: "sachet" }, { quantity: "1", unit: "sachet" });
  assert.equal(sameHomeUnit.mergeable, true);
  assert.equal(sameHomeUnit.quantity, "3");
});

test("addStockQuantities fait emprunter l unite absente a celle d en face", () => {
  const sum = addStockQuantities({ quantity: "2", unit: "paquet" }, { quantity: "1", unit: "" });
  assert.equal(sum.mergeable, true);
  assert.equal(sum.quantity, "3");
  assert.equal(sum.unit, "paquet");
});

test("addStockQuantities compte une quantite absente pour une unite", () => {
  // « j en rajoute » sans rien preciser : le stock passe de 1 a 2.
  const sum = addStockQuantities({ quantity: "", unit: "" }, { quantity: "", unit: "" });
  assert.equal(sum.hasQuantity, true);
  assert.equal(sum.quantity, "2");
});

test("addStockQuantities ne touche pas aux quantites non chiffrables", () => {
  const sum = addStockQuantities({ quantity: "un peu", unit: "" }, { quantity: "un peu", unit: "" });
  assert.equal(sum.mergeable, true);
  assert.equal(sum.hasQuantity, false);
});

test("inventoryEntriesCanMerge separe les lignes que la conversion ne couvre pas", () => {
  const riz = { name: "Riz", quantity: "500", unit: "g", expiryDate: "" };
  assert.equal(inventoryEntriesCanMerge(riz, { name: "riz", quantity: "1", unit: "kg", expiryDate: "" }), true);
  assert.equal(inventoryEntriesCanMerge(riz, { name: "riz", quantity: "1", unit: "l", expiryDate: "" }), false);
  // La regle DLC d origine tient toujours.
  assert.equal(inventoryEntriesCanMerge(riz, { name: "riz", quantity: "1", unit: "kg", expiryDate: "2026-09-01" }), false);
  assert.equal(inventoryEntriesCanMerge(riz, { name: "Pates", quantity: "1", unit: "kg", expiryDate: "" }), false);
});

test("mergeInventoryEntry additionne dans l unite de la ligne existante", () => {
  const merged = mergeInventoryEntry(
    { id: "a", name: "Riz", quantity: "500", unit: "g", stockState: "empty", needsRestock: true },
    { id: "b", name: "Riz", quantity: "1", unit: "kg", purchaseDate: "2026-08-14" },
  );
  assert.equal(merged.quantity, "1500");
  assert.equal(merged.unit, "g");
  assert.equal(merged.id, "a");
  // Racheter un produit epuise le remet en stock.
  assert.equal(merged.stockState, "in_stock");
  assert.equal(merged.needsRestock, false);
});

test("mergeInventoryEntry empile les nouilles instantanees sans unite", () => {
  const merged = mergeInventoryEntry(
    { id: "a", name: "Nouilles instantanées", quantity: "", unit: "", stockState: "in_stock" },
    { id: "b", name: "Nouilles instantanees", quantity: "", unit: "" },
  );
  assert.equal(merged.quantity, "2");
});

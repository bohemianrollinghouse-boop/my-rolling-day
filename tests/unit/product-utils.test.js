import test from "node:test";
import assert from "node:assert/strict";

import {
  collectKnownProducts,
  findSimilarItem,
  formatQuantityUnit,
  normalizeProductName,
  suggestItems,
} from "../../src/app/utils/productUtils.js";

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

test("normalizeProductName : entrees vides et ponctuation seule", () => {
  assert.equal(normalizeProductName(""), "");
  assert.equal(normalizeProductName(null), "");
  assert.equal(normalizeProductName(undefined), "");
  assert.equal(normalizeProductName("!!!"), "");
  assert.equal(normalizeProductName("   "), "");
});

test("normalizeProductName : les mots courts ne sont pas depluralises a tort", () => {
  assert.equal(normalizeProductName("ail"), "ail");
  assert.equal(normalizeProductName("riz"), "riz");
  assert.equal(normalizeProductName("oeufs"), "oeufs", "moins de 5 lettres : le s est conserve");
});

test("normalizeProductName : les finales en -eaux deviennent -eau", () => {
  assert.equal(normalizeProductName("Poireaux"), normalizeProductName("poireau"));
});

test("findSimilarItem : une saisie trop courte ne matche jamais", () => {
  assert.equal(findSimilarItem("a", [{ id: "1", name: "a" }]), null);
  assert.equal(findSimilarItem("", [{ id: "1", name: "Pomme" }]), null);
});

test("findSimilarItem : sans correspondance ou sans liste, on renvoie null", () => {
  assert.equal(findSimilarItem("Kiwi", [{ id: "1", name: "Pomme" }]), null);
  assert.equal(findSimilarItem("Kiwi", []), null);
  assert.equal(findSimilarItem("Kiwi", null), null);
});

test("findSimilarItem : l article en cours d edition est ignore", () => {
  const items = [{ id: "1", name: "Courgette" }, { id: "2", name: "courgettes" }];
  assert.equal(findSimilarItem("Courgette", items, "1").item.id, "2");
  assert.equal(findSimilarItem("Courgette", [items[0]], "1"), null);
});

test("suggestItems : correspondance partielle, insensible a la casse et aux accents", () => {
  const items = [
    { id: "1", name: "Pâtes complètes" },
    { id: "2", name: "Pain de mie" },
    { id: "3", name: "Compote" },
  ];
  assert.deepEqual(suggestItems("pate", items).map((item) => item.id), ["1"]);
  assert.deepEqual(suggestItems("PA", items).map((item) => item.id), ["1", "2"]);
  assert.deepEqual(suggestItems("com", items).map((item) => item.id), ["1", "3"]);
});

test("suggestItems : une saisie vide ne propose rien", () => {
  const items = [{ id: "1", name: "Pomme" }];
  assert.deepEqual(suggestItems("", items), []);
  assert.deepEqual(suggestItems("   ", items), []);
  assert.deepEqual(suggestItems(null, items), []);
});

test("suggestItems : la liste est plafonnee et l article edite est exclu", () => {
  const items = Array.from({ length: 10 }, (_, index) => ({ id: String(index), name: `Pomme ${index}` }));
  assert.equal(suggestItems("pomme", items).length, 6, "6 suggestions par defaut");
  assert.equal(suggestItems("pomme", items, null, 3).length, 3);
  assert.equal(suggestItems("pomme", items, "0").some((item) => item.id === "0"), false);
});

test("suggestItems : sans liste, on renvoie un tableau vide", () => {
  assert.deepEqual(suggestItems("pomme", null), []);
  assert.deepEqual(suggestItems("pomme", undefined), []);
});

test("collectKnownProducts : sans rien, la base est vide", () => {
  assert.deepEqual(collectKnownProducts(), []);
  assert.deepEqual(collectKnownProducts({}), []);
  assert.deepEqual(collectKnownProducts({ inventory: null, lists: "x", recipes: 3 }), []);
});

test("collectKnownProducts : les entrees sans nom exploitable sont ignorees", () => {
  const known = collectKnownProducts({
    inventory: [{ id: "a", name: "  " }, { id: "b" }, { id: "c", name: "!!!" }, { id: "d", name: "Sel" }],
  });
  assert.deepEqual(known.map((item) => item.id), ["d"]);
});

test("collectKnownProducts : le premier vu gagne, l inventaire avant les listes puis les recettes", () => {
  const known = collectKnownProducts({
    lists: [{ id: "l1", items: [{ id: "item-1", text: "Sel", quantity: "1", unit: "kg" }] }],
    recipes: [{ id: "r1", ingredients: [{ id: "ing-1", name: "sel" }] }],
  });
  assert.equal(known.length, 1);
  assert.equal(known[0].source, "list");
  assert.equal(known[0].unit, "kg");
});

test("collectKnownProducts : un identifiant est fabrique quand l entree n en a pas", () => {
  const [product] = collectKnownProducts({ inventory: [{ name: "Sel" }] });
  assert.equal(product.id, "inventory-sel");
  assert.equal(product.normalizedName, "sel");
});

test("collectKnownProducts : les listes sans items ne font pas planter", () => {
  assert.deepEqual(collectKnownProducts({ lists: [{ id: "l1" }, { id: "l2", items: null }] }), []);
  assert.deepEqual(collectKnownProducts({ recipes: [{ id: "r1" }, { id: "r2", ingredients: "x" }] }), []);
});

test("formatQuantityUnit : le pluriel d unite suit la quantite", () => {
  assert.equal(formatQuantityUnit("1", "unité"), "1 unité");
  assert.equal(formatQuantityUnit("2", "unité"), "2 unités");
});

test("formatQuantityUnit : une quantite nulle ou absente s efface", () => {
  assert.equal(formatQuantityUnit("", ""), "");
  assert.equal(formatQuantityUnit(null, null), "");
  assert.equal(formatQuantityUnit("0", "g"), "g", "0 g n a pas de sens : on n affiche que l unite");
  assert.equal(formatQuantityUnit("0", ""), "");
});

test("formatQuantityUnit : une quantite non numerique est affichee telle quelle", () => {
  assert.equal(formatQuantityUnit("un peu", "sel"), "un peu sel");
  assert.equal(formatQuantityUnit("  3  ", "g"), "3 g", "les espaces sont rognes");
});

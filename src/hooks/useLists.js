import { useEffect, useRef } from "../lib.js";
import { getCurrentAppDate, localDateKey } from "../utils/date.js?v=2026-04-19-time-sim-2";
import { normalizeProductName } from "../utils/productUtils.js?v=2026-04-19-product-graph-1";

function todayKey() {
  return localDateKey(getCurrentAppDate());
}

function normalizeInventoryName(value = "") {
  return normalizeProductName(value);
}

function readQuantityValue(rawQuantity, emptyAsOne = false) {
  const trimmed = String(rawQuantity || "").trim();
  if (!trimmed) return emptyAsOne ? 1 : null;
  const match = trimmed.match(/^\d+(?:[.,]\d+)?$/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatQuantityValue(quantity) {
  if (quantity == null || quantity === "") return "";
  if (Number.isInteger(quantity)) return String(quantity);
  return String(quantity).replace(".", ",");
}

function makeEntityId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseListItemText(text = "") {
  const trimmed = String(text).trim();
  const match = trimmed.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (!match) return { name: trimmed, quantity: "" };
  return { quantity: match[1].replace(",", "."), name: match[2].trim() };
}

function normalizeListItemPayload(text = "", quantity = "", unit = "") {
  const parsed = parseListItemText(text);
  return {
    text: parsed.name,
    quantity: String(quantity || "").trim() || parsed.quantity || "",
    unit: String(unit || "").trim(),
  };
}

function listItemsCanMerge(existingItem, incomingItem) {
  return normalizeProductName(existingItem.text) === normalizeProductName(incomingItem.text);
}

function mergeListItem(existingItem, incomingItem) {
  const currentQuantity = readQuantityValue(existingItem.quantity, true);
  const nextQuantity = readQuantityValue(incomingItem.quantity, true);
  const mergedQuantity = (currentQuantity || 0) + (nextQuantity || 0);
  return {
    ...existingItem,
    text: incomingItem.text || existingItem.text,
    quantity: formatQuantityValue(mergedQuantity || ""),
    unit: incomingItem.unit || existingItem.unit || "",
    done: false,
    purchasedAt: "",
  };
}

function upsertMergedListItems(items, incomingItem) {
  const safeItems = Array.isArray(items) ? items : [];
  const matchingItems = safeItems.filter((item) => listItemsCanMerge(item, incomingItem));
  if (!matchingItems.length) return [...safeItems, incomingItem];

  const mergedItem = [...matchingItems.slice(1), incomingItem].reduce(
    (current, item) => mergeListItem(current, item),
    matchingItems[0],
  );

  return [
    ...safeItems.filter((item) => !listItemsCanMerge(item, incomingItem)),
    mergedItem,
  ];
}

export function inventoryEntriesCanMerge(existingItem, incomingItem) {
  if (normalizeInventoryName(existingItem.name) !== normalizeInventoryName(incomingItem.name)) return false;
  const existingExpiry = String(existingItem.expiryDate || "").trim();
  const incomingExpiry = String(incomingItem.expiryDate || "").trim();
  if (!existingExpiry && !incomingExpiry) return true;
  return existingExpiry && incomingExpiry && existingExpiry === incomingExpiry;
}

export function mergeInventoryEntry(existingItem, incomingItem) {
  const currentQuantity = readQuantityValue(existingItem.quantity, true);
  const nextQuantity = readQuantityValue(incomingItem.quantity, true);
  if (currentQuantity == null && nextQuantity == null) {
    return { ...existingItem, purchaseDate: incomingItem.purchaseDate || existingItem.purchaseDate, stockState: "in_stock", needsRestock: false };
  }
  const mergedQuantity = (currentQuantity || 0) + (nextQuantity || 0);
  return {
    ...existingItem,
    quantity: formatQuantityValue(mergedQuantity || ""),
    purchaseDate: incomingItem.purchaseDate || existingItem.purchaseDate,
    stockState: "in_stock",
    needsRestock: false,
  };
}

export function ensureShoppingList(lists) {
  const safeLists = Array.isArray(lists) ? lists : [];
  const found = safeLists.find((list) => list.isShoppingList) || safeLists.find((list) => list.name === "Liste de courses");
  if (found) {
    return safeLists.map((list) => (list.id === found.id ? { ...list, isShoppingList: true } : list));
  }
  return [
    { id: "shopping-default", name: "Liste de courses", addToInventory: true, isShoppingList: true, items: [] },
    ...safeLists,
  ];
}

export function syncShoppingFromLists(lists) {
  const shoppingList = ensureShoppingList(lists).find((list) => list.isShoppingList);
  return Array.isArray(shoppingList?.items) ? shoppingList.items : [];
}

export function useLists(state, updateState, showToast) {
  const toggleLocksRef = useRef(new Set());
  const toggleTimersRef = useRef(new Map());

  useEffect(() => () => {
    toggleTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    toggleTimersRef.current.clear();
    toggleLocksRef.current.clear();
  }, []);

  function lockToggle(listId, itemId) {
    const key = `${listId}:${itemId}`;
    if (toggleLocksRef.current.has(key)) return false;
    toggleLocksRef.current.add(key);
    const existingTimer = toggleTimersRef.current.get(key);
    if (existingTimer) clearTimeout(existingTimer);
    const timerId = setTimeout(() => {
      toggleLocksRef.current.delete(key);
      toggleTimersRef.current.delete(key);
    }, 500);
    toggleTimersRef.current.set(key, timerId);
    return true;
  }

  function handleUndoPurchase(undoPayload) {
    if (!undoPayload?.listId || !undoPayload?.itemId) return;
    updateState((previous) => {
      const nextLists = ensureShoppingList(previous.lists).map((list) => {
        if (list.id !== undoPayload.listId) return list;
        const restoredItems = (Array.isArray(list.items) ? list.items : []).map((item) =>
          item.id === undoPayload.itemId
            ? {
                ...item,
                done: false,
                purchasedAt: "",
                quantity: undoPayload.previousListItem?.quantity ?? item.quantity,
                unit: undoPayload.previousListItem?.unit ?? item.unit,
                text: undoPayload.previousListItem?.text || item.text,
              }
            : item,
        );
        return { ...list, items: restoredItems.slice().sort((l, r) => Number(l.done) - Number(r.done)) };
      });
      let nextInventory = previous.inventory;
      if (undoPayload.inventoryUndo?.kind === "add") {
        nextInventory = previous.inventory.filter((item) => item.id !== undoPayload.inventoryUndo.inventoryItemId);
      } else if (undoPayload.inventoryUndo?.kind === "merge" && undoPayload.inventoryUndo.previousInventoryItem) {
        nextInventory = previous.inventory.map((item) =>
          item.id === undoPayload.inventoryUndo.previousInventoryItem.id ? undoPayload.inventoryUndo.previousInventoryItem : item,
        );
      }
      return { ...previous, lists: nextLists, shopping: syncShoppingFromLists(nextLists), inventory: nextInventory };
    });
  }

  function handleCreateList(listForm) {
    if (!listForm?.name?.trim()) return;
    updateState((previous) => {
      const nextLists = ensureShoppingList([
        ...ensureShoppingList(previous.lists),
        { id: `list-${Date.now()}`, name: listForm.name.trim(), addToInventory: false, isShoppingList: false, items: [], createdBy: listForm.createdBy || "", visibility: listForm.visibility || "household", sharedWith: [] },
      ]);
      return { ...previous, lists: nextLists, shopping: syncShoppingFromLists(nextLists) };
    });
  }

  function handleDeleteList(listId) {
    updateState((previous) => {
      const currentLists = ensureShoppingList(previous.lists);
      const target = currentLists.find((list) => list.id === listId);
      if (!target || target.isShoppingList) return previous;
      const nextLists = currentLists.filter((list) => list.id !== listId);
      return { ...previous, lists: nextLists, shopping: syncShoppingFromLists(nextLists) };
    });
  }

  function handleUpdateList(listId, updates) {
    updateState((previous) => {
      const nextLists = ensureShoppingList(previous.lists).map((list) =>
        list.id === listId
          ? {
              ...list,
              name: updates.name?.trim() || list.name,
              addToInventory: Object.prototype.hasOwnProperty.call(updates, "addToInventory") ? Boolean(updates.addToInventory) : list.addToInventory,
              visibility: list.isShoppingList ? "household" : Object.prototype.hasOwnProperty.call(updates, "visibility") ? updates.visibility : list.visibility,
              sharedWith: Object.prototype.hasOwnProperty.call(updates, "sharedWith") ? updates.sharedWith : list.sharedWith,
            }
          : list,
      );
      return { ...previous, lists: nextLists, shopping: syncShoppingFromLists(nextLists) };
    });
  }

  function handleAddListItem(listId, itemForm) {
    const rawText = typeof itemForm === "string" ? itemForm : itemForm?.text;
    const rawQuantity = typeof itemForm === "string" ? "" : itemForm?.quantity;
    const rawUnit = typeof itemForm === "string" ? "" : itemForm?.unit;
    if (!rawText?.trim()) return;
    const normalized = normalizeListItemPayload(rawText, rawQuantity, rawUnit);
    updateState((previous) => {
      const nextLists = ensureShoppingList(previous.lists).map((list) => {
        if (list.id !== listId) return list;
        const items = Array.isArray(list.items) ? list.items : [];
        const incomingItem = { id: makeEntityId("list-item"), text: normalized.text, quantity: normalized.quantity, unit: normalized.unit, done: false, purchasedAt: "" };
        const nextItems = upsertMergedListItems(items, incomingItem);
        return {
          ...list,
          items: nextItems.slice().sort((l, r) => Number(l.done) - Number(r.done)),
        };
      });
      return { ...previous, lists: nextLists, shopping: syncShoppingFromLists(nextLists) };
    });
  }

  function handleUpdateListItem(listId, itemId, updates) {
    updateState((previous) => {
      const nextLists = ensureShoppingList(previous.lists).map((list) => {
        if (list.id !== listId) return list;
        const nextItems = (Array.isArray(list.items) ? list.items : []).map((item) => {
          if (item.id !== itemId) return item;
          const nextText = Object.prototype.hasOwnProperty.call(updates || {}, "text") ? String(updates.text || "").trim() : item.text;
          const nextQuantity = Object.prototype.hasOwnProperty.call(updates || {}, "quantity") ? String(updates.quantity || "").trim() : item.quantity || "";
          const nextUnit = Object.prototype.hasOwnProperty.call(updates || {}, "unit") ? String(updates.unit || "").trim() : item.unit || "";
          return {
            ...item,
            text: nextText || item.text,
            quantity: nextQuantity,
            unit: nextUnit,
          };
        });
        return { ...list, items: nextItems };
      });
      return { ...previous, lists: nextLists, shopping: syncShoppingFromLists(nextLists) };
    });
  }

  function handleToggleListItem(listId, itemId) {
    if (!lockToggle(listId, itemId)) return;
    const currentLists = ensureShoppingList(state.lists);
    const currentList = currentLists.find((list) => list.id === listId) || null;
    const currentItem = Array.isArray(currentList?.items) ? currentList.items.find((item) => item.id === itemId) || null : null;
    const nextDone = currentItem ? !currentItem.done : false;
    let inventoryAdded = null;
    let inventoryUndo = null;
    let shouldShowInventoryToast = false;

    if (currentItem && currentList?.addToInventory && nextDone) {
      const parsed = parseListItemText(currentItem.text);
      inventoryAdded = {
        id: makeEntityId("inventory"),
        name: currentItem.text || parsed.name,
        quantity: String(currentItem.quantity || "").trim() || parsed.quantity || "",
        unit: String(currentItem.unit || "").trim(),
        purchaseDate: todayKey(),
        expiryDate: "",
        price: "",
        stockState: "in_stock",
        needsRestock: false,
      };
      const mergeIndex = state.inventory.findIndex((item) => inventoryEntriesCanMerge(item, inventoryAdded));
      inventoryUndo = mergeIndex >= 0
        ? { kind: "merge", previousInventoryItem: state.inventory[mergeIndex] }
        : { kind: "add", inventoryItemId: inventoryAdded.id };
      shouldShowInventoryToast = true;
    }

    const undoPayload = currentItem
      ? {
          listId,
          itemId,
          inventoryUndo,
          previousListItem: {
            text: currentItem.text,
            quantity: currentItem.quantity || "",
            unit: currentItem.unit || "",
          },
        }
      : null;

    updateState((previous) => {
      const nextLists = ensureShoppingList(previous.lists).map((list) => {
        if (list.id !== listId) return list;
        const nextItems = (Array.isArray(list.items) ? list.items : []).map((item) => {
          if (item.id !== itemId) return item;
          const willBeDone = !item.done;
          return {
            ...item,
            done: willBeDone,
            purchasedAt: willBeDone ? todayKey() : "",
            quantity: willBeDone ? "0" : item.quantity,
          };
        });
        return { ...list, items: nextItems.slice().sort((l, r) => Number(l.done) - Number(r.done)) };
      });
      let nextInventory = previous.inventory;
      if (inventoryAdded?.name) {
        const mergeIndex = previous.inventory.findIndex((item) => inventoryEntriesCanMerge(item, inventoryAdded));
        nextInventory = mergeIndex >= 0
          ? previous.inventory.map((item, index) => (index === mergeIndex ? mergeInventoryEntry(item, inventoryAdded) : item))
          : [...previous.inventory, inventoryAdded];
      }
      return { ...previous, lists: nextLists, shopping: syncShoppingFromLists(nextLists), inventory: nextInventory };
    });

    if (shouldShowInventoryToast) {
      showToast("Votre article vient d'etre ajoute a votre inventaire", {
        label: "Annuler",
        onClick: () => handleUndoPurchase(undoPayload),
      });
    }
  }

  function handleDeleteListItem(listId, itemId) {
    updateState((previous) => {
      const nextLists = ensureShoppingList(previous.lists).map((list) =>
        list.id === listId
          ? { ...list, items: (Array.isArray(list.items) ? list.items : []).filter((item) => item.id !== itemId) }
          : list,
      );
      return { ...previous, lists: nextLists, shopping: syncShoppingFromLists(nextLists) };
    });
  }

  function handleClearShoppingList() {
    updateState((previous) => {
      const nextLists = ensureShoppingList(previous.lists).map((list) =>
        list.isShoppingList ? { ...list, items: [] } : list,
      );
      return { ...previous, lists: nextLists, shopping: syncShoppingFromLists(nextLists) };
    });
  }

  function handleAddInventoryItem(item) {
    if (!item?.name?.trim()) return;
    updateState((previous) => {
      const incomingItem = {
        id: makeEntityId("inventory"),
        name: item.name.trim(),
        quantity: item.quantity || "",
        unit: item.unit || "",
        purchaseDate: item.purchaseDate || todayKey(),
        expiryDate: item.expiryDate || "",
        price: item.price || "",
        stockState: item.stockState || "in_stock",
        needsRestock: item.stockState === "empty",
      };
      const mergeIndex = previous.inventory.findIndex((entry) => inventoryEntriesCanMerge(entry, incomingItem));
      return {
        ...previous,
        inventory: mergeIndex >= 0
          ? previous.inventory.map((entry, index) => (index === mergeIndex ? mergeInventoryEntry(entry, incomingItem) : entry))
          : [...previous.inventory, incomingItem],
      };
    });
  }

  function handleUpdateInventoryItem(itemId, updates) {
    updateState((previous) => ({
      ...previous,
      inventory: previous.inventory.map((item) =>
        item.id === itemId
          ? {
              ...item,
              ...updates,
              needsRestock: updates.stockState === "empty"
                ? true
                : Object.prototype.hasOwnProperty.call(updates, "stockState")
                  ? false
                  : updates.needsRestock ?? item.needsRestock,
            }
          : item,
      ),
    }));
  }

  function handleDeleteInventoryItem(itemId) {
    updateState((previous) => ({
      ...previous,
      inventory: previous.inventory.filter((item) => item.id !== itemId),
    }));
  }

  function handleClearFinishedInventory() {
    updateState((previous) => ({
      ...previous,
      inventory: previous.inventory.filter((item) => item.stockState !== "empty"),
    }));
  }

  function handleClearAllInventory() {
    updateState((previous) => ({
      ...previous,
      inventory: [],
    }));
  }

  function handleSendInventoryToShopping(itemId) {
    updateState((previous) => {
      const target = previous.inventory.find((item) => item.id === itemId);
      if (!target) return previous;
      const shouldRemove = target.stockState === "empty";
      const nextLists = ensureShoppingList(previous.lists).map((list) => {
        if (!list.isShoppingList) return list;
        const items = Array.isArray(list.items) ? list.items : [];
        const incomingItem = {
          id: makeEntityId("list-item"),
          text: target.name,
          quantity: target.quantity || "",
          unit: target.unit || "",
          done: false,
          purchasedAt: "",
        };
        const nextItems = upsertMergedListItems(items, incomingItem);
        return {
          ...list,
          items: nextItems.slice().sort((l, r) => Number(l.done) - Number(r.done)),
        };
      });
      return {
        ...previous,
        lists: nextLists,
        shopping: syncShoppingFromLists(nextLists),
        inventory: shouldRemove ? previous.inventory.filter((item) => item.id !== itemId) : previous.inventory,
      };
    });
    showToast("Produit ajoute a votre liste de courses.");
  }

  return {
    handleCreateList, handleDeleteList, handleUpdateList,
    handleAddListItem, handleUpdateListItem, handleToggleListItem, handleDeleteListItem, handleClearShoppingList,
    handleAddInventoryItem, handleUpdateInventoryItem, handleDeleteInventoryItem, handleClearFinishedInventory, handleClearAllInventory, handleSendInventoryToShopping,
  };
}

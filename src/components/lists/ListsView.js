import { html, useEffect, useMemo, useRef, useState } from "../../lib.js";
import { findSimilarItem, formatQuantityUnit, suggestItems } from "../../utils/productUtils.js";
import { EmojiPicker } from "../tasks/EmojiPicker.js";
import { SegmentedTabs } from "../common/SegmentedTabs.js";

const LONG_PRESS_MS = 280;
const DRAG_CANCEL_DISTANCE = 8;

const UNITS = [
  { value: "", label: "—" },
  { value: "unité", label: "Unité" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "cl", label: "cl" },
  { value: "l", label: "l" },
];

function normalizeLabel(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function listEmoji(list) {
  if (list?.emoji) return list.emoji;
  if (list?.isShoppingList) return "🛒";
  const haystack = normalizeLabel(`${list?.id || ""} ${list?.name || ""}`);
  if (/(anniv|birth|cadeau|fete|party)/.test(haystack)) return "🎁";
  if (/(maison|home|brico|travaux|menage)/.test(haystack)) return "🏠";
  if (/(voyage|travel|vacances|camping|trip)/.test(haystack)) return "🏕";
  return "📦";
}

function listVisibilityMeta(list) {
  if (list?.visibility === "private") return { type: "private", icon: "🔒" };
  if (list?.visibility === "shared") return { type: "shared", icon: "👥" };
  return { type: "household", icon: "" };
}

function listItemCount(list) {
  return Array.isArray(list?.items) ? list.items.length : 0;
}

function articleLabel(count) {
  return `article${count > 1 ? "s" : ""}`;
}

function orderLists(lists) {
  return [...lists].sort((left, right) => {
    if (left.isShoppingList && !right.isShoppingList) return -1;
    if (!left.isShoppingList && right.isShoppingList) return 1;
    const leftOrder = typeof left.order === "number" ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = typeof right.order === "number" ? right.order : Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.name || "").localeCompare(String(right.name || ""), "fr", { sensitivity: "base" });
  });
}

export function ListsView({
  lists,
  activePersonId,
  people = [],
  inventory = [],
  onCreateList,
  onUpdateList,
  onAddListItem,
  onUpdateListItem,
  onToggleListItem,
  onDeleteListItem,
  onDeleteList,
  onMoveList,
  onClearShoppingList,
}) {
  const safeLists = Array.isArray(lists) ? lists : [];
  const orderedLists = useMemo(() => orderLists(safeLists), [safeLists]);
  const draggableLists = useMemo(
    () => orderedLists.filter((list) => !list.isShoppingList),
    [orderedLists],
  );
  const householdLists = useMemo(
    () => orderedLists.filter((list) => (list.visibility || "household") === "household"),
    [orderedLists],
  );
  const privateLists = useMemo(
    () => orderedLists.filter((list) => list.visibility === "private"),
    [orderedLists],
  );
  const sharedLists = useMemo(
    () => orderedLists.filter((list) => list.visibility === "shared"),
    [orderedLists],
  );
  const [activeListId, setActiveListId] = useState("");
  const [listsFilter, setListsFilter] = useState("household");
  const [showListModal, setShowListModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showItemExtraFields, setShowItemExtraFields] = useState(false);
  const [showEmojiPickerInList, setShowEmojiPickerInList] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [listForm, setListForm] = useState({ name: "", emoji: "", visibility: "household", sharedWith: [], addToInventory: false });
  const [itemForm, setItemForm] = useState({ text: "", quantity: "", unit: "", price: "", note: "" });
  const [itemWarning, setItemWarning] = useState(null);
  const [bypassItemWarning, setBypassItemWarning] = useState(false);
  const [itemSuggestions, setItemSuggestions] = useState([]);
  const [openMenuListId, setOpenMenuListId] = useState("");
  const [dragState, setDragState] = useState(null);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [openItemMenuId, setOpenItemMenuId] = useState("");
  const [showDetailKebab, setShowDetailKebab] = useState(false);
  const [showSectionKebab, setShowSectionKebab] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showShoppingInfo, setShowShoppingInfo] = useState(false);
  const listNodeRefs = useRef(new Map());
  const pressStateRef = useRef(null);
  const dragStateRef = useRef(null);
  const suppressOpenRef = useRef("");

  const selectedList = useMemo(
    () => orderedLists.find((list) => list.id === activeListId) || null,
    [orderedLists, activeListId],
  );
  const filteredLandingLists = useMemo(() => {
    if (listsFilter === "household") return householdLists;
    if (listsFilter === "private") return privateLists;
    if (listsFilter === "shared") return sharedLists;
    return orderedLists;
  }, [listsFilter, householdLists, privateLists, sharedLists, orderedLists]);
  const selectedListItems = Array.isArray(selectedList?.items) ? selectedList.items : [];
  const pendingItems = selectedListItems.filter((item) => !item.done);
  const purchasedItems = selectedListItems.filter((item) => item.done);

  useEffect(() => {
    if (!openMenuListId) return undefined;
    function handlePointerDown(event) {
      if (typeof event.target?.closest === "function" && event.target.closest(".lists-page-card-menu")) return;
      setOpenMenuListId("");
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [openMenuListId]);

  useEffect(() => {
    if (!showDetailKebab && !showSectionKebab && !openItemMenuId) return undefined;
    function handleLdvPointerDown(event) {
      if (typeof event.target?.closest === "function" && event.target.closest(".ldv-menu-wrap")) return;
      setShowDetailKebab(false);
      setShowSectionKebab(false);
      setOpenItemMenuId("");
    }
    window.addEventListener("pointerdown", handleLdvPointerDown);
    return () => window.removeEventListener("pointerdown", handleLdvPointerDown);
  }, [showDetailKebab, showSectionKebab, openItemMenuId]);

  useEffect(() => {
    dragStateRef.current = dragState;
    if (dragState) {
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    } else {
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    }
    return () => {
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [dragState]);

  useEffect(() => {
    function clearPendingPress() {
      if (pressStateRef.current?.timer) clearTimeout(pressStateRef.current.timer);
      pressStateRef.current = null;
    }

    function findClosestHoverListId(pointerY, visibleIds) {
      let bestId = visibleIds[0] || "";
      let bestDistance = Infinity;
      visibleIds.forEach((listId) => {
        const node = listNodeRefs.current.get(listId);
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const distance = Math.abs(pointerY - centerY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = listId;
        }
      });
      return bestId;
    }

    function handlePointerMove(event) {
      const activePress = pressStateRef.current;
      if (activePress && !dragStateRef.current) {
        const movedX = Math.abs(event.clientX - activePress.startX);
        const movedY = Math.abs(event.clientY - activePress.startY);
        if (movedX > DRAG_CANCEL_DISTANCE || movedY > DRAG_CANCEL_DISTANCE) {
          clearPendingPress();
        }
      }

      const activeDrag = dragStateRef.current;
      if (!activeDrag) return;
      const hoverListId = findClosestHoverListId(event.clientY, activeDrag.visibleIds);
      setDragState((previous) =>
        previous
          ? {
              ...previous,
              pointerX: event.clientX,
              pointerY: event.clientY,
              hoverListId,
            }
          : previous,
      );
      if (event.cancelable) event.preventDefault();
    }

    function handlePointerUp() {
      clearPendingPress();
      const activeDrag = dragStateRef.current;
      if (!activeDrag) return;
      const sourceIndex = activeDrag.visibleIds.indexOf(activeDrag.listId);
      const targetIndex = activeDrag.visibleIds.indexOf(activeDrag.hoverListId);
      if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
        onMoveList?.(activeDrag.listId, targetIndex, activeDrag.visibleIds);
      }
      suppressOpenRef.current = activeDrag.listId;
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      clearPendingPress();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [onMoveList]);

  function sharedPeopleForList(list) {
    const ids = Array.isArray(list?.sharedWith) ? list.sharedWith : [];
    if (!ids.length) return [];
    return ids
      .map((personId) => people.find((person) => person.id === personId))
      .filter(Boolean);
  }

  function registerListNode(listId, node) {
    if (node) {
      listNodeRefs.current.set(listId, node);
      return;
    }
    listNodeRefs.current.delete(listId);
  }

  function handleListPointerDown(event, list, visibleIds) {
    if (list?.isShoppingList) return;
    if (event.button !== undefined && event.button !== 0) return;
    if (!Array.isArray(visibleIds) || visibleIds.length < 2) return;
    if (typeof event.target?.closest === "function" && event.target.closest(".lists-page-card-menu")) return;

    if (pressStateRef.current?.timer) clearTimeout(pressStateRef.current.timer);
    const listNode = listNodeRefs.current.get(list.id);
    if (!listNode) return;

    const startX = event.clientX;
    const startY = event.clientY;
    pressStateRef.current = {
      listId: list.id,
      startX,
      startY,
      timer: setTimeout(() => {
        const rect = listNode.getBoundingClientRect();
        setDragState({
          listId: list.id,
          visibleIds,
          hoverListId: list.id,
          pointerX: startX,
          pointerY: startY,
          offsetY: startY - rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
        suppressOpenRef.current = list.id;
        pressStateRef.current = null;
      }, LONG_PRESS_MS),
    };
  }

  function preventListSelection(event) {
    if (event?.cancelable) event.preventDefault();
  }

  function getDragPreviewForLists(listCollection) {
    if (!dragState || !Array.isArray(listCollection) || listCollection.length < 2) return null;
    const sourceIndex = listCollection.findIndex((list) => list.id === dragState.listId);
    const hoverIndex = listCollection.findIndex((list) => list.id === dragState.hoverListId);
    if (sourceIndex < 0 || hoverIndex < 0) return null;
    if (sourceIndex === hoverIndex) {
      return {
        anchorListId: listCollection[sourceIndex]?.id || "",
        position: "before",
        height: dragState.height || 98,
        sourceIndex,
        hoverIndex,
      };
    }
    return {
      anchorListId: listCollection[hoverIndex]?.id || "",
      position: sourceIndex < hoverIndex ? "after" : "before",
      height: dragState.height || 98,
      sourceIndex,
      hoverIndex,
    };
  }

  function getListDragMotionClass(listId, listCollection) {
    const preview = getDragPreviewForLists(listCollection);
    if (!preview) return "";
    const currentIndex = listCollection.findIndex((list) => list.id === listId);
    if (currentIndex < 0) return "";
    if (listId === dragState?.listId) return "drag-source";
    if (preview.sourceIndex < preview.hoverIndex && currentIndex > preview.sourceIndex && currentIndex <= preview.hoverIndex) {
      return "reorder-shift-up";
    }
    if (preview.sourceIndex > preview.hoverIndex && currentIndex >= preview.hoverIndex && currentIndex < preview.sourceIndex) {
      return "reorder-shift-down";
    }
    return "";
  }

  function renderListDropPlaceholder(preview, suffix = "") {
    if (!preview?.anchorListId) return null;
    return html`
      <div
        key=${`list-drop-${preview.anchorListId}-${preview.position}-${suffix}`}
        className="task-drop-placeholder lists-page-drop-placeholder"
        style=${{ height: `${Math.max(76, Math.round(preview.height || 98))}px` }}
      ></div>
    `;
  }

  function openCreateList() {
    setOpenMenuListId("");
    setEditingList(null);
    setListForm({ name: "", emoji: "", visibility: "household", sharedWith: [], addToInventory: false });
    setShowEmojiPickerInList(false);
    setShowListModal(true);
  }

  function openEditList(list) {
    if (list?.isShoppingList) return;
    setOpenMenuListId("");
    setEditingList(list);
    setListForm({
      name: list.name || "",
      emoji: list.emoji || "",
      visibility: list.visibility || "household",
      sharedWith: list.sharedWith || [],
      addToInventory: Boolean(list.addToInventory),
    });
    setShowEmojiPickerInList(false);
    setShowListModal(true);
  }

  function closeDetail() {
    setActiveListId("");
    setOpenMenuListId("");
    setMultiSelectMode(false);
    setSelectedItemIds([]);
    setOpenItemMenuId("");
    setShowDetailKebab(false);
    setShowSectionKebab(false);
    setEditingItem(null);
    setShowShoppingInfo(false);
  }

  function openList(listId) {
    setActiveListId(listId);
    setOpenMenuListId("");
  }

  function handleListCardClick(listId) {
    if (suppressOpenRef.current === listId) {
      suppressOpenRef.current = "";
      return;
    }
    openList(listId);
  }

  function toggleListMember(personId) {
    setListForm((previous) => {
      const current = previous.sharedWith || [];
      return {
        ...previous,
        sharedWith: current.includes(personId)
          ? current.filter((id) => id !== personId)
          : [...current, personId],
      };
    });
  }

  function openAddItem() {
    setEditingItem(null);
    setItemForm({ text: "", quantity: "", unit: "", price: "", note: "" });
    setItemWarning(null);
    setBypassItemWarning(false);
    setItemSuggestions([]);
    setShowItemExtraFields(false);
    setShowItemModal(true);
  }

  function handleItemNameInput(value) {
    setItemForm((previous) => ({ ...previous, text: value }));
    setBypassItemWarning(false);
    if (!value.trim()) {
      setItemWarning(null);
      setItemSuggestions([]);
      return;
    }
    const safeInventory = Array.isArray(inventory) ? inventory : [];
    setItemWarning(findSimilarItem(value, safeInventory, null));
    setItemSuggestions(suggestItems(value, safeInventory, null));
  }

  function selectItemSuggestion(inventoryItem) {
    setItemForm((previous) => ({
      ...previous,
      text: inventoryItem.name,
      quantity: inventoryItem.quantity || previous.quantity,
      unit: inventoryItem.unit || previous.unit,
      price: inventoryItem.price || previous.price,
      note: inventoryItem.note || previous.note,
    }));
    if (inventoryItem.quantity || inventoryItem.unit || inventoryItem.price || inventoryItem.note) {
      setShowItemExtraFields(true);
    }
    setItemWarning(null);
    setBypassItemWarning(false);
    setItemSuggestions([]);
  }

  function submitList(event) {
    event.preventDefault();
    if (!listForm.name.trim()) return;
    const finalVisibility = listForm.visibility || "household";
    const payload = {
      name: listForm.name.trim(),
      emoji: listForm.emoji || "",
      visibility: finalVisibility,
      sharedWith: finalVisibility === "shared" ? (listForm.sharedWith || []) : [],
      addToInventory: Boolean(listForm.addToInventory),
    };
    if (editingList) {
      onUpdateList(editingList.id, {
        ...payload,
        visibility: editingList.isShoppingList ? "household" : payload.visibility,
      });
    } else {
      onCreateList(payload);
    }
    setShowListModal(false);
  }

  function submitItem(event) {
    event.preventDefault();
    if (!selectedList || !itemForm.text.trim()) return;
    if (editingItem) {
      onUpdateListItem(selectedList.id, editingItem.id, {
        text: itemForm.text.trim(),
        quantity: itemForm.quantity,
        unit: itemForm.unit,
        price: itemForm.price,
        note: itemForm.note,
      });
    } else {
      onAddListItem(selectedList.id, itemForm);
    }
    setItemForm({ text: "", quantity: "", unit: "", price: "", note: "" });
    setItemWarning(null);
    setItemSuggestions([]);
    setEditingItem(null);
    setShowItemExtraFields(false);
    setShowItemModal(false);
  }

  function openEditItem(item) {
    setEditingItem(item);
    setItemForm({ text: item.text || "", quantity: item.quantity || "", unit: item.unit || "", price: item.price || "", note: item.note || "" });
    setItemWarning(null);
    setBypassItemWarning(true);
    setItemSuggestions([]);
    setOpenItemMenuId("");
    setShowItemExtraFields(Boolean(item.quantity || item.unit || item.price || item.note));
    setShowItemModal(true);
  }

  function toggleSelectItem(itemId) {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId],
    );
  }

  function deleteSelectedItems() {
    if (!selectedList || !selectedItemIds.length) return;
    selectedItemIds.forEach((itemId) => onDeleteListItem(selectedList.id, itemId));
    setSelectedItemIds([]);
    setMultiSelectMode(false);
  }

  function renderDetailItem(item) {
    const quantityLabel = formatQuantityUnit(item.quantity, item.unit);
    const isSelected = selectedItemIds.includes(item.id);
    const menuOpen = openItemMenuId === item.id;
    return html`
      <div key=${item.id} className=${`ldv-item${item.done ? " ldv-item-done" : ""}${isSelected ? " ldv-item-sel" : ""}`}>
        <button
          type="button"
          className=${`ldv-chk${item.done ? " on" : ""}${multiSelectMode && isSelected ? " sel" : ""}`}
          onClick=${() => (multiSelectMode ? toggleSelectItem(item.id) : onToggleListItem(selectedList.id, item.id))}
        >${item.done || (multiSelectMode && isSelected) ? "✓" : ""}</button>
        <div className="ldv-item-body">
          <span className="ldv-item-name">${item.text}</span>
          ${quantityLabel || item.price ? html`
            <span className="ldv-item-qty">
              ${[quantityLabel, item.price ? item.price + " €" : ""].filter(Boolean).join(" · ")}
            </span>
          ` : null}
          ${item.note ? html`<span className="ldv-item-note">${item.note}</span>` : null}
        </div>
        ${!multiSelectMode
          ? html`
              <div className="task-menu-wrap ldv-menu-wrap">
                <button type="button" className="task-menu-btn ldv-item-kebab"
                  onClick=${(e) => { e.stopPropagation(); setOpenItemMenuId(menuOpen ? "" : item.id); }}>⋮</button>
                ${menuOpen
                  ? html`
                      <div className="task-menu-dropdown ldv-item-dropdown">
                        <button type="button" className="task-menu-item"
                          onClick=${() => openEditItem(item)}>Modifier</button>
                        <button type="button" className="task-menu-item"
                          onClick=${() => { setMultiSelectMode(true); setSelectedItemIds([item.id]); setOpenItemMenuId(""); }}>
                          Sélectionner plusieurs
                        </button>
                        <button type="button" className="task-menu-item task-menu-item-danger"
                          onClick=${() => { onDeleteListItem(selectedList.id, item.id); setOpenItemMenuId(""); }}>Supprimer</button>
                      </div>
                    `
                  : null}
              </div>
            `
          : null}
      </div>
    `;
  }

  function renderDetailSection(title, items, showAddBtn) {
    return html`
      <div className="ldv-section">
        <div className="ldv-section-head">
          <span className="ldv-section-title">${title}</span>
          <span className="ldv-section-count">${items.length} ${articleLabel(items.length)}</span>
          ${showAddBtn && !multiSelectMode
            ? html`
                <button type="button" className="ldv-section-add" onClick=${openAddItem}
                  aria-label="Ajouter un article">+</button>
              `
            : null}
        </div>
        <div className="ldv-card">
          ${items.length
            ? items.map((item) => renderDetailItem(item))
            : html`<div className="ldv-empty">Cette section est vide</div>`}
        </div>
      </div>
    `;
  }

  function renderListLandingCard(list, visibleIds) {
    const count = listItemCount(list);
    const itemCountText = `${count} ${articleLabel(count)}`;
    const dragMotionClass = getListDragMotionClass(list.id, draggableLists);
    const isDragging = dragState?.listId === list.id;
    const isDropTarget = dragState?.hoverListId === list.id && dragState?.listId !== list.id;
    return html`
      <article
        key=${list.id}
        ref=${(node) => registerListNode(list.id, node)}
        className=${`lists-page-list-card ${list.isShoppingList ? "shopping" : ""} ${isDragging ? "drag-source" : ""} ${isDropTarget ? "reorder-target" : ""} ${dragMotionClass}`}
        onPointerDown=${(event) => handleListPointerDown(event, list, visibleIds)}
        onSelectStart=${preventListSelection}
        onDragStart=${preventListSelection}
        onClick=${() => handleListCardClick(list.id)}
        onKeyDown=${(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleListCardClick(list.id);
          }
        }}
        role="button"
        tabIndex="0"
      >
        <span className="lists-page-list-card-copy">
          <!-- Ligne 1 : emoji + nom + menu ⋮ -->
          <span className="lists-page-list-card-titleline">
            <span className="lists-page-list-card-title-emoji">${listEmoji(list)}</span>
            <span className="lists-page-list-card-title">${list.name}</span>
            ${list.isShoppingList
              ? null
              : html`
                  <span className="task-menu-wrap lists-page-card-menu" style=${{ flexShrink: 0 }}>
                    <button
                      type="button"
                      className="task-menu-btn lists-page-menu-btn"
                      aria-label=${`Actions pour ${list.name}`}
                      onClick=${(event) => {
                        event.stopPropagation();
                        setOpenMenuListId((current) => (current === list.id ? "" : list.id));
                      }}
                    >
                      ⋮
                    </button>
                    ${openMenuListId === list.id
                      ? html`
                          <div className="task-menu-dropdown">
                            <button
                              type="button"
                              className="task-menu-item"
                              onClick=${(event) => {
                                event.stopPropagation();
                                openEditList(list);
                              }}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="task-menu-item task-menu-item-danger"
                              onClick=${(event) => {
                                event.stopPropagation();
                                setOpenMenuListId("");
                                onDeleteList(list.id);
                              }}
                            >
                              Supprimer
                            </button>
                          </div>
                        `
                      : null}
                  </span>
                `}
          </span>

          <!-- Ligne 2 : nombre d'articles + statut inventaire -->
          <span className="lists-page-list-card-row2">
            <span className="lists-page-list-card-subtitle">${itemCountText}</span>
            ${list.addToInventory
              ? html`
                  <span className="lists-page-list-card-link">
                    <span className="lists-page-list-card-link-dot"></span>
                    <span>Lié à l'inventaire</span>
                  </span>
                `
              : null}
          </span>
        </span>
      </article>
    `;
  }

  const filteredDraggableLists = filteredLandingLists.filter((list) => !list.isShoppingList);
  const listDragPreview = getDragPreviewForLists(filteredDraggableLists);
  const draggableListIds = filteredDraggableLists.map((entry) => entry.id);

  return html`
    <section className="rwrap lists-page">
      ${selectedList
        ? html`
            <!-- Topbar -->
            <div className="ldv-topbar">
              <button type="button" className="mrd-back-btn" onClick=${closeDetail}>←</button>
              <div className="ldv-topbar-info">
                <span className="ldv-topbar-emoji">${listEmoji(selectedList)}</span>
                <span className="ldv-topbar-name">${selectedList.name}</span>
                ${selectedList.isShoppingList
                  ? html`
                      <button type="button" className="ldv-info-btn"
                        onClick=${(e) => { e.stopPropagation(); setShowShoppingInfo((v) => !v); }}
                        aria-label="Informations sur cette liste">i</button>
                    `
                  : null}
              </div>
              <div className="task-menu-wrap ldv-menu-wrap">
                <button type="button" className="task-menu-btn ldv-topbar-kebab"
                  onClick=${(e) => { e.stopPropagation(); setShowDetailKebab((v) => !v); }}>⋮</button>
                ${showDetailKebab
                  ? html`
                      <div className="task-menu-dropdown ldv-topbar-dropdown">
                        ${!selectedList.isShoppingList
                          ? html`
                              <button type="button" className="task-menu-item"
                                onClick=${() => { setShowDetailKebab(false); openEditList(selectedList); }}>Modifier</button>
                              <button type="button" className="task-menu-item task-menu-item-danger"
                                onClick=${() => { setShowDetailKebab(false); onDeleteList(selectedList.id); }}>Supprimer</button>
                            `
                          : html`
                              <button type="button" className="task-menu-item task-menu-item-danger"
                                onClick=${() => { setShowDetailKebab(false); onClearShoppingList(); }}>Vider la liste</button>
                            `}
                      </div>
                    `
                  : null}
              </div>
            </div>

            <!-- Type et partage de la liste -->
            ${!selectedList.isShoppingList ? html`
              <div className="ldv-type-row">
                ${(() => {
                  const vm = listVisibilityMeta(selectedList);
                  const typeLabels = { household: "🏠 Foyer", private: "🔒 Privé", shared: "👥 Partagé" };
                  const sp = sharedPeopleForList(selectedList);
                  return html`
                    <span className="ldv-type-chip">${typeLabels[vm.type] || typeLabels.household}</span>
                    ${vm.type === "shared" && sp.length > 0
                      ? html`<span className="ldv-shared-with">— avec ${sp.map(p => p.label || p.displayName || "").filter(Boolean).join(", ")}</span>`
                      : null}
                  `;
                })()}
              </div>
            ` : null}

            <!-- Popup info liste de courses -->
            ${selectedList.isShoppingList && showShoppingInfo
              ? html`
                  <div className="ldv-info-popup">
                    Cette liste n'est pas modifiable car c'est celle qui reçoit les ingrédients du menu Repas.
                    Si vous n'avez pas choisi de lier vos repas à l'inventaire, cette liste reste votre liste de courses par défaut.
                  </div>
                `
              : null}

            <!-- Lien inventaire -->
            <button type="button"
              className=${`mrd-inv-badge${selectedList.addToInventory ? " on" : ""}`}
              onClick=${() => onUpdateList(selectedList.id, { addToInventory: !selectedList.addToInventory })}
              aria-label="Lier à l'inventaire"
            >${selectedList.addToInventory ? "●" : "○"} Lié à l'inventaire</button>

            <!-- Barre multi-sélection -->
            ${multiSelectMode
              ? html`
                  <div className="ldv-multibar">
                    <button type="button" className="ldv-multibar-cancel"
                      onClick=${() => { setMultiSelectMode(false); setSelectedItemIds([]); }}>✕</button>
                    <span className="ldv-multibar-count">
                      ${selectedItemIds.length} sélectionné${selectedItemIds.length > 1 ? "s" : ""}
                    </span>
                    <button type="button" className="ldv-multibar-delete"
                      disabled=${!selectedItemIds.length}
                      onClick=${deleteSelectedItems}>
                      Supprimer (${selectedItemIds.length})
                    </button>
                  </div>
                `
              : null}

            <!-- Sections articles -->
            ${renderDetailSection(
              selectedList.isShoppingList ? "À acheter" : "Articles",
              pendingItems,
              true,
            )}
            ${purchasedItems.length
              ? renderDetailSection(
                  selectedList.isShoppingList ? "Achetés" : "Cochés",
                  purchasedItems,
                  false,
                )
              : null}
          `
        : html`
            <div className="lists-page-header">
              <div className="lists-page-header-title">Listes</div>
              <button className="list-add-btn lists-page-create-btn" onClick=${openCreateList}>+ Nouvelle</button>
            </div>

            <${SegmentedTabs}
              ariaLabel="Filtrer les listes"
              rowClassName="lists-page-filter-row"
              options=${[
                { id: "household", emoji: "🏠", label: "Foyer" },
                { id: "private",   emoji: "🔒", label: "Privé" },
                { id: "shared",    emoji: "👥", label: "Partagé" },
              ]}
              activeId=${listsFilter}
              onChange=${setListsFilter}
            />

            <div className=${`task-stack lists-page-stack ${listDragPreview ? "is-dragging" : ""}`}>
              ${filteredLandingLists.length
                ? filteredLandingLists.map((list) => {
                    const isSourceList = listDragPreview && dragState?.listId === list.id;
                    return html`
                      ${listDragPreview && listDragPreview.position === "before" && listDragPreview.anchorListId === list.id
                        ? renderListDropPlaceholder(listDragPreview, `${list.id}-before`)
                        : null}
                      ${!isSourceList ? renderListLandingCard(list, draggableListIds) : null}
                      ${listDragPreview && listDragPreview.position === "after" && listDragPreview.anchorListId === list.id
                        ? renderListDropPlaceholder(listDragPreview, `${list.id}-after`)
                        : null}
                    `;
                  })
                : html`<div className="empty lists-page-empty">Aucune liste dans ce filtre</div>`}
            </div>

            <div className="lists-page-home-spacer"></div>
          `}

      ${showListModal ? (() => {
        const LBL = { fontSize: 11, fontWeight: 700, color: "var(--mrd-fg3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "block" };
        const VISIBILITY_PILL = { minWidth: 0, minHeight: 86, padding: "12px 10px 11px", borderRadius: 14, fontSize: 12, fontWeight: 600, transition: "all 0.15s", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, textAlign: "center", border: "1.5px solid" };
        const formValid = Boolean(listForm.name.trim());
        const shareablePeople = people.filter(
          (p) => p.id !== activePersonId && (p.label || p.displayName)?.trim() && p.type !== "animal" && p.type !== "child",
        );
        const visibilityOptions = [
          { id: "household", icon: "🏠", label: "Foyer",   sub: "Visible par tous" },
          { id: "private",   icon: "🔒", label: "Privé",   sub: "Seulement moi" },
          { id: "shared",    icon: "👥", label: "Partagé", sub: "Certaines personnes" },
        ];
        return html`
          <div
            className="modal-backdrop task-create-backdrop"
            onClick=${() => setShowListModal(false)}
          >
            <div
              className="modal-card task-modal-redesign"
              style=${{ width: "min(480px, 100%)", maxHeight: "min(88vh, 800px)" }}
              onClick=${(e) => e.stopPropagation()}
            >

              <!-- En-tête -->
              <div className="mrd-mhd">
                <span className="mrd-mtitle">${editingList ? "Modifier la liste" : "Nouvelle liste"}</span>
                <button type="button" onClick=${() => setShowListModal(false)} className="mrd-mclose">✕</button>
              </div>

              <form onSubmit=${submitList} className="mrd-mbody">

                <!-- 1. Emoji + Nom -->
                <div style=${{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <button type="button"
                    onClick=${() => setShowEmojiPickerInList(true)}
                    title="Choisir un emoji"
                    style=${{ width: 50, height: 50, borderRadius: 14, background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-border)", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
                  >${listForm.emoji ? html`<span>${listForm.emoji}</span>` : html`<span style=${{ fontSize: 20, color: "var(--mrd-fg3)" }}>📦</span>`}</button>
                  <div style=${{ flex: 1, background: "var(--mrd-surf2)", borderRadius: 14, border: "1.5px solid " + (listForm.name ? "var(--mrd-a)" : "var(--mrd-border)"), padding: "12px 14px", transition: "border-color 0.15s" }}>
                    <input
                      value=${listForm.name}
                      onInput=${(e) => setListForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Nom de la liste…"
                      autoFocus
                      style=${{ width: "100%", background: "none", border: "none", fontSize: 16, fontWeight: 600, color: "var(--mrd-fg)", outline: "none", padding: 0 }}
                    />
                  </div>
                </div>

                <!-- 2. Visibilité (masquée pour la liste de courses) -->
                ${editingList?.isShoppingList ? null : html`
                  <div>
                    <span style=${LBL}>Visibilité</span>
                    <div style=${{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, width: "100%", maxWidth: 560, margin: "0 auto", alignItems: "stretch" }}>
                      ${visibilityOptions.map((opt) => {
                        const on = listForm.visibility === opt.id;
                        return html`
                          <button key=${opt.id} type="button"
                            style=${{ ...VISIBILITY_PILL, background: on ? "var(--mrd-a)" : "var(--mrd-surf2)", color: on ? "#fff" : "var(--mrd-fg2)", borderColor: on ? "var(--mrd-a)" : "var(--mrd-border)" }}
                            onClick=${() => setListForm((prev) => ({ ...prev, visibility: opt.id, sharedWith: opt.id !== "shared" ? [] : prev.sharedWith }))}
                          >
                            <span style=${{ fontSize: 18, lineHeight: 1 }}>${opt.icon}</span>
                            <span style=${{ fontWeight: 700, lineHeight: 1.15 }}>${opt.label}</span>
                            <span style=${{ fontSize: 10, opacity: on ? 0.88 : 0.65, lineHeight: 1.25 }}>${opt.sub}</span>
                          </button>
                        `;
                      })}
                    </div>
                  </div>
                `}

                <!-- 3. Partagé avec -->
                ${listForm.visibility === "shared" && shareablePeople.length ? html`
                  <div>
                    <span style=${LBL}>Partagé avec</span>
                    <div style=${{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      ${shareablePeople.map((person) => {
                        const on = (listForm.sharedWith || []).includes(person.id);
                        const name = person.label || person.displayName || "?";
                        return html`
                          <button key=${person.id} type="button"
                            onClick=${() => toggleListMember(person.id)}
                            style=${{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 5px", borderRadius: 99, border: "2px solid " + (on ? (person.color || "var(--mrd-a)") : "var(--mrd-border)"), background: on ? ((person.color || "var(--mrd-a)") + "15") : "transparent", cursor: "pointer", transition: "all 0.15s" }}>
                            <div style=${{ width: 26, height: 26, borderRadius: "50%", background: person.color || "var(--mrd-fg2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mrd-white)", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              ${String(person.shortId || name)[0].toUpperCase()}
                            </div>
                            <span style=${{ fontSize: 12, fontWeight: 600, color: on ? "var(--mrd-fg)" : "var(--mrd-fg2)" }}>${name}</span>
                          </button>
                        `;
                      })}
                    </div>
                  </div>
                ` : null}

                <!-- 4. Lier à l'inventaire -->
                <button type="button"
                  className=${`mrd-inv-badge${listForm.addToInventory ? " on" : ""}`}
                  onClick=${() => setListForm((prev) => ({ ...prev, addToInventory: !prev.addToInventory }))}
                  aria-label="Lier à l'inventaire"
                >${listForm.addToInventory ? "●" : "○"} Lié à l'inventaire</button>

                <!-- 5. Bouton final -->
                <button type="submit"
                  disabled=${!formValid}
                  style=${{ width: "100%", padding: 14, borderRadius: "var(--mrd-r)", background: formValid ? "var(--mrd-a)" : "var(--mrd-disabledBg)", color: formValid ? "var(--mrd-white)" : "var(--mrd-disabledFg)", fontSize: 15, fontWeight: 700, cursor: formValid ? "pointer" : "default", boxShadow: formValid ? "0 6px 20px oklch(58% 0.13 28 / 0.28)" : "none", transition: "all 0.2s", border: "none" }}
                >
                  ${editingList ? "Enregistrer" : "Créer la liste"}
                </button>

              </form>
            </div>
          </div>
          ${showEmojiPickerInList ? html`<${EmojiPicker}
            onSelect=${(emoji) => { setListForm((prev) => ({ ...prev, emoji })); setShowEmojiPickerInList(false); }}
            onClose=${() => setShowEmojiPickerInList(false)}
          />` : null}
        `;
      })() : null}

      ${showItemModal
        ? html`
            <div
              className="modal-backdrop task-create-backdrop"
              onClick=${() => {
                setShowItemModal(false);
                setEditingItem(null);
                setShowItemQuantityFields(false);
              }}
            >
              <div className="modal-card task-modal-redesign" onClick=${(event) => event.stopPropagation()}>
                <div className="mrd-mhd">
                  <span className="mrd-mtitle">
                    ${editingItem ? "Modifier l'article" : "Ajouter un article"}
                  </span>
                  <button
                    type="button"
                    onClick=${() => {
                      setShowItemModal(false);
                      setEditingItem(null);
                      setShowItemQuantityFields(false);
                    }}
                    className="mrd-mclose"
                  >✕</button>
                </div>
                <form className="task-create-form mrd-mbody" onSubmit=${submitItem}>
                  <div className="fstack">
                    <span className="mrd-mlbl">Nom de l'article</span>
                    <div style=${{ position: "relative" }}>
                      <input
                        className="ainp"
                        placeholder="Rechercher ou saisir…"
                        value=${itemForm.text}
                        onInput=${(event) => handleItemNameInput(event.target.value)}
                        onBlur=${() => {
                          setTimeout(() => setItemSuggestions([]), 150);
                        }}
                        autocomplete="off"
                        style=${{ width: "100%", padding: "15px 16px", borderRadius: 16 }}
                      />

                      ${itemSuggestions.length
                        ? html`
                            <div className="suggest-dropdown">
                              ${itemSuggestions.map(
                                (suggestion) => html`
                                  <button
                                    key=${suggestion.id}
                                    type="button"
                                    className="suggest-item"
                                    onMouseDown=${() => selectItemSuggestion(suggestion)}
                                  >
                                    <span>${suggestion.name}</span>
                                    <span className="mini" style=${{ marginLeft: "8px", opacity: "0.7" }}>
                                      ${formatQuantityUnit(suggestion.quantity, suggestion.unit) || ""}
                                      ${suggestion.stockState === "empty" ? " · Fini" : " · En stock"}
                                    </span>
                                  </button>
                                `,
                              )}
                            </div>
                          `
                        : null}
                    </div>

                    ${!editingItem && itemWarning && !bypassItemWarning
                      ? html`
                          <div
                            style=${{
                              background: "var(--mrd-amberLt)",
                              border: "1px solid var(--mrd-amberMd)",
                              borderRadius: "8px",
                              padding: "10px",
                              marginTop: "6px",
                            }}
                          >
                            <div className="mini" style=${{ fontWeight: "600", marginBottom: "6px", color: "var(--mrd-amberDeep)" }}>
                              ⚠️ Déjà dans l'inventaire : "${itemWarning.item.name}" ·
                              ${itemWarning.item.stockState === "empty" ? "Fini" : "En stock"}
                            </div>
                            <button
                              type="button"
                              className="clrbtn"
                              style=${{ fontSize: "12px", padding: "4px 10px" }}
                              onClick=${() => setBypassItemWarning(true)}
                            >
                              Ajouter quand même
                            </button>
                          </div>
                        `
                      : null}
                  </div>

                  <div style=${{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                      type="button"
                      onClick=${() => setShowItemExtraFields((value) => !value)}
                      style=${{ alignSelf: "flex-start", border: "none", background: "none", color: "var(--mrd-a)", fontSize: 13, fontWeight: 700, padding: 0, cursor: "pointer" }}
                    >
                      ${showItemExtraFields ? "− Masquer les détails" : "+ Ajouter quantité / détails"}
                    </button>

                    ${showItemExtraFields
                      ? html`
                          <div style=${{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div>
                              <span className="mrd-mlbl" style=${{ marginBottom: 4 }}>Quantité</span>
                              <div className="quantity-unit-row">
                                <input
                                  className="ainp"
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="Valeur"
                                  value=${itemForm.quantity}
                                  style=${{ flex: "1", padding: "15px 16px", borderRadius: 16 }}
                                  onInput=${(event) => setItemForm((previous) => ({ ...previous, quantity: event.target.value }))}
                                />
                                <select
                                  className="asel"
                                  value=${itemForm.unit}
                                  style=${{ width: "112px", borderRadius: 16 }}
                                  onChange=${(event) => setItemForm((previous) => ({ ...previous, unit: event.target.value }))}
                                >
                                  ${UNITS.map((unit) => html`<option key=${unit.value} value=${unit.value}>${unit.label}</option>`)}
                                </select>
                              </div>
                            </div>
                            <div style=${{ display: "flex", gap: 8 }}>
                              <div style=${{ flex: 1 }}>
                                <span className="mrd-mlbl" style=${{ marginBottom: 4 }}>Prix (€)</span>
                                <input
                                  className="ainp"
                                  placeholder="Ex : 2,49"
                                  value=${itemForm.price}
                                  style=${{ width: "100%", padding: "12px 14px", borderRadius: 14, boxSizing: "border-box" }}
                                  onInput=${(event) => setItemForm((previous) => ({ ...previous, price: event.target.value }))}
                                />
                              </div>
                              <div style=${{ flex: 2 }}>
                                <span className="mrd-mlbl" style=${{ marginBottom: 4 }}>Note</span>
                                <input
                                  className="ainp"
                                  placeholder="Marque, magasin, variété…"
                                  value=${itemForm.note}
                                  style=${{ width: "100%", padding: "12px 14px", borderRadius: 14, boxSizing: "border-box" }}
                                  onInput=${(event) => setItemForm((previous) => ({ ...previous, note: event.target.value }))}
                                />
                              </div>
                            </div>
                          </div>
                        `
                      : null}
                  </div>

                  <div className="task-modal-actions">
                    <button type="button" className="clrbtn" onClick=${() => { setShowItemModal(false); setEditingItem(null); setShowItemQuantityFields(false); }}>Annuler</button>
                    <button className="aok" type="submit">${editingItem ? "Enregistrer" : "Ajouter"}</button>
                  </div>
                </form>
              </div>
            </div>
          `
        : null}

      ${dragState
        ? (() => {
            const dragList = orderedLists.find((list) => list.id === dragState.listId);
            if (!dragList) return null;
            return html`
              <div
                className="lists-page-drag-ghost"
                style=${{
                  top: `${Math.max(16, dragState.pointerY - dragState.offsetY)}px`,
                  left: `${Math.max(12, dragState.left)}px`,
                  width: `${dragState.width}px`,
                }}
              >
                <div className="lists-page-list-card-titleline">
                  <span className="lists-page-list-card-title-emoji">${listEmoji(dragList)}</span>
                  <span className="lists-page-list-card-title">${dragList.name}</span>
                </div>
                <div className="lists-page-list-card-subtitle">
                  ${listItemCount(dragList)} ${articleLabel(listItemCount(dragList))}
                </div>
              </div>
            `;
          })()
        : null}
    </section>
  `;
}

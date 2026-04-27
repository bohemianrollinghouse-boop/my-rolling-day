import { html, useEffect, useMemo, useRef, useState } from "../../lib.js";
import { findSimilarItem, formatQuantityUnit, suggestItems } from "../../utils/productUtils.js";
import { EmojiPicker } from "../tasks/EmojiPicker.js?v=2026-04-24-emoji-picker-1";
import { SegmentedTabs } from "../common/SegmentedTabs.js?v=2026-04-25-segmented-nav-1";

const LONG_PRESS_MS = 280;
const DRAG_CANCEL_DISTANCE = 8;

const UNITS = [
  { value: "", label: "\u2014" },
  { value: "unit\u00e9", label: "Unit\u00e9" },
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
    .replace(/[\u0300-\u036f]/g, "");
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

function listCategoryLabel(list) {
  if (list?.isShoppingList) return "COURSES";
  const haystack = normalizeLabel(`${list?.id || ""} ${list?.name || ""}`);
  if (/(anniv|birth|cadeau|fete|party)/.test(haystack)) return "ANNIVERSAIRE";
  if (/(maison|home|brico|travaux|menage)/.test(haystack)) return "MAISON";
  if (/(voyage|travel|vacances|camping|trip)/.test(haystack)) return "VOYAGE";
  return "LISTE";
}

function listVisibilityMeta(list) {
  if (list?.visibility === "private") return { type: "private", icon: "🔒" };
  if (list?.visibility === "shared") return { type: "shared", icon: "👥" };
  return { type: "household", icon: "" };
}

function listItemCount(list) {
  return Array.isArray(list?.items) ? list.items.length : 0;
}

function listRemainingCount(list) {
  return Array.isArray(list?.items) ? list.items.filter((item) => !item.done).length : 0;
}

function listDoneCount(list) {
  return Array.isArray(list?.items) ? list.items.filter((item) => item.done).length : 0;
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
  const [showItemQuantityFields, setShowItemQuantityFields] = useState(false);
  const [showEmojiPickerInList, setShowEmojiPickerInList] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [listForm, setListForm] = useState({ name: "", emoji: "", visibility: "household", sharedWith: [], addToInventory: false });
  const [itemForm, setItemForm] = useState({ text: "", quantity: "", unit: "" });
  const [itemWarning, setItemWarning] = useState(null);
  const [bypassItemWarning, setBypassItemWarning] = useState(false);
  const [itemSuggestions, setItemSuggestions] = useState([]);
  const [showInventoryInfo, setShowInventoryInfo] = useState(false);
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
  const sharedNames = Array.isArray(selectedList?.sharedWith)
    ? selectedList.sharedWith
        .map((id) => {
          const person = people.find((entry) => entry.id === id);
          return person?.label || person?.displayName || id;
        })
        .filter(Boolean)
        .join(", ")
    : "";

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

  function personShortId(person) {
    const source = String(person?.shortId || person?.label || person?.displayName || "?").trim();
    return source.slice(0, 1).toUpperCase() || "?";
  }

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
    setShowInventoryInfo(false);
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
    setShowInventoryInfo(false);
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
    setItemForm({ text: "", quantity: "", unit: "" });
    setItemWarning(null);
    setBypassItemWarning(false);
    setItemSuggestions([]);
    setShowItemQuantityFields(false);
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
    }));
    if (inventoryItem.quantity || inventoryItem.unit) {
      setShowItemQuantityFields(true);
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
      });
    } else {
      onAddListItem(selectedList.id, itemForm);
    }
    setItemForm({ text: "", quantity: "", unit: "" });
    setItemWarning(null);
    setItemSuggestions([]);
    setEditingItem(null);
    setShowItemQuantityFields(false);
    setShowItemModal(false);
  }

  function openEditItem(item) {
    setEditingItem(item);
    setItemForm({ text: item.text || "", quantity: item.quantity || "", unit: item.unit || "" });
    setItemWarning(null);
    setBypassItemWarning(true);
    setItemSuggestions([]);
    setOpenItemMenuId("");
    setShowItemQuantityFields(Boolean(item.quantity || item.unit));
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
        >${item.done || (multiSelectMode && isSelected) ? "\u2713" : ""}</button>
        <div className="ldv-item-body">
          <span className="ldv-item-name">${item.text}</span>
          ${quantityLabel ? html`<span className="ldv-item-qty">${quantityLabel}</span>` : null}
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
                          S\u00e9lectionner plusieurs
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

  function renderListLandingSection(title, listsInSection, visibleIds) {
    if (!listsInSection.length) return null;
    return html`
      <section className="task-group lists-page-group">
        <div className="div">${title}</div>
        <div className=${`task-stack lists-page-stack ${listDragPreview ? "is-dragging" : ""}`}>
          ${listsInSection.map((list) => {
            const isSourceList = listDragPreview && dragState?.listId === list.id;
            return html`
              ${listDragPreview && listDragPreview.position === "before" && listDragPreview.anchorListId === list.id
                ? renderListDropPlaceholder(listDragPreview, `${list.id}-before`)
                : null}
              ${!isSourceList ? renderListLandingCard(list, visibleIds) : null}
              ${listDragPreview && listDragPreview.position === "after" && listDragPreview.anchorListId === list.id
                ? renderListDropPlaceholder(listDragPreview, `${list.id}-after`)
                : null}
            `;
          })}
        </div>
      </section>
    `;
  }

  function renderListLandingCard(list, visibleIds) {
    const count = listItemCount(list);
    const visibilityMeta = listVisibilityMeta(list);
    const itemCountText = `${count} ${articleLabel(count)}`;
    const sharedPeople = sharedPeopleForList(list);
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
          <!-- Ligne 1 : emoji + nom + menu ⋮ -->
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

          <!-- Ligne 2 : nombre d’articles + statut inventaire -->
          <span className="lists-page-list-card-row2">
            <span className="lists-page-list-card-subtitle">${itemCountText}</span>
            ${list.addToInventory
              ? html`
                  <span className="lists-page-list-card-link">
                    <span className="lists-page-list-card-link-dot"></span>
                    <span>Li\u00e9 \u00e0 l\u2019inventaire</span>
                  </span>
                `
              : null}
          </span>
        </span>
      </article>
    `;
    return html`
      <div
        key=${list.id}
        className=${`lists-page-list-card ${list.isShoppingList ? "shopping" : ""}`}
        onClick=${() => openList(list.id)}
        onKeyDown=${(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openList(list.id);
          }
        }}
        role="button"
        tabIndex="0"
      >
        <span className="lists-page-list-card-icon">${listEmoji(list)}</span>

        <span className="lists-page-list-card-copy">
          <span className="lists-page-list-card-head">
            <span className="lists-page-list-card-title">${list.name}</span>
            <span className="lists-page-list-card-category">${listCategoryLabel(list)}</span>
          </span>

          <span className="lists-page-list-card-badges">
            <span className="lists-page-list-card-badge">${itemCountText}</span>
            ${list.addToInventory
              ? html`<span className="lists-page-list-card-badge linked">Li\u00e9 \u00e0 l\u2019inventaire</span>`
              : null}
            <span className="lists-page-list-card-badge visibility">${visibilityMeta.icon} ${visibilityMeta.label}</span>
          </span>
        </span>

        <span className="lists-page-list-card-actions">
          ${list.isShoppingList ? html`<span className="lists-page-list-card-default">Par d\u00e9faut</span>` : null}
          <button
            type="button"
            className="lists-page-list-card-edit"
            aria-label=${`Modifier ${list.name}`}
            onClick=${(event) => {
              event.stopPropagation();
              openEditList(list);
            }}
          >
            ✎
          </button>
        </span>
      </div>
    `;
  }

  function renderListItem(item) {
    return html`
      <div className=${`sitem shopping-item lists-page-item ${item.done ? "dn purchased" : ""}`} key=${item.id}>
        <button
          className=${`schk ${item.done ? "on" : ""}`}
          onClick=${() => onToggleListItem(selectedList.id, item.id)}
        >
          ${item.done ? "✓" : ""}
        </button>

        <div className="lists-page-item-main">
          <div className="lists-page-item-head">
            <span className="stxt">${item.text}</span>
          </div>

          <div className="lists-page-item-controls">
            <select
              className="asel lists-page-item-unit"
              value=${item.unit || ""}
              onChange=${(event) => onUpdateListItem(selectedList.id, item.id, { unit: event.target.value })}
            >
              ${UNITS.map((unit) => html`<option key=${unit.value} value=${unit.value}>${unit.label}</option>`)}
            </select>
            <input
              className="ainp lists-page-item-qtyinput"
              type="number"
              min="0"
              step="1"
              value=${item.quantity || ""}
              onInput=${(event) => onUpdateListItem(selectedList.id, item.id, { quantity: event.target.value })}
            />

            ${item.done && item.purchasedAt
              ? html`<span className="mini lists-page-item-date">Achet\u00e9 le ${item.purchasedAt}</span>`
              : null}
          </div>
        </div>

        <button className="delbtn lists-page-item-delete" onClick=${() => onDeleteListItem(selectedList.id, item.id)}>
          ×
        </button>
      </div>
    `;
  }

  function renderSection(title, subtitle, items, emptyCopy) {
    return html`
      <section className="lists-page-section">
        <div className="lists-page-section-head">
          <div className="lists-page-section-title">${title}</div>
          <div className="lists-page-section-count">${subtitle}</div>
        </div>
        <div className="lists-page-card lists-page-items-card">
          ${items.length
            ? items.map((item) => renderListItem(item))
            : html`<div className="empty lists-page-empty">${emptyCopy}</div>`}
        </div>
      </section>
    `;
  }

  function renderShoppingSections() {
    const sections = [];
    sections.push(
      renderSection(
        "\u00c0 acheter",
        `${pendingItems.length} ${articleLabel(pendingItems.length)}`,
        pendingItems,
        "Cette liste est vide",
      ),
    );
    if (purchasedItems.length) {
      sections.push(
        renderSection(
          "Coch\u00e9s",
          `${purchasedItems.length} ${articleLabel(purchasedItems.length)}`,
          purchasedItems,
          "",
        ),
      );
    }
    return sections;
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
                    Cette liste n\u2019est pas modifiable car c\u2019est celle qui re\u00e7oit les ingr\u00e9dients du menu Repas.
                    Si vous n\u2019avez pas choisi de lier vos repas \u00e0 l\u2019inventaire, cette liste reste votre liste de courses par d\u00e9faut.
                  </div>
                `
              : null}

            <!-- Lien inventaire -->
            <button type="button"
              className=${`mrd-inv-badge${selectedList.addToInventory ? " on" : ""}`}
              onClick=${() => onUpdateList(selectedList.id, { addToInventory: !selectedList.addToInventory })}
              aria-label="Lier \u00e0 l\u2019inventaire"
            >${selectedList.addToInventory ? "\u25cf" : "\u25cb"} Lié à l\u2019inventaire</button>

            <!-- Barre multi-sélection -->
            ${multiSelectMode
              ? html`
                  <div className="ldv-multibar">
                    <button type="button" className="ldv-multibar-cancel"
                      onClick=${() => { setMultiSelectMode(false); setSelectedItemIds([]); }}>✕</button>
                    <span className="ldv-multibar-count">
                      ${selectedItemIds.length} s\u00e9lectionn\u00e9${selectedItemIds.length > 1 ? "s" : ""}
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
              selectedList.isShoppingList ? "\u00c0 acheter" : "Articles",
              pendingItems,
              true,
            )}
            ${purchasedItems.length
              ? renderDetailSection(
                  selectedList.isShoppingList ? "Achet\u00e9s" : "Coch\u00e9s",
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
                { id: "household", label: "Foyer" },
                { id: "private", label: "Privé" },
                { id: "shared", label: "Partagé" },
              ]}
              activeId=${listsFilter}
              onChange=${setListsFilter}
            />

            <div className="mrd-subtabs" style=${{ display: "none" }}>
              ${[
                { id: "household", label: "Foyer" },
                { id: "private", label: "Privé" },
                { id: "shared", label: "Partagé" },
              ].map(({ id, label }) => html`
                <button
                  key=${id}
                  type="button"
                  className=${`mrd-subtab-btn${listsFilter === id ? " on" : ""}`}
                  onClick=${() => setListsFilter(id)}
                >${label}</button>
              `)}
            </div>

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
            style=${{ position: "absolute", inset: 0, background: "oklch(27% 0.05 48 / 0.45)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", zIndex: 50 }}
            onClick=${() => setShowListModal(false)}
          >
            <div
              style=${{ background: "var(--mrd-surf)", borderRadius: 24, border: "1px solid var(--mrd-borderSoft)", boxShadow: "0 28px 80px oklch(27% 0.05 48 / 0.35)", width: "min(480px, 100%)", maxHeight: "min(88vh, 800px)", overflowY: "auto", animation: "mrdSlideUp 0.22s ease" }}
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
                      placeholder="Nom de la liste\u2026"
                      autoFocus
                      style=${{ width: "100%", background: "none", border: "none", fontSize: 16, fontWeight: 600, color: "var(--mrd-fg)", outline: "none", padding: 0 }}
                    />
                  </div>
                </div>

                <!-- 2. Visibilité (masquée pour la liste de courses) -->
                ${editingList?.isShoppingList ? null : html`
                  <div>
                    <span style=${LBL}>Visibilit\u00e9</span>
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
                    <span style=${LBL}>Partag\u00e9 avec</span>
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
                  aria-label="Lier \u00e0 l\u2019inventaire"
                >${listForm.addToInventory ? "\u25cf" : "\u25cb"} Lié à l\u2019inventaire</button>

                <!-- 5. Bouton final -->
                <button type="submit"
                  disabled=${!formValid}
                  style=${{ width: "100%", padding: 14, borderRadius: "var(--mrd-r)", background: formValid ? "var(--mrd-a)" : "var(--mrd-disabledBg)", color: formValid ? "var(--mrd-white)" : "var(--mrd-disabledFg)", fontSize: 15, fontWeight: 700, cursor: formValid ? "pointer" : "default", boxShadow: formValid ? "0 6px 20px oklch(58% 0.13 28 / 0.28)" : "none", transition: "all 0.2s", border: "none" }}
                >
                  ${editingList ? "Enregistrer" : "Cr\u00e9er la liste"}
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
                    ${editingItem ? "Modifier l\u2019article" : "Ajouter un article"}
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
                    <span className="mrd-mlbl">Nom de l\u2019article</span>
                    <div style=${{ position: "relative" }}>
                      <input
                        className="ainp"
                        placeholder="Rechercher ou saisir\u2026"
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
                              ⚠️ D\u00e9j\u00e0 dans l\u2019inventaire : "${itemWarning.item.name}" ·
                              ${itemWarning.item.stockState === "empty" ? "Fini" : "En stock"}
                            </div>
                            <button
                              type="button"
                              className="clrbtn"
                              style=${{ fontSize: "12px", padding: "4px 10px" }}
                              onClick=${() => setBypassItemWarning(true)}
                            >
                              Ajouter quand m\u00eame
                            </button>
                          </div>
                        `
                      : null}
                  </div>

                  <div style=${{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <button
                      type="button"
                      onClick=${() => setShowItemQuantityFields((value) => !value)}
                      style=${{ alignSelf: "flex-start", border: "none", background: "none", color: "var(--mrd-a)", fontSize: 13, fontWeight: 700, padding: 0, cursor: "pointer" }}
                    >
                      ${showItemQuantityFields ? "− Masquer la quantité" : "+ Ajouter une quantité"}
                    </button>

                    ${showItemQuantityFields
                      ? html`
                          <div style=${{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <span className="mrd-mlbl">Quantité (optionnel)</span>
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

import { html, useEffect, useMemo, useState, useRef } from "../../lib.js";
import { getCurrentAppDate } from "../../utils/date.js?v=2026-04-19-time-sim-2";
import { findSimilarItem, formatQuantityUnit, normalizeProductName, suggestItems } from "../../utils/productUtils.js";
import { EmojiPicker } from "../tasks/EmojiPicker.js?v=2026-04-24-emoji-picker-1";

// ─── constants ────────────────────────────────────────────────────

const UNITS = [
  { value: "", label: "—" },
  { value: "unité", label: "Unité" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "cl", label: "cl" },
  { value: "l", label: "l" },
];

const SORT_OPTIONS = [
  { value: "alpha", label: "A → Z" },
  { value: "recent", label: "Récent" },
  { value: "expiry", label: "Péremption" },
  { value: "price", label: "Prix" },
];

const ACT = {
  display: "inline-flex", alignItems: "center",
  padding: "3px 9px", borderRadius: 7,
  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
  cursor: "pointer", lineHeight: 1.4, whiteSpace: "nowrap",
  flexShrink: 0, transition: "background 0.12s",
};

const INV_ACTION_SECONDARY = {
  background: "var(--mrd-surf2)",
  color: "var(--mrd-fg2)",
  border: "1px solid var(--mrd-borderSoft)",
};

const INV_ACTION_RESTOCK = {
  background: "var(--mrd-sageLt)",
  color: "var(--mrd-sageDeep)",
  border: "1px solid var(--mrd-sageMd)",
};

const INV_ACTION_RESTOCK_STRONG = {
  background: "var(--mrd-sage)",
  color: "#fff",
  border: "1px solid var(--mrd-sage)",
  boxShadow: "0 8px 18px oklch(54% 0.10 155 / 0.18)",
};

const LOCATION_PIN = String.fromCodePoint(0x1F4CD);
const LONG_PRESS_MS = 480;
const DRAG_CANCEL_DISTANCE = 10;

const FORM_INP = {
  width: "100%", boxSizing: "border-box",
  padding: "11px 13px",
  background: "var(--mrd-surf2)",
  border: "1.5px solid var(--mrd-border)",
  borderRadius: 12, fontSize: 16, fontWeight: 500,
  color: "var(--mrd-fg)", outline: "none",
  fontFamily: "inherit", appearance: "none", WebkitAppearance: "none",
};

const LBL = {
  fontSize: 11, fontWeight: 700, color: "var(--mrd-fg3)",
  textTransform: "uppercase", letterSpacing: "0.06em",
  marginBottom: 6, display: "block",
};

// ─── helpers ──────────────────────────────────────────────────────

function todayKey() {
  const now = getCurrentAppDate();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptyForm() {
  return { name: "", quantity: "", unit: "", purchaseDate: todayKey(), expiryDate: "", price: "", note: "", stockState: "in_stock" };
}

function compareByName(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity: "base" });
}

function compareInventoryByOrder(a, b) {
  const leftOrder = typeof a?.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
  const rightOrder = typeof b?.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return compareByName(a, b);
}

function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const today = getCurrentAppDate();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate + "T00:00:00");
  return Math.round((exp - today) / (1000 * 60 * 60 * 24));
}

function expiryDisplay(expiryDate) {
  const d = daysUntilExpiry(expiryDate);
  if (d === null) return null;
  if (d < 0) {
    const ago = Math.abs(d);
    return { text: `Dépassé depuis ${ago} jour${ago > 1 ? "s" : ""}`, color: "var(--mrd-danger)", bg: "var(--mrd-dangerLt)" };
  }
  if (d === 0) return { text: "Expire aujourd'hui !", color: "var(--mrd-danger)", bg: "var(--mrd-dangerLt)" };
  if (d <= 7) return { text: `Expire dans ${d} jour${d > 1 ? "s" : ""}`, color: "var(--mrd-amber)", bg: "var(--mrd-amberLt)" };
  const [y, mo, dy] = expiryDate.split("-");
  return { text: `DLC ${dy}/${mo}/${y}`, color: "var(--mrd-amber)", bg: "var(--mrd-amberLt)" };
}

function sortItems(arr, sortMode) {
  const items = [...arr];
  if (sortMode === "alpha") return items.sort(compareInventoryByOrder);
  if (sortMode === "recent") return items.sort((a, b) => (b.purchaseDate || "").localeCompare(a.purchaseDate || ""));
  if (sortMode === "expiry") {
    return items.sort((a, b) => {
      const da = a.expiryDate ? (daysUntilExpiry(a.expiryDate) !== null ? daysUntilExpiry(a.expiryDate) : 9999) : 9999;
      const db = b.expiryDate ? (daysUntilExpiry(b.expiryDate) !== null ? daysUntilExpiry(b.expiryDate) : 9999) : 9999;
      return da - db;
    });
  }
  if (sortMode === "price") {
    return items.sort((a, b) => {
      const pa = parseFloat(String(a.price || "0").replace(",", ".")) || 0;
      const pb = parseFloat(String(b.price || "0").replace(",", ".")) || 0;
      return pa - pb;
    });
  }
  return items;
}

function knownProductMeta(item) {
  if (item?.source === "inventory") return item.stockState === "empty" ? "Déjà vu dans l'inventaire" : "Déjà dans l'inventaire";
  if (item?.source === "list") return "Déjà vu dans une liste";
  if (item?.source === "recipe") return "Déjà vu dans une recette";
  if (item?.source === "recipe-draft") return "Déjà ajouté dans cette recette";
  return "Produit déjà connu";
}

// ─── component ────────────────────────────────────────────────────

function splitStorageLocationLabel(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return { emoji: "", name: "" };
  const matched = trimmed.match(/^(\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)\s*(.*)$/u);
  if (!matched) return { emoji: "", name: trimmed };
  return {
    emoji: String(matched[1] || "").trim(),
    name: String(matched[2] || "").trim() || trimmed,
  };
}

function getStorageLocationDisplay(location) {
  const fallback = splitStorageLocationLabel(location?.name || "");
  const emoji = String(location?.emoji || fallback.emoji || "").trim();
  const name = String(location?.name || fallback.name || "").trim();
  return {
    emoji,
    name,
    label: `${emoji ? `${emoji} ` : ""}${name}`.trim(),
  };
}

export function InventoryView({
  inventory,
  knownProducts = [],
  organiserMode = false,
  storageLocations = [],
  productLocationMemory = {},
  onAddInventoryItem,
  onUpdateInventoryItem,
  onDeleteInventoryItem,
  onClearFinishedInventory,
  onClearAllInventory,
  onSendInventoryToShopping,
  onAddStorageLocation,
  onRenameStorageLocation,
  onDeleteStorageLocation,
  onSetItemLocation,
  onReorderStorageLocations,
  onReorderInventoryItems,
}) {
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const productIndex = Array.isArray(knownProducts) && knownProducts.length ? knownProducts : safeInventory;
  const safeLocations = Array.isArray(storageLocations) ? storageLocations : [];
  const safeMemory = productLocationMemory && typeof productLocationMemory === "object" ? productLocationMemory : {};

  // search + sort
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("alpha");
  const [showSort, setShowSort] = useState(false);

  // modal
  const [showModal, setShowModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [similarWarning, setSimilarWarning] = useState(null);
  const [bypassSimilar, setBypassSimilar] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showExtraFields, setShowExtraFields] = useState(false);

  // organiser mode + tabs
  const [activeTab, setActiveTab] = useState("all");

  // location management (via tab ⋮ and inline +)
  const [locMenuId, setLocMenuId] = useState("");
  const [renamingLocId, setRenamingLocId] = useState("");
  const [renamingLocEmoji, setRenamingLocEmoji] = useState("");
  const [renamingLocName, setRenamingLocName] = useState("");
  const [showAddLocInput, setShowAddLocInput] = useState(false);
  const [addLocEmoji, setAddLocEmoji] = useState("");
  const [addLocInputValue, setAddLocInputValue] = useState("");
  const [showStorageEmojiPicker, setShowStorageEmojiPicker] = useState("");

  // ranger picker
  const [rangerItemId, setRangerItemId] = useState("");
  const [rangerNewLocEmoji, setRangerNewLocEmoji] = useState("");
  const [rangerNewLocName, setRangerNewLocName] = useState("");
  const [bulkRangerMode, setBulkRangerMode] = useState(false);
  const [rangerSearch, setRangerSearch] = useState("");
  const [rangerSelectedLocId, setRangerSelectedLocId] = useState(null);

  // selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // kebab menu (per item)
  const [openMenuId, setOpenMenuId] = useState("");

  // item drag-and-drop
  const [dragState, setDragState] = useState(null);
  const dragStateRef = useRef(null);
  const pressStateRef = useRef(null);
  const itemNodeRefs = useRef(new Map());
  const previousOrganiserMode = useRef(organiserMode);

  // tab drag-and-drop
  const [tabDragId, setTabDragId] = useState("");
  const [tabDropIndex, setTabDropIndex] = useState(-1);
  const tabLpTimer = useRef(null);
  const tabLpFired = useRef(false);
  const tabBarRef = useRef(null);
  const unassignedCount = safeInventory.filter((i) => !i.storageLocationId && i.stockState !== "empty").length;

  // derived
  const hasUnassignedTab = unassignedCount > 0;
  const activeLocation = safeLocations.find((location) => location.id === activeTab) || null;
  const effectiveTab = activeLocation
    ? activeLocation.id
    : activeTab === "unassigned" && hasUnassignedTab
      ? "unassigned"
      : "all";

  const rangerItem = rangerItemId ? safeInventory.find((i) => i.id === rangerItemId) : null;
  const memoryLocId = rangerItem ? safeMemory[normalizeProductName(rangerItem.name || "")] : null;
  const memoryLoc = memoryLocId ? safeLocations.find((l) => l.id === memoryLocId) : null;

  const { activeItems, finishedItems } = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = q ? safeInventory.filter((i) => String(i.name || "").toLowerCase().includes(q)) : safeInventory;
    if (organiserMode && effectiveTab !== "all") {
      if (effectiveTab === "unassigned") base = base.filter((i) => !i.storageLocationId);
      else base = base.filter((i) => i.storageLocationId === effectiveTab);
    }
    return {
      activeItems: sortItems(base.filter((i) => i.stockState !== "empty"), sortMode),
      finishedItems: sortItems(base.filter((i) => i.stockState === "empty"), sortMode),
    };
  }, [safeInventory, search, sortMode, organiserMode, effectiveTab]);

  const visibleExpiringCount = activeItems.filter((item) => {
    const d = daysUntilExpiry(item.expiryDate);
    return d !== null && d <= 7;
  }).length;
  const visibleActiveCount = activeItems.length;

  useEffect(() => {
    if (previousOrganiserMode.current && !organiserMode) {
      setActiveTab("all");
      setLocMenuId("");
    }
    previousOrganiserMode.current = organiserMode;
  }, [organiserMode]);

  useEffect(() => {
    dragStateRef.current = dragState;
    if (dragState) {
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";
    } else {
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    }
    return () => {
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";
    };
  }, [dragState]);

  useEffect(() => {
    function clearPendingPress() {
      if (pressStateRef.current?.timer) clearTimeout(pressStateRef.current.timer);
      pressStateRef.current = null;
    }

    function findClosestHoverItemId(pointerY, visibleIds) {
      let bestId = visibleIds[0] || "";
      let bestDistance = Infinity;
      visibleIds.forEach((itemId) => {
        const node = itemNodeRefs.current.get(itemId);
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const distance = Math.abs(pointerY - centerY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = itemId;
        }
      });
      return bestId;
    }

    function handlePointerMove(event) {
      const activeDrag = dragStateRef.current;
      if (activeDrag) {
        if (event.cancelable) event.preventDefault();
        const hoverItemId = findClosestHoverItemId(event.clientY, activeDrag.visibleIds);
        setDragState((previous) => (previous
          ? {
              ...previous,
              pointerY: event.clientY,
              pointerX: event.clientX,
              hoverItemId: hoverItemId || previous.hoverItemId,
            }
          : previous));
        return;
      }

      const pendingPress = pressStateRef.current;
      if (!pendingPress) return;
      const movedX = Math.abs(event.clientX - pendingPress.startX);
      const movedY = Math.abs(event.clientY - pendingPress.startY);
      if (movedX > DRAG_CANCEL_DISTANCE || movedY > DRAG_CANCEL_DISTANCE) {
        clearPendingPress();
      }
    }

    function handlePointerEnd() {
      clearPendingPress();
      const activeDrag = dragStateRef.current;
      if (!activeDrag) return;

      const sourceIndex = activeDrag.visibleIds.indexOf(activeDrag.itemId);
      const targetIndex = activeDrag.visibleIds.indexOf(activeDrag.hoverItemId);
      if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
        onReorderInventoryItems(activeDrag.itemId, targetIndex, activeDrag.visibleIds);
      }
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      clearPendingPress();
    };
  }, [onReorderInventoryItems]);

  // Non-passive touchmove during tab drag — prevents page scroll
  useEffect(() => {
    if (!tabDragId) return undefined;

    const strippedForEffect = safeLocations.filter((l) => l.id !== tabDragId);

    function onTouchMove(e) {
      if (!tabLpFired.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (!touch) return;
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!el) return;
      const tabEl = el.closest ? el.closest("[data-tab-id]") : null;
      if (!tabEl) return;
      const overId = tabEl.getAttribute("data-tab-id");
      if (!overId || overId === tabDragId) return;
      const overInStripped = strippedForEffect.findIndex((l) => l.id === overId);
      if (overInStripped === -1) return;
      const rect = tabEl.getBoundingClientRect();
      const newDropIndex = touch.clientX < rect.left + rect.width / 2
        ? overInStripped
        : overInStripped + 1;
      setTabDropIndex(newDropIndex);
    }

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", onTouchMove);
  }, [tabDragId]);

  useEffect(() => {
    if (activeTab === "unassigned" && !hasUnassignedTab) {
      setActiveTab("all");
    }
  }, [activeTab, hasUnassignedTab]);

  // global click handler to close menus
  function handleSectionClick() {
    if (showStorageEmojiPicker) return;
    if (openMenuId) setOpenMenuId("");
    if (locMenuId) setLocMenuId("");
    if (showSort) setShowSort(false);
    if (showAddLocInput) { setShowAddLocInput(false); setAddLocInputValue(""); setAddLocEmoji(""); }
  }

  // ─── modal handlers ───────────────────────────────────────────
  function openCreateModal() {
    setEditingItemId(""); setForm(emptyForm()); setSimilarWarning(null);
    setBypassSimilar(false); setSuggestions([]); setShowExtraFields(false); setShowModal(true);
  }
  function openEditModal(item) {
    setOpenMenuId("");
    setEditingItemId(item.id);
    setForm({
      name: item.name || "", quantity: item.quantity || "", unit: item.unit || "",
      purchaseDate: item.purchaseDate || todayKey(), expiryDate: item.expiryDate || "",
      price: item.price || "", note: item.note || "",
      stockState: item.stockState === "empty" ? "empty" : "in_stock",
    });
    setSimilarWarning(null); setBypassSimilar(false); setSuggestions([]);
    setShowExtraFields(!!(item.quantity || item.price || item.expiryDate || item.note));
    setShowModal(true);
  }
  function closeModal() {
    setShowModal(false); setEditingItemId(""); setSimilarWarning(null); setBypassSimilar(false); setSuggestions([]); setShowExtraFields(false);
  }
  function handleNameInput(value) {
    setForm((p) => ({ ...p, name: value }));
    setBypassSimilar(false);
    if (!value.trim()) { setSimilarWarning(null); setSuggestions([]); return; }
    setSimilarWarning(findSimilarItem(value, productIndex, editingItemId || null));
    setSuggestions(suggestItems(value, productIndex, editingItemId || null));
  }
  function selectSuggestion(item) {
    setEditingItemId(""); setForm((p) => ({ ...p, name: item.name || "" }));
    setSimilarWarning(null); setBypassSimilar(false); setSuggestions([]);
  }
  function submitInventory(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: form.name.trim(), quantity: form.quantity || "", unit: form.unit || "",
      purchaseDate: form.purchaseDate || todayKey(), expiryDate: form.expiryDate || "",
      price: form.price || "", note: form.note || "",
      stockState: form.stockState || "in_stock", needsRestock: form.stockState === "empty",
    };
    editingItemId ? onUpdateInventoryItem(editingItemId, payload) : onAddInventoryItem(payload);
    closeModal(); setForm(emptyForm());
  }

  // ─── selection handlers ────────────────────────────────────────
  function exitSelectionMode() { setSelectionMode(false); setSelectedIds([]); }
  function toggleSelect(id) {
    setSelectedIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  }
  function handleRowClick(e, item) {
    if (openMenuId) { setOpenMenuId(""); return; }
    if (selectionMode) toggleSelect(item.id);
  }
  function registerItemNode(itemId, node) {
    if (node) {
      itemNodeRefs.current.set(itemId, node);
    } else {
      itemNodeRefs.current.delete(itemId);
    }
  }
  function preventItemSelection(event) {
    if (event?.cancelable) event.preventDefault();
  }
  function handleItemPointerDown(event, itemId, sectionKey, visibleIds) {
    if (selectionMode) return;
    if (sortMode !== "alpha") return;
    if (event.button !== undefined && event.button !== 0) return;
    if (!Array.isArray(visibleIds) || visibleIds.length < 2) return;
    if (event.target?.closest?.("button, input, select, textarea, a")) return;

    const itemNode = itemNodeRefs.current.get(itemId);
    if (!itemNode) return;
    if (pressStateRef.current?.timer) clearTimeout(pressStateRef.current.timer);

    const startX = event.clientX;
    const startY = event.clientY;
    pressStateRef.current = {
      itemId,
      startX,
      startY,
      timer: setTimeout(() => {
        const rect = itemNode.getBoundingClientRect();
        setDragState({
          itemId,
          sectionKey,
          visibleIds,
          hoverItemId: itemId,
          pointerX: startX,
          pointerY: startY,
          offsetY: startY - rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
        setOpenMenuId("");
        pressStateRef.current = null;
      }, LONG_PRESS_MS),
    };
  }
  function getDragPreviewForList(list, sectionKey) {
    if (!dragState || dragState.sectionKey !== sectionKey || !Array.isArray(list) || list.length < 2) return null;
    const sourceIndex = list.findIndex((item) => item.id === dragState.itemId);
    const hoverIndex = list.findIndex((item) => item.id === dragState.hoverItemId);
    if (sourceIndex < 0 || hoverIndex < 0) return null;
    if (sourceIndex === hoverIndex) {
      return {
        anchorItemId: list[sourceIndex]?.id || "",
        position: "before",
        height: dragState.height || 72,
        sourceIndex,
        hoverIndex,
      };
    }
    return {
      anchorItemId: list[hoverIndex]?.id || "",
      position: sourceIndex < hoverIndex ? "after" : "before",
      height: dragState.height || 72,
      sourceIndex,
      hoverIndex,
    };
  }
  function getDragMotionClass(itemId, list, sectionKey) {
    const preview = getDragPreviewForList(list, sectionKey);
    if (!preview) return "";
    const currentIndex = list.findIndex((item) => item.id === itemId);
    if (currentIndex < 0) return "";
    if (itemId === dragState?.itemId) return "drag-source";
    if (preview.sourceIndex < preview.hoverIndex && currentIndex > preview.sourceIndex && currentIndex <= preview.hoverIndex) {
      return "reorder-shift-up";
    }
    if (preview.sourceIndex > preview.hoverIndex && currentIndex >= preview.hoverIndex && currentIndex < preview.sourceIndex) {
      return "reorder-shift-down";
    }
    return "";
  }
  function renderDropPlaceholder(preview, suffix = "") {
    if (!preview?.anchorItemId) return null;
    return html`
      <div
        key=${`inv-drop-${preview.anchorItemId}-${preview.position}-${suffix}`}
        className="inv-drop-placeholder"
        style=${{ height: `${Math.max(54, Math.round(preview.height || 72))}px` }}
      ></div>
    `;
  }
  function bulkFinished() { selectedIds.forEach((id) => onUpdateInventoryItem(id, { stockState: "empty", needsRestock: true })); exitSelectionMode(); }
  function bulkShopping() { selectedIds.forEach((id) => onSendInventoryToShopping(id)); exitSelectionMode(); }
  function bulkDelete() { selectedIds.forEach((id) => onDeleteInventoryItem(id)); exitSelectionMode(); }
  function bulkMove() {
    if (!selectedIds.length) return;
    setBulkRangerMode(true);
    setRangerItemId(selectedIds[0]);
    setRangerNewLocName("");
    setRangerNewLocEmoji("");
    setRangerSearch("");
    setRangerSelectedLocId(null);
  }

  // ─── ranger handlers ──────────────────────────────────────────
  function openRanger(itemId) {
    const item = safeInventory.find((i) => i.id === itemId);
    setRangerItemId(itemId);
    setRangerNewLocName("");
    setRangerNewLocEmoji("");
    setBulkRangerMode(false);
    setRangerSearch("");
    setRangerSelectedLocId(item ? (item.storageLocationId || "") : null);
  }
  function closeRanger() {
    setRangerItemId("");
    setRangerNewLocName("");
    setRangerNewLocEmoji("");
    setBulkRangerMode(false);
    setShowStorageEmojiPicker("");
    setRangerSearch("");
    setRangerSelectedLocId(null);
  }
  function applyStorageEmoji(emoji) {
    if (showStorageEmojiPicker === "editor") {
      if (renamingLocId) setRenamingLocEmoji(emoji);
      else setAddLocEmoji(emoji);
    } else if (showStorageEmojiPicker === "ranger") {
      setRangerNewLocEmoji(emoji);
    }
    setShowStorageEmojiPicker("");
  }
  function assignLocation(locationId) {
    if (bulkRangerMode) { selectedIds.forEach((id) => onSetItemLocation(id, locationId || "")); exitSelectionMode(); }
    else onSetItemLocation(rangerItemId, locationId || "");
    closeRanger();
  }
  function submitRanger() {
    if (rangerSelectedLocId === null) return;
    assignLocation(rangerSelectedLocId);
  }
  function createAndAssignFromSearch() {
    if (!rangerSearch.trim()) return;
    const newId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const parsed = splitStorageLocationLabel(rangerSearch);
    onAddStorageLocation({
      id: newId,
      name: parsed.name || rangerSearch.trim(),
      emoji: String(parsed.emoji || "").trim(),
    });
    if (bulkRangerMode) { selectedIds.forEach((id) => onSetItemLocation(id, newId)); exitSelectionMode(); }
    else onSetItemLocation(rangerItemId, newId);
    closeRanger();
  }
  function createAndAssign() {
    if (!rangerNewLocName.trim()) return;
    const newId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const parsed = splitStorageLocationLabel(rangerNewLocName);
    onAddStorageLocation({
      id: newId,
      name: parsed.name || rangerNewLocName.trim(),
      emoji: String(rangerNewLocEmoji || parsed.emoji || "").trim(),
    });
    if (bulkRangerMode) { selectedIds.forEach((id) => onSetItemLocation(id, newId)); exitSelectionMode(); }
    else onSetItemLocation(rangerItemId, newId);
    closeRanger();
  }

  // ─── tab drag handlers ────────────────────────────────────────
  function lockBodySelection() {
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
  }
  function unlockBodySelection() {
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
  }

  function handleTabTouchStart(e, locId) {
    if (tabDragId) return;
    tabLpFired.current = false;
    tabLpTimer.current = setTimeout(() => {
      tabLpFired.current = true;
      lockBodySelection();
      const originalIdx = safeLocations.findIndex((l) => l.id === locId);
      setTabDragId(locId);
      setTabDropIndex(originalIdx);
    }, 480);
  }

  function handleTabTouchEnd(e, locId) {
    clearTimeout(tabLpTimer.current);
    unlockBodySelection();
    if (!tabLpFired.current) return;
    e.preventDefault();
    if (tabDragId && tabDropIndex >= 0 && typeof onReorderStorageLocations === "function") {
      const fromIdx = safeLocations.findIndex((l) => l.id === tabDragId);
      if (fromIdx !== -1) {
        const dragged = safeLocations[fromIdx];
        const stripped = safeLocations.filter((l) => l.id !== tabDragId);
        stripped.splice(Math.min(tabDropIndex, stripped.length), 0, dragged);
        const newIds = stripped.map((l) => l.id);
        if (newIds.join(",") !== safeLocations.map((l) => l.id).join(",")) {
          onReorderStorageLocations(newIds);
        }
      }
    }
    setTabDragId("");
    setTabDropIndex(-1);
    tabLpFired.current = false;
  }

  function cancelTabDrag() {
    clearTimeout(tabLpTimer.current);
    unlockBodySelection();
    setTabDragId("");
    setTabDropIndex(-1);
    tabLpFired.current = false;
  }

  // ─── location handlers ────────────────────────────────────────
  function submitAddLoc() {
    if (!addLocInputValue.trim()) return;
    const parsed = splitStorageLocationLabel(addLocInputValue);
    onAddStorageLocation({
      name: parsed.name || addLocInputValue.trim(),
      emoji: String(addLocEmoji || parsed.emoji || "").trim(),
    });
    setAddLocInputValue(""); setAddLocEmoji(""); setShowAddLocInput(false);
  }
  function startRenameLoc(loc) {
    const display = getStorageLocationDisplay(loc);
    setLocMenuId("");
    setRenamingLocId(loc.id);
    setRenamingLocEmoji(display.emoji || "");
    setRenamingLocName(display.name || loc.name);
  }
  function submitRenameLoc(id) {
    if (!renamingLocName.trim()) return;
    const parsed = splitStorageLocationLabel(renamingLocName);
    onRenameStorageLocation(id, {
      name: parsed.name || renamingLocName.trim(),
      emoji: String(renamingLocEmoji || parsed.emoji || "").trim(),
    });
    setRenamingLocId(""); setRenamingLocEmoji(""); setRenamingLocName("");
  }

  // ─── render: single product row ───────────────────────────────
  function renderItem(item, isFinished, list, sectionKey) {
    const qtyLabel = formatQuantityUnit(item.quantity, item.unit);
    const actionLocName = organiserMode && item.storageLocationId && !activeLocation
      ? getStorageLocationDisplay(safeLocations.find((l) => l.id === item.storageLocationId) || null).label || null
      : null;
    const locName = null;
    const expiry = expiryDisplay(item.expiryDate);
    const isSelected = selectedIds.includes(item.id);
    const menuOpen = openMenuId === item.id;
    const dragMotionClass = getDragMotionClass(item.id, list, sectionKey);
    const isDragging = dragState?.itemId === item.id;
    const rowCursor = selectionMode
      ? "pointer"
      : (sortMode === "alpha" && Array.isArray(list) && list.length > 1 ? "grab" : "default");

    const metaParts = [];
    if (qtyLabel) metaParts.push(qtyLabel);
    if (item.price) metaParts.push(`${item.price} €`);
    if (item.note) metaParts.push(item.note);
    const metaLine = metaParts.join(" · ");

    return html`
      <div key=${item.id}
        ref=${(node) => registerItemNode(item.id, node)}
        className=${`ldv-item${isFinished ? " ldv-item-done" : ""}${isSelected ? " ldv-item-sel" : ""}${isDragging ? " drag-source" : ""}${dragMotionClass ? ` ${dragMotionClass}` : ""}`}
        style=${{ userSelect: "none", WebkitUserSelect: "none", cursor: rowCursor, alignItems: "flex-start", paddingTop: 11, paddingBottom: 11 }}
        onPointerDown=${(event) => handleItemPointerDown(event, item.id, sectionKey, list.map((entry) => entry.id))}
        onSelectStart=${preventItemSelection}
        onDragStart=${preventItemSelection}
        onClick=${(e) => handleRowClick(e, item)}
      >
        ${selectionMode ? html`
          <button type="button"
            className=${`ldv-chk inv-select-chk${isSelected ? " on" : ""}`}
            style=${{ marginTop: 1, flexShrink: 0 }}
            onClick=${(e) => { e.stopPropagation(); toggleSelect(item.id); }}>
            ${isSelected ? "✓" : ""}
          </button>
        ` : null}

        <div className="ldv-item-body" style=${{ gap: 2 }}>
          <span style=${{
            fontSize: 14, fontWeight: 600, color: "var(--mrd-fg)", lineHeight: 1.3,
            textDecoration: isFinished ? "line-through" : "none",
          }}>${item.name}</span>

          ${metaLine ? html`<span className="ldv-item-qty" style=${{ whiteSpace: "normal" }}>${metaLine}</span>` : null}

          ${locName ? html`
            <span style=${{ fontSize: 11, color: "var(--mrd-fg3)", display: "flex", alignItems: "center", gap: 3 }}>
              <span>📍</span><span style=${{ fontWeight: 500 }}>${locName}</span>
            </span>
          ` : null}

          ${expiry ? html`
            <span style=${{
              fontSize: 10, fontWeight: 600, color: expiry.color,
              background: expiry.bg || "none",
              padding: "2px 7px",
              borderRadius: 999,
              display: "inline-block", lineHeight: 1.5, marginTop: 1,
            }}>${expiry.text}</span>
          ` : null}

          ${!selectionMode ? html`
            <div className="inv-item-action-row">
              ${organiserMode ? html`
                <button type="button"
                  onClick=${(e) => { e.stopPropagation(); openRanger(item.id); }}
                  style=${item.storageLocationId
                    ? { ...ACT, ...INV_ACTION_SECONDARY }
                    : { ...ACT, background: "var(--mrd-aLt)", color: "var(--mrd-a)", border: "none" }}>
                  ${item.storageLocationId ? "Déplacer" : "Ranger"}
                </button>
              ` : null}
              <button type="button"
                onClick=${(e) => { e.stopPropagation(); onSendInventoryToShopping(item.id); }}
                style=${{ ...ACT, ...(isFinished ? INV_ACTION_RESTOCK_STRONG : INV_ACTION_RESTOCK) }}>
                À racheter
              </button>
              ${isFinished ? html`
                <button type="button"
                  onClick=${(e) => { e.stopPropagation(); onUpdateInventoryItem(item.id, { stockState: "in_stock", needsRestock: false }); }}
                  style=${{ ...ACT, ...INV_ACTION_SECONDARY }}>
                  Remettre en stock
                </button>
              ` : html`
                <button type="button"
                  onClick=${(e) => { e.stopPropagation(); onUpdateInventoryItem(item.id, { stockState: "empty", needsRestock: true }); }}
                  style=${{ ...ACT, ...INV_ACTION_SECONDARY, color: "var(--mrd-fg3)" }}>
                  Fini
                </button>
              `}
              ${actionLocName ? html`
                <span className="inv-item-loc-inline">
                  <span>ðŸ“</span><span>${actionLocName}</span>
                </span>
              ` : null}
            </div>
          ` : null}
        </div>

        ${!selectionMode ? html`
          <div className="task-menu-wrap ldv-menu-wrap">
            <button type="button" className="task-menu-btn ldv-item-kebab"
              onClick=${(e) => { e.stopPropagation(); setOpenMenuId(menuOpen ? "" : item.id); }}>
              ⋮
            </button>
            ${menuOpen ? html`
              <div className="task-menu-dropdown ldv-item-dropdown">
                <button type="button" className="task-menu-item"
                  onClick=${(e) => { e.stopPropagation(); openEditModal(item); }}>
                  Modifier
                </button>
                <button type="button" className="task-menu-item task-menu-item-danger"
                  onClick=${(e) => { e.stopPropagation(); onDeleteInventoryItem(item.id); setOpenMenuId(""); }}>
                  Supprimer
                </button>
              </div>
            ` : null}
          </div>
        ` : null}
      </div>
    `;
  }

  // ─── render: grouped section (ldv-card style) ─────────────────
  function renderItemSection(items, isFinished) {
    if (!items.length) return null;
    const count = items.length;
    const sectionKey = isFinished ? "finished" : "active";
    const preview = getDragPreviewForList(items, sectionKey);
    return html`
      <div className="ldv-section" style=${{ marginBottom: 4 }}>
        ${isFinished ? html`
          <div className="ldv-section-head">
            <span className="ldv-section-title">Produits finis</span>
            <span className="ldv-section-count">${count} article${count > 1 ? "s" : ""}</span>
            <button type="button"
              onClick=${onClearFinishedInventory}
              style=${{ fontSize: 11, fontWeight: 600, color: "var(--mrd-fg3)", background: "none", border: "1px solid var(--mrd-borderSoft)", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: "inherit", marginLeft: "auto" }}>
              Vider
            </button>
          </div>
        ` : null}
        <div className="ldv-card">
          ${items.flatMap((item, index) => {
            const parts = [];
            if (preview && preview.anchorItemId === item.id && preview.position === "before") {
              parts.push(renderDropPlaceholder(preview, `before-${index}`));
            }
            parts.push(renderItem(item, isFinished, items, sectionKey));
            if (preview && preview.anchorItemId === item.id && preview.position === "after") {
              parts.push(renderDropPlaceholder(preview, `after-${index}`));
            }
            return parts;
          })}
        </div>
      </div>
    `;
  }

  // ─── render: tab bar with drag-and-drop for locations ─────────
  function renderTabBar() {
    if (!organiserMode) return null;

    // Build display order: move tabDragId to its preview position
    const strippedLocs = safeLocations.filter((l) => l.id !== tabDragId);
    let displayLocs;
    if (tabDragId && tabDropIndex >= 0) {
      const dragged = safeLocations.find((l) => l.id === tabDragId);
      displayLocs = [...strippedLocs];
      if (dragged) displayLocs.splice(Math.min(tabDropIndex, displayLocs.length), 0, dragged);
    } else {
      displayLocs = [...safeLocations];
    }

    const isDragActive = Boolean(tabDragId);

    return html`
      <div className="inv-organiser-row">
        <div className="mrd-subtabs inv-organiser-tabs" role="tablist" aria-label="Rangements" ref=${tabBarRef}
          style=${{ userSelect: "none", WebkitUserSelect: "none" }}>

          <button type="button" role="tab"
            aria-selected=${effectiveTab === "all" ? "true" : "false"}
            className=${`mrd-subtab-btn${effectiveTab === "all" ? " on" : ""}`}
            onClick=${() => setActiveTab("all")}
          >Tout</button>

          ${hasUnassignedTab ? html`
            <button type="button" role="tab"
              aria-selected=${effectiveTab === "unassigned" ? "true" : "false"}
              className=${`mrd-subtab-btn${effectiveTab === "unassigned" ? " on" : ""}`}
              onClick=${() => setActiveTab("unassigned")}
            >
              Non rangé
              <span style=${{ fontSize: 10, opacity: 0.8, marginLeft: 3 }}>${unassignedCount}</span>
            </button>
          ` : null}

          ${displayLocs.map((loc) => {
            const isDragging = tabDragId === loc.id;
            const cnt = safeInventory.filter((i) => i.storageLocationId === loc.id && i.stockState !== "empty").length;
            return html`
              <button
                key=${loc.id}
                data-tab-id=${loc.id}
                type="button"
                role="tab"
                aria-selected=${effectiveTab === loc.id && !isDragging ? "true" : "false"}
                className=${`mrd-subtab-btn${effectiveTab === loc.id && !isDragging ? " on" : ""}`}
                style=${{
                  position: "relative",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  transform: isDragging ? "scale(1.07)" : "scale(1)",
                  opacity: isDragActive && !isDragging ? 0.45 : 1,
                  boxShadow: isDragging ? "0 6px 20px oklch(27% 0.05 48 / 0.28)" : "none",
                  zIndex: isDragging ? 10 : 1,
                  transition: isDragging
                    ? "box-shadow 0.12s"
                    : "opacity 0.15s, transform 0.18s, box-shadow 0.18s",
                  touchAction: isDragActive ? "none" : undefined,
                  pointerEvents: isDragging ? "none" : undefined,
                  cursor: isDragActive ? (isDragging ? "grabbing" : "default") : "grab",
                }}
                onClick=${() => { if (!tabLpFired.current) setActiveTab(loc.id); }}
                onTouchStart=${(e) => handleTabTouchStart(e, loc.id)}
                onTouchEnd=${(e) => handleTabTouchEnd(e, loc.id)}
                onTouchCancel=${cancelTabDrag}
              >
                ${getStorageLocationDisplay(loc).label || loc.name}
                ${cnt > 0 ? html`<span style=${{ fontSize: 10, opacity: 0.75, marginLeft: 3 }}>${cnt}</span>` : null}
              </button>
            `;
          })}
        </div>

        <button
          type="button"
          className="inv-organiser-add"
          onClick=${(e) => {
            e.stopPropagation();
            setLocMenuId("");
            setRenamingLocId("");
            setRenamingLocEmoji("");
            setAddLocInputValue("");
            setAddLocEmoji("");
            setRenamingLocName("");
            setShowAddLocInput(true);
          }}
          title="Créer un rangement"
        >+</button>
      </div>
    `;
  }

  function renderLocationEditor() {
    if (!organiserMode) return null;
    if (!showAddLocInput && !renamingLocId) return null;
    const isEditing = Boolean(renamingLocId);
    const emojiValue = isEditing ? renamingLocEmoji : addLocEmoji;
    const value = isEditing ? renamingLocName : addLocInputValue;
    const setValue = isEditing ? setRenamingLocName : setAddLocInputValue;
    const submit = isEditing ? () => submitRenameLoc(renamingLocId) : submitAddLoc;
    const cancel = () => {
      setShowAddLocInput(false);
      setAddLocEmoji("");
      setAddLocInputValue("");
      setRenamingLocId("");
      setRenamingLocEmoji("");
      setRenamingLocName("");
      setShowStorageEmojiPicker("");
    };

    return html`
      <div className="inv-organiser-editor">
        <button
          type="button"
          title="Choisir un emoji"
          onClick=${(e) => {
            e.stopPropagation();
            setShowStorageEmojiPicker("editor");
          }}
          className=${`inv-organiser-editor-emoji${emojiValue ? "" : " is-empty"}`}
        >
          ${emojiValue || "＋"}
        </button>
        <input
          value=${value}
          onInput=${(e) => setValue(e.target.value)}
          onKeyDown=${(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") cancel();
          }}
          autoFocus
          placeholder="Nom du rangement..."
          onClick=${(e) => e.stopPropagation()}
          className="inv-organiser-editor-input"
        />
        <button type="button" className="inv-organiser-editor-save" onClick=${(e) => { e.stopPropagation(); submit(); }} disabled=${!String(value || "").trim()}>
          OK
        </button>
        <button type="button" className="inv-organiser-editor-cancel" onClick=${(e) => { e.stopPropagation(); cancel(); }}>
          ✕
        </button>
      </div>
    `;
  }

  function renderSelectedLocationHeading() {
    if (!activeLocation) return null;
    const display = getStorageLocationDisplay(activeLocation);
    const menuOpen = locMenuId === activeLocation.id;

    return html`
      <div className="inv-selected-heading">
        <div className="inv-selected-heading-left">
          <div className="inv-selected-heading-label">${display.label || activeLocation.name}</div>
          <span className="inv-selected-heading-count">${visibleActiveCount} article${visibleActiveCount !== 1 ? "s" : ""}</span>
        </div>

        ${selectionMode ? html`
          <button type="button"
            onClick=${(e) => { e.stopPropagation(); exitSelectionMode(); }}
            style=${{ padding: "5px 11px", borderRadius: 9, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: "var(--mrd-fg)", color: "#fff", border: "none", minHeight: 32, flexShrink: 0 }}>
            Annuler
          </button>
        ` : html`
          <button type="button"
            onClick=${(e) => { e.stopPropagation(); setSelectionMode(true); setSelectedIds([]); }}
            style=${{ padding: "5px 11px", borderRadius: 9, fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", background: "none", color: "var(--mrd-fg3)", border: "1px solid var(--mrd-borderSoft)", minHeight: 32, flexShrink: 0 }}>
            Sélectionner
          </button>
        `}

        ${organiserMode ? html`
          <div className="task-menu-wrap">
            <button
              type="button"
              className="task-menu-btn inv-selected-heading-menu"
              onClick=${(e) => { e.stopPropagation(); setLocMenuId(menuOpen ? "" : activeLocation.id); }}
            >
              ⋮
            </button>
            ${menuOpen ? html`
              <div className="task-menu-dropdown" style=${{ top: "calc(100% + 6px)", right: 0, minWidth: 150, zIndex: 70 }} onClick=${(e) => e.stopPropagation()}>
                <button type="button" className="task-menu-item" onClick=${() => startRenameLoc(activeLocation)}>
                  Modifier
                </button>
                <button
                  type="button"
                  className="task-menu-item task-menu-item-danger"
                  onClick=${() => {
                    onDeleteStorageLocation(activeLocation.id);
                    setLocMenuId("");
                    if (effectiveTab === activeLocation.id) setActiveTab("all");
                  }}
                >
                  Supprimer
                </button>
              </div>
            ` : null}
          </div>
        ` : null}
      </div>
    `;
  }

  function renderRangerPicker() {
    if (!rangerItemId) return null;

    const rangerCount = bulkRangerMode ? selectedIds.length : 1;
    const qtyLabel = rangerItem ? formatQuantityUnit(rangerItem.quantity, rangerItem.unit) : "";
    const metaParts = [];
    if (qtyLabel) metaParts.push(qtyLabel);
    if (rangerItem?.price) metaParts.push(`${rangerItem.price} €`);
    if (rangerItem?.note) metaParts.push(rangerItem.note);
    const metaLine = metaParts.join(" · ");

    const canConfirm = rangerSelectedLocId !== null;
    const selectValue = rangerSelectedLocId === null ? "" : rangerSelectedLocId;

    return html`
      <div className="modal-backdrop task-create-backdrop" onClick=${closeRanger}>
        <div className="modal-card task-modal-redesign" onClick=${(e) => e.stopPropagation()}
          style=${{ width: "min(440px, 100%)" }}>

          <div className="mrd-mhd">
            <span className="mrd-mtitle">
              ${bulkRangerMode ? `Ranger ${rangerCount} article${rangerCount > 1 ? "s" : ""}` : "Ranger un produit"}
            </span>
            <button type="button" onClick=${closeRanger} className="mrd-mclose">✕</button>
          </div>

          <div className="mrd-mbody">

            ${!bulkRangerMode && rangerItem ? html`
              <div style=${{ background: "var(--mrd-surf2)", borderRadius: 12, padding: "11px 14px" }}>
                <div style=${{ fontWeight: 600, fontSize: 14, color: "var(--mrd-fg)", lineHeight: 1.3 }}>${rangerItem.name}</div>
                ${metaLine ? html`<div style=${{ fontSize: 12, color: "var(--mrd-fg3)", marginTop: 3 }}>${metaLine}</div>` : null}
              </div>
            ` : null}

            <div>
              <span className="mrd-mlbl">Lieu de rangement</span>
              <div style=${{ position: "relative" }}>
                <select
                  value=${selectValue}
                  onChange=${(e) => setRangerSelectedLocId(e.target.value)}
                  style=${{ ...FORM_INP, paddingRight: 36, cursor: "pointer" }}
                >
                  <option value="">Non classé</option>
                  ${memoryLoc && !bulkRangerMode ? html`
                    <option value=${memoryLoc.id}>
                      ${getStorageLocationDisplay(memoryLoc).label || memoryLoc.name} — Dernière fois
                    </option>
                  ` : null}
                  ${safeLocations
                    .filter((l) => !memoryLoc || l.id !== memoryLoc.id || bulkRangerMode)
                    .map((loc) => html`
                      <option key=${loc.id} value=${loc.id}>
                        ${getStorageLocationDisplay(loc).label || loc.name}
                      </option>
                    `)}
                </select>
                <span style=${{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--mrd-fg3)", pointerEvents: "none" }}>▼</span>
              </div>
            </div>

            <div style=${{ display: "flex", gap: 8, paddingTop: 4 }}>
              <button type="button" onClick=${closeRanger}
                style=${{ flex: "0 0 auto", padding: "12px 18px", borderRadius: 12, border: "1px solid var(--mrd-border)", background: "var(--mrd-surf2)", color: "var(--mrd-fg2)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button type="button"
                onClick=${submitRanger}
                disabled=${!canConfirm}
                style=${{
                  flex: 1, padding: "12px 0", borderRadius: 12, border: "none",
                  background: canConfirm ? "var(--mrd-a)" : "var(--mrd-disabledBg)",
                  fontSize: 14, fontWeight: 700,
                  color: canConfirm ? "#fff" : "var(--mrd-disabledFg)",
                  cursor: canConfirm ? "pointer" : "default",
                  fontFamily: "inherit", transition: "background 0.15s, color 0.15s",
                }}>
                ${bulkRangerMode ? `Ranger ${rangerCount} article${rangerCount > 1 ? "s" : ""}` : "Ranger"}
              </button>
            </div>

          </div>
        </div>
      </div>
    `;
  }

  function renderStorageEmojiPicker() {
    if (!showStorageEmojiPicker) return null;
    return html`<${EmojiPicker}
      key=${showStorageEmojiPicker}
      onSelect=${applyStorageEmoji}
      onClose=${() => setShowStorageEmojiPicker("")}
    />`;
  }

  // ─── render: add/edit modal ───────────────────────────────────
  function renderModal() {
    if (!showModal) return null;
    const DISC_BASE = {
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "7px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600,
      transition: "all 0.15s", cursor: "pointer", fontFamily: "inherit",
    };
    const INP_INNER = {
      background: "var(--mrd-surf)", border: "1px solid var(--mrd-border)",
      borderRadius: 10, padding: "9px 10px", fontSize: 16, fontWeight: 500,
      color: "var(--mrd-fg)", outline: "none", fontFamily: "inherit",
    };
    return html`
      <div className="modal-backdrop task-create-backdrop" onClick=${closeModal}>
        <div className="modal-card task-modal-redesign" onClick=${(e) => e.stopPropagation()}
          style=${{ width: "min(500px, 100%)" }}>

          <div className="mrd-mhd">
            <span className="mrd-mtitle">${editingItemId ? "Modifier l'article" : "Ajouter un article"}</span>
            <button type="button" onClick=${closeModal} className="mrd-mclose">✕</button>
          </div>

          <form onSubmit=${submitInventory} className="mrd-mbody">

            <!-- 1. Nom de l'article -->
            <div>
              <span className="mrd-mlbl">Nom de l'article</span>
              <div style=${{ position: "relative" }}>
                <input
                  style=${{ ...FORM_INP, borderColor: "var(--mrd-a)" }}
                  value=${form.name}
                  onInput=${(e) => handleNameInput(e.target.value)}
                  onBlur=${() => { setTimeout(() => setSuggestions([]), 150); }}
                  placeholder="Ex : Lait, Tomates, Savon…"
                  autocomplete="off" autoFocus
                />
                ${suggestions.length ? html`
                  <div className="suggest-dropdown">
                    ${suggestions.map((it) => html`
                      <button key=${it.id} type="button" className="suggest-item" onMouseDown=${() => selectSuggestion(it)}>
                        <span>${it.name}</span>
                        <span className="mini" style=${{ marginLeft: 8, opacity: 0.7 }}>
                          ${formatQuantityUnit(it.quantity, it.unit) ? `${formatQuantityUnit(it.quantity, it.unit)} · ` : ""}${knownProductMeta(it)}
                        </span>
                      </button>
                    `)}
                  </div>
                ` : null}
              </div>
              ${similarWarning && !bypassSimilar ? html`
                <div style=${{ background: "var(--mrd-amberLt)", border: "1px solid var(--mrd-amberMd)", borderRadius: 10, padding: "10px 12px", marginTop: 8 }}>
                  <div style=${{ fontSize: 12, fontWeight: 700, color: "var(--mrd-amber)", marginBottom: 8 }}>
                    Article similaire : « ${similarWarning.item.name} »
                  </div>
                  <div style=${{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    ${similarWarning.item && (similarWarning.item.source === "inventory" || safeInventory.some((e) => e.id === similarWarning.item.id))
                      ? html`<button type="button" className="aok" style=${{ fontSize: 12, padding: "4px 10px" }} onClick=${() => { closeModal(); openEditModal(similarWarning.item); }}>Modifier l'existant</button>`
                      : html`<button type="button" className="aok" style=${{ fontSize: 12, padding: "4px 10px" }} onClick=${() => selectSuggestion(similarWarning.item)}>Reprendre ce produit</button>`}
                    <button type="button" className="clrbtn" style=${{ fontSize: 12, padding: "4px 10px" }} onClick=${() => setBypassSimilar(true)}>Créer quand même</button>
                  </div>
                </div>
              ` : null}
            </div>

            <!-- 2. Bouton capsule "+ Plus d'informations" -->
            <div>
              <button type="button"
                onClick=${() => setShowExtraFields((v) => !v)}
                style=${{ ...DISC_BASE,
                  background: showExtraFields ? "var(--mrd-aLt)" : "var(--mrd-surf2)",
                  color: showExtraFields ? "var(--mrd-a)" : "var(--mrd-fg3)",
                  border: "1px solid " + (showExtraFields ? "var(--mrd-aMd)" : "var(--mrd-border)"),
                }}
              >${showExtraFields ? "✓" : "+"} Plus d'informations</button>
            </div>

            <!-- 3. Encadré informations supplémentaires -->
            ${showExtraFields ? html`
              <div style=${{ display: "flex", flexDirection: "column", gap: 12, background: "var(--mrd-surf2)", borderRadius: 16, padding: "14px 14px 12px", border: "1px solid var(--mrd-borderSoft)" }}>

                <div>
                  <span className="mrd-mlbl" style=${{ marginBottom: 6 }}>Quantité</span>
                  <div style=${{ display: "flex", gap: 8 }}>
                    <input
                      style=${{ ...INP_INNER, flex: 1 }}
                      placeholder="Ex : 2, 500…"
                      value=${form.quantity}
                      onInput=${(e) => setForm({ ...form, quantity: e.target.value })}
                    />
                    <select
                      style=${{ ...INP_INNER, width: 90, flexShrink: 0, appearance: "none", WebkitAppearance: "none" }}
                      value=${form.unit}
                      onChange=${(e) => setForm({ ...form, unit: e.target.value })}
                    >
                      ${UNITS.map((u) => html`<option key=${u.value} value=${u.value}>${u.label}</option>`)}
                    </select>
                  </div>
                </div>

                <div style=${{ display: "flex", gap: 8 }}>
                  <div style=${{ flex: 1 }}>
                    <span className="mrd-mlbl" style=${{ marginBottom: 6 }}>Prix (€)</span>
                    <input
                      style=${{ ...INP_INNER, width: "100%", boxSizing: "border-box" }}
                      placeholder="1,99"
                      value=${form.price}
                      onInput=${(e) => setForm({ ...form, price: e.target.value })}
                    />
                  </div>
                  <div style=${{ flex: 1 }}>
                    <span className="mrd-mlbl" style=${{ marginBottom: 6 }}>DLC</span>
                    <label style=${{ display: "block", position: "relative" }}>
                      <div style=${{
                        ...INP_INNER, width: "100%", boxSizing: "border-box",
                        display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
                        color: form.expiryDate ? "var(--mrd-fg)" : "var(--mrd-fg3)",
                        userSelect: "none",
                      }}>
                        <span>📅</span>
                        <span>${form.expiryDate
                          ? new Date(form.expiryDate.replace(/-/g, "/")).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
                          : "Date limite"
                        }</span>
                      </div>
                      <input type="date"
                        value=${form.expiryDate}
                        onInput=${(e) => setForm({ ...form, expiryDate: e.target.value })}
                        style=${{ position: "absolute", opacity: 0, inset: 0, width: "100%", height: "100%", cursor: "pointer" }}
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <span className="mrd-mlbl" style=${{ marginBottom: 6 }}>Note</span>
                  <input
                    style=${{ ...INP_INNER, width: "100%", boxSizing: "border-box" }}
                    placeholder="Magasin, marque, variété…"
                    value=${form.note}
                    onInput=${(e) => setForm({ ...form, note: e.target.value })}
                  />
                </div>

              </div>
            ` : null}

            <!-- 4. Barre d'actions : Annuler | En stock | Fini / Épuisé | Ajouter -->
            <div style=${{ display: "flex", gap: 6, marginTop: 4 }}>
              <button type="button" onClick=${closeModal}
                style=${{ flex: 1, padding: "11px 4px", borderRadius: 12, border: "1.5px solid var(--mrd-border)", background: "transparent", fontSize: 12, fontWeight: 600, color: "var(--mrd-fg2)", cursor: "pointer", fontFamily: "inherit", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Annuler
              </button>
              ${[{ v: "in_stock", label: "En stock" }, { v: "empty", label: "Fini / Épuisé" }].map(({ v, label }) => {
                const on = form.stockState === v;
                return html`
                  <button key=${v} type="button"
                    onClick=${() => setForm({ ...form, stockState: v })}
                    style=${{
                      flex: 1, padding: "11px 4px", borderRadius: 12,
                      fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer",
                      background: on ? "var(--mrd-aLt)" : "var(--mrd-surf2)",
                      color: on ? "var(--mrd-a)" : "var(--mrd-fg2)",
                      border: "1px solid " + (on ? "var(--mrd-aMd)" : "var(--mrd-borderSoft)"),
                      transition: "all 0.12s", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                    ${label}
                  </button>
                `;
              })}
              <button type="submit"
                style=${{ flex: 1.5, padding: "11px 4px", borderRadius: 12, border: "none", background: "var(--mrd-a)", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                ${editingItemId ? "Enregistrer" : "Ajouter"}
              </button>
            </div>

          </form>
        </div>
      </div>
    `;
  }

  // ─── render: bulk action bar ──────────────────────────────────
  function renderBulkBar() {
    if (!selectionMode) return null;
    const count = selectedIds.length;
    const actionCount = organiserMode ? 4 : 3;
    return html`
      <div className="inv-bulkbar">
        <div className="inv-bulkbar-top">
          <span className="inv-bulkbar-count">
            ${count} sÃ©lectionnÃ©${count > 1 ? "s" : ""}
          </span>
          <button type="button" className="inv-bulkbar-cancel" onClick=${exitSelectionMode}>
            Annuler
          </button>
        </div>
        <div className="inv-bulkbar-actions" style=${{ gridTemplateColumns: `repeat(${actionCount}, minmax(0, 1fr))` }}>
          ${organiserMode ? html`
            <button type="button" className="inv-bulkbar-btn" onClick=${bulkMove} disabled=${!count}>DÃ©placer</button>
          ` : null}
          <button type="button" className="inv-bulkbar-btn inv-bulkbar-btn-primary" onClick=${bulkShopping} disabled=${!count}>Ã€ racheter</button>
          <button type="button" className="inv-bulkbar-btn" onClick=${bulkFinished} disabled=${!count}>Fini</button>
          <button type="button" className="inv-bulkbar-btn inv-bulkbar-btn-danger" onClick=${bulkDelete} disabled=${!count}>Supprimer</button>
        </div>
      </div>
    `;
    return html`
      <div className="inv-bulkbar">
        <div className="inv-bulkbar-top">
          <span className="inv-bulkbar-count">
          ${count} sélectionné${count > 1 ? "s" : ""}
          </span>
          <button type="button" className="inv-bulkbar-cancel" onClick=${exitSelectionMode}>
            Annuler
          </button>
        </div>
        <div className="inv-bulkbar-actions" style=${{ gridTemplateColumns: `repeat(${actionCount}, minmax(0, 1fr))` }}>
        ${organiserMode ? html`
          <button type="button" className="inv-bulkbar-btn" onClick=${bulkMove} disabled=${!count}
            style=${{ ...ACT, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none" }}>Déplacer</button>
        ` : null}
        <button type="button" className="inv-bulkbar-btn inv-bulkbar-btn-primary" onClick=${bulkShopping} disabled=${!count}
          style=${{ ...ACT, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none" }}>À racheter</button>
        <button type="button" className="inv-bulkbar-btn" onClick=${bulkFinished} disabled=${!count}
          style=${{ ...ACT, background: "rgba(255,255,255,0.12)", color: "#fff", border: "none" }}>Fini</button>
        <button type="button" className="inv-bulkbar-btn inv-bulkbar-btn-danger" onClick=${bulkDelete} disabled=${!count}
          style=${{ ...ACT, background: "var(--mrd-dangerLt)", color: "var(--mrd-danger)", border: "none" }}>Supprimer</button>
        </div>
      </div>
    `;
  }

  // ─── main render ──────────────────────────────────────────────
  return html`
    <section className="rwrap" onClick=${handleSectionClick}>
      ${renderTabBar()}
      ${renderLocationEditor()}
      <div style=${{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "stretch", marginBottom: 10 }}>
        <div style=${{ position: "relative", minWidth: 0 }}>
          <span style=${{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "var(--mrd-fg3)", pointerEvents: "none" }}>🔍</span>
          <input
            style=${{ ...FORM_INP, paddingLeft: 32, paddingTop: 9, paddingBottom: 9, height: 42, borderColor: search ? "var(--mrd-a)" : "var(--mrd-border)" }}
            placeholder="Rechercher..."
            value=${search}
            onInput=${(e) => setSearch(e.target.value)}
          />
        </div>

        <div style=${{ position: "relative", flexShrink: 0 }}>
          <button type="button"
            onClick=${(e) => { e.stopPropagation(); setShowSort((v) => !v); }}
            style=${{
              height: 42,
              padding: "0 13px", borderRadius: 12, fontSize: 12, fontWeight: 600,
              fontFamily: "inherit", cursor: "pointer",
              border: "1.5px solid var(--mrd-border)",
              background: showSort ? "var(--mrd-surf3)" : "var(--mrd-surf2)", color: "var(--mrd-fg2)",
              display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
            }}>
            ${SORT_OPTIONS.find((s) => s.value === sortMode)?.label || "A → Z"}
          </button>
          ${showSort ? html`
            <div style=${{
              position: "absolute", right: 0, top: 46,
              background: "var(--mrd-surf)", border: "1px solid var(--mrd-border)",
              borderRadius: 13, padding: "4px 0", minWidth: 150, zIndex: 60,
              boxShadow: "0 8px 24px oklch(27% 0.05 48 / 0.14)",
            }}>
              ${SORT_OPTIONS.map((opt) => html`
                <button key=${opt.value} type="button"
                  onClick=${(e) => { e.stopPropagation(); setSortMode(opt.value); setShowSort(false); }}
                  style=${{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "10px 14px", background: sortMode === opt.value ? "var(--mrd-aLt)" : "none",
                    border: "none", fontSize: 13,
                    fontWeight: sortMode === opt.value ? 700 : 500,
                    color: sortMode === opt.value ? "var(--mrd-a)" : "var(--mrd-fg)",
                    cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  }}>
                  ${sortMode === opt.value ? "✓ " : "  "}${opt.label}
                </button>
              `)}
            </div>
          ` : null}
        </div>
      </div>

      ${renderSelectedLocationHeading()}

      ${activeLocation ? html`
        ${visibleExpiringCount > 0 ? html`
          <div style=${{ marginBottom: 6 }}>
            <span style=${{ background: "var(--mrd-dangerLt)", color: "var(--mrd-danger)", borderRadius: 6, padding: "2px 8px", fontWeight: 700, fontSize: 11 }}>
              ⚠ ${visibleExpiringCount} expirant${visibleExpiringCount > 1 ? "s" : ""}
            </span>
          </div>
        ` : null}
      ` : html`
        <div style=${{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <div style=${{ display: "flex", alignItems: "center", gap: 8, flex: 1, flexWrap: "wrap", minWidth: 0 }}>
            <span style=${{ fontSize: 13, color: "var(--mrd-fg3)", fontWeight: 500 }}>
              ${visibleActiveCount} article${visibleActiveCount !== 1 ? "s" : ""}
            </span>
            ${visibleExpiringCount > 0 ? html`
              <span style=${{ background: "var(--mrd-dangerLt)", color: "var(--mrd-danger)", borderRadius: 6, padding: "1px 7px", fontWeight: 700, fontSize: 11 }}>
                ⚠ ${visibleExpiringCount} expirant${visibleExpiringCount > 1 ? "s" : ""}
              </span>
            ` : null}
          </div>
          ${selectionMode ? html`
            <button type="button"
              onClick=${(e) => { e.stopPropagation(); exitSelectionMode(); }}
              style=${{ padding: "5px 11px", borderRadius: 9, fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: "var(--mrd-fg)", color: "#fff", border: "none", minHeight: 32 }}>
              Annuler
            </button>
          ` : html`
            <button type="button"
              onClick=${(e) => { e.stopPropagation(); setSelectionMode(true); setSelectedIds([]); }}
              style=${{ padding: "5px 11px", borderRadius: 9, fontSize: 12, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", background: "none", color: "var(--mrd-fg3)", border: "1px solid var(--mrd-borderSoft)", minHeight: 32 }}>
              Sélectionner
            </button>
          `}
        </div>
      `}

      ${renderItemSection(activeItems, false)}

      ${!activeItems.length && !finishedItems.length ? html`
        <div style=${{ textAlign: "center", padding: "40px 16px", color: "var(--mrd-fg3)" }}>
          <div style=${{ fontSize: 36, marginBottom: 10 }}>📦</div>
          <div style=${{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
            ${search ? "Aucun résultat" : effectiveTab === "unassigned" ? "Tout est rangé ✓" : "Inventaire vide"}
          </div>
          <div style=${{ fontSize: 12 }}>
            ${search ? "Essayez un autre mot-clé" : "Appuyez sur + pour commencer"}
          </div>
        </div>
      ` : null}

      ${finishedItems.length ? html`
        <div style=${{ marginTop: activeItems.length ? 16 : 0 }}>
          ${renderItemSection(finishedItems, true)}
        </div>
      ` : null}

      ${safeInventory.length > 0 ? html`
        <div style=${{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button type="button"
            onClick=${onClearAllInventory}
            style=${{ fontSize: 11, color: "var(--mrd-fg3)", background: "none", border: "1px solid var(--mrd-borderSoft)", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontWeight: 500 }}>
            Vider l'inventaire
          </button>
        </div>
      ` : null}

      ${renderModal()}
      ${renderRangerPicker()}
      ${renderStorageEmojiPicker()}
      ${(() => {
        if (!selectionMode) return null;
        const count = selectedIds.length;
        const actionCount = organiserMode ? 4 : 3;
        return html`
          <div className="inv-bulkbar">
            <div className="inv-bulkbar-top">
              <span className="inv-bulkbar-count">
                ${count} ${`s\u00E9lectionn\u00E9${count > 1 ? "s" : ""}`}
              </span>
              <button type="button" className="inv-bulkbar-cancel" onClick=${exitSelectionMode}>
                Annuler
              </button>
            </div>
            <div className="inv-bulkbar-actions" style=${{ gridTemplateColumns: `repeat(${actionCount}, minmax(0, 1fr))` }}>
              ${organiserMode ? html`
                <button type="button" className="inv-bulkbar-btn" onClick=${bulkMove} disabled=${!count}>${`D\u00E9placer`}</button>
              ` : null}
              <button type="button" className="inv-bulkbar-btn inv-bulkbar-btn-primary" onClick=${bulkShopping} disabled=${!count}>${`\u00C0 racheter`}</button>
              <button type="button" className="inv-bulkbar-btn" onClick=${bulkFinished} disabled=${!count}>Fini</button>
              <button type="button" className="inv-bulkbar-btn inv-bulkbar-btn-danger" onClick=${bulkDelete} disabled=${!count}>Supprimer</button>
            </div>
          </div>
        `;
      })()}

      <button className="mrd-fab" onClick=${openCreateModal} title="Ajouter un article">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
        </svg>
      </button>
    </section>
  `;
}

import { html, useEffect, useMemo, useState, useRef } from "../../lib.js";
import { daysUntilExpiry, getCurrentAppDate } from "../../utils/date.js";
import { findSimilarItem, formatQuantityUnit, normalizeProductName, suggestItems } from "../../utils/productUtils.js";
import { EmojiPicker } from "../tasks/EmojiPicker.js";
import { MrdModal } from "../../components/MrdModal.js";

// ─── constants ────────────────────────────────────────────────────

const UNITS = [
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

const CHIP_LONG_PRESS_MS = 480;

// ─── helpers ──────────────────────────────────────────────────────

function todayKey() {
  const now = getCurrentAppDate();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptyForm() {
  return { name: "", quantity: "", unit: "", purchaseDate: todayKey(), expiryDate: "", price: "", note: "", stockState: "in_stock", storageLocationId: "" };
}

function compareByName(a, b) {
  return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity: "base" });
}

// Pastille DLC de la ligne produit — seulement si dlc ≤ 21 j (README « Ligne
// produit »), quatre cas distincts par couleur et par texte.
function expiryPillInfo(expiryDate) {
  const d = daysUntilExpiry(expiryDate);
  if (d === null || d > 21) return null;
  if (d < 0) return { text: `Dépassé de ${Math.abs(d)} j`, color: "var(--mrd-invDangerText)", bg: "var(--mrd-invDangerBg)" };
  if (d === 0) return { text: "Expire aujourd'hui", color: "var(--mrd-invDangerText)", bg: "var(--mrd-invDangerBg)" };
  if (d <= 7) return { text: `Expire dans ${d} j`, color: "var(--mrd-amber)", bg: "var(--mrd-invAmberBg)" };
  return { text: `DLC dans ${d} j`, color: "var(--mrd-fg2)", bg: "var(--mrd-surf2)" };
}

// Le pas du compteur dépend de l'unité (README « compteur de quantité ») :
// g/ml se comptent par 50, cl par 25, tout le reste (unité, kg, l…) par 1.
function quantityStep(unit) {
  const u = String(unit || "").trim();
  if (u === "g" || u === "ml") return 50;
  if (u === "cl") return 25;
  return 1;
}

// Libellé compact du compteur — "unité" s'abrège en "u." dans ce contexte
// serré, contrairement à formatQuantityUnit() utilisé ailleurs dans l'app.
function stepperQtyLabel(item) {
  const q = String(item?.quantity ?? "").trim();
  const u = String(item?.unit || "").trim();
  if (!q) return "0";
  if (!u) return q;
  if (u === "unité") return `${q} u.`;
  return `${q} ${u}`;
}

function sortItems(arr, sortMode) {
  const items = [...arr];
  if (sortMode === "alpha") return items.sort(compareByName);
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

// Recherche souple : minuscules + sans accents, pas de dépluriel (contrairement
// à normalizeProductName) — un nom de rangement ne s'accorde pas comme un produit.
function searchKey(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function safeAreaBottom() {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:-9999px;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px)";
  document.body.appendChild(probe);
  const inset = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(inset) ? inset : 0;
}

// Estime la hauteur de la feuille de rangement pour caler le palier
// d'ouverture de la feuille (voir MrdModal). Approximatif par nature : la
// grille de tuiles défile déjà en interne (max-height), donc le nombre de
// rangements ne fait grossir la feuille que jusqu'à ce plafond.
function rangerSheetHeight({ hasMemoryCard, locationCount, wideGrid, showCreate, noLocations }) {
  const blocks = [46]; // en-tête (vignette + titre, ou titre seul en bulk)
  if (hasMemoryCard) blocks.push(62); // carte mémoire
  if (noLocations) {
    blocks.push(20); // « Tu n'as pas encore de rangement. »
  } else {
    const cap = wideGrid ? 340 : 168;
    const cols = wideGrid ? 1 : 2;
    const rows = Math.max(1, Math.ceil(Math.max(1, locationCount) / cols));
    const gridHeight = Math.min(cap, rows * 52 + (rows - 1) * 8);
    blocks.push(20 + 42 + 8 + gridHeight); // bloc liste : padding + recherche + grille
    blocks.push(44); // rangée « Nouveau rangement » / « Sans rangement »
  }
  if (showCreate || noLocations) blocks.push(74); // création de rangement dépliée
  blocks.push(50 + 8 + 42); // pied : bouton plein + Annuler
  const gaps = (blocks.length - 1) * 14;
  return blocks.reduce((sum, h) => sum + h, 0) + gaps + 32; // padding haut + bas de la feuille
}

// Estime la hauteur de la feuille d'ajout pour caler son palier d'ouverture
// (voir MrdModal) — sans ça elle s'ouvre au défaut 0.92 quel que soit son
// contenu, laissant un grand vide sous un formulaire court.
function addSheetHeight({ hasDup, hasLocs, showDetails }) {
  const blocks = [22, 66]; // en-tête (surtitre + ✕), champ nom
  if (hasDup) blocks.push(56);
  blocks.push(40 + 30); // compteur quantité + rangée d'unités
  if (hasLocs) blocks.push(32);
  blocks.push(34); // deux bascules
  if (showDetails) blocks.push(116);
  blocks.push(48); // bouton plein
  const gaps = (blocks.length - 1) * 14;
  return blocks.reduce((sum, h) => sum + h, 0) + gaps + 32;
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
  onSetOrganiserMode = () => {},
  externalOpenCreate = 0,
}) {
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const productIndex = Array.isArray(knownProducts) && knownProducts.length ? knownProducts : safeInventory;
  const safeLocations = Array.isArray(storageLocations) ? storageLocations : [];
  const safeMemory = productLocationMemory && typeof productLocationMemory === "object" ? productLocationMemory : {};

  // search + sort — cycle au tap : A → Z, Récent, Péremption, Prix
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState("alpha");

  // modal (feuille d'ajout / édition)
  const [showModal, setShowModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [form, setForm] = useState(emptyForm());
  const [similarWarning, setSimilarWarning] = useState(null);
  const [bypassSimilar, setBypassSimilar] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showExtraFields, setShowExtraFields] = useState(false);

  // interrupteur « Ranger par emplacement », chip actif, filtre péremption,
  // ligne dépliée (une seule à la fois) et bloc « Produits finis »
  const [activeChip, setActiveChip] = useState("all");
  const [expiryFilterOn, setExpiryFilterOn] = useState(false);
  const [invOpen, setInvOpen] = useState("");
  const [finishedOpen, setFinishedOpen] = useState(false);

  // gestion des rangements depuis les chips (⋮ = appui long, + = création)
  const [chipMenuId, setChipMenuId] = useState("");
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
  const [rangerShowCreate, setRangerShowCreate] = useState(false);
  const rangerSearchRef = useRef(null);

  // selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // kebab menu (per item)
  const [openMenuId, setOpenMenuId] = useState("");

  const previousOrganiserMode = useRef(organiserMode);
  const unassignedCount = safeInventory.filter((i) => !i.storageLocationId && i.stockState !== "empty").length;

  // derived
  const hasUnassignedChip = unassignedCount > 0;
  const activeLocation = safeLocations.find((location) => location.id === activeChip) || null;
  const effectiveChip = activeLocation
    ? activeLocation.id
    : activeChip === "unassigned" && hasUnassignedChip
      ? "unassigned"
      : "all";

  const rangerItem = rangerItemId ? safeInventory.find((i) => i.id === rangerItemId) : null;
  const memoryLocId = rangerItem ? safeMemory[normalizeProductName(rangerItem.name || "")] : null;
  const memoryLoc = memoryLocId ? safeLocations.find((l) => l.id === memoryLocId) : null;

  // Le rangement mémorisé a déjà sa propre carte au-dessus : il ne
  // réapparaît pas dans la grille (sauf en sélection multiple, où la carte
  // mémoire ne s'affiche pas).
  const rangerLocationsBase = safeLocations.filter((l) => bulkRangerMode || !memoryLoc || l.id !== memoryLoc.id);
  const rangerSearchKey = searchKey(rangerSearch);
  const rangerFilteredLocations = rangerSearchKey
    ? rangerLocationsBase.filter((l) => searchKey(getStorageLocationDisplay(l).name || l.name).includes(rangerSearchKey))
    : rangerLocationsBase;
  const rangerNoMatch = Boolean(rangerSearchKey) && rangerFilteredLocations.length === 0;
  const rangerWideGrid = rangerLocationsBase.some((l) => (getStorageLocationDisplay(l).name || l.name || "").length > 16);
  const rangerNoLocations = safeLocations.length === 0;
  const rangerEffectiveShowCreate = rangerShowCreate || rangerNoLocations;

  // Deux paliers (création dépliée ou non) : une feuille ion-modal fige sa
  // liste de paliers à l'ouverture, donc les deux doivent y être d'avance
  // pour que « + Nouveau rangement » puisse agrandir la feuille en place.
  const rangerBreakpointFor = (showCreate) => {
    const viewport = (typeof window !== "undefined" && window.innerHeight) || 812;
    const wanted = (rangerSheetHeight({
      hasMemoryCard: Boolean(memoryLoc) && !bulkRangerMode,
      locationCount: rangerLocationsBase.length,
      wideGrid: rangerWideGrid,
      showCreate,
      noLocations: rangerNoLocations,
    }) + safeAreaBottom()) / viewport;
    return Math.min(0.9, Math.max(0.3, Math.round(wanted * 1000) / 1000));
  };
  const rangerSheetBreakpoints = useMemo(() => {
    if (!rangerItemId) return [0.5];
    return [...new Set([rangerBreakpointFor(false), rangerBreakpointFor(true)])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangerItemId, memoryLoc, bulkRangerMode, rangerLocationsBase.length, rangerWideGrid, rangerNoLocations]);
  const rangerSheetBreakpoint = rangerEffectiveShowCreate
    ? Math.max(...rangerSheetBreakpoints)
    : rangerSheetBreakpoints[0];

  // Ordre du pipeline (README « Comportement ») : chip → recherche →
  // péremption → tri. Chaque étage ne touche pas aux données, seuls le
  // compteur, Fini, En stock et la feuille d'ajout écrivent.
  const chipFilteredInventory = useMemo(() => {
    if (!organiserMode || effectiveChip === "all") return safeInventory;
    if (effectiveChip === "unassigned") return safeInventory.filter((i) => !i.storageLocationId);
    return safeInventory.filter((i) => i.storageLocationId === effectiveChip);
  }, [safeInventory, organiserMode, effectiveChip]);

  const searchedInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? chipFilteredInventory.filter((i) => String(i.name || "").toLowerCase().includes(q)) : chipFilteredInventory;
  }, [chipFilteredInventory, search]);

  const finishedItems = useMemo(
    () => sortItems(searchedInventory.filter((i) => i.stockState === "empty"), sortMode),
    [searchedInventory, sortMode],
  );
  const activeBeforeExpiry = useMemo(
    () => searchedInventory.filter((i) => i.stockState !== "empty"),
    [searchedInventory],
  );
  const expiringItems = useMemo(() => activeBeforeExpiry
    .filter((item) => { const d = daysUntilExpiry(item.expiryDate); return d !== null && d <= 7; })
    .sort((a, b) => (daysUntilExpiry(a.expiryDate) ?? 9999) - (daysUntilExpiry(b.expiryDate) ?? 9999)),
  [activeBeforeExpiry]);
  const activeItems = useMemo(
    () => sortItems(expiryFilterOn ? expiringItems : activeBeforeExpiry, sortMode),
    [activeBeforeExpiry, expiringItems, expiryFilterOn, sortMode],
  );
  const visibleActiveCount = activeBeforeExpiry.length;
  const mostUrgentExpiring = expiringItems[0] || null;

  useEffect(() => {
    if (previousOrganiserMode.current && !organiserMode) {
      setActiveChip("all");
      setChipMenuId("");
      setInvOpen("");
    }
    previousOrganiserMode.current = organiserMode;
  }, [organiserMode]);

  // Au-dessus de ~12 rangements, le focus part dans la recherche à
  // l'ouverture ; en dessous, le clavier masquerait les tuiles pour rien.
  useEffect(() => {
    if (!rangerItemId || rangerNoLocations) return;
    if (rangerLocationsBase.length <= 12) return;
    const id = setTimeout(() => rangerSearchRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [rangerItemId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeChip === "unassigned" && !hasUnassignedChip) {
      setActiveChip("all");
    }
  }, [activeChip, hasUnassignedChip]);

  // global click handler to close menus
  function handleSectionClick() {
    if (showStorageEmojiPicker) return;
    if (openMenuId) setOpenMenuId("");
    if (chipMenuId) setChipMenuId("");
    if (showAddLocInput) { setShowAddLocInput(false); setAddLocInputValue(""); setAddLocEmoji(""); }
  }

  // ─── tri, chips, filtre péremption, ligne dépliée ──────────────
  function cycleSortMode() {
    const idx = SORT_OPTIONS.findIndex((o) => o.value === sortMode);
    setSortMode(SORT_OPTIONS[(idx + 1) % SORT_OPTIONS.length].value);
  }
  function selectChip(chipId) {
    setActiveChip(chipId);
    setInvOpen("");
  }
  function toggleLocationsOn() {
    onSetOrganiserMode(!organiserMode);
    setInvOpen("");
  }
  function toggleExpiryFilter() {
    setExpiryFilterOn((v) => !v);
    setInvOpen("");
  }
  function toggleInvOpen(itemId) {
    setInvOpen((current) => (current === itemId ? "" : itemId));
  }

  // ─── modal handlers ───────────────────────────────────────────
  function openCreateModal() {
    setEditingItemId("");
    setForm({ ...emptyForm(), storageLocationId: activeLocation ? activeLocation.id : "" });
    setSimilarWarning(null);
    setBypassSimilar(false); setSuggestions([]); setShowExtraFields(false); setShowModal(true);
  }

  // FAB « + » posé au niveau de la page (App.js, hors d'ion-content) pour
  // rester fixe à l'écran plutôt que de défiler avec la liste — il ne peut
  // donc pas appeler openCreateModal() directement, d'où ce compteur externe
  // (même mécanique que le FAB des tâches).
  const lastExternalOpenCreateRef = useRef(externalOpenCreate);
  useEffect(() => {
    if (externalOpenCreate > lastExternalOpenCreateRef.current) openCreateModal();
    lastExternalOpenCreateRef.current = externalOpenCreate;
  }, [externalOpenCreate]); // eslint-disable-line react-hooks/exhaustive-deps
  function openEditModal(item) {
    setOpenMenuId("");
    setEditingItemId(item.id);
    setForm({
      name: item.name || "", quantity: item.quantity || "", unit: item.unit || "",
      purchaseDate: item.purchaseDate || todayKey(), expiryDate: item.expiryDate || "",
      price: item.price || "", note: item.note || "",
      stockState: item.stockState === "empty" ? "empty" : "in_stock",
      storageLocationId: item.storageLocationId || "",
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
      storageLocationId: form.storageLocationId || "",
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
    if (selectionMode) { toggleSelect(item.id); return; }
    toggleInvOpen(item.id);
  }
  function decrementItemQuantity(item) {
    const currentQty = parseFloat(String(item.quantity || "0").replace(",", "."));
    const base = Number.isFinite(currentQty) ? currentQty : 0;
    if (base <= 0) return;
    const nextQty = Math.max(0, Math.round((base - quantityStep(item.unit)) * 100) / 100);
    if (nextQty <= 0) {
      onUpdateInventoryItem(item.id, { quantity: "0", stockState: "empty", needsRestock: true });
      setInvOpen("");
    } else {
      onUpdateInventoryItem(item.id, { quantity: String(nextQty) });
    }
  }
  function incrementItemQuantity(item) {
    const currentQty = parseFloat(String(item.quantity || "0").replace(",", "."));
    const base = Number.isFinite(currentQty) ? currentQty : 0;
    const nextQty = Math.round((base + quantityStep(item.unit)) * 100) / 100;
    onUpdateInventoryItem(item.id, { quantity: String(nextQty) });
  }
  function markItemFinished(item) {
    onUpdateInventoryItem(item.id, { stockState: "empty", needsRestock: true });
    setInvOpen("");
  }
  function markItemInStock(item) {
    onUpdateInventoryItem(item.id, { stockState: "in_stock", needsRestock: false });
  }
  function sendItemToShopping(item) {
    onSendInventoryToShopping(item.id);
    setInvOpen("");
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
    setRangerShowCreate(false);
    setRangerSelectedLocId(null);
  }

  // ─── ranger handlers ──────────────────────────────────────────
  function openRanger(itemId) {
    const item = safeInventory.find((i) => i.id === itemId);
    const itemMemoryLocId = item ? safeMemory[normalizeProductName(item.name || "")] : null;
    setRangerItemId(itemId);
    setRangerNewLocName("");
    setRangerNewLocEmoji("");
    setBulkRangerMode(false);
    setRangerSearch("");
    setRangerShowCreate(false);
    // La mémoire est présélectionnée quand l'article n'a pas déjà un
    // rangement à lui : sinon on écraserait un choix déjà fait.
    setRangerSelectedLocId(item ? (item.storageLocationId || itemMemoryLocId || null) : null);
  }
  function closeRanger() {
    setRangerItemId("");
    setRangerNewLocName("");
    setRangerNewLocEmoji("");
    setBulkRangerMode(false);
    setShowStorageEmojiPicker("");
    setRangerSearch("");
    setRangerShowCreate(false);
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

  // ─── gestion des rangements (chips) ────────────────────────────
  // Pas dans la maquette : appui long sur une chip ouvre un petit popover
  // renommer/supprimer, pour ne pas perdre cette gestion qui existait via
  // le ⋮ de l'ancien onglet actif.
  const chipLpTimer = useRef(null);
  const chipLpFired = useRef(null);
  function handleChipTouchStart(locId) {
    chipLpFired.current = false;
    clearTimeout(chipLpTimer.current);
    chipLpTimer.current = setTimeout(() => {
      chipLpFired.current = locId;
      setChipMenuId(locId);
    }, CHIP_LONG_PRESS_MS);
  }
  function handleChipTouchEnd() {
    clearTimeout(chipLpTimer.current);
  }
  function submitAddLoc() {
    if (!addLocInputValue.trim()) return;
    const parsed = splitStorageLocationLabel(addLocInputValue);
    const newId = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onAddStorageLocation({
      id: newId,
      name: parsed.name || addLocInputValue.trim(),
      emoji: String(addLocEmoji || parsed.emoji || "").trim(),
    });
    setAddLocInputValue(""); setAddLocEmoji(""); setShowAddLocInput(false);
    selectChip(newId);
  }
  function startRenameLoc(loc) {
    const display = getStorageLocationDisplay(loc);
    setChipMenuId("");
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
  function deleteChipLocation(id) {
    onDeleteStorageLocation(id);
    setChipMenuId("");
    if (effectiveChip === id) selectChip("all");
  }

  // ─── render: en-tête (titre, recherche+tri, interrupteur, chips) ──
  function renderChips() {
    if (!organiserMode) return null;
    return html`
      <div className="mrd-inv-chips">
        <button type="button" className=${`mrd-inv-chip${effectiveChip === "all" ? " mrd-inv-chip--on" : ""}`}
          aria-pressed=${effectiveChip === "all"} onClick=${() => selectChip("all")}>
          Tout
        </button>
        ${safeLocations.map((loc) => {
          const display = getStorageLocationDisplay(loc);
          const cnt = safeInventory.filter((i) => i.storageLocationId === loc.id && i.stockState !== "empty").length;
          const on = effectiveChip === loc.id;
          const isRenaming = renamingLocId === loc.id;
          return html`
            <div key=${loc.id} className="mrd-inv-chip-wrap">
              <button type="button" className=${`mrd-inv-chip${on ? " mrd-inv-chip--on" : ""}`}
                aria-pressed=${on}
                onClick=${() => { if (!chipLpFired.current) selectChip(loc.id); chipLpFired.current = ""; }}
                onTouchStart=${() => handleChipTouchStart(loc.id)}
                onTouchEnd=${handleChipTouchEnd}
                onTouchCancel=${handleChipTouchEnd}
                onMouseDown=${() => handleChipTouchStart(loc.id)}
                onMouseUp=${handleChipTouchEnd}
                onMouseLeave=${handleChipTouchEnd}
              >
                <span>${display.emoji || "📦"} ${display.name || loc.name}</span>
                ${cnt > 0 ? html`<span className="mrd-inv-chip-count">${cnt}</span>` : null}
              </button>
              ${chipMenuId === loc.id ? html`
                <div className="mrd-inv-chip-menu" onClick=${(e) => e.stopPropagation()}>
                  <button type="button" onClick=${() => startRenameLoc(loc)}>Renommer</button>
                  <button type="button" className="mrd-inv-chip-menu-danger" onClick=${() => deleteChipLocation(loc.id)}>Supprimer</button>
                </div>
              ` : null}
              ${isRenaming ? html`
                <div className="mrd-inv-chip-create" onClick=${(e) => e.stopPropagation()}>
                  <button type="button" className="mrd-inv-chip-create-emoji" onClick=${(e) => { e.stopPropagation(); setShowStorageEmojiPicker("editor"); }}>${renamingLocEmoji || "📦"}</button>
                  <input className="mrd-inv-chip-create-input" value=${renamingLocName}
                    onInput=${(e) => setRenamingLocName(e.target.value)}
                    onKeyDown=${(e) => { if (e.key === "Enter") submitRenameLoc(loc.id); if (e.key === "Escape") setRenamingLocId(""); }}
                    autoFocus />
                  <button type="button" className="mrd-inv-chip-create-ok" disabled=${!renamingLocName.trim()} onClick=${() => submitRenameLoc(loc.id)}>OK</button>
                  <button type="button" className="mrd-inv-chip-create-cancel" onClick=${() => { setRenamingLocId(""); setRenamingLocEmoji(""); setRenamingLocName(""); }}>✕</button>
                </div>
              ` : null}
            </div>
          `;
        })}
        ${hasUnassignedChip ? html`
          <button type="button" className=${`mrd-inv-chip${effectiveChip === "unassigned" ? " mrd-inv-chip--on" : ""}`}
            aria-pressed=${effectiveChip === "unassigned"} onClick=${() => selectChip("unassigned")}>
            <span>📍 Non rangé</span><span className="mrd-inv-chip-count">${unassignedCount}</span>
          </button>
        ` : null}
        ${showAddLocInput ? html`
          <div className="mrd-inv-chip-create" onClick=${(e) => e.stopPropagation()}>
            <button type="button" className="mrd-inv-chip-create-emoji" onClick=${(e) => { e.stopPropagation(); setShowStorageEmojiPicker("editor"); }}>${addLocEmoji || "📦"}</button>
            <input className="mrd-inv-chip-create-input" value=${addLocInputValue}
              onInput=${(e) => setAddLocInputValue(e.target.value)}
              onKeyDown=${(e) => { if (e.key === "Enter") submitAddLoc(); if (e.key === "Escape") setShowAddLocInput(false); }}
              placeholder="Nom du rangement…" autoFocus onClick=${(e) => e.stopPropagation()} />
            <button type="button" className="mrd-inv-chip-create-ok" disabled=${!addLocInputValue.trim()} onClick=${(e) => { e.stopPropagation(); submitAddLoc(); }}>OK</button>
            <button type="button" className="mrd-inv-chip-create-cancel" onClick=${(e) => { e.stopPropagation(); setShowAddLocInput(false); setAddLocInputValue(""); setAddLocEmoji(""); }}>✕</button>
          </div>
        ` : html`
          <button type="button" className="mrd-inv-chip-add"
            onClick=${(e) => { e.stopPropagation(); setAddLocInputValue(""); setAddLocEmoji(""); setShowAddLocInput(true); }}
            title="Créer un rangement" aria-label="Créer un rangement">+</button>
        `}
      </div>
    `;
  }

  function renderHeader() {
    return html`
      <div className="mrd-inv-header">
        <div className="mrd-inv-title-row">
          <span className="mrd-inv-title">Inventaire</span>
          <span className="mrd-inv-count">${visibleActiveCount} article${visibleActiveCount !== 1 ? "s" : ""}</span>
          ${selectionMode ? html`
            <button type="button" className="mrd-inv-select-btn mrd-inv-select-btn--cancel"
              onClick=${(e) => { e.stopPropagation(); exitSelectionMode(); }}>Annuler</button>
          ` : html`
            <button type="button" className="mrd-inv-select-btn"
              onClick=${(e) => { e.stopPropagation(); setSelectionMode(true); setSelectedIds([]); }}>Sélectionner</button>
          `}
        </div>
        <div className="mrd-inv-searchrow">
          <div className="mrd-inv-search">
            <span className="mrd-inv-search-icon">🔍</span>
            <input className="mrd-inv-search-input" value=${search}
              onInput=${(e) => setSearch(e.target.value)} placeholder="Rechercher un produit" />
          </div>
          <button type="button" className="mrd-inv-sort-btn" onClick=${cycleSortMode}>
            ${SORT_OPTIONS.find((o) => o.value === sortMode)?.label || "A → Z"}
          </button>
        </div>
        <button type="button" role="switch" aria-checked=${organiserMode}
          className=${`mrd-inv-switch-row${organiserMode ? " mrd-inv-switch-row--on" : ""}`}
          onClick=${toggleLocationsOn}>
          <span className="mrd-inv-switch-track"><span className="mrd-inv-switch-thumb"></span></span>
          <span className="mrd-inv-switch-label">Ranger par emplacement</span>
          <span className="mrd-inv-switch-state">${organiserMode ? "ACTIVÉ" : "DÉSACTIVÉ"}</span>
        </button>
        ${renderChips()}
      </div>
    `;
  }

  // ─── render: bandeau péremption (filtre, pas une liste) ────────
  function urgentExpirySubtitle() {
    if (!mostUrgentExpiring) return "";
    const d = daysUntilExpiry(mostUrgentExpiring.expiryDate);
    const phrase = d < 0 ? `est dépassé de ${Math.abs(d)} j` : d === 0 ? "expire aujourd'hui" : `expire dans ${d} j`;
    return `${mostUrgentExpiring.name} ${phrase}`;
  }
  function renderExpiryBanner() {
    if (!expiringItems.length && !expiryFilterOn) return null;
    return html`
      <button type="button" className=${`mrd-inv-expiry${expiryFilterOn ? " mrd-inv-expiry--on" : ""}`}
        onClick=${toggleExpiryFilter} aria-pressed=${expiryFilterOn}>
        <span className="mrd-inv-expiry-icon">⏰</span>
        <span className="mrd-inv-expiry-text">
          <span className="mrd-inv-expiry-title">${expiringItems.length} produit${expiringItems.length > 1 ? "s" : ""} à consommer cette semaine</span>
          <span className="mrd-inv-expiry-sub">${expiryFilterOn ? "Filtre actif sur la liste" : urgentExpirySubtitle()}</span>
        </span>
        <span className="mrd-inv-expiry-action">${expiryFilterOn ? "Retirer" : "Filtrer"}</span>
      </button>
    `;
  }

  // ─── render: ligne produit (une seule action visible : le compteur) ──
  function renderRow(item) {
    const isSelected = selectedIds.includes(item.id);
    const isOpen = invOpen === item.id;
    const menuOpen = openMenuId === item.id;
    const pill = expiryPillInfo(item.expiryDate);
    const locLabel = item.storageLocationId
      ? (getStorageLocationDisplay(safeLocations.find((l) => l.id === item.storageLocationId) || null).label || "")
      : "Non rangé";
    const meta = organiserMode
      ? (item.note ? `${locLabel} · ${item.note}` : locLabel)
      : (item.note || "");
    const numericQty = parseFloat(String(item.quantity ?? "").replace(",", "."));
    const canStep = Number.isFinite(numericQty);

    return html`
      <div key=${item.id} className=${`mrd-inv-row${isOpen ? " mrd-inv-row--open" : ""}${isSelected ? " mrd-inv-row--sel" : ""}`}>
        <div className="mrd-inv-row-top" onClick=${(e) => handleRowClick(e, item)} aria-expanded=${isOpen}>
          ${selectionMode ? html`
            <button type="button" className=${`ldv-chk inv-select-chk${isSelected ? " on" : ""}`}
              onClick=${(e) => { e.stopPropagation(); toggleSelect(item.id); }}>${isSelected ? "✓" : ""}</button>
          ` : null}
          <div className="mrd-inv-row-main">
            <span className="mrd-inv-row-name">${item.name}</span>
            ${meta ? html`<span className="mrd-inv-row-meta">${meta}</span>` : null}
            ${pill ? html`<span className="mrd-inv-row-pill" style=${{ color: pill.color, background: pill.bg }}>${pill.text}</span>` : null}
          </div>
          ${!selectionMode && canStep ? html`
            <div className="mrd-inv-counter" onClick=${(e) => e.stopPropagation()}>
              <button type="button" className="mrd-inv-counter-btn" onClick=${() => decrementItemQuantity(item)} aria-label=${`Moins de ${item.name}`}>−</button>
              <span className="mrd-inv-counter-val">${stepperQtyLabel(item)}</span>
              <button type="button" className="mrd-inv-counter-btn" onClick=${() => incrementItemQuantity(item)} aria-label=${`Plus de ${item.name}`}>+</button>
            </div>
          ` : null}
        </div>
        ${isOpen && !selectionMode ? html`
          <div className="mrd-inv-row-expand">
            <button type="button" className="mrd-inv-row-btn mrd-inv-row-btn--finish" onClick=${() => markItemFinished(item)}>Fini</button>
            <button type="button" className="mrd-inv-row-btn" onClick=${() => sendItemToShopping(item)}>À racheter</button>
            ${organiserMode ? html`<button type="button" className="mrd-inv-row-btn" onClick=${() => openRanger(item.id)}>Ranger</button>` : null}
            <div className="task-menu-wrap">
              <button type="button" className="mrd-inv-row-btn mrd-inv-row-btn--kebab"
                onClick=${(e) => { e.stopPropagation(); setOpenMenuId(menuOpen ? "" : item.id); }}>⋯</button>
              ${menuOpen ? html`
                <div className="task-menu-dropdown">
                  <button type="button" className="task-menu-item" onClick=${(e) => { e.stopPropagation(); openEditModal(item); }}>Modifier</button>
                  <button type="button" className="task-menu-item task-menu-item-danger"
                    onClick=${(e) => { e.stopPropagation(); onDeleteInventoryItem(item.id); setOpenMenuId(""); }}>Supprimer</button>
                </div>
              ` : null}
            </div>
          </div>
        ` : null}
      </div>
    `;
  }

  // ─── render: bloc « Produits finis » (replié par défaut) ──────
  function renderFinishedBlock() {
    if (!finishedItems.length) return null;
    return html`
      <div className="mrd-inv-finished">
        <button type="button" className="mrd-inv-finished-head" onClick=${() => setFinishedOpen((v) => !v)}>
          <span>Produits finis · ${finishedItems.length}</span>
          <span className="mrd-inv-finished-caret">${finishedOpen ? "▲" : "▼"}</span>
        </button>
        ${finishedOpen && typeof onClearFinishedInventory === "function" ? html`
          <button type="button" className="mrd-inv-finished-clear" onClick=${onClearFinishedInventory}>Vider</button>
        ` : null}
        ${finishedOpen ? finishedItems.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          return html`
            <div key=${item.id} className="mrd-inv-finished-row">
              ${selectionMode ? html`
                <button type="button" className=${`ldv-chk inv-select-chk${isSelected ? " on" : ""}`}
                  onClick=${() => toggleSelect(item.id)}>${isSelected ? "✓" : ""}</button>
              ` : null}
              <span className="mrd-inv-finished-name">${item.name}</span>
              <button type="button" className="mrd-inv-finished-btn" onClick=${() => markItemInStock(item)}>En stock</button>
              <button type="button" className="mrd-inv-finished-btn mrd-inv-finished-btn--restock" onClick=${() => sendItemToShopping(item)}>À racheter</button>
            </div>
          `;
        }) : null}
      </div>
    `;
  }

  // ─── render: état vide (5 variantes, README « Vide ») ──────────
  function renderEmptyState() {
    if (activeItems.length || finishedItems.length) return null;
    let glyph = "📦", title = "Inventaire vide", sub = "Ajoute tes produits pour suivre ton stock.", showAdd = true;
    if (search) { glyph = "🔍"; title = "Aucun résultat"; sub = "Essaie un autre mot-clé."; showAdd = false; }
    else if (expiryFilterOn) { glyph = "✅"; title = "Rien à consommer d'urgence"; sub = "Aucune date de péremption proche."; showAdd = false; }
    else if (effectiveChip === "unassigned") { glyph = "✅"; title = "Tout est rangé ✓"; sub = "Tous tes articles ont un emplacement."; showAdd = false; }
    else if (effectiveChip !== "all") { glyph = "📦"; title = "Rangement vide"; sub = "Aucun produit ici pour le moment."; showAdd = true; }
    return html`
      <div className="mrd-inv-empty">
        <span className="mrd-inv-empty-glyph">${glyph}</span>
        <span className="mrd-inv-empty-title">${title}</span>
        <span className="mrd-inv-empty-sub">${sub}</span>
        ${showAdd ? html`<button type="button" className="mrd-inv-empty-btn" onClick=${openCreateModal}>+ Ajouter un article</button>` : null}
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
    const selectedLoc = rangerSelectedLocId ? safeLocations.find((l) => l.id === rangerSelectedLocId) : null;
    const selectedLocName = selectedLoc ? (getStorageLocationDisplay(selectedLoc).name || selectedLoc.name) : "";
    const submitLabel = !canConfirm
      ? (bulkRangerMode ? `Ranger ${rangerCount} article${rangerCount > 1 ? "s" : ""}` : "Ranger")
      : bulkRangerMode
        ? `Ranger ${rangerCount} article${rangerCount > 1 ? "s" : ""} dans « ${selectedLocName} »`
        : `Ranger dans « ${selectedLocName} »`;

    const searchTrimmed = rangerSearch.trim();
    const showCreateAsSearch = Boolean(searchTrimmed) && rangerNoMatch;

    function renderCreateFields(insideEmptyState) {
      return html`
        <div className="mrd-ranger-create">
          <div className="mrd-ranger-create-row">
            <button type="button" className="mrd-ranger-create-emoji"
              onClick=${() => setShowStorageEmojiPicker("ranger")}
              title="Choisir un emoji">
              ${rangerNewLocEmoji || "＋"}
            </button>
            <input
              className="mrd-ranger-create-input"
              value=${rangerNewLocName}
              onInput=${(e) => setRangerNewLocName(e.target.value)}
              onKeyDown=${(e) => {
                if (e.key === "Enter") createAndAssign();
                if (e.key === "Escape" && !insideEmptyState) {
                  setRangerShowCreate(false);
                  setRangerNewLocName("");
                  setRangerNewLocEmoji("");
                }
              }}
              placeholder="Nom du rangement…"
              autoFocus
            />
            <button type="button" className="mrd-ranger-create-ok"
              disabled=${!rangerNewLocName.trim()}
              onClick=${createAndAssign}>
              OK
            </button>
            ${insideEmptyState ? null : html`
              <button type="button" className="mrd-ranger-create-cancel"
                onClick=${() => { setRangerShowCreate(false); setRangerNewLocName(""); setRangerNewLocEmoji(""); }}
                aria-label="Annuler la création">
                ✕
              </button>
            `}
          </div>
        </div>
      `;
    }

    return html`
      <${MrdModal}
        isOpen=${true}
        onClose=${closeRanger}
        sheet=${true}
        sheetBreakpoint=${rangerSheetBreakpoint}
        sheetBreakpoints=${rangerSheetBreakpoints}
        className="mrd-ranger-modal"
      >
        <div className="mrd-ranger" aria-label=${bulkRangerMode ? `Ranger ${rangerCount} articles` : "Ranger un produit"}>

          <div className="mrd-ranger-head">
            ${bulkRangerMode ? null : html`<span className="mrd-ranger-thumb">📦</span>`}
            <span className="mrd-ranger-titles">
              ${bulkRangerMode || metaLine ? html`
                <span className="mrd-ranger-eyebrow">
                  ${bulkRangerMode ? `${rangerCount} article${rangerCount > 1 ? "s" : ""} sélectionné${rangerCount > 1 ? "s" : ""}` : metaLine}
                </span>
              ` : null}
              <span className="mrd-ranger-title">
                ${bulkRangerMode ? `Ranger ${rangerCount} article${rangerCount > 1 ? "s" : ""}` : `Ranger « ${rangerItem?.name || ""} »`}
              </span>
            </span>
            <button type="button" className="mrd-ranger-close" onClick=${closeRanger} aria-label="Fermer">✕</button>
          </div>

          ${!bulkRangerMode && memoryLoc ? (() => {
            const display = getStorageLocationDisplay(memoryLoc);
            const selected = rangerSelectedLocId === memoryLoc.id;
            return html`
              <button type="button" role="radio" aria-checked=${selected}
                aria-label=${`${display.name || memoryLoc.name} — là où tu l'as rangé la dernière fois`}
                className="mrd-ranger-memory"
                onClick=${() => setRangerSelectedLocId(memoryLoc.id)}>
                <span className="mrd-ranger-memory-thumb">${display.emoji || "📦"}</span>
                <span className="mrd-ranger-memory-info">
                  <span className="mrd-ranger-memory-name">${display.name || memoryLoc.name}</span>
                  <span className="mrd-ranger-memory-sub">là où tu l'as rangé la dernière fois</span>
                </span>
                ${selected ? html`<span className="mrd-ranger-memory-check">✓</span>` : null}
              </button>
            `;
          })() : null}

          ${rangerNoLocations ? html`
            <div className="mrd-ranger-empty-state">
              <span className="mrd-ranger-empty">Tu n'as pas encore de rangement.</span>
              ${renderCreateFields(true)}
            </div>
          ` : html`
            <div className="mrd-ranger-locations">
            <div className="mrd-ranger-locblock">
              <div className="mrd-ranger-search">
                <span className="mrd-ranger-search-icon">🔍</span>
                <input
                  ref=${rangerSearchRef}
                  className="mrd-ranger-search-input"
                  value=${rangerSearch}
                  onInput=${(e) => setRangerSearch(e.target.value)}
                  placeholder="Chercher un rangement…"
                />
              </div>
              <div className=${`mrd-ranger-grid${rangerWideGrid ? " mrd-ranger-grid--wide" : ""}`} role="radiogroup" aria-label="Rangements">
                ${rangerFilteredLocations.map((loc) => {
                  const display = getStorageLocationDisplay(loc);
                  const count = safeInventory.filter((i) => i.storageLocationId === loc.id && i.stockState !== "empty").length;
                  const selected = rangerSelectedLocId === loc.id;
                  return html`
                    <button key=${loc.id} type="button" role="radio" aria-checked=${selected}
                      aria-label=${`${display.name || loc.name}, ${count} produit${count > 1 ? "s" : ""}`}
                      className=${`mrd-ranger-tile${selected ? " mrd-ranger-tile--selected" : ""}`}
                      onClick=${() => setRangerSelectedLocId(loc.id)}>
                      <span className="mrd-ranger-tile-emoji">${display.emoji || "📦"}</span>
                      <span className="mrd-ranger-tile-info">
                        <span className="mrd-ranger-tile-name">${display.name || loc.name}</span>
                        <span className="mrd-ranger-tile-count">${count} produit${count > 1 ? "s" : ""}</span>
                      </span>
                    </button>
                  `;
                })}
              </div>
            </div>

            <div className="mrd-ranger-secrow">
              <button type="button" className="mrd-ranger-newloc-btn"
                onClick=${() => { if (showCreateAsSearch) createAndAssignFromSearch(); else setRangerShowCreate((v) => !v); }}>
                ${showCreateAsSearch ? `＋ Créer « ${searchTrimmed} »` : "＋ Nouveau rangement"}
              </button>
              <button type="button" className="mrd-ranger-noloc-btn" onClick=${() => assignLocation("")}>
                Sans rangement
              </button>
            </div>

            ${rangerShowCreate ? renderCreateFields(false) : null}
            </div>
          `}

          <div className="mrd-ranger-footer">
            <button type="button" className="mrd-ranger-submit" onClick=${submitRanger} disabled=${!canConfirm}>
              ${submitLabel}
            </button>
            <button type="button" className="mrd-ranger-cancel" onClick=${closeRanger}>
              Annuler
            </button>
          </div>

        </div>
      <//>
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
  // Paliers d'ouverture de la feuille d'ajout — toutes les combinaisons
  // {doublon, détails dépliés} doivent être présentes d'avance : comme pour
  // la feuille de rangement, `ion-modal` fige sa liste de paliers à l'ouverture.
  const addSheetIsDuplicate = Boolean(similarWarning && !bypassSimilar);
  const addSheetBreakpointFor = (hasDup, showDetails) => {
    const viewport = (typeof window !== "undefined" && window.innerHeight) || 812;
    const wanted = (addSheetHeight({ hasDup, hasLocs: organiserMode, showDetails }) + safeAreaBottom()) / viewport;
    return Math.min(0.9, Math.max(0.3, Math.round(wanted * 1000) / 1000));
  };
  const addSheetBreakpoints = useMemo(() => {
    if (!showModal) return [0.5];
    return [...new Set([
      addSheetBreakpointFor(false, false),
      addSheetBreakpointFor(false, true),
      addSheetBreakpointFor(true, false),
      addSheetBreakpointFor(true, true),
    ])];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showModal, organiserMode]);
  const addSheetBreakpoint = addSheetBreakpointFor(addSheetIsDuplicate, showExtraFields);

  function stepFormQuantity(direction) {
    const current = parseFloat(String(form.quantity || "0").replace(",", "."));
    const base = Number.isFinite(current) ? current : 0;
    const next = Math.max(0, Math.round((base + direction * quantityStep(form.unit)) * 100) / 100);
    setForm((p) => ({ ...p, quantity: String(next) }));
  }

  function renderModal() {
    if (!showModal) return null;
    const isDuplicate = Boolean(similarWarning && !bypassSimilar);
    const chosenLoc = form.storageLocationId ? safeLocations.find((l) => l.id === form.storageLocationId) : null;
    const submitLabel = form.stockState === "empty"
      ? "Ajouter à la liste de courses"
      : chosenLoc
        ? `Ajouter dans « ${getStorageLocationDisplay(chosenLoc).name || chosenLoc.name} »`
        : "Ajouter à l'inventaire";
    const eyebrow = chosenLoc ? `Inventaire · ${getStorageLocationDisplay(chosenLoc).name || chosenLoc.name}` : "Inventaire";

    return html`
      <${MrdModal} isOpen=${true} onClose=${closeModal} sheet=${true}
        sheetBreakpoint=${addSheetBreakpoint} sheetBreakpoints=${addSheetBreakpoints}
        className="mrd-inv-add-modal">
        <div className="mrd-inv-add">
          <div className="mrd-inv-add-head">
            <span className="mrd-inv-add-eyebrow">${eyebrow}</span>
            <button type="button" onClick=${closeModal} className="mrd-inv-add-close" aria-label="Fermer">✕</button>
          </div>

          <form onSubmit=${submitInventory} className="mrd-inv-add-body">

            <div style=${{ position: "relative" }}>
              <input
                className=${`mrd-inv-add-name${isDuplicate ? " mrd-inv-add-name--dup" : ""}`}
                value=${form.name}
                onInput=${(e) => handleNameInput(e.target.value)}
                onBlur=${() => { setTimeout(() => setSuggestions([]), 150); }}
                placeholder="Nom du produit"
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

            ${isDuplicate ? html`
              <div className="mrd-inv-add-dup">
                « ${similarWarning.item.name} » est déjà dans l'inventaire. Modifie-le plutôt que d'en créer un second.
                <div style=${{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  ${similarWarning.item && (similarWarning.item.source === "inventory" || safeInventory.some((e) => e.id === similarWarning.item.id))
                    ? html`<button type="button" className="aok" style=${{ fontSize: 12, padding: "4px 10px" }} onClick=${() => { closeModal(); openEditModal(similarWarning.item); }}>Modifier l'existant</button>`
                    : html`<button type="button" className="aok" style=${{ fontSize: 12, padding: "4px 10px" }} onClick=${() => selectSuggestion(similarWarning.item)}>Reprendre ce produit</button>`}
                  <button type="button" className="clrbtn" style=${{ fontSize: 12, padding: "4px 10px" }} onClick=${() => setBypassSimilar(true)}>Créer quand même</button>
                </div>
              </div>
            ` : null}

            <div className="mrd-inv-add-qtyrow">
              <div className="mrd-inv-add-qty">
                <button type="button" className="mrd-inv-add-qty-btn" onClick=${() => stepFormQuantity(-1)} aria-label="Diminuer la quantité">−</button>
                <span className="mrd-inv-add-qty-val">${form.quantity}</span>
                <button type="button" className="mrd-inv-add-qty-btn" onClick=${() => stepFormQuantity(1)} aria-label="Augmenter la quantité">+</button>
              </div>
              <div className="mrd-inv-add-units">
                ${UNITS.map((u) => html`
                  <button key=${u.value} type="button"
                    className=${`mrd-inv-add-unit${form.unit === u.value ? " mrd-inv-add-unit--on" : ""}`}
                    onClick=${() => setForm({ ...form, unit: u.value })}>${u.label}</button>
                `)}
              </div>
            </div>

            ${organiserMode ? html`
              <div className="mrd-inv-add-locs">
                <button type="button" className=${`mrd-inv-add-locchip${!form.storageLocationId ? " mrd-inv-add-locchip--on" : ""}`}
                  onClick=${() => setForm({ ...form, storageLocationId: "" })}>Non classé</button>
                ${safeLocations.map((loc) => html`
                  <button key=${loc.id} type="button"
                    className=${`mrd-inv-add-locchip${form.storageLocationId === loc.id ? " mrd-inv-add-locchip--on" : ""}`}
                    onClick=${() => setForm({ ...form, storageLocationId: loc.id })}>
                    ${getStorageLocationDisplay(loc).label || loc.name}
                  </button>
                `)}
              </div>
            ` : null}

            <div className="mrd-inv-add-toggles">
              <button type="button" role="switch" aria-checked=${showExtraFields}
                className=${`mrd-inv-add-toggle${showExtraFields ? " mrd-inv-add-toggle--on" : ""}`}
                onClick=${() => setShowExtraFields((v) => !v)}>Plus de détails</button>
              <button type="button" role="switch" aria-checked=${form.stockState === "empty"}
                className=${`mrd-inv-add-toggle${form.stockState === "empty" ? " mrd-inv-add-toggle--on" : ""}`}
                onClick=${() => setForm({ ...form, stockState: form.stockState === "empty" ? "in_stock" : "empty" })}>Article épuisé</button>
            </div>

            ${showExtraFields ? html`
              <div className="mrd-inv-add-details">
                <div style=${{ display: "flex", gap: 8 }}>
                  <input type="date" className="mrd-inv-add-details-input" style=${{ flex: 1 }}
                    value=${form.expiryDate} onInput=${(e) => setForm({ ...form, expiryDate: e.target.value })} />
                  <input className="mrd-inv-add-details-input" style=${{ width: 96 }}
                    placeholder="Prix" value=${form.price} onInput=${(e) => setForm({ ...form, price: e.target.value })} />
                </div>
                <input className="mrd-inv-add-details-input"
                  placeholder="Magasin, marque, variété…" value=${form.note}
                  onInput=${(e) => setForm({ ...form, note: e.target.value })} />
              </div>
            ` : null}

            <button type="submit" className="mrd-inv-add-submit" disabled=${!form.name.trim()}>
              ${editingItemId ? "Enregistrer" : submitLabel}
            </button>
          </form>
        </div>
      <//>
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
            ${count} sélectionné${count > 1 ? "s" : ""}
          </span>
          <button type="button" className="inv-bulkbar-cancel" onClick=${exitSelectionMode}>
            Annuler
          </button>
        </div>
        <div className="inv-bulkbar-actions" style=${{ gridTemplateColumns: `repeat(${actionCount}, minmax(0, 1fr))` }}>
          ${organiserMode ? html`
            <button type="button" className="inv-bulkbar-btn" onClick=${bulkMove} disabled=${!count}>Déplacer</button>
          ` : null}
          <button type="button" className="inv-bulkbar-btn inv-bulkbar-btn-primary" onClick=${bulkShopping} disabled=${!count}>À racheter</button>
          <button type="button" className="inv-bulkbar-btn" onClick=${bulkFinished} disabled=${!count}>Fini</button>
          <button type="button" className="inv-bulkbar-btn inv-bulkbar-btn-danger" onClick=${bulkDelete} disabled=${!count}>Supprimer</button>
        </div>
      </div>
    `;
  }

  // ─── main render ──────────────────────────────────────────────
  return html`
    <section className="mrd-inv-screen" onClick=${handleSectionClick}>
      ${renderHeader()}

      <div className="mrd-inv-list">
        ${renderExpiryBanner()}
        ${activeItems.map((item) => renderRow(item))}
        ${renderEmptyState()}
        ${renderFinishedBlock()}

        ${safeInventory.length > 0 ? html`
          <div style=${{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick=${onClearAllInventory} className="mrd-inv-clearall">
              Vider l'inventaire
            </button>
          </div>
        ` : null}
      </div>

      ${renderModal()}
      ${renderRangerPicker()}
      ${renderStorageEmojiPicker()}
      ${renderBulkBar()}
    </section>
  `;
}

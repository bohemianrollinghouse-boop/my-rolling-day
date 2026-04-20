import { html, useMemo, useState } from "../../lib.js";
import { getCurrentAppDate } from "../../utils/date.js?v=2026-04-19-time-sim-2";
import { findSimilarItem, formatQuantityUnit, suggestItems } from "../../utils/productUtils.js";

const UNITS = [
  { value: "", label: "—" },
  { value: "unité", label: "Unité" },
  { value: "g", label: "g" },
  { value: "kg", label: "kg" },
  { value: "ml", label: "ml" },
  { value: "cl", label: "cl" },
  { value: "l", label: "l" },
];

function todayKey() {
  const now = getCurrentAppDate();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function emptyForm() {
  return {
    name: "",
    quantity: "",
    unit: "",
    purchaseDate: todayKey(),
    expiryDate: "",
    price: "",
    stockState: "in_stock",
  };
}

function compareByName(left, right) {
  return String(left?.name || "").localeCompare(String(right?.name || ""), "fr", { sensitivity: "base" });
}

function knownProductMeta(item) {
  if (item?.source === "inventory") {
    return item.stockState === "empty" ? "Deja vu dans l inventaire" : "Deja dans l inventaire";
  }
  if (item?.source === "list") return "Deja vu dans une liste";
  if (item?.source === "recipe") return "Deja vu dans une recette";
  if (item?.source === "recipe-draft") return "Deja ajoute dans cette recette";
  return "Produit deja connu";
}

export function InventoryView({
  inventory,
  knownProducts = [],
  onAddInventoryItem,
  onUpdateInventoryItem,
  onDeleteInventoryItem,
  onClearFinishedInventory,
  onClearAllInventory,
  onSendInventoryToShopping,
}) {
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const productIndex = Array.isArray(knownProducts) && knownProducts.length ? knownProducts : safeInventory;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [inventoryForm, setInventoryForm] = useState(emptyForm());
  const [similarWarning, setSimilarWarning] = useState(null);
  const [bypassSimilar, setBypassSimilar] = useState(false);
  const [suggestions, setSuggestions] = useState([]);

  const filteredInventory = useMemo(() => {
    const query = search.trim().toLowerCase();
    let base = query ? safeInventory.filter((item) => String(item.name || "").toLowerCase().includes(query)) : safeInventory;
    if (filter === "stock") base = base.filter((item) => item.stockState === "in_stock");
    if (filter === "finished") base = base.filter((item) => item.stockState === "empty");
    return base.slice().sort(compareByName);
  }, [safeInventory, search, filter]);

  const stockItems = filteredInventory.filter((item) => item.stockState === "in_stock");
  const finishedItems = filteredInventory.filter((item) => item.stockState === "empty");

  function openCreateModal() {
    setEditingItemId("");
    setInventoryForm(emptyForm());
    setSimilarWarning(null);
    setBypassSimilar(false);
    setSuggestions([]);
    setShowInventoryModal(true);
  }

  function openEditModal(item) {
    setEditingItemId(item.id);
    setInventoryForm({
      name: item.name || "",
      quantity: item.quantity || "",
      unit: item.unit || "",
      purchaseDate: item.purchaseDate || todayKey(),
      expiryDate: item.expiryDate || "",
      price: item.price || "",
      stockState: item.stockState === "empty" ? "empty" : "in_stock",
    });
    setSimilarWarning(null);
    setBypassSimilar(false);
    setSuggestions([]);
    setShowInventoryModal(true);
  }

  function closeModal() {
    setShowInventoryModal(false);
    setEditingItemId("");
    setSimilarWarning(null);
    setBypassSimilar(false);
    setSuggestions([]);
  }

  function handleNameInput(value) {
    setInventoryForm((prev) => ({ ...prev, name: value }));
    setBypassSimilar(false);
    if (!value.trim()) {
      setSimilarWarning(null);
      setSuggestions([]);
      return;
    }
    setSimilarWarning(findSimilarItem(value, productIndex, editingItemId || null));
    setSuggestions(suggestItems(value, productIndex, editingItemId || null));
  }

  function selectSuggestion(item) {
    const currentQuantity = inventoryForm.quantity || "";
    const currentUnit = inventoryForm.unit || "";
    const currentPurchaseDate = inventoryForm.purchaseDate || todayKey();
    const currentExpiryDate = inventoryForm.expiryDate || "";
    const currentPrice = inventoryForm.price || "";
    const currentStockState = inventoryForm.stockState || "in_stock";
    setEditingItemId("");
    setInventoryForm({
      name: item.name || "",
      quantity: currentQuantity,
      unit: currentUnit,
      purchaseDate: currentPurchaseDate,
      expiryDate: currentExpiryDate,
      price: currentPrice,
      stockState: currentStockState,
    });
    setSimilarWarning(null);
    setBypassSimilar(false);
    setSuggestions([]);
  }

  function submitInventory(event) {
    event.preventDefault();
    if (!inventoryForm.name.trim()) return;
    const payload = {
      name: inventoryForm.name.trim(),
      quantity: inventoryForm.quantity || "",
      unit: inventoryForm.unit || "",
      purchaseDate: inventoryForm.purchaseDate || todayKey(),
      expiryDate: inventoryForm.expiryDate || "",
      price: inventoryForm.price || "",
      stockState: inventoryForm.stockState || "in_stock",
      needsRestock: inventoryForm.stockState === "empty",
    };
    if (editingItemId) {
      onUpdateInventoryItem(editingItemId, payload);
    } else {
      onAddInventoryItem(payload);
    }
    closeModal();
    setInventoryForm(emptyForm());
  }

  function renderSuggestion(item) {
    const qtyLabel = formatQuantityUnit(item.quantity, item.unit);
    return html`
      <button
        key=${item.id}
        type="button"
        className="suggest-item"
        onMouseDown=${() => selectSuggestion(item)}
      >
        <span>${item.name}</span>
        <span className="mini" style=${{ marginLeft: "8px", opacity: "0.7" }}>
          ${qtyLabel ? `${qtyLabel} · ` : ""}${knownProductMeta(item)}
        </span>
      </button>
    `;
  }

  function renderCard(item, finished = false) {
    const qtyLabel = formatQuantityUnit(item.quantity, item.unit);
    return html`
      <div className=${`inventory-card ${finished ? "finished" : ""}`} key=${item.id}>
        <div className="inventory-card-top">
          <div>
            <div className="settings-title">${item.name}</div>
            <div className="inventory-meta-row">
              ${qtyLabel ? html`<span className="inventory-pill quantity">${qtyLabel}</span>` : null}
              ${item.expiryDate ? html`<span className="inventory-pill expiry">DLC ${item.expiryDate}</span>` : null}
            </div>
            <div className="mini inventory-detail-row">
              ${item.purchaseDate ? `Entre le ${item.purchaseDate}` : "Date d entree non renseignee"}
              ${item.price ? ` · ${item.price} €` : ""}
            </div>
          </div>
          <span className=${`settings-badge ${finished ? "soon" : ""}`}>${item.stockState === "empty" ? "Fini" : "En stock"}</span>
        </div>

        <div className="inventory-status-row">
          <button className=${`pc ${item.stockState === "in_stock" ? "on" : ""}`} onClick=${() => onUpdateInventoryItem(item.id, { stockState: "in_stock", needsRestock: false })}>
            En stock
          </button>
          <button className=${`pc ${item.stockState === "empty" ? "on" : ""}`} onClick=${() => onUpdateInventoryItem(item.id, { stockState: "empty", needsRestock: true })}>
            Fini
          </button>
        </div>

        <div className="inventory-actions">
          <button className="clrbtn" onClick=${() => openEditModal(item)}>Modifier</button>
          <button className="clrbtn" onClick=${() => onSendInventoryToShopping(item.id)}>A racheter</button>
          <button className="ghost-btn" onClick=${() => onDeleteInventoryItem(item.id)}>Supprimer</button>
        </div>
      </div>
    `;
  }

  function renderSection(title, items, finished = false) {
    if (!items.length) return null;
    return html`
      <section className="inventory-section">
        <div className="sh">
          <div className="sl">
            <span className="st">${title}</span>
            <span className="mini">${items.length} article${items.length > 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="settings-stack">
          ${items.map((item) => renderCard(item, finished))}
        </div>
      </section>
    `;
  }

  return html`
    <section className="rwrap">
      <div className="sh">
        <div className="sl">
          <span className="st">Inventaire</span>
          <span className="mini">Stock du foyer, avec recherche, filtres rapides et reassort simple.</span>
        </div>
        <div className="settings-inline-actions">
          <button className="ghost-btn" onClick=${onClearFinishedInventory}>Vider les finis</button>
          <button className="ghost-btn" onClick=${onClearAllInventory}>Vider l inventaire</button>
          <button className="aok" onClick=${openCreateModal}>Ajouter a l inventaire</button>
        </div>
      </div>

      <div className="aform inventory-tools">
        <div className="fstack">
          <span className="miniTitle">Recherche</span>
          <input className="ainp" placeholder="Rechercher un article..." value=${search} onInput=${(event) => setSearch(event.target.value)} />
        </div>
        <div className="fstack">
          <span className="miniTitle">Tri</span>
          <div className="mini">Tri alphabetique</div>
        </div>
      </div>

      <div className="task-choice-row">
        <button className=${`task-choice ${filter === "all" ? "on" : ""}`} onClick=${() => setFilter("all")}>Tous</button>
        <button className=${`task-choice ${filter === "stock" ? "on" : ""}`} onClick=${() => setFilter("stock")}>En stock</button>
        <button className=${`task-choice ${filter === "finished" ? "on" : ""}`} onClick=${() => setFilter("finished")}>Finis</button>
      </div>

      ${(filter === "all" || filter === "stock") ? renderSection("En stock", stockItems) : null}
      ${(filter === "all" || filter === "finished") ? renderSection("Produits finis", finishedItems, true) : null}

      ${!filteredInventory.length ? html`<div className="empty">Aucun article trouve</div>` : null}

      ${showInventoryModal
        ? html`
            <div className="modal-backdrop" onClick=${closeModal}>
              <div className="modal-card task-modal" onClick=${(event) => event.stopPropagation()}>
                <div className="task-modal-head">
                  <div>
                    <div className="miniTitle">Inventaire</div>
                    <div className="st">${editingItemId ? "Modifier l article" : "Ajouter un article"}</div>
                  </div>
                  <button className="delbtn" onClick=${closeModal}>×</button>
                </div>
                <form className="task-create-form" onSubmit=${submitInventory}>

                  <div className="fstack">
                    <span className="miniTitle">Nom de l article</span>
                    <div style=${{ position: "relative" }}>
                      <input
                        className="ainp"
                        value=${inventoryForm.name}
                        onInput=${(event) => handleNameInput(event.target.value)}
                        onBlur=${() => { setTimeout(() => setSuggestions([]), 150); }}
                        autocomplete="off"
                      />
                      ${suggestions.length
                        ? html`
                            <div className="suggest-dropdown">
                              ${suggestions.map(renderSuggestion)}
                            </div>
                          `
                        : null}
                    </div>
                    ${similarWarning && !bypassSimilar ? html`
                      <div style=${{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "8px", padding: "10px", marginTop: "6px" }}>
                        <div className="mini" style=${{ fontWeight: "600", marginBottom: "6px" }}>
                          Article similaire deja connu : "${similarWarning.item.name}"
                        </div>
                        <div style=${{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          ${similarWarning.item?.source === "inventory" || safeInventory.some((entry) => entry.id === similarWarning.item.id)
                            ? html`
                                <button type="button" className="aok" style=${{ fontSize: "12px", padding: "4px 10px" }}
                                  onClick=${() => { closeModal(); openEditModal(similarWarning.item); }}>
                                  Modifier l'article existant
                                </button>
                              `
                            : html`
                                <button type="button" className="aok" style=${{ fontSize: "12px", padding: "4px 10px" }}
                                  onClick=${() => selectSuggestion(similarWarning.item)}>
                                  Reprendre ce produit connu
                                </button>
                              `}
                          <button type="button" className="clrbtn" style=${{ fontSize: "12px", padding: "4px 10px" }}
                            onClick=${() => setBypassSimilar(true)}>
                            Creer quand meme
                          </button>
                        </div>
                      </div>
                    ` : null}
                  </div>

                  <div className="fstack">
                    <span className="miniTitle">Quantité</span>
                    <div className="quantity-unit-row">
                      <input
                        className="ainp"
                        placeholder="Optionnel"
                        value=${inventoryForm.quantity}
                        style=${{ flex: "1" }}
                        onInput=${(event) => setInventoryForm({ ...inventoryForm, quantity: event.target.value })}
                      />
                      <select
                        className="asel"
                        value=${inventoryForm.unit}
                        style=${{ width: "90px" }}
                        onChange=${(event) => setInventoryForm({ ...inventoryForm, unit: event.target.value })}
                      >
                        ${UNITS.map((u) => html`<option key=${u.value} value=${u.value}>${u.label}</option>`)}
                      </select>
                    </div>
                  </div>

                  <div className="fstack">
                    <span className="miniTitle">Date d entree en inventaire</span>
                    <input className="ainp" type="date" value=${inventoryForm.purchaseDate} onInput=${(event) => setInventoryForm({ ...inventoryForm, purchaseDate: event.target.value })} />
                  </div>
                  <div className="fstack">
                    <span className="miniTitle">Si date limite de consommation</span>
                    <input className="ainp" type="date" value=${inventoryForm.expiryDate} onInput=${(event) => setInventoryForm({ ...inventoryForm, expiryDate: event.target.value })} />
                  </div>
                  <div className="fstack">
                    <span className="miniTitle">Prix</span>
                    <input className="ainp" placeholder="Optionnel" value=${inventoryForm.price} onInput=${(event) => setInventoryForm({ ...inventoryForm, price: event.target.value })} />
                  </div>
                  <div className="fstack">
                    <span className="miniTitle">Etat du produit</span>
                    <div className="inventory-status-row">
                      <button type="button" className=${`pc ${inventoryForm.stockState === "in_stock" ? "on" : ""}`} onClick=${() => setInventoryForm({ ...inventoryForm, stockState: "in_stock" })}>
                        En stock
                      </button>
                      <button type="button" className=${`pc ${inventoryForm.stockState === "empty" ? "on" : ""}`} onClick=${() => setInventoryForm({ ...inventoryForm, stockState: "empty" })}>
                        Fini
                      </button>
                    </div>
                  </div>
                  <div className="task-modal-actions">
                    <button type="button" className="clrbtn" onClick=${closeModal}>Annuler</button>
                    <button className="aok" type="submit">${editingItemId ? "Enregistrer" : "Ajouter"}</button>
                  </div>
                </form>
              </div>
            </div>
          `
        : null}
    </section>
  `;
}

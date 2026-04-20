import { html, useMemo, useState } from "../../lib.js";
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

function listBadgeLabel(list) {
  return list.addToInventory ? "Les achats sont ajoutés à l’inventaire" : "Les achats restent dans cette liste";
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
  onClearShoppingList,
}) {
  const safeLists = Array.isArray(lists) ? lists : [];
  const shoppingList = safeLists.find((list) => list.isShoppingList) || safeLists[0] || null;
  const [activeListId, setActiveListId] = useState(shoppingList?.id || "");
  const [showListModal, setShowListModal] = useState(false);
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingList, setEditingList] = useState(null);
  const [listForm, setListForm] = useState({ name: "", visibility: "household", sharedWith: [] });
  const [itemForm, setItemForm] = useState({ text: "", quantity: "", unit: "" });
  const [itemWarning, setItemWarning] = useState(null);
  const [bypassItemWarning, setBypassItemWarning] = useState(false);
  const [itemSuggestions, setItemSuggestions] = useState([]);

  const selectedList = useMemo(
    () => safeLists.find((list) => list.id === activeListId) || shoppingList || null,
    [safeLists, activeListId, shoppingList],
  );
  const pendingItems = Array.isArray(selectedList?.items) ? selectedList.items.filter((item) => !item.done) : [];
  const purchasedItems = Array.isArray(selectedList?.items) ? selectedList.items.filter((item) => item.done) : [];

  function openCreateList() {
    setEditingList(null);
    setListForm({ name: "", visibility: "household", sharedWith: [] });
    setShowListModal(true);
  }

  function toggleListMember(personId) {
    setListForm((prev) => {
      const current = prev.sharedWith || [];
      return { ...prev, sharedWith: current.includes(personId) ? current.filter((id) => id !== personId) : [...current, personId] };
    });
  }

  function openEditList(list) {
    setEditingList(list);
    setListForm({ name: list.name || "", visibility: list.visibility || "household", sharedWith: list.sharedWith || [] });
    setShowListModal(true);
  }

  function openAddItem() {
    setItemForm({ text: "", quantity: "", unit: "" });
    setItemWarning(null);
    setBypassItemWarning(false);
    setItemSuggestions([]);
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
    setItemWarning(null);
    setBypassItemWarning(false);
    setItemSuggestions([]);
  }

  function submitList(event) {
    event.preventDefault();
    if (!listForm.name.trim()) return;
    if (editingList) {
      const finalVisibility = listForm.visibility === "private" && (listForm.sharedWith || []).length > 0 ? "shared" : listForm.visibility || "household";
      onUpdateList(editingList.id, {
        name: listForm.name.trim(),
        visibility: editingList.isShoppingList ? "household" : finalVisibility,
        sharedWith: listForm.sharedWith || [],
      });
    } else {
      const finalVisibility = listForm.visibility === "private" && (listForm.sharedWith || []).length > 0 ? "shared" : listForm.visibility || "household";
      onCreateList({
        name: listForm.name.trim(),
        visibility: finalVisibility,
        sharedWith: listForm.sharedWith || [],
      });
    }
    setShowListModal(false);
  }

  function submitItem(event) {
    event.preventDefault();
    if (!selectedList || !itemForm.text.trim()) return;
    onAddListItem(selectedList.id, itemForm);
    setItemForm({ text: "", quantity: "", unit: "" });
    setItemWarning(null);
    setItemSuggestions([]);
    setShowItemModal(false);
  }

  function renderListItem(item) {
    return html`
      <div className=${`sitem shopping-item ${item.done ? "dn purchased" : ""}`} key=${item.id}>
        <button className=${`schk ${item.done ? "on" : ""}`} onClick=${() => onToggleListItem(selectedList.id, item.id)}>
          ${item.done ? "✓" : ""}
        </button>
        <div className="settings-group">
          <span className="stxt">${item.text}</span>
          <div className="arow" style=${{ alignItems: "center", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
            <span className="mini">Qté</span>
            <input
              className="ainp"
              style=${{ width: "72px", padding: "6px 10px" }}
              type="number"
              min="0"
              step="1"
              value=${item.quantity || ""}
              onInput=${(event) => onUpdateListItem(selectedList.id, item.id, { quantity: event.target.value })}
            />
            <select
              className="asel"
              style=${{ width: "80px", padding: "6px 8px" }}
              value=${item.unit || ""}
              onChange=${(event) => onUpdateListItem(selectedList.id, item.id, { unit: event.target.value })}
            >
              ${UNITS.map((u) => html`<option key=${u.value} value=${u.value}>${u.label}</option>`)}
            </select>
          </div>
          ${item.done && item.purchasedAt ? html`<span className="mini">Acheté le ${item.purchasedAt}</span>` : null}
        </div>
        <button className="delbtn" onClick=${() => onDeleteListItem(selectedList.id, item.id)}>X</button>
      </div>
    `;
  }

  function renderShoppingSections() {
    return html`
      ${pendingItems.length
        ? html`
            <section className="inventory-section">
              <div className="sh">
                <div className="sl">
                  <span className="st">À acheter</span>
                  <span className="mini">${pendingItems.length} article${pendingItems.length > 1 ? "s" : ""}</span>
                </div>
              </div>
              <div className="settings-stack">
                ${pendingItems.map((item) => renderListItem(item))}
              </div>
            </section>
          `
        : null}

      ${purchasedItems.length
        ? html`
            <section className="inventory-section">
              <div className="sh">
                <div className="sl">
                  <span className="st">Achetés</span>
                  <span className="mini">${purchasedItems.length} article${purchasedItems.length > 1 ? "s" : ""}</span>
                </div>
              </div>
              <div className="settings-stack">
                ${purchasedItems.map((item) => renderListItem(item))}
              </div>
            </section>
          `
        : null}

      ${!pendingItems.length && !purchasedItems.length ? html`<div className="empty">Cette liste est vide</div>` : null}
    `;
  }

  return html`
    <section className="rwrap">
      <div className="sh">
        <div className="sl">
          <span className="st">Listes du foyer</span>
          <span className="mini">Crée autant de listes que nécessaire. La liste de courses reste la liste spéciale liée à l’inventaire.</span>
        </div>
        <button className="aok" onClick=${openCreateList}>Nouvelle liste</button>
      </div>

      <div className="task-choice-row">
        ${safeLists.map(
          (list) => html`
            <button
              key=${list.id}
              className=${`task-choice ${selectedList?.id === list.id ? "on" : ""}`}
              onClick=${() => setActiveListId(list.id)}
            >
              ${list.name}${list.visibility === "private" ? " 🔒" : list.visibility === "shared" ? " 👥" : ""}
            </button>
          `,
        )}
      </div>

      ${selectedList
        ? html`
            <div className="settings-card">
              <div className="settings-body">
                <div className="settings-row">
                  <div>
                    <div className="settings-title">${selectedList.name}</div>
                    <div className="mini">${listBadgeLabel(selectedList)}</div>
                  </div>
                  <div className="settings-inline-actions">
                    <button
                      className=${`inventory-link-toggle ${selectedList.addToInventory ? "on" : ""}`}
                      onClick=${() => onUpdateList(selectedList.id, { addToInventory: !selectedList.addToInventory })}
                    >
                      <span className="inventory-link-toggle-box">${selectedList.addToInventory ? "✓" : ""}</span>
                      <span>Lier avec mon inventaire</span>
                    </button>
                    <button className="list-add-btn" onClick=${openAddItem}>+ Ajouter</button>
                    <button className="clrbtn" onClick=${() => openEditList(selectedList)}>Modifier</button>
                    ${!selectedList.isShoppingList ? html`<button className="ghost-btn" onClick=${() => onDeleteList(selectedList.id)}>Supprimer la liste</button>` : null}
                    ${selectedList.isShoppingList ? html`<button className="ghost-btn" onClick=${onClearShoppingList}>Vider la liste de courses</button>` : null}
                  </div>
                </div>
                ${selectedList.isShoppingList ? html`<div className="mini">Cette liste reçoit aussi les articles envoyés depuis l’inventaire avec « À racheter ».</div>` : null}
                ${selectedList.visibility === "shared" && (selectedList.sharedWith || []).length
                  ? html`<div className="mini" style=${{ color: "var(--accent)", marginBottom: "4px" }}>Partage avec : ${(selectedList.sharedWith || []).map((id) => { const p = people.find((x) => x.id === id); return p?.label || p?.displayName || id; }).join(", ")}</div>`
                  : selectedList.visibility === "private"
                    ? html`<div className="mini" style=${{ marginBottom: "4px" }}>Liste privée</div>`
                    : null}

                ${selectedList.isShoppingList
                  ? renderShoppingSections()
                  : selectedList.items.length
                    ? selectedList.items.map((item) => renderListItem(item))
                    : html`<div className="empty">Cette liste est vide</div>`}
              </div>
            </div>
          `
        : html`<div className="empty">Aucune liste disponible</div>`}

      ${showListModal
        ? html`
            <div className="modal-backdrop" onClick=${() => setShowListModal(false)}>
              <div className="modal-card task-modal" onClick=${(event) => event.stopPropagation()}>
                <div className="task-modal-head">
                  <div>
                    <div className="miniTitle">Listes</div>
                    <div className="st">${editingList ? "Modifier la liste" : "Créer une liste"}</div>
                  </div>
                  <button className="delbtn" onClick=${() => setShowListModal(false)}>X</button>
                </div>
                <form className="task-create-form" onSubmit=${submitList}>
                  <input className="ainp" placeholder="Nom de la liste" value=${listForm.name} onInput=${(event) => setListForm((prev) => ({ ...prev, name: event.target.value }))} />
                  ${editingList && !editingList.isShoppingList
                    ? html`
                        <div className="segmented" style=${{ marginBottom: "4px" }}>
                          <button type="button" className=${`seg-btn ${listForm.visibility === "household" ? "on" : ""}`} onClick=${() => setListForm((prev) => ({ ...prev, visibility: "household", sharedWith: [] }))}>Foyer</button>
                          <button type="button" className=${`seg-btn ${listForm.visibility !== "household" ? "on" : ""}`} onClick=${() => setListForm((prev) => ({ ...prev, visibility: "private" }))}>Privée</button>
                        </div>
                        ${listForm.visibility !== "household" && people.filter((p) => p.id !== activePersonId && (p.label || p.displayName)?.trim() && p.type !== "animal" && p.type !== "child").length
                          ? html`
                              <div style=${{ marginBottom: "8px" }}>
                                <div className="mini" style=${{ marginBottom: "6px" }}>Partager avec :</div>
                                <div style=${{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                  ${people.filter((p) => p.id !== activePersonId && (p.label || p.displayName)?.trim() && p.type !== "animal" && p.type !== "child").map((person) => html`
                                    <button key=${person.id} type="button" className=${`task-choice ${(listForm.sharedWith || []).includes(person.id) ? "on" : ""}`} onClick=${() => toggleListMember(person.id)}>${person.label || person.displayName}</button>
                                  `)}
                                </div>
                              </div>
                            `
                          : null}
                      `
                    : null}
                  ${!editingList
                    ? html`
                        <div className="segmented" style=${{ marginBottom: "4px" }}>
                          <button type="button" className=${`seg-btn ${listForm.visibility === "household" ? "on" : ""}`} onClick=${() => setListForm((prev) => ({ ...prev, visibility: "household", sharedWith: [] }))}>Foyer</button>
                          <button type="button" className=${`seg-btn ${listForm.visibility === "private" ? "on" : ""}`} onClick=${() => setListForm((prev) => ({ ...prev, visibility: "private" }))}>Privée</button>
                        </div>
                        ${listForm.visibility === "private" && people.filter((p) => p.id !== activePersonId && (p.label || p.displayName)?.trim() && p.type !== "animal" && p.type !== "child").length
                          ? html`
                              <div style=${{ marginBottom: "8px" }}>
                                <div className="mini" style=${{ marginBottom: "6px" }}>Partager avec :</div>
                                <div style=${{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                  ${people.filter((p) => p.id !== activePersonId && (p.label || p.displayName)?.trim() && p.type !== "animal" && p.type !== "child").map((person) => html`
                                    <button key=${person.id} type="button" className=${`task-choice ${(listForm.sharedWith || []).includes(person.id) ? "on" : ""}`} onClick=${() => toggleListMember(person.id)}>${person.label || person.displayName}</button>
                                  `)}
                                </div>
                              </div>
                            `
                          : null}
                      `
                    : null}
                  ${editingList?.isShoppingList
                    ? null
                    : html`<div className="mini">Le mode inventaire se change directement sur la carte de liste.</div>`}
                  <div className="task-modal-actions">
                    <button type="button" className="clrbtn" onClick=${() => setShowListModal(false)}>Annuler</button>
                    <button className="aok" type="submit" disabled=${!listForm.name.trim()}>${editingList ? "Enregistrer" : "Créer la liste"}</button>
                  </div>
                </form>
              </div>
            </div>
          `
        : null}

      ${showItemModal
        ? html`
            <div className="modal-backdrop" onClick=${() => setShowItemModal(false)}>
              <div className="modal-card task-modal" onClick=${(event) => event.stopPropagation()}>
                <div className="task-modal-head">
                  <div>
                    <div className="miniTitle">${selectedList?.name || "Liste"}</div>
                    <div className="st">Ajouter un article</div>
                  </div>
                  <button className="delbtn" onClick=${() => setShowItemModal(false)}>X</button>
                </div>
                <form className="task-create-form" onSubmit=${submitItem}>
                  <div className="fstack">
                    <span className="miniTitle">Nom de l article</span>
                    <div style=${{ position: "relative" }}>
                      <input
                        className="ainp"
                        placeholder="Rechercher ou saisir..."
                        value=${itemForm.text}
                        onInput=${(event) => handleItemNameInput(event.target.value)}
                        onBlur=${() => { setTimeout(() => setItemSuggestions([]), 150); }}
                        autocomplete="off"
                      />
                      ${itemSuggestions.length
                        ? html`
                            <div className="suggest-dropdown">
                              ${itemSuggestions.map((s) => html`
                                <button
                                  key=${s.id}
                                  type="button"
                                  className="suggest-item"
                                  onMouseDown=${() => selectItemSuggestion(s)}
                                >
                                  <span>${s.name}</span>
                                  <span className="mini" style=${{ marginLeft: "8px", opacity: "0.7" }}>
                                    ${formatQuantityUnit(s.quantity, s.unit) || ""}${s.stockState === "empty" ? " · Fini" : " · En stock"}
                                  </span>
                                </button>
                              `)}
                            </div>
                          `
                        : null}
                    </div>
                    ${itemWarning && !bypassItemWarning ? html`
                      <div style=${{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "8px", padding: "10px", marginTop: "6px" }}>
                        <div className="mini" style=${{ fontWeight: "600", marginBottom: "6px" }}>
                          ⚠️ Déjà dans l'inventaire : "${itemWarning.item.name}" · ${itemWarning.item.stockState === "empty" ? "Fini" : "En stock"}
                        </div>
                        <button type="button" className="clrbtn" style=${{ fontSize: "12px", padding: "4px 10px" }}
                          onClick=${() => setBypassItemWarning(true)}>
                          Ajouter quand même
                        </button>
                      </div>
                    ` : null}
                  </div>
                  <div className="fstack">
                    <span className="miniTitle">Quantité</span>
                    <div className="quantity-unit-row">
                      <input
                        className="ainp"
                        type="number"
                        min="0"
                        step="1"
                        placeholder="Optionnel"
                        value=${itemForm.quantity}
                        style=${{ flex: "1" }}
                        onInput=${(event) => setItemForm((previous) => ({ ...previous, quantity: event.target.value }))}
                      />
                      <select
                        className="asel"
                        value=${itemForm.unit}
                        style=${{ width: "90px" }}
                        onChange=${(event) => setItemForm((previous) => ({ ...previous, unit: event.target.value }))}
                      >
                        ${UNITS.map((u) => html`<option key=${u.value} value=${u.value}>${u.label}</option>`)}
                      </select>
                    </div>
                  </div>
                  <div className="task-modal-actions">
                    <button type="button" className="clrbtn" onClick=${() => setShowItemModal(false)}>Annuler</button>
                    <button className="aok" type="submit">Ajouter</button>
                  </div>
                </form>
              </div>
            </div>
          `
        : null}
    </section>
  `;
}

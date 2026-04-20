import { html, useState } from "../../lib.js";

function personName(people, id) {
  const p = (people || []).find((x) => x.id === id);
  return p?.label || p?.displayName || "Inconnu";
}

function ShareableMembers({ people, activePersonId, selected, onChange }) {
  const members = (people || []).filter((p) => p.id !== activePersonId && (p.label || p.displayName)?.trim() && p.type !== "animal" && p.type !== "child");
  if (!members.length) return null;
  return html`
    <div style=${{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
      ${members.map((p) => html`
        <button key=${p.id} type="button"
          className=${`task-choice ${selected.includes(p.id) ? "on" : ""}`}
          onClick=${() => onChange(selected.includes(p.id) ? selected.filter((id) => id !== p.id) : [...selected, p.id])}
        >${p.label || p.displayName}</button>
      `)}
    </div>
  `;
}

export function NotesView({ notes, activePersonId, people, onAddNote, onDeleteNote, onUpdateNote }) {
  const [visibility, setVisibility] = useState("household");
  const [sharedWith, setSharedWith] = useState([]);
  const [filterPersonId, setFilterPersonId] = useState("all");
  const [editingId, setEditingId] = useState(null);
  const [editVisibility, setEditVisibility] = useState("household");
  const [editSharedWith, setEditSharedWith] = useState([]);

  function submit(event) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("noteText");
    const finalVisibility = visibility === "private" && sharedWith.length > 0 ? "shared" : visibility;
    onAddNote(input.value, finalVisibility, sharedWith);
    input.value = "";
    setSharedWith([]);
  }

  function startEdit(note) {
    setEditingId(note.id);
    setEditVisibility(note.visibility || "household");
    setEditSharedWith(note.sharedWith || []);
  }

  function saveEdit(noteId) {
    const finalVisibility = editVisibility === "private" && editSharedWith.length > 0 ? "shared" : editVisibility;
    onUpdateNote(noteId, { visibility: finalVisibility, sharedWith: editSharedWith });
    setEditingId(null);
  }

  function authorName(id) { return personName(people, id); }

  const privateNotes = notes.filter((n) => n.visibility === "private" && n.createdBy === activePersonId);
  const sharedNotes = notes.filter((n) => !(n.visibility === "private" && n.createdBy === activePersonId));
  const authorsInShared = Array.from(new Set(sharedNotes.map((n) => n.createdBy).filter(Boolean)));
  const filteredSharedNotes = filterPersonId === "all" ? sharedNotes : sharedNotes.filter((n) => n.createdBy === filterPersonId);

  function renderNote(note) {
    const isOwn = !note.createdBy || note.createdBy === activePersonId;
    const isEditing = editingId === note.id;
    const sharedNames = (note.sharedWith || []).map((id) => authorName(id)).filter(Boolean);

    return html`
      <div className="ncard" key=${note.id}>
        <div style=${{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <div className="ndate">${note.date}</div>
          <div style=${{ display: "flex", gap: "6px", alignItems: "center" }}>
            ${note.visibility === "private" ? html`<span title="Prive">🔒</span>` : note.visibility === "shared" ? html`<span title="Partage">👥</span>` : null}
            ${note.createdBy && note.visibility !== "private" ? html`<span className="mini" style=${{ fontStyle: "italic" }}>${authorName(note.createdBy)}</span>` : null}
          </div>
        </div>

        <div className="ntxt">${note.text}</div>

        ${(note.visibility === "shared" || note.visibility === "private") && sharedNames.length
          ? html`<div className="mini" style=${{ marginTop: "4px", color: "var(--accent)" }}>Partage avec : ${sharedNames.join(", ")}</div>`
          : null}

        ${isOwn && isEditing ? html`
          <div style=${{ marginTop: "8px", padding: "8px", background: "var(--surface2, #f5f5f5)", borderRadius: "8px" }}>
            <div className="mini" style=${{ marginBottom: "6px" }}>Visibilite :</div>
            <div className="segmented" style=${{ marginBottom: "6px" }}>
              <button type="button" className=${`seg-btn ${editVisibility === "household" ? "on" : ""}`} onClick=${() => { setEditVisibility("household"); setEditSharedWith([]); }}>Foyer</button>
              <button type="button" className=${`seg-btn ${editVisibility === "private" ? "on" : ""}`} onClick=${() => setEditVisibility("private")}>Privée</button>
            </div>
            ${editVisibility === "private" ? html`
              <${ShareableMembers} people=${people} activePersonId=${activePersonId} selected=${editSharedWith} onChange=${setEditSharedWith} />
            ` : null}
            <div style=${{ display: "flex", gap: "6px", marginTop: "8px" }}>
              <button className="aok" style=${{ fontSize: "12px", padding: "4px 10px" }} onClick=${() => saveEdit(note.id)}>Enregistrer</button>
              <button className="acn" style=${{ fontSize: "12px", padding: "4px 10px" }} onClick=${() => setEditingId(null)}>Annuler</button>
            </div>
          </div>
        ` : null}

        ${isOwn && !isEditing ? html`
          <div style=${{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <button className="delbtn" onClick=${() => onDeleteNote(note.id)}>× Supprimer</button>
            <button className="abtn" style=${{ fontSize: "11px" }} onClick=${() => startEdit(note)}>Modifier visibilite</button>
          </div>
        ` : null}
      </div>
    `;
  }

  return html`
    <section>
      <form className="aform mrd-note-add-form" onSubmit=${submit}>
        <textarea className="nta" name="noteText" placeholder="Écris ta note ici…" rows="3"></textarea>
        <div style=${{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
          <div className="segmented" style=${{ flex: "1" }}>
            <button type="button" className=${`seg-btn ${visibility === "household" ? "on" : ""}`} onClick=${() => { setVisibility("household"); setSharedWith([]); }}>Foyer</button>
            <button type="button" className=${`seg-btn ${visibility === "private" ? "on" : ""}`} onClick=${() => setVisibility("private")}>Privée</button>
          </div>
          <button className="aok" type="submit" style=${{ padding: "7px 14px", borderRadius: "99px", fontSize: "13px" }}>Enregistrer</button>
        </div>
        ${visibility === "private" ? html`
          <div style=${{ marginTop: "8px" }}>
            <div className="mini" style=${{ marginBottom: "6px" }}>Partager avec :</div>
            <${ShareableMembers} people=${people} activePersonId=${activePersonId} selected=${sharedWith} onChange=${setSharedWith} />
          </div>
        ` : null}
      </form>

      ${privateNotes.length ? html`
        <div className="mrd-section-head" style=${{ marginTop: "16px", marginBottom: "8px" }}>
          <span className="miniTitle">Mes notes privées</span>
          <span className="mini">${privateNotes.length}</span>
        </div>
        <div className="mrd-notes-masonry">${privateNotes.map(renderNote)}</div>
      ` : null}

      <div className="mrd-section-head" style=${{ marginTop: "16px", marginBottom: "8px" }}>
        <span className="miniTitle">Notes du foyer</span>
        <span className="mini">${filteredSharedNotes.length}</span>
      </div>
      ${authorsInShared.length > 1 ? html`
        <div style=${{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
          <button type="button" className=${`task-choice ${filterPersonId === "all" ? "on" : ""}`} onClick=${() => setFilterPersonId("all")}>Toutes</button>
          ${authorsInShared.map((id) => html`
            <button key=${id} type="button" className=${`task-choice ${filterPersonId === id ? "on" : ""}`} onClick=${() => setFilterPersonId(id)}>${authorName(id)}</button>
          `)}
        </div>
      ` : null}
      ${filteredSharedNotes.length
        ? html`<div className="mrd-notes-masonry">${filteredSharedNotes.map(renderNote)}</div>`
        : html`<div className="empty">Aucune note du foyer</div>`}
    </section>
  `;
}

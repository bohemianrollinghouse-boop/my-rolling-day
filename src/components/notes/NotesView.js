import { html, useState, useRef } from "../../lib.js";

const VISIBILITY_EMOJI = {
  private: "🔒",
  shared: "👥",
  household: "🏠",
};

function personName(people, id) {
  const person = (people || []).find((entry) => entry.id === id);
  return person?.label || person?.displayName || "Inconnu";
}

function noteToneIndex(index) {
  return (index % 5) + 1;
}

function ShareableMembers({ people, activePersonId, selected, onChange }) {
  const members = (people || []).filter(
    (person) =>
      person.id !== activePersonId
      && (person.label || person.displayName)?.trim()
      && person.type !== "animal"
      && person.type !== "child",
  );

  if (!members.length) return null;

  return html`
    <div style=${{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "6px" }}>
      ${members.map((person) => html`
        <button
          key=${person.id}
          type="button"
          className=${`task-choice ${selected.includes(person.id) ? "on" : ""}`}
          onClick=${() => onChange(
            selected.includes(person.id)
              ? selected.filter((id) => id !== person.id)
              : [...selected, person.id],
          )}
        >
          ${person.label || person.displayName}
        </button>
      `)}
    </div>
  `;
}

export function NotesView({ notes, activePersonId, people, onAddNote, onDeleteNote, onUpdateNote }) {
  const [visibility, setVisibility] = useState("household");
  const [sharedWith, setSharedWith] = useState([]);
  const [modalNoteId, setModalNoteId] = useState(null);
  const [modalMode, setModalMode] = useState("view");
  const [modalTone, setModalTone] = useState(1);
  const [editText, setEditText] = useState("");
  const [editVisibility, setEditVisibility] = useState("household");
  const [editSharedWith, setEditSharedWith] = useState([]);
  const [search, setSearch] = useState("");
  const [filterVis, setFilterVis] = useState("all");
  const [inlineEditId, setInlineEditId] = useState(null);
  const [inlineEditText, setInlineEditText] = useState("");
  const [addNoteText, setAddNoteText] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const SpeechRecognition = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  function startVoice() {
    if (!SpeechRecognition) return;
    if (recognitionRef.current) { recognitionRef.current.abort(); recognitionRef.current = null; setListening(false); return; }
    const rec = new SpeechRecognition();
    rec.lang = "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onstart = () => setListening(true);
    rec.onresult = (e) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) transcript += e.results[i][0].transcript;
      setAddNoteText(transcript);
    };
    rec.onend = () => { setListening(false); recognitionRef.current = null; };
    rec.onerror = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = rec;
    rec.start();
  }

  function stopVoice() {
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    setListening(false);
  }

  const modalNote = modalNoteId ? notes.find((note) => note.id === modalNoteId) || null : null;

  const searchLower = search.trim().toLowerCase();
  const filteredNotes = notes
    .filter((note) => {
      if (filterVis === "household" && (note.visibility || "household") !== "household") return false;
      if (filterVis === "mine" && note.createdBy && note.createdBy !== activePersonId) return false;
      if (searchLower && !note.text?.toLowerCase().includes(searchLower)) return false;
      return true;
    })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  function privacyLabel(selectedIds) {
    return selectedIds.length ? "Partagee" : "Privee";
  }

  function privacyHelp(selectedIds) {
    return selectedIds.length
      ? "Visible seulement avec les membres selectionnes."
      : "Visible seulement par toi.";
  }

  function closeNoteModal() {
    setModalNoteId(null);
    setModalMode("view");
    setEditText("");
    setEditVisibility("household");
    setEditSharedWith([]);
  }

  function startInlineEdit(note, event) {
    event.stopPropagation();
    setInlineEditId(note.id);
    setInlineEditText(note.text || "");
  }

  function saveInlineEdit(note) {
    const text = inlineEditText.trim();
    if (text && text !== (note.text || "").trim()) {
      onUpdateNote(note.id, { text });
    }
    setInlineEditId(null);
    setInlineEditText("");
  }

  function cancelInlineEdit() {
    setInlineEditId(null);
    setInlineEditText("");
  }

  function primeEditState(note) {
    setEditText(note.text || "");
    setEditVisibility(note.visibility === "shared" ? "private" : (note.visibility || "household"));
    setEditSharedWith([...(note.sharedWith || [])]);
  }

  function openNoteModal(note, tone, mode = "view") {
    setModalNoteId(note.id);
    setModalTone(tone);
    if (mode === "edit") {
      primeEditState(note);
    }
    setModalMode(mode);
  }

  function openEditModal(note, tone) {
    primeEditState(note);
    setModalNoteId(note.id);
    setModalTone(tone);
    setModalMode("edit");
  }

  function submit(event) {
    event.preventDefault();
    const noteText = addNoteText.trim();
    if (!noteText) return;
    stopVoice();
    const finalVisibility = visibility === "private" && sharedWith.length > 0 ? "shared" : visibility;
    onAddNote(noteText, finalVisibility, sharedWith);
    setAddNoteText("");
    setSharedWith([]);
  }

  function saveModalEdit() {
    if (!modalNote) return;
    const noteText = editText.trim();
    if (!noteText) return;
    const finalVisibility = editVisibility === "private" && editSharedWith.length > 0 ? "shared" : editVisibility;
    onUpdateNote(modalNote.id, {
      text: noteText,
      visibility: finalVisibility,
      sharedWith: editSharedWith,
    });
    closeNoteModal();
  }

  function renderNoteModal() {
    if (!modalNote) return null;

    const isOwn = !modalNote.createdBy || modalNote.createdBy === activePersonId;
    const sharedNames = (modalNote.sharedWith || []).map((id) => personName(people, id)).filter(Boolean);
    const isEditing = modalMode === "edit" && isOwn;
    const finalVisibility = isEditing
      ? (editVisibility === "private" && editSharedWith.length > 0 ? "shared" : editVisibility)
      : (modalNote.visibility || "household");
    const canSave = isEditing && editText.trim();

    return html`
      <div className="modal-backdrop note-modal-backdrop" onClick=${closeNoteModal}>
        <div className=${`modal-card note-modal-card note-tone-${modalTone}`} onClick=${(event) => event.stopPropagation()}>
          <div className="task-modal note-modal-shell">
            <div className="task-modal-head note-modal-head">
              <div>
                <div className="ndate note-modal-date">${modalNote.date}</div>
                <div className="st">${isEditing ? "Modifier la note" : "Note"}</div>
                <div className="note-modal-meta">
                  <span className="note-visibility-emoji">${VISIBILITY_EMOJI[finalVisibility]}</span>
                  ${modalNote.createdBy && finalVisibility !== "private"
                    ? html`<span>${personName(people, modalNote.createdBy)}</span>`
                    : null}
                </div>
              </div>
              <button type="button" className="note-action-btn note-modal-close" onClick=${closeNoteModal} aria-label="Fermer">×</button>
            </div>

            <div className="note-modal-body">
              ${isEditing
                ? html`
                    <textarea
                      className="nta note-modal-textarea"
                      value=${editText}
                      onInput=${(event) => setEditText(event.currentTarget.value)}
                      placeholder="Ecris ta note ici..."
                      rows="10"
                    ></textarea>
                    ${editVisibility === "private" ? html`
                      <div className="note-modal-share-block">
                        <${ShareableMembers}
                          people=${people}
                          activePersonId=${activePersonId}
                          selected=${editSharedWith}
                          onChange=${setEditSharedWith}
                        />
                        <div className="mini note-modal-help">${privacyHelp(editSharedWith)}</div>
                      </div>
                    ` : null}
                  `
                : html`
                    <div className="note-modal-text">${modalNote.text}</div>
                    ${modalNote.visibility === "shared" && sharedNames.length
                      ? html`<div className="mini note-shared-names note-modal-shared">Partagee avec : ${sharedNames.join(", ")}</div>`
                      : null}
                  `}
            </div>

            ${isEditing
              ? html`
                  <div className="note-modal-footer">
                    <div className="segmented note-modal-visibility">
                      <button
                        type="button"
                        className=${`seg-btn ${editVisibility === "household" ? "on" : ""}`}
                        onClick=${() => {
                          setEditVisibility("household");
                          setEditSharedWith([]);
                        }}
                      >
                        Foyer
                      </button>
                      <button
                        type="button"
                        className=${`seg-btn ${editVisibility === "private" ? "on" : ""}`}
                        onClick=${() => setEditVisibility("private")}
                      >
                        ${privacyLabel(editSharedWith)}
                      </button>
                    </div>
                    <div className="note-modal-footer-actions">
                      <button type="button" className="acn" onClick=${closeNoteModal}>Annuler</button>
                      <button type="button" className="aok" disabled=${!canSave} onClick=${saveModalEdit}>Enregistrer</button>
                    </div>
                  </div>
                `
              : html`
                  <div className="note-modal-read-actions">
                    ${isOwn
                      ? html`<button type="button" className="aok" onClick=${() => openEditModal(modalNote, modalTone)}>Modifier</button>`
                      : null}
                    <button type="button" className="acn" onClick=${closeNoteModal}>Fermer</button>
                  </div>
                `}
          </div>
        </div>
      </div>
    `;
  }

  function renderToolbar() {
    return html`
      <div className="notes-toolbar">
        <div className="notes-search-wrap">
          <input
            type="search"
            className="ainp notes-search-input"
            placeholder="Rechercher une note…"
            value=${search}
            onInput=${(e) => setSearch(e.currentTarget.value)}
            aria-label="Rechercher une note"
          />
          ${search ? html`<button type="button" className="notes-search-clear" onClick=${() => setSearch("")} aria-label="Effacer la recherche">×</button>` : null}
        </div>
        <div className="segmented notes-filter-tabs">
          <button type="button" className=${`seg-btn ${filterVis === "all" ? "on" : ""}`} onClick=${() => setFilterVis("all")}>Toutes</button>
          <button type="button" className=${`seg-btn ${filterVis === "household" ? "on" : ""}`} onClick=${() => setFilterVis("household")}>Foyer</button>
          <button type="button" className=${`seg-btn ${filterVis === "mine" ? "on" : ""}`} onClick=${() => setFilterVis("mine")}>Mes notes</button>
        </div>
      </div>
    `;
  }

  function renderNote(note, index) {
    const tone = noteToneIndex(index);
    const isOwn = !note.createdBy || note.createdBy === activePersonId;
    const sharedNames = (note.sharedWith || []).map((id) => personName(people, id)).filter(Boolean);
    const isInlineEditing = inlineEditId === note.id;

    if (isInlineEditing) {
      return html`
        <div className=${`ncard note-tone-${tone} note-inline-editing`} key=${note.id}>
          <div className="ndate">${note.date}</div>
          <textarea
            className="nta note-inline-textarea"
            autoFocus
            value=${inlineEditText}
            onInput=${(e) => setInlineEditText(e.currentTarget.value)}
            onKeyDown=${(e) => {
              if (e.key === "Escape") cancelInlineEdit();
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveInlineEdit(note);
            }}
            placeholder="Écris ta note ici…"
          ></textarea>
          <div className="note-inline-actions">
            <button type="button" className="acn note-inline-cancel" onClick=${cancelInlineEdit}>Annuler</button>
            <button type="button" className="aok note-inline-save" disabled=${!inlineEditText.trim()} onClick=${() => saveInlineEdit(note)}>Enregistrer</button>
          </div>
        </div>
      `;
    }

    return html`
      <div className=${`ncard note-tone-${tone}${note.pinned ? " note-pinned" : ""}`} key=${note.id}
        onClick=${isOwn ? (e) => startInlineEdit(note, e) : () => openNoteModal(note, tone, "view")}
        title=${isOwn ? "Cliquer pour modifier" : ""}
      >
        ${note.pinned ? html`<div className="note-pin-badge" aria-label="Note épinglée">📌</div>` : null}
        <div className="ndate">${note.date}</div>
        <div className="ntxt">${note.text}</div>

        ${note.visibility === "shared" && sharedNames.length
          ? html`<div className="mini note-shared-names">Partagee avec : ${sharedNames.join(", ")}</div>`
          : null}

        <div className="note-footer">
          <span className="note-visibility-emoji" title=${note.visibility || "household"}>${VISIBILITY_EMOJI[note.visibility || "household"]}</span>
          ${note.createdBy && note.visibility !== "private"
            ? html`<span className="mini note-author">${personName(people, note.createdBy)}</span>`
            : null}
          ${isOwn
            ? html`
                <div className="note-actions">
                  <button
                    type="button"
                    className=${`note-action-btn${note.pinned ? " note-pin-btn--active" : ""}`}
                    onClick=${(event) => {
                      event.stopPropagation();
                      onUpdateNote(note.id, { pinned: !note.pinned });
                    }}
                    title=${note.pinned ? "Désépingler" : "Épingler en haut"}
                    aria-label=${note.pinned ? "Désépingler la note" : "Épingler la note"}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    className="note-action-btn"
                    onClick=${(event) => {
                      event.stopPropagation();
                      openEditModal(note, tone);
                    }}
                    title="Options (visibilité…)"
                    aria-label="Options de la note"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
                  </button>
                  <button
                    type="button"
                    className="note-action-btn note-delete-btn"
                    onClick=${(event) => {
                      event.stopPropagation();
                      if (modalNoteId === note.id) closeNoteModal();
                      onDeleteNote(note.id);
                    }}
                    title="Supprimer"
                    aria-label="Supprimer la note"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              `
            : null}
        </div>
      </div>
    `;
  }

  return html`
    <section>
      <form className="aform mrd-note-add-form" onSubmit=${submit}>
        <div className="note-voice-textarea-wrap">
          <textarea
            className="nta note-add-textarea"
            placeholder="Écris ta note ici…"
            rows="3"
            value=${addNoteText}
            onInput=${(e) => setAddNoteText(e.currentTarget.value)}
          ></textarea>
          ${SpeechRecognition ? html`
            <button
              type="button"
              className=${`note-voice-btn${listening ? " is-listening" : ""}`}
              onClick=${listening ? stopVoice : startVoice}
              title=${listening ? "Arrêter la dictée" : "Dicter une note"}
              aria-label=${listening ? "Arrêter la dictée vocale" : "Démarrer la dictée vocale"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor"/>
                <path d="M5 10a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              ${listening ? html`<span className="note-voice-dot"></span>` : null}
            </button>
          ` : null}
        </div>
        <div style=${{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
          <div className="segmented" style=${{ flex: "1" }}>
            <button
              type="button"
              className=${`seg-btn ${visibility === "household" ? "on" : ""}`}
              onClick=${() => {
                setVisibility("household");
                setSharedWith([]);
              }}
            >
              Foyer
            </button>
            <button
              type="button"
              className=${`seg-btn ${visibility === "private" ? "on" : ""}`}
              onClick=${() => setVisibility("private")}
            >
              ${privacyLabel(sharedWith)}
            </button>
          </div>
          <button className="aok" type="submit" disabled=${!addNoteText.trim()} style=${{ padding: "7px 14px", borderRadius: "99px", fontSize: "13px" }}>Enregistrer</button>
        </div>
        ${visibility === "private"
          ? html`
              <div style=${{ marginTop: "8px" }}>
                <div className="mini" style=${{ marginBottom: "6px" }}>
                  ${sharedWith.length ? "Visible seulement avec :" : "Visible seulement par toi, ou partagee avec :"}
                </div>
                <${ShareableMembers}
                  people=${people}
                  activePersonId=${activePersonId}
                  selected=${sharedWith}
                  onChange=${setSharedWith}
                />
              </div>
            `
          : null}
      </form>

      ${notes.length === 0
        ? html`
            <div className="notes-empty-state">
              <div className="notes-empty-emoji">📝</div>
              <div className="notes-empty-title">Aucune note pour l'instant</div>
              <div className="notes-empty-sub">Écris quelque chose dans le champ ci-dessus&nbsp;!</div>
            </div>
          `
        : html`
            ${renderToolbar()}
            ${filteredNotes.length === 0
              ? html`<div className="empty" style=${{ paddingTop: "32px", textAlign: "center" }}>Aucune note ne correspond à ta recherche</div>`
              : html`<div className="mrd-notes-masonry">${filteredNotes.map((note, index) => renderNote(note, index))}</div>`}
          `}

      ${renderNoteModal()}
    </section>
  `;
}

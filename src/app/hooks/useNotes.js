// Notes du foyer : création, suppression, modification.
//
// Extrait d'`App.js`. La visibilité (`private` / `shared` / `household`) est
// posée à la création et n'est pas interprétée ici : le filtrage par personne
// se fait au rendu, dans `App.js`, parce qu'il dépend de la personne active.

import { getCurrentAppDate, localDateKey, pad2 } from "../utils/date.js";

/**
 * @param {Function} updateState
 * @param {string}   activePersonId  auteur des notes créées (peut être vide)
 */
export function useNotes(updateState, activePersonId = "") {
  function handleAddNote(text, visibility = "household", sharedWith = []) {
    if (!String(text || "").trim()) return;
    const now = getCurrentAppDate();
    const date = `${localDateKey(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    updateState((previous) => ({
      ...previous,
      notes: [{
        id: `note-${Date.now()}`,
        text: String(text).trim(),
        date,
        createdBy: activePersonId,
        visibility,
        sharedWith: Array.isArray(sharedWith) ? sharedWith : [],
      }, ...previous.notes],
    }));
  }

  function handleDeleteNote(noteId) {
    updateState((previous) => ({
      ...previous,
      notes: previous.notes.filter((note) => note.id !== noteId),
    }));
  }

  function handleUpdateNote(noteId, updates) {
    updateState((previous) => ({
      ...previous,
      notes: previous.notes.map((note) => (note.id === noteId ? { ...note, ...updates } : note)),
    }));
  }

  return { handleAddNote, handleDeleteNote, handleUpdateNote };
}

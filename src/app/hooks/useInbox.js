// Pense-bête : capture rapide, puis dispatch vers une tâche, un événement
// d'agenda ou une note.
//
// Extrait d'`App.js`. Ce hook est volontairement le seul endroit qui connaît
// les trois destinations à la fois : le dispatch est du glue inter-modules, et
// c'est le domaine du pense-bête que d'en être responsable. Il reçoit donc les
// créateurs des autres hooks plutôt que de les appeler lui-même — un hook de
// rang 3 ne peut pas dépendre d'un autre hook sans que l'ordre d'appel devienne
// implicite, et `App.js` reste le seul à décider de cet ordre.

import { getCurrentAppDate, localDateKey, pad2 } from "../utils/date.js";

/**
 * @param {object}   deps
 * @param {Function} deps.updateState
 * @param {string}   deps.activePersonId
 * @param {Function} deps.showToast
 * @param {Function} deps.handleAddTask       de `useTasks`
 * @param {Function} deps.handleAddAgenda     de `useAgenda`
 * @param {Function} deps.handleAddRecurring  de `useAgenda`
 * @param {Function} deps.handleAddNote       de `useNotes`
 */
export function useInbox({
  updateState,
  activePersonId = "",
  showToast,
  handleAddTask,
  handleAddAgenda,
  handleAddRecurring,
  handleAddNote,
}) {
  function handleAddInboxItem(text, hint) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    const now = getCurrentAppDate();
    const createdAt = `${localDateKey(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    updateState((previous) => ({
      ...previous,
      inbox: [
        {
          id: `inbox-${Date.now()}`,
          text: trimmed,
          hint: hint || null,
          createdAt,
          createdBy: activePersonId,
        },
        ...(Array.isArray(previous.inbox) ? previous.inbox : []),
      ],
    }));
  }

  function handleDeleteInboxItem(itemId) {
    updateState((previous) => ({
      ...previous,
      inbox: (Array.isArray(previous.inbox) ? previous.inbox : []).filter((item) => item.id !== itemId),
    }));
  }

  function handleDispatchToTask(inboxItem, payload) {
    // « À faire avant » n'est pas une période : une tâche à échéance se range
    // dans le quotidien, son urgence vit dans `priority`.
    const period = payload.displayPeriod === "deadline" ? "daily" : (payload.displayPeriod || "daily");
    handleAddTask(period, payload);
    handleDeleteInboxItem(inboxItem.id);
    showToast("✓ Tâche créée depuis l'inbox");
  }

  function handleDispatchToAgenda(inboxItem, payload) {
    if (payload.repeatWeekly) {
      const weekday = new Date(`${payload.dateKey}T00:00`).getDay();
      handleAddRecurring({ ...payload, weekday });
    } else {
      handleAddAgenda(payload);
    }
    handleDeleteInboxItem(inboxItem.id);
    showToast("✓ Ajouté à l'agenda");
  }

  function handleDispatchToNote(inboxItem, payload) {
    handleAddNote(payload.text, payload.visibility, payload.sharedWith);
    handleDeleteInboxItem(inboxItem.id);
    showToast("✓ Note créée depuis l'inbox");
  }

  return {
    handleAddInboxItem,
    handleDeleteInboxItem,
    handleDispatchToTask,
    handleDispatchToAgenda,
    handleDispatchToNote,
  };
}

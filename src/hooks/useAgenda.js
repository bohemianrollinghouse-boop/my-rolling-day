function normalizeAgendaPayload(form, fallbackTask) {
  const sourceType = form.sourceType || form.mode || "custom";
  const text = sourceType === "task" ? fallbackTask?.text || "" : String(form.text || "").trim();
  const icon = sourceType === "task" ? fallbackTask?.icon || "" : String(form.icon || "").trim();
  const personIds = Array.isArray(form.personIds)
    ? form.personIds.filter(Boolean)
    : form.personId ? [form.personId] : [];
  return {
    taskId: sourceType === "task" ? form.taskId || fallbackTask?.id || "" : "",
    text,
    icon,
    dateKey: form.dateKey,
    start: form.allDay ? "00:00" : form.start || "09:00",
    duration: Number(form.duration) || 60,
    allDay: Boolean(form.allDay),
    personIds,
    personId: personIds[0] || "",
    wholeFamily: Boolean(form.wholeFamily),
    childIds: Array.isArray(form.childIds) ? form.childIds.filter(Boolean) : [],
    sourceType,
  };
}

export function useAgenda(state, updateState) {
  function handleAddAgenda(form) {
    const selectedTask = state.tasks.find((task) => task.id === form.taskId);
    const payload = normalizeAgendaPayload(form, selectedTask);
    if (!payload.text) return;
    updateState((previous) => ({
      ...previous,
      agenda: [...previous.agenda, { id: `agenda-${Date.now()}`, ...payload }],
    }));
  }

  function handleUpdateAgenda(itemId, form) {
    const selectedTask = state.tasks.find((task) => task.id === form.taskId);
    const payload = normalizeAgendaPayload(form, selectedTask);
    if (!payload.text) return;
    updateState((previous) => ({
      ...previous,
      agenda: previous.agenda.map((item) => (item.id === itemId ? { ...item, ...payload } : item)),
    }));
  }

  function handleDeleteAgenda(itemId) {
    updateState((previous) => ({
      ...previous,
      agenda: previous.agenda.filter((item) => item.id !== itemId),
    }));
  }

  function handleAddRecurring(item) {
    const selectedTask = state.tasks.find((task) => task.id === item.taskId);
    const payload = normalizeAgendaPayload(item, selectedTask);
    if (!payload.text) return;
    updateState((previous) => ({
      ...previous,
      recurringEvents: [
        ...previous.recurringEvents,
        {
          id: `rec-${Date.now()}`,
          taskId: payload.taskId,
          text: payload.text,
          icon: payload.icon,
          weekday: item.weekday < 0 ? 0 : item.weekday,
          start: payload.start,
          duration: payload.duration,
          allDay: payload.allDay,
          personIds: payload.personIds,
          personId: payload.personId,
          wholeFamily: payload.wholeFamily,
          childIds: payload.childIds,
          sourceType: payload.sourceType,
        },
      ],
    }));
  }

  function handleUpdateRecurring(itemId, item) {
    const selectedTask = state.tasks.find((task) => task.id === item.taskId);
    const payload = normalizeAgendaPayload(item, selectedTask);
    if (!payload.text) return;
    updateState((previous) => ({
      ...previous,
      recurringEvents: previous.recurringEvents.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              taskId: payload.taskId,
              text: payload.text,
              icon: payload.icon,
              weekday: item.weekday < 0 ? 0 : item.weekday,
              start: payload.start,
              duration: payload.duration,
              allDay: payload.allDay,
              personIds: payload.personIds,
              personId: payload.personId,
              wholeFamily: payload.wholeFamily,
              childIds: payload.childIds,
              sourceType: payload.sourceType,
            }
          : entry,
      ),
    }));
  }

  function handleDeleteRecurring(itemId) {
    updateState((previous) => ({
      ...previous,
      recurringEvents: previous.recurringEvents.filter((item) => item.id !== itemId),
    }));
  }

  return {
    handleAddAgenda, handleUpdateAgenda, handleDeleteAgenda,
    handleAddRecurring, handleUpdateRecurring, handleDeleteRecurring,
  };
}

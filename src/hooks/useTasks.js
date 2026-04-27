import { getCurrentAppDate, localDateKey, pad2 } from "../utils/date.js?v=2026-04-19-time-sim-2";

function logEntry(personId, text, icon) {
  const now = getCurrentAppDate();
  const date = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()}`;
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  return { id: `h-${Date.now()}`, date, time, user: personId, text, icon };
}

function reorderTasks(tasks) {
  const rank = { daily: 0, weekly: 1, monthly: 2, deadline: 3 };
  const groupedCounts = { daily: 0, weekly: 0, monthly: 0, deadline: 0 };
  return tasks
    .slice()
    .sort((left, right) => {
      if (left.type !== right.type) return rank[left.type] - rank[right.type];
      return left.order - right.order;
    })
    .map((task) => {
      const nextOrder = groupedCounts[task.type] || 0;
      groupedCounts[task.type] = nextOrder + 1;
      return { ...task, order: nextOrder };
    });
}

function taskPeriodFromTab(tab) {
  if (tab === "weekly") return "weekly";
  if (tab === "monthly") return "monthly";
  return "daily";
}

function normalizeDuration(form) {
  if (form.calendarAllDay) {
    return { duration: 1440, allDay: true };
  }
  if (!form.calendarDurationPreset || form.calendarDurationPreset === "none") {
    return { duration: 0, allDay: false };
  }
  if (form.calendarDurationPreset === "custom") {
    const rawValue = Number(form.calendarCustomDurationValue) || 0;
    const minutes = form.calendarCustomDurationUnit === "hours" ? rawValue * 60 : rawValue;
    return { duration: Math.max(15, minutes), allDay: false };
  }
  return { duration: Number(form.calendarDurationPreset) || 0, allDay: false };
}

export function useTasks(updateState) {
  function handleAddTask(type, form) {
    updateState((previous) => {
      const taskKind = form.taskKind === "recurring" ? "recurring" : "single";
      const isDeadlineTask = form.displayPeriod === "deadline";
      const targetType = isDeadlineTask ? "deadline" : form.displayPeriod || taskPeriodFromTab(type);
      const recurrenceFrequency = taskKind === "recurring" ? form.recurrenceFrequency || "daily" : targetType;
      const sameType = previous.tasks.filter((task) => task.type === targetType);
      const newTask = {
        id: `task-${Date.now()}`,
        text: form.text.trim(),
        type: targetType,
        icon: form.icon.trim(),
        doneBy: [],
        recur: taskKind === "recurring" ? recurrenceFrequency : "none",
        priority: isDeadlineTask ? "deadline" : form.priority,
        critical: false,
        overdue: false,
        order: sameType.length,
        assignedPersonIds: Array.isArray(form.assignedPersonIds) ? form.assignedPersonIds.filter(Boolean) : [],
        assignedWholeFamily: Boolean(form.assignedWholeFamily),
        assignedPersonId: Array.isArray(form.assignedPersonIds) && form.assignedPersonIds.length ? form.assignedPersonIds[0] : "",
        concernedPersonIds: Array.isArray(form.concernedPersonIds) ? form.concernedPersonIds.filter(Boolean) : [],
        displayPeriod: isDeadlineTask ? "deadline" : targetType,
        taskKind,
        recurrenceFrequency,
        recurrenceTime: "00:00",
        recurrenceDaysOfWeek: recurrenceFrequency === "weekly" ? [1] : [],
        recurrenceDayOfMonth: 1,
        completedByPersonId: "",
        completedAt: "",
        missedCount: 0,
        currentCycleKey: "",
        dueDate: isDeadlineTask ? form.dueDate || "" : "",
        dueTime: isDeadlineTask ? form.dueTime || "" : "",
      };
      let nextState = { ...previous, tasks: reorderTasks([...previous.tasks, newTask]) };

      if (form.addToCalendar) {
        const durationInfo = normalizeDuration(form);
        const personIds = form.calendarWholeFamily ? [] : (Array.isArray(form.calendarPersonIds) ? form.calendarPersonIds.filter(Boolean) : []);
        const payload = {
          id: `agenda-${Date.now()}`,
          taskId: newTask.id,
          text: newTask.text,
          icon: newTask.icon,
          dateKey: form.calendarDateKey || form.dueDate || localDateKey(getCurrentAppDate()),
          start: durationInfo.allDay ? "00:00" : (form.calendarStart || "09:00"),
          duration: durationInfo.duration,
          allDay: durationInfo.allDay,
          personIds,
          personId: personIds[0] || "",
          wholeFamily: Boolean(form.calendarWholeFamily),
          childIds: Array.isArray(form.calendarConcernedPersonIds) ? form.calendarConcernedPersonIds.filter(Boolean) : (Array.isArray(form.calendarChildIds) ? form.calendarChildIds.filter(Boolean) : []),
          concernedPersonIds: Array.isArray(form.calendarConcernedPersonIds) ? form.calendarConcernedPersonIds.filter(Boolean) : (Array.isArray(form.calendarChildIds) ? form.calendarChildIds.filter(Boolean) : []),
          sourceType: "task",
        };

        if (form.calendarRepeatWeekly) {
          const recType = form.recurrenceFrequency || "weekly";
          const parsedDate = new Date(`${payload.dateKey}T00:00`);
          nextState = {
            ...nextState,
            recurringEvents: [
              ...nextState.recurringEvents,
              {
                ...payload,
                id: `rec-${Date.now()}`,
                recurrenceType: recType,
                startDateKey: payload.dateKey,
                weekday: parsedDate.getDay(),
                dayOfMonth: parsedDate.getDate(),
              },
            ],
          };
        } else {
          nextState = {
            ...nextState,
            agenda: [...nextState.agenda, payload],
          };
        }
      }

      return nextState;
    });
  }

  function handleToggleTask(taskId, personId) {
    updateState((previous) => {
      const history = [...previous.history];
      const tasks = previous.tasks.map((task) => {
        if (task.id !== taskId) return task;
        const doneBy = Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean) : task.completedByPersonId ? [task.completedByPersonId] : [];
        const alreadyDone = doneBy.includes(personId);
        const nextDoneBy = alreadyDone ? doneBy.filter((id) => id !== personId) : [...doneBy, personId];
        if (!alreadyDone) history.unshift(logEntry(personId, task.text, task.icon));
        return {
          ...task,
          doneBy: nextDoneBy,
          completedByPersonId: nextDoneBy[nextDoneBy.length - 1] || "",
          completedAt: nextDoneBy.length ? getCurrentAppDate().toISOString() : "",
          overdue: false,
        };
      });
      return { ...previous, tasks, history: history.slice(0, 400) };
    });
  }

  function handleUpdateTask(taskId, form) {
    updateState((previous) => {
      const currentTask = previous.tasks.find((task) => task.id === taskId);
      if (!currentTask) return previous;

      const isDeadlineTask = form.displayPeriod === "deadline";
      const targetType = isDeadlineTask ? "deadline" : form.displayPeriod || currentTask.type;
      const taskKind = form.taskKind === "recurring" ? "recurring" : "single";
      const recurrenceFrequency = taskKind === "recurring" ? form.recurrenceFrequency || currentTask.recurrenceFrequency || "daily" : targetType;

      const tasks = previous.tasks.map((task) => {
        if (task.id !== taskId) return task;
        return {
          ...task,
          text: String(form.text || task.text).trim() || task.text,
          icon: String(form.icon ?? task.icon),
          type: targetType,
          priority: isDeadlineTask ? "deadline" : form.priority || task.priority,
          displayPeriod: isDeadlineTask ? "deadline" : targetType,
          assignedPersonIds: Array.isArray(form.assignedPersonIds) ? form.assignedPersonIds.filter(Boolean) : [],
          assignedWholeFamily: Boolean(form.assignedWholeFamily),
          assignedPersonId: Array.isArray(form.assignedPersonIds) && form.assignedPersonIds.length ? form.assignedPersonIds[0] : "",
          concernedPersonIds: Array.isArray(form.concernedPersonIds) ? form.concernedPersonIds.filter(Boolean) : [],
          taskKind,
          recurrenceFrequency,
          dueDate: isDeadlineTask ? form.dueDate || "" : "",
          dueTime: isDeadlineTask ? form.dueTime || "" : "",
        };
      });

      let nextState = { ...previous, tasks: reorderTasks(tasks) };

      if (form.addToCalendar) {
        const updatedTask = nextState.tasks.find((t) => t.id === taskId) || currentTask;
        const durationInfo = normalizeDuration(form);
        const personIds = form.calendarWholeFamily
          ? []
          : Array.isArray(form.calendarPersonIds) ? form.calendarPersonIds.filter(Boolean) : [];

        const payload = {
          id: `agenda-${Date.now()}`,
          taskId,
          text: updatedTask.text,
          icon: updatedTask.icon,
          dateKey: form.calendarDateKey || form.dueDate || localDateKey(getCurrentAppDate()),
          start: durationInfo.allDay ? "00:00" : (form.calendarStart || "09:00"),
          duration: durationInfo.duration,
          allDay: durationInfo.allDay,
          personIds,
          personId: personIds[0] || "",
          wholeFamily: Boolean(form.calendarWholeFamily),
          childIds: Array.isArray(form.calendarConcernedPersonIds) ? form.calendarConcernedPersonIds.filter(Boolean) : (Array.isArray(form.calendarChildIds) ? form.calendarChildIds.filter(Boolean) : []),
          concernedPersonIds: Array.isArray(form.calendarConcernedPersonIds) ? form.calendarConcernedPersonIds.filter(Boolean) : (Array.isArray(form.calendarChildIds) ? form.calendarChildIds.filter(Boolean) : []),
          sourceType: "task",
        };

        // Supprimer l'entrée existante pour cette tâche (agenda + récurrents)
        const cleanAgenda    = nextState.agenda.filter((e) => e.taskId !== taskId);
        const cleanRecurring = nextState.recurringEvents.filter((e) => e.taskId !== taskId);

        if (form.calendarRepeatWeekly) {
          const recType = form.recurrenceFrequency || "weekly";
          const parsedDate = new Date(`${payload.dateKey}T00:00`);
          nextState = {
            ...nextState,
            agenda: cleanAgenda,
            recurringEvents: [
              ...cleanRecurring,
              {
                ...payload,
                id: `rec-${Date.now()}`,
                recurrenceType: recType,
                startDateKey: payload.dateKey,
                weekday: parsedDate.getDay(),
                dayOfMonth: parsedDate.getDate(),
              },
            ],
          };
        } else {
          nextState = {
            ...nextState,
            agenda: [...cleanAgenda, payload],
            recurringEvents: cleanRecurring,
          };
        }
      }

      return nextState;
    });
  }

  function handleDeleteTask(taskId) {
    updateState((previous) => ({
      ...previous,
      tasks: reorderTasks(previous.tasks.filter((task) => task.id !== taskId)),
      agenda: previous.agenda.filter((item) => item.taskId !== taskId),
      recurringEvents: previous.recurringEvents.filter((item) => item.taskId !== taskId),
    }));
  }

  function handleMoveTask(taskId, direction, groupKey, visibleIds) {
    updateState((previous) => {
      const [typeKey, kindKey] = String(groupKey || "").split(":");
      const list = previous.tasks
        .filter((task) => {
          if (typeKey && task.type !== typeKey) return false;
          if (kindKey === "recurring") return task.taskKind === "recurring";
          if (kindKey === "single") return task.taskKind !== "recurring";
          return true;
        })
        .sort((a, b) => a.order - b.order);
      if (!list.length) return previous;

      if (Array.isArray(visibleIds) && visibleIds.length) {
        const orderedVisibleIds = visibleIds.filter((id) => list.some((task) => task.id === id));
        const sourceIndex = orderedVisibleIds.indexOf(taskId);
        const targetIndex = Math.max(0, Math.min(orderedVisibleIds.length - 1, Number(direction)));
        if (sourceIndex < 0 || sourceIndex === targetIndex) return previous;

        const nextVisibleIds = orderedVisibleIds.slice();
        const [movedId] = nextVisibleIds.splice(sourceIndex, 1);
        nextVisibleIds.splice(targetIndex, 0, movedId);

        let visibleCursor = 0;
        const nextOrderedGroup = list.map((task) => {
          if (!orderedVisibleIds.includes(task.id)) return task;
          const replacementId = nextVisibleIds[visibleCursor++];
          return list.find((candidate) => candidate.id === replacementId) || task;
        });

        const nextOrderById = new Map(nextOrderedGroup.map((task, index) => [task.id, index]));
        const tasks = previous.tasks.map((task) => (
          nextOrderById.has(task.id)
            ? { ...task, order: nextOrderById.get(task.id) }
            : task
        ));
        return { ...previous, tasks: reorderTasks(tasks) };
      }

      const index = list.findIndex((task) => task.id === taskId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= list.length) return previous;
      const first = list[index];
      const second = list[target];
      const tasks = previous.tasks.map((task) => {
        if (task.id === first.id) return { ...task, order: second.order };
        if (task.id === second.id) return { ...task, order: first.order };
        return task;
      });
      return { ...previous, tasks: reorderTasks(tasks) };
    });
  }

  return { handleAddTask, handleUpdateTask, handleToggleTask, handleDeleteTask, handleMoveTask };
}

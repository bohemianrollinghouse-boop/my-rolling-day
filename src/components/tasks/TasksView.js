import { html, useMemo, useState, useEffect, useRef } from "../../lib.js";
import { TaskCard as SharedTaskCard } from "./TaskCard.js?v=2026-04-23-tasks-dnd-1";
import { getCurrentAppDate, getCurrentAppTimestamp, localDateKey } from "../../utils/date.js?v=2026-04-19-time-sim-2";
import { EmojiPicker } from "./EmojiPicker.js?v=2026-04-24-emoji-picker-1";

const LONG_PRESS_MS = 280;
const DRAG_CANCEL_DISTANCE = 8;

const URGENCY_META = {
  normal: { label: "Normale", className: "normal", score: 2 },
  urgent: { label: "Urgente", className: "urgent", score: 1 },
  deadline: { label: "À faire avant…", className: "deadline", score: 0 },
};

const EMOJI_CATEGORIES = [
  { label: "Maison", emojis: ["🏠","🧹","🧺","🪣","🧽","🛒","🛍️","🪴","🔑","🚿","🛁","🪥","🧴","🧻","🪟","🪑"] },
  { label: "Famille", emojis: ["👶","🧒","👧","👦","🧑","👩","👨","👴","👵","🐕","🐈","❤️","🤝","🎁"] },
  { label: "Activités", emojis: ["🏃","🚴","🧘","⚽","🏊","🎮","🎨","📚","✏️","🎸","🧩","🏋️","🎭","🎬"] },
  { label: "Nourriture", emojis: ["🍎","🥦","🥕","🍕","🍔","🥗","🍜","🍳","🥐","🍰","🫖","☕","🥤","🍱"] },
  { label: "Travail", emojis: ["💼","📋","📊","💻","📝","🖥️","📅","📌","✅","🔧","⚙️","📞","🗂️","🔍"] },
  { label: "Santé", emojis: ["💊","🩺","🏥","🧬","💉","🩹","🦷","🧠","😴","🧘","🩻","🌡️"] },
  { label: "Transport", emojis: ["🚗","🚕","🚌","🚂","✈️","🚲","🛵","⛽","🚓","🚁","🚶","🛶"] },
];

/* Reconstruit le preset de durée depuis la valeur stockée en minutes */
function durationToPreset(durationMinutes, allDay) {
  if (allDay) return { preset: "all-day", customValue: 1, customUnit: "hours" };
  if (!durationMinutes || durationMinutes === 0) return { preset: "none", customValue: 1, customUnit: "hours" };
  if (durationMinutes === 30)  return { preset: "30",  customValue: 1, customUnit: "hours" };
  if (durationMinutes === 60)  return { preset: "60",  customValue: 1, customUnit: "hours" };
  if (durationMinutes === 120) return { preset: "120", customValue: 2, customUnit: "hours" };
  const isWholeHours = durationMinutes % 60 === 0;
  return {
    preset:      "custom",
    customValue: isWholeHours ? durationMinutes / 60 : durationMinutes,
    customUnit:  isWholeHours ? "hours" : "minutes",
  };
}

function blockTitle(tab) {
  if (tab === "mine") return "Mes tâches";
  if (tab === "daily") return "Aujourd’hui";
  if (tab === "weekly") return "Semaine";
  return "Mois";
}

function defaultTaskForm(tab) {
  return {
    icon: "",
    text: "",
    assignedPersonIds: [],
    assignedWholeFamily: false,
    concernedPersonIds: [],
    priority: "normal",
    displayPeriod: tab === "mine" ? "daily" : tab,
    taskKind: "single",
    recurrenceFrequency: "daily",
    dueDate: "",
    dueTime: "",
    addToCalendar: false,
    calendarDateKey: localDateKey(getCurrentAppDate()),
    calendarStart: "09:00",
    calendarDurationPreset: "none",
    calendarCustomDurationValue: 1,
    calendarCustomDurationUnit: "hours",
    calendarAllDay: false,
    calendarPersonIds: [],
    calendarWholeFamily: false,
    calendarConcernedPersonIds: [],
    calendarRepeatWeekly: false,
    calendarRecurConfirm: null,
  };
}

function recurrenceLabel(task) {
  if (task.taskKind !== "recurring") return "Tâche unique";
  if (task.recurrenceFrequency === "daily") return "Chaque jour";
  if (task.recurrenceFrequency === "weekly") return "Chaque semaine";
  return "Chaque mois";
}

function getDueDateTime(task) {
  if (!task?.dueDate) return null;
  const dateValue = String(task.dueDate || "");
  const timeValue = String(task.dueTime || "");
  const composed = timeValue ? `${dateValue}T${timeValue}` : `${dateValue}T23:59`;
  const parsed = new Date(composed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPastDue(task) {
  const doneBy = Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean) : [];
  if (task.taskKind === "recurring" || task.priority !== "deadline" || doneBy.length || task.completedByPersonId) return false;
  const dueDate = getDueDateTime(task);
  return Boolean(dueDate && dueDate.getTime() < getCurrentAppTimestamp());
}

function isTaskLate(task) {
  if (task?.taskKind === "recurring") return false;
  return Boolean(task?.overdue || isPastDue(task));
}

function dueLabel(task) {
  const dueDate = getDueDateTime(task);
  if (!dueDate) return "⏰ Bientôt";

  const now = getCurrentAppDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (dueDate.toDateString() === now.toDateString()) {
    return task.dueTime ? `⏰ Avant ${task.dueTime}` : "⏰ Aujourd’hui";
  }
  if (dueDate.toDateString() === tomorrow.toDateString()) {
    return task.dueTime ? `⏰ Avant demain ${task.dueTime}` : "⏰ Demain";
  }

  const dateLabel = dueDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return task.dueTime ? `⏰ Avant ${dateLabel} ${task.dueTime}` : `⏰ Avant ${dateLabel}`;
}

function urgencyBadge(task) {
  if (task.priority === "deadline") {
    return {
      label: dueLabel(task),
      className: isPastDue(task) ? "deadline-past" : "deadline",
      score: URGENCY_META.deadline.score,
    };
  }
  return URGENCY_META[task.priority] || URGENCY_META.normal;
}

function nextRecurringDueDate(task) {
  if (task.priority !== "deadline") return null;
  const now = getCurrentAppDate();
  const dueTime = task.dueTime || "23:59";

  if (task.taskKind !== "recurring") return getDueDateTime(task);

  if (task.recurrenceFrequency === "daily") {
    const todayKey = localDateKey(now);
    const todayDue = new Date(`${todayKey}T${dueTime}`);
    if (todayDue >= now) return todayDue;
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const tomorrowKey = localDateKey(tomorrow);
    return new Date(`${tomorrowKey}T${dueTime}`);
  }

  const source = getDueDateTime(task);
  const baseDate = source || now;

  if (task.recurrenceFrequency === "weekly") {
    const weekday = baseDate.getDay();
    const candidate = new Date(now);
    const diff = (weekday - now.getDay() + 7) % 7;
    candidate.setDate(now.getDate() + diff);
    candidate.setHours(...String(dueTime).split(":").map(Number), 0, 0);
    if (candidate < now) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate;
  }

  const monthDay = baseDate.getDate();
  const current = new Date(now.getFullYear(), now.getMonth(), monthDay);
  current.setHours(...String(dueTime).split(":").map(Number), 0, 0);
  if (current >= now) return current;
  const next = new Date(now.getFullYear(), now.getMonth() + 1, monthDay);
  next.setHours(...String(dueTime).split(":").map(Number), 0, 0);
  return next;
}

function deadlineGroupLabel(tab) {
  if (tab === "daily") return "À faire avant…";
  if (tab === "weekly") return "À faire avant le…";
  if (tab === "monthly") return "À faire avant le…";
  return "À faire avant…";
}

function getDeadlineTasksForTab(tab, tasks) {
  if (tab === "mine") {
    return tasks.filter((task) => task.displayPeriod === "deadline" || task.priority === "deadline");
  }

  const now = getCurrentAppDate();

  // Boundary 1 : début de demain (sépare "aujourd'hui" du reste)
  const startOfTomorrow = new Date(now);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  startOfTomorrow.setHours(0, 0, 0, 0);

  // Boundary 2 : fin du 7e jour (sépare "semaine" du reste)
  const endOfSeventhDay = new Date(now);
  endOfSeventhDay.setDate(endOfSeventhDay.getDate() + 7);
  endOfSeventhDay.setHours(23, 59, 59, 999);

  return tasks.filter((task) => {
    if (task.displayPeriod !== "deadline" && task.priority !== "deadline") return false;
    const due = nextRecurringDueDate(task);
    if (!due) return false;

    if (tab === "daily")   return due < startOfTomorrow;           // aujourd'hui ou en retard
    if (tab === "weekly")  return due >= startOfTomorrow && due <= endOfSeventhDay;  // J+1 à J+7
    if (tab === "monthly") return due > endOfSeventhDay;            // au-delà de J+7
    return false;
  });
}

function taskSortValue(task) {
  const doneBy = Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean) : [];
  const completed = doneBy.length > 0 || Boolean(task.completedByPersonId);
  if (isTaskLate(task) && !completed) return 0;
  if (!completed) return 1 + urgencyBadge(task).score;
  return 10;
}

function completedIds(task) {
  const doneBy = Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean) : [];
  if (doneBy.length) return doneBy;
  return task?.completedByPersonId ? [task.completedByPersonId] : [];
}

function sortTasks(list) {
  return list.slice().sort((left, right) => {
    const valueDiff = taskSortValue(left) - taskSortValue(right);
    if (valueDiff !== 0) return valueDiff;
    const orderDiff = (left.order ?? 0) - (right.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return String(left.text || "").localeCompare(String(right.text || ""), "fr");
  });
}

export function TasksView({
  tab,
  tasks,
  allTasks = [],
  people,
  childProfiles = [],
  planningByTask = {},
  activePersonLabel = "",
  externalOpenCreate = 0,
  onAddTask,
  onUpdateTask,
  onToggleTask,
  onDeleteTask,
  onMoveTask,
}) {
  const activePeople = Array.isArray(people) ? people.filter((person) => person.active !== false) : [];
  const completers = activePeople.filter((person) => person.canCompleteTasks);
  const assignees = activePeople;
  const children = Array.isArray(childProfiles) ? childProfiles : [];
  const [showCreate, setShowCreate] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showConcernedField, setShowConcernedField] = useState(false);
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState("");
  const [form, setForm] = useState(() => defaultTaskForm(tab));
  const [dragState, setDragState] = useState(null);
  const [openMenuTaskId, setOpenMenuTaskId] = useState("");
  const taskNodeRefs = useRef(new Map());
  const pressStateRef = useRef(null);
  const dragStateRef = useRef(null);
  const suppressOpenRef = useRef("");
  const lastExternalOpenCreateRef = useRef(externalOpenCreate);

  const sortedTasks = useMemo(() => sortTasks(Array.isArray(tasks) ? tasks : []), [tasks]);
  const safeAllTasks = useMemo(() => (Array.isArray(allTasks) ? allTasks : []), [allTasks]);
  const overdueCount = sortedTasks.filter((task) => isTaskLate(task) && completedIds(task).length === 0).length;
  const doneCount = sortedTasks.filter((task) => completedIds(task).length > 0).length;
  const percentDone = sortedTasks.length ? Math.round((doneCount / sortedTasks.length) * 100) : 0;

  const allDeadlineTasks = useMemo(() => {
    const list = safeAllTasks.filter((task) => task.priority === "deadline" || task.displayPeriod === "deadline");
    const withDue = list.filter((task) => task.dueDate).slice().sort((a, b) => {
      const aDate = getDueDateTime(a)?.getTime() ?? Infinity;
      const bDate = getDueDateTime(b)?.getTime() ?? Infinity;
      return aDate - bDate;
    });
    const withoutDue = list.filter((task) => !task.dueDate);
    return [...withDue, ...withoutDue];
  }, [safeAllTasks]);

  const deadlineTasks = useMemo(() => sortTasks(getDeadlineTasksForTab(tab, safeAllTasks)), [tab, safeAllTasks]);
  const recurringTasks = useMemo(
    () => sortedTasks.filter((task) => task.taskKind === "recurring" && task.priority !== "deadline"),
    [sortedTasks],
  );
  const uniqueTasks = useMemo(
    () => sortedTasks.filter((task) => task.taskKind !== "recurring" && task.priority !== "deadline"),
    [sortedTasks],
  );

  // Toutes les tâches terminées (deadline + récurrentes + uniques) pour la section du bas
  const completedTasks = useMemo(
    () => [
      ...deadlineTasks.filter((t) => completedIds(t).length > 0),
      ...recurringTasks.filter((t) => completedIds(t).length > 0),
      ...uniqueTasks.filter((t) => completedIds(t).length > 0),
    ],
    [deadlineTasks, recurringTasks, uniqueTasks],
  );

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

    function findClosestHoverTaskId(pointerY, visibleIds) {
      let bestId = visibleIds[0] || "";
      let bestDistance = Infinity;
      visibleIds.forEach((taskId) => {
        const node = taskNodeRefs.current.get(taskId);
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        const distance = Math.abs(pointerY - centerY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = taskId;
        }
      });
      return bestId;
    }

    function handlePointerMove(event) {
      const activeDrag = dragStateRef.current;
      if (activeDrag) {
        if (event.cancelable) event.preventDefault();
        const hoverTaskId = findClosestHoverTaskId(event.clientY, activeDrag.visibleIds);
        setDragState((previous) => (previous
          ? {
              ...previous,
              pointerY: event.clientY,
              pointerX: event.clientX,
              hoverTaskId: hoverTaskId || previous.hoverTaskId,
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

      const sourceIndex = activeDrag.visibleIds.indexOf(activeDrag.taskId);
      const targetIndex = activeDrag.visibleIds.indexOf(activeDrag.hoverTaskId);
      if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
        onMoveTask(activeDrag.taskId, targetIndex, activeDrag.groupKey, activeDrag.visibleIds);
      }
      suppressOpenRef.current = activeDrag.taskId;
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
  }, [onMoveTask]);

  // Ferme le menu "…" si on clique ailleurs
  useEffect(() => {
    if (!openMenuTaskId) return undefined;
    let timerId;
    function handleDocClick() { setOpenMenuTaskId(""); }
    timerId = setTimeout(() => document.addEventListener("click", handleDocClick), 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener("click", handleDocClick);
    };
  }, [openMenuTaskId]);

  // FAB external trigger — open create modal when the FAB is pressed from App.js
  useEffect(() => {
    if (externalOpenCreate > lastExternalOpenCreateRef.current) {
      openCreate();
    }
    lastExternalOpenCreateRef.current = externalOpenCreate;
  }, [externalOpenCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm(nextTab = tab) {
    setForm(defaultTaskForm(nextTab));
    setShowEmojiPicker(false);
    setShowConcernedField(false);
  }

  function openCreate() {
    setEditingTaskId("");
    resetForm(tab);
    setShowCreate(true);
  }

  function closeCreate() {
    setShowCreate(false);
    setEditingTaskId("");
    resetForm(tab);
  }

  function openTaskDetails(taskId) {
    setSelectedTaskId(taskId);
  }

  function closeTaskDetails() {
    setSelectedTaskId("");
  }

  function openEditTask(task) {
    const planning = planningByTask?.[task.id] || null;
    const durPreset = planning
      ? durationToPreset(planning.duration || 60, Boolean(planning.allDay))
      : { preset: "60", customValue: 1, customUnit: "hours" };
    setEditingTaskId(task.id);
    setSelectedTaskId("");
    setForm({
      ...defaultTaskForm(tab),
      icon: task.icon || "",
      text: task.text || "",
      assignedPersonIds: Array.isArray(task.assignedPersonIds) && task.assignedPersonIds.length
        ? task.assignedPersonIds
        : task.assignedPersonId ? [task.assignedPersonId] : [],
      assignedWholeFamily: Boolean(task.assignedWholeFamily),
      concernedPersonIds: Array.isArray(task.concernedPersonIds) ? task.concernedPersonIds : [],
      priority: task.priority || "normal",
      displayPeriod: task.displayPeriod || task.type || tab,
      taskKind: task.taskKind || "single",
      recurrenceFrequency: task.recurrenceFrequency || "daily",
      dueDate: task.dueDate || "",
      dueTime: task.dueTime || "",
      addToCalendar: Boolean(planning),
      calendarDateKey: planning?.dateKey || localDateKey(getCurrentAppDate()),
      calendarStart: planning?.start || "09:00",
      calendarAllDay: Boolean(planning?.allDay),
      calendarDurationPreset: durPreset.preset,
      calendarCustomDurationValue: durPreset.customValue,
      calendarCustomDurationUnit: durPreset.customUnit,
      calendarPersonIds: planning?.personIds || [],
      calendarWholeFamily: Boolean(planning?.wholeFamily),
      calendarConcernedPersonIds: planning?.concernedPersonIds || planning?.childIds || [],
      calendarRepeatWeekly: Boolean(planning?.recurring),
    });
    setShowCreate(true);
  }

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function toggleAssignedPerson(personId) {
    setForm((previous) => ({
      ...previous,
      assignedWholeFamily: false,
      assignedPersonIds: previous.assignedPersonIds.includes(personId)
        ? previous.assignedPersonIds.filter((id) => id !== personId)
        : [...previous.assignedPersonIds, personId],
    }));
  }

  function toggleConcernedPerson(personId) {
    setForm((previous) => ({
      ...previous,
      concernedPersonIds: previous.concernedPersonIds.includes(personId)
        ? previous.concernedPersonIds.filter((id) => id !== personId)
        : [...previous.concernedPersonIds, personId],
    }));
  }

  function toggleCalendarPerson(personId) {
    setForm((previous) => ({
      ...previous,
      calendarWholeFamily: false,
      calendarPersonIds: previous.calendarPersonIds.includes(personId)
        ? previous.calendarPersonIds.filter((id) => id !== personId)
        : [...previous.calendarPersonIds, personId],
    }));
  }

  function toggleCalendarConcernedPerson(personId) {
    setForm((previous) => ({
      ...previous,
      calendarConcernedPersonIds: (previous.calendarConcernedPersonIds || []).includes(personId)
        ? (previous.calendarConcernedPersonIds || []).filter((id) => id !== personId)
        : [...(previous.calendarConcernedPersonIds || []), personId],
    }));
  }

  function registerTaskNode(taskId, node) {
    if (node) {
      taskNodeRefs.current.set(taskId, node);
    } else {
      taskNodeRefs.current.delete(taskId);
    }
  }

  function handleTaskMainPointerDown(event, task, groupKey, visibleIds) {
    if (event.button !== undefined && event.button !== 0) return;
    if (!Array.isArray(visibleIds) || visibleIds.length < 2) return;

    if (pressStateRef.current?.timer) clearTimeout(pressStateRef.current.timer);
    const taskNode = taskNodeRefs.current.get(task.id);
    if (!taskNode) return;

    const startX = event.clientX;
    const startY = event.clientY;
    pressStateRef.current = {
      taskId: task.id,
      startX,
      startY,
      timer: setTimeout(() => {
        const rect = taskNode.getBoundingClientRect();
        setDragState({
          taskId: task.id,
          groupKey,
          visibleIds,
          hoverTaskId: task.id,
          pointerX: startX,
          pointerY: startY,
          offsetY: startY - rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
        suppressOpenRef.current = task.id;
        pressStateRef.current = null;
      }, LONG_PRESS_MS),
    };
  }

  function preventTaskSelection(event) {
    if (event?.cancelable) event.preventDefault();
  }

  function getDragPreviewForList(list, moveGroupKey) {
    if (!dragState || dragState.groupKey !== moveGroupKey || !Array.isArray(list) || list.length < 2) return null;
    const sourceIndex = list.findIndex((item) => item.id === dragState.taskId);
    const hoverIndex = list.findIndex((item) => item.id === dragState.hoverTaskId);
    if (sourceIndex < 0 || hoverIndex < 0) return null;
    if (sourceIndex === hoverIndex) {
      return {
        anchorTaskId: list[sourceIndex]?.id || "",
        position: "before",
        height: dragState.height || 82,
        sourceIndex,
        hoverIndex,
      };
    }
    return {
      anchorTaskId: list[hoverIndex]?.id || "",
      position: sourceIndex < hoverIndex ? "after" : "before",
      height: dragState.height || 82,
      sourceIndex,
      hoverIndex,
    };
  }

  function getDragMotionClass(taskId, list, moveGroupKey) {
    const preview = getDragPreviewForList(list, moveGroupKey);
    if (!preview) return "";
    const currentIndex = list.findIndex((item) => item.id === taskId);
    if (currentIndex < 0) return "";
    if (taskId === dragState?.taskId) return "drag-source";
    if (preview.sourceIndex < preview.hoverIndex && currentIndex > preview.sourceIndex && currentIndex <= preview.hoverIndex) {
      return "reorder-shift-up";
    }
    if (preview.sourceIndex > preview.hoverIndex && currentIndex >= preview.hoverIndex && currentIndex < preview.sourceIndex) {
      return "reorder-shift-down";
    }
    return "";
  }

  function renderDropPlaceholder(preview, suffix = "") {
    if (!preview?.anchorTaskId) return null;
    return html`
      <div
        key=${`drop-${preview.anchorTaskId}-${preview.position}-${suffix}`}
        className="task-drop-placeholder"
        style=${{ height: `${Math.max(60, Math.round(preview.height || 82))}px` }}
      ></div>
    `;
  }

  function handleTaskMainClick(taskId) {
    if (suppressOpenRef.current === taskId) {
      suppressOpenRef.current = "";
      return;
    }
    openTaskDetails(taskId);
  }

  function submitTask(event) {
    event.preventDefault();
    if (!form.text.trim()) return;
    const isDeadline = form.priority === "deadline" || form.displayPeriod === "deadline";
    if (isDeadline && !form.dueDate) return;
    const recurrenceFrequency = form.displayPeriod === "daily" ? "daily"
      : form.displayPeriod === "weekly" ? "weekly"
      : form.displayPeriod === "monthly" ? "monthly"
      : form.recurrenceFrequency;
    const payload = {
      ...form,
      recurrenceFrequency,
      calendarPersonIds: form.assignedPersonIds,
      calendarWholeFamily: form.assignedWholeFamily,
      calendarConcernedPersonIds: form.concernedPersonIds,
      calendarRepeatWeekly: form.taskKind === "recurring" && !isDeadline && form.calendarRecurConfirm === "yes",
    };
    if (editingTaskId) {
      onUpdateTask(editingTaskId, payload);
    } else {
      onAddTask(tab, payload);
    }
    closeCreate();
  }

  function renderTaskCard(task, list, moveGroupKey) {
            const index = list.findIndex((item) => item.id === task.id);
            const doneIds = completedIds(task);
            const completedPeople = doneIds
              .map((personId) => activePeople.find((person) => person.id === personId) || null)
              .filter(Boolean);
            const assignedPersonIds = Array.isArray(task.assignedPersonIds) && task.assignedPersonIds.length
              ? task.assignedPersonIds
              : task.assignedPersonId ? [task.assignedPersonId] : [];
            const assignedPersons = assignedPersonIds
              .map((id) => activePeople.find((p) => p.id === id) || null)
              .filter(Boolean);
            const completedAtLabel = task.completedAt
              ? new Date(task.completedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
              : "";
            const isDragging = dragState?.taskId === task.id;
            const isDropTarget = dragState?.groupKey === moveGroupKey && dragState?.hoverTaskId === task.id && !isDragging;
            const dragMotionClass = getDragMotionClass(task.id, list, moveGroupKey);
            const taskUrgency = urgencyBadge(task);
            const isDone = doneIds.length > 0;
            const planning = planningByTask?.[task.id] || null;
            const planningMeta = (() => {
              if (!planning) return "";
              const parts = String(planning.dateKey || "").split("-");
              const dateFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : (planning.dateKey || "");
              if (!dateFmt) return "";
              let meta = dateFmt;
              if (!planning.allDay && planning.start) meta += ` · ${planning.start}`;
              const concernedIds = Array.isArray(planning.concernedPersonIds) && planning.concernedPersonIds.length
                ? planning.concernedPersonIds
                : (Array.isArray(planning.childIds) ? planning.childIds : []);
              const concernedPerson = concernedIds.length
                ? (children.find((c) => c.id === concernedIds[0]) || activePeople.find((p) => p.id === concernedIds[0]))
                : null;
              if (concernedPerson?.label) meta += ` · ${String(concernedPerson.label).split(" ")[0]}`;
              return meta;
            })();

            return html`
              <article
                className=${`task-card ${isDone ? "done" : ""} ${isTaskLate(task) && !isDone ? "overdue" : ""} ${isDragging ? "drag-source" : ""} ${isDropTarget ? "reorder-target" : ""} ${dragMotionClass}`}
                key=${task.id}
                ref=${(node) => registerTaskNode(task.id, node)}
              >
                <div className="task-card-top">
                  <div
                    className="task-main"
                    onPointerDown=${(event) => handleTaskMainPointerDown(event, task, moveGroupKey, list.map((item) => item.id))}
                    onSelectStart=${preventTaskSelection}
                    onDragStart=${preventTaskSelection}
                  >
                    <div className=${`task-headline ${task.icon ? "" : "no-emoji"}`}>
                      ${task.icon ? html`<span className="task-emoji has-emoji">${task.icon}</span>` : null}
                      <div className="task-content">
                        <div className="task-name">${task.text}</div>
                        <div className="task-badges">
                          ${taskUrgency.className !== "normal" ? html`<span className=${`ttag task-priority ${taskUrgency.className}`}>${taskUrgency.label}</span>` : null}
                          ${task.assignedWholeFamily ? html`<span className="task-assigned-chip" style=${{ background: "#8B7355" }} title="Toute la famille">🏠</span>` : null}
                          ${!task.assignedWholeFamily ? assignedPersons.map((p) => html`<span key=${p.id} className="task-assigned-chip" style=${{ background: p.color || "#8B7355" }} title=${p.label}>${p.shortId || String(p.label || "?")[0].toUpperCase()}</span>`) : null}
                          ${isTaskLate(task) && !isDone ? html`<span className="ttag lateTag">Retard</span>` : null}
                        </div>
                      </div>
                    </div>
                    ${planningMeta ? html`<div className="task-assignee">📅 ${planningMeta}</div>` : null}
                    ${completedPeople.length
                      ? html`<div className="task-completed">Faite par : ${completedPeople.map((person) => person.label).join(", ")}${completedAtLabel ? ` - ${completedAtLabel}` : ""}</div>`
                      : null}
                  </div>

                  <div className="task-side">
                    <div className="task-people task-people-side">
                      ${completers.length
                        ? completers.map((person) => {
                            const isSelected = doneIds.includes(person.id);
                            return html`
                              <button
                                key=${`${task.id}-${person.id}`}
                                className=${`task-person-chip ${isSelected ? "on" : ""}`}
                                style=${isSelected ? { background: person.color, borderColor: person.color, color: "var(--mrd-white)" } : { background: "var(--mrd-white)", borderColor: person.color || "var(--mrd-border)", color: person.color || "var(--mrd-fg3)" }}
                                onClick=${() => onToggleTask(task.id, person.id)}
                                title=${`Marquer ${person.label} comme personne ayant fait la tâche`}
                              >
                                <span className="task-person-avatar" style=${isSelected ? { background: "transparent", color: "var(--mrd-white)" } : { background: "var(--mrd-white)", color: person.color || "var(--mrd-fg3)" }}>
                                  ${person.shortId}
                                </span>
                              </button>
                            `;
                          })
                        : html`<div className="mini">Ajoute une personne du foyer capable de valider les tâches.</div>`}
                      <div className="task-order-actions">
                        <button className="task-order-btn" disabled=${index === 0} onClick=${() => onMoveTask(task.id, -1, moveGroupKey)} title="Monter">↑</button>
                        <button className="task-order-btn" disabled=${index === list.length - 1} onClick=${() => onMoveTask(task.id, 1, moveGroupKey)} title="Descendre">↓</button>
                      </div>
                    </div>
                    <div className="task-menu-wrap">
                      <button
                        className="task-menu-btn"
                        onClick=${(event) => { event.stopPropagation(); setOpenMenuTaskId((prev) => (prev === task.id ? "" : task.id)); }}
                        title="Actions"
                      >⋮</button>
                      ${openMenuTaskId === task.id ? html`
                        <div className="task-menu-dropdown" onClick=${(e) => e.stopPropagation()}>
                          <button className="task-menu-item" onClick=${() => { openEditTask(task); setOpenMenuTaskId(""); }}>Modifier</button>
                          <button className="task-menu-item task-menu-item-danger" onClick=${() => { onDeleteTask(task.id); setOpenMenuTaskId(""); }}>Supprimer</button>
                        </div>
                      ` : null}
                    </div>
                  </div>
                </div>
              </article>
            `;
  }

  function renderTaskList(list, title) {
    if (!list.length) return null;
    const activeList = list.filter((task) => completedIds(task).length === 0);
    if (!activeList.length) return null;
    const sampleTask = list[0];
    const moveGroupKey = `${sampleTask.type}:${sampleTask.taskKind === "recurring" ? "recurring" : "single"}`;
    const dragPreview = getDragPreviewForList(activeList, moveGroupKey);
    return html`
      <section className="task-group">
        <div className="div">${title}</div>
        <div className=${`task-stack ${dragPreview ? "is-dragging" : ""}`}>
          ${activeList.map((task) => {
            const isSourceTask = dragPreview && dragState?.taskId === task.id;
            return html`
              ${dragPreview && dragPreview.position === "before" && dragPreview.anchorTaskId === task.id ? renderDropPlaceholder(dragPreview, `${moveGroupKey}-before`) : null}
              ${!isSourceTask ? renderTaskCard(task, activeList, moveGroupKey) : null}
              ${dragPreview && dragPreview.position === "after" && dragPreview.anchorTaskId === task.id ? renderDropPlaceholder(dragPreview, `${moveGroupKey}-after`) : null}
            `;
          })}
        </div>
      </section>
    `;
  }

  function renderDeadlineTaskList(list, title) {
    if (!list.length) return null;
    const activeList = list.filter((task) => completedIds(task).length === 0);
    if (!activeList.length) return null;
    const moveGroupKey = `deadline:${list[0].taskKind === "recurring" ? "recurring" : "single"}`;
    const dragPreview = getDragPreviewForList(activeList, moveGroupKey);
    return html`
      <section className="task-group">
        <div className="div">${title}</div>
        <div className=${`task-stack ${dragPreview ? "is-dragging" : ""}`}>
          ${activeList.map((task) => {
            const isSourceTask = dragPreview && dragState?.taskId === task.id;
            return html`
              ${dragPreview && dragPreview.position === "before" && dragPreview.anchorTaskId === task.id ? renderDropPlaceholder(dragPreview, `${moveGroupKey}-before`) : null}
              ${!isSourceTask ? renderTaskCard(task, activeList, moveGroupKey) : null}
              ${dragPreview && dragPreview.position === "after" && dragPreview.anchorTaskId === task.id ? renderDropPlaceholder(dragPreview, `${moveGroupKey}-after`) : null}
            `;
          })}
        </div>
      </section>
    `;
  }

  function renderAllDeadlineCard(task) {
    const doneIds = completedIds(task);
    const isDone = doneIds.length > 0;
    const isLate = isTaskLate(task) && !isDone;
    const badge = urgencyBadge(task);
    const due = getDueDateTime(task);
    const dueFr = due
      ? due.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "Pas de date définie";
    const assignedIds = Array.isArray(task.assignedPersonIds) && task.assignedPersonIds.length
      ? task.assignedPersonIds
      : task.assignedPersonId ? [task.assignedPersonId] : [];
    const assignedLabels = task.assignedWholeFamily
      ? ["Toute la famille"]
      : assignedIds.map((id) => activePeople.find((p) => p.id === id)?.label).filter(Boolean);
    return html`
      <article key=${task.id} className=${`task-card ${isDone ? "done" : ""} ${isLate ? "overdue" : ""}`}
        style=${{ marginBottom: "8px" }}>
        <div className="task-card-top">
          <div className="task-main">
            <div className=${`task-headline ${task.icon ? "" : "no-emoji"}`}>
              ${task.icon ? html`<span className="task-emoji has-emoji">${task.icon}</span>` : null}
              <div className="task-content">
                <div className="task-name">${task.text}</div>
                <div className="task-badges">
                  <span className=${`ttag task-priority ${badge.className}`}>${badge.label}</span>
                  ${isLate ? html`<span className="ttag lateTag">En retard</span>` : null}
                  ${isDone ? html`<span className="ttag" style=${{ background: "var(--mrd-sageLt)", color: "var(--mrd-sageDeep)" }}>✓ Faite</span>` : null}
                </div>
                <div className="mini" style=${{ marginTop: "2px" }}>📅 ${dueFr}</div>
                ${assignedLabels.length ? html`<div className="mini">Attribué à : ${assignedLabels.join(", ")}</div>` : null}
              </div>
            </div>
          </div>
          <button className="delbtn task-delete" onClick=${() => onDeleteTask(task.id)}>×</button>
        </div>
      </article>
    `;
  }

  function renderDeadlineTaskCard(task, index, list) {
    const doneIds = completedIds(task);
    const completedPeople = doneIds
      .map((personId) => activePeople.find((person) => person.id === personId) || null)
      .filter(Boolean);
    const assignedPerson = activePeople.find((person) => person.id === task.assignedPersonId) || null;
    const completedAtLabel = task.completedAt
      ? new Date(task.completedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : "";
    const taskUrgency = urgencyBadge(task);
    const moveGroupKey = `deadline:${task.taskKind === "recurring" ? "recurring" : "single"}`;
    const isDone = doneIds.length > 0;

    return html`
        <article className=${`task-card ${isDone ? "done" : ""} ${isTaskLate(task) && !isDone ? "overdue" : ""}`} key=${task.id}>
        <div className="task-card-top">
          <div className="task-main">
            <div className=${`task-headline ${task.icon ? "" : "no-emoji"}`}>
              ${task.icon ? html`<span className="task-emoji has-emoji">${task.icon}</span>` : null}
              <div className="task-content">
                <div className="task-name">${task.text}</div>
                <div className="task-badges">
                  <span className=${`ttag task-priority ${taskUrgency.className || "normal"}`}>${taskUrgency.label}</span>
              ${task.taskKind === "recurring" ? html`<span className="ttag recTag">${recurrenceLabel(task)}</span>` : null}
              ${isTaskLate(task) && !isDone ? html`<span className="ttag lateTag">Retard</span>` : null}
                </div>
              </div>
            </div>
            ${assignedPerson ? html`<div className="task-assignee">Attribuée à : ${assignedPerson.label}</div>` : null}
            ${completedPeople.length
              ? html`<div className="task-completed">Faite par : ${completedPeople.map((person) => person.label).join(", ")}${completedAtLabel ? ` - ${completedAtLabel}` : ""}</div>`
              : null}
          </div>

          <div className="task-side">
            <div className="task-people task-people-side">
              ${completers.length
                ? completers.map(
                    (person) => html`
                      <button
                        key=${`${task.id}-${person.id}`}
                        className=${`task-person-chip ${doneIds.includes(person.id) ? "on" : ""}`}
                        style=${doneIds.includes(person.id)
                          ? { background: person.color, borderColor: person.color, color: "#fff" }
                          : { background: "var(--mrd-white)", borderColor: person.color || "var(--mrd-border)", color: person.color || "var(--mrd-fg3)" }}
                        onClick=${() => onToggleTask(task.id, person.id)}
                        title=${`Marquer ${person.label} comme personne ayant fait la tâche`}
                      >
                        <span
                          className="task-person-avatar"
                          style=${doneIds.includes(person.id)
                            ? { background: "transparent", color: "var(--mrd-white)" }
                            : { background: "var(--mrd-white)", color: person.color || "var(--mrd-fg3)" }}
                        >
                          ${person.shortId}
                        </span>
                      </button>
                    `,
                  )
                : html`<div className="mini">Ajoute une personne du foyer capable de valider les tâches.</div>`}
              <div className="task-order-actions">
                <button className="task-order-btn" disabled=${index === 0} onClick=${() => onMoveTask(task.id, -1, moveGroupKey)} title="Monter">↑</button>
                <button className="task-order-btn" disabled=${index === list.length - 1} onClick=${() => onMoveTask(task.id, 1, moveGroupKey)} title="Descendre">↓</button>
              </div>
            </div>
            <button className="delbtn task-delete" onClick=${() => onDeleteTask(task.id)}>X</button>
          </div>
        </div>
      </article>
    `;
  }

  return html`
    <section>
      <div className="sh">
        <div className="sl">
          <span className="st">${blockTitle(tab)}</span>
          <span className="sc">${doneCount}/${sortedTasks.length}</span>
          ${overdueCount ? html`<span className="ttag lateTag">Retard ${overdueCount}</span>` : null}
        </div>
        <div style=${{ display: "flex", gap: "8px", alignItems: "center" }}>
          ${allDeadlineTasks.length ? html`
            <button className="clrbtn" style=${{ fontSize: "12px" }} onClick=${() => setShowAllDeadlines(true)}>
              ⏰ Échéances (${allDeadlineTasks.length})
            </button>
          ` : null}
        </div>
      </div>

      <div className="sbar"><div className="sbf" style=${{ width: `${percentDone}%` }}></div></div>

      ${sortedTasks.length === 0 && deadlineTasks.length === 0
        ? html`
            <div className="task-empty-state">
              <div className="task-empty-title">Aucune tâche pour le moment ✨</div>
              <button className="aok task-empty-btn" onClick=${openCreate}>Créer la première</button>
            </div>
          `
        : html`
            ${renderDeadlineTaskList(deadlineTasks, deadlineGroupLabel(tab))}
            ${renderTaskList(recurringTasks, "🔁 Tâches récurrentes")}
            ${renderTaskList(uniqueTasks, "✨ Tâches uniques")}
            ${completedTasks.length ? html`
              <section className="task-group">
                <div className="div">Terminées</div>
                <div className=${`task-stack ${dragState ? "is-dragging" : ""}`}>
                  ${completedTasks.map((task) => {
                    const groupKey = task.priority === "deadline"
                      ? `deadline:${task.taskKind === "recurring" ? "recurring" : "single"}`
                      : `${task.type}:${task.taskKind === "recurring" ? "recurring" : "single"}`;
                    const dragPreview = getDragPreviewForList(completedTasks, groupKey);
                    const isSourceTask = dragPreview && dragState?.taskId === task.id;
                    return html`
                      ${dragPreview && dragPreview.position === "before" && dragPreview.anchorTaskId === task.id ? renderDropPlaceholder(dragPreview, `${groupKey}-done-before`) : null}
                      ${!isSourceTask ? renderTaskCard(task, completedTasks, groupKey) : null}
                      ${dragPreview && dragPreview.position === "after" && dragPreview.anchorTaskId === task.id ? renderDropPlaceholder(dragPreview, `${groupKey}-done-after`) : null}
                    `;
                  })}
                </div>
              </section>
            ` : null}
          `}

      ${dragState
        ? (() => {
            const dragTask = safeAllTasks.find((task) => task.id === dragState.taskId);
            if (!dragTask) return null;
            return html`
              <div
                className="task-drag-ghost"
                style=${{
                  top: `${Math.max(16, dragState.pointerY - dragState.offsetY)}px`,
                  left: `${Math.max(12, dragState.left)}px`,
                  width: `${dragState.width}px`,
                }}
              >
                <div className=${`task-headline ${dragTask.icon ? "" : "no-emoji"}`}>
                  ${dragTask.icon ? html`<span className="task-emoji has-emoji">${dragTask.icon}</span>` : null}
                  <div className="task-content">
                    <div className="task-name">${dragTask.text}</div>
                  </div>
                </div>
              </div>
            `;
          })()
        : null}

      ${showAllDeadlines ? html`
        <div className="modal-backdrop" onClick=${() => setShowAllDeadlines(false)}>
          <div className="modal-card task-modal" onClick=${(event) => event.stopPropagation()}
            style=${{ maxHeight: "80vh", overflowY: "auto" }}>
            <div className="task-modal-head">
              <div>
                <div className="miniTitle">Tâches</div>
                <div className="st">Toutes les échéances</div>
              </div>
              <button className="delbtn" onClick=${() => setShowAllDeadlines(false)}>×</button>
            </div>
            ${allDeadlineTasks.length
              ? allDeadlineTasks.map(renderAllDeadlineCard)
              : html`<div className="empty">Aucune tâche avec échéance.</div>`}
          </div>
        </div>
      ` : null}

      ${showCreate ? (() => {
        const LBL = { fontSize: 11, fontWeight: 700, color: "var(--mrd-fg3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "block" };
        const PILL_BASE = { flex: 1, padding: "9px 6px", borderRadius: 12, fontSize: 12, fontWeight: 600, transition: "all 0.15s", cursor: "pointer" };
        const PILL_STACK = { flex: 1, padding: "10px 6px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, transition: "all 0.15s", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0, textAlign: "center" };
        const DISC_BASE = { display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, transition: "all 0.15s", cursor: "pointer" };
        const isDeadline = form.priority === "deadline" || form.displayPeriod === "deadline";
        const formValid = Boolean(form.text.trim()) && (!isDeadline || Boolean(form.dueDate));
        const allMembers = [...assignees, ...children];
        const recurrenceHint = form.displayPeriod === "daily" ? "chaque jour"
          : form.displayPeriod === "weekly" ? "chaque semaine"
          : form.displayPeriod === "monthly" ? "chaque mois" : null;

        return html`
          <div className="modal-backdrop task-create-backdrop" onClick=${closeCreate}>
            <div className="modal-card task-modal-redesign" onClick=${(e) => e.stopPropagation()}>

              <div className="mrd-mhd">
                <span className="mrd-mtitle">${editingTaskId ? "Modifier la tâche" : "Nouvelle tâche"}</span>
                <button type="button" onClick=${closeCreate} className="mrd-mclose">✕</button>
              </div>

              <form onSubmit=${submitTask} className="mrd-mbody">

                <!-- 1. Emoji + Nom -->
                <div style=${{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <button type="button"
                    onClick=${() => setShowEmojiPicker(true)}
                    title="Choisir un emoji"
                    style=${{ width: 50, height: 50, borderRadius: 14, background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-border)", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "border-color 0.15s" }}
                  >${form.icon ? html`<span>${form.icon}</span>` : html`<span style=${{ fontSize: 18, color: "var(--mrd-fg3)" }}>😊</span>`}</button>
                  <div style=${{ flex: 1, background: "var(--mrd-surf2)", borderRadius: 14, border: "1.5px solid " + (form.text ? "var(--mrd-a)" : "var(--mrd-border)"), padding: "12px 14px", transition: "border-color 0.15s" }}>
                    <input
                      value=${form.text}
                      onInput=${(e) => updateForm("text", e.target.value)}
                      placeholder="Nom de la tâche…"
                      autoFocus
                      style=${{ width: "100%", background: "none", border: "none", fontSize: 16, fontWeight: 600, color: "var(--mrd-fg)", outline: "none", padding: 0 }}
                    />
                  </div>
                </div>

                <!-- 2. Période -->
                <div>
                  <span className="mrd-mlbl">Période</span>
                  <div style=${{ display: "flex", gap: 6 }}>
                    ${[
                      { id: "daily",   label: "Aujourd’hui", icon: "☀️" },
                      { id: "weekly",  label: "Semaine",     icon: "📅" },
                      { id: "monthly", label: "Mois",        icon: "🗓️" },
                    ].map((t) => {
                      const on = !isDeadline && form.displayPeriod === t.id;
                      return html`
                        <button key=${t.id} type="button"
                          style=${{ ...PILL_STACK, background: on ? "var(--mrd-a)" : "var(--mrd-surf2)", color: on ? "#fff" : "var(--mrd-fg2)", border: "1.5px solid " + (on ? "var(--mrd-a)" : "var(--mrd-border)") }}
                          onClick=${() => { updateForm("displayPeriod", t.id); if (form.priority === "deadline") updateForm("priority", "normal"); }}
                        >
                          <span style=${{ fontSize: 18, lineHeight: 1 }}>${t.icon}</span>
                          <span>${t.label}</span>
                        </button>
                      `;
                    })}
                    ${(() => {
                      const on = isDeadline;
                      return html`
                        <button type="button"
                          style=${{ ...PILL_STACK, background: on ? "var(--mrd-amberLt)" : "var(--mrd-surf2)", color: on ? "var(--mrd-amber)" : "var(--mrd-fg2)", border: "1.5px solid " + (on ? "var(--mrd-amberMd)" : "var(--mrd-border)"), fontWeight: on ? 700 : 600 }}
                          onClick=${() => { updateForm("displayPeriod", "deadline"); updateForm("priority", "deadline"); }}
                        >
                          <span style=${{ fontSize: 18, lineHeight: 1 }}>⏰</span>
                          <span>À faire avant</span>
                        </button>
                      `;
                    })()}
                  </div>
                  ${isDeadline ? html`
                    <div style=${{ display: "flex", gap: 8, marginTop: 8 }}>
                      <input type="date" value=${form.dueDate || ""}
                        onInput=${(e) => updateForm("dueDate", e.target.value)}
                        style=${{ flex: 1, background: "var(--mrd-surf2)", border: "1px solid var(--mrd-border)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "var(--mrd-fg)", outline: "none" }}
                      />
                      <input type="time" value=${form.dueTime || ""}
                        onInput=${(e) => updateForm("dueTime", e.target.value)}
                        style=${{ flex: 1, background: "var(--mrd-surf2)", border: "1px solid var(--mrd-border)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "var(--mrd-fg)", outline: "none" }}
                      />
                    </div>
                  ` : null}
                </div>

                <!-- 3. Type de tâche (masqué si À faire avant) -->
                ${!isDeadline ? html`
                  <div>
                    <span className="mrd-mlbl">Type</span>
                    <div style=${{ display: "flex", gap: 6 }}>
                      ${[
                        { id: "single",    label: "Unique",     icon: "✨" },
                        { id: "recurring", label: "Récurrente", icon: "🔁" },
                      ].map((k) => {
                        const on = form.taskKind === k.id;
                        return html`
                          <button key=${k.id} type="button"
                            style=${{ ...PILL_STACK, background: on ? "var(--mrd-a)" : "var(--mrd-surf2)", color: on ? "#fff" : "var(--mrd-fg2)", border: "1.5px solid " + (on ? "var(--mrd-a)" : "var(--mrd-border)") }}
                            onClick=${() => updateForm("taskKind", k.id)}
                          >
                            <span style=${{ fontSize: 18, lineHeight: 1 }}>${k.icon}</span>
                            <span>${k.label}</span>
                          </button>
                        `;
                      })}
                    </div>
                    ${form.taskKind === "recurring" && recurrenceHint ? html`
                      <div style=${{ fontSize: 11, color: "var(--mrd-fg3)", marginTop: 5, paddingLeft: 2 }}>Se répète ${recurrenceHint}</div>
                    ` : null}
                  </div>
                ` : null}

                <!-- 4. Urgent toggle (masqué si À faire avant) -->
                ${!isDeadline ? html`
                  <div>
                    <button type="button"
                      onClick=${() => updateForm("priority", form.priority === "urgent" ? "normal" : "urgent")}
                      title=${form.priority === "urgent" ? "Urgente — cliquer pour retirer" : "Marquer comme urgente"}
                      style=${{ width: 44, height: 44, borderRadius: 12, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s", background: form.priority === "urgent" ? "var(--mrd-dangerLt)" : "var(--mrd-surf2)", border: "1.5px solid " + (form.priority === "urgent" ? "var(--mrd-dangerMd)" : "var(--mrd-border)"), boxShadow: form.priority === "urgent" ? "0 0 0 3px oklch(90% 0.07 15 / 0.25)" : "none" }}
                    >🚨</button>
                  </div>
                ` : null}

                <!-- 5. Attribué à -->
                <div>
                  <span className="mrd-mlbl">Attribué à</span>
                  <div style=${{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button type="button"
                      onClick=${() => setForm((prev) => ({ ...prev, assignedWholeFamily: !prev.assignedWholeFamily, assignedPersonIds: [] }))}
                      title="Toute la famille"
                      style=${{ width: 40, height: 40, borderRadius: "50%", border: "2px solid " + (form.assignedWholeFamily ? "var(--mrd-a)" : "var(--mrd-border)"), background: form.assignedWholeFamily ? "var(--mrd-aLt)" : "var(--mrd-surf2)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}
                    >👥</button>
                    ${assignees.map((person) => {
                      const on = form.assignedPersonIds.includes(person.id);
                      return html`
                        <button key=${person.id} type="button"
                          onClick=${() => toggleAssignedPerson(person.id)}
                          title=${person.label}
                          style=${{ width: 40, height: 40, borderRadius: "50%", padding: 0, border: "2.5px solid " + (on ? (person.color || "var(--mrd-a)") : "var(--mrd-border)"), background: "transparent", cursor: "pointer", flexShrink: 0, transition: "all 0.15s", boxShadow: on ? "0 0 0 2px " + (person.color || "var(--mrd-a)") + "33" : "none" }}>
                          <div style=${{ width: 35, height: 35, borderRadius: "50%", background: person.color || "var(--mrd-fg2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mrd-white)", fontSize: 13, fontWeight: 700, margin: "auto" }}>
                            ${person.shortId || String(person.label || "?")[0].toUpperCase()}
                          </div>
                        </button>
                      `;
                    })}
                  </div>
                </div>

                <!-- 6. Boutons discrets -->
                <div style=${{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button type="button"
                    onClick=${() => setShowConcernedField((v) => !v)}
                    style=${{ ...DISC_BASE, background: showConcernedField ? "var(--mrd-aLt)" : "var(--mrd-surf2)", color: showConcernedField ? "var(--mrd-a)" : "var(--mrd-fg3)", border: "1px solid " + (showConcernedField ? "var(--mrd-aMd)" : "var(--mrd-border)") }}
                  >${showConcernedField ? "✓" : "+"} Personne concernée</button>

                  <button type="button"
                    onClick=${() => updateForm("addToCalendar", !form.addToCalendar)}
                    style=${{ ...DISC_BASE, background: form.addToCalendar ? "var(--mrd-aLt)" : "var(--mrd-surf2)", color: form.addToCalendar ? "var(--mrd-a)" : "var(--mrd-fg3)", border: "1px solid " + (form.addToCalendar ? "var(--mrd-aMd)" : "var(--mrd-border)") }}
                  >📅 Calendrier</button>
                </div>

                <!-- 7. Personne concernée (si activée) -->
                ${showConcernedField ? html`
                  <div>
                    <span className="mrd-mlbl">Personne concernée</span>
                    <div style=${{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                      ${allMembers.map((person) => {
                        const on = form.concernedPersonIds.includes(person.id);
                        return html`
                          <button key=${person.id} type="button"
                            onClick=${() => toggleConcernedPerson(person.id)}
                            style=${{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 5px", borderRadius: 99, border: "2px solid " + (on ? (person.color || "var(--mrd-a)") : "var(--mrd-border)"), background: on ? (person.color || "var(--mrd-a)") + "15" : "transparent", cursor: "pointer", transition: "all 0.15s" }}>
                            <div style=${{ width: 26, height: 26, borderRadius: "50%", background: person.color || "var(--mrd-fg2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mrd-white)", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              ${person.shortId || String(person.label || "?")[0].toUpperCase()}
                            </div>
                            <span style=${{ fontSize: 12, fontWeight: 600, color: on ? "var(--mrd-fg)" : "var(--mrd-fg2)" }}>${person.label}</span>
                          </button>
                        `;
                      })}
                    </div>
                  </div>
                ` : null}

                <!-- 8. Calendrier (si activé) -->
                ${form.addToCalendar ? html`
                  <div style=${{ display: "flex", flexDirection: "column", gap: 12, background: "var(--mrd-surf2)", borderRadius: 16, padding: "14px 14px 12px", border: "1px solid var(--mrd-borderSoft)" }}>
                    <span className="mrd-mlbl" style=${{ marginBottom: 0 }}>Planification calendrier</span>

                    <div style=${{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="date" value=${form.calendarDateKey}
                        onInput=${(e) => updateForm("calendarDateKey", e.target.value)}
                        style=${{ flex: 1, minWidth: 120, background: "var(--mrd-surf)", border: "1px solid var(--mrd-border)", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "var(--mrd-fg)", outline: "none" }}
                      />
                      <input type="time" value=${form.calendarStart}
                        disabled=${form.calendarAllDay}
                        onInput=${(e) => updateForm("calendarStart", e.target.value)}
                        style=${{ flex: 1, minWidth: 90, background: "var(--mrd-surf)", border: "1px solid var(--mrd-border)", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: form.calendarAllDay ? "var(--mrd-fg3)" : "var(--mrd-fg)", outline: "none" }}
                      />
                      <button type="button"
                        onClick=${() => setForm((prev) => { const next = !prev.calendarAllDay; return { ...prev, calendarAllDay: next, calendarDurationPreset: next ? "all-day" : "none" }; })}
                        style=${{ padding: "8px 11px", borderRadius: 10, fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s", background: form.calendarAllDay ? "var(--mrd-a)" : "var(--mrd-surf)", color: form.calendarAllDay ? "#fff" : "var(--mrd-fg3)", border: "1px solid " + (form.calendarAllDay ? "var(--mrd-a)" : "var(--mrd-border)") }}
                      >Toute la journée</button>
                    </div>

                    ${!form.calendarAllDay ? html`
                      <div>
                        <span className="mrd-mlbl" style=${{ fontSize: 10 }}>Durée</span>
                        <div style=${{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          ${[
                            { id: "none",   label: "Sans durée" },
                            { id: "30",     label: "30 min" },
                            { id: "60",     label: "1 h" },
                            { id: "120",    label: "2 h" },
                            { id: "custom", label: "Autre" },
                          ].map((opt) => {
                            const on = form.calendarDurationPreset === opt.id;
                            return html`
                              <button key=${opt.id} type="button"
                                style=${{ padding: "6px 10px", borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: on ? "var(--mrd-a)" : "var(--mrd-surf)", color: on ? "#fff" : "var(--mrd-fg3)", border: "1px solid " + (on ? "var(--mrd-a)" : "var(--mrd-border)") }}
                                onClick=${() => updateForm("calendarDurationPreset", opt.id)}
                              >${opt.label}</button>
                            `;
                          })}
                        </div>
                        ${form.calendarDurationPreset === "custom" ? html`
                          <div style=${{ display: "flex", gap: 8, marginTop: 8 }}>
                            <input type="number" min="1" value=${form.calendarCustomDurationValue}
                              onInput=${(e) => updateForm("calendarCustomDurationValue", e.target.value)}
                              style=${{ flex: 1, background: "var(--mrd-surf)", border: "1px solid var(--mrd-border)", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "var(--mrd-fg)", outline: "none" }}
                            />
                            <select value=${form.calendarCustomDurationUnit}
                              onChange=${(e) => updateForm("calendarCustomDurationUnit", e.target.value)}
                              style=${{ flex: 1, background: "var(--mrd-surf)", border: "1px solid var(--mrd-border)", borderRadius: 10, padding: "9px 10px", fontSize: 13, color: "var(--mrd-fg)", outline: "none" }}>
                              <option value="minutes">minutes</option>
                              <option value="hours">heures</option>
                            </select>
                          </div>
                        ` : null}
                      </div>
                    ` : null}

                    ${form.taskKind === "recurring" && recurrenceHint ? html`
                      <div style=${{ borderTop: "1px solid var(--mrd-borderSoft)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        <span style=${{ fontSize: 12, color: "var(--mrd-fg2)", lineHeight: 1.45 }}>
                          Répéter aussi <strong>${recurrenceHint}</strong> dans le calendrier ?
                        </span>
                        <div style=${{ display: "flex", gap: 6 }}>
                          <button type="button"
                            onClick=${() => updateForm("calendarRecurConfirm", "yes")}
                            style=${{ flex: 1, padding: "7px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: form.calendarRecurConfirm === "yes" ? "var(--mrd-a)" : "var(--mrd-surf)", color: form.calendarRecurConfirm === "yes" ? "#fff" : "var(--mrd-fg3)", border: "1.5px solid " + (form.calendarRecurConfirm === "yes" ? "var(--mrd-a)" : "var(--mrd-border)") }}
                          >Oui</button>
                          <button type="button"
                            onClick=${() => updateForm("calendarRecurConfirm", "no")}
                            style=${{ flex: 1, padding: "7px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: form.calendarRecurConfirm === "no" ? "var(--mrd-surf)" : "var(--mrd-surf)", color: form.calendarRecurConfirm === "no" ? "var(--mrd-fg)" : "var(--mrd-fg3)", border: "1.5px solid " + (form.calendarRecurConfirm === "no" ? "var(--mrd-a)" : "var(--mrd-border)") }}
                          >Non</button>
                        </div>
                      </div>
                    ` : null}
                  </div>
                ` : null}

                <!-- Créer -->
                <button type="submit"
                  disabled=${!formValid}
                  style=${{ width: "100%", padding: 14, borderRadius: "var(--mrd-r)", background: formValid ? "var(--mrd-a)" : "var(--mrd-disabledBg)", color: formValid ? "var(--mrd-white)" : "var(--mrd-disabledFg)", fontSize: 15, fontWeight: 700, cursor: formValid ? "pointer" : "default", boxShadow: formValid ? "0 6px 20px oklch(58% 0.13 28 / 0.28)" : "none", transition: "all 0.2s", border: "none" }}
                >
                  ${editingTaskId ? "Enregistrer les modifications" : "Créer la tâche"}
                </button>

              </form>
            </div>
          </div>
          ${showEmojiPicker ? html`<${EmojiPicker}
            onSelect=${(emoji) => { updateForm("icon", emoji); setShowEmojiPicker(false); }}
            onClose=${() => setShowEmojiPicker(false)}
          />` : null}
        `;
      })() : null}

      ${selectedTaskId
        ? (() => {
            const selectedTask = safeAllTasks.find((task) => task.id === selectedTaskId);
            if (!selectedTask) return null;
            const planning = planningByTask?.[selectedTask.id]
              ? {
                  ...planningByTask[selectedTask.id],
                  childLabels: (planningByTask[selectedTask.id].childIds || [])
                    .map((childId) => children.find((child) => child.id === childId)?.label)
                    .filter(Boolean),
                }
              : null;
            return html`
              <div className="modal-backdrop" onClick=${closeTaskDetails}>
                <div className="modal-card task-modal" onClick=${(event) => event.stopPropagation()}>
                  <div className="task-modal-head">
                    <div>
                      <div className="miniTitle">Tâche</div>
                      <div className="st">${selectedTask.text}</div>
                    </div>
                    <button className="delbtn" onClick=${closeTaskDetails}>X</button>
                  </div>
                  <div style=${{ marginBottom: "14px" }}>
                    <${SharedTaskCard}
                      task=${selectedTask}
                      people=${activePeople}
                      completers=${completers}
                      planning=${planning}
                      onToggleTask=${onToggleTask}
                      showDelete=${false}
                      showOrder=${false}
                    />
                  </div>
                  <div className="task-modal-actions">
                    <button type="button" className="acn" onClick=${() => openEditTask(selectedTask)}>Modifier</button>
                    <button type="button" className="ghost-btn" onClick=${() => { onDeleteTask(selectedTask.id); closeTaskDetails(); }}>Supprimer</button>
                    <button type="button" className="aok" onClick=${closeTaskDetails}>Fermer</button>
                  </div>
                </div>
              </div>
            `;
          })()
        : null}
    </section>
  `;
}

import { html, useMemo, useState, useEffect } from "../../lib.js";
import { TaskCard as SharedTaskCard } from "./TaskCard.js?v=2026-04-19-time-sim-1";
import { getCurrentAppDate, getCurrentAppTimestamp, localDateKey } from "../../utils/date.js?v=2026-04-19-time-sim-2";

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
    assignedPersonId: "",
    priority: "normal",
    displayPeriod: tab === "mine" ? "daily" : tab,
    taskKind: "single",
    recurrenceFrequency: "daily",
    dueDate: "",
    dueTime: "",
    addToCalendar: false,
    calendarDateKey: localDateKey(getCurrentAppDate()),
    calendarStart: "09:00",
    calendarDurationPreset: "60",
    calendarCustomDurationValue: 1,
    calendarCustomDurationUnit: "hours",
    calendarAllDay: false,
    calendarPersonIds: [],
    calendarWholeFamily: false,
    calendarChildIds: [],
    calendarRepeatWeekly: false,
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
  if (task.priority !== "deadline" || doneBy.length || task.completedByPersonId) return false;
  const dueDate = getDueDateTime(task);
  return Boolean(dueDate && dueDate.getTime() < getCurrentAppTimestamp());
}

function dueLabel(task) {
  const dueDate = getDueDateTime(task);
  if (!dueDate) return "À faire bientôt";

  const now = getCurrentAppDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (dueDate.toDateString() === now.toDateString()) {
    return task.dueTime ? `À faire avant ${task.dueTime}` : "À faire aujourd’hui";
  }
  if (dueDate.toDateString() === tomorrow.toDateString()) {
    return task.dueTime ? `À faire avant demain ${task.dueTime}` : "À faire avant demain";
  }

  const dateLabel = dueDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return task.dueTime ? `À faire avant ${dateLabel} ${task.dueTime}` : `À faire avant ${dateLabel}`;
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
  const horizonByTab = { daily: 1, weekly: 7, monthly: 30 };
  const horizon = horizonByTab[tab] || 0;
  const now = getCurrentAppDate();
  const limit = new Date(now);
  limit.setDate(limit.getDate() + horizon);

  return tasks.filter((task) => {
    if (task.displayPeriod !== "deadline" && task.priority !== "deadline") return false;
    const due = nextRecurringDueDate(task);
    if (!due) return false;
    return due <= limit;
  });
}

function taskSortValue(task) {
  const doneBy = Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean) : [];
  const completed = doneBy.length > 0 || Boolean(task.completedByPersonId);
  if ((task.overdue || isPastDue(task)) && !completed) return 0;
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
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [editingTaskId, setEditingTaskId] = useState("");
  const [form, setForm] = useState(() => defaultTaskForm(tab));

  const sortedTasks = useMemo(() => sortTasks(Array.isArray(tasks) ? tasks : []), [tasks]);
  const safeAllTasks = useMemo(() => (Array.isArray(allTasks) ? allTasks : []), [allTasks]);
  const overdueCount = sortedTasks.filter((task) => (task.overdue || isPastDue(task)) && completedIds(task).length === 0).length;
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

  // FAB external trigger — open create modal when the FAB is pressed from App.js
  useEffect(() => {
    if (externalOpenCreate > 0) {
      openCreate();
    }
  }, [externalOpenCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetForm(nextTab = tab) {
    setForm(defaultTaskForm(nextTab));
    setShowEmojiPicker(false);
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
    setEditingTaskId(task.id);
    setSelectedTaskId("");
    setForm({
      ...defaultTaskForm(tab),
      icon: task.icon || "",
      text: task.text || "",
      assignedPersonId: task.assignedPersonId || "",
      priority: task.priority === "deadline" ? "normal" : task.priority || "normal",
      displayPeriod: task.displayPeriod || task.type || tab,
      taskKind: task.taskKind || "single",
      recurrenceFrequency: task.recurrenceFrequency || "daily",
      dueDate: task.dueDate || "",
      dueTime: task.dueTime || "",
      addToCalendar: false,
      calendarDateKey: planning?.dateKey || localDateKey(getCurrentAppDate()),
      calendarStart: planning?.start || "09:00",
      calendarAllDay: Boolean(planning?.allDay),
      calendarPersonIds: planning?.personIds || (task.assignedPersonId ? [task.assignedPersonId] : []),
      calendarWholeFamily: Boolean(planning?.wholeFamily),
      calendarChildIds: planning?.childIds || [],
    });
    setShowCreate(true);
  }

  function updateForm(key, value) {
    setForm((previous) => ({ ...previous, [key]: value }));
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

  function toggleCalendarChild(childId) {
    setForm((previous) => ({
      ...previous,
      calendarChildIds: previous.calendarChildIds.includes(childId)
        ? previous.calendarChildIds.filter((id) => id !== childId)
        : [...previous.calendarChildIds, childId],
    }));
  }

  function submitTask(event) {
    event.preventDefault();
    if (!form.text.trim()) return;
    if (form.displayPeriod === "deadline" && !form.dueDate) return;
    if (editingTaskId) {
      onUpdateTask(editingTaskId, { ...form });
    } else {
      onAddTask(tab, { ...form });
    }
    closeCreate();
  }

  function renderTaskCard(task, index, list, moveGroupKey) {
            const doneIds = completedIds(task);
            const completedPeople = doneIds
              .map((personId) => activePeople.find((person) => person.id === personId) || null)
              .filter(Boolean);
            const assignedPerson = activePeople.find((person) => person.id === task.assignedPersonId) || null;
            const completedAtLabel = task.completedAt
              ? new Date(task.completedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
              : "";
            const taskUrgency = urgencyBadge(task);
            const isDone = doneIds.length > 0;
            const planning = planningByTask?.[task.id] || null;
            const planningPeople = (planning?.personIds || [])
              .map((personId) => activePeople.find((person) => person.id === personId)?.label)
              .filter(Boolean)
              .join(", ");
            const planningChildren = (planning?.childIds || [])
              .map((childId) => children.find((child) => child.id === childId)?.label)
              .filter(Boolean)
              .join(", ");
            const planningLabel = planning
              ? planning.allDay
                ? `Planifiee : ${planning.dateKey || ""} · toute la journee`.trim()
                : `Planifiee : ${planning.dateKey || ""} ${planning.start || "09:00"} · ${planning.durationLabel || ""}`.trim()
              : "";

            return html`
              <article className=${`task-card ${isDone ? "done" : ""} ${(task.overdue || isPastDue(task)) && !isDone ? "overdue" : ""}`} key=${task.id}>
                <div className="task-card-top">
                  <div className="task-main" onClick=${() => openTaskDetails(task.id)}>
                    <div className="task-headline">
                      <span className=${`task-emoji ${task.icon ? "has-emoji" : "is-empty"}`}>${task.icon || "*"}</span>
                      <div className="task-content">
                        <div className="task-name">${task.text}</div>
                        <div className="task-badges">
                          <span className=${`ttag task-priority ${taskUrgency.className || "normal"}`}>${taskUrgency.label}</span>
                          ${task.taskKind === "recurring" ? html`<span className="ttag recTag">${recurrenceLabel(task)}</span>` : null}
                          ${(task.overdue || isPastDue(task)) && !isDone ? html`<span className="ttag lateTag">Retard</span>` : null}
                        </div>
                        ${assignedPerson ? html`<div className="task-assignee">Attribuée à : ${assignedPerson.label}</div>` : null}
                        ${planning ? html`<div className="task-assignee">${planningLabel}${planningPeople ? ` · ${planningPeople}` : ""}</div>` : null}
                        ${planningChildren ? html`<div className="task-assignee">Enfants concernés : ${planningChildren}</div>` : null}
                        ${completedPeople.length
                          ? html`<div className="task-completed">Faite par : ${completedPeople.map((person) => person.label).join(", ")}${completedAtLabel ? ` - ${completedAtLabel}` : ""}</div>`
                          : html`<div className="task-completed pending">En attente</div>`}
                      </div>
                    </div>
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
                                style=${isSelected ? { background: person.color, borderColor: person.color, color: "#fff" } : { background: "#fff", borderColor: person.color || "#D8CEBF", color: person.color || "#8A7868" }}
                                onClick=${() => onToggleTask(task.id, person.id)}
                                title=${`Marquer ${person.label} comme personne ayant fait la tâche`}
                              >
                                <span className="task-person-avatar" style=${isSelected ? { background: "transparent", color: "#fff" } : { background: "#fff", color: person.color || "#8A7868" }}>
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
                    <button className="delbtn task-delete" onClick=${() => onDeleteTask(task.id)}>X</button>
                  </div>
                </div>
              </article>
            `;
  }

  function renderTaskList(list, title) {
    if (!list.length) return null;
    const activeList = list.filter((task) => completedIds(task).length === 0);
    const completedList = list.filter((task) => completedIds(task).length > 0);
    const sampleTask = list[0];
    const moveGroupKey = `${sampleTask.type}:${sampleTask.taskKind === "recurring" ? "recurring" : "single"}`;
    return html`
      <section className="task-group">
        <div className="div">${title}</div>
        ${activeList.length ? html`<div className="task-stack">${activeList.map((task, index) => renderTaskCard(task, index, activeList, moveGroupKey))}</div>` : null}
        ${completedList.length
          ? html`
              <div className="miniTitle" style=${{ marginTop: activeList.length ? "12px" : "0" }}>Terminees</div>
              <div className="task-stack">${completedList.map((task, index) => renderTaskCard(task, index, completedList, moveGroupKey))}</div>
            `
          : null}
      </section>
    `;
  }

  function renderDeadlineTaskList(list, title) {
    if (!list.length) return null;
    const activeList = list.filter((task) => completedIds(task).length === 0);
    const completedList = list.filter((task) => completedIds(task).length > 0);
    return html`
      <section className="task-group">
        <div className="div">${title}</div>
        ${activeList.length
          ? html`<div className="task-stack">${activeList.map((task, index) => renderTaskCard(task, index, activeList, `deadline:${task.taskKind === "recurring" ? "recurring" : "single"}`))}</div>`
          : null}
        ${completedList.length
          ? html`
              <div className="miniTitle" style=${{ marginTop: activeList.length ? "12px" : "0" }}>Terminees</div>
              <div className="task-stack">${completedList.map((task, index) => renderTaskCard(task, index, completedList, `deadline:${task.taskKind === "recurring" ? "recurring" : "single"}`))}</div>
            `
          : null}
      </section>
    `;
  }

  function renderAllDeadlineCard(task) {
    const doneIds = completedIds(task);
    const isDone = doneIds.length > 0;
    const isLate = (task.overdue || isPastDue(task)) && !isDone;
    const badge = urgencyBadge(task);
    const due = getDueDateTime(task);
    const dueFr = due
      ? due.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "Pas de date définie";
    const assignedPerson = activePeople.find((p) => p.id === task.assignedPersonId) || null;
    return html`
      <article key=${task.id} className=${`task-card ${isDone ? "done" : ""} ${isLate ? "overdue" : ""}`}
        style=${{ marginBottom: "8px" }}>
        <div className="task-card-top">
          <div className="task-main">
            <div className="task-headline">
              <span className=${`task-emoji ${task.icon ? "has-emoji" : "is-empty"}`}>${task.icon || "*"}</span>
              <div className="task-content">
                <div className="task-name">${task.text}</div>
                <div className="task-badges">
                  <span className=${`ttag task-priority ${badge.className}`}>${badge.label}</span>
                  ${isLate ? html`<span className="ttag lateTag">En retard</span>` : null}
                  ${isDone ? html`<span className="ttag" style=${{ background: "#d1fae5", color: "#065f46" }}>✓ Faite</span>` : null}
                </div>
                <div className="mini" style=${{ marginTop: "2px" }}>📅 ${dueFr}</div>
                ${assignedPerson ? html`<div className="mini">Assignée à : ${assignedPerson.label}</div>` : null}
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
      <article className=${`task-card ${isDone ? "done" : ""} ${(task.overdue || isPastDue(task)) && !isDone ? "overdue" : ""}`} key=${task.id}>
        <div className="task-card-top">
          <div className="task-main">
            <div className="task-headline">
              <span className=${`task-emoji ${task.icon ? "has-emoji" : "is-empty"}`}>${task.icon || "*"}</span>
              <div className="task-content">
                <div className="task-name">${task.text}</div>
                <div className="task-badges">
                  <span className=${`ttag task-priority ${taskUrgency.className || "normal"}`}>${taskUrgency.label}</span>
                  ${task.taskKind === "recurring" ? html`<span className="ttag recTag">${recurrenceLabel(task)}</span>` : null}
                  ${(task.overdue || isPastDue(task)) && !isDone ? html`<span className="ttag lateTag">Retard</span>` : null}
                </div>
                ${assignedPerson ? html`<div className="task-assignee">Attribuée à : ${assignedPerson.label}</div>` : null}
                ${completedPeople.length
                  ? html`<div className="task-completed">Faite par : ${completedPeople.map((person) => person.label).join(", ")}${completedAtLabel ? ` - ${completedAtLabel}` : ""}</div>`
                  : html`<div className="task-completed pending">En attente</div>`}
              </div>
            </div>
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
                          : { background: "#fff", borderColor: person.color || "#D8CEBF", color: person.color || "#8A7868" }}
                        onClick=${() => onToggleTask(task.id, person.id)}
                        title=${`Marquer ${person.label} comme personne ayant fait la tâche`}
                      >
                        <span
                          className="task-person-avatar"
                          style=${doneIds.includes(person.id)
                            ? { background: "transparent", color: "#fff" }
                            : { background: "#fff", color: person.color || "#8A7868" }}
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
          <button className="aok" onClick=${openCreate}>+ Créer une tâche</button>
        </div>
      </div>

      <div className="sbar"><div className="sbf" style=${{ width: `${percentDone}%` }}></div></div>

      ${tab === "mine" && !sortedTasks.length
        ? html`<div className="empty">Aucune tâche assignée pour le moment${activePersonLabel ? ` pour ${activePersonLabel}` : ""}</div>`
        : html`
            ${renderDeadlineTaskList(deadlineTasks, deadlineGroupLabel(tab))}
            ${renderTaskList(recurringTasks, "Tâches récurrentes", "Aucune tâche récurrente pour le moment.")}
            ${renderTaskList(uniqueTasks, "Tâches uniques", "Aucune tâche unique pour le moment.")}
          `}

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

      ${showCreate
        ? html`
            <div className="modal-backdrop" onClick=${closeCreate}>
              <div className="modal-card task-modal" onClick=${(event) => event.stopPropagation()}>
                <div className="task-modal-head">
                  <div>
                <div className="miniTitle">${editingTaskId ? "Modifier la tâche" : "Créer une tâche"}</div>
                <div className="st">Tableau du foyer</div>
                  </div>
                  <button className="delbtn" onClick=${closeCreate}>X</button>
                </div>

                <form className="task-create-form" onSubmit=${submitTask}>
                  <div className="task-first-row">
                    <button
                      type="button"
                      className=${`task-choice emoji-toggle ${form.icon ? "on" : ""}`}
                      onClick=${() => setShowEmojiPicker((p) => !p)}
                      title="Choisir un emoji"
                    >${form.icon || "🙂"}</button>
                    <input className="ainp task-name-inline" placeholder="Nom de la tâche" value=${form.text} onInput=${(event) => updateForm("text", event.target.value)} />
                  </div>
                  ${showEmojiPicker ? html`
                    <div style=${{ background: "var(--surface2,#f5f5f5)", borderRadius: "10px", padding: "10px", marginBottom: "8px" }}>
                      ${EMOJI_CATEGORIES.map((cat) => html`
                        <div className="mini" style=${{ marginBottom: "4px", marginTop: "6px" }}>${cat.label}</div>
                        <div style=${{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "2px" }}>
                          ${cat.emojis.map((e) => html`
                            <button key=${e} type="button"
                              style=${{ fontSize: "20px", padding: "4px 6px", borderRadius: "6px", border: "none", background: form.icon === e ? "var(--accent,#6c63ff)" : "transparent", cursor: "pointer" }}
                              onClick=${() => { updateForm("icon", e); setShowEmojiPicker(false); }}
                            >${e}</button>
                          `)}
                        </div>
                      `)}
                      <button type="button" className="task-choice" style=${{ marginTop: "8px", width: "100%", textAlign: "center" }}
                        onClick=${() => { updateForm("icon", ""); setShowEmojiPicker(false); }}
                      >Sans emoji</button>
                    </div>
                  ` : null}

                  <div className="settings-actions">
                    <div className="miniTitle">Type de tâche</div>
                    <div className="task-choice-row">
                      <button type="button" className=${`task-choice ${form.taskKind === "single" ? "on" : ""}`} onClick=${() => updateForm("taskKind", "single")}>
                        Tâche unique
                      </button>
                      <button type="button" className=${`task-choice ${form.taskKind === "recurring" ? "on" : ""}`} onClick=${() => updateForm("taskKind", "recurring")}>
                        Tâche récurrente
                      </button>
                    </div>
                  </div>

                  <div className="settings-actions">
                    <div className="miniTitle">Où la tâche apparaît</div>
                    <div className="task-choice-row">
                          <button
                            type="button"
                            className=${`task-choice ${form.displayPeriod === "daily" ? "on" : ""}`}
                            onClick=${() => {
                              updateForm("displayPeriod", "daily");
                              if (form.priority === "deadline") updateForm("priority", "normal");
                            }}
                          >
                        Aujourd’hui
                      </button>
                      <button
                        type="button"
                        className=${`task-choice ${form.displayPeriod === "weekly" ? "on" : ""}`}
                        onClick=${() => {
                          updateForm("displayPeriod", "weekly");
                          if (form.priority === "deadline") updateForm("priority", "normal");
                        }}
                      >
                        Semaine
                      </button>
                      <button
                        type="button"
                        className=${`task-choice ${form.displayPeriod === "monthly" ? "on" : ""}`}
                        onClick=${() => {
                          updateForm("displayPeriod", "monthly");
                          if (form.priority === "deadline") updateForm("priority", "normal");
                        }}
                      >
                        Mois
                      </button>
                      <button
                        type="button"
                        className=${`task-choice ${form.displayPeriod === "deadline" ? "on" : ""}`}
                        onClick=${() => {
                          updateForm("displayPeriod", "deadline");
                          updateForm("priority", "deadline");
                        }}
                      >
                        À faire avant
                      </button>
                    </div>
                  </div>

                  <div className="settings-actions">
                    <div className="miniTitle">Assignee a</div>
                    <select
                      className="asel"
                      value=${form.assignedPersonId || ""}
                      onChange=${(event) =>
                        setForm((previous) => ({
                          ...previous,
                          assignedPersonId: event.target.value,
                          calendarWholeFamily: event.target.value ? false : previous.calendarWholeFamily,
                          calendarPersonIds: event.target.value ? [event.target.value] : previous.calendarPersonIds,
                        }))}
                    >
                      <option value="">Pour le foyer</option>
                      ${assignees.map((person) => html`<option value=${person.id} key=${person.id}>${person.label}</option>`)}
                    </select>
                  </div>

                  ${form.displayPeriod !== "deadline"
                    ? html`
                        <div className="settings-actions">
                          <div className="miniTitle">Urgence</div>
                          <div className="task-choice-row">
                            ${Object.entries(URGENCY_META)
                              .filter(([key]) => key !== "deadline")
                              .map(
                                ([key, meta]) => html`
                                  <button
                                    type="button"
                                    key=${key}
                                    className=${`task-choice ${form.priority === key ? "on" : ""}`}
                                    onClick=${() => {
                                      updateForm("priority", key);
                                      if (key !== "deadline" && form.displayPeriod === "deadline") {
                                        updateForm("displayPeriod", tab === "mine" ? "daily" : tab);
                                      }
                                    }}
                                  >
                                    ${meta.label}
                                  </button>
                                `,
                              )}
                          </div>
                        </div>
                      `
                    : null}

                  ${form.displayPeriod === "deadline"
                    ? html`
                        <div className="settings-actions">
                          <div className="miniTitle">À faire avant…</div>
                          <div className="arow">
                            <input className="ainp" type="date" value=${form.dueDate || ""} onInput=${(event) => updateForm("dueDate", event.target.value)} />
                            <input className="ainp" type="time" value=${form.dueTime || ""} onInput=${(event) => updateForm("dueTime", event.target.value)} />
                          </div>
                          <div className="mini">Choisis une date, puis une heure si besoin.</div>
                        </div>
                      `
                    : null}

                  ${form.taskKind === "recurring"
                    ? html`
                        <div className="settings-actions">
                          <div className="miniTitle">Recurrence</div>
                          <div className="task-choice-row">
                            <button type="button" className=${`task-choice ${form.recurrenceFrequency === "daily" ? "on" : ""}`} onClick=${() => updateForm("recurrenceFrequency", "daily")}>
                              Chaque jour
                            </button>
                            <button type="button" className=${`task-choice ${form.recurrenceFrequency === "weekly" ? "on" : ""}`} onClick=${() => updateForm("recurrenceFrequency", "weekly")}>
                              Chaque semaine
                            </button>
                            <button type="button" className=${`task-choice ${form.recurrenceFrequency === "monthly" ? "on" : ""}`} onClick=${() => updateForm("recurrenceFrequency", "monthly")}>
                              Chaque mois
                            </button>
                          </div>
                        </div>
                      `
                    : html`<div className="mini">Cette tâche unique apparaîtra dans la période choisie.</div>`}

                  <div className="settings-actions">
                    <div className="miniTitle">Planification</div>
                    <button
                      type="button"
                      className=${`task-choice ${form.addToCalendar ? "on" : ""}`}
                      onClick=${() => updateForm("addToCalendar", !form.addToCalendar)}
                    >
                      Ajouter au calendrier
                    </button>
                    <div className="mini">Option facultative pour créer et planifier la tâche en une seule fois.</div>
                  </div>

                  ${form.addToCalendar
                    ? html`
                        <div className="settings-actions">
                          <div className="miniTitle">Date et heure</div>
                          <div className="arow">
                            <input className="ainp" type="date" value=${form.calendarDateKey} onInput=${(event) => updateForm("calendarDateKey", event.target.value)} />
                            <input className="ainp" type="time" value=${form.calendarStart} disabled=${form.calendarAllDay} onInput=${(event) => updateForm("calendarStart", event.target.value)} />
                          </div>
                        </div>

                        <div className="settings-actions">
                          <div className="miniTitle">Duree</div>
                          <div className="task-choice-row">
                            ${[
                              { id: "30", label: "30 min" },
                              { id: "60", label: "1 h" },
                              { id: "120", label: "2 h" },
                              { id: "all-day", label: "Toute la journee" },
                              { id: "custom", label: "Personnalisee" },
                            ].map((option) => html`
                              <button
                                key=${option.id}
                                type="button"
                                className=${`task-choice ${form.calendarDurationPreset === option.id ? "on" : ""}`}
                                onClick=${() => {
                                  updateForm("calendarDurationPreset", option.id);
                                  updateForm("calendarAllDay", option.id === "all-day");
                                }}
                              >
                                ${option.label}
                              </button>
                            `)}
                          </div>
                          ${form.calendarDurationPreset === "custom" && !form.calendarAllDay
                            ? html`
                                <div className="arow">
                                  <input className="ainp" type="number" min="1" value=${form.calendarCustomDurationValue} onInput=${(event) => updateForm("calendarCustomDurationValue", event.target.value)} />
                                  <select className="asel" value=${form.calendarCustomDurationUnit} onChange=${(event) => updateForm("calendarCustomDurationUnit", event.target.value)}>
                                    <option value="minutes">minutes</option>
                                    <option value="hours">heures</option>
                                  </select>
                                </div>
                              `
                            : null}
                        </div>

                        <div className="settings-actions">
                          <div className="miniTitle">Personne concernee</div>
                          <div className="task-choice-row">
                            <button
                              type="button"
                              className=${`task-choice ${form.calendarWholeFamily ? "on" : ""}`}
                              onClick=${() => setForm((previous) => ({ ...previous, calendarWholeFamily: !previous.calendarWholeFamily, calendarPersonIds: [] }))}
                            >
                              Toute la famille
                            </button>
                            ${assignees.map((person) => html`
                              <button type="button" key=${person.id} className=${`task-choice ${form.calendarPersonIds.includes(person.id) ? "on" : ""}`} onClick=${() => toggleCalendarPerson(person.id)}>
                                ${person.label}
                              </button>
                            `)}
                          </div>
                        </div>

                        ${children.length
                          ? html`
                              <div className="settings-actions">
                                <div className="miniTitle">Enfant concerne</div>
                                <div className="task-choice-row">
                                  ${children.map((child) => html`
                                    <button type="button" key=${child.id} className=${`task-choice ${form.calendarChildIds.includes(child.id) ? "on" : ""}`} onClick=${() => toggleCalendarChild(child.id)}>
                                      ${child.label}
                                    </button>
                                  `)}
                                </div>
                              </div>
                            `
                          : null}

                        <div className="settings-actions">
                          <div className="miniTitle">Repetition calendrier</div>
                          <button
                            type="button"
                            className=${`task-choice ${form.calendarRepeatWeekly ? "on" : ""}`}
                            onClick=${() => updateForm("calendarRepeatWeekly", !form.calendarRepeatWeekly)}
                          >
                            Repeter chaque semaine
                          </button>
                        </div>
                      `
                    : null}

                  <div className="task-modal-actions">
                    <button type="button" className="acn" onClick=${closeCreate}>Annuler</button>
                <button type="submit" className="aok">${editingTaskId ? "Enregistrer" : "Créer la tâche"}</button>
              </div>
            </form>
          </div>
        </div>
      `
        : null}

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

import { DAYS } from "../../constants.js";
import { html, useEffect, useMemo, useState } from "../../lib.js";
import { addMinutesToTime, frDateLabel, getCurrentAppDate, getWeekDays, localDateKey, localWeekStart, minutesToLabel, pad2 } from "../../utils/date.js?v=2026-04-19-time-sim-2";
import { completedIds, TaskCard, urgencyBadge } from "../tasks/TaskCard.js?v=2026-04-19-time-sim-1";
import { SegmentedTabs } from "../common/SegmentedTabs.js?v=2026-04-25-segmented-nav-1";
import { EmojiPicker } from "../tasks/EmojiPicker.js?v=2026-04-24-emoji-picker-1";

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addDays(date, amount) {
  const output = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  output.setDate(output.getDate() + amount);
  return output;
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function parseDateKey(value) {
  if (!value) return getCurrentAppDate();
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year || 0, (month || 1) - 1, day || 1);
}

function monthLabel(date) {
  return date.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
}

function dayLabel(date) {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function monthGridDays(baseDate) {
  const monthStart = startOfMonth(baseDate);
  const monthEnd = endOfMonth(baseDate);
  const gridStart = localWeekStart(monthStart);
  const output = [];
  const cursor = new Date(gridStart);
  while (cursor <= monthEnd || output.length % 7 !== 0) {
    output.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return output;
}

const CALENDAR_WEEKDAY_MINI = ["L", "M", "M", "J", "V", "S", "D"];

function createEmptyForm(tasks, people) {
  return {
    entryType: "task",
    taskId: tasks[0]?.id || "",
    title: "",
    useEmoji: true,
    emoji: "🗓️",
    dateKey: localDateKey(getCurrentAppDate()),
    start: "09:00",
    endTime: addMinutesToTime("09:00", 60),
    durationPreset: "60",
    customDurationValue: 1,
    customDurationUnit: "hours",
    allDay: false,
    personIds: [],
    wholeFamily: false,
    childIds: [],
    repeatWeekly: false,
  };
}

function buildTaskLabel(task) {
  const periodLabel = task.type === "weekly" ? "Semaine" : task.type === "monthly" ? "Mois" : "Aujourd’hui";
  return `${task.icon ? `${task.icon} ` : ""}${task.text} · ${periodLabel}`;
}

function normalizeDuration(form) {
  if (form.allDay) {
    return { duration: 1440, allDay: true };
  }
  if (form.durationPreset === "custom") {
    const rawValue = Number(form.customDurationValue) || 0;
    const minutes = form.customDurationUnit === "hours" ? rawValue * 60 : rawValue;
    return { duration: Math.max(15, minutes), allDay: false };
  }
  return { duration: Number(form.durationPreset) || 60, allDay: false };
}

function durationPresetFromEntry(entry) {
  if (entry.allDay) return "all-day";
  if (entry.duration === 30) return "30";
  if (entry.duration === 60) return "60";
  if (entry.duration === 120) return "120";
  if (entry.duration && entry.duration % 60 === 0) {
    return "custom";
  }
  if (entry.duration) {
    return "custom";
  }
  return "60";
}

function customDurationFromEntry(entry) {
  if (!entry?.duration) return { value: 1, unit: "hours" };
  if (entry.duration % 60 === 0) {
    return { value: Math.max(1, entry.duration / 60), unit: "hours" };
  }
  return { value: Math.max(15, entry.duration), unit: "minutes" };
}

function humanDuration(entry) {
  if (entry.allDay) return "Toute la journée";
  return minutesToLabel(entry.duration);
}

function peopleSummary(entry, peopleMap) {
  if (entry.wholeFamily) return "Toute la famille";
  const names = (entry.personIds || [])
    .map((id) => peopleMap[id]?.displayName || peopleMap[id]?.label)
    .filter(Boolean);
  return names.join(", ");
}

function childrenSummary(entry, peopleMap) {
  return (entry.childIds || [])
    .map((id) => peopleMap[id]?.displayName || peopleMap[id]?.label)
    .filter(Boolean)
    .join(", ");
}

function selectedNames(ids, peopleMap) {
  return (ids || [])
    .map((id) => peopleMap[id]?.displayName || peopleMap[id]?.label)
    .filter(Boolean);
}

function dateTimeLabel(entry) {
  if (entry.allDay) return "Toute la journée";
  return `${entry.start} → ${addMinutesToTime(entry.start, entry.duration)} · ${humanDuration(entry)}`;
}

function timeToMinutes(value) {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function endToDuration(start, end) {
  const sm = timeToMinutes(start);
  const em = timeToMinutes(end);
  const diff = em > sm ? em - sm : 1440 - sm + em;
  return Math.max(15, diff);
}

function recurringToAgendaDate(recurringItem, date) {
  return {
    ...recurringItem,
    dateKey: localDateKey(date),
    entryKind: "recurring",
  };
}

function taskPeriodLabel(type) {
  if (type === "weekly") return "Semaine";
  if (type === "monthly") return "Mois";
  if (type === "deadline") return "Échéance";
  return "Aujourd’hui";
}

function viewLabel(mode, date, days) {
  if (mode === "day") return dayLabel(date);
  if (mode === "month") return monthLabel(date);
  return `${frDateLabel(days[0])} → ${frDateLabel(days[6])}`;
}

export function AgendaView({
  tasks,
  people,
  agenda,
  recurringEvents,
  onAddAgenda,
  onUpdateAgenda,
  onDeleteAgenda,
  onAddRecurring,
  onUpdateRecurring,
  onDeleteRecurring,
  onDeleteTask = () => {},
  onToggleTask = () => {},
  activePersonId = "",
}) {
  const activePeople = Array.isArray(people) ? people.filter((person) => person.active !== false) : [];
  const adultPeople = activePeople.filter((person) => person.profileMode !== "context" && person.type !== "animal");
  const childPeople = activePeople.filter((person) => person.profileMode === "context" || person.type === "child" || person.type === "animal");
  const taskChoices = Array.isArray(tasks) ? tasks : [];
  const agendaItems = Array.isArray(agenda) ? agenda : [];
  const recurringItems = Array.isArray(recurringEvents) ? recurringEvents : [];
  const peopleMap = useMemo(
    () =>
      activePeople.reduce((accumulator, person) => {
        accumulator[person.id] = person;
        return accumulator;
      }, {}),
    [activePeople],
  );

  const [viewMode, setViewMode] = useState("day");
  const [focusDateKey, setFocusDateKey] = useState(localDateKey(getCurrentAppDate()));
  const [showModal, setShowModal] = useState(false);
  const [viewEntry, setViewEntry] = useState(null);
  const [viewEntryMenuOpen, setViewEntryMenuOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => createEmptyForm(taskChoices, activePeople));
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showConcernedPicker, setShowConcernedPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const focusDate = parseDateKey(focusDateKey);
  const todayKey = localDateKey(getCurrentAppDate());
  const weekDays = getWeekDays(Math.round((localWeekStart(focusDate) - localWeekStart(getCurrentAppDate())) / (7 * 24 * 60 * 60 * 1000)));

  useEffect(() => {
    if (!taskChoices.length && form.entryType === "task") return;
    if (!form.taskId && taskChoices[0]?.id) {
      setForm((previous) => ({ ...previous, taskId: taskChoices[0].id }));
    }
  }, [taskChoices, form.taskId, form.entryType]);

  function openCreateModal(dateKey = focusDateKey) {
    setEditing(null);
    setForm({
      ...createEmptyForm(taskChoices, activePeople),
      dateKey,
      taskId: taskChoices[0]?.id || "",
    });
    setShowDurationPicker(false);
    setShowConcernedPicker(false);
    setShowEmojiPicker(false);
    setShowModal(true);
  }

  function openEditModal(entry, entryKind) {
    const customDuration = customDurationFromEntry(entry);
    setEditing({ id: entry.id, entryKind });
    const editStart = entry.start || "09:00";
    const editDuration = entry.duration || 60;
    setForm({
      entryType: entry.sourceType === "task" ? "task" : "custom",
      taskId: entry.taskId || "",
      title: entry.sourceType === "task" ? "" : entry.text || "",
      useEmoji: entry.sourceType === "task" ? true : Boolean(entry.icon),
      emoji: entry.sourceType === "task" ? entry.icon || "" : entry.icon || "🗓️",
      dateKey: entry.dateKey || focusDateKey,
      start: editStart,
      endTime: entry.allDay ? "" : addMinutesToTime(editStart, editDuration),
      durationPreset: durationPresetFromEntry(entry),
      customDurationValue: customDuration.value,
      customDurationUnit: customDuration.unit,
      allDay: Boolean(entry.allDay),
      personIds: Array.isArray(entry.personIds)
        ? entry.personIds
        : entry.personId
          ? [entry.personId]
          : [],
      wholeFamily: Boolean(entry.wholeFamily),
      childIds: Array.isArray(entry.childIds) ? entry.childIds : [],
      repeatWeekly: entryKind === "recurring",
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditing(null);
    setShowDurationPicker(false);
    setShowConcernedPicker(false);
    setShowEmojiPicker(false);
  }

  function moveRange(direction) {
    if (viewMode === "day") {
      setFocusDateKey(localDateKey(addDays(focusDate, direction)));
      return;
    }
    if (viewMode === "month") {
      setFocusDateKey(localDateKey(addMonths(focusDate, direction)));
      return;
    }
    setFocusDateKey(localDateKey(addDays(focusDate, direction * 7)));
  }

  function setEntryType(nextType) {
    setForm((previous) => ({
      ...previous,
      entryType: nextType,
      taskId: nextType === "task" ? previous.taskId || taskChoices[0]?.id || "" : "",
      title: nextType === "custom" ? previous.title : "",
      useEmoji: nextType === "task" ? true : previous.useEmoji,
    }));
  }

  function toggleMainPerson(personId) {
    setForm((previous) => ({
      ...previous,
      wholeFamily: false,
      personIds: previous.personIds.includes(personId)
        ? previous.personIds.filter((id) => id !== personId)
        : [...previous.personIds, personId],
    }));
  }

  function toggleChild(childId) {
    setForm((previous) => ({
      ...previous,
      childIds: previous.childIds.includes(childId)
        ? previous.childIds.filter((id) => id !== childId)
        : [...previous.childIds, childId],
    }));
  }

  function buildPayload() {
    const selectedTask = taskChoices.find((task) => task.id === form.taskId);
    let durationInfo;
    if (form.allDay) {
      durationInfo = { duration: 1440, allDay: true };
    } else if (form.endTime) {
      durationInfo = { duration: endToDuration(form.start, form.endTime), allDay: false };
    } else {
      durationInfo = normalizeDuration(form);
    }
    const text = form.entryType === "task" ? selectedTask?.text || "" : form.title.trim();
    const icon = form.entryType === "task" ? selectedTask?.icon || "" : form.useEmoji ? form.emoji.trim() : "";
    const safePersonIds = form.wholeFamily ? [] : form.personIds.filter(Boolean);
    return {
      taskId: form.entryType === "task" ? form.taskId : "",
      mode: form.entryType,
      text,
      icon,
      dateKey: form.dateKey,
      start: durationInfo.allDay ? "00:00" : form.start,
      duration: durationInfo.duration,
      allDay: durationInfo.allDay,
      personIds: safePersonIds,
      personId: safePersonIds[0] || "",
      wholeFamily: Boolean(form.wholeFamily),
      childIds: form.childIds.filter(Boolean),
      sourceType: form.entryType,
    };
  }

  function submit(event) {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload.text) return;

    if (editing?.entryKind === "agenda") {
      if (form.repeatWeekly) {
        onDeleteAgenda(editing.id);
        onAddRecurring({
          ...payload,
          weekday: parseDateKey(form.dateKey).getDay(),
        });
      } else {
        onUpdateAgenda(editing.id, payload);
      }
      closeModal();
      return;
    }

    if (editing?.entryKind === "recurring") {
      onUpdateRecurring(editing.id, {
        ...payload,
        weekday: parseDateKey(form.dateKey).getDay(),
      });
      closeModal();
      return;
    }

    if (form.repeatWeekly) {
      onAddRecurring({
        ...payload,
        weekday: parseDateKey(form.dateKey).getDay(),
      });
    } else {
      onAddAgenda(payload);
    }
    closeModal();
  }

  function itemsForDate(date) {
    const dateKey = localDateKey(date);
    const oneTime = agendaItems
      .filter((item) => item.dateKey === dateKey)
      .map((item) => ({ ...item, entryKind: "agenda" }));
    const recurring = recurringItems.reduce((acc, item) => {
      if (item.startDateKey && dateKey < item.startDateKey) return acc;
      const linkedTask = item.taskId ? taskChoices.find((t) => t.id === item.taskId) : null;
      const recType = item.recurrenceType
        || (linkedTask ? linkedTask.recurrenceFrequency : null)
        || "weekly";
      let show = false;
      if (recType === "daily") {
        show = true;
      } else if (recType === "monthly") {
        const dom = item.dayOfMonth != null
          ? Number(item.dayOfMonth)
          : item.dateKey ? new Date(`${item.dateKey}T00:00`).getDate() : null;
        show = dom != null && date.getDate() === dom;
      } else {
        show = Number(item.weekday) === date.getDay();
      }
      if (show) acc.push({ ...item, dateKey, entryKind: "recurring", recurrenceType: recType });
      return acc;
    }, []);
    const deadlines = taskChoices
      .filter((task) => {
        if (task.priority !== "deadline" || !task.dueDate) return false;
        if ((Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length : 0) > 0 || task.completedByPersonId) return false;
        return task.dueDate === dateKey;
      })
      .map((task) => ({
        id: task.id,
        text: `Date limite : ${task.text}`,
        icon: task.icon || "⚠️",
        dateKey,
        start: task.dueTime || "23:59",
        duration: 30,
        allDay: !task.dueTime,
        entryKind: "deadline",
        sourceType: "deadline",
        personIds: task.assignedPersonId ? [task.assignedPersonId] : [],
        wholeFamily: false,
        childIds: [],
      }));
    return [...deadlines, ...recurring, ...oneTime].sort((left, right) => {
      if (left.allDay && !right.allDay) return -1;
      if (!left.allDay && right.allDay) return 1;
      return String(left.start || "").localeCompare(String(right.start || ""));
    });
  }

function renderEntryCard(entry) {
  const isDeadline = entry.entryKind === "deadline";
  const linkedTask = entry.taskId ? taskChoices.find((t) => t.id === entry.taskId) : null;
  const taskDoneIds = linkedTask ? completedIds(linkedTask) : [];
  const taskIsDone = taskDoneIds.length > 0;
  const assignedPerson = linkedTask ? activePeople.find((person) => person.id === linkedTask.assignedPersonId) : null;
  const visibleCompleters = (adultPeople.length ? adultPeople : activePeople).slice(0, viewMode === "day" ? 6 : 3);

    const cardStyle = isDeadline && !taskIsDone
      ? { borderLeft: "3px solid var(--mrd-amber)", background: "var(--mrd-amberLt)", cursor: "pointer" }
      : { cursor: "pointer" };

    return html`
      <article className=${`calendar-card${taskIsDone ? " done" : ""}`} key=${`${entry.entryKind}-${entry.id}-${entry.dateKey || ""}`}
        style=${cardStyle}
        onClick=${() => setViewEntry(entry)}>
      <div className="calendar-card-top">
        <div className="calendar-card-title">
          <span className="calendar-card-icon">${entry.icon || "•"}</span>
          <div>
            <div className="cblktitle calendar-card-main-title">${entry.text}</div>
            <div className="cblksub calendar-card-main-subtitle">${isDeadline
              ? (entry.allDay ? "À faire dans la journée" : `Avant ${entry.start}`)
              : dateTimeLabel(entry)}</div>
            ${assignedPerson ? html`<div className="mini">Attribuée à : ${assignedPerson.label}</div>` : null}
          </div>
        </div>
      </div>
      <div className="calendar-tags">
        ${isDeadline
          ? html`<span className="calendar-tag" style=${{ background: "var(--mrd-amberLt)", color: "var(--mrd-amberDeep)", fontWeight: "600" }}>⏰ Échéance</span>`
          : taskIsDone
            ? html`<span className="calendar-tag" style=${{ background: "var(--mrd-sageLt)", color: "var(--mrd-sageDeep)", fontWeight: "600" }}>✓ Terminée</span>`
            : html`
                ${linkedTask ? html`<span className="calendar-tag">${linkedTask.priority === "urgent" ? "Urgente" : linkedTask.priority === "deadline" ? "À faire avant" : "Normale"}</span>` : null}
                ${entry.entryKind === "recurring" ? html`<span className="calendar-tag">${entry.recurrenceType === "daily" ? "Chaque jour" : entry.recurrenceType === "monthly" ? "Chaque mois" : "Chaque semaine"}</span>` : null}
              `}
      </div>
      ${linkedTask && (viewMode === "day" || viewMode === "week")
        ? html`
            <div className="task-people" onClick=${(event) => event.stopPropagation()} style=${{ marginTop: "8px" }}>
              ${visibleCompleters.map((person) => {
                const isSelected = taskDoneIds.includes(person.id);
                return html`
                  <button
                    key=${`${entry.id}-${person.id}`}
                    className=${`task-person-chip ${isSelected ? "on" : ""}`}
                    style=${isSelected
                      ? { background: person.color, borderColor: person.color, color: "var(--mrd-white)" }
                      : { background: "var(--mrd-white)", borderColor: person.color || "var(--mrd-border)", color: person.color || "var(--mrd-fg3)" }}
                    onClick=${() => onToggleTask(linkedTask.id, person.id)}
                    title=${`Marquer ${person.label} comme personne ayant fait la tâche`}
                  >
                    <span className="task-person-avatar" style=${isSelected ? { background: "transparent", color: "var(--mrd-white)" } : { background: "var(--mrd-white)", color: person.color || "var(--mrd-fg3)" }}>
                      ${person.shortId}
                    </span>
                  </button>
                `;
              })}
            </div>
          `
        : null}
    </article>
  `;
}

  function renderDetailPopup() {
    if (!viewEntry) return null;
    const entry = viewEntry;
    const isDeadline = entry.entryKind === "deadline";

    const linkedTask = isDeadline
      ? taskChoices.find((t) => t.id === entry.id)
      : (entry.taskId ? taskChoices.find((t) => t.id === entry.taskId) : null);

    const doneIds = linkedTask ? completedIds(linkedTask) : [];
    const isDone = doneIds.length > 0;
    const activePerson = activePersonId ? (adultPeople.find((p) => p.id === activePersonId) || activePeople.find((p) => p.id === activePersonId)) : null;
    const activePersonDone = activePersonId ? doneIds.includes(activePersonId) : false;

    const dateStr = entry.dateKey
      ? parseDateKey(entry.dateKey).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
      : "";

    const peopleLabel = peopleSummary(entry, peopleMap);
    const childrenLabel = childrenSummary(entry, peopleMap);
    const otherCompleters = (adultPeople.length ? adultPeople : activePeople).filter((p) => p.id !== activePersonId);

    if (linkedTask) {
      const close = () => { setViewEntry(null); setViewEntryMenuOpen(false); };

      const calendarOnlyDelete = () => {
        if (isDeadline) return;
        if (entry.entryKind === "recurring") {
          onDeleteRecurring(entry.id);
        } else {
          onDeleteAgenda(entry.id);
        }
        close();
      };

      const deleteTaskEverywhere = () => {
        onDeleteTask(linkedTask.id);
        close();
      };

      const taskUrgency = urgencyBadge(linkedTask);
      const completersList = adultPeople.length ? adultPeople : activePeople;
      const assignedPersonIds = Array.isArray(linkedTask.assignedPersonIds) && linkedTask.assignedPersonIds.length
        ? linkedTask.assignedPersonIds
        : linkedTask.assignedPersonId ? [linkedTask.assignedPersonId] : [];
      const assignedPersons = assignedPersonIds.map((id) => activePeople.find((p) => p.id === id)).filter(Boolean);

      const planningMeta = (() => {
        const parts = String(entry.dateKey || "").split("-");
        const dateFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : "";
        if (!dateFmt) return "";
        return entry.allDay ? dateFmt : (entry.start ? `${dateFmt} · ${entry.start}` : dateFmt);
      })();

      return html`
        <div className="modal-backdrop" onClick=${close}>
          <div className="modal-card task-modal-redesign" style=${{ width: "min(440px, 100%)", padding: 0 }} onClick=${(e) => e.stopPropagation()}>

            <!-- Fermeture -->
            <div style=${{ display: "flex", justifyContent: "flex-end", padding: "10px 10px 0" }}>
              <button className="mrd-mclose" onClick=${close}>✕</button>
            </div>

            <!-- Carte tâche inline -->
            <div style=${{ padding: "6px 12px 16px" }}>
              <article className=${`task-card ${isDone ? "done" : ""}`}>
                <div className="task-card-top">
                  <div className="task-main">
                    <div className=${`task-headline ${linkedTask.icon ? "" : "no-emoji"}`}>
                      ${linkedTask.icon ? html`<span className="task-emoji has-emoji">${linkedTask.icon}</span>` : null}
                      <div className="task-content">
                        <div className="task-name">${linkedTask.text}</div>
                        <div className="task-badges">
                          ${taskUrgency.className !== "normal" ? html`<span className=${`ttag task-priority ${taskUrgency.className}`}>${taskUrgency.label}</span>` : null}
                          ${linkedTask.assignedWholeFamily ? html`<span className="task-assigned-chip" style=${{ background: "#8B7355" }} title="Toute la famille">🏠</span>` : null}
                          ${!linkedTask.assignedWholeFamily ? assignedPersons.map((p) => html`
                            <span key=${p.id} className="task-assigned-chip" style=${{ background: p.color || "#8B7355" }} title=${p.label}>
                              ${p.shortId || String(p.label || "?")[0].toUpperCase()}
                            </span>
                          `) : null}
                        </div>
                      </div>
                    </div>
                    ${planningMeta ? html`<div className="task-assignee">📅 ${planningMeta}</div>` : null}
                  </div>

                  <div className="task-side">
                    <div className="task-people task-people-side">
                      ${completersList.map((person) => {
                        const isSelected = doneIds.includes(person.id);
                        return html`
                          <button
                            key=${`view-${linkedTask.id}-${person.id}`}
                            className=${`task-person-chip ${isSelected ? "on" : ""}`}
                            style=${isSelected
                              ? { background: person.color, borderColor: person.color, color: "var(--mrd-white)" }
                              : { background: "var(--mrd-white)", borderColor: person.color || "var(--mrd-border)", color: person.color || "var(--mrd-fg3)" }}
                            onClick=${() => onToggleTask(linkedTask.id, person.id)}
                            title=${`Marquer ${person.label}`}
                          >
                            <span className="task-person-avatar"
                              style=${isSelected ? { background: "transparent", color: "var(--mrd-white)" } : { background: "var(--mrd-white)", color: person.color || "var(--mrd-fg3)" }}>
                              ${person.shortId}
                            </span>
                          </button>
                        `;
                      })}
                    </div>
                    <div className="task-menu-wrap">
                      <button
                        className="task-menu-btn"
                        onClick=${(e) => { e.stopPropagation(); setViewEntryMenuOpen((v) => !v); }}
                      >⋮</button>
                      ${viewEntryMenuOpen ? html`
                        <div className="task-menu-dropdown" onClick=${(e) => e.stopPropagation()}>
                          ${!isDeadline ? html`
                            <button className="task-menu-item" onClick=${() => { setViewEntryMenuOpen(false); close(); openEditModal(entry, entry.entryKind); }}>
                              Modifier le bloc
                            </button>
                            <button className="task-menu-item" onClick=${calendarOnlyDelete}>
                              Retirer du calendrier
                            </button>
                          ` : null}
                          <button className="task-menu-item task-menu-item-danger" onClick=${deleteTaskEverywhere}>
                            Supprimer la tâche
                          </button>
                        </div>
                      ` : null}
                    </div>
                  </div>
                </div>
              </article>
            </div>

          </div>
        </div>
      `;
    }

    return html`
      <div className="modal-backdrop" onClick=${() => setViewEntry(null)}>
        <div className="modal-card task-modal" onClick=${(e) => e.stopPropagation()}>
          <div className="task-modal-head">
            <div>
              <div className="miniTitle">
                ${isDeadline ? "Échéance" : linkedTask ? `Tâche · ${taskPeriodLabel(linkedTask.type)}` : entry.entryKind === "recurring" ? (entry.recurrenceType === "daily" ? "Chaque jour" : entry.recurrenceType === "monthly" ? "Chaque mois" : "Chaque semaine") : "Événement libre"}
              </div>
              <div className="st">${entry.icon ? `${entry.icon} ` : ""}${isDeadline ? linkedTask?.text || entry.text : entry.text}</div>
            </div>
            <button className="delbtn" onClick=${() => setViewEntry(null)}>×</button>
          </div>

          <div style=${{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
            ${dateStr ? html`<div className="mini">📅 ${dateStr}</div>` : null}
            ${!entry.allDay
              ? html`<div className="mini">🕐 ${entry.start} → ${addMinutesToTime(entry.start, entry.duration)} · ${humanDuration(entry)}</div>`
              : html`<div className="mini">🕐 Toute la journée</div>`}
            ${peopleLabel ? html`<div className="mini">👥 ${peopleLabel}</div>` : null}
            ${childrenLabel ? html`<div className="mini">🧒 ${childrenLabel}</div>` : null}
            ${linkedTask ? html`<div className="mini">📋 Rubrique : ${taskPeriodLabel(linkedTask.type)}</div>` : null}
          </div>

          ${linkedTask ? html`
            <div style=${{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginBottom: "14px" }}>
              <div className="miniTitle" style=${{ marginBottom: "10px" }}>
                ${isDone ? "✅ Tâche terminée" : "Marquer comme fait"}
              </div>

              ${activePerson ? html`
                <button type="button"
                  className=${`aok ${activePersonDone ? "" : ""}`}
                  style=${{ width: "100%", marginBottom: "10px", background: activePersonDone ? "var(--mrd-sageMd)" : "", justifyContent: "center" }}
                  onClick=${() => onToggleTask(linkedTask.id, activePerson.id)}
                >
                  ${activePersonDone ? `↩️ Retirer ma validation (${activePerson.displayName || activePerson.label})` : `✅ C'est fait ! (${activePerson.displayName || activePerson.label})`}
                </button>
              ` : null}

              ${otherCompleters.length ? html`
                <div className="mini" style=${{ marginBottom: "6px" }}>Valider pour quelqu'un d'autre :</div>
                <div style=${{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  ${otherCompleters.map((person) => html`
                    <button key=${person.id} type="button"
                      className=${`task-choice ${doneIds.includes(person.id) ? "on" : ""}`}
                      style=${{ fontSize: "13px" }}
                      onClick=${() => onToggleTask(linkedTask.id, person.id)}
                    >${doneIds.includes(person.id) ? "↩️ " : ""}${person.displayName || person.label}</button>
                  `)}
                </div>
              ` : null}
            </div>
          ` : null}

          <div style=${{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            ${!isDeadline ? html`
              <button className="clrbtn" onClick=${() => { setViewEntry(null); openEditModal(entry, entry.entryKind); }}>Modifier</button>
              <button className="ghost-btn" onClick=${() => {
                entry.entryKind === "recurring" ? onDeleteRecurring(entry.id) : onDeleteAgenda(entry.id);
                setViewEntry(null);
              }}>Supprimer</button>
            ` : null}
            <button className="aok" style=${{ background: "var(--surface2)", color: "var(--text)" }} onClick=${() => setViewEntry(null)}>Fermer</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderAgendaDayPanel(date) {
    const items = itemsForDate(date);
    const dateKey = localDateKey(date);
    const isToday = dateKey === todayKey;
    const monthDayLabel = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const weekdayLabel = date.toLocaleDateString("fr-FR", { weekday: "long" });

    return html`
      <section className="calendar-agenda-panel" key=${`panel-${dateKey}`}>
        <div className="calendar-panel-head">
          <div>
            <div className="calendar-panel-title">${isToday ? `Aujourd'hui · ${monthDayLabel}` : monthDayLabel}</div>
            <div className="calendar-panel-subtitle">${weekdayLabel}</div>
          </div>
          <button className="calendar-panel-add" onClick=${() => openCreateModal(dateKey)} title="Ajouter un bloc">+</button>
        </div>

        ${items.length
          ? html`<div className="calendar-slot-body">${items.map((entry) => renderEntryCard(entry))}</div>`
          : html`
              <div className="calendar-empty-block">
                <div className="calendar-empty-emoji">✨</div>
                <div className="calendar-empty-title">Rien de prévu</div>
                <div className="calendar-empty-copy">Ajoute un bloc pour organiser cette journée.</div>
              </div>
            `}
      </section>
    `;
  }

  function renderAgendaDayHeader(date) {
    const dateKey = localDateKey(date);
    const isToday = dateKey === todayKey;
    const monthDayLabel = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const weekdayLabel = date.toLocaleDateString("fr-FR", { weekday: "long" });

    return html`
      <section className="calendar-day-summary" key=${`summary-${dateKey}`}>
        <div className="calendar-panel-head">
          <div>
            <div className="calendar-panel-title">${isToday ? `Aujourd'hui · ${monthDayLabel}` : monthDayLabel}</div>
            <div className="calendar-panel-subtitle">${weekdayLabel}</div>
          </div>
          <button className="calendar-panel-add" onClick=${() => openCreateModal(dateKey)} title="Ajouter un bloc">+</button>
        </div>
      </section>
    `;
  }

  function renderMonthPickerCell(date) {
    const dateKey = localDateKey(date);
    const isSelected = focusDateKey === dateKey;
    const isToday = dateKey === todayKey;
    const items = itemsForDate(date);
    const visibleDots = items.slice(0, 3);

    return html`
      <button
        key=${dateKey}
        className=${`calendar-month-picker-btn ${isSelected ? "on" : ""} ${isToday ? "today" : ""}`}
        onClick=${() => setFocusDateKey(dateKey)}
      >
        <span className="calendar-month-picker-day">${date.getDate()}</span>
        ${visibleDots.length
          ? html`
              <span className="calendar-month-picker-dots">
                ${visibleDots.map((entry, index) => html`
                  <span
                    key=${`${dateKey}-dot-${index}`}
                    className="calendar-month-picker-dot"
                    style=${{
                      background:
                        entry.entryKind === "deadline"
                          ? "var(--mrd-a)"
                          : entry.personId
                            ? peopleMap[entry.personId]?.color || "var(--mrd-a)"
                            : "var(--mrd-a)",
                    }}
                  ></span>
                `)}
              </span>
            `
          : html`<span className="calendar-month-picker-spacer"></span>`}
      </button>
    `;
  }

  function renderWeekDayButton(date) {
    const dateKey = localDateKey(date);
    const isSelected = focusDateKey === dateKey;
    const isToday = dateKey === todayKey;
    const items = itemsForDate(date);
    return html`
      <button
        key=${dateKey}
        className=${`calendar-week-day ${isSelected ? "on" : ""} ${isToday ? "today" : ""}`}
        onClick=${() => setFocusDateKey(dateKey)}
        style=${{ userSelect: "none", WebkitUserSelect: "none", WebkitTapHighlightColor: "transparent" }}
      >
        <span className="calendar-week-day-abbr">${DAYS[(date.getDay() + 6) % 7].slice(0, 3)}</span>
        <span className="calendar-week-day-date">${date.getDate()}</span>
        ${items.length ? html`<span className="calendar-week-day-dot"></span>` : null}
      </button>
    `;
  }

  function renderTimelineEvent(entry, options = {}) {
    const linkedTask = entry.taskId
      ? taskChoices.find((task) => task.id === entry.taskId)
      : entry.entryKind === "deadline"
        ? taskChoices.find((task) => task.id === entry.id)
        : null;
    const assignedPerson = linkedTask ? activePeople.find((person) => person.id === linkedTask.assignedPersonId) : null;
    const taskIsDone = linkedTask ? completedIds(linkedTask).length > 0 : false;
    const timeLabel = entry.allDay ? "Toute la journée" : `${entry.start} · ${humanDuration(entry)}`;

    return html`
      <button
        key=${`${entry.entryKind}-${entry.id}-${entry.dateKey || ""}-timeline`}
        className=${`calendar-timeline-event${taskIsDone ? " done" : ""}${options.className ? ` ${options.className}` : ""}`}
        style=${{
          ...(!taskIsDone && entry.entryKind === "deadline" ? { background: "var(--mrd-aLt)", borderColor: "var(--mrd-aMd)" } : {}),
          ...(options.style || {}),
        }}
        onClick=${() => setViewEntry(entry)}
      >
        <div
          className="calendar-timeline-event-accent"
          style=${{
            background:
              entry.entryKind === "deadline"
                ? "var(--mrd-a)"
                : assignedPerson?.color || "var(--mrd-a)",
          }}
        ></div>
        <div className="calendar-timeline-event-main">
          <div className="calendar-timeline-event-title">
            ${entry.icon ? `${entry.icon} ` : ""}${entry.text}
          </div>
          ${!options.hideTimeMeta ? html`<div className="calendar-timeline-event-meta">${options.timeLabel || timeLabel}</div>` : null}
        </div>
        ${assignedPerson
          ? html`<span className="calendar-timeline-event-avatar" style=${{ background: assignedPerson.color }}>${assignedPerson.shortId || assignedPerson.label?.[0] || "•"}</span>`
          : null}
      </button>
    `;
  }

  function layoutTimedEntries(entries) {
    const prepared = entries
      .map((entry) => {
        const startMinutes = timeToMinutes(entry.start);
        const duration = Math.max(15, Number(entry.duration) || 60);
        return {
          entry,
          startMinutes,
          endMinutes: startMinutes + duration,
          duration,
        };
      })
      .sort((left, right) => left.startMinutes - right.startMinutes || right.duration - left.duration);

    const clusters = [];
    let currentCluster = [];
    let currentEnd = -1;

    prepared.forEach((item) => {
      if (currentCluster.length && item.startMinutes >= currentEnd) {
        clusters.push(currentCluster);
        currentCluster = [item];
        currentEnd = item.endMinutes;
        return;
      }
      currentCluster.push(item);
      currentEnd = Math.max(currentEnd, item.endMinutes);
    });

    if (currentCluster.length) {
      clusters.push(currentCluster);
    }

    return clusters.flatMap((cluster) => {
      const active = [];
      let columnCount = 1;

      cluster.forEach((item) => {
        for (let index = active.length - 1; index >= 0; index -= 1) {
          if (active[index].endMinutes <= item.startMinutes) {
            active.splice(index, 1);
          }
        }
        const usedColumns = new Set(active.map((entry) => entry.column));
        let column = 0;
        while (usedColumns.has(column)) column += 1;
        item.column = column;
        active.push(item);
        columnCount = Math.max(columnCount, active.length);
      });

      return cluster.map((item) => ({
        ...item,
        columnCount,
      }));
    });
  }

  function renderTimeline(date) {
    const items = itemsForDate(date);
    const allDayItems = items.filter((entry) => entry.allDay);
    const timedItems = items.filter((entry) => !entry.allDay && entry.start);
    const positionedEntries = layoutTimedEntries(timedItems);
    const itemStartHours = positionedEntries
      .map((item) => Math.floor(item.startMinutes / 60))
      .filter((value) => Number.isFinite(value));
    const itemEndHours = positionedEntries
      .map((item) => Math.ceil(item.endMinutes / 60))
      .filter((value) => Number.isFinite(value));
    const startHour = itemStartHours.length ? Math.max(6, Math.min(...itemStartHours) - 1) : 7;
    const endHour = itemEndHours.length ? Math.min(22, Math.max(...itemEndHours)) : 21;
    const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
    const rowHeight = 64;
    const totalHeight = hours.length * rowHeight;

    return html`
      <section className="calendar-timeline">
        <div className="calendar-timeline-head">${viewMode === "day" ? "Journée complète" : "Planning horaire"}</div>

        ${allDayItems.length
          ? html`<div className="calendar-timeline-all-day">${allDayItems.map((entry) => renderTimelineEvent(entry))}</div>`
          : null}

        <div className="calendar-timeline-grid" style=${{ height: `${totalHeight}px` }}>
          <div className="calendar-timeline-hours">
            ${hours.map((hour) => html`
              <div className="calendar-timeline-hour-row" key=${`${localDateKey(date)}-${hour}`} style=${{ height: `${rowHeight}px` }}>
                <div className="calendar-timeline-hour">${pad2(hour)}h</div>
              </div>
            `)}
          </div>
          <div className="calendar-timeline-track-absolute" style=${{ height: `${totalHeight}px` }}>
            ${hours.map((hour, index) => html`
              <div
                className="calendar-timeline-slot-line"
                key=${`${localDateKey(date)}-line-${hour}`}
                style=${{ top: `${index * rowHeight}px`, height: `${rowHeight}px` }}
              ></div>
            `)}
            <div className="calendar-timeline-events-layer">
              ${positionedEntries.map((item) => {
                const top = ((item.startMinutes - startHour * 60) / 60) * rowHeight;
                const height = Math.max(28, (item.duration / 60) * rowHeight - 2);
                const widthPercent = 100 / Math.max(1, item.columnCount);
                const left = `calc(${item.column * widthPercent}% + ${item.column * 6}px)`;
                const width = `calc(${widthPercent}% - ${item.columnCount > 1 ? 8 : 0}px)`;
                return renderTimelineEvent(item.entry, {
                  className: "calendar-timeline-event-positioned",
                  style: {
                    top: `${top}px`,
                    height: `${height}px`,
                    left,
                    width,
                  },
                  hideTimeMeta: true,
                });
              })}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  function renderDayWithTimeline(date) {
    const dateKey = localDateKey(date);
    const isToday = dateKey === todayKey;
    const monthDayLabel = date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const weekdayLabel = date.toLocaleDateString("fr-FR", { weekday: "long" });
    const items = itemsForDate(date);
    const allDayItems = items.filter((entry) => entry.allDay);
    const timedItems = items.filter((entry) => !entry.allDay && entry.start);
    const positionedEntries = layoutTimedEntries(timedItems);
    const startHour = 6;
    const endHour = 21;
    const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
    const rowHeight = 64;
    const totalHeight = hours.length * rowHeight;

    return html`
      <section className="calendar-timeline" key=${`daypanel-${dateKey}`}>
        <div className="calendar-panel-head">
          <div>
            <div className="calendar-panel-title">${isToday ? `Aujourd'hui · ${monthDayLabel}` : monthDayLabel}</div>
            <div className="calendar-panel-subtitle">${weekdayLabel}</div>
          </div>
          <button className="calendar-panel-add" onClick=${() => openCreateModal(dateKey)} title="Ajouter un bloc">+</button>
        </div>

        ${allDayItems.length
          ? html`<div className="calendar-timeline-all-day">${allDayItems.map((entry) => renderTimelineEvent(entry))}</div>`
          : null}

        <div className="calendar-timeline-grid" style=${{ height: `${totalHeight}px` }}>
          <div className="calendar-timeline-hours">
            ${hours.map((hour) => html`
              <div className="calendar-timeline-hour-row" key=${`${dateKey}-${hour}`} style=${{ height: `${rowHeight}px` }}>
                <div className="calendar-timeline-hour">${pad2(hour)}h</div>
              </div>
            `)}
          </div>
          <div className="calendar-timeline-track-absolute" style=${{ height: `${totalHeight}px` }}>
            ${hours.map((hour, index) => html`
              <div
                className="calendar-timeline-slot-line"
                key=${`${dateKey}-line-${hour}`}
                style=${{ top: `${index * rowHeight}px`, height: `${rowHeight}px` }}
              ></div>
            `)}
            <div className="calendar-timeline-events-layer">
              ${positionedEntries.map((item) => {
                const top = ((item.startMinutes - startHour * 60) / 60) * rowHeight;
                const height = Math.max(28, (item.duration / 60) * rowHeight - 2);
                const widthPercent = 100 / Math.max(1, item.columnCount);
                const left = `calc(${item.column * widthPercent}% + ${item.column * 6}px)`;
                const width = `calc(${widthPercent}% - ${item.columnCount > 1 ? 8 : 0}px)`;
                return renderTimelineEvent(item.entry, {
                  className: "calendar-timeline-event-positioned",
                  style: {
                    top: `${top}px`,
                    height: `${height}px`,
                    left,
                    width,
                  },
                  hideTimeMeta: true,
                });
              })}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  const visibleView = (() => {
    if (viewMode === "day") {
      return {
        navLabel: viewLabel("day", focusDate, weekDays),
        top: null,
        body: html`
          <div className="calendar-view-stack">
            ${renderDayWithTimeline(focusDate)}
          </div>
        `,
      };
    }

    if (viewMode === "month") {
      const days = monthGridDays(focusDate);
      return {
        navLabel: viewLabel("month", focusDate, weekDays),
        top: html`
          <div className="calendar-month-dow">
            ${CALENDAR_WEEKDAY_MINI.map((label, index) => html`<div key=${`${label}-${index}`} className="calendar-month-dow-item">${label}</div>`)}
          </div>
        `,
        body: html`
          <div className="calendar-view-stack">
            <div className="calendar-month-picker">
              ${days.map((date, index) => (
                date.getMonth() === focusDate.getMonth()
                  ? renderMonthPickerCell(date)
                  : html`<div key=${`gap-${index}`} className="calendar-month-picker-gap"></div>`
              ))}
            </div>
            ${renderAgendaDayPanel(focusDate)}
          </div>
        `,
      };
    }

    return {
      navLabel: viewLabel("week", focusDate, weekDays),
      top: html`<div className="calendar-week-strip">${weekDays.map((date) => renderWeekDayButton(date))}</div>`,
      body: html`
        <div className="calendar-view-stack">
          ${renderDayWithTimeline(focusDate)}
        </div>
      `,
    };
  })();

  return html`
    <section className="calendar-shell">
      <div className="calendar-toolbar">
        <${SegmentedTabs}
          ariaLabel="Navigation de l’agenda"
          options=${[
            { id: "day", label: "☀️ Jour" },
            { id: "week", label: "📅 Semaine" },
            { id: "month", label: "🗓️ Mois" },
          ]}
          activeId=${viewMode}
          onChange=${setViewMode}
        />
      </div>

      <div className="calendar-nav-card">
        <button className="clrbtn" onClick=${() => moveRange(-1)}>←</button>
        <div className="calendar-nav-label">${visibleView.navLabel}</div>
        <button className="clrbtn" onClick=${() => moveRange(1)}>→</button>
      </div>

      ${visibleView.top}
      ${visibleView.body}

      ${renderDetailPopup()}

      ${showModal
        ? (() => {
            const LBL = { fontSize: 11, fontWeight: 700, color: "var(--mrd-fg3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, display: "block" };
            const PILL_STACK = { flex: 1, padding: "10px 6px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, transition: "all 0.15s", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 0, textAlign: "center", border: "none" };
            const repeatLabel = viewMode === "day" ? "jour" : viewMode === "month" ? "mois" : "semaine";
            const isRecurringLocked = editing?.entryKind === "recurring";
            return html`
              <div className="modal-backdrop task-create-backdrop" onClick=${closeModal}>
                <div className="modal-card task-modal-redesign" onClick=${(e) => e.stopPropagation()}
                  style=${{ width: "min(560px, 100%)" }}>

                  <!-- En-tête -->
                  <div className="mrd-mhd">
                    <span className="mrd-mtitle">${editing ? "Modifier le bloc" : "Nouveau bloc calendrier"}</span>
                    <button type="button" onClick=${closeModal} className="mrd-mclose">✕</button>
                  </div>

                  <form onSubmit=${submit} className="mrd-mbody" style=${{ paddingBottom: "calc(28px + env(safe-area-inset-bottom,0px))" }}>

                    <!-- 1. TYPE -->
                    <div>
                      <span className="mrd-mlbl">Type</span>
                      <div style=${{ display: "flex", gap: 6 }}>
                        ${[
                          { id: "task",   label: "Tâche existante", icon: "📋" },
                          { id: "custom", label: "Événement libre",  icon: "✨" },
                        ].map((t) => {
                          const on = form.entryType === t.id;
                          return html`
                            <button key=${t.id} type="button"
                              style=${{ ...PILL_STACK, background: on ? "var(--mrd-a)" : "var(--mrd-surf2)", color: on ? "#fff" : "var(--mrd-fg2)", border: "1.5px solid " + (on ? "var(--mrd-a)" : "var(--mrd-border)") }}
                              onClick=${() => setEntryType(t.id)}>
                              <span style=${{ fontSize: 20, lineHeight: 1 }}>${t.icon}</span>
                              <span>${t.label}</span>
                            </button>
                          `;
                        })}
                      </div>
                    </div>

                    <!-- 2. Contenu selon type -->
                    ${form.entryType === "task"
                      ? html`
                          <div>
                            <span className="mrd-mlbl">Tâche du foyer</span>
                            <div style=${{ position: "relative" }}>
                              <span style=${{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, pointerEvents: "none", zIndex: 1 }}>✅</span>
                              <select value=${form.taskId}
                                onChange=${(e) => setForm({ ...form, taskId: e.target.value })}
                                style=${{ width: "100%", paddingLeft: 44, paddingRight: 36, paddingTop: 13, paddingBottom: 13, background: "var(--mrd-surf2)", border: "1.5px solid " + (form.taskId ? "var(--mrd-a)" : "var(--mrd-border)"), borderRadius: 14, fontSize: 14, fontWeight: 500, color: "var(--mrd-fg)", outline: "none", appearance: "none", WebkitAppearance: "none", cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s" }}>
                                <option value="">Choisir une tâche…</option>
                                ${taskChoices.map((task) => html`<option value=${task.id} key=${task.id}>${buildTaskLabel(task)}</option>`)}
                              </select>
                              <span style=${{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "var(--mrd-fg3)", pointerEvents: "none" }}>▼</span>
                            </div>
                          </div>
                        `
                      : html`
                          <div>
                            <span className="mrd-mlbl">Événement</span>
                            <div style=${{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <button type="button"
                                onClick=${() => setShowEmojiPicker(true)}
                                title="Choisir un emoji"
                                style=${{ width: 50, height: 50, minWidth: 50, flexShrink: 0, borderRadius: 14, background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-border)", fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "border-color 0.15s" }}>
                                ${form.emoji || html`<span style=${{ fontSize: 20, color: "var(--mrd-fg3)" }}>😊</span>`}
                              </button>
                              <div style=${{ flex: 1, background: "var(--mrd-surf2)", borderRadius: 14, border: "1.5px solid " + (form.title ? "var(--mrd-a)" : "var(--mrd-border)"), padding: "12px 14px", transition: "border-color 0.15s" }}>
                                <input
                                  value=${form.title}
                                  onInput=${(e) => setForm({ ...form, title: e.target.value })}
                                  placeholder="Piscine, pédiatre, sortie…"
                                  style=${{ width: "100%", background: "none", border: "none", fontSize: 15, fontWeight: 500, color: "var(--mrd-fg)", outline: "none", padding: 0, fontFamily: "inherit" }}
                                />
                              </div>
                            </div>
                          </div>
                        `}

                    <!-- 3. Date + Heure -->
                    <div>
                      <span className="mrd-mlbl">Date et heure</span>
                      <div style=${{ display: "flex", gap: 8 }}>
                        <div style=${{ flex: 1.4, position: "relative" }}>
                          <span style=${{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none" }}>📅</span>
                          <input type="date" value=${form.dateKey}
                            onInput=${(e) => setForm({ ...form, dateKey: e.target.value })}
                            style=${{ width: "100%", paddingLeft: 36, paddingRight: 8, paddingTop: 12, paddingBottom: 12, background: "var(--mrd-surf2)", border: "1px solid var(--mrd-border)", borderRadius: 14, fontSize: 13, color: "var(--mrd-fg)", outline: "none", appearance: "none", fontFamily: "inherit" }}
                          />
                        </div>
                        <div style=${{ flex: 1, position: "relative" }}>
                          <span style=${{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none" }}>🕐</span>
                          <input type="time" value=${form.start}
                            disabled=${form.allDay}
                            onInput=${(e) => {
                              const newStart = e.target.value;
                              const dur = form.endTime ? endToDuration(form.start, form.endTime) : 60;
                              setForm({ ...form, start: newStart, endTime: addMinutesToTime(newStart, dur) });
                            }}
                            style=${{ width: "100%", paddingLeft: 36, paddingRight: 8, paddingTop: 12, paddingBottom: 12, background: "var(--mrd-surf2)", border: "1px solid var(--mrd-border)", borderRadius: 14, fontSize: 13, color: form.allDay ? "var(--mrd-fg3)" : "var(--mrd-fg)", outline: "none", appearance: "none", fontFamily: "inherit" }}
                          />
                        </div>
                      </div>

                      <!-- Durée -->
                      <div style=${{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                        ${showDurationPicker && !form.allDay
                          ? html`
                              <div style=${{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                                <input
                                  type="number" min="1"
                                  value=${form.customDurationValue}
                                  onInput=${(e) => {
                                    const val = Math.max(1, Number(e.target.value) || 1);
                                    const mins = form.customDurationUnit === "hours" ? val * 60 : val;
                                    setForm({ ...form, durationPreset: "custom", customDurationValue: val, endTime: addMinutesToTime(form.start, mins) });
                                  }}
                                  style=${{ width: 70, padding: "10px 10px", background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-a)", borderRadius: 12, fontSize: 15, fontWeight: 600, color: "var(--mrd-fg)", outline: "none", textAlign: "center", fontFamily: "inherit" }}
                                />
                                <select
                                  value=${form.customDurationUnit}
                                  onChange=${(e) => {
                                    const unit = e.target.value;
                                    const mins = unit === "hours" ? form.customDurationValue * 60 : form.customDurationValue;
                                    setForm({ ...form, durationPreset: "custom", customDurationUnit: unit, endTime: addMinutesToTime(form.start, mins) });
                                  }}
                                  style=${{ flex: 1, padding: "10px 10px", background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-border)", borderRadius: 12, fontSize: 14, fontWeight: 500, color: "var(--mrd-fg)", outline: "none", appearance: "none", WebkitAppearance: "none", fontFamily: "inherit", cursor: "pointer" }}>
                                  <option value="minutes">minutes</option>
                                  <option value="hours">heures</option>
                                </select>
                              </div>
                            `
                          : null}
                        <button type="button"
                          style=${{ padding: "10px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: (showDurationPicker && !form.allDay) ? "var(--mrd-aLt)" : "var(--mrd-surf2)", color: (showDurationPicker && !form.allDay) ? "var(--mrd-a)" : "var(--mrd-fg3)", border: "1.5px solid " + ((showDurationPicker && !form.allDay) ? "var(--mrd-aMd)" : "var(--mrd-border)"), whiteSpace: "nowrap" }}
                          onClick=${() => { setShowDurationPicker(!showDurationPicker); if (form.allDay) setForm({ ...form, allDay: false, durationPreset: "custom", endTime: addMinutesToTime(form.start, form.customDurationValue * (form.customDurationUnit === "hours" ? 60 : 1)) }); }}>
                          ${showDurationPicker && !form.allDay ? "⏱ Durée activée" : "+ Ajouter une durée"}
                        </button>
                        <button type="button"
                          style=${{ padding: "10px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: form.allDay ? "var(--mrd-a)" : "var(--mrd-surf2)", color: form.allDay ? "#fff" : "var(--mrd-fg3)", border: "1.5px solid " + (form.allDay ? "var(--mrd-a)" : "var(--mrd-border)"), whiteSpace: "nowrap" }}
                          onClick=${() => { setShowDurationPicker(false); setForm({ ...form, allDay: !form.allDay, durationPreset: !form.allDay ? "all-day" : "60", endTime: !form.allDay ? "" : addMinutesToTime(form.start, 60) }); }}>
                          Toute la journée
                        </button>
                      </div>
                    </div>

                    <!-- 4. Attribué à -->
                    <div>
                      <span className="mrd-mlbl">Attribué à</span>
                      <div style=${{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button type="button"
                          onClick=${() => setForm({ ...form, wholeFamily: !form.wholeFamily, personIds: [] })}
                          title="Toute la famille"
                          style=${{ width: 40, height: 40, borderRadius: "50%", border: "2px solid " + (form.wholeFamily ? "var(--mrd-a)" : "var(--mrd-border)"), background: form.wholeFamily ? "var(--mrd-aLt)" : "var(--mrd-surf2)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>
                          👥
                        </button>
                        ${(adultPeople.length ? adultPeople : activePeople).map((person) => {
                          const on = form.personIds.includes(person.id) && !form.wholeFamily;
                          return html`
                            <button key=${person.id} type="button"
                              onClick=${() => toggleMainPerson(person.id)}
                              title=${person.displayName || person.label}
                              style=${{ width: 40, height: 40, borderRadius: "50%", padding: 0, border: "2.5px solid " + (on ? (person.color || "var(--mrd-a)") : "var(--mrd-border)"), background: "transparent", cursor: "pointer", flexShrink: 0, transition: "all 0.15s", boxShadow: on ? "0 0 0 3px " + (person.color || "var(--mrd-a)") + "33" : "none" }}>
                              <div style=${{ width: 35, height: 35, borderRadius: "50%", background: person.color || "var(--mrd-fg2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mrd-white)", fontSize: 13, fontWeight: 700, margin: "auto" }}>
                                ${person.shortId || String(person.displayName || person.label || "?")[0].toUpperCase()}
                              </div>
                            </button>
                          `;
                        })}
                      </div>
                    </div>

                    <!-- 5. Personne concernée -->
                    ${childPeople.length ? html`
                      <div>
                        <span className="mrd-mlbl">Personne concernée</span>
                        ${!showConcernedPicker
                          ? html`
                              <button type="button"
                                onClick=${() => setShowConcernedPicker(true)}
                                style=${{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "var(--mrd-surf2)", color: "var(--mrd-fg3)", border: "1px solid var(--mrd-border)", transition: "all 0.15s" }}>
                                + Ajouter une personne
                              </button>
                            `
                          : html`
                              <div style=${{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                ${childPeople.map((child) => {
                                  const on = form.childIds.includes(child.id);
                                  return html`
                                    <button key=${child.id} type="button"
                                      onClick=${() => toggleChild(child.id)}
                                      style=${{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 5px", borderRadius: 99, border: "2px solid " + (on ? (child.color || "var(--mrd-a)") : "var(--mrd-border)"), background: on ? (child.color || "var(--mrd-a)") + "18" : "transparent", cursor: "pointer", transition: "all 0.15s" }}>
                                      <div style=${{ width: 26, height: 26, borderRadius: "50%", background: child.color || "var(--mrd-fg2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mrd-white)", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                        ${child.shortId || String(child.displayName || child.label || "?")[0].toUpperCase()}
                                      </div>
                                      <span style=${{ fontSize: 12, fontWeight: 600, color: on ? "var(--mrd-fg)" : "var(--mrd-fg2)" }}>${child.displayName || child.label}</span>
                                    </button>
                                  `;
                                })}
                              </div>
                            `}
                      </div>
                    ` : null}

                    <!-- 6. Répéter (toggle switch) -->
                    <label style=${{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", background: "var(--mrd-surf2)", border: "1px solid var(--mrd-borderSoft)", borderRadius: 14, cursor: isRecurringLocked ? "default" : "pointer", opacity: isRecurringLocked ? 0.6 : 1 }}>
                      <span style=${{ fontSize: 18, flexShrink: 0 }}>↻</span>
                      <span style=${{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--mrd-fg)" }}>
                        Répéter chaque ${repeatLabel}
                      </span>
                      <span style=${{ position: "relative", width: 44, height: 24, display: "inline-block", flexShrink: 0 }}>
                        <input type="checkbox"
                          checked=${form.repeatWeekly}
                          disabled=${isRecurringLocked}
                          onChange=${(e) => setForm({ ...form, repeatWeekly: e.target.checked })}
                          style=${{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                        <span style=${{ position: "absolute", inset: 0, borderRadius: 99, background: form.repeatWeekly ? "var(--mrd-a)" : "var(--mrd-switchOff)", transition: "background 0.2s" }}></span>
                        <span style=${{ position: "absolute", top: 3, left: form.repeatWeekly ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "var(--mrd-white)", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }}></span>
                      </span>
                    </label>

                    <!-- 7. Actions -->
                    <div style=${{ display: "flex", gap: 10, paddingTop: 4 }}>
                      <button type="button" onClick=${closeModal}
                        style=${{ flex: "0 0 auto", padding: "13px 20px", borderRadius: "var(--mrd-r)", background: "var(--mrd-surf2)", color: "var(--mrd-fg2)", fontSize: 14, fontWeight: 600, cursor: "pointer", border: "1px solid var(--mrd-border)", transition: "all 0.15s", fontFamily: "inherit" }}>
                        Annuler
                      </button>
                      <button type="submit"
                        style=${{ flex: 1, padding: "13px 0", borderRadius: "var(--mrd-r)", background: "var(--mrd-a)", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", border: "none", boxShadow: "0 6px 20px oklch(58% 0.13 28 / 0.28)", transition: "all 0.2s", fontFamily: "inherit" }}>
                        ${editing ? "Enregistrer" : "Ajouter au calendrier"}
                      </button>
                    </div>

                  </form>
                </div>
              </div>
            `;
          })()
        : null}

      ${showEmojiPicker ? html`
        <${EmojiPicker}
          onSelect=${(emoji) => { setForm((prev) => ({ ...prev, emoji, useEmoji: true })); setShowEmojiPicker(false); }}
          onClose=${() => setShowEmojiPicker(false)}
        />
      ` : null}
    </section>
  `;
}

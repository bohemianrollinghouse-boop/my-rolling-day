import { DAYS } from "../../constants.js";
import { html, useEffect, useMemo, useState } from "../../lib.js";
import { addMinutesToTime, frDateLabel, getCurrentAppDate, getWeekDays, localDateKey, localWeekStart, minutesToLabel, pad2 } from "../../utils/date.js?v=2026-04-19-time-sim-2";
import { completedIds, TaskCard } from "../tasks/TaskCard.js?v=2026-04-19-time-sim-1";

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

function createEmptyForm(tasks, people) {
  return {
    entryType: "task",
    taskId: tasks[0]?.id || "",
    title: "",
    useEmoji: true,
    emoji: "🗓️",
    dateKey: localDateKey(getCurrentAppDate()),
    start: "09:00",
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

  const [viewMode, setViewMode] = useState("week");
  const [focusDateKey, setFocusDateKey] = useState(localDateKey(getCurrentAppDate()));
  const [showModal, setShowModal] = useState(false);
  const [viewEntry, setViewEntry] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(() => createEmptyForm(taskChoices, activePeople));

  const focusDate = parseDateKey(focusDateKey);
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
    setShowModal(true);
  }

  function openEditModal(entry, entryKind) {
    const customDuration = customDurationFromEntry(entry);
    setEditing({ id: entry.id, entryKind });
    setForm({
      entryType: entry.sourceType === "task" ? "task" : "custom",
      taskId: entry.taskId || "",
      title: entry.sourceType === "task" ? "" : entry.text || "",
      useEmoji: entry.sourceType === "task" ? true : Boolean(entry.icon),
      emoji: entry.sourceType === "task" ? entry.icon || "" : entry.icon || "🗓️",
      dateKey: entry.dateKey || focusDateKey,
      start: entry.start || "09:00",
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
    const durationInfo = normalizeDuration(form);
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
    const recurring = recurringItems
      .filter((item) => Number(item.weekday) === date.getDay())
      .map((item) => recurringToAgendaDate(item, date));
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

    let cardStyle;
    if (isDeadline) {
      cardStyle = { borderLeft: "3px solid #f59e0b", background: "var(--deadline-card-bg, #fffbeb)", cursor: "pointer" };
    } else if (taskIsDone) {
      cardStyle = { borderLeft: "3px solid #10b981", background: "var(--done-card-bg, #f0fdf4)", opacity: "0.8", cursor: "pointer" };
    } else {
      cardStyle = { cursor: "pointer" };
    }

    return html`
      <article className="calendar-card" key=${`${entry.entryKind}-${entry.id}-${entry.dateKey || ""}`}
        style=${cardStyle}
        onClick=${() => setViewEntry(entry)}>
      <div className="calendar-card-top">
        <div className="calendar-card-title">
          <span className="calendar-card-icon">${entry.icon || "•"}</span>
          <div>
            <div className="cblktitle" style=${taskIsDone ? { textDecoration: "line-through", opacity: "0.7" } : {}}>${entry.text}</div>
            <div className="cblksub">${isDeadline
              ? (entry.allDay ? "À faire dans la journée" : `Avant ${entry.start}`)
              : dateTimeLabel(entry)}</div>
            ${assignedPerson ? html`<div className="mini">Attribuée à : ${assignedPerson.label}</div>` : null}
          </div>
        </div>
      </div>
      <div className="calendar-tags">
        ${isDeadline
          ? html`<span className="calendar-tag" style=${{ background: "#fef3c7", color: "#92400e", fontWeight: "600" }}>⏰ Échéance</span>`
          : taskIsDone
            ? html`<span className="calendar-tag" style=${{ background: "#d1fae5", color: "#065f46", fontWeight: "600" }}>✓ Terminée</span>`
            : html`
                ${linkedTask ? html`<span className="calendar-tag">${linkedTask.priority === "urgent" ? "Urgente" : linkedTask.priority === "deadline" ? "À faire avant" : "Normale"}</span>` : null}
                ${entry.entryKind === "recurring" ? html`<span className="calendar-tag">Chaque semaine</span>` : null}
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
                      ? { background: person.color, borderColor: person.color, color: "#fff" }
                      : { background: "#fff", borderColor: person.color || "#D8CEBF", color: person.color || "#8A7868" }}
                    onClick=${() => onToggleTask(linkedTask.id, person.id)}
                    title=${`Marquer ${person.label} comme personne ayant fait la tâche`}
                  >
                    <span className="task-person-avatar" style=${isSelected ? { background: "transparent", color: "#fff" } : { background: "#fff", color: person.color || "#8A7868" }}>
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
      const calendarOnlyDelete = () => {
        if (isDeadline) return;
        if (entry.entryKind === "recurring") {
          onDeleteRecurring(entry.id);
        } else {
          onDeleteAgenda(entry.id);
        }
        setViewEntry(null);
      };

      const deleteTaskEverywhere = () => {
        onDeleteTask(linkedTask.id);
        setViewEntry(null);
      };

      return html`
        <div className="modal-backdrop" onClick=${() => setViewEntry(null)}>
          <div className="modal-card task-modal" onClick=${(e) => e.stopPropagation()}>
            <div className="task-modal-head">
              <div>
                <div className="miniTitle">${isDeadline ? "Échéance" : `Tâche · ${taskPeriodLabel(linkedTask.type)}`}</div>
              </div>
              <button className="delbtn" onClick=${() => setViewEntry(null)}>X</button>
            </div>

            <div style=${{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
            </div>

            <div style=${{ marginBottom: "14px" }}>
              <${TaskCard}
                task=${linkedTask}
                people=${activePeople}
                completers=${adultPeople.length ? adultPeople : activePeople}
                planning=${{
                  dateKey: entry.dateKey || "",
                  start: entry.start || "",
                  allDay: Boolean(entry.allDay),
                  durationLabel: humanDuration(entry),
                  personIds: entry.personIds || (entry.personId ? [entry.personId] : []),
                  childLabels: (entry.childIds || []).map((childId) => peopleMap[childId]?.displayName || peopleMap[childId]?.label).filter(Boolean),
                }}
                onToggleTask=${onToggleTask}
                index=${0}
                listLength=${1}
                showDelete=${false}
                showOrder=${false}
              />
            </div>

            <div style=${{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
              ${!isDeadline ? html`<button className="clrbtn" onClick=${() => { setViewEntry(null); openEditModal(entry, entry.entryKind); }}>Modifier le bloc</button>` : null}
              ${!isDeadline ? html`<button className="ghost-btn" onClick=${calendarOnlyDelete}>Retirer du calendrier</button>` : null}
              <button className="ghost-btn" onClick=${deleteTaskEverywhere}>Supprimer la tâche complète</button>
              <button className="aok" style=${{ background: "var(--surface2,#f0f0f0)", color: "var(--text,#333)" }} onClick=${() => setViewEntry(null)}>Fermer</button>
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
                ${isDeadline ? "Échéance" : linkedTask ? `Tâche · ${taskPeriodLabel(linkedTask.type)}` : entry.entryKind === "recurring" ? "Chaque semaine" : "Événement libre"}
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
            <div style=${{ borderTop: "1px solid var(--border,#eee)", paddingTop: "12px", marginBottom: "14px" }}>
              <div className="miniTitle" style=${{ marginBottom: "10px" }}>
                ${isDone ? "✅ Tâche terminée" : "Marquer comme fait"}
              </div>

              ${activePerson ? html`
                <button type="button"
                  className=${`aok ${activePersonDone ? "" : ""}`}
                  style=${{ width: "100%", marginBottom: "10px", background: activePersonDone ? "#6ee7b7" : "", justifyContent: "center" }}
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
            <button className="aok" style=${{ background: "var(--surface2,#f0f0f0)", color: "var(--text,#333)" }} onClick=${() => setViewEntry(null)}>Fermer</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderDayColumn(date, monthMode = false) {
    const items = itemsForDate(date);
    const dateKey = localDateKey(date);
    return html`
      <section className=${`calendar-slot ${monthMode ? "calendar-slot-month" : ""}`} key=${dateKey}>
        <div className="calendar-slot-head">
          <div className="cdayname">${DAYS[(date.getDay() + 6) % 7]}</div>
          <div className="cdaydate">${frDateLabel(date)}</div>
        </div>
        <div className="calendar-slot-body">
          ${items.map((entry) => renderEntryCard(entry))}
          ${!items.length
            ? html`<button className="calendar-empty" onClick=${() => openCreateModal(dateKey)}>Ajouter un bloc</button>`
            : null}
        </div>
      </section>
    `;
  }

  function renderMonthCell(date) {
    const items = itemsForDate(date);
    const dateKey = localDateKey(date);
    const visibleItems = items.slice(0, 3);
    const hiddenCount = Math.max(0, items.length - visibleItems.length);
    return html`
      <section className="calendar-month-slot" key=${dateKey}>
        <button className="calendar-month-head" onClick=${() => openCreateModal(dateKey)}>
          <span className="calendar-month-day">${date.getDate()}</span>
          ${items.length ? html`<span className="calendar-month-count">${items.length}</span>` : null}
        </button>
        <div className="calendar-month-list">
          ${visibleItems.map(
            (entry) => {
              const linkedTask = entry.taskId ? taskChoices.find((t) => t.id === entry.taskId) : (entry.entryKind === "deadline" ? taskChoices.find((t) => t.id === entry.id) : null);
              const taskIsDone = linkedTask ? completedIds(linkedTask).length > 0 : false;
              const displayText = linkedTask ? `${linkedTask.icon ? `${linkedTask.icon} ` : ""}${linkedTask.text}` : `${entry.icon ? `${entry.icon} ` : ""}${entry.text}`;
              return html`
              <button
                key=${`${entry.entryKind}-${entry.id}-${dateKey}`}
                className="calendar-month-item"
                style=${entry.entryKind === "deadline" ? { background: "#fef3c7", borderLeft: "2px solid #f59e0b" } : {}}
                onClick=${() => setViewEntry(entry)}
                title=${displayText}
              >
                <span className="calendar-month-item-time">${entry.allDay ? "Jour" : entry.start}</span>
                <span className="calendar-month-item-text" style=${taskIsDone ? { textDecoration: "line-through", opacity: "0.7" } : {}}>${displayText}</span>
              </button>
            `;
            },
          )}
          ${hiddenCount > 0 ? html`<div className="calendar-month-more">+${hiddenCount}</div>` : null}
        </div>
      </section>
    `;
  }

  const visibleView = useMemo(() => {
    if (viewMode === "day") {
      return {
        navLabel: viewLabel("day", focusDate, weekDays),
        body: html`<div className="calendar-day-view">${renderDayColumn(focusDate)}</div>`,
      };
    }

    if (viewMode === "month") {
      const days = monthGridDays(focusDate);
      return {
        navLabel: viewLabel("month", focusDate, weekDays),
        body: html`
          <div className="calendar-month-grid">
            ${days.map((date) => {
              const inCurrentMonth = date.getMonth() === focusDate.getMonth();
              return html`
                <div className=${`calendar-month-cell ${inCurrentMonth ? "" : "out"}`} key=${localDateKey(date)}>
                  ${renderMonthCell(date)}
                </div>
              `;
            })}
          </div>
        `,
      };
    }

    return {
      navLabel: viewLabel("week", focusDate, weekDays),
      body: html`<div className="calendar-week-grid">${weekDays.map((date) => renderDayColumn(date))}</div>`,
    };
  }, [viewMode, focusDateKey, agendaItems, recurringItems, peopleMap, taskChoices]);

  return html`
    <section className="calendar-shell">
      <div className="sh calendar-toolbar">
        <div className="sl">
          <span className="st">Calendrier du foyer</span>
          <span className="mini">Choisis ta vue puis ajoute un bloc en quelques taps.</span>
        </div>
        <button className="aok calendar-add-btn" onClick=${() => openCreateModal()}>
          Ajouter au calendrier
        </button>
      </div>

      <div className="calendar-switch">
        ${[
          { id: "day", label: "Jour" },
          { id: "week", label: "Semaine" },
          { id: "month", label: "Mois" },
        ].map(
          (option) => html`
            <button
              key=${option.id}
              className=${`calendar-switch-btn ${viewMode === option.id ? "on" : ""}`}
              onClick=${() => setViewMode(option.id)}
            >
              ${option.label}
            </button>
          `,
        )}
      </div>

      <div className="calendar-nav-card">
        <button className="clrbtn" onClick=${() => moveRange(-1)}>←</button>
        <div className="calendar-nav-label">${visibleView.navLabel}</div>
        <button className="clrbtn" onClick=${() => moveRange(1)}>→</button>
      </div>

      ${visibleView.body}

      ${renderDetailPopup()}

      ${showModal
        ? html`
            <div className="modal-backdrop" onClick=${closeModal}>
              <div className="modal-card task-modal calendar-modal" onClick=${(event) => event.stopPropagation()}>
                <div className="task-modal-head">
                  <div>
                    <div className="miniTitle">Calendrier</div>
                    <div className="st">${editing ? "Modifier le bloc" : "Nouveau bloc calendrier"}</div>
                  </div>
                  <button className="delbtn" onClick=${closeModal}>×</button>
                </div>

                <form className="task-create-form calendar-form" onSubmit=${submit}>
                  <div className="calendar-choice-grid">
                    <button
                      type="button"
                      className=${`calendar-choice-card ${form.entryType === "task" ? "on" : ""}`}
                      onClick=${() => setEntryType("task")}
                    >
                      <span className="miniTitle">Type</span>
                      <strong>Tâche existante</strong>
                      <span className="mini">Le nom et l emoji sont repris automatiquement.</span>
                    </button>
                    <button
                      type="button"
                      className=${`calendar-choice-card ${form.entryType === "custom" ? "on" : ""}`}
                      onClick=${() => setEntryType("custom")}
                    >
                      <span className="miniTitle">Type</span>
                      <strong>Événement libre</strong>
                      <span className="mini">Pour un rendez-vous, une sortie ou une activité.</span>
                    </button>
                  </div>

                  ${form.entryType === "task"
                    ? html`
                        <div className="fstack">
                          <span className="miniTitle">Choisir une tâche</span>
                          <select className="asel" value=${form.taskId} onChange=${(event) => setForm({ ...form, taskId: event.target.value })}>
                            <option value="">Choisir une tâche du foyer</option>
                            ${taskChoices.map((task) => html`<option value=${task.id} key=${task.id}>${buildTaskLabel(task)}</option>`)}
                          </select>
                        </div>
                      `
                    : html`
                        <div className="fstack">
                          <span className="miniTitle">Nom de l événement</span>
                          <input
                            className="ainp"
                            placeholder="Piscine, bibliothèque, pédiatre..."
                            value=${form.title}
                            onInput=${(event) => setForm({ ...form, title: event.target.value })}
                          />
                        </div>
                        <div className="calendar-inline-row">
                          <div className="calendar-emoji-switch">
                            <button
                              type="button"
                              className=${`calendar-mini-pill ${form.useEmoji ? "on" : ""}`}
                              onClick=${() => setForm({ ...form, useEmoji: true })}
                            >
                              Avec emoji
                            </button>
                            <button
                              type="button"
                              className=${`calendar-mini-pill ${!form.useEmoji ? "on" : ""}`}
                              onClick=${() => setForm({ ...form, useEmoji: false, emoji: "" })}
                            >
                              Sans emoji
                            </button>
                          </div>
                          ${form.useEmoji
                            ? html`
                                <input
                                  className="ainp eminp"
                                  value=${form.emoji}
                                  onInput=${(event) => setForm({ ...form, emoji: event.target.value })}
                                />
                              `
                            : null}
                        </div>
                      `}

                  <div className="calendar-inline-row">
                    <div className="fstack">
                      <span className="miniTitle">Date</span>
                      <input className="ainp" type="date" value=${form.dateKey} onInput=${(event) => setForm({ ...form, dateKey: event.target.value })} />
                    </div>
                    <div className="fstack">
                      <span className="miniTitle">Heure de début</span>
                      <input
                        className="ainp"
                        type="time"
                        value=${form.start}
                        disabled=${form.allDay}
                        onInput=${(event) => setForm({ ...form, start: event.target.value })}
                      />
                    </div>
                  </div>

                  <div className="fstack">
                    <span className="miniTitle">Durée</span>
                    <div className="calendar-choice-row">
                      ${[
                        { id: "30", label: "30 min" },
                        { id: "60", label: "1 h" },
                        { id: "120", label: "2 h" },
                        { id: "all-day", label: "Toute la journée" },
                        { id: "custom", label: "Personnalisée" },
                      ].map(
                        (option) => html`
                          <button
                            key=${option.id}
                            type="button"
                            className=${`calendar-mini-pill ${form.durationPreset === option.id ? "on" : ""}`}
                            onClick=${() =>
                              setForm({
                                ...form,
                                durationPreset: option.id,
                                allDay: option.id === "all-day",
                              })}
                          >
                            ${option.label}
                          </button>
                        `,
                      )}
                    </div>
                    ${form.durationPreset === "custom" && !form.allDay
                      ? html`
                          <div className="calendar-inline-row">
                            <input
                              className="ainp"
                              type="number"
                              min="1"
                              value=${form.customDurationValue}
                              onInput=${(event) => setForm({ ...form, customDurationValue: event.target.value })}
                            />
                            <select
                              className="asel"
                              value=${form.customDurationUnit}
                              onChange=${(event) => setForm({ ...form, customDurationUnit: event.target.value })}
                            >
                              <option value="minutes">minutes</option>
                              <option value="hours">heures</option>
                            </select>
                          </div>
                        `
                      : null}
                  </div>

                  <div className="fstack">
                    <span className="miniTitle">Personnes concernées</span>
                    <div className="mini">Tu peux choisir une ou plusieurs personnes, ou utiliser Toute la famille.</div>
                    <div className="calendar-choice-row">
                      <button
                        type="button"
                        className=${`calendar-mini-pill ${form.wholeFamily ? "on" : ""}`}
                        onClick=${() => setForm({ ...form, wholeFamily: !form.wholeFamily, personIds: [] })}
                      >
                        Toute la famille
                      </button>
                      ${(adultPeople.length ? adultPeople : activePeople).map(
                        (person) => html`
                          <button
                            key=${person.id}
                            type="button"
                            className=${`pc ${form.personIds.includes(person.id) && !form.wholeFamily ? "on" : ""}`}
                            onClick=${() => toggleMainPerson(person.id)}
                          >
                            ${person.displayName || person.label}
                          </button>
                        `,
                      )}
                    </div>
                    ${form.wholeFamily
                      ? html`<div className="mini">Sélection actuelle : Toute la famille</div>`
                      : form.personIds.length
                        ? html`<div className="mini">Sélection actuelle : ${selectedNames(form.personIds, peopleMap).join(", ")}</div>`
                        : html`<div className="mini">Sélection actuelle : aucune personne précise</div>`}
                  </div>

                  ${childPeople.length
                    ? html`
                        <div className="fstack">
                          <span className="miniTitle">Enfants et animaux concernés</span>
                          <div className="mini">Champ optionnel : aucun, un ou plusieurs profils contextuels du foyer.</div>
                          <div className="calendar-choice-row">
                            ${childPeople.map(
                              (child) => html`
                                <button
                                  key=${child.id}
                                  type="button"
                                  className=${`pc ${form.childIds.includes(child.id) ? "on" : ""}`}
                                  onClick=${() => toggleChild(child.id)}
                                >
                                  ${child.displayName || child.label}
                                </button>
                              `,
                            )}
                          </div>
                          ${form.childIds.length
                            ? html`<div className="mini">Profils choisis : ${selectedNames(form.childIds, peopleMap).join(", ")}</div>`
                            : html`<div className="mini">Profils choisis : aucun</div>`}
                        </div>
                      `
                    : null}

                  <label className="help">
                    <input
                      type="checkbox"
                      checked=${form.repeatWeekly}
                      disabled=${editing?.entryKind === "recurring"}
                      onChange=${(event) => setForm({ ...form, repeatWeekly: event.target.checked })}
                    />
                    Répéter chaque semaine
                  </label>
                  ${editing?.entryKind === "recurring" ? html`<div className="mini">Ce bloc est déjà réglé pour revenir chaque semaine.</div>` : null}

                  <div className="calendar-form-actions">
                    <button type="button" className="clrbtn" onClick=${closeModal}>Annuler</button>
                    <button className="aok" type="submit">${editing ? "Enregistrer" : "Ajouter au calendrier"}</button>
                  </div>
                </form>
              </div>
            </div>
          `
        : null}
    </section>
  `;
}

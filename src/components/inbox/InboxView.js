import { html, useState } from "../../lib.js";
import { localDateKey, getCurrentAppDate, addMinutesToTime } from "../../utils/date.js";
import { EmojiPicker } from "../tasks/EmojiPicker.js";

/* ─── CONSTANTS ──────────────────────────────────────────── */
const HINTS = [
  { id: "task",  label: "Tâche",      emoji: "✅" },
  { id: "event", label: "Événement",  emoji: "📅" },
  { id: "note",  label: "Note",       emoji: "📝" },
];

/* ─── HELPERS ────────────────────────────────────────────── */
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

/* ─── DEFAULT FORMS ──────────────────────────────────────── */
function defaultTaskForm(text) {
  return {
    text: text || "",
    icon: "",
    displayPeriod: "daily",
    taskKind: "single",
    priority: "normal",
    dueDate: "",
    dueTime: "",
    taskReminder: "none",
    taskReminderCustomMinutes: 15,
    assignedPersonIds: [],
    assignedWholeFamily: false,
    concernedPersonIds: [],
    addToCalendar: false,
    calendarDateKey: localDateKey(getCurrentAppDate()),
    calendarStart: "09:00",
    calendarAllDay: false,
    calendarDurationPreset: "none",
    calendarCustomDurationValue: 1,
    calendarCustomDurationUnit: "hours",
    recurrenceFrequency: "daily",
    recurrenceDaysOfWeek: [],
  };
}

function defaultAgendaForm(text) {
  const start = "09:00";
  return {
    text: text || "",
    icon: "🗓️",
    dateKey: localDateKey(getCurrentAppDate()),
    start,
    endTime: addMinutesToTime(start, 60),
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

function defaultNoteForm(text) {
  return {
    text: text || "",
    visibility: "household",
    sharedWith: [],
  };
}

/* ─── HINT BADGE ─────────────────────────────────────────── */
function HintBadge({ hint }) {
  if (!hint) return null;
  const h = HINTS.find((item) => item.id === hint);
  if (!h) return null;
  return html`<span className=${`ibx-hint-badge ibx-hint-badge--${hint}`}>${h.emoji} ${h.label}</span>`;
}

/* ─── MAIN COMPONENT ─────────────────────────────────────── */
export function InboxView({
  inbox,
  activePersonId,
  people,
  childProfiles,
  onAddInboxItem,
  onDeleteInboxItem,
  onDispatchToTask,
  onDispatchToAgenda,
  onDispatchToNote,
}) {
  const [inputText, setInputText]     = useState("");
  const [selectedHint, setSelectedHint] = useState(null);

  /* ── Modal state ── */
  const [dispatchItem, setDispatchItem] = useState(null);
  const [dispatchMode, setDispatchMode] = useState(null); // "task" | "agenda" | "note"

  /* ── Task form ── */
  const [taskForm, setTaskForm]           = useState(() => defaultTaskForm(""));
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  /* ── Agenda form ── */
  const [agendaForm, setAgendaForm]       = useState(() => defaultAgendaForm(""));
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [showConcernedPicker, setShowConcernedPicker] = useState(false);

  /* ── Note form ── */
  const [noteForm, setNoteForm]           = useState(() => defaultNoteForm(""));

  const safeInbox    = Array.isArray(inbox) ? inbox : [];
  const safePeople   = Array.isArray(people) ? people.filter((p) => p.active !== false) : [];
  const safeChildren = Array.isArray(childProfiles) ? childProfiles : [];
  const adultPeople  = safePeople.filter((p) => p.profileMode !== "context" && p.type !== "animal");
  const visiblePeople = adultPeople.length ? adultPeople : safePeople;
  const shareableMembers = safePeople.filter(
    (p) => p.id !== activePersonId && (p.label || p.displayName)?.trim() && p.type !== "animal" && p.type !== "child",
  );

  /* ── Add ── */
  function handleAdd() {
    const text = inputText.trim();
    if (!text) return;
    onAddInboxItem(text, selectedHint);
    setInputText("");
    setSelectedHint(null);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd();
  }

  /* ── Open modals ── */
  function openTaskDispatch(item) {
    setDispatchItem(item);
    setTaskForm(defaultTaskForm(item.text));
    setShowEmojiPicker(false);
    setDispatchMode("task");
  }

  function openAgendaDispatch(item) {
    setDispatchItem(item);
    setAgendaForm(defaultAgendaForm(item.text));
    setShowDurationPicker(false);
    setShowConcernedPicker(false);
    setShowEmojiPicker(false);
    setDispatchMode("agenda");
  }

  function openNoteDispatch(item) {
    setDispatchItem(item);
    setNoteForm(defaultNoteForm(item.text));
    setDispatchMode("note");
  }

  function closeModal() {
    setDispatchItem(null);
    setDispatchMode(null);
    setShowEmojiPicker(false);
    setShowDurationPicker(false);
    setShowConcernedPicker(false);
  }

  /* ── Submit task ── */
  function submitTask(e) {
    e.preventDefault();
    if (!taskForm.text.trim()) return;
    const isDeadline = taskForm.priority === "deadline" || taskForm.displayPeriod === "deadline";
    if (isDeadline && !taskForm.dueDate) return;
    if (taskForm.taskKind === "recurring" && taskForm.dueDate) return;
    const recurrenceFrequency = taskForm.displayPeriod === "daily" ? "daily"
      : taskForm.displayPeriod === "weekly" ? "weekly"
      : taskForm.displayPeriod === "monthly" ? "monthly"
      : taskForm.recurrenceFrequency || "daily";
    onDispatchToTask(dispatchItem, {
      ...taskForm,
      recurrenceFrequency,
      assignedWholeFamily: taskForm.assignedPersonIds.length === 0,
      taskReminder: taskForm.taskReminder || "none",
    });
    closeModal();
  }

  /* ── Submit agenda ── */
  function submitAgenda(e) {
    e.preventDefault();
    if (!agendaForm.text.trim() || !agendaForm.dateKey) return;
    const duration = agendaForm.allDay ? 1440
      : agendaForm.endTime ? endToDuration(agendaForm.start, agendaForm.endTime)
      : agendaForm.durationPreset === "custom"
        ? Math.max(15, agendaForm.customDurationUnit === "hours" ? agendaForm.customDurationValue * 60 : agendaForm.customDurationValue)
        : Number(agendaForm.durationPreset) || 60;
    const safePersonIds = agendaForm.wholeFamily ? [] : agendaForm.personIds.filter(Boolean);
    onDispatchToAgenda(dispatchItem, {
      text: agendaForm.text.trim(),
      icon: agendaForm.icon || "",
      dateKey: agendaForm.dateKey,
      start: agendaForm.allDay ? "00:00" : agendaForm.start,
      duration,
      allDay: agendaForm.allDay,
      personIds: safePersonIds,
      personId: safePersonIds[0] || "",
      wholeFamily: Boolean(agendaForm.wholeFamily),
      childIds: agendaForm.childIds.filter(Boolean),
      sourceType: "custom",
      mode: "custom",
      repeatWeekly: agendaForm.repeatWeekly,
      notification: { enabled: false, minutesBefore: 30, customMessage: "", sentKeys: [] },
    });
    closeModal();
  }

  /* ── Submit note ── */
  function submitNote(e) {
    e.preventDefault();
    if (!noteForm.text.trim()) return;
    const finalVisibility = noteForm.visibility === "private" && noteForm.sharedWith.length > 0
      ? "shared"
      : noteForm.visibility;
    onDispatchToNote(dispatchItem, {
      text: noteForm.text.trim(),
      visibility: finalVisibility,
      sharedWith: noteForm.sharedWith,
    });
    closeModal();
  }

  /* ── Task form helpers ── */
  function updateTaskForm(key, value) {
    setTaskForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTaskAssignedPerson(personId) {
    setTaskForm((prev) => ({
      ...prev,
      assignedPersonIds: prev.assignedPersonIds.includes(personId)
        ? prev.assignedPersonIds.filter((id) => id !== personId)
        : [...prev.assignedPersonIds, personId],
    }));
  }

  /* ── Agenda form helpers ── */
  function updateAgendaForm(key, value) {
    setAgendaForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleAgendaPerson(personId) {
    setAgendaForm((prev) => ({
      ...prev,
      wholeFamily: false,
      personIds: prev.personIds.includes(personId)
        ? prev.personIds.filter((id) => id !== personId)
        : [...prev.personIds, personId],
    }));
  }

  function toggleAgendaChild(childId) {
    setAgendaForm((prev) => ({
      ...prev,
      childIds: prev.childIds.includes(childId)
        ? prev.childIds.filter((id) => id !== childId)
        : [...prev.childIds, childId],
    }));
  }

  /* ── Note form helpers ── */
  function toggleNoteSharedWith(personId) {
    setNoteForm((prev) => ({
      ...prev,
      sharedWith: prev.sharedWith.includes(personId)
        ? prev.sharedWith.filter((id) => id !== personId)
        : [...prev.sharedWith, personId],
    }));
  }

  /* ── Task dispatch modal ── */
  function renderTaskModal() {
    const PILL_STACK = {
      flex: 1, padding: "10px 6px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
      transition: "all 0.15s", cursor: "pointer", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 3, minWidth: 0, textAlign: "center",
    };
    const isDeadline = taskForm.priority === "deadline" || taskForm.displayPeriod === "deadline";
    const hasInvalidDueRepeat = taskForm.taskKind === "recurring" && Boolean(taskForm.dueDate);
    const formValid = Boolean(taskForm.text.trim()) && (!isDeadline || Boolean(taskForm.dueDate)) && !hasInvalidDueRepeat;

    return html`
      <div className="modal-backdrop task-create-backdrop" onClick=${closeModal}>
        <div className="modal-card task-modal-redesign" onClick=${(e) => e.stopPropagation()}>

          <div className="mrd-mhd">
            <span className="mrd-mtitle">Créer une tâche</span>
            <button type="button" onClick=${closeModal} className="mrd-mclose">✕</button>
          </div>

          <form onSubmit=${submitTask} className="mrd-mbody">

            <!-- 1. Emoji + Nom -->
            <div style=${{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <button type="button"
                onClick=${() => setShowEmojiPicker(true)}
                title="Choisir un emoji"
                style=${{ width: 50, height: 50, borderRadius: 14, background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-border)", fontSize: 24, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
              >${taskForm.icon ? html`<span>${taskForm.icon}</span>` : html`<span style=${{ fontSize: 18, color: "var(--mrd-fg3)" }}>😊</span>`}</button>
              <div style=${{ flex: 1, background: "var(--mrd-surf2)", borderRadius: 14, border: "1.5px solid " + (taskForm.text ? "var(--mrd-a)" : "var(--mrd-border)"), padding: "12px 14px", transition: "border-color 0.15s" }}>
                <input
                  value=${taskForm.text}
                  onInput=${(e) => updateTaskForm("text", e.target.value)}
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
                  { id: "daily",   label: "Aujourd'hui", icon: "☀️" },
                  { id: "weekly",  label: "Semaine",     icon: "📅" },
                  { id: "monthly", label: "Mois",        icon: "🗓️" },
                ].map((t) => {
                  const on = !isDeadline && taskForm.displayPeriod === t.id;
                  return html`
                    <button key=${t.id} type="button"
                      style=${{ ...PILL_STACK, background: on ? "var(--mrd-a)" : "var(--mrd-surf2)", color: on ? "#fff" : "var(--mrd-fg2)", border: "1.5px solid " + (on ? "var(--mrd-a)" : "var(--mrd-border)") }}
                      onClick=${() => { updateTaskForm("displayPeriod", t.id); if (taskForm.priority === "deadline") updateTaskForm("priority", "normal"); }}>
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
                      onClick=${() => { updateTaskForm("displayPeriod", "deadline"); updateTaskForm("priority", "deadline"); }}>
                      <span style=${{ fontSize: 18, lineHeight: 1 }}>⏰</span>
                      <span>Avant...</span>
                    </button>
                  `;
                })()}
              </div>
              ${isDeadline ? html`
                <div style=${{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input type="date" value=${taskForm.dueDate || ""}
                    onInput=${(e) => updateTaskForm("dueDate", e.target.value)}
                    style=${{ flex: 1, background: "var(--mrd-surf2)", border: "1px solid var(--mrd-border)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "var(--mrd-fg)", outline: "none" }}
                  />
                  <input type="time" value=${taskForm.dueTime || ""}
                    onInput=${(e) => updateTaskForm("dueTime", e.target.value)}
                    style=${{ flex: 1, background: "var(--mrd-surf2)", border: "1px solid var(--mrd-border)", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "var(--mrd-fg)", outline: "none" }}
                  />
                </div>
              ` : null}
            </div>

            <!-- 3. Type (masqué si deadline) -->
            ${!isDeadline ? html`
              <div>
                <span className="mrd-mlbl">Type</span>
                <div style=${{ display: "flex", gap: 6 }}>
                  ${[
                    { id: "single",    label: "Unique",     icon: "✨" },
                    { id: "recurring", label: "Récurrente", icon: "🔁" },
                  ].map((k) => {
                    const on = taskForm.taskKind === k.id;
                    return html`
                      <button key=${k.id} type="button"
                        style=${{ ...PILL_STACK, background: on ? "var(--mrd-a)" : "var(--mrd-surf2)", color: on ? "#fff" : "var(--mrd-fg2)", border: "1.5px solid " + (on ? "var(--mrd-a)" : "var(--mrd-border)") }}
                        onClick=${() => updateTaskForm("taskKind", k.id)}>
                        <span style=${{ fontSize: 18, lineHeight: 1 }}>${k.icon}</span>
                        <span>${k.label}</span>
                      </button>
                    `;
                  })}
                </div>
              </div>
            ` : null}

            <!-- 4. Urgent (masqué si deadline) -->
            ${!isDeadline ? html`
              <div>
                <button type="button"
                  onClick=${() => updateTaskForm("priority", taskForm.priority === "urgent" ? "normal" : "urgent")}
                  title=${taskForm.priority === "urgent" ? "Urgente — cliquer pour retirer" : "Marquer comme urgente"}
                  style=${{ width: 44, height: 44, borderRadius: 12, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all 0.15s", background: taskForm.priority === "urgent" ? "var(--mrd-dangerLt)" : "var(--mrd-surf2)", border: "1.5px solid " + (taskForm.priority === "urgent" ? "var(--mrd-dangerMd)" : "var(--mrd-border)"), boxShadow: taskForm.priority === "urgent" ? "0 0 0 3px oklch(90% 0.07 15 / 0.25)" : "none" }}
                >🚨</button>
              </div>
            ` : null}

            <!-- 5. Attribué à -->
            ${safePeople.length ? html`
              <div>
                <span className="mrd-mlbl">Attribué à</span>
                <div style=${{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  ${safePeople.map((person) => {
                    const on = taskForm.assignedPersonIds.includes(person.id);
                    return html`
                      <button key=${person.id} type="button"
                        onClick=${() => toggleTaskAssignedPerson(person.id)}
                        title=${person.label || person.displayName}
                        style=${{ width: 40, height: 40, borderRadius: "50%", padding: 0, border: "2.5px solid " + (on ? (person.color || "var(--mrd-a)") : "var(--mrd-border)"), background: "transparent", cursor: "pointer", flexShrink: 0, transition: "all 0.15s", boxShadow: on ? "0 0 0 2px " + (person.color || "var(--mrd-a)") + "33" : "none" }}>
                        <div style=${{ width: 35, height: 35, borderRadius: "50%", background: person.color || "var(--mrd-fg2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--mrd-white)", fontSize: 13, fontWeight: 700, margin: "auto" }}>
                          ${person.shortId || String(person.label || person.displayName || "?")[0].toUpperCase()}
                        </div>
                      </button>
                    `;
                  })}
                </div>
              </div>
            ` : null}

            <!-- 6. Submit -->
            <button type="submit"
              disabled=${!formValid}
              style=${{ width: "100%", padding: 14, borderRadius: "var(--mrd-r)", background: formValid ? "var(--mrd-a)" : "var(--mrd-disabledBg)", color: formValid ? "var(--mrd-white)" : "var(--mrd-disabledFg)", fontSize: 15, fontWeight: 700, cursor: formValid ? "pointer" : "default", boxShadow: formValid ? "0 6px 20px oklch(58% 0.13 28 / 0.28)" : "none", transition: "all 0.2s", border: "none" }}
            >Créer la tâche →</button>

          </form>
        </div>
      </div>
      ${showEmojiPicker ? html`<${EmojiPicker}
        onSelect=${(emoji) => { updateTaskForm("icon", emoji); setShowEmojiPicker(false); }}
        onClose=${() => setShowEmojiPicker(false)}
      />` : null}
    `;
  }

  /* ── Agenda dispatch modal ── */
  function renderAgendaModal() {
    const formValid = Boolean(agendaForm.text.trim()) && Boolean(agendaForm.dateKey);

    return html`
      <div className="modal-backdrop task-create-backdrop" onClick=${closeModal}>
        <div className="modal-card task-modal-redesign" onClick=${(e) => e.stopPropagation()}
          style=${{ width: "min(560px, 100%)" }}>

          <div className="mrd-mhd">
            <span className="mrd-mtitle">Ajouter au calendrier</span>
            <button type="button" onClick=${closeModal} className="mrd-mclose">✕</button>
          </div>

          <form onSubmit=${submitAgenda} className="mrd-mbody" style=${{ paddingBottom: "calc(28px + env(safe-area-inset-bottom,0px))" }}>

            <!-- 1. Événement -->
            <div>
              <span className="mrd-mlbl">Événement</span>
              <div style=${{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <button type="button"
                  onClick=${() => setShowEmojiPicker(true)}
                  title="Choisir un emoji"
                  style=${{ width: 50, height: 50, minWidth: 50, flexShrink: 0, borderRadius: 14, background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-border)", fontSize: 26, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                  ${agendaForm.icon || html`<span style=${{ fontSize: 20, color: "var(--mrd-fg3)" }}>😊</span>`}
                </button>
                <div style=${{ flex: 1, background: "var(--mrd-surf2)", borderRadius: 14, border: "1.5px solid " + (agendaForm.text ? "var(--mrd-a)" : "var(--mrd-border)"), padding: "12px 14px", transition: "border-color 0.15s" }}>
                  <input
                    value=${agendaForm.text}
                    onInput=${(e) => updateAgendaForm("text", e.target.value)}
                    placeholder="Piscine, pédiatre, sortie…"
                    autoFocus
                    style=${{ width: "100%", background: "none", border: "none", fontSize: 15, fontWeight: 500, color: "var(--mrd-fg)", outline: "none", padding: 0, fontFamily: "inherit" }}
                  />
                </div>
              </div>
            </div>

            <!-- 2. Date et heure -->
            <div>
              <span className="mrd-mlbl">Date et heure</span>
              <div style=${{ display: "flex", gap: 8 }}>
                <div style=${{ flex: 1.4, position: "relative" }}>
                  <span style=${{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none" }}>📅</span>
                  <input type="date" value=${agendaForm.dateKey}
                    onInput=${(e) => updateAgendaForm("dateKey", e.target.value)}
                    style=${{ width: "100%", paddingLeft: 36, paddingRight: 8, paddingTop: 12, paddingBottom: 12, background: "var(--mrd-surf2)", border: "1px solid var(--mrd-border)", borderRadius: 14, fontSize: 13, color: "var(--mrd-fg)", outline: "none", appearance: "none", fontFamily: "inherit" }}
                  />
                </div>
                <div style=${{ flex: 1, position: "relative" }}>
                  <span style=${{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, pointerEvents: "none" }}>🕐</span>
                  <input type="time" value=${agendaForm.start}
                    disabled=${agendaForm.allDay}
                    onInput=${(e) => {
                      const newStart = e.target.value;
                      const dur = agendaForm.endTime ? endToDuration(agendaForm.start, agendaForm.endTime) : 60;
                      setAgendaForm((prev) => ({ ...prev, start: newStart, endTime: addMinutesToTime(newStart, dur) }));
                    }}
                    style=${{ width: "100%", paddingLeft: 36, paddingRight: 8, paddingTop: 12, paddingBottom: 12, background: "var(--mrd-surf2)", border: "1px solid var(--mrd-border)", borderRadius: 14, fontSize: 13, color: agendaForm.allDay ? "var(--mrd-fg3)" : "var(--mrd-fg)", outline: "none", appearance: "none", fontFamily: "inherit" }}
                  />
                </div>
              </div>

              <!-- Durée -->
              <div style=${{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                ${showDurationPicker && !agendaForm.allDay ? html`
                  <div style=${{ display: "flex", gap: 6, alignItems: "center", flex: 1 }}>
                    <input type="number" min="1"
                      value=${agendaForm.customDurationValue}
                      onInput=${(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        const mins = agendaForm.customDurationUnit === "hours" ? val * 60 : val;
                        setAgendaForm((prev) => ({ ...prev, durationPreset: "custom", customDurationValue: val, endTime: addMinutesToTime(prev.start, mins) }));
                      }}
                      style=${{ width: 70, padding: "10px", background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-a)", borderRadius: 12, fontSize: 15, fontWeight: 600, color: "var(--mrd-fg)", outline: "none", textAlign: "center", fontFamily: "inherit" }}
                    />
                    <select value=${agendaForm.customDurationUnit}
                      onChange=${(e) => {
                        const unit = e.target.value;
                        const mins = unit === "hours" ? agendaForm.customDurationValue * 60 : agendaForm.customDurationValue;
                        setAgendaForm((prev) => ({ ...prev, durationPreset: "custom", customDurationUnit: unit, endTime: addMinutesToTime(prev.start, mins) }));
                      }}
                      style=${{ flex: 1, padding: "10px", background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-border)", borderRadius: 12, fontSize: 14, fontWeight: 500, color: "var(--mrd-fg)", outline: "none", appearance: "none", WebkitAppearance: "none", fontFamily: "inherit", cursor: "pointer" }}>
                      <option value="minutes">minutes</option>
                      <option value="hours">heures</option>
                    </select>
                  </div>
                ` : null}
                <button type="button"
                  style=${{ padding: "10px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: (showDurationPicker && !agendaForm.allDay) ? "var(--mrd-aLt)" : "var(--mrd-surf2)", color: (showDurationPicker && !agendaForm.allDay) ? "var(--mrd-a)" : "var(--mrd-fg3)", border: "1.5px solid " + ((showDurationPicker && !agendaForm.allDay) ? "var(--mrd-aMd)" : "var(--mrd-border)"), whiteSpace: "nowrap" }}
                  onClick=${() => { setShowDurationPicker(!showDurationPicker); if (agendaForm.allDay) updateAgendaForm("allDay", false); }}>
                  ${showDurationPicker && !agendaForm.allDay ? "⏱ Durée activée" : "+ Ajouter une durée"}
                </button>
                <button type="button"
                  style=${{ padding: "10px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: agendaForm.allDay ? "var(--mrd-a)" : "var(--mrd-surf2)", color: agendaForm.allDay ? "#fff" : "var(--mrd-fg3)", border: "1.5px solid " + (agendaForm.allDay ? "var(--mrd-a)" : "var(--mrd-border)"), whiteSpace: "nowrap" }}
                  onClick=${() => { setShowDurationPicker(false); setAgendaForm((prev) => ({ ...prev, allDay: !prev.allDay, durationPreset: !prev.allDay ? "all-day" : "60", endTime: !prev.allDay ? "" : addMinutesToTime(prev.start, 60) })); }}>
                  Toute la journée
                </button>
              </div>
            </div>

            <!-- 3. Attribué à -->
            ${visiblePeople.length ? html`
              <div>
                <span className="mrd-mlbl">Attribué à</span>
                <div style=${{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button"
                    onClick=${() => setAgendaForm((prev) => ({ ...prev, wholeFamily: !prev.wholeFamily, personIds: [] }))}
                    title="Toute la famille"
                    style=${{ width: 40, height: 40, borderRadius: "50%", border: "2px solid " + (agendaForm.wholeFamily ? "var(--mrd-a)" : "var(--mrd-border)"), background: agendaForm.wholeFamily ? "var(--mrd-aLt)" : "var(--mrd-surf2)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}>
                    👥
                  </button>
                  ${visiblePeople.map((person) => {
                    const on = agendaForm.personIds.includes(person.id) && !agendaForm.wholeFamily;
                    return html`
                      <button key=${person.id} type="button"
                        onClick=${() => toggleAgendaPerson(person.id)}
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
            ` : null}

            <!-- 4. Personne concernée -->
            ${safeChildren.length ? html`
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
                        ${safeChildren.map((child) => {
                          const on = agendaForm.childIds.includes(child.id);
                          return html`
                            <button key=${child.id} type="button"
                              onClick=${() => toggleAgendaChild(child.id)}
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

            <!-- 5. Répéter -->
            <label style=${{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", background: "var(--mrd-surf2)", border: "1px solid var(--mrd-borderSoft)", borderRadius: 14, cursor: "pointer" }}>
              <span style=${{ fontSize: 18, flexShrink: 0 }}>↻</span>
              <span style=${{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--mrd-fg)" }}>Répéter chaque semaine</span>
              <span style=${{ position: "relative", width: 44, height: 24, display: "inline-block", flexShrink: 0 }}>
                <input type="checkbox"
                  checked=${agendaForm.repeatWeekly}
                  onChange=${(e) => updateAgendaForm("repeatWeekly", e.target.checked)}
                  style=${{ position: "absolute", opacity: 0, width: 0, height: 0 }} />
                <span style=${{ position: "absolute", inset: 0, borderRadius: 99, background: agendaForm.repeatWeekly ? "var(--mrd-a)" : "var(--mrd-switchOff)", transition: "background 0.2s" }}></span>
                <span style=${{ position: "absolute", top: 3, left: agendaForm.repeatWeekly ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "var(--mrd-white)", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.18)" }}></span>
              </span>
            </label>

            <!-- 6. Actions -->
            <div style=${{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button type="button" onClick=${closeModal}
                style=${{ flex: "0 0 auto", padding: "13px 20px", borderRadius: "var(--mrd-r)", background: "var(--mrd-surf2)", color: "var(--mrd-fg2)", fontSize: 14, fontWeight: 600, cursor: "pointer", border: "1px solid var(--mrd-border)", transition: "all 0.15s", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button type="submit"
                disabled=${!formValid}
                style=${{ flex: 1, padding: "13px 0", borderRadius: "var(--mrd-r)", background: formValid ? "var(--mrd-a)" : "var(--mrd-disabledBg)", color: formValid ? "#fff" : "var(--mrd-disabledFg)", fontSize: 15, fontWeight: 700, cursor: formValid ? "pointer" : "default", border: "none", boxShadow: formValid ? "0 6px 20px oklch(58% 0.13 28 / 0.28)" : "none", transition: "all 0.2s", fontFamily: "inherit" }}>
                Ajouter au calendrier →
              </button>
            </div>

          </form>
        </div>
      </div>
      ${showEmojiPicker ? html`<${EmojiPicker}
        onSelect=${(emoji) => { updateAgendaForm("icon", emoji); setShowEmojiPicker(false); }}
        onClose=${() => setShowEmojiPicker(false)}
      />` : null}
    `;
  }

  /* ── Note dispatch modal ── */
  function renderNoteModal() {
    const formValid = Boolean(noteForm.text.trim());

    return html`
      <div className="modal-backdrop task-create-backdrop" onClick=${closeModal}>
        <div className="modal-card task-modal-redesign" onClick=${(e) => e.stopPropagation()}>

          <div className="mrd-mhd">
            <span className="mrd-mtitle">Créer une note</span>
            <button type="button" onClick=${closeModal} className="mrd-mclose">✕</button>
          </div>

          <form onSubmit=${submitNote} className="mrd-mbody">

            <!-- 1. Texte -->
            <div>
              <span className="mrd-mlbl">Contenu</span>
              <textarea
                value=${noteForm.text}
                onInput=${(e) => setNoteForm((prev) => ({ ...prev, text: e.currentTarget.value }))}
                placeholder="Écris ta note ici…"
                rows="5"
                autoFocus
                style=${{ width: "100%", background: "var(--mrd-surf2)", border: "1.5px solid var(--mrd-border)", borderRadius: 14, padding: "12px 14px", fontSize: 14, color: "var(--mrd-fg)", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
              ></textarea>
            </div>

            <!-- 2. Visibilité -->
            <div>
              <span className="mrd-mlbl">Visibilité</span>
              <div className="segmented">
                <button type="button"
                  className=${`seg-btn ${noteForm.visibility === "household" ? "on" : ""}`}
                  onClick=${() => setNoteForm((prev) => ({ ...prev, visibility: "household", sharedWith: [] }))}>
                  🏠 Foyer
                </button>
                <button type="button"
                  className=${`seg-btn ${noteForm.visibility === "private" ? "on" : ""}`}
                  onClick=${() => setNoteForm((prev) => ({ ...prev, visibility: "private" }))}>
                  🔒 Privée
                </button>
              </div>
              ${noteForm.visibility === "private" ? html`
                <div style=${{ marginTop: 8 }}>
                  <div className="mini" style=${{ marginBottom: 6 }}>
                    ${noteForm.sharedWith.length ? "Visible seulement avec :" : "Visible seulement par toi, ou partager avec :"}
                  </div>
                  <div style=${{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    ${shareableMembers.map((person) => html`
                      <button key=${person.id} type="button"
                        className=${`task-choice ${noteForm.sharedWith.includes(person.id) ? "on" : ""}`}
                        onClick=${() => toggleNoteSharedWith(person.id)}>
                        ${person.label || person.displayName}
                      </button>
                    `)}
                  </div>
                </div>
              ` : null}
            </div>

            <!-- 3. Actions -->
            <div style=${{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button type="button" onClick=${closeModal}
                style=${{ flex: "0 0 auto", padding: "13px 20px", borderRadius: "var(--mrd-r)", background: "var(--mrd-surf2)", color: "var(--mrd-fg2)", fontSize: 14, fontWeight: 600, cursor: "pointer", border: "1px solid var(--mrd-border)", transition: "all 0.15s", fontFamily: "inherit" }}>
                Annuler
              </button>
              <button type="submit"
                disabled=${!formValid}
                style=${{ flex: 1, padding: "13px 0", borderRadius: "var(--mrd-r)", background: formValid ? "var(--mrd-a)" : "var(--mrd-disabledBg)", color: formValid ? "#fff" : "var(--mrd-disabledFg)", fontSize: 15, fontWeight: 700, cursor: formValid ? "pointer" : "default", border: "none", boxShadow: formValid ? "0 6px 20px oklch(58% 0.13 28 / 0.28)" : "none", transition: "all 0.2s", fontFamily: "inherit" }}>
                Enregistrer la note →
              </button>
            </div>

          </form>
        </div>
      </div>
    `;
  }

  /* ── Render ── */
  return html`
    <div className="ibx-view">

      ${/* ── Ajout rapide ── */null}
      <div className="ibx-add-card">
        <textarea
          className="ibx-textarea"
          placeholder="Une idée, quelque chose à faire, un rappel… capture tout en vrac !"
          value=${inputText}
          onInput=${(e) => setInputText(e.currentTarget.value)}
          onKeyDown=${handleKeyDown}
          rows="3"
          aria-label="Saisir un item d'inbox"
        />

        <div className="ibx-hint-row">
          ${HINTS.map((h) => html`
            <button
              key=${h.id}
              type="button"
              className=${`ibx-hint-chip${selectedHint === h.id ? " active" : ""}`}
              onClick=${() => setSelectedHint(selectedHint === h.id ? null : h.id)}
              aria-pressed=${selectedHint === h.id ? "true" : "false"}
            >${h.emoji} ${h.label}</button>
          `)}
        </div>

        <div className="ibx-add-row">
          <button
            type="button"
            className="ibx-add-btn"
            onClick=${handleAdd}
            disabled=${!inputText.trim()}
          >+ Capturer</button>
        </div>
      </div>

      ${/* ── Liste vide ── */null}
      ${safeInbox.length === 0 ? html`
        <div className="ibx-empty">
          <div className="ibx-empty-icon">📥</div>
          <div className="ibx-empty-title">Rien à trier pour l'instant</div>
          <div className="ibx-empty-sub">
            Toutes tes idées et choses à faire<br/>
            sont capturées ici. Trie-les vers les tâches,<br/>
            l'agenda ou les notes quand tu es prêt.
          </div>
        </div>
      ` : null}

      ${/* ── Items ── */null}
      ${safeInbox.length > 0 ? html`
        <div className="ibx-list">
          ${safeInbox.map((item) => html`
            <div key=${item.id} className="ibx-item">

              <div className="ibx-item-body">
                <div className="ibx-item-text">${item.text}</div>
                ${item.hint ? html`<${HintBadge} hint=${item.hint} />` : null}
              </div>

              <div className="ibx-item-actions">
                <button
                  type="button"
                  className="ibx-dbtn"
                  onClick=${() => openTaskDispatch(item)}
                >✅ Tâche</button>
                <button
                  type="button"
                  className="ibx-dbtn"
                  onClick=${() => openAgendaDispatch(item)}
                >📅 Agenda</button>
                <button
                  type="button"
                  className="ibx-dbtn ibx-dbtn--note"
                  onClick=${() => openNoteDispatch(item)}
                >📝 Note</button>
                <button
                  type="button"
                  className="ibx-del-btn"
                  onClick=${() => onDeleteInboxItem(item.id)}
                  aria-label="Supprimer cet item"
                  title="Supprimer"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>

            </div>
          `)}
        </div>
      ` : null}

      ${/* ── Dispatch modals ── */null}
      ${dispatchMode === "task"   && dispatchItem ? renderTaskModal()   : null}
      ${dispatchMode === "agenda" && dispatchItem ? renderAgendaModal() : null}
      ${dispatchMode === "note"   && dispatchItem ? renderNoteModal()   : null}

    </div>
  `;
}

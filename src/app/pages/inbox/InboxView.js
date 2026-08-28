import { DEFAULT_MEMBER_COLOR } from "../../config/constants.js";
import { html, useEffect, useRef, useState } from "../../lib.js";
import { localDateKey, getCurrentAppDate, addMinutesToTime } from "../../utils/date.js";
import { EmojiPicker } from "../tasks/EmojiPicker.js";
import { MrdModal } from "../../components/MrdModal.js";

/* ─── CONSTANTS ──────────────────────────────────────────── */
/* Les trois destinations, proposées sous chaque item. Celle que le texte
   laisse deviner (`item.hint`) est surlignée, mais les trois restent à un
   tap : plus de pastille indicative séparée des boutons (handoff 9a). */
const DESTINATIONS = [
  { id: "task",  emoji: "✅", label: "Tâche" },
  { id: "event", emoji: "📅", label: "Agenda" },
  { id: "note",  emoji: "📝", label: "Note" },
];

/* Trois paliers d'âge, du plus vieux au plus récent : ce qui traîne remonte
   en tête de liste au lieu de se perdre au fond. Le groupe des retards porte
   l'âge de son plus vieil item — « Depuis 3 jours » dit mieux ce qui attend
   qu'un intitulé fixe. */
const AGE_BUCKETS = [
  { id: "stale",     label: "", min: 2 },
  { id: "yesterday", label: "Hier", min: 1 },
  { id: "today",     label: "Aujourd'hui", min: 0 },
];

/* Combien de jours pleins depuis la capture. `createdAt` s'écrit
   « AAAA-MM-JJ HH:MM » (voir `handleAddInboxItem` dans App.js). */
function inboxAgeDays(createdAt) {
  const dayPart = String(createdAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayPart)) return 0;
  const created = new Date(`${dayPart}T00:00`);
  const today = new Date(`${localDateKey(getCurrentAppDate())}T00:00`);
  const diff = Math.round((today - created) / 86400000);
  return diff > 0 ? diff : 0;
}

function inboxAgeLabel(days) {
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  return `il y a ${days} jours`;
}

function groupInboxByAge(items) {
  return AGE_BUCKETS
    .map((bucket, index) => {
      const previous = AGE_BUCKETS[index - 1];
      const max = previous ? previous.min - 1 : Infinity;
      const bucketItems = items
        .filter((item) => {
          const days = inboxAgeDays(item.createdAt);
          return days >= bucket.min && days <= max;
        })
        /* Le plus ancien d'abord à l'intérieur du groupe : la liste se lit
           de ce qui attend le plus vers ce qui vient d'arriver. */
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      const oldest = bucketItems.length ? inboxAgeDays(bucketItems[0].createdAt) : 0;
      return {
        ...bucket,
        items: bucketItems,
        label: bucket.label || `Depuis ${oldest} jours`,
      };
    })
    .filter((bucket) => bucket.items.length > 0);
}

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
  onOpenNotes = null,
}) {
  const [inputText, setInputText]     = useState("");

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

  /* ── Envoi direct en note (handoff 9a) ──────────────────────
     « Note » ne passe plus par une feuille : l'item part tout de suite. Pour
     que « Annuler » reste possible, l'envoi réel est différé — la ligne
     affiche « Envoyé dans les notes » et le bandeau du bas propose de se
     dédire pendant ce temps. */
  const [sentNotes, setSentNotes] = useState({});
  const [toast, setToast] = useState(null);
  const pendingNotesRef = useRef(new Map());

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
    onAddInboxItem(text, null);
    setInputText("");
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

  function pickDestination(destinationId, item) {
    if (destinationId === "task") { openTaskDispatch(item); return; }
    if (destinationId === "event") { openAgendaDispatch(item); return; }
    sendToNote(item);
  }

  /* Délai avant l'envoi réel. Assez long pour se dédire, assez court pour
     que la note existe quand on part la consulter. */
  const NOTE_UNDO_MS = 5000;

  function sendToNote(item) {
    if (pendingNotesRef.current.has(item.id)) return;
    const timer = setTimeout(() => commitNote(item), NOTE_UNDO_MS);
    pendingNotesRef.current.set(item.id, { item, timer });
    setSentNotes((previous) => ({ ...previous, [item.id]: true }));
    setToast({ id: item.id, label: "Envoyé dans les notes" });
  }

  function commitNote(item) {
    const pending = pendingNotesRef.current.get(item.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingNotesRef.current.delete(item.id);
    onDispatchToNote(item, {
      text: String(item.text || "").trim(),
      visibility: "household",
      sharedWith: [],
    });
    setSentNotes((previous) => {
      const next = { ...previous };
      delete next[item.id];
      return next;
    });
    setToast((current) => (current && current.id === item.id ? null : current));
  }

  function undoNote(item) {
    const pending = pendingNotesRef.current.get(item.id);
    if (pending) clearTimeout(pending.timer);
    pendingNotesRef.current.delete(item.id);
    setSentNotes((previous) => {
      const next = { ...previous };
      delete next[item.id];
      return next;
    });
    setToast((current) => (current && current.id === item.id ? null : current));
  }

  /* Quitter l'écran ne doit pas avaler un envoi en cours : on le confirme. */
  function flushPendingNotes() {
    [...pendingNotesRef.current.values()].forEach(({ item }) => commitNote(item));
  }

  useEffect(() => {
    const pending = pendingNotesRef.current;
    return () => {
      [...pending.values()].forEach(({ item, timer }) => {
        clearTimeout(timer);
        onDispatchToNote(item, {
          text: String(item.text || "").trim(),
          visibility: "household",
          sharedWith: [],
        });
      });
      pending.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <${MrdModal} isOpen=${true} onClose=${closeModal} className="task-modal-redesign mrd-modal-wide">


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
                      style=${{ ...PILL_STACK, background: on ? "var(--mrd-aBtn)" : "var(--mrd-surf2)", color: on ? "var(--mrd-white)" : "var(--mrd-fg2)", border: "1.5px solid " + (on ? "var(--mrd-a)" : "var(--mrd-border)") }}
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
                        style=${{ ...PILL_STACK, background: on ? "var(--mrd-aBtn)" : "var(--mrd-surf2)", color: on ? "var(--mrd-white)" : "var(--mrd-fg2)", border: "1.5px solid " + (on ? "var(--mrd-a)" : "var(--mrd-border)") }}
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
                        style=${{ width: 40, height: 40, borderRadius: "50%", padding: 0, border: "2.5px solid " + (on ? (person.color || "var(--mrd-a)") : "var(--mrd-border)"), background: "transparent", cursor: "pointer", flexShrink: 0, transition: "all 0.15s", boxShadow: on ? "0 0 0 2px " + (person.color || DEFAULT_MEMBER_COLOR) + "33" : "none" }}>
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
              style=${{ width: "100%", padding: 14, borderRadius: "var(--mrd-r)", background: formValid ? "var(--mrd-aBtn)" : "var(--mrd-disabledBg)", color: formValid ? "var(--mrd-white)" : "var(--mrd-disabledFg)", fontSize: 15, fontWeight: 700, cursor: formValid ? "pointer" : "default", boxShadow: formValid ? "var(--mrd-glowA)" : "none", transition: "all 0.2s", border: "none" }}
            >Créer la tâche →</button>

          </form>
      <//>
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
      <${MrdModal} isOpen=${true} onClose=${closeModal} className="task-modal-redesign mrd-modal-wide">


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
                  style=${{ padding: "10px 14px", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", background: agendaForm.allDay ? "var(--mrd-aBtn)" : "var(--mrd-surf2)", color: agendaForm.allDay ? "var(--mrd-white)" : "var(--mrd-fg3)", border: "1.5px solid " + (agendaForm.allDay ? "var(--mrd-a)" : "var(--mrd-border)"), whiteSpace: "nowrap" }}
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
                        style=${{ width: 40, height: 40, borderRadius: "50%", padding: 0, border: "2.5px solid " + (on ? (person.color || "var(--mrd-a)") : "var(--mrd-border)"), background: "transparent", cursor: "pointer", flexShrink: 0, transition: "all 0.15s", boxShadow: on ? "0 0 0 3px " + (person.color || DEFAULT_MEMBER_COLOR) + "33" : "none" }}>
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
                              style=${{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 5px", borderRadius: 99, border: "2px solid " + (on ? (child.color || "var(--mrd-a)") : "var(--mrd-border)"), background: on ? (child.color || DEFAULT_MEMBER_COLOR) + "18" : "transparent", cursor: "pointer", transition: "all 0.15s" }}>
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
                style=${{ flex: 1, padding: "13px 0", borderRadius: "var(--mrd-r)", background: formValid ? "var(--mrd-aBtn)" : "var(--mrd-disabledBg)", color: formValid ? "var(--mrd-white)" : "var(--mrd-disabledFg)", fontSize: 15, fontWeight: 700, cursor: formValid ? "pointer" : "default", border: "none", boxShadow: formValid ? "var(--mrd-glowA)" : "none", transition: "all 0.2s", fontFamily: "inherit" }}>
                Ajouter au calendrier →
              </button>
            </div>

          </form>
      <//>
      ${showEmojiPicker ? html`<${EmojiPicker}
        onSelect=${(emoji) => { updateAgendaForm("icon", emoji); setShowEmojiPicker(false); }}
        onClose=${() => setShowEmojiPicker(false)}
      />` : null}
    `;
  }

  /* ── Note dispatch modal ── */
  /* ── Render — la liste datée (handoff 9a) ─────────────────────
     L'écran empilait un gros bloc de capture en haut puis des cartes de
     trois lignes aux quatre boutons de même poids. La liste reste, mais
     dense, datée et pré-triée : les groupes d'âge font remonter ce qui
     traîne, la destination déduite est surlignée parmi les trois, et la
     saisie descend dans la zone du pouce. */
  const groups = groupInboxByAge(safeInbox);
  const leftLabel = safeInbox.length === 1 ? "1 à trier" : `${safeInbox.length} à trier`;

  return html`
    <div className="ibx-view ibx-view--9a">

      <header className="ibx-hdr">
        <span className="ibx-hdr-titles">
          <span className="ibx-hdr-kicker">pense-bête</span>
          <span className="ibx-hdr-title">À trier</span>
        </span>
        ${safeInbox.length ? html`<span className="ibx-hdr-count">${leftLabel}</span>` : null}
      </header>

      <div className="ibx-scroll">
      ${safeInbox.length === 0 ? html`
        <div className="ibx-empty">
          <div className="ibx-empty-icon">📥</div>
          <div className="ibx-empty-title">Rien à trier</div>
          <div className="ibx-empty-sub">
            Note ce qui te passe par la tête —
            tu trieras vers les tâches, l'agenda ou les notes plus tard.
          </div>
        </div>
      ` : null}

      ${groups.map((group) => html`
        <section className="ibx-group" key=${group.id}>
          <div className=${`ibx-group-head ibx-group-head--${group.id}`}>
            <span className="ibx-group-label">${group.label}</span>
            <span className="ibx-group-rule"></span>
            <span className="ibx-group-count">${group.items.length}</span>
          </div>

          ${group.items.map((item) => {
            const days = inboxAgeDays(item.createdAt);
            const sent = Boolean(sentNotes[item.id]);
            return html`
              <article key=${item.id} className=${`ibx-card ${sent ? "is-sent" : ""} ${group.id === "stale" ? "is-stale" : ""}`}>
                <div className="ibx-card-head">
                  <span className="ibx-card-copy">
                    <span className="ibx-card-text">${item.text}</span>
                    <span className=${`ibx-card-age ${group.id === "stale" ? "is-stale" : ""}`}>${inboxAgeLabel(days)}</span>
                  </span>
                  <button
                    type="button"
                    className="ibx-card-del"
                    onClick=${() => onDeleteInboxItem(item.id)}
                    aria-label=${`Supprimer « ${item.text} »`}
                    title="Supprimer"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </button>
                </div>

                ${sent ? html`
                  <div className="ibx-card-sent">
                    <span className="ibx-card-sent-label">Envoyé dans les notes</span>
                    <button type="button" className="ibx-card-undo" onClick=${() => undoNote(item)}>Annuler</button>
                  </div>
                ` : html`
                  <div className="ibx-card-choices">
                    ${DESTINATIONS.map((dest) => html`
                      <button
                        type="button"
                        key=${dest.id}
                        className=${`ibx-choice ibx-choice--${dest.id} ${item.hint === dest.id ? "on" : ""}`}
                        onClick=${() => pickDestination(dest.id, item)}
                      ><span className="ibx-choice-emoji" aria-hidden="true">${dest.emoji}</span>${dest.label}</button>
                    `)}
                  </div>
                `}
              </article>
            `;
          })}
        </section>
      `)}
      </div>

      ${/* Bandeau de confirmation : l'envoi en note ne quitte pas l'écran,
           il se défait depuis la ligne ou depuis ici. */null}
      ${toast ? html`
        <div className="ibx-toast" role="status">
          <span className="ibx-toast-mark">✓</span>
          <span className="ibx-toast-label">${toast.label}</span>
          ${onOpenNotes ? html`
            <button type="button" className="ibx-toast-action" onClick=${() => { flushPendingNotes(); onOpenNotes(); }}>Voir</button>
          ` : null}
        </div>
      ` : null}

      ${/* Saisie en bas : le pouce y arrive, contrairement au bloc de
           capture qui occupait le haut de l'écran. */null}
      <div className="ibx-capture">
        <input
          className="ibx-capture-input"
          type="text"
          placeholder="Note tout, trie plus tard…"
          value=${inputText}
          onInput=${(e) => setInputText(e.currentTarget.value)}
          onKeyDown=${handleKeyDown}
          aria-label="Noter quelque chose"
        />
        <button
          type="button"
          className="ibx-capture-send"
          onClick=${handleAdd}
          disabled=${!inputText.trim()}
          aria-label="Ajouter au pense-bête"
        >↑</button>
      </div>

      ${/* Tâche et Agenda ouvrent la feuille de création pré-remplie ;
           Note part directement. */null}
      ${dispatchMode === "task"   && dispatchItem ? renderTaskModal()   : null}
      ${dispatchMode === "agenda" && dispatchItem ? renderAgendaModal() : null}

    </div>
  `;
}

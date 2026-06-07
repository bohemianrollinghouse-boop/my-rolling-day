import { html, useEffect, useMemo, useState } from "../../lib.js";
import { localDateKey } from "../../utils/date.js";
import { CategoryIcon, categoryToneClass } from "../recipes/CategoryIcons.js";

/* ─── HELPERS ────────────────────────────────────────────── */
function initials(label) {
  if (!label) return "?";
  const parts = label.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : label[0].toUpperCase();
}

function Avatar({ person, size }) {
  const sz = size || 28;
  const bg = person?.color || "#8B7355";
  const id = initials(person?.displayName || person?.label || "?");
  return html`
    <div className="mrd-avatar" style=${{
      width: sz + "px", height: sz + "px",
      fontSize: Math.round(sz * 0.38) + "px",
      background: bg,
      boxShadow: "0 2px 6px " + bg + "55",
    }}>${id}</div>
  `;
}

/* Progress ring (pure SVG) */
function ProgressRing({ value, size, stroke }) {
  const sz = size || 60;
  const sw = stroke || 5;
  const r = (sz - sw * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value || 0));
  return html`
    <svg width=${sz} height=${sz} style=${{ transform: "rotate(-90deg)" }}>
      <circle cx=${sz / 2} cy=${sz / 2} r=${r} fill="none"
        stroke="var(--mrd-border)" stroke-width=${sw}/>
      <circle cx=${sz / 2} cy=${sz / 2} r=${r} fill="none"
        stroke="var(--mrd-a)" stroke-width=${sw}
        stroke-linecap="round"
        stroke-dasharray=${circ}
        stroke-dashoffset=${circ * (1 - pct)}
        style=${{ transition: "stroke-dashoffset .6s ease" }}/>
    </svg>
  `;
}

function IcoChevronRight() {
  return html`
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke="var(--mrd-a)" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

function IcoGear() {
  return html`
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="var(--mrd-fg2)" stroke-width="1.8"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke="var(--mrd-fg2)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
}

/* ─── TASK MODES ─────────────────────────────────────────── */
const TASK_MODES = [
  { key: "mine", label: "Mes tâches", emoji: "👤" },
  { key: "all",  label: "Foyer",      emoji: "🏠" },
];
const TASK_MODE_STORAGE_KEY = "mrd-task-card-mode";

function readSavedMode() {
  try { return localStorage.getItem(TASK_MODE_STORAGE_KEY) || "mine"; } catch (_) { return "mine"; }
}

/* Returns a sortable datetime string for a task, or null if none */
function getTaskSortTime(task) {
  if (task.dueDate) {
    return task.dueDate + "T" + (task.dueTime || "23:59");
  }
  if (task.addToCalendar && task.calendarDateKey && task.calendarStart) {
    return task.calendarDateKey + "T" + task.calendarStart;
  }
  return null;
}

/* Sort: closest échéance/horaire → urgent (sans date) → reste */
function smartSortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const ta = getTaskSortTime(a);
    const tb = getTaskSortTime(b);
    if (ta && tb) return ta.localeCompare(tb);   // both timed: closest first
    if (ta && !tb) return -1;                    // only a has time → a first
    if (!ta && tb) return 1;                     // only b has time → b first
    // neither has a time: urgent before others
    const ua = a.priority === "urgent" ? 0 : 1;
    const ub = b.priority === "urgent" ? 0 : 1;
    return ua - ub;
  });
}

/* Filter tasks by mode */
function filterTasksByMode(tasks, mode, activePersonId) {
  if (mode === "all") return tasks;
  // "mine": seulement les tâches explicitement assignées à cette personne
  // activePersonId doit être non-vide, et la tâche doit lui être assignée
  if (!activePersonId) return [];
  return tasks.filter((t) => t.assignedPersonId === activePersonId);
}

/* ─── QUICK ACCESS ITEMS ─────────────────────────────────── */
const QUICK_ITEMS = [
  { label: "Notes",      emoji: "📝", tab: "notes"     },
  { label: "Inventaire", emoji: "🧺", tab: "inventory" },
  { label: "Recettes",   emoji: "📚", tab: "recipes"   },
  { label: "Historique", emoji: "📊", tab: "history"   },
];

/* ─── MAIN COMPONENT ─────────────────────────────────────── */
/* Calcule la prochaine date d'occurrence d'un événement récurrent à partir de fromDate */
function nextRecurringDateKey(ev, fromDate) {
  const recType = ev.recurrenceType || "weekly";
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);

  if (recType === "daily") {
    return localDateKey(from);
  }
  if (recType === "weekly") {
    const target = Number(ev.weekday);
    if (!Number.isFinite(target)) return null;
    const diff = (target - from.getDay() + 7) % 7;
    const next = new Date(from);
    next.setDate(next.getDate() + diff);
    return localDateKey(next);
  }
  if (recType === "monthly") {
    const dom = ev.dayOfMonth != null
      ? Number(ev.dayOfMonth)
      : ev.dateKey ? new Date(`${ev.dateKey}T00:00`).getDate() : null;
    if (!dom || !Number.isFinite(dom)) return null;
    const next = new Date(from);
    if (next.getDate() > dom) next.setMonth(next.getMonth() + 1);
    next.setDate(dom);
    return localDateKey(next);
  }
  return null;
}

export function HomeView({
  tasks,
  meals,
  recipes,
  notes,
  lists,
  inventory,
  agenda,
  recurringEvents,
  inbox,
  people,
  familyName,
  currentUserName,
  currentDate,
  activePersonId,
  pendingShoppingCount = 0,
  families,
  currentFamily,
  onSwitchFamily,
  onCreateFamily,
  onJoinFamily,
  onToggleTask,
  onNavigate,
  onOpenSettings,
  onOpenAddTask,
}) {
  const safeDate        = currentDate || new Date();
  const safeTasks       = Array.isArray(tasks) ? tasks : [];
  const safeMeals       = Array.isArray(meals) ? meals : [];
  const safeRecipes     = Array.isArray(recipes) ? recipes : [];
  const safeNotes       = Array.isArray(notes) ? notes : [];
  const safeLists       = Array.isArray(lists) ? lists : [];
  const safeInventory   = Array.isArray(inventory) ? inventory : [];
  const safePeople      = Array.isArray(people) ? people : [];
  const safeRecurring   = Array.isArray(recurringEvents) ? recurringEvents : [];
  const safeInbox       = Array.isArray(inbox) ? inbox : [];
  const safeFamilies    = Array.isArray(families) ? families : [];

  /* Sélecteur de foyer */
  const [familyPickerOpen, setFamilyPickerOpen] = useState(false);
  // "list" | "create" | "join"
  const [pickerMode, setPickerMode] = useState("list");
  const [pickerCreateName, setPickerCreateName] = useState("");
  const [pickerJoinCode, setPickerJoinCode] = useState("");
  const [pickerBusy, setPickerBusy] = useState(false);

  function closePicker() {
    setFamilyPickerOpen(false);
    setPickerMode("list");
    setPickerCreateName("");
    setPickerJoinCode("");
  }

  async function submitPickerCreate() {
    const name = pickerCreateName.trim();
    if (!name || pickerBusy) return;
    setPickerBusy(true);
    try { if (onCreateFamily) await onCreateFamily(name); closePicker(); }
    catch (_) { /* errors handled upstream */ }
    finally { setPickerBusy(false); }
  }

  async function submitPickerJoin() {
    const code = pickerJoinCode.trim();
    if (!code || pickerBusy) return;
    setPickerBusy(true);
    try { if (onJoinFamily) await onJoinFamily(code); closePicker(); }
    catch (_) { /* errors handled upstream */ }
    finally { setPickerBusy(false); }
  }

  /* Recherche globale */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 2) return null;
    const taskHits = safeTasks
      .filter((t) => (t.text || "").toLowerCase().includes(q))
      .slice(0, 5)
      .map((t) => ({ kind: "task", id: t.id, label: t.text, sub: t.priority === "deadline" ? "Deadline" : t.taskKind === "recurring" ? "Récurrente" : "Tâche", tab: "daily" }));
    const recipeHits = safeRecipes
      .filter((r) => (r.name || "").toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q))
      .slice(0, 5)
      .map((r) => ({ kind: "recipe", id: r.id, label: r.name, sub: r.category || "Recette", tab: "recipes" }));
    const noteHits = safeNotes
      .filter((n) => (n.text || "").toLowerCase().includes(q))
      .slice(0, 5)
      .map((n) => ({ kind: "note", id: n.id, label: (n.text || "").slice(0, 80), sub: "Note", tab: "notes" }));
    const listItemHits = [];
    for (const list of safeLists) {
      if (listItemHits.length >= 3) break;
      const items = Array.isArray(list.items) ? list.items : [];
      for (const item of items) {
        if (listItemHits.length >= 3) break;
        if ((item.text || "").toLowerCase().includes(q)) {
          listItemHits.push({ kind: "list-item", id: `${list.id}-${item.id || item.text}`, label: item.text, sub: list.name || "Liste", tab: "lists" });
        }
      }
    }
    const inventoryHits = safeInventory
      .filter((item) => (item.name || "").toLowerCase().includes(q))
      .slice(0, 3)
      .map((item) => ({ kind: "inventory", id: item.id, label: item.name, sub: "Inventaire", tab: "inventory" }));
    return { taskHits, recipeHits, noteHits, listItemHits, inventoryHits, total: taskHits.length + recipeHits.length + noteHits.length + listItemHits.length + inventoryHits.length };
  }, [searchQuery, safeTasks, safeRecipes, safeNotes, safeLists, safeInventory]);

  /* Task card mode (persisted) */
  const [taskMode, setTaskModeRaw] = useState(readSavedMode);
  function cycleMode() {
    const idx = TASK_MODES.findIndex((m) => m.key === taskMode);
    const next = TASK_MODES[(idx + 1) % TASK_MODES.length].key;
    try { localStorage.setItem(TASK_MODE_STORAGE_KEY, next); } catch (_) {}
    setTaskModeRaw(next);
  }
  const currentMode = TASK_MODES.find((m) => m.key === taskMode) || TASK_MODES[0];
  const currentModeLabel = currentMode.label;
  const currentModeEmoji = currentMode.emoji;

  /* Toast "Tâche effectuée" */
  const [toast, setToast] = useState(null); // { taskId, taskText }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function getRecipeEmoji(recipe) {
    if (!recipe) return "🍳";
    const raw = recipe.emoji ? String(recipe.emoji).trim() : "";
    if (raw) return raw;
    const labels = Array.isArray(recipe.labels) ? recipe.labels : [];
    const FOOD_ICONS = { vegetarian: "🥕", vegan: "🌱", omnivore: "🍖", pescetarian: "🐟" };
    const first = labels.find((l) => FOOD_ICONS[l]);
    return first ? FOOD_ICONS[first] : "🍳";
  }

  function getSlotDetails(meal, slot) {
    if (!meal) return null;
    const isLunch = slot === "lunch";
    const recipeId        = isLunch ? meal.lunchRecipeId        : meal.dinnerRecipeId;
    const starterRecipeId = isLunch ? meal.lunchStarterRecipeId : meal.dinnerStarterRecipeId;
    const dessertRecipeId = isLunch ? meal.lunchDessertRecipeId : meal.dinnerDessertRecipeId;
    const extra           = isLunch ? meal.lunchExtra           : meal.dinnerExtra;
    const text            = isLunch ? meal.lunchText            : meal.dinnerText;

    const main    = recipeId        ? safeRecipes.find((r) => r.id === recipeId)        : null;
    const starter = starterRecipeId ? safeRecipes.find((r) => r.id === starterRecipeId) : null;
    const dessert = dessertRecipeId ? safeRecipes.find((r) => r.id === dessertRecipeId) : null;

    const hasAnything = main || starter || dessert || extra || text;
    if (!hasAnything) return null;

    return {
      main:    main    ? { name: main.name,    emoji: getRecipeEmoji(main),    recipe: main } : text ? { name: text, emoji: null, recipe: null } : null,
      starter: starter ? { name: starter.name, emoji: getRecipeEmoji(starter), recipe: starter } : null,
      dessert: dessert ? { name: dessert.name, emoji: getRecipeEmoji(dessert), recipe: dessert } : null,
      extra:   extra   || null,
    };
  }

  function getMealRows(details) {
    if (!details) return [];
    return [
      details.starter ? { key: "starter", courseType: "starter", label: "Entr\u00E9e", name: details.starter.name } : null,
      details.main    ? { key: "main",    courseType: "main",    label: "Plat",       name: details.main.name }    : null,
      details.dessert ? { key: "dessert", courseType: "dessert", label: "Dessert",    name: details.dessert.name } : null,
    ].filter(Boolean);
  }

  function renderMealDayCard(slot) {
    const config = slot === "lunch"
      ? { key: "lunch", icon: "\u2600\uFE0F", label: "D\u00E9jeuner", empty: "Non planifi\u00E9" }
      : { key: "dinner", icon: "\uD83C\uDF19", label: "D\u00EEner", empty: "Non planifi\u00E9" };
    const details = getSlotDetails(todayMeal, slot);
    const rows = getMealRows(details);
    return html`
      <button
        type="button"
        key=${config.key}
        className=${`mrd-home-meal-day-card mrd-home-meal-day-card--${config.key}`}
        onClick=${() => onNavigate("meals")}
        aria-label=${`${config.label} du jour`}
      >
        <div className="mrd-home-meal-day-head">
          <div className="mrd-home-meal-day-slot">
            <span className="mrd-home-meal-day-slot-icon">${config.icon}</span>
            <span className="mrd-home-meal-day-slot-label">${config.label}</span>
          </div>
        </div>

        ${rows.length ? html`
          <div className="mrd-home-meal-day-body">
            ${rows.map((row) => html`
              <div key=${row.key} className=${`mrd-home-meal-course mrd-home-meal-course--${row.key}`}>
                  <div className="mrd-home-meal-course-icon-wrap">
                    <${CategoryIcon} categoryId=${row.courseType} size=${44} framed=${false} />
                  </div>
                  <div className="mrd-home-meal-course-copy">
                    <div className=${`mrd-home-meal-course-label ${categoryToneClass(row.courseType)}`}>${row.label}</div>
                    <div className="mrd-home-meal-course-name">${row.name}</div>
                  </div>
                </div>
            `)}
            ${details?.extra ? html`<div className="mrd-home-meal-note">${details.extra}</div>` : null}
          </div>
        ` : html`
          <div className="mrd-home-meal-empty">
            <div className="mrd-home-meal-empty-title">${config.empty}</div>
          </div>
        `}
      </button>
    `;
  }

  /* Date strings */
  const dayName  = safeDate.toLocaleDateString("fr-FR", { weekday: "long" });
  const dateStr  = safeDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
  const todayKey = localDateKey(safeDate);

  /* Tasks for today — filtered and sorted (daily + deadline dues today/overdue) */
  const startOfTomorrow = new Date(safeDate);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  startOfTomorrow.setHours(0, 0, 0, 0);

  const allTodayTasks = safeTasks.filter((t) => {
    if (t.type === "daily") return true;
    if (t.priority === "deadline" || t.displayPeriod === "deadline") {
      if (!t.dueDate) return false;
      const due = new Date(t.dueDate + "T" + (t.dueTime || "23:59"));
      return due < startOfTomorrow; // due today or overdue
    }
    return false;
  });
  const filteredTasks  = filterTasksByMode(allTodayTasks, taskMode, activePersonId || "");
  const doneTasks      = filteredTasks.filter(
    (t) => (Array.isArray(t.doneBy) && t.doneBy.length > 0) || Boolean(t.completedByPersonId),
  );
  const rawTodoTasks   = filteredTasks.filter(
    (t) => !(Array.isArray(t.doneBy) && t.doneBy.length > 0) && !t.completedByPersonId,
  );
  const todoTasks      = smartSortTasks(rawTodoTasks);
  const doneCount      = doneTasks.length;
  const totalCount     = filteredTasks.length;
  const remainingCount = todoTasks.length;
  const pct            = totalCount ? doneCount / totalCount : 0;

  /* Today's meals — day name (Lundi…) + weekKey de la semaine courante */
  const DAYS_FR = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
  const todayDayName = DAYS_FR[safeDate.getDay() === 0 ? 6 : safeDate.getDay() - 1];
  const todayMonday = (() => {
    const d = new Date(safeDate);
    const dow = d.getDay();
    d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  })();
  const currentWeekKey = `${todayMonday.getFullYear()}-${String(todayMonday.getMonth() + 1).padStart(2, "0")}-${String(todayMonday.getDate()).padStart(2, "0")}`;
  const todayMeal = safeMeals.find((m) =>
    m.day === todayDayName &&
    (m.weekKey === currentWeekKey || !m.weekKey || m.weekKey === "")
  ) || null;

  /* Upcoming events : one-time + next occurrence of recurring (max 4 combined) */
  const safeAgenda = Array.isArray(agenda) ? agenda : [];
  const upcoming   = useMemo(() => {
    const oneTime = safeAgenda
      .filter((ev) => ev.dateKey >= todayKey && ev.sourceType !== "task")
      .map((ev) => ({ ...ev, isRecurring: false }));

    const recurring = safeRecurring
      .filter((ev) => !ev.startDateKey || ev.startDateKey <= todayKey)
      .map((ev) => {
        const nextKey = nextRecurringDateKey(ev, safeDate);
        if (!nextKey) return null;
        return { ...ev, dateKey: nextKey, isRecurring: true };
      })
      .filter(Boolean);

    // Dédupliquer les récurrents : garder un seul par (text + dateKey)
    const seen = new Set();
    const deduped = recurring.filter((ev) => {
      const key = `${ev.text}|${ev.dateKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return [...oneTime, ...deduped]
      .sort((a, b) => (a.dateKey > b.dateKey ? 1 : a.dateKey < b.dateKey ? -1 : 0))
      .slice(0, 4);
  }, [safeAgenda, safeRecurring, todayKey, safeDate]);

  /* Time-based greeting */
  const hour = safeDate.getHours();
  const greetWord = hour >= 5 && hour < 12
    ? "Bonjour"
    : hour >= 12 && hour < 18
      ? "Bon après-midi"
      : "Bonsoir";
  const activePerson = activePersonId
    ? safePeople.find((person) => person.id === activePersonId)
    : null;
  const greetingName = String(currentUserName || activePerson?.displayName || activePerson?.label || "").trim();
  const greeting    = greetingName
    ? `${greetWord}, ${greetingName}`
    : greetWord;

  /* ── Progress texts ── */
  const progressTitle = "Aujourd'hui ☀️";

  const progressSub = totalCount === 0
    ? "Aucune tâche"
    : doneCount === totalCount
    ? "Tout est fait ! 🎉"
    : `${remainingCount} tâche${remainingCount > 1 ? "s" : ""} restante${remainingCount > 1 ? "s" : ""}`;

  /* ── Render helpers ── */
  function renderMiniTask(task) {
    const isUrgent = task.priority === "urgent";
    const isDeadl  = task.priority === "deadline" || task.displayPeriod === "deadline";

    /* ── Repère gauche : emoji ou point ── */
    const emoji = task.icon || null;

    /* ── Badge deadline : "avant HHhMM" (jaune) ou "retard HHhMM" (rouge) ── */
    let dlBadge = null;
    if (isDeadl) {
      const dueDateTime = task.dueDate
        ? new Date(task.dueDate + "T" + (task.dueTime || "23:59"))
        : null;
      const isOverdue = dueDateTime ? dueDateTime < safeDate : false;
      const timeStr   = task.dueTime ? task.dueTime.replace(":", "h") : null;
      dlBadge = {
        text: isOverdue
          ? (timeStr ? `retard ${timeStr}` : "retard")
          : (timeStr ? `avant ${timeStr}` : "échéance"),
        overdue: isOverdue,
      };
    }

    /* ── Heure programmée (non-deadline) ── */
    const rawTime  = !isDeadl
      ? (task.dueTime || (task.addToCalendar && task.calendarStart ? task.calendarStart : null))
      : null;
    const schedTime = rawTime ? rawTime.replace(":", "h") : null;

    /* ── Badge personne (mode Foyer) — indépendant de l'urgence ── */
    const assignedPerson = taskMode === "all" && task.assignedPersonId
      ? safePeople.find((p) => p.id === task.assignedPersonId) || null
      : null;
    const personInitial = assignedPerson
      ? (assignedPerson.displayName || assignedPerson.label || "?")[0].toUpperCase()
      : null;
    const personColor = assignedPerson?.color || "#8B7355";

    function handleCheck(e) {
      e.stopPropagation();
      if (onToggleTask) {
        onToggleTask(task.id, activePersonId || "");
        setToast({ taskId: task.id, taskText: task.text || "Tâche" });
      }
    }

    return html`
      <div key=${task.id}
        className="mrd-mini-task"
        onClick=${handleCheck}>
        ${emoji
          ? html`<span className="mrd-mini-task-icon">${emoji}</span>`
          : html`<span className="mrd-mini-task-dot"></span>`}
        <span className="mrd-mini-task-name">${task.text || ""}</span>
        ${isUrgent ? html`<span className="ttag task-priority urgent">Urgent</span>` : null}
        ${dlBadge ? html`
          <span className=${`mrd-mini-task-dl-badge${dlBadge.overdue ? " is-overdue" : ""}`}>
            ${dlBadge.text}
          </span>` : null}
        ${schedTime ? html`<span className="mrd-mini-task-time">${schedTime}</span>` : null}
        ${personInitial ? html`
          <span className="mrd-mini-task-person"
            style=${{ background: personColor, color: "#fff", boxShadow: "0 1px 4px " + personColor + "66" }}>
            ${personInitial}
          </span>` : null}
      </div>
    `;
  }

  function renderEvent(ev) {
    const isToday = ev.dateKey === todayKey;
    const evDate  = ev.dateKey ? new Date(ev.dateKey + "T12:00:00") : null;
    const dayNum  = evDate ? evDate.getDate() : "?";
    const month   = evDate
      ? evDate.toLocaleDateString("fr-FR", { month: "short" }).toUpperCase()
      : "";
    const time    = !ev.allDay ? ev.start : null;
    return html`
      <div key=${`${ev.id}-${ev.dateKey}`} className=${`mrd-event-card ${isToday ? "today" : ""}`}>
        <div className="mrd-event-date-box">
          <span className="mrd-event-month">${month}</span>
          <span className="mrd-event-day-num">${dayNum}</span>
        </div>
        <div style=${{ flex: 1, minWidth: 0 }}>
          <div className="mrd-event-label">${ev.text || "Événement"}</div>
          ${time ? html`<div className="mrd-event-time">${time}</div>` : null}
        </div>
        ${ev.isRecurring ? html`<span className="mrd-event-recur-badge" aria-label="Récurrent">↺</span>` : null}
      </div>
    `;
  }

  const KIND_EMOJI = { task: "✅", recipe: "📚", note: "📝", "list-item": "🛒", inventory: "🧺" };

  function renderSearchOverlay() {
    if (!searchOpen) return null;
    const q = searchQuery.trim();
    return html`
      <div className="gs-backdrop" onClick=${() => setSearchOpen(false)}>
        <div className="gs-panel" onClick=${(e) => e.stopPropagation()}>
          <div className="gs-bar">
            <svg className="gs-icon" width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            <input
              className="gs-input"
              type="search"
              placeholder="Chercher une tâche, recette, note…"
              autoFocus
              value=${searchQuery}
              onInput=${(e) => setSearchQuery(e.currentTarget.value)}
              onKeyDown=${(e) => e.key === "Escape" && setSearchOpen(false)}
              aria-label="Recherche globale"
            />
            <button className="gs-close" onClick=${() => setSearchOpen(false)} aria-label="Fermer">×</button>
          </div>

          ${q.length < 2 ? html`
            <div className="gs-hint">Tape au moins 2 caractères…</div>
          ` : searchResults.total === 0 ? html`
            <div className="gs-hint">Aucun résultat pour « ${q} »</div>
          ` : html`
            <div className="gs-results">
              ${searchResults.taskHits.length ? html`
                <div className="gs-group">
                  <div className="gs-group-label">Tâches</div>
                  ${searchResults.taskHits.map((r) => html`
                    <button key=${r.id} className="gs-result-btn" onClick=${() => { setSearchOpen(false); onNavigate(r.tab); }}>
                      <span className="gs-result-icon">${KIND_EMOJI[r.kind]}</span>
                      <span className="gs-result-label">${r.label}</span>
                      <span className="gs-result-sub">${r.sub}</span>
                    </button>
                  `)}
                </div>
              ` : null}
              ${searchResults.recipeHits.length ? html`
                <div className="gs-group">
                  <div className="gs-group-label">Recettes</div>
                  ${searchResults.recipeHits.map((r) => html`
                    <button key=${r.id} className="gs-result-btn" onClick=${() => { setSearchOpen(false); onNavigate(r.tab); }}>
                      <span className="gs-result-icon">${KIND_EMOJI[r.kind]}</span>
                      <span className="gs-result-label">${r.label}</span>
                      <span className="gs-result-sub">${r.sub}</span>
                    </button>
                  `)}
                </div>
              ` : null}
              ${searchResults.noteHits.length ? html`
                <div className="gs-group">
                  <div className="gs-group-label">Notes</div>
                  ${searchResults.noteHits.map((r) => html`
                    <button key=${r.id} className="gs-result-btn" onClick=${() => { setSearchOpen(false); onNavigate(r.tab); }}>
                      <span className="gs-result-icon">${KIND_EMOJI[r.kind]}</span>
                      <span className="gs-result-label">${r.label}</span>
                      <span className="gs-result-sub">${r.sub}</span>
                    </button>
                  `)}
                </div>
              ` : null}
              ${searchResults.listItemHits.length ? html`
                <div className="gs-group">
                  <div className="gs-group-label">Listes</div>
                  ${searchResults.listItemHits.map((r) => html`
                    <button key=${r.id} className="gs-result-btn" onClick=${() => { setSearchOpen(false); onNavigate(r.tab); }}>
                      <span className="gs-result-icon">${KIND_EMOJI[r.kind]}</span>
                      <span className="gs-result-label">${r.label}</span>
                      <span className="gs-result-sub">${r.sub}</span>
                    </button>
                  `)}
                </div>
              ` : null}
              ${searchResults.inventoryHits.length ? html`
                <div className="gs-group">
                  <div className="gs-group-label">Inventaire</div>
                  ${searchResults.inventoryHits.map((r) => html`
                    <button key=${r.id} className="gs-result-btn" onClick=${() => { setSearchOpen(false); onNavigate(r.tab); }}>
                      <span className="gs-result-icon">${KIND_EMOJI[r.kind]}</span>
                      <span className="gs-result-label">${r.label}</span>
                      <span className="gs-result-sub">${r.sub}</span>
                    </button>
                  `)}
                </div>
              ` : null}
            </div>
          `}
        </div>
      </div>
    `;
  }

  return html`
    <div className="mrd-home">

      ${renderSearchOverlay()}

      ${/* ── Header ── */null}
      <div className="mrd-home-hdr">
        <div style=${{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div className="mrd-home-subdate">${dayName}, ${dateStr}</div>
            <div className="mrd-home-greeting">${greeting}</div>
          </div>
          <div style=${{ display: "flex", gap: 6 }}>
            <button type="button" className="mrd-gear-btn" aria-label="Recherche globale" onClick=${() => { setSearchOpen(true); setSearchQuery(""); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>
            <button type="button" className="mrd-gear-btn" aria-label="Paramètres" onClick=${onOpenSettings}>
              <${IcoGear} />
            </button>
          </div>
        </div>

        ${/* Family row */null}
        ${safePeople.length > 0 ? html`
          <div className="mrd-family-row">
            <button
              type="button"
              className="mrd-family-switcher-btn"
              onClick=${() => { setFamilyPickerOpen((v) => !v); setPickerMode("list"); }}
              aria-label="Gérer mes foyers"
            >
              <span className="mrd-family-row-label">${familyName || "Mon foyer"}</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                style=${{ transform: familyPickerOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
                <path d="M6 9l6 6 6-6" stroke="var(--mrd-fg3)" stroke-width="2.2"
                  stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div className="mrd-avatar-stack">
              ${safePeople.slice(0, 5).map((p, i) => html`
                <div key=${p.id} style=${{ marginLeft: i ? "-6px" : 0, zIndex: 5 - i }}>
                  <${Avatar} person=${p} size=${26} />
                </div>
              `)}
            </div>
          </div>

          ${familyPickerOpen ? html`
            <div className="mrd-family-picker">

              ${/* ── Mode liste ── */null}
              ${pickerMode === "list" ? html`
                ${safeFamilies.map((f) => html`
                  <button
                    key=${f.id}
                    type="button"
                    className=${"mrd-family-picker-card" + (currentFamily?.id === f.id ? " is-active" : "")}
                    onClick=${() => {
                      if (f.id !== currentFamily?.id && onSwitchFamily) onSwitchFamily(f.id);
                      closePicker();
                    }}
                  >
                    <span className="mrd-family-picker-card-left">
                      <span className="mrd-family-picker-card-name">${f.name}</span>
                      ${currentFamily?.id === f.id ? html`
                        <span className="mrd-family-picker-card-sub">
                          ${safePeople.length} membre${safePeople.length !== 1 ? "s" : ""}
                        </span>
                      ` : null}
                    </span>
                    <span className="mrd-family-picker-card-right">
                      ${currentFamily?.id === f.id ? html`
                        <span className="mrd-family-picker-check">✓</span>
                        <div className="mrd-family-picker-avatars">
                          ${safePeople.slice(0, 4).map((p, i) => html`
                            <div key=${p.id} style=${{ marginLeft: i ? "-5px" : 0, zIndex: 4 - i }}>
                              <${Avatar} person=${p} size=${22} />
                            </div>
                          `)}
                        </div>
                      ` : null}
                    </span>
                  </button>
                `)}
                <div className="mrd-family-picker-sep"></div>
                <button
                  type="button"
                  className="mrd-family-picker-action"
                  onClick=${() => setPickerMode("create")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                  </svg>
                  Créer un foyer
                </button>
                <button
                  type="button"
                  className="mrd-family-picker-action"
                  onClick=${() => setPickerMode("join")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Rejoindre un foyer
                </button>
              ` : null}

              ${/* ── Mode création ── */null}
              ${pickerMode === "create" ? html`
                <button type="button" className="mrd-family-picker-back"
                  onClick=${() => setPickerMode("list")}>
                  ← Retour
                </button>
                <div className="mrd-family-picker-sep"></div>
                <div className="mrd-family-picker-form">
                  <span className="mrd-family-picker-form-label">Nom du nouveau foyer</span>
                  <div className="mrd-family-picker-form-row">
                    <input
                      className="mrd-family-picker-input"
                      placeholder="Ex : Maison Paris"
                      value=${pickerCreateName}
                      onInput=${(e) => setPickerCreateName(e.target.value)}
                      onKeyDown=${(e) => e.key === "Enter" && submitPickerCreate()}
                    />
                    <button
                      type="button"
                      className="mrd-family-picker-submit"
                      disabled=${!pickerCreateName.trim() || pickerBusy}
                      onClick=${submitPickerCreate}
                    >${pickerBusy ? "…" : "Créer"}</button>
                  </div>
                </div>
              ` : null}

              ${/* ── Mode rejoindre ── */null}
              ${pickerMode === "join" ? html`
                <button type="button" className="mrd-family-picker-back"
                  onClick=${() => setPickerMode("list")}>
                  ← Retour
                </button>
                <div className="mrd-family-picker-sep"></div>
                <div className="mrd-family-picker-form">
                  <span className="mrd-family-picker-form-label">Code d'invitation</span>
                  <div className="mrd-family-picker-form-row">
                    <input
                      className="mrd-family-picker-input"
                      placeholder="ABC-123"
                      value=${pickerJoinCode}
                      onInput=${(e) => setPickerJoinCode(e.target.value)}
                      onKeyDown=${(e) => e.key === "Enter" && submitPickerJoin()}
                    />
                    <button
                      type="button"
                      className="mrd-family-picker-submit"
                      disabled=${!pickerJoinCode.trim() || pickerBusy}
                      onClick=${submitPickerJoin}
                    >${pickerBusy ? "…" : "Rejoindre"}</button>
                  </div>
                  <span className="mrd-family-picker-hint">Le code rattache ton compte au foyer.</span>
                </div>
              ` : null}

            </div>
          ` : null}
        ` : null}
      </div>

      ${/* ── Progress card ── */null}
      <div className="mrd-progress-card">

        <div className="mrd-progress-inner">
          <div className="mrd-progress-ring-wrap">
            <${ProgressRing} value=${pct} size=${60} stroke=${5} />
            <div className="mrd-progress-num">
              <div className="mrd-progress-done">${doneCount}</div>
              <div className="mrd-progress-total">/${totalCount}</div>
            </div>
          </div>
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div className="mrd-progress-title-row">
              <span className="mrd-progress-title">${progressTitle}</span>
              <button className="mrd-task-mode-btn mrd-task-mode-btn--active" onClick=${cycleMode} title="Changer le filtre de tâches">
                ${currentModeEmoji} ${currentModeLabel}
              </button>
            </div>
            <div className="mrd-progress-sub">${progressSub}</div>
          </div>
        </div>

        ${/* Mini task list */null}
        ${todoTasks.length > 0 ? html`
          <div className="mrd-mini-tasks">
            ${todoTasks.slice(0, 3).map(renderMiniTask)}
            ${todoTasks.length > 3 ? html`
              <button onClick=${() => onNavigate("daily")} style=${{
                fontSize: 12, color: "var(--mrd-a)", fontWeight: 600,
                textAlign: "center", padding: "4px",
                background: "var(--mrd-aLt)", borderRadius: 8, border: "none", cursor: "pointer",
              }}>+${todoTasks.length - 3} autres tâches →</button>
            ` : null}
          </div>
        ` : null}

        ${/* Bouton rapide ajout tâche */null}
        ${onOpenAddTask ? html`
          <button
            type="button"
            onClick=${onOpenAddTask}
            className="mrd-home-add-task-btn"
            aria-label="Nouvelle tâche"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
            </svg>
            Nouvelle tâche
          </button>
        ` : null}
      </div>

      ${/* ── Repas du jour ── */null}
      <div className="mrd-section">
        <div className="mrd-section-head">
          <span className="mrd-section-title">Repas du jour</span>
        </div>
        <div className="mrd-meal-grid mrd-home-meal-grid">
          ${renderMealDayCard("lunch")}
          ${renderMealDayCard("dinner")}
        </div>
      </div>

      ${/* ── À venir ── */null}
      ${upcoming.length > 0 ? html`
        <div className="mrd-section">
          <div className="mrd-section-head">
            <span className="mrd-section-title">À venir</span>
            <button className="mrd-section-link" onClick=${() => onNavigate("agenda")}>Calendrier →</button>
          </div>
          ${upcoming.map(renderEvent)}
        </div>
      ` : null}

      ${/* ── Inbox ── */null}
      <div className="mrd-section">
        <button type="button" className="ibx-home-section"
          onClick=${() => onNavigate("inbox")}
          aria-label="Ouvrir le pense-bête"
        >
          <div className="ibx-home-hd">
            <div className="ibx-home-title">
              <span>📥 Pense-bête à trier</span>
              ${safeInbox.length > 0 ? html`<span className="ibx-home-badge">${safeInbox.length > 99 ? "99+" : safeInbox.length}</span>` : null}
            </div>
          </div>
          ${safeInbox.length === 0 ? html`
            <div className="ibx-home-empty-msg">Toutes tes idées et choses à faire atterrissent ici — trie-les quand tu veux.</div>
          ` : html`
            <div className="ibx-home-items">
              ${safeInbox.slice(0, 3).map((item) => html`
                <div key=${item.id} className="ibx-home-row">
                  <div className="ibx-home-dot"></div>
                  <div className="ibx-home-text">${item.text}</div>
                </div>
              `)}
              ${safeInbox.length > 3 ? html`
                <div className="ibx-home-more">Voir plus</div>
              ` : null}
            </div>
          `}
        </button>
      </div>

      ${/* ── Accès rapide ── */null}
      <div className="mrd-section" style=${{ marginBottom: 24 }}>
        <div className="mrd-section-head">
          <span className="mrd-section-title">Accès rapide</span>
        </div>
        <div className="mrd-quick-grid">
          ${QUICK_ITEMS.map((item) => {
            const badge =
              item.tab === "lists" && pendingShoppingCount > 0 ? pendingShoppingCount
              : item.tab === "inbox" && safeInbox.length > 0 ? safeInbox.length
              : 0;
            return html`
              <button key=${item.tab} className="mrd-quick-btn" onClick=${() => onNavigate(item.tab)}
                aria-label=${badge ? `${item.label} — ${badge} en attente` : item.label}
              >
                <div className="mrd-quick-btn-icon-wrap">
                  <span className="mrd-quick-btn-icon" aria-hidden="true">${item.emoji}</span>
                  ${badge ? html`<span className="mrd-quick-badge" aria-hidden="true">${badge > 99 ? "99+" : badge}</span>` : null}
                </div>
                <span className="mrd-quick-btn-label" aria-hidden="true">${item.label}</span>
              </button>
            `;
          })}
        </div>
      </div>

    </div>

    ${/* ── Toast ── */null}
    ${toast ? html`
      <div className="mrd-home-toast">
        <span className="mrd-home-toast-msg">✓ ${toast.taskText || "Tâche effectuée"}</span>
        <button className="mrd-home-toast-undo" onClick=${() => {
          if (onToggleTask) onToggleTask(toast.taskId, activePersonId || "");
          setToast(null);
        }}>Annuler</button>
      </div>
    ` : null}


  `;
}

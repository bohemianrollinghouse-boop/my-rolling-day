import { html, useEffect, useMemo, useState } from "../../lib.js";
import { localDateKey } from "../../utils/date.js?v=2026-04-19-time-sim-2";

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
  { key: "mine", label: "Mes tâches" },
  { key: "all",  label: "Foyer"      },
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
export function HomeView({
  tasks,
  meals,
  recipes,
  agenda,
  people,
  familyName,
  currentDate,
  activePersonId,
  onToggleTask,
  onNavigate,
  onOpenSettings,
}) {
  const safeDate    = currentDate || new Date();
  const safeTasks   = Array.isArray(tasks) ? tasks : [];
  const safeMeals   = Array.isArray(meals) ? meals : [];
  const safeRecipes = Array.isArray(recipes) ? recipes : [];
  const safePeople  = Array.isArray(people) ? people : [];

  /* Task card mode (persisted) */
  const [taskMode, setTaskModeRaw] = useState(readSavedMode);
  function cycleMode() {
    const idx = TASK_MODES.findIndex((m) => m.key === taskMode);
    const next = TASK_MODES[(idx + 1) % TASK_MODES.length].key;
    try { localStorage.setItem(TASK_MODE_STORAGE_KEY, next); } catch (_) {}
    setTaskModeRaw(next);
  }
  const currentModeLabel = TASK_MODES.find((m) => m.key === taskMode)?.label || "Mes tâches";

  /* Toast "Tâche effectuée" */
  const [toast, setToast] = useState(null); // { taskId, taskText }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function getMealName(meal, slot) {
    if (!meal) return null;
    const text     = slot === "lunch" ? meal.lunchText    : meal.dinnerText;
    const recipeId = slot === "lunch" ? meal.lunchRecipeId : meal.dinnerRecipeId;
    if (text) return text;
    if (recipeId) {
      const recipe = safeRecipes.find((r) => r.id === recipeId);
      return recipe?.name || null;
    }
    return null;
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

  /* Today's meals */
  const todayMeal = safeMeals.find((m) => m.day === todayKey) || null;

  /* Upcoming agenda events (next 3) */
  const safeAgenda = Array.isArray(agenda) ? agenda : [];
  const upcoming   = useMemo(() => {
    return safeAgenda
      .filter((ev) => ev.dateKey >= todayKey && ev.sourceType !== "task")
      .sort((a, b) => (a.dateKey > b.dateKey ? 1 : a.dateKey < b.dateKey ? -1 : 0))
      .slice(0, 3);
  }, [safeAgenda, todayKey]);

  /* First person display name */
  const firstPerson = safePeople[0];
  const greeting    = firstPerson
    ? `Bonjour, ${firstPerson.displayName || firstPerson.label} 🌿`
    : "Bonjour 🌿";

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
        className=${`mrd-mini-task${isUrgent ? " is-urgent" : ""}`}
        onClick=${handleCheck}>
        ${emoji
          ? html`<span className="mrd-mini-task-icon">${emoji}</span>`
          : html`<span className="mrd-mini-task-dot"></span>`}
        <span className="mrd-mini-task-name">${task.text || ""}</span>
        ${dlBadge ? html`
          <span className=${`mrd-mini-task-dl-badge${dlBadge.overdue ? " is-overdue" : ""}`}>
            ${dlBadge.text}
          </span>` : null}
        ${schedTime ? html`<span className="mrd-mini-task-time">${schedTime}</span>` : null}
        ${personInitial ? html`
          <span className="mrd-mini-task-person"
            style=${{ background: personColor + "22", color: personColor, border: "1px solid " + personColor + "44" }}>
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
      <div key=${ev.id} className=${`mrd-event-card ${isToday ? "today" : ""}`}>
        <div className="mrd-event-date-box">
          <span className="mrd-event-month">${month}</span>
          <span className="mrd-event-day-num">${dayNum}</span>
        </div>
        <div style=${{ flex: 1, minWidth: 0 }}>
          <div className="mrd-event-label">${ev.text || "Événement"}</div>
          ${time ? html`<div className="mrd-event-time">${time}</div>` : null}
        </div>
      </div>
    `;
  }

  return html`
    <div className="mrd-home">

      ${/* ── Header ── */null}
      <div className="mrd-home-hdr">
        <div style=${{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div className="mrd-home-subdate">${dayName}, ${dateStr}</div>
            <div className="mrd-home-greeting">${greeting}</div>
          </div>
          <button className="mrd-gear-btn" onClick=${onOpenSettings}>
            <${IcoGear} />
          </button>
        </div>

        ${/* Family row */null}
        ${safePeople.length > 0 ? html`
          <div className="mrd-family-row">
            <span className="mrd-family-row-label">${familyName || "Mon foyer"}</span>
            <div className="mrd-avatar-stack">
              ${safePeople.slice(0, 5).map((p, i) => html`
                <div key=${p.id} style=${{ marginLeft: i ? "-6px" : 0, zIndex: 5 - i }}>
                  <${Avatar} person=${p} size=${26} />
                </div>
              `)}
            </div>
          </div>
        ` : null}
      </div>

      ${/* ── Progress card ── */null}
      <div className="mrd-progress-card">

        ${/* Mode picker row */null}
        <div className="mrd-task-mode-row">
          <button className="mrd-task-mode-btn" onClick=${cycleMode} title="Changer le filtre de tâches">
            ${currentModeLabel}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style=${{ marginLeft: 2 }}>
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="mrd-progress-inner">
          <div className="mrd-progress-ring-wrap">
            <${ProgressRing} value=${pct} size=${60} stroke=${5} />
            <div className="mrd-progress-num">
              <div className="mrd-progress-done">${doneCount}</div>
              <div className="mrd-progress-total">/${totalCount}</div>
            </div>
          </div>
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div className="mrd-progress-title">${progressTitle}</div>
            <div className="mrd-progress-sub">${progressSub}</div>
          </div>
          <button className="mrd-progress-chevron" onClick=${() => onNavigate("daily")}>
            <${IcoChevronRight} />
          </button>
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
      </div>

      ${/* ── Repas du jour ── */null}
      <div className="mrd-section">
        <div className="mrd-section-head">
          <span className="mrd-section-title">Repas du jour</span>
          <button className="mrd-section-link" onClick=${() => onNavigate("meals")}>Voir tout →</button>
        </div>
        <div className="mrd-meal-grid">
          ${[
            { label: "☀️ Déjeuner", slot: "lunch"  },
            { label: "🌙 Dîner",    slot: "dinner" },
          ].map(({ label, slot }) => {
            const name = getMealName(todayMeal, slot);
            return html`
              <div key=${slot} className="mrd-meal-card">
                <div className="mrd-meal-slot-lbl">${label}</div>
                <div className="mrd-meal-name">${name || "Non planifié"}</div>
              </div>
            `;
          })}
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

      ${/* ── Accès rapide ── */null}
      <div className="mrd-section" style=${{ marginBottom: 24 }}>
        <div className="mrd-section-head">
          <span className="mrd-section-title">Accès rapide</span>
        </div>
        <div className="mrd-quick-grid">
          ${QUICK_ITEMS.map((item) => html`
            <button key=${item.tab} className="mrd-quick-btn" onClick=${() => onNavigate(item.tab)}>
              <span className="mrd-quick-btn-icon">${item.emoji}</span>
              <span className="mrd-quick-btn-label">${item.label}</span>
            </button>
          `)}
        </div>
      </div>

    </div>

    ${/* ── Toast ── */null}
    ${toast ? html`
      <div className="mrd-home-toast">
        <span className="mrd-home-toast-msg">✓ Tâche effectuée</span>
        <button className="mrd-home-toast-undo" onClick=${() => {
          if (onToggleTask) onToggleTask(toast.taskId, activePersonId || "");
          setToast(null);
        }}>Annuler</button>
      </div>
    ` : null}

  `;
}

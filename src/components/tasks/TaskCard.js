import { html } from "../../lib.js";
import { getCurrentAppDate, getCurrentAppTimestamp } from "../../utils/date.js?v=2026-04-19-time-sim-2";

const URGENCY_META = {
  normal: { label: "Normale", className: "normal", score: 2 },
  urgent: { label: "Urgente", className: "urgent", score: 1 },
  deadline: { label: "A faire avant...", className: "deadline", score: 0 },
};

export function recurrenceLabel(task) {
  if (task.taskKind !== "recurring") return "Tache unique";
  if (task.recurrenceFrequency === "daily") return "Chaque jour";
  if (task.recurrenceFrequency === "weekly") return "Chaque semaine";
  return "Chaque mois";
}

export function getDueDateTime(task) {
  if (!task?.dueDate) return null;
  const dateValue = String(task.dueDate || "");
  const timeValue = String(task.dueTime || "");
  const composed = timeValue ? `${dateValue}T${timeValue}` : `${dateValue}T23:59`;
  const parsed = new Date(composed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function completedIds(task) {
  const doneBy = Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean) : [];
  if (doneBy.length) return doneBy;
  return task?.completedByPersonId ? [task.completedByPersonId] : [];
}

export function isPastDue(task) {
  if (task.priority !== "deadline" || completedIds(task).length > 0) return false;
  const dueDate = getDueDateTime(task);
  return Boolean(dueDate && dueDate.getTime() < getCurrentAppTimestamp());
}

function dueLabel(task) {
  const dueDate = getDueDateTime(task);
  if (!dueDate) return "A faire bientot";

  const now = getCurrentAppDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  if (dueDate.toDateString() === now.toDateString()) {
    return task.dueTime ? `A faire avant ${task.dueTime}` : "A faire aujourd hui";
  }
  if (dueDate.toDateString() === tomorrow.toDateString()) {
    return task.dueTime ? `A faire avant demain ${task.dueTime}` : "A faire avant demain";
  }

  const dateLabel = dueDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  return task.dueTime ? `A faire avant ${dateLabel} ${task.dueTime}` : `A faire avant ${dateLabel}`;
}

export function urgencyBadge(task) {
  if (task.priority === "deadline") {
    return {
      label: dueLabel(task),
      className: isPastDue(task) ? "deadline-past" : "deadline",
      score: URGENCY_META.deadline.score,
    };
  }
  return URGENCY_META[task.priority] || URGENCY_META.normal;
}

export function TaskCard({
  task,
  people = [],
  completers = [],
  planning = null,
  onToggleTask = () => {},
  onDeleteTask = null,
  onMoveTask = null,
  index = 0,
  listLength = 1,
  moveGroupKey = "",
  showDelete = true,
  showOrder = true,
}) {
  const doneIds = completedIds(task);
  const completedPeople = doneIds
    .map((personId) => people.find((person) => person.id === personId) || null)
    .filter(Boolean);
  const assignedPerson = people.find((person) => person.id === task.assignedPersonId) || null;
  const planningPeople = (planning?.personIds || [])
    .map((personId) => people.find((person) => person.id === personId)?.label)
    .filter(Boolean)
    .join(", ");
  const planningChildren = Array.isArray(planning?.childLabels) ? planning.childLabels.filter(Boolean).join(", ") : "";
  const planningLabel = planning
    ? planning.allDay
      ? `Planifiee : ${planning.dateKey || ""} · toute la journee`.trim()
      : `Planifiee : ${planning.dateKey || ""} ${planning.start || "09:00"} · ${planning.durationLabel || ""}`.trim()
    : "";
  const completedAtLabel = task.completedAt
    ? new Date(task.completedAt).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
  const taskUrgency = urgencyBadge(task);
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
              ${assignedPerson ? html`<div className="task-assignee">Attribuee a : ${assignedPerson.label}</div>` : null}
              ${planning ? html`<div className="task-assignee">${planningLabel}${planningPeople ? ` · ${planningPeople}` : ""}</div>` : null}
              ${planningChildren ? html`<div className="task-assignee">Enfants concernes : ${planningChildren}</div>` : null}
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
                      title=${`Marquer ${person.label} comme personne ayant fait la tache`}
                    >
                      <span className="task-person-avatar" style=${isSelected ? { background: "transparent", color: "#fff" } : { background: "#fff", color: person.color || "#8A7868" }}>
                        ${person.shortId}
                      </span>
                    </button>
                  `;
                })
              : html`<div className="mini">Ajoute une personne du foyer capable de valider les taches.</div>`}
            ${showOrder
              ? html`
                  <div className="task-order-actions">
                    <button className="task-order-btn" disabled=${index === 0} onClick=${() => onMoveTask(task.id, -1, moveGroupKey)} title="Monter">↑</button>
                    <button className="task-order-btn" disabled=${index === listLength - 1} onClick=${() => onMoveTask(task.id, 1, moveGroupKey)} title="Descendre">↓</button>
                  </div>
                `
              : null}
          </div>
          ${showDelete && onDeleteTask ? html`<button className="delbtn task-delete" onClick=${() => onDeleteTask(task.id)}>X</button>` : null}
        </div>
      </div>
    </article>
  `;
}

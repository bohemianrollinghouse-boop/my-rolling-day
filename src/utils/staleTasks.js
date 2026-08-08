// Détecte les tâches "semaine"/"mois" qui traînent sans avoir été faites,
// pour proposer une relance (modale) — cf. useStaleTaskAlerts.

const WEEKLY_SINGLE_THRESHOLD_DAYS = 6;
const MONTHLY_SINGLE_THRESHOLD_DAYS = 27;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isTaskDone(task) {
  return (Array.isArray(task?.doneBy) ? task.doneBy.filter(Boolean).length > 0 : false)
    || Boolean(task?.completedByPersonId);
}

function daysSince(isoDate, now) {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return 0;
  return (now.getTime() - then) / MS_PER_DAY;
}

/**
 * Retourne la liste des relances "tâche non faite" à afficher, la plus
 * ancienne/urgente en premier.
 * - Tâches uniques (semaine ≥6j, mois ≥27j, non faites) → { kind: "single" }
 * - Tâches récurrentes (semaine/mois) qui viennent de manquer leur cycle → { kind: "recurring" }
 */
export function getStaleTaskAlerts(tasks, now = new Date()) {
  const list = Array.isArray(tasks) ? tasks : [];
  const alerts = [];

  list.forEach((task) => {
    if (task.archived) return;
    if (task.priority === "deadline" || task.displayPeriod === "deadline") return;

    if (task.taskKind === "recurring") {
      if (task.type !== "weekly" && task.type !== "monthly") return;
      const missedCount = Number(task.missedCount) || 0;
      const lastNotified = Number(task.staleNoticeMissedCount) || 0;
      if (missedCount > lastNotified) {
        alerts.push({ taskId: task.id, kind: "recurring", period: task.type, missedCount });
      }
      return;
    }

    if (isTaskDone(task)) return;
    if (task.staleNoticeDismissedAt) return;

    if (task.type === "weekly" && daysSince(task.createdAt, now) >= WEEKLY_SINGLE_THRESHOLD_DAYS) {
      alerts.push({ taskId: task.id, kind: "single", period: "weekly" });
    } else if (task.type === "monthly" && daysSince(task.createdAt, now) >= MONTHLY_SINGLE_THRESHOLD_DAYS) {
      alerts.push({ taskId: task.id, kind: "single", period: "monthly" });
    }
  });

  return alerts;
}

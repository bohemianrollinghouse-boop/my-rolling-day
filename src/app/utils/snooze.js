// Report d'un rappel (handoff 8a) — « Plus tard » et ses trois créneaux.
//
// Le report ne vit PAS dans la session : la popup ne s'affiche que quand l'app
// est ouverte, alors qu'un rappel reporté doit revenir même app fermée. Il est
// donc écrit dans Firestore (`families/{id}/reminders`) et c'est le cron des
// Cloud Functions qui renvoie la notification push le moment venu.

/* L'ordre est celui de la feuille d'action. Un report se choisit en un tap,
   donc pas de sélecteur d'heure : trois créneaux qui couvrent les cas réels —
   « pas maintenant », « ce soir » et « demain ». */
export const SNOOZE_OPTIONS = [
  { id: "1h", label: "Dans 1 heure", toast: "dans une heure" },
  { id: "20h", label: "Ce soir à 20 h", toast: "pour ce soir à 20 h" },
  { id: "tomorrow", label: "Demain à 9 h", toast: "pour demain à 9 h" },
];

/**
 * Date d'échéance d'un report, à partir de l'heure courante de l'app.
 *
 * « Ce soir » passé 20 h n'a plus de sens : on bascule au lendemain, sinon le
 * rappel partirait dans la seconde.
 */
export function snoozeDueDate(optionId, now) {
  const base = new Date(now.getTime());

  if (optionId === "20h") {
    const tonight = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 20, 0, 0, 0);
    if (tonight.getTime() - base.getTime() > 60000) return tonight;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 20, 0, 0, 0);
  }

  if (optionId === "tomorrow") {
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 9, 0, 0, 0);
  }

  return new Date(base.getTime() + 60 * 60000);
}

// ── Qui reçoit le rappel, et qui peut le reporter ─────────────────────────
//
// Une règle, deux conséquences : le périmètre d'un rappel, ce sont les
// personnes concernées quand il y en a, sinon tout le foyer. Une tâche
// assignée est l'affaire de ses assignés ; une tâche que personne n'a prise
// est l'affaire de la maison.
//
// On ne reporte que pour un périmètre auquel on appartient — et un rappel de
// foyer, ça n'appartient à personne en particulier : seuls les admins le
// reportent, et le report repart alors à tout le foyer. La même règle est
// tenue côté serveur (`checkSnoozedReminders`) et dans `firestore.rules` : le
// bouton caché n'est qu'une commodité, ce sont les règles qui décident.

function personIdsOf(item, wholeFamilyKey, listKey, singleKey) {
  if (!item || item[wholeFamilyKey]) return [];
  const ids = Array.isArray(item[listKey]) && item[listKey].length
    ? item[listKey]
    : item[singleKey] ? [item[singleKey]] : [];
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

/* Une personne sans compte lié n'a pas de téléphone à notifier. Si AUCUN des
   assignés n'en a un (une tâche confiée aux enfants, par exemple), le rappel
   ne peut atteindre personne en propre : le foyer reprend la main — sinon le
   rappel arriverait bien à tout le monde côté serveur, mais plus personne
   n'aurait le droit de le reporter. Le serveur applique la même bascule
   (`tokensForTask`). */
function withLinkedAccount(personIds, people) {
  if (!Array.isArray(people) || people.length === 0) return personIds;
  return personIds.filter((id) => {
    const person = people.find((item) => item.id === id);
    return Boolean(person && String(person.linkedAccountId || "").trim());
  });
}

export function reminderAudience(notification, { tasks = [], agenda = [], people = [] } = {}) {
  const { notifType = "", taskId = "", eventId = "" } = notification || {};

  /* Le récapitulatif de fin de journée couvre toutes les tâches du jour : il
     est par nature une affaire de foyer, même si certaines sont assignées. */
  if (notifType !== "end-of-day") {
    if (eventId) {
      const event = agenda.find((item) => item.id === eventId);
      const ids = withLinkedAccount(personIdsOf(event, "wholeFamily", "personIds", "personId"), people);
      if (ids.length) return { scope: "person", personIds: ids };
    } else if (taskId) {
      const task = tasks.find((item) => item.id === taskId);
      const ids = withLinkedAccount(
        personIdsOf(task, "assignedWholeFamily", "assignedPersonIds", "assignedPersonId"),
        people,
      );
      if (ids.length) return { scope: "person", personIds: ids };
    }
  }

  return { scope: "household", personIds: [] };
}

export function canSnoozeReminder(audience, { personId = "", role = "" } = {}) {
  if (!audience) return false;
  if (audience.scope === "household") return role === "admin";
  return Boolean(personId) && audience.personIds.includes(personId);
}

/**
 * Une tâche concerne-t-elle cette personne ?
 *
 * Sert au chemin local (`useTaskNotifications`), qui rejoue les mêmes rappels
 * quand l'app est au premier plan : sans ce filtre, une tâche assignée
 * s'afficherait quand même chez les autres — le serveur ne la leur envoie pas.
 */
export function taskConcernsPerson(task, personId) {
  const ids = personIdsOf(task, "assignedWholeFamily", "assignedPersonIds", "assignedPersonId");
  return ids.length === 0 || (Boolean(personId) && ids.includes(personId));
}

// Normalisation des charges utiles de notification.
//
// Deux formes arrivent à la popup in-app :
//  - les notifications locales (useTaskNotifications.js, AgendaView.js) sont
//    déjà à plat : { title, body, notifType, taskId, eventId, tab } ;
//  - les push FCM arrivent enveloppées : { notification: { title, body }, data }
//    où `data.type` porte le genre de notification côté serveur.
//
// `NotificationModal` et la navigation depuis la popup lisent la forme à plat.
// Sans cette traduction, un push reçu app ouverte affiche une modale au titre
// vide et sans bouton « Voir ». On normalise donc au point d'entrée.

// data.type (functions/index.js) → notifType/tab attendus par la popup
const PUSH_TYPE_MAP = {
  agenda: { notifType: "event", tab: "agenda" },
  agenda_recurring: { notifType: "event", tab: "agenda" },
  task_endofday: { notifType: "end-of-day", tab: "daily" },
  task_urgent: { notifType: "urgent", tab: "daily" },
  task_due: { notifType: "due", tab: "daily" },
  task_weekly_overdue: { notifType: "due", tab: "weekly" },
  task_created: { notifType: "task", tab: "daily" },
  task_assigned: { notifType: "task", tab: "daily" },
  member_joined: { notifType: "general", tab: "home" },
};

/**
 * Ramène une charge utile de notification à la forme plate que consomment
 * `NotificationModal` et `handleNotifPopupNavigate`. Une charge déjà à plat
 * est renvoyée telle quelle.
 */
export function normalizeNotificationPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (!payload.notification || typeof payload.notification !== "object") return payload;

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const mapped = PUSH_TYPE_MAP[String(data.type || "").trim()] || { notifType: "general", tab: "home" };

  return {
    title: payload.notification.title || data.title || "",
    body: payload.notification.body || data.body || "",
    notifType: mapped.notifType,
    tab: mapped.tab,
    taskId: String(data.taskId || ""),
    eventId: String(data.eventId || ""),
    personId: String(data.personId || ""),
    pushType: String(data.type || ""),
  };
}

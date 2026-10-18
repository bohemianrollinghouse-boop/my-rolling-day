// Catalogue de toutes les notifications que l'app peut émettre.
//
// Sert de source unique à la console développeur (Réglages → « Console
// notifications », réservée au compte dev) : chaque entrée décrit ce qui
// déclenche la notification en vrai, et porte un exemple de charge utile
// identique à celle produite par le code de production.
//
// ⚠️ Deux canaux distincts, à ne pas confondre :
//  - "local" : construit dans le client et affiché par plugins/notifications.js
//    (useTaskNotifications.js, AgendaView.js) ;
//  - "push"  : construit par les Cloud Functions (functions/index.js) et envoyé
//    via FCM. La popup in-app reçoit alors la charge utile FCM brute
//    ({ notification: { title, body }, data }), pas un objet aplati.
//
// Quand un texte de notification change dans le code de prod, mettre à jour
// l'entrée correspondante ici : c'est ce catalogue qui documente l'inventaire.

const SAMPLE_TASK = "Sortir les poubelles";
const SAMPLE_TASK_WEEKLY = "Ranger le garage";
const SAMPLE_EVENT = "Rendez-vous dentiste";
const SAMPLE_TIME = "18:30";
const SAMPLE_TASK_ID = "demo-task-1";
const SAMPLE_EVENT_ID = "demo-event-1";

const SAMPLE_TASKS = [
  { id: "demo-task-1", text: SAMPLE_TASK },
  { id: "demo-task-2", text: "Ranger la cuisine" },
  { id: "demo-task-3", text: "Sortir le chien" },
];

export const NOTIFICATION_CATALOG = [
  {
    id: "local-tasks",
    label: "Tâches — rappels locaux",
    source: "src/app/hooks/useTaskNotifications.js",
    hint: "Vérifiés toutes les 60 s et à chaque retour au premier plan, sur cet appareil.",
    items: [
      {
        id: "local-task-endofday",
        icon: "🌙",
        channel: "local",
        label: "Rappel de fin de journée",
        trigger: "À l'heure de fin de journée, s'il reste des tâches du jour non faites. Réglage « Rappel fin de journée ».",
        title: `Il vous reste ${SAMPLE_TASKS.length} tâches avant la fin de journée`,
        body: "",
        data: { notifType: "end-of-day", tab: "daily", tasks: SAMPLE_TASKS },
      },
      {
        id: "local-task-urgent",
        icon: "⚠️",
        channel: "local",
        label: "Tâche urgente non faite",
        trigger: "Une fois par jour et par tâche marquée urgente ou critique, tant qu'elle n'est pas faite. Réglage « Tâches urgentes ».",
        title: `Urgent : « ${SAMPLE_TASK} » n'est pas faite`,
        body: "",
        data: { notifType: "urgent", taskId: SAMPLE_TASK_ID, tab: "daily" },
      },
      {
        id: "local-task-due-at-time",
        icon: "⏰",
        channel: "local",
        label: "Échéance — à l'heure dite",
        trigger: "Rappel « at_time » : à l'heure d'échéance de la tâche, ou à l'heure de fin de journée si la tâche n'a pas d'heure.",
        title: `À faire maintenant : ${SAMPLE_TASK}`,
        body: "",
        variant: `Sans heure d'échéance : « À faire aujourd'hui : ${SAMPLE_TASK} »`,
        data: { notifType: "due", taskId: SAMPLE_TASK_ID, tab: "daily" },
      },
      {
        id: "local-task-due-1h",
        icon: "⏳",
        channel: "local",
        label: "Échéance — 1 h avant",
        trigger: "Rappel « 1h_before » : une heure avant l'échéance de la tâche.",
        title: `À faire avant ${SAMPLE_TIME} : ${SAMPLE_TASK}`,
        body: "",
        variant: `Sans heure d'échéance : « Rappel dans 1h : ${SAMPLE_TASK} »`,
        data: { notifType: "due", taskId: SAMPLE_TASK_ID, tab: "daily" },
      },
      {
        id: "local-task-due-30m",
        icon: "⏳",
        channel: "local",
        label: "Échéance — 30 min ou délai personnalisé",
        trigger: "Rappels « 30m_before » et « custom_before » : N minutes avant l'échéance (15 min par défaut si la valeur personnalisée est invalide).",
        title: `À faire avant ${SAMPLE_TIME} : ${SAMPLE_TASK}`,
        body: "",
        variant: `Sans heure d'échéance : « Rappel dans 30 min : ${SAMPLE_TASK} »`,
        data: { notifType: "due", taskId: SAMPLE_TASK_ID, tab: "daily" },
      },
      {
        id: "local-task-due-day-before",
        icon: "📆",
        channel: "local",
        label: "Échéance — la veille",
        trigger: "Rappel « day_before » : 24 h avant l'échéance de la tâche.",
        title: `Demain : tâche à terminer — ${SAMPLE_TASK}`,
        body: "",
        data: { notifType: "due", taskId: SAMPLE_TASK_ID, tab: "daily" },
      },
    ],
  },
  {
    id: "local-agenda",
    label: "Agenda — rappel local",
    source: "src/app/pages/agenda/AgendaView.js",
    hint: "Émis pendant que l'app est ouverte sur cet appareil.",
    items: [
      {
        id: "local-agenda-event",
        icon: "🗓️",
        channel: "local",
        label: "Rappel d'événement",
        trigger: "Au délai choisi sur l'événement (« minutesBefore »), quand sa notification est activée.",
        title: `🗓️ ${SAMPLE_EVENT} — dans 30 min`,
        body: "Ne pas oublier la carte vitale",
        variant: "Délai 0 min : « … — maintenant ». Délai 60 min : « … — dans 1h ». Le corps reprend le message personnalisé de l'événement, vide s'il n'y en a pas.",
        data: { notifType: "event", eventId: SAMPLE_EVENT_ID, tab: "agenda" },
      },
    ],
  },
  {
    id: "push-tasks",
    label: "Push serveur — tâches",
    source: "functions/index.js",
    hint: "Envoyées par les Cloud Functions même quand l'app est fermée. Le planificateur tourne toutes les 5 minutes.",
    items: [
      {
        id: "push-task-endofday",
        icon: "🌙",
        channel: "push",
        label: "Rappel de fin de journée",
        trigger: "Pendant le passage de 5 min qui couvre l'heure de fin de journée, si le client ne l'a pas déjà envoyé.",
        title: `Il vous reste ${SAMPLE_TASKS.length} tâches avant la fin de journée`,
        body: SAMPLE_TASKS.map((task) => `• ${task.text}`).join("\n"),
        variant: "Le corps liste au maximum les 3 premières tâches non faites.",
        data: { type: "task_endofday" },
      },
      {
        id: "push-task-urgent",
        icon: "⚠️",
        channel: "push",
        label: "Tâche urgente non faite",
        trigger: "Une fois par jour et par tâche urgente ou critique non faite.",
        title: `Urgent : ${SAMPLE_TASK}`,
        body: "Cette tâche n'est pas encore faite",
        data: { type: "task_urgent", taskId: SAMPLE_TASK_ID },
      },
      {
        id: "push-task-due",
        icon: "📅",
        channel: "push",
        label: "Tâche avec échéance",
        trigger: "Au rappel choisi sur la tâche : heure dite, 1 h, 30 min, délai personnalisé ou la veille.",
        title: `À faire avant ${SAMPLE_TIME} : ${SAMPLE_TASK}`,
        body: "",
        variant: "Mêmes libellés que les rappels d'échéance locaux, corps vide.",
        data: { type: "task_due", taskId: SAMPLE_TASK_ID },
      },
      {
        id: "push-task-weekly-overdue",
        icon: "📆",
        channel: "push",
        label: "Tâche de la semaine en attente",
        trigger: "Une seule fois, quand une tâche hebdomadaire non récurrente a plus de 3 jours et n'est toujours pas faite.",
        title: `🧺 ${SAMPLE_TASK_WEEKLY}`,
        body: "Cette tâche de la semaine n'a pas encore été faite (3 jours)",
        variant: "Le titre est l'icône puis le texte de la tâche ; sans icône, le texte seul.",
        data: { type: "task_weekly_overdue", taskId: "demo-task-weekly" },
      },
      {
        id: "push-task-created",
        icon: "✨",
        channel: "push",
        label: "Nouvelle tâche créée",
        trigger: "À l'écriture d'une tâche dans le planner du foyer — envoyée à tous les membres.",
        title: "🧺 Nouvelle tâche",
        body: SAMPLE_TASK_WEEKLY,
        variant: "Sans icône sur la tâche : titre « Nouvelle tâche ».",
        data: { type: "task_created", taskId: "demo-task-weekly" },
      },
      {
        id: "push-task-assigned",
        icon: "🙋",
        channel: "push",
        label: "Tâche assignée",
        trigger: "Quand une personne est ajoutée aux assignés d'une tâche — envoyée à elle seule, si son profil est relié à un compte.",
        title: "Nouvelle tâche assignée",
        body: SAMPLE_TASK,
        data: { type: "task_assigned", taskId: SAMPLE_TASK_ID, personId: "demo-person-1" },
      },
    ],
  },
  {
    id: "push-agenda",
    label: "Push serveur — agenda",
    source: "functions/index.js",
    hint: "Le titre est le texte brut de l'événement, sans son icône.",
    items: [
      {
        id: "push-agenda-event",
        icon: "🗓️",
        channel: "push",
        label: "Événement ponctuel",
        trigger: "Au délai choisi sur l'événement, si le client ne l'a pas déjà notifié.",
        title: SAMPLE_EVENT,
        body: "Dans 30 min",
        variant: "Délai 0 : « C'est maintenant ». Événement d'un autre jour : la date est ajoutée entre parenthèses.",
        data: { type: "agenda", eventId: SAMPLE_EVENT_ID },
      },
      {
        id: "push-agenda-recurring",
        icon: "🔁",
        channel: "push",
        label: "Événement récurrent",
        trigger: "Même règle, pour les événements qui se répètent chaque semaine.",
        title: "Sport",
        body: "C'est maintenant",
        variant: "Délai supérieur à 0 : « Dans N min ».",
        data: { type: "agenda_recurring", eventId: "demo-event-recur" },
      },
    ],
  },
  {
    id: "push-household",
    label: "Push serveur — foyer",
    source: "functions/index.js",
    hint: "Déclenchée par un événement du foyer, hors planificateur.",
    items: [
      {
        id: "push-member-joined",
        icon: "🏠",
        channel: "push",
        label: "Nouveau membre",
        trigger: "Quand quelqu'un rejoint le foyer avec un code d'invitation — envoyée à tous les membres sauf l'arrivant.",
        title: "Nouveau membre 🏠",
        body: "Camille a bien rejoint votre foyer via son code d'invitation.",
        data: { type: "member_joined" },
      },
    ],
  },
];

// ── Modales de rappel ──────────────────────────────────────────────────────
//
// Les fenêtres qui s'ouvrent *à la suite* d'une notification, par opposition
// aux notifications elles-mêmes. Deux composants seulement, mais plusieurs
// rendus selon la charge utile — c'est cette liste que présente la feuille
// d'actions « Modales de rappel » de la page Admin.
//
//  - NotificationModal : ouverte au clic sur une notification, ou directement
//    quand un push arrive app ouverte.
//  - StaleTaskModal : relance d'une tâche semaine/mois restée non faite. Elle
//    ne vient pas d'un clic sur notification, elle s'ouvre d'elle-même au
//    retour dans l'app ; c'est le même geste de rappel, d'où sa présence ici.

const LONG_TASK_LIST = [
  ...SAMPLE_TASKS,
  { id: "demo-task-4", text: "Arroser les plantes" },
  { id: "demo-task-5", text: "Passer l'aspirateur" },
  { id: "demo-task-6", text: "Lancer une machine" },
  { id: "demo-task-7", text: "Trier le courrier" },
  { id: "demo-task-8", text: "Préparer le sac de sport" },
  { id: "demo-task-9", text: "Appeler le vétérinaire" },
];

export const REMINDER_MODAL_CATALOG = [
  {
    id: "modal-event",
    icon: "🗓️",
    label: "Rappel d'événement",
    component: "NotificationModal",
    hint: "Bouton « Voir l'événement » — bascule sur l'agenda.",
    kind: "notification",
    payload: {
      title: `🗓️ ${SAMPLE_EVENT} — dans 30 min`,
      body: "Ne pas oublier la carte vitale",
      notifType: "event",
      eventId: SAMPLE_EVENT_ID,
      tab: "agenda",
    },
  },
  {
    id: "modal-endofday",
    icon: "🌙",
    label: "Fin de journée — 3 tâches restantes",
    component: "NotificationModal",
    hint: "Liste les tâches restantes, puis « Voir les tâches ».",
    kind: "notification",
    payload: {
      title: `Il vous reste ${SAMPLE_TASKS.length} tâches avant la fin de journée`,
      body: "",
      notifType: "end-of-day",
      tab: "daily",
      tasks: SAMPLE_TASKS,
    },
  },
  {
    id: "modal-endofday-long",
    icon: "🌙",
    label: "Fin de journée — 9 tâches (liste coupée)",
    component: "NotificationModal",
    hint: "Au-delà de 6 tâches, la modale coupe et affiche « et N autres… ».",
    kind: "notification",
    payload: {
      title: `Il vous reste ${LONG_TASK_LIST.length} tâches avant la fin de journée`,
      body: "",
      notifType: "end-of-day",
      tab: "daily",
      tasks: LONG_TASK_LIST,
    },
  },
  {
    id: "modal-urgent",
    icon: "⚠️",
    label: "Tâche urgente non faite",
    component: "NotificationModal",
    hint: "Bouton « Voir les tâches ».",
    kind: "notification",
    payload: {
      title: `Urgent : « ${SAMPLE_TASK} » n'est pas faite`,
      body: "",
      notifType: "urgent",
      taskId: SAMPLE_TASK_ID,
      tab: "daily",
    },
  },
  {
    id: "modal-due",
    icon: "📅",
    label: "Tâche avec échéance",
    component: "NotificationModal",
    hint: "Corps de texte rempli + bouton de navigation.",
    kind: "notification",
    payload: {
      title: `À faire avant ${SAMPLE_TIME} : ${SAMPLE_TASK}`,
      body: "Cette tâche n'est pas encore faite",
      notifType: "due",
      taskId: SAMPLE_TASK_ID,
      tab: "daily",
    },
  },
  {
    id: "modal-plain",
    icon: "🏠",
    label: "Nouveau membre du foyer",
    component: "NotificationModal",
    hint: "Aucune cible à ouvrir : seul le bouton « Fermer » s'affiche.",
    kind: "notification",
    payload: {
      title: "Nouveau membre 🏠",
      body: "Camille a bien rejoint votre foyer via son code d'invitation.",
      notifType: "general",
      tab: "home",
    },
  },
  {
    id: "modal-stale-weekly",
    icon: "⏳",
    label: "Relance : tâche de la semaine oubliée",
    component: "StaleTaskModal",
    hint: "Deux boutons : « Ignorer » et « Ajouter à la tâche quotidienne ».",
    kind: "staleTask",
    task: { id: "demo-stale-1", text: SAMPLE_TASK_WEEKLY, icon: "🧺", type: "weekly" },
    alert: { taskId: "demo-stale-1", kind: "single", period: "weekly" },
  },
  {
    id: "modal-stale-monthly",
    icon: "🗓️",
    label: "Relance : tâche du mois oubliée",
    component: "StaleTaskModal",
    hint: "Trois boutons : « Ignorer », « Passer à la semaine », « Passer au jour ».",
    kind: "staleTask",
    task: { id: "demo-stale-2", text: "Nettoyer les vitres", icon: "🪟", type: "monthly" },
    alert: { taskId: "demo-stale-2", kind: "single", period: "monthly" },
  },
  {
    id: "modal-stale-recurring",
    icon: "🔁",
    label: "Relance : tâche récurrente ratée 3 fois",
    component: "StaleTaskModal",
    hint: "Compte les cycles manqués, un seul bouton « Compris ».",
    kind: "staleTask",
    task: { id: "demo-stale-3", text: "Sortir les poubelles", icon: "🗑️", type: "weekly" },
    alert: { taskId: "demo-stale-3", kind: "recurring", period: "weekly", missedCount: 3 },
  },
];

/** Nombre total d'entrées du catalogue. */
export function countCatalogNotifications() {
  return NOTIFICATION_CATALOG.reduce((total, group) => total + group.items.length, 0);
}

/** Toutes les entrées à plat, dans l'ordre d'affichage. */
export function flattenCatalogNotifications() {
  return NOTIFICATION_CATALOG.flatMap((group) =>
    group.items.map((item) => ({ ...item, groupId: group.id, groupLabel: group.label })),
  );
}

/**
 * Charge utile de la popup in-app, dans la forme exacte que reçoit
 * `setNotifPopup` en production : objet aplati pour les notifications locales,
 * enveloppe FCM brute pour les push serveur.
 */
export function buildPopupPayload(item) {
  if (!item) return null;
  if (item.channel === "push") {
    return {
      notification: { title: item.title, body: item.body || "" },
      data: { ...(item.data || {}) },
    };
  }
  return { title: item.title, body: item.body || "", ...(item.data || {}) };
}

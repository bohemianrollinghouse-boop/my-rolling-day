/**
 * Cloud Function — notifications push planifiées (toutes les 5 minutes)
 *
 * Lit chaque famille dans Firestore, vérifie les événements agenda
 * et les tâches qui doivent déclencher une notification maintenant,
 * puis envoie via FCM Admin SDK.
 *
 * Anti-spam : families/{id}/serverNotificationLog/{key}
 * Les clés expirent après 3 jours (nettoyage automatique à chaque run).
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// ---------------------------------------------------------------------------
// Temps Paris — "naïf" : les heures/minutes des events sont en heure locale
// française, on construit un objet Date avec les mêmes valeurs pour comparer.
// ---------------------------------------------------------------------------
function nowInParis() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "00";
  // Construit une Date "naïve locale" — pas de décalage TZ appliqué
  return new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`
  );
}

function localDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Fenêtre de 5 minutes = durée du schedule (évite les notifications manquées ou doublées)
function isWithinWindow(nowMs, targetMs) {
  return Math.abs(nowMs - targetMs) <= 5 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Tokens FCM
// ---------------------------------------------------------------------------
async function getFamilyTokens(familyId, memberUids) {
  const tokens = [];
  const seen = new Set();

  await Promise.all(
    memberUids.map(async (uid) => {
      const snap = await db
        .collection("users").doc(uid)
        .collection("messagingTokens")
        .where("permission", "==", "granted")
        .get();
      snap.forEach((doc) => {
        const { token } = doc.data();
        if (token && !seen.has(token)) {
          seen.add(token);
          tokens.push({ uid, docId: doc.id, token });
        }
      });
    })
  );

  return tokens;
}

async function cleanInvalidTokens(tokenEntries) {
  await Promise.all(
    tokenEntries.map(({ uid, docId }) =>
      db.collection("users").doc(uid).collection("messagingTokens").doc(docId).delete()
    )
  );
}

// ---------------------------------------------------------------------------
// Anti-spam côté serveur
// ---------------------------------------------------------------------------
async function isAlreadySent(familyId, key) {
  const snap = await db
    .collection("families").doc(familyId)
    .collection("serverNotificationLog").doc(key)
    .get();
  return snap.exists;
}

async function markAsSent(familyId, key) {
  await db
    .collection("families").doc(familyId)
    .collection("serverNotificationLog").doc(key)
    .set({ sentAt: FieldValue.serverTimestamp(), key });
}

async function cleanOldLogs(familyId) {
  const cutoff = Timestamp.fromDate(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
  const snap = await db
    .collection("families").doc(familyId)
    .collection("serverNotificationLog")
    .where("sentAt", "<", cutoff)
    .limit(50)
    .get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}

// ---------------------------------------------------------------------------
// Envoi FCM multicast
// ---------------------------------------------------------------------------
async function sendToFamily(tokens, title, body, data = {}) {
  if (tokens.length === 0) return;

  const stringData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v)])
  );

  const result = await messaging.sendEachForMulticast({
    notification: { title, body: body || "" },
    data: stringData,
    tokens: tokens.map((t) => t.token),
    webpush: {
      notification: { icon: "/icon-192.png", badge: "/icon-192.png" },
      fcmOptions: { link: "/" },
    },
  });

  const toClean = [];
  result.responses.forEach((resp, idx) => {
    if (!resp.success) {
      const code = resp.error?.code || "";
      if (
        code === "messaging/invalid-registration-token" ||
        code === "messaging/registration-token-not-registered"
      ) {
        toClean.push(tokens[idx]);
      }
    }
  });
  if (toClean.length > 0) await cleanInvalidTokens(toClean);
}

// Extrait le timestamp de création depuis un ID au format "task-{timestamp}"
function extractTimestampFromId(id) {
  const match = String(id || "").match(/^[a-z]+-(\d+)/);
  if (!match) return NaN;
  const ts = Number(match[1]);
  return isFinite(ts) && ts > 0 ? ts : NaN;
}

function taskAssignedPersonIds(task) {
  const ids = Array.isArray(task?.assignedPersonIds) && task.assignedPersonIds.length
    ? task.assignedPersonIds
    : task?.assignedPersonId ? [task.assignedPersonId] : [];
  return [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
}

async function getPeopleById(familyId) {
  const snap = await db
    .collection("families").doc(familyId)
    .collection("people")
    .get();
  const peopleById = new Map();
  snap.forEach((doc) => {
    peopleById.set(doc.id, { id: doc.id, ...doc.data() });
  });
  return peopleById;
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------
async function checkAgendaForFamily(familyId, agenda, recurringEvents, tokens, nowParis) {
  const nowMs = nowParis.getTime();
  const todayKey = localDateKey(nowParis);

  // ── Événements ponctuels ────────────────────────────────────────────────
  if (Array.isArray(agenda)) {
    for (const event of agenda) {
      if (!event?.notification?.enabled) continue;
      if (!event.dateKey || !event.start) continue;

      const minutesBefore = Math.max(0, Number(event.notification.minutesBefore) || 0);
      const eventTime = new Date(`${event.dateKey}T${event.start}`);
      if (isNaN(eventTime.getTime())) continue;

      const notifyAt = new Date(eventTime.getTime() - minutesBefore * 60 * 1000);
      if (!isWithinWindow(nowMs, notifyAt.getTime())) continue;

      const key = `srv-agenda-${event.id}-${event.dateKey}-${event.start}-${minutesBefore}`;
      if (await isAlreadySent(familyId, key)) continue;

      const isSameDay = event.dateKey === todayKey;
      const body = minutesBefore > 0
        ? `Dans ${minutesBefore} min${!isSameDay ? ` (${event.dateKey})` : ""}`
        : `C'est maintenant${!isSameDay ? ` (${event.dateKey})` : ""}`;

      await sendToFamily(tokens, event.text, body, { type: "agenda", eventId: event.id });
      await markAsSent(familyId, key);
      console.log(`[agenda] ponctuel notif : ${event.text} (famille ${familyId})`);
    }
  }

  // ── Événements récurrents ───────────────────────────────────────────────
  if (Array.isArray(recurringEvents)) {
    const todayWeekday = nowParis.getDay();   // 0=dim, 1=lun, …, 6=sam
    const todayDayOfMonth = nowParis.getDate();

    for (const event of recurringEvents) {
      if (!event?.notification?.enabled) continue;
      if (!event.start) continue;

      // Ne pas notifier avant la date de début
      if (event.startDateKey && todayKey < event.startDateKey) continue;

      // L'événement se produit-il aujourd'hui ?
      const recType = event.recurrenceType || "weekly";
      let occursToday = false;
      if (recType === "daily") {
        occursToday = true;
      } else if (recType === "monthly") {
        const dom = event.dayOfMonth != null
          ? Number(event.dayOfMonth)
          : event.dateKey ? new Date(`${event.dateKey}T00:00`).getDate() : null;
        occursToday = dom != null && todayDayOfMonth === dom;
      } else {
        // weekly (défaut)
        occursToday = Number(event.weekday) === todayWeekday;
      }
      if (!occursToday) continue;

      const minutesBefore = Math.max(0, Number(event.notification.minutesBefore) || 0);
      const eventTime = new Date(`${todayKey}T${event.start}`);
      if (isNaN(eventTime.getTime())) continue;

      const notifyAt = new Date(eventTime.getTime() - minutesBefore * 60 * 1000);
      if (!isWithinWindow(nowMs, notifyAt.getTime())) continue;

      const key = `srv-recur-${event.id}-${todayKey}-${event.start}-${minutesBefore}`;
      if (await isAlreadySent(familyId, key)) continue;

      const body = minutesBefore > 0 ? `Dans ${minutesBefore} min` : "C'est maintenant";

      await sendToFamily(tokens, event.text, body, { type: "agenda_recurring", eventId: event.id });
      await markAsSent(familyId, key);
      console.log(`[agenda] récurrent notif : ${event.text} (famille ${familyId})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Tâches
// ---------------------------------------------------------------------------
function isTaskDone(task) {
  return (
    (Array.isArray(task.doneBy) && task.doneBy.filter(Boolean).length > 0) ||
    Boolean(task.completedByPersonId)
  );
}

function getTaskReminder(task) {
  const r = String(task?.notification?.reminder || "").trim();
  if (["none", "at_time", "1h_before", "30m_before", "custom_before", "day_before"].includes(r)) return r;
  return "none";
}

function getTaskReminderMinutes(task, reminder) {
  if (reminder === "1h_before") return 60;
  if (reminder === "30m_before") return 30;
  if (reminder === "custom_before") {
    const minutes = Number(task?.notification?.customMinutes);
    return isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 15;
  }
  return 0;
}

async function checkTasksForFamily(familyId, tasks, settings, tokens, nowParis) {
  if (!settings?.enabled) return;
  if (!Array.isArray(tasks) || tasks.length === 0) return;

  const nowMs = nowParis.getTime();
  const todayKey = localDateKey(nowParis);
  const [eodH, eodM] = String(settings.endOfDayTime || "18:00").split(":").map(Number);
  const safeEodH = isFinite(eodH) ? eodH : 18;
  const safeEodM = isFinite(eodM) ? eodM : 0;

  // 1. Rappel fin de journée — toutes les tâches du jour non faites
  if (settings.endOfDay) {
    const eodTarget = new Date(nowParis);
    eodTarget.setHours(safeEodH, safeEodM, 0, 0);

    if (isWithinWindow(nowMs, eodTarget.getTime())) {
      const key = `srv-foyer-endofday-${todayKey}`;
      if (!(await isAlreadySent(familyId, key))) {
        // Tâches du jour : récurrentes quotidiennes + tâches dont l'échéance est aujourd'hui
        const undone = tasks.filter(
          (t) => !isTaskDone(t) && (t.type === "daily" || t.dueDate === todayKey)
        );
        if (undone.length > 0) {
          const n = undone.length;
          const body = undone
            .slice(0, 3)
            .map((t) => `• ${t.text}`)
            .join("\n");
          await sendToFamily(
            tokens,
            `Il vous reste ${n} tâche${n > 1 ? "s" : ""} avant la fin de journée`,
            body,
            { type: "task_endofday" }
          );
          await markAsSent(familyId, key);
          console.log(`[tasks] fin de journée : ${n} tâche(s) (famille ${familyId})`);
        }
      }
    }
  }

  // 2. Tâches urgentes (max 1 notif par tâche par jour)
  if (settings.urgent) {
    for (const task of tasks) {
      if (task.priority !== "urgent" && !task.critical) continue;
      if (isTaskDone(task)) continue;
      const key = `srv-${task.id}-urgent-${todayKey}`;
      if (await isAlreadySent(familyId, key)) continue;
      await sendToFamily(
        tokens,
        `Urgent : ${task.text}`,
        "Cette tâche n'est pas encore faite",
        { type: "task_urgent", taskId: String(task.id) }
      );
      await markAsSent(familyId, key);
      console.log(`[tasks] urgent : ${task.text} (famille ${familyId})`);
    }
  }

  // 3. Tâches avec échéance + rappel configuré
  if (settings.due) {
    for (const task of tasks) {
      if (!task?.dueDate) continue;
      if (isTaskDone(task)) continue;

      const reminder = getTaskReminder(task);
      if (reminder === "none") continue;

      const baseDue = new Date(`${task.dueDate}T00:00`);
      if (isNaN(baseDue.getTime())) continue;

      const [dueH, dueM] = task.dueTime
        ? String(task.dueTime).split(":").map(Number)
        : [safeEodH, safeEodM];

      const dueAt = new Date(baseDue);
      dueAt.setHours(isFinite(dueH) ? dueH : 18, isFinite(dueM) ? dueM : 0, 0, 0);

      let notifyAt, key, title;

      if (reminder === "at_time") {
        notifyAt = dueAt;
        key = `srv-${task.id}-due-at-${task.dueDate}-${task.dueTime || "endofday"}`;
        title = task.dueTime
          ? `À faire maintenant : ${task.text}`
          : `À faire aujourd'hui : ${task.text}`;
      } else if (reminder === "1h_before") {
        notifyAt = new Date(dueAt.getTime() - 60 * 60_000);
        key = `srv-${task.id}-due-1h-${task.dueDate}-${task.dueTime || "endofday"}`;
        title = task.dueTime
          ? `À faire avant ${task.dueTime} : ${task.text}`
          : `Rappel dans 1h : ${task.text}`;
      } else if (reminder === "30m_before" || reminder === "custom_before") {
        const minutes = getTaskReminderMinutes(task, reminder);
        notifyAt = new Date(dueAt.getTime() - minutes * 60_000);
        key = `srv-${task.id}-due-${minutes}m-${task.dueDate}-${task.dueTime || "endofday"}`;
        title = task.dueTime
          ? `À faire avant ${task.dueTime} : ${task.text}`
          : `Rappel dans ${minutes} min : ${task.text}`;
      } else {
        notifyAt = new Date(dueAt.getTime() - 24 * 60 * 60_000);
        key = `srv-${task.id}-due-eve-${task.dueDate}-${task.dueTime || "endofday"}`;
        title = `Demain : tâche à terminer — ${task.text}`;
      }

      if (!isWithinWindow(nowMs, notifyAt.getTime())) continue;
      if (await isAlreadySent(familyId, key)) continue;

      await sendToFamily(tokens, title, "", { type: "task_due", taskId: String(task.id) });
      await markAsSent(familyId, key);
      console.log(`[tasks] échéance : ${task.text} (famille ${familyId})`);
    }
  }

  // 4. Tâches hebdomadaires simples non effectuées depuis 3 jours
  if (settings.weeklyReminder !== false) {
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
    for (const task of tasks) {
      if (task.type !== "weekly") continue;
      if (task.taskKind === "recurring") continue;
      if (isTaskDone(task)) continue;

      const createdTs = extractTimestampFromId(task.id);
      if (!isFinite(createdTs)) continue;

      const ageMs = nowParis.getTime() - createdTs;
      if (ageMs < threeDaysMs) continue;

      const key = `srv-task-weekly-3d-${task.id}`;
      if (await isAlreadySent(familyId, key)) continue;

      const icon = String(task.icon || "").trim();
      const title = icon ? `${icon} ${task.text}` : task.text;
      const body = "Cette tâche de la semaine n'a pas encore été faite (3 jours)";

      await sendToFamily(
        tokens,
        title,
        body,
        { type: "task_weekly_overdue", taskId: String(task.id) }
      );
      await markAsSent(familyId, key);
      console.log(`[tasks] hebdo 3j non faite : ${task.text} (famille ${familyId})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Fonction principale — toutes les 5 minutes
// ---------------------------------------------------------------------------
exports.sendScheduledNotifications = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "Europe/Paris",
    region: "europe-west1",
    memory: "256MiB",
    timeoutSeconds: 120,
  },
  async () => {
    const nowParis = nowInParis();
    console.log(`[notifications] Démarrage — heure Paris : ${nowParis.toISOString()}`);

    const familiesSnap = await db.collection("families").get();
    console.log(`[notifications] ${familiesSnap.size} famille(s) à traiter`);

    for (const familyDoc of familiesSnap.docs) {
      const familyId = familyDoc.id;

      try {
        // Planner state
        const plannerSnap = await db
          .collection("families").doc(familyId)
          .collection("planner").doc("state")
          .get();
        if (!plannerSnap.exists) continue;

        const plannerData = plannerSnap.data()?.data;
        if (!plannerData) continue;

        const { agenda = [], recurringEvents = [], tasks = [], taskNotifications } = plannerData;

        // Membres
        const membersSnap = await db
          .collection("families").doc(familyId)
          .collection("members")
          .get();
        const memberUids = membersSnap.docs.map((d) => d.id);
        if (memberUids.length === 0) continue;

        // Tokens FCM
        const tokens = await getFamilyTokens(familyId, memberUids);
        if (tokens.length === 0) continue;

        // Nettoyage anti-spam expiré
        await cleanOldLogs(familyId);

        // Vérifications
        await checkAgendaForFamily(familyId, agenda, recurringEvents, tokens, nowParis);
        await checkTasksForFamily(familyId, tasks, taskNotifications, tokens, nowParis);

      } catch (err) {
        console.error(`[notifications] Erreur famille ${familyId} :`, err);
      }
    }

    console.log("[notifications] Terminé.");
  }
);

// ---------------------------------------------------------------------------
// Notification : quelqu'un rejoint le foyer
// ---------------------------------------------------------------------------
exports.onMemberJoined = onDocumentCreated(
  "families/{familyId}/joinEvents/{eventId}",
  async (event) => {
    const { familyId } = event.params;
    const data = event.data?.data();
    if (!data) return;

    const { joinerUid, joinerName } = data;
    const displayName = joinerName || "Quelqu'un";

    const membersSnap = await db
      .collection("families").doc(familyId)
      .collection("members")
      .get();

    const memberUids = membersSnap.docs
      .map((d) => d.id)
      .filter((uid) => uid !== joinerUid);

    if (memberUids.length === 0) return;

    const tokens = await getFamilyTokens(familyId, memberUids);
    if (tokens.length === 0) return;

    await sendToFamily(
      tokens,
      "Nouveau membre 🏠",
      `${displayName} a bien rejoint votre foyer via son code d'invitation.`,
      { type: "member_joined", familyId }
    );

    console.log(`[onMemberJoined] notif envoyée : ${displayName} → famille ${familyId}`);
  }
);

// ---------------------------------------------------------------------------
// Notification : une nouvelle tâche est ajoutée au foyer
// ---------------------------------------------------------------------------
exports.onTaskCreated = onDocumentUpdated(
  "families/{familyId}/planner/state",
  async (event) => {
    const { familyId } = event.params;
    const beforeTasks = Array.isArray(event.data?.before?.data()?.data?.tasks)
      ? event.data.before.data().data.tasks
      : [];
    const afterTasks = Array.isArray(event.data?.after?.data()?.data?.tasks)
      ? event.data.after.data().data.tasks
      : [];

    if (!afterTasks.length) return;

    const beforeIds = new Set(
      beforeTasks.filter((t) => t?.id).map((t) => String(t.id))
    );

    const newTasks = afterTasks.filter(
      (t) => t?.id && String(t.text || "").trim() && !beforeIds.has(String(t.id))
    );
    if (!newTasks.length) return;

    const membersSnap = await db
      .collection("families").doc(familyId)
      .collection("members")
      .get();
    const memberUids = membersSnap.docs.map((d) => d.id);
    if (memberUids.length === 0) return;

    const tokens = await getFamilyTokens(familyId, memberUids);
    if (tokens.length === 0) return;

    for (const task of newTasks) {
      const taskId = String(task.id);
      const key = `srv-task-created-${taskId}`;
      if (await isAlreadySent(familyId, key)) continue;

      const icon = String(task.icon || "").trim();
      const title = icon ? `${icon} Nouvelle tâche` : "Nouvelle tâche";
      const body = String(task.text || "").trim();

      await sendToFamily(
        tokens,
        title,
        body,
        { type: "task_created", taskId, familyId }
      );
      await markAsSent(familyId, key);
      console.log(`[onTaskCreated] "${task.text}" → famille ${familyId}`);
    }
  }
);

// ---------------------------------------------------------------------------
// Notification : une tâche est assignée à une personne du foyer
// ---------------------------------------------------------------------------
exports.onTaskAssigned = onDocumentUpdated(
  "families/{familyId}/planner/state",
  async (event) => {
    const { familyId } = event.params;
    const beforeTasks = Array.isArray(event.data?.before?.data()?.data?.tasks)
      ? event.data.before.data().data.tasks
      : [];
    const afterTasks = Array.isArray(event.data?.after?.data()?.data?.tasks)
      ? event.data.after.data().data.tasks
      : [];
    if (!afterTasks.length) return;

    const beforeById = new Map(
      beforeTasks
        .filter((task) => task?.id)
        .map((task) => [String(task.id), task]),
    );

    const notifications = [];
    for (const task of afterTasks) {
      if (!task?.id || !String(task.text || "").trim()) continue;
      const taskId = String(task.id);
      const beforeAssigned = new Set(taskAssignedPersonIds(beforeById.get(taskId)));
      const afterAssigned = taskAssignedPersonIds(task);
      for (const personId of afterAssigned) {
        if (!beforeAssigned.has(personId)) {
          notifications.push({ task, taskId, personId });
        }
      }
    }
    if (!notifications.length) return;

    const peopleById = await getPeopleById(familyId);
    for (const item of notifications) {
      const person = peopleById.get(item.personId);
      const uid = String(person?.linkedAccountId || "").trim();
      if (!uid) continue;

      const key = `srv-task-assigned-${event.id}-${item.taskId}-${item.personId}`;
      if (await isAlreadySent(familyId, key)) continue;

      const tokens = await getFamilyTokens(familyId, [uid]);
      if (tokens.length === 0) continue;

      await sendToFamily(
        tokens,
        "Nouvelle tâche assignée",
        String(item.task.text || "").trim(),
        { type: "task_assigned", taskId: item.taskId, personId: item.personId, familyId }
      );
      await markAsSent(familyId, key);
      console.log(`[onTaskAssigned] ${item.task.text} → ${person?.displayName || item.personId}`);
    }
  }
);

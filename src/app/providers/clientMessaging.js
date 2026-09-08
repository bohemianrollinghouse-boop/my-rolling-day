import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";
import { db, messagingTokenDocId, getOrCreateDeviceId } from "./core.js";

// ── Enregistrement du token FCM (ancien chemin devices/) ──────────────────

export async function registerFcmDeviceToken({ uid, familyId, token }) {
  const safeUid = String(uid || "").trim();
  const safeFamilyId = String(familyId || "").trim();
  const safeToken = String(token || "").trim();
  if (!safeUid || !safeFamilyId || !safeToken) {
    console.error("[fcm] registerFcmDeviceToken: uid, familyId ou token manquant", { uid: safeUid, familyId: safeFamilyId, tokenLength: safeToken.length });
    return;
  }
  const deviceId = getOrCreateDeviceId();
  const path = `families/${safeFamilyId}/members/${safeUid}/devices/${deviceId}`;
  console.log("[fcm] Chemin Firestore token:", path);
  const deviceRef = doc(db, "families", safeFamilyId, "members", safeUid, "devices", deviceId);
  try {
    const snap = await getDoc(deviceRef);
    const now = serverTimestamp();
    if (snap.exists()) {
      await updateDoc(deviceRef, {
        fcmToken: safeToken,
        notificationsEnabled: true,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent || "" : "",
        updatedAt: now,
        lastSeenAt: now,
      });
    } else {
      await setDoc(deviceRef, {
        fcmToken: safeToken,
        notificationsEnabled: true,
        platform: "web",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent || "" : "",
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });
    }
    console.log("[fcm] Token sauvegardé avec succès", path);
  } catch (error) {
    console.error("[fcm] Erreur sauvegarde token:", error?.code || error?.message || error, { path, errorFull: error });
  }
}

// ── Enregistrement du token FCM (chemin principal messagingTokens/) ────────

export async function saveMessagingToken({
  uid,
  familyId = "",
  linkedPersonId = "",
  token,
  permission = "",
}) {
  const safeUid = String(uid || "").trim();
  const safeToken = String(token || "").trim();
  if (!safeUid || !safeToken) {
    throw new Error("Token FCM manquant.");
  }

  const tokenDocId = messagingTokenDocId(safeToken);
  const tokenRef = doc(db, "users", safeUid, "messagingTokens", tokenDocId);
  const userRef = doc(db, "users", safeUid);

  await setDoc(
    tokenRef,
    {
      token: safeToken,
      permission: String(permission || "").trim() || "granted",
      platform: "web",
      origin: typeof window !== "undefined" ? window.location.origin : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent || "" : "",
      linkedPersonId: String(linkedPersonId || "").trim(),
      currentFamilyId: String(familyId || "").trim(),
      ...(familyId ? { householdIds: arrayUnion(String(familyId).trim()) } : {}),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await setDoc(
    userRef,
    {
      notificationPermission: String(permission || "").trim() || "granted",
      lastMessagingTokenAt: serverTimestamp(),
      ...(familyId ? { lastMessagingFamilyId: String(familyId).trim() } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (familyId) {
    await setDoc(
      doc(db, "families", String(familyId).trim(), "members", safeUid),
      {
        notificationTokens: arrayUnion(safeToken),
        notificationPermission: String(permission || "").trim() || "granted",
        notificationUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  return tokenDocId;
}

// ── Rappels reportés (handoff 8a) ─────────────────────────────────────────
//
// « Plus tard » ne pose pas un minuteur dans la session : la popup ne vit que
// tant que l'app est ouverte, alors qu'un rappel reporté doit revenir même app
// fermée. On écrit donc le rappel dans Firestore, et le cron des Cloud
// Functions (`sendScheduledNotifications`) renvoie le push le moment venu.
//
// Le document n'existe QUE tant que le rappel est en attente : la fonction le
// supprime après l'envoi. Une seule condition sur `dueAt` suffit donc à la
// requête serveur — pas d'index composite à déployer.

export async function scheduleSnoozedReminder({ familyId, uid, dueAt, notification, scope = "household", uids = [] }) {
  const safeFamilyId = String(familyId || "").trim();
  const safeUid = String(uid || "").trim();
  if (!safeFamilyId || !safeUid) throw new Error("Foyer ou utilisateur manquant.");
  if (!(dueAt instanceof Date) || Number.isNaN(dueAt.getTime())) {
    throw new Error("Échéance de report invalide.");
  }

  /* Le report hérite du périmètre du rappel : renvoyé aux seules personnes
     concernées, ou à tout le foyer. `firestore.rules` revérifie les deux —
     appartenance au périmètre pour « person », rôle admin pour « household ».
     L'auteur est toujours dans les destinataires d'un report personnel : il ne
     peut pas programmer une notification sur le téléphone d'un autre. */
  const safeScope = scope === "person" ? "person" : "household";
  const safeUids = safeScope === "person"
    ? [...new Set([safeUid, ...(Array.isArray(uids) ? uids : [])].map((id) => String(id || "").trim()).filter(Boolean))]
    : [];

  const { title = "", body = "", notifType = "general", taskId = "", eventId = "", tab = "", tasks = [] } =
    notification || {};

  /* Le rappel de fin de journée porte une liste de tâches. Une charge FCM ne
     transporte que des chaînes : on ne garde que les identifiants, et le
     client relit les tâches dans son état — elles auront pu changer entre
     temps, et c'est justement ce qu'on veut montrer. */
  const taskIds = (Array.isArray(tasks) ? tasks : [])
    .map((task) => String(task?.id || "").trim())
    .filter(Boolean);

  const reminderRef = doc(collection(db, "families", safeFamilyId, "reminders"));
  await setDoc(reminderRef, {
    uid: safeUid,
    scope: safeScope,
    uids: safeUids,
    dueAt: Timestamp.fromDate(dueAt),
    title,
    body,
    notifType,
    taskId,
    eventId,
    tab,
    taskIds,
    createdAt: serverTimestamp(),
  });
  return reminderRef.id;
}

import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
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

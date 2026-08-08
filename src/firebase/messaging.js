import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported as isMessagingSupported,
  onMessage,
} from "firebase/messaging";
import { Capacitor } from "@capacitor/core";
import { FIREBASE_WEB_VAPID_KEY } from "../constants.js";
import { firebaseApp } from "./client.js";
import brandMark from "../assets/brand/mark.svg";
import {
  getNotificationPermissionState as getUnifiedPermissionState,
  refreshNotificationPermissionState,
} from "../utils/notify.js";

const IS_NATIVE = Capacitor.isNativePlatform();

const SERVICE_WORKER_PATH = "/firebase-messaging-sw.js";
const SERVICE_WORKER_SCOPE = "/";
const NOTIFICATION_ICON = brandMark;
const VITE_FIREBASE_VAPID_KEY = String(FIREBASE_WEB_VAPID_KEY || "").trim();
const MIN_VAPID_KEY_LENGTH = 80;

let messagingSupportPromise = null;
let messagingInstancePromise = null;
let serviceWorkerRegistrationPromise = null;
let tokenUnavailableReason = "";
let vapidWarningLogged = false;

export function getNotificationPermissionState() {
  return getUnifiedPermissionState();
}

async function pushNotificationsPlugin() {
  const module = await import("@capacitor/push-notifications");
  return module.PushNotifications;
}

export async function isPushMessagingSupported() {
  // Natif : FCM passe par @capacitor/push-notifications, pas par la Push API web.
  if (IS_NATIVE) return true;
  if (!messagingSupportPromise) {
    messagingSupportPromise = (async () => {
      if (typeof window === "undefined" || typeof navigator === "undefined") return false;
      if (!("serviceWorker" in navigator)) return false;
      try {
        return await isMessagingSupported();
      } catch (error) {
        console.error("[firebase-messaging] support check failed", error);
        return false;
      }
    })();
  }
  return messagingSupportPromise;
}

// ── Push natif (Capacitor) ─────────────────────────────────────────────────
// Sur iOS, `register()` retourne un token APNs converti en token FCM par le SDK
// Firebase natif ; sur Android c'est directement un token FCM. Dans les deux cas
// il se stocke et s'utilise côté Cloud Function exactement comme un token web.

let nativeRegistrationPromise = null;

async function getNativePushToken() {
  if (!nativeRegistrationPromise) {
    nativeRegistrationPromise = (async () => {
      const plugin = await pushNotificationsPlugin();
      const token = await new Promise((resolve) => {
        const timeoutId = setTimeout(() => resolve(""), 15000);
        plugin.addListener("registration", (result) => {
          clearTimeout(timeoutId);
          resolve(String(result?.value || "").trim());
        });
        plugin.addListener("registrationError", (error) => {
          clearTimeout(timeoutId);
          console.error("[push-native] registration error", error);
          resolve("");
        });
        plugin.register().catch((error) => {
          clearTimeout(timeoutId);
          console.error("[push-native] register() failed", error);
          resolve("");
        });
      });
      return token;
    })().catch((error) => {
      nativeRegistrationPromise = null;
      console.error("[push-native] token flow failed", error);
      return "";
    });
  }
  return nativeRegistrationPromise;
}

async function syncNativePushToken({ requestPermission = false } = {}) {
  const plugin = await pushNotificationsPlugin();
  let status = await plugin.checkPermissions();
  if (requestPermission && status.receive !== "granted") {
    status = await plugin.requestPermissions();
  }
  // Aligne le cache du module notify (permission locale et push sont la même sur mobile)
  await refreshNotificationPermissionState();

  const permission = status.receive === "granted" ? "granted"
    : status.receive === "denied" ? "denied" : "default";
  if (permission !== "granted") {
    return { supported: true, permission, token: "" };
  }
  const token = await getNativePushToken();
  return { supported: true, permission, token };
}

async function getMessagingInstance() {
  const supported = await isPushMessagingSupported();
  if (!supported) return null;
  if (!messagingInstancePromise) {
    messagingInstancePromise = Promise.resolve(getMessaging(firebaseApp)).catch((error) => {
      messagingInstancePromise = null;
      console.error("[firebase-messaging] getMessaging failed", error);
      return null;
    });
  }
  return messagingInstancePromise;
}

export async function ensureMessagingServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = (async () => {
      const existingRegistration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
      if (existingRegistration) {
        try {
          await existingRegistration.update();
        } catch (error) {
          console.error("[firebase-messaging] service worker update check failed", error);
        }
        return navigator.serviceWorker.ready;
      }
      await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: SERVICE_WORKER_SCOPE });
      return navigator.serviceWorker.ready;
    })().catch((error) => {
      serviceWorkerRegistrationPromise = null;
      console.error("[firebase-messaging] service worker registration failed", error);
      return null;
    });
  }
  return serviceWorkerRegistrationPromise;
}

function logVapidWarning(message) {
  if (vapidWarningLogged) return;
  vapidWarningLogged = true;
  console.error(message);
}

function validateVapidKey({ log = false } = {}) {
  if (!VITE_FIREBASE_VAPID_KEY) {
    if (log) {
      logVapidWarning("[firebase-messaging] VAPID key is missing. Use the Firebase Web Push certificate public key for project my-rolling-day.");
    }
    return false;
  }
  if (VITE_FIREBASE_VAPID_KEY.length < MIN_VAPID_KEY_LENGTH) {
    if (log) {
      logVapidWarning(
        `[firebase-messaging] VAPID key is too short (${VITE_FIREBASE_VAPID_KEY.length} chars). Use the public Web Push Certificates key from Firebase Console, not a server key.`,
      );
    }
    return false;
  }
  return true;
}

export async function syncPushToken({ requestPermission = false } = {}) {
  if (IS_NATIVE) {
    try {
      return await syncNativePushToken({ requestPermission });
    } catch (error) {
      console.error("[push-native] syncPushToken failed", error);
      return { supported: true, permission: getNotificationPermissionState(), token: "" };
    }
  }

  const supported = await isPushMessagingSupported();
  if (!supported) {
    return { supported: false, permission: "unsupported", token: "" };
  }

  let permission = getNotificationPermissionState();
  if (requestPermission && permission !== "granted") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    return { supported: true, permission, token: "" };
  }

  if (tokenUnavailableReason && !requestPermission) {
    return { supported: true, permission, token: "" };
  }

  if (!validateVapidKey({ log: requestPermission })) {
    tokenUnavailableReason = "invalid-vapid-key";
    return { supported: true, permission, token: "" };
  }

  const messaging = await getMessagingInstance();
  if (!messaging) {
    return { supported: true, permission: getNotificationPermissionState(), token: "" };
  }

  const serviceWorkerRegistration = await ensureMessagingServiceWorker();
  if (!serviceWorkerRegistration) {
    return { supported: true, permission: getNotificationPermissionState(), token: "" };
  }

  let token = "";
  try {
    token = await getToken(messaging, {
      vapidKey: VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration,
    });
  } catch (error) {
    console.error("[firebase-messaging] getToken failed", error);
    tokenUnavailableReason = "get-token-failed";
    token = "";
  }

  return {
    supported: true,
    permission: getNotificationPermissionState(),
    token: String(token || "").trim(),
  };
}

export async function clearPushToken() {
  if (IS_NATIVE) {
    try {
      const plugin = await pushNotificationsPlugin();
      await plugin.unregister(); // supprime le token FCM (Android) / désenregistre APNs (iOS)
      nativeRegistrationPromise = null;
      return true;
    } catch (_) {
      return false;
    }
  }
  const supported = await isPushMessagingSupported();
  if (!supported) return false;
  const messaging = await getMessagingInstance();
  if (!messaging) return false;
  try {
    return await deleteToken(messaging);
  } catch (_) {
    return false;
  }
}

function payloadTitle(payload) {
  return payload?.notification?.title || payload?.data?.title || "My Rolling Day";
}

function payloadBody(payload) {
  return payload?.notification?.body || payload?.data?.body || "";
}

export async function bindForegroundPushMessages(handler = null) {
  if (IS_NATIVE) {
    try {
      const plugin = await pushNotificationsPlugin();
      // Reproduit la forme de payload FCM web pour ne rien changer côté hooks
      const toWebPayload = (notification) => ({
        notification: {
          title: notification?.title || "",
          body: notification?.body || "",
        },
        data: notification?.data || {},
      });
      const received = await plugin.addListener("pushNotificationReceived", (notification) => {
        if (typeof handler === "function") handler(toWebPayload(notification));
      });
      // Tap sur une notification (app en arrière-plan ou fermée) — équivalent
      // du postMessage NOTIFICATION_CLICK du service worker web.
      const tapped = await plugin.addListener("pushNotificationActionPerformed", (event) => {
        if (typeof handler === "function") handler(toWebPayload(event?.notification));
      });
      return () => {
        received.remove();
        tapped.remove();
      };
    } catch (error) {
      console.error("[push-native] foreground binding failed", error);
      return () => {};
    }
  }

  const supported = await isPushMessagingSupported();
  if (!supported) return () => {};
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};

  try {
    return onMessage(messaging, (payload) => {
      if (typeof handler === "function") {
        // Le handler affiche la popup in-app — pas besoin d'une notif OS en plus
        handler(payload);
        return;
      }
      // Fallback : pas de handler → notif OS classique
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      try {
        new Notification(payloadTitle(payload), {
          body: payloadBody(payload),
          icon: NOTIFICATION_ICON,
          badge: NOTIFICATION_ICON,
        });
      } catch (error) {
        console.error("[firebase-messaging] foreground notification failed", error);
      }
    });
  } catch (error) {
    console.error("[firebase-messaging] foreground binding failed", error);
    return () => {};
  }
}

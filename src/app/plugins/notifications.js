// Adaptateur de notifications multi-plateforme.
//
// Web/PWA : API Notification classique.
// Natif (Capacitor) : @capacitor/local-notifications — window.Notification
// n'existe pas en WKWebView et n'affiche rien en WebView Android.
//
// Les checks de permission historiques (`Notification.permission`) sont
// synchrones alors que les plugins natifs sont asynchrones : on garde donc un
// cache mis à jour au boot (initNotifications) et après chaque demande.

import { Capacitor } from "@capacitor/core";

const isNative = Capacitor.isNativePlatform();

let cachedNativePermission = "default";
let clickListenerBound = false;
let nextNotificationId = 1;
const clickHandlers = new Map(); // id natif → callback

function mapNativePermission(display) {
  if (display === "granted") return "granted";
  if (display === "denied") return "denied";
  return "default"; // "prompt" / "prompt-with-rationale"
}

// ⚠️ Ne jamais retourner/résoudre le proxy du plugin directement : les promesses
// sondent `.then` sur la valeur, et le proxy Capacitor fabrique une méthode
// native "then()" → rejet "not implemented" + promesse qui ne se résout jamais.
// On retourne le namespace du module et on déréférence à l'appel.
async function localNotifications() {
  const module = await import("@capacitor/local-notifications");
  return { plugin: module.LocalNotifications };
}

/** Lecture synchrone — même contrat que l'ancien `Notification.permission`. */
export function getNotificationPermissionState() {
  if (isNative) return cachedNativePermission;
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission || "default";
}

/** Rafraîchit le cache natif (no-op en web). À appeler au boot et au retour au premier plan. */
export async function refreshNotificationPermissionState() {
  if (!isNative) return getNotificationPermissionState();
  try {
    const { plugin } = await localNotifications();
    const status = await plugin.checkPermissions();
    cachedNativePermission = mapNativePermission(status.display);
  } catch (error) {
    console.warn("[notify] checkPermissions échoué", error);
  }
  return cachedNativePermission;
}

/** Demande la permission — remplace `Notification.requestPermission()`. */
export async function requestNotificationPermission() {
  if (!isNative) {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    return Notification.requestPermission();
  }
  try {
    const { plugin } = await localNotifications();
    const status = await plugin.requestPermissions();
    cachedNativePermission = mapNativePermission(status.display);
  } catch (error) {
    console.warn("[notify] requestPermissions échoué", error);
  }
  return cachedNativePermission;
}

async function bindNativeClickListener() {
  if (clickListenerBound) return;
  clickListenerBound = true;
  try {
    const { plugin } = await localNotifications();
    await plugin.addListener("localNotificationActionPerformed", (event) => {
      const handler = clickHandlers.get(event?.notification?.id);
      if (handler) {
        clickHandlers.delete(event.notification.id);
        try { handler(); } catch (_) {}
      }
    });
  } catch (error) {
    clickListenerBound = false;
    console.warn("[notify] listener natif impossible", error);
  }
}

/**
 * Affiche une notification immédiate.
 * Remplace `new Notification(title, { body, icon })` + `notif.onclick`.
 */
export async function showAppNotification(title, { body = "", onClick = null } = {}) {
  if (!isNative) {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      const notif = new Notification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png" });
      if (typeof onClick === "function") {
        notif.onclick = (event) => {
          if (event && event.preventDefault) event.preventDefault();
          window.focus();
          onClick();
        };
      }
    } catch (_) {}
    return;
  }

  if (cachedNativePermission !== "granted") return;
  try {
    const { plugin } = await localNotifications();
    const id = nextNotificationId;
    nextNotificationId = (nextNotificationId % 100000) + 1;
    if (typeof onClick === "function") {
      clickHandlers.set(id, onClick);
      // Garde-fou : ne pas accumuler des handlers de notifications jamais tapées
      if (clickHandlers.size > 100) {
        const oldest = clickHandlers.keys().next().value;
        clickHandlers.delete(oldest);
      }
      await bindNativeClickListener();
    }
    await plugin.schedule({ notifications: [{ id, title, body }] });
  } catch (error) {
    console.warn("[notify] notification native échouée", error);
  }
}

/** À appeler une fois au démarrage : amorce le cache + le listener de clic. */
export async function initNotifications() {
  if (!isNative) return;
  await refreshNotificationPermissionState();
  await bindNativeClickListener();
}

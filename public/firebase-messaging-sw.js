/* global clients, firebase */

// ── SDK Firebase Messaging (compat) pour les messages en arrière-plan ────────
// Le SDK compat permet d'utiliser importScripts dans un service worker.
// onBackgroundMessage gère les notifications push quand l'appli est fermée.

importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD6B4xw8I507Zb7ZkLAmkUbCPTsnKVBjTE",
  authDomain: "my-rolling-day.firebaseapp.com",
  projectId: "my-rolling-day",
  storageBucket: "my-rolling-day.firebasestorage.app",
  messagingSenderId: "543367828677",
  appId: "1:543367828677:web:6ff53808141b506ca30cac",
});

const messaging = firebase.messaging();

const NOTIFICATION_ICON = "/src/assets/brand/mark.svg";

function getPayloadTitle(payload) {
  return payload?.notification?.title || payload?.data?.title || "My Rolling Day";
}

function getPayloadBody(payload) {
  return payload?.notification?.body || payload?.data?.body || "";
}

function getPayloadLink(payload) {
  return payload?.fcmOptions?.link || payload?.data?.link || "/";
}

// ── Messages en arrière-plan (app fermée ou onglet inactif) ───────────────────
messaging.onBackgroundMessage(function (payload) {
  console.log("[firebase-messaging-sw] Background message reçu :", payload);

  const title = getPayloadTitle(payload);
  const body = getPayloadBody(payload);
  const link = getPayloadLink(payload);

  const options = {
    body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    data: {
      link,
      FCM_MSG: payload,
    },
  };

  return self.registration.showNotification(title, options);
});

// ── Clic sur la notification ─────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  const notifData = event.notification?.data || {};
  const fcmPayload = notifData.FCM_MSG || {};

  event.notification.close();

  const targetUrl =
    notifData.link ||
    fcmPayload?.fcmOptions?.link ||
    fcmPayload?.data?.link ||
    "/";

  // Message envoyé à l'application pour afficher la popup contextuelle
  const popupMessage = {
    type: "NOTIFICATION_CLICK",
    title: event.notification.title || "",
    body: event.notification.body || "",
    taskId: notifData.taskId || fcmPayload?.data?.taskId || "",
    eventId: notifData.eventId || fcmPayload?.data?.eventId || "",
    notifType: notifData.notifType || fcmPayload?.data?.notifType || "general",
    tab: notifData.tab || fcmPayload?.data?.tab || "",
    link: targetUrl,
  };

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Chercher une fenêtre ouverte et lui envoyer le message
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.postMessage(popupMessage);
          return;
        }
      }
      // Pas de fenêtre ouverte → ouvrir l'app (la popup s'affichera via le SW message au démarrage)
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});

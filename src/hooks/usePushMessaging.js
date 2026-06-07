import { useEffect, useRef, useState } from "../lib.js";
import { registerFcmDeviceToken, saveMessagingToken } from "../firebase/client.js";
import {
  bindForegroundPushMessages,
  getNotificationPermissionState,
  isPushMessagingSupported,
  syncPushToken,
} from "../firebase/messaging.js";

export function usePushMessaging({ userId = "", familyId = "", linkedPersonId = "", onForegroundMessage = null }) {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState(() => getNotificationPermissionState());
  const [token, setToken] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  // Ref pour éviter de recréer les listeners à chaque render
  const onForegroundMessageRef = useRef(onForegroundMessage);
  useEffect(() => { onForegroundMessageRef.current = onForegroundMessage; }, [onForegroundMessage]);

  function refreshPermission() {
    setPermission(getNotificationPermissionState());
  }

  async function persistToken(nextToken, nextPermission) {
    if (!userId || !nextToken) return;
    try {
      await saveMessagingToken({
        uid: userId,
        familyId,
        linkedPersonId,
        token: nextToken,
        permission: nextPermission,
      });
      if (familyId) {
        await registerFcmDeviceToken({ uid: userId, familyId, token: nextToken });
      }
    } catch (error) {
      console.warn("[fcm] persistToken échoué", error);
    }
  }

  async function runTokenSync({ requestPermission = false } = {}) {
    try {
      setSyncing(true);
      setError("");
      if (requestPermission) {
        console.log("[fcm] Demande de permission notification...");
      }
      const result = await syncPushToken({ requestPermission });
      setSupported(Boolean(result.supported));
      const nextPermission = result.permission || getNotificationPermissionState();
      setPermission(nextPermission);
      console.log("[fcm] Permission notification:", nextPermission, "| supported:", result.supported);
      if (result.token) {
        console.log("[fcm] Token FCM obtenu:", result.token.slice(0, 20) + "...");
        setToken(result.token);
        await persistToken(result.token, nextPermission === "granted" ? "granted" : nextPermission);
      } else {
        console.log("[fcm] Pas de token retourné (permission:", nextPermission, ")");
      }
      return result;
    } catch (syncError) {
      console.error("[fcm] Erreur sync token:", syncError?.code || syncError?.message || syncError);
      setError("");
      refreshPermission();
      return {
        supported,
        permission: getNotificationPermissionState(),
        token: "",
        error: syncError,
      };
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    let active = true;
    isPushMessagingSupported().then((isSupported) => {
      if (!active) return;
      setSupported(Boolean(isSupported));
      if (!isSupported) {
        setPermission("unsupported");
      } else {
        refreshPermission();
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    refreshPermission();
    function handleVisibility() {
      if (document.visibilityState === "visible") refreshPermission();
    }
    window.addEventListener("focus", refreshPermission);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refreshPermission);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!userId || permission !== "granted") return;
    runTokenSync({ requestPermission: false });
  }, [userId, familyId, linkedPersonId, permission]);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;

    // Handler FCM foreground : montre la popup in-app au lieu d'une notification OS
    const foregroundHandler = (payload) => {
      if (typeof onForegroundMessageRef.current !== "function") return;
      const title = payload?.notification?.title || payload?.data?.title || "My Rolling Day";
      const body = payload?.notification?.body || payload?.data?.body || "";
      onForegroundMessageRef.current({
        title,
        body,
        taskId: payload?.data?.taskId || "",
        eventId: payload?.data?.eventId || "",
        notifType: payload?.data?.notifType || "general",
        tab: payload?.data?.tab || "",
      });
    };

    bindForegroundPushMessages(foregroundHandler).then((nextUnsubscribe) => {
      if (!active) return;
      unsubscribe = typeof nextUnsubscribe === "function" ? nextUnsubscribe : () => {};
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // Écoute les clics sur notifications background (postMessage du Service Worker)
  useEffect(() => {
    if (!navigator?.serviceWorker) return;
    function handleSWMessage(event) {
      if (event.data?.type !== "NOTIFICATION_CLICK") return;
      if (typeof onForegroundMessageRef.current !== "function") return;
      onForegroundMessageRef.current({
        title: event.data.title || "",
        body: event.data.body || "",
        taskId: event.data.taskId || "",
        eventId: event.data.eventId || "",
        notifType: event.data.notifType || "general",
        tab: event.data.tab || "",
      });
    }
    navigator.serviceWorker.addEventListener("message", handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleSWMessage);
  }, []);

  return {
    pushSupported: supported,
    pushPermission: permission,
    pushToken: token,
    pushSyncing: syncing,
    pushError: error,
    refreshPushPermission: refreshPermission,
    requestPushPermission: () => runTokenSync({ requestPermission: true }),
    syncPushTokenIfPossible: () => runTokenSync({ requestPermission: false }),
  };
}

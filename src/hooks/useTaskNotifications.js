import { useEffect, useRef } from "../lib.js";
import { getCurrentAppDate, localDateKey } from "../utils/date.js";

// Déduplication immédiate — évite les doublons quand focus + visibilitychange
// se déclenchent ensemble avant que l'état React ait propagé les sentKeys.
const _taskSentThisSession = new Set();

function isTaskDone(task) {
  return (Array.isArray(task.doneBy) ? task.doneBy.filter(Boolean).length > 0 : false)
    || Boolean(task.completedByPersonId);
}

function sendTaskNotification(title, body, taskData, onNotification) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const notif = new Notification(title, { body, icon: "/icon-192.png" });
    if (typeof onNotification === "function") {
      notif.onclick = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        window.focus();
        onNotification({ title, body, ...(taskData || {}) });
      };
    }
  } catch (_) {}
}

function getTaskReminder(task) {
  const reminder = String(task?.notification?.reminder || "").trim();
  if (reminder === "none" || reminder === "at_time" || reminder === "1h_before" || reminder === "30m_before" || reminder === "custom_before" || reminder === "day_before") {
    return reminder;
  }
  return "none";
}

function getTaskReminderMinutes(task, reminder) {
  if (reminder === "1h_before") return 60;
  if (reminder === "30m_before") return 30;
  if (reminder === "custom_before") {
    const minutes = Number(task?.notification?.customMinutes);
    return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 15;
  }
  return 0;
}

function isWithinNotificationWindow(now, target) {
  return Math.abs(now.getTime() - target.getTime()) <= 60000;
}

function buildDueReminder(task, settings) {
  if (!task?.dueDate) return null;
  const reminder = getTaskReminder(task);
  if (reminder === "none") return null;

  const baseDue = new Date(`${task.dueDate}T00:00`);
  if (Number.isNaN(baseDue.getTime())) return null;

  const [fallbackH, fallbackM] = String(settings?.endOfDayTime || "18:00").split(":").map(Number);
  const [dueH, dueM] = task.dueTime
    ? String(task.dueTime).split(":").map(Number)
    : [Number.isFinite(fallbackH) ? fallbackH : 18, Number.isFinite(fallbackM) ? fallbackM : 0];

  const dueAt = new Date(baseDue);
  dueAt.setHours(
    Number.isFinite(dueH) ? dueH : 18,
    Number.isFinite(dueM) ? dueM : 0,
    0,
    0,
  );

  if (reminder === "at_time") {
    return {
      key: `${task.id}-due-at-${task.dueDate}-${task.dueTime || "endofday"}`,
      notifyAt: dueAt,
      title: task.dueTime ? `À faire maintenant : ${task.text}` : `À faire aujourd'hui : ${task.text}`,
    };
  }

  if (reminder === "1h_before") {
    return {
      key: `${task.id}-due-1h-${task.dueDate}-${task.dueTime || "endofday"}`,
      notifyAt: new Date(dueAt.getTime() - 60 * 60000),
      title: task.dueTime ? `À faire avant ${task.dueTime} : ${task.text}` : `Rappel dans 1h : ${task.text}`,
    };
  }

  if (reminder === "30m_before" || reminder === "custom_before") {
    const minutes = getTaskReminderMinutes(task, reminder);
    return {
      key: `${task.id}-due-${minutes}m-${task.dueDate}-${task.dueTime || "endofday"}`,
      notifyAt: new Date(dueAt.getTime() - minutes * 60000),
      title: task.dueTime ? `À faire avant ${task.dueTime} : ${task.text}` : `Rappel dans ${minutes} min : ${task.text}`,
    };
  }

  return {
    key: `${task.id}-due-eve-${task.dueDate}-${task.dueTime || "endofday"}`,
    notifyAt: new Date(dueAt.getTime() - 24 * 60 * 60000),
    title: `Demain : tâche à terminer — ${task.text}`,
  };
}

function checkTaskNotifications(tasks, settings, updateState, onNotification) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!settings?.enabled) return;
  if (!Array.isArray(tasks) || tasks.length === 0) return;

  const now = getCurrentAppDate();
  const todayKey = localDateKey(now);
  const toLog = [];

  // 1. Rappel fin de journée — toutes les tâches du jour non faites
  if (settings.endOfDay) {
    const [eodH, eodM] = String(settings.endOfDayTime || "18:00").split(":").map(Number);
    const eodTarget = new Date(
      now.getFullYear(), now.getMonth(), now.getDate(),
      Number.isFinite(eodH) ? eodH : 18,
      Number.isFinite(eodM) ? eodM : 0,
      0, 0,
    );
    if (Math.abs(now.getTime() - eodTarget.getTime()) <= 60000) {
      const eodKey = `foyer-endofday-${todayKey}`;
      const alreadySent = tasks.some(
        (t) => Array.isArray(t.notificationLog) && t.notificationLog.includes(eodKey),
      );
      if (!alreadySent && !_taskSentThisSession.has(eodKey)) {
        // Tâches du jour : récurrentes quotidiennes + tâches dont l'échéance est aujourd'hui
        const undone = tasks.filter(
          (t) => !isTaskDone(t) && (t.type === "daily" || t.dueDate === todayKey)
        );
        if (undone.length > 0) {
          const n = undone.length;
          _taskSentThisSession.add(eodKey);
          sendTaskNotification(
            `Il vous reste ${n} tâche${n > 1 ? "s" : ""} avant la fin de journée`,
            "",
            { notifType: "end-of-day", tasks: undone, tab: "daily" },
            onNotification,
          );
          toLog.push(...undone.map((t) => ({ taskId: t.id, key: eodKey })));
        }
      }
    }
  }

  // 2. Tâches urgentes non faites (max 1 par tâche / jour)
  if (settings.urgent) {
    tasks.forEach((task) => {
      if (task.priority !== "urgent" && !task.critical) return;
      if (isTaskDone(task)) return;
      const key = `${task.id}-urgent-${todayKey}`;
      if (Array.isArray(task.notificationLog) && task.notificationLog.includes(key)) return;
      if (_taskSentThisSession.has(key)) return;
      _taskSentThisSession.add(key);
      sendTaskNotification(
        `Urgent : « ${task.text} » n'est pas faite`,
        "",
        { notifType: "urgent", taskId: task.id, tab: "daily" },
        onNotification,
      );
      toLog.push({ taskId: task.id, key });
    });
  }

  // 3. Tâches avec échéance
  if (settings.due) {
    tasks.forEach((task) => {
      if (isTaskDone(task)) return;
      const reminder = buildDueReminder(task, settings);
      if (!reminder) return;
      const sent = Array.isArray(task.notificationLog) && task.notificationLog.includes(reminder.key);
      if (!sent && !_taskSentThisSession.has(reminder.key) && isWithinNotificationWindow(now, reminder.notifyAt)) {
        _taskSentThisSession.add(reminder.key);
        sendTaskNotification(
          reminder.title,
          "",
          { notifType: "due", taskId: task.id, tab: "daily" },
          onNotification,
        );
        toLog.push({ taskId: task.id, key: reminder.key });
      }
    });
  }

  if (toLog.length === 0) return;

  updateState((prev) => ({
    ...prev,
    tasks: prev.tasks.map((task) => {
      const newKeys = toLog.filter((e) => e.taskId === task.id).map((e) => e.key);
      if (newKeys.length === 0) return task;
      const existing = Array.isArray(task.notificationLog) ? task.notificationLog : [];
      return { ...task, notificationLog: [...new Set([...existing, ...newKeys])] };
    }),
  }));
}

export function useTaskNotifications({ tasks, taskNotifications, updateState, onNotification }) {
  const tasksRef = useRef(tasks);
  const settingsRef = useRef(taskNotifications);
  const updateStateRef = useRef(updateState);
  const onNotificationRef = useRef(onNotification);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);
  useEffect(() => { settingsRef.current = taskNotifications; }, [taskNotifications]);
  useEffect(() => { updateStateRef.current = updateState; }, [updateState]);
  useEffect(() => { onNotificationRef.current = onNotification; }, [onNotification]);

  useEffect(() => {
    function check() {
      checkTaskNotifications(tasksRef.current, settingsRef.current, updateStateRef.current, onNotificationRef.current);
    }
    function handleVisibility() {
      if (document.visibilityState === "visible") check();
    }
    const intervalId = setInterval(check, 60000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
}

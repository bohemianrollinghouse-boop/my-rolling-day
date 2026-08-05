import { useEffect, useMemo, useState } from "../lib.js";
import { getCurrentAppDate } from "../utils/date.js";
import { getStaleTaskAlerts } from "../utils/staleTasks.js";

const CHECK_INTERVAL_MS = 5 * 60000;

// Réévalue périodiquement (et au retour au premier plan) les tâches
// "semaine"/"mois" en retard, pour déclencher la modale de relance.
export function useStaleTaskAlerts(tasks) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    function bump() { setTick((previous) => previous + 1); }
    const intervalId = setInterval(bump, CHECK_INTERVAL_MS);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", bump);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  return useMemo(
    () => getStaleTaskAlerts(tasks, getCurrentAppDate()),
    [tasks, tick], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

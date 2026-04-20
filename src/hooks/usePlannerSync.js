import { saveFamilyPlanner, watchFamilyPlanner } from "../firebase/client.js";
import { useEffect, useRef, useState } from "../lib.js";
import { createDefaultState } from "../data/defaultState.js";
import { checkReset } from "../utils/state.js?v=2026-04-19-lists-fix-3";
import { formatFirestoreError } from "../firebase/client.js";

export function usePlannerSync(currentFamilyId, userId) {
  const [state, setState] = useState(() => checkReset(createDefaultState()).state);
  const [status, setStatus] = useState("Pret");
  const [plannerError, setPlannerError] = useState("");

  const plannerReadyRef = useRef(false);
  const remoteHashRef = useRef("");

  // Écoute Firestore et charge l'état du planner
  useEffect(() => {
    if (!currentFamilyId || !userId) {
      plannerReadyRef.current = false;
      remoteHashRef.current = "";
      setState(checkReset(createDefaultState()).state);
      return undefined;
    }

    setStatus("Chargement foyer...");
    return watchFamilyPlanner(
      currentFamilyId,
      async (plannerDoc) => {
        if (plannerDoc?.data) {
          const nextState = checkReset(plannerDoc.data).state;
          const serialized = JSON.stringify(nextState);
          remoteHashRef.current = serialized;
          plannerReadyRef.current = true;
          setState(nextState);
          setStatus("Synchronise");
          return;
        }

        const emptyState = checkReset(createDefaultState()).state;
        const serialized = JSON.stringify(emptyState);
        remoteHashRef.current = serialized;
        plannerReadyRef.current = true;
        setState(emptyState);
        await saveFamilyPlanner(currentFamilyId, userId, emptyState);
        setStatus("Synchronise");
      },
      (error) => {
        setPlannerError(formatFirestoreError(error));
        setStatus("Erreur Firestore");
      },
    );
  }, [currentFamilyId, userId]);

  // Sauvegarde automatique dès que l'état local change
  useEffect(() => {
    if (!plannerReadyRef.current || !currentFamilyId || !userId) return;
    const serialized = JSON.stringify(state);
    if (serialized === remoteHashRef.current) return;
    remoteHashRef.current = serialized;
    setStatus("Sauvegarde...");
    saveFamilyPlanner(currentFamilyId, userId, state)
      .then(() => setStatus("Synchronise"))
      .catch(() => setStatus("Erreur sync"));
  }, [state, currentFamilyId, userId]);

  return { state, setState, status, plannerError };
}

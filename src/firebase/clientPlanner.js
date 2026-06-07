import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "./core.js";

// ── Synchro du planner Firestore ──────────────────────────────────────────

export function watchFamilyPlanner(familyId, callback, onError) {
  return onSnapshot(
    doc(db, "families", familyId, "planner", "state"),
    (snapshot) => {
      callback(snapshot.exists() ? snapshot.data() : null);
    },
    (error) => {
      console.error("[firestore] watchFamilyPlanner error", error?.code, error);
      if (onError) onError(error);
    },
  );
}

export function saveFamilyPlanner(familyId, userId, data) {
  return setDoc(
    doc(db, "families", familyId, "planner", "state"),
    {
      data,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    },
    { merge: true },
  );
}

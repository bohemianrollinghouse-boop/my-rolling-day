import { normalizeState } from "./state.js";

// ── Notification prompt state ─────────────────────────────────────────────────
// Remplace l'ancien booléen mrd_notifications_prompt_seen.
// Format : { dismissCount: number, lastDismissed: number|null, granted: boolean }

const NOTIF_PROMPT_KEY = "mrd_notif_prompt";
const MAX_DISMISSALS = 3;
// Délai avant re-proposition selon le rang du refus (en ms)
const DISMISS_DELAYS = [
  3 * 24 * 60 * 60 * 1000,  // après 1er "Plus tard" → 3 jours
  7 * 24 * 60 * 60 * 1000,  // après 2e "Plus tard"  → 7 jours
];

function readNotifPromptState() {
  try {
    const raw = localStorage.getItem(NOTIF_PROMPT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        dismissCount: Number(parsed.dismissCount) || 0,
        lastDismissed: parsed.lastDismissed ? Number(parsed.lastDismissed) : null,
        granted: Boolean(parsed.granted),
      };
    }
  } catch (_) {}
  // Migrer l'ancien booléen si présent
  if (localStorage.getItem("mrd_notifications_prompt_seen") === "true") {
    return { dismissCount: MAX_DISMISSALS, lastDismissed: null, granted: false };
  }
  return { dismissCount: 0, lastDismissed: null, granted: false };
}

function writeNotifPromptState(state) {
  try {
    localStorage.setItem(NOTIF_PROMPT_KEY, JSON.stringify(state));
  } catch (_) {}
}

/**
 * Retourne true si la modale de demande de notification doit être affichée.
 * Tient compte de la permission OS, du nombre de refus et des délais.
 */
export function shouldShowNotifPrompt() {
  // Si le navigateur a déjà une décision définitive, inutile de proposer
  if (typeof window !== "undefined" && "Notification" in window) {
    const perm = Notification.permission;
    if (perm === "granted" || perm === "denied") return false;
  }
  const { dismissCount, lastDismissed, granted } = readNotifPromptState();
  if (granted) return false;
  if (dismissCount >= MAX_DISMISSALS) return false;
  if (dismissCount === 0) return true; // Première fois → toujours montrer
  const delay = DISMISS_DELAYS[dismissCount - 1] ?? DISMISS_DELAYS[DISMISS_DELAYS.length - 1];
  if (!lastDismissed) return true;
  return Date.now() - lastDismissed >= delay;
}

/** Appelé quand l'utilisateur clique "Activer" (quelle que soit la réponse du navigateur). */
export function markNotifPromptGranted() {
  const state = readNotifPromptState();
  writeNotifPromptState({ ...state, granted: true });
}

/** Appelé quand l'utilisateur clique "Plus tard". */
export function markNotifPromptDismissed() {
  const state = readNotifPromptState();
  writeNotifPromptState({
    ...state,
    dismissCount: state.dismissCount + 1,
    lastDismissed: Date.now(),
  });
}

/** Retourne le nombre de fois que l'utilisateur a cliqué "Plus tard". */
export function getNotifPromptDismissCount() {
  return readNotifPromptState().dismissCount;
}

// ── Import / Export ───────────────────────────────────────────────────────────

export function parseImportedState(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    throw new Error("Colle un JSON de planning a importer.");
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    throw new Error("Le texte fourni n'est pas un JSON valide.");
  }

  const candidate = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;
  return normalizeState(candidate);
}

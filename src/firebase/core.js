import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
} from "firebase/firestore";
import { FIREBASE_CONFIG, MEMBER_COLORS } from "../constants.js";

// ── Initialisation Firebase (singleton) ───────────────────────────────────

const app = initializeApp(FIREBASE_CONFIG);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
  experimentalForceLongPolling: true,
});
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
export const firebaseApp = app;

// ── Utilitaires partagés entre les modules firebase/ ──────────────────────

export function randomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function colorForUser(uid = "") {
  let total = 0;
  for (let index = 0; index < uid.length; index += 1) {
    total += uid.charCodeAt(index);
  }
  return MEMBER_COLORS[total % MEMBER_COLORS.length];
}

export function colorForPerson(seed = "") {
  let total = 0;
  const text = String(seed || "person");
  for (let index = 0; index < text.length; index += 1) {
    total += text.charCodeAt(index);
  }
  return MEMBER_COLORS[total % MEMBER_COLORS.length];
}

export function accountLabel(user, preferredName = "") {
  return preferredName || user?.displayName || user?.email?.split("@")[0] || "Moi";
}

export function messagingTokenDocId(token = "") {
  const text = String(token || "").trim();
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  const safePrefix = text.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 18) || "token";
  return `msg-${safePrefix}-${Math.abs(hash).toString(36)}`;
}

export function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem("mrd-device-id");
    if (!id) {
      id = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem("mrd-device-id", id);
    }
    return id;
  } catch (_) {
    return `web-${Date.now().toString(36)}`;
  }
}

// ── Formatage d'erreurs ───────────────────────────────────────────────────

export function formatAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/timeout") return "La connexion a pris trop de temps. Réessaie.";
  if (code === "auth/redirect-cancelled-by-user") return "";
  if (code === "auth/popup-not-supported" || code === "auth/web-storage-unsupported") return "";
  if (code === "auth/unauthorized-domain") return "Ce domaine n'est pas autorisé pour la connexion Google.";
  if (code === "auth/missing-password") return "Entre ton mot de passe actuel pour confirmer la suppression.";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "Mot de passe incorrect.";
  if (code === "auth/user-not-found") return "Aucun compte n'existe avec cet email.";
  if (code === "auth/invalid-email") return "Adresse email invalide.";
  if (code === "auth/email-already-in-use") return "Cette adresse e-mail est déjà utilisée.";
  if (code === "auth/network-request-failed") return "Erreur réseau. Vérifie ta connexion Internet.";
  if (code === "auth/popup-closed-by-user") return "La fenêtre Google a été fermée avant la fin.";
  if (code === "auth/operation-not-allowed") return "Cette méthode de connexion n'est pas activée dans Firebase.";
  if (code === "auth/too-many-requests") return "Trop de tentatives. Réessaie un peu plus tard.";
  if (code === "auth/weak-password") return "Le nouveau mot de passe est trop faible.";
  if (code === "auth/requires-recent-login") return "Pour changer ce mot de passe, reconnecte-toi puis réessaie.";
  if (code === "auth/no-password-provider") return "Ce compte utilise Google. Le mot de passe ne se change pas ici.";
  if (code === "permission-denied" || code === "firestore/permission-denied") return "Connexion réussie, mais Firestore refuse l'accès. Vérifie les règles Firebase.";
  return error?.message || "Erreur d'authentification inconnue.";
}

export function formatFirestoreError(error) {
  const code = error?.code || "";
  if (code === "permission-denied" || code === "firestore/permission-denied") return "Connexion réussie, mais Firestore refuse l'accès. Vérifie les règles Firebase.";
  if (code === "unavailable" || code === "firestore/unavailable") return "Firestore est temporairement indisponible.";
  return error?.message || "Erreur Firestore inconnue.";
}

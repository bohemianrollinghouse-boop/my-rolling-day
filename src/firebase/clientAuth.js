import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  setPersistence,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateEmail,
  updatePassword,
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import { GoogleAuth } from "@codetrix-studio/capacitor-google-auth";
import { auth, googleProvider } from "./core.js";

let persistenceReady = false;

// ── Session ───────────────────────────────────────────────────────────────

export async function ensureAuthPersistence() {
  if (persistenceReady) return;
  await setPersistence(auth, browserLocalPersistence);
  persistenceReady = true;
}

export function watchAuth(callback) {
  // Listener appelé une seule fois au démarrage — logs gérés par l'appelant (useAuth.js)
  return onAuthStateChanged(auth, callback);
}

// ── Utilitaire PWA ────────────────────────────────────────────────────────

export function isStandalonePwa() {
  return (
    (typeof navigator !== "undefined" && navigator.standalone === true) ||
    (typeof window !== "undefined" &&
      window.matchMedia?.("(display-mode: standalone)").matches === true)
  );
}

// ── Connexion Google ──────────────────────────────────────────────────────

export async function signInWithGoogle() {
  // Sur Android/iOS natif (Capacitor) : dialog Google natif via le plugin.
  if (Capacitor.isNativePlatform()) {
    console.log("[auth] signInWithGoogle → native GoogleAuth");
    try {
      const googleUser = await GoogleAuth.signIn();
      const idToken = googleUser?.authentication?.idToken;
      if (!idToken) throw new Error("Google Sign-In: idToken manquant");
      const firebaseCredential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, firebaseCredential);
      console.log("[auth] signInWithGoogle (native) success", {
        uid: result.user?.uid,
        email: result.user?.email,
      });
      return result;
    } catch (error) {
      console.error("[auth] signInWithGoogle (native) error", error?.code, error?.message, error);
      throw error;
    }
  }

  // Web / PWA : popup d'abord, redirect en fallback.
  // IMPORTANT : ne pas awaiter ensureAuthPersistence() avant signInWithPopup —
  // cela briserait la chaîne du geste utilisateur et bloquerait window.open().
  console.log("[auth] signInWithGoogle → popup", { standalone: isStandalonePwa() });
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    console.log("[auth] signInWithGoogle (popup) success", {
      uid: credential.user?.uid,
      email: credential.user?.email,
    });
    return credential;
  } catch (error) {
    console.error("[auth] signInWithGoogle (popup) error", error?.code, error?.message, error?.customData, error);
    if (
      error?.code === "auth/popup-blocked" ||
      error?.code === "auth/cancelled-popup-request" ||
      error?.code === "auth/popup-not-supported" ||
      error?.code === "auth/web-storage-unsupported"
    ) {
      console.log("[auth] popup non disponible → fallback signInWithRedirect");
      try {
        localStorage.setItem("mrd_google_redirect_pending", "1");
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectError) {
        localStorage.removeItem("mrd_google_redirect_pending");
        console.error("[auth] signInWithRedirect error", redirectError?.code, redirectError);
        throw redirectError;
      }
      return null;
    }
    throw error;
  }
}

/**
 * À appeler une fois au démarrage de l'app pour récupérer le résultat
 * d'un signInWithRedirect précédent (retour depuis Google OAuth).
 * Retourne null si aucun redirect n'était en cours.
 */
export async function getGoogleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      console.log("[auth] getRedirectResult success", {
        uid: result.user.uid,
        email: result.user.email,
      });
    }
    return result;
  } catch (error) {
    console.error("[auth] getRedirectResult error", error?.code, error);
    throw error;
  }
}

// ── Connexion email / mot de passe ────────────────────────────────────────

export async function signInWithEmail(email, password) {
  await ensureAuthPersistence();
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    console.log("[auth] signInWithEmail success", {
      uid: credential.user?.uid,
      email: credential.user?.email,
    });
    return credential;
  } catch (error) {
    console.error("[auth] signInWithEmail error", error?.code, error);
    throw error;
  }
}

export async function signUpWithEmail({ email, password, displayName }) {
  await ensureAuthPersistence();
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    console.log("[auth] signUpWithEmail success", {
      uid: credential.user?.uid,
      email: credential.user?.email,
    });
    return credential;
  } catch (error) {
    console.error("[auth] signUpWithEmail error", error?.code, error);
    throw error;
  }
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim());
}

export function signOutUser() {
  return signOut(auth);
}

// ── Mode de connexion ─────────────────────────────────────────────────────

export function getCurrentAuthMode() {
  const providers = auth.currentUser?.providerData?.map((item) => item.providerId).filter(Boolean) || [];
  if (providers.includes("password")) return "password";
  if (providers.includes("google.com")) return "google";
  return providers[0] || "unknown";
}

export function canChangePassword() {
  return getCurrentAuthMode() === "password";
}

// ── Réauthentification (exportée pour clientFamily.js) ────────────────────

export async function reauthenticateCurrentUserForDeletion(currentPassword = "") {
  if (!auth.currentUser) {
    throw new Error("Aucun compte connecte.");
  }
  const authMode = getCurrentAuthMode();
  if (authMode === "password") {
    if (!currentPassword?.trim()) {
      const error = new Error("Entre ton mot de passe actuel pour confirmer la suppression.");
      error.code = "auth/missing-password";
      throw error;
    }
    if (!auth.currentUser.email) {
      throw new Error("Adresse e-mail introuvable pour verifier ton compte.");
    }
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword.trim());
    await reauthenticateWithCredential(auth.currentUser, credential);
    return;
  }
  if (authMode === "google") {
    await reauthenticateWithPopup(auth.currentUser, googleProvider);
  }
}

// ── Modification du compte ────────────────────────────────────────────────

export async function changePasswordForCurrentUser(oldPassword, newPassword) {
  if (!auth.currentUser) {
    throw new Error("Aucun compte connecté.");
  }
  if (!canChangePassword()) {
    const error = new Error("Ce compte utilise Google.");
    error.code = "auth/no-password-provider";
    throw error;
  }
  if (!oldPassword?.trim()) {
    const error = new Error("Entre ton ancien mot de passe.");
    error.code = "auth/missing-password";
    throw error;
  }
  if (!auth.currentUser.email) {
    throw new Error("Adresse e-mail introuvable pour verifier ton compte.");
  }
  const credential = EmailAuthProvider.credential(auth.currentUser.email, oldPassword.trim());
  await reauthenticateWithCredential(auth.currentUser, credential);
  await updatePassword(auth.currentUser, newPassword);
}

export async function updateEmailForCurrentUser(newEmail) {
  if (!auth.currentUser) {
    throw new Error("Aucun compte connecte.");
  }
  await updateEmail(auth.currentUser, newEmail);
}

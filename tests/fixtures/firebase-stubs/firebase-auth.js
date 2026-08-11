// E2E stub — firebase-auth.js
// Simule un utilisateur connecté (E2E Testeur) après 350 ms.
//
// Un test qui a besoin de l'écran de connexion (auth.standalone) pose
// `window.__E2E_SIGNED_OUT = true` avant le chargement des modules : le stub
// annonce alors « aucun utilisateur ».

const TEST_USER = {
  uid: "e2e-uid-profile-001",
  email: "e2etest@myrollingday.app",
  displayName: "E2E Testeur",
};

let _auth = null;

function isSignedOutMode() {
  return typeof window !== "undefined" && window.__E2E_SIGNED_OUT === true;
}

export function getAuth(app) {
  if (!_auth) _auth = { app, currentUser: null };
  return _auth;
}
export function initializeAuth(app, opts) { return getAuth(app); }

export function onAuthStateChanged(auth, next) {
  if (typeof next !== "function") return () => {};
  // Délai court pour simuler la résolution Firebase Auth
  const timer = setTimeout(() => {
    if (isSignedOutMode()) {
      if (auth) auth.currentUser = null;
      next(null);
      return;
    }
    if (auth) auth.currentUser = TEST_USER;
    next(TEST_USER);
  }, 350);
  return () => clearTimeout(timer);
}

export async function getRedirectResult(auth) { return null; }
export async function signInWithPopup(auth, provider) { return { user: TEST_USER }; }
export async function signInWithRedirect(auth, provider) {}
export async function signOut(auth) {}
export async function createUserWithEmailAndPassword(auth, email, password) {
  return { user: { ...TEST_USER, email } };
}
export async function signInWithEmailAndPassword(auth, email, password) {
  return { user: { ...TEST_USER, email } };
}
export async function sendPasswordResetEmail() {}
export async function updateEmail() {}
export async function updatePassword() {}
export async function reauthenticateWithCredential(user, credential) { return { user }; }
export async function reauthenticateWithPopup(user, provider) { return { user }; }
export async function updateProfile(user, profile) {}
export async function deleteUser() {}
export async function setPersistence() {}

export class EmailAuthProvider {
  static credential(email, password) { return { email, password }; }
}
export class GoogleAuthProvider {
  static PROVIDER_ID = "google.com";
  addScope() { return this; }
  setCustomParameters() { return this; }
}

export async function signInWithCredential(auth, credential) { return { user: TEST_USER, credential }; }

export const browserLocalPersistence = "LOCAL";
export const browserSessionPersistence = "SESSION";
export const indexedDBLocalPersistence = "INDEXED_DB";
export const inMemoryPersistence = "NONE";
export function connectAuthEmulator() {}

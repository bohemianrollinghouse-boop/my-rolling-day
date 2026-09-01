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

// ── Surface exigée par @capacitor-firebase/authentication ─────────────────
//
// La couche WEB du plugin importe 44 symboles de `firebase/auth`, qu'elle
// utilise ou non. Rollup resout les imports statiquement : un seul symbole
// absent fait echouer le build E2E entier — et donc les 400 tests, puisque le
// build est un hook partage. Ces stubs ne simulent rien, ils existent pour que
// le graphe d'imports se resolve.
//
// A completer si une montee de version du plugin en importe d'autres. Le
// symptome est reconnaissable : « X is not exported by firebase-auth.js ».

export class FacebookAuthProvider {}
export class GithubAuthProvider {}
export class TwitterAuthProvider {}
export class OAuthProvider {
  constructor(providerId) { this.providerId = providerId; }
  credential() { return { providerId: this.providerId }; }
}
export class OAuthCredential {}
export class RecaptchaVerifier {}

export async function applyActionCode() {}
export async function confirmPasswordReset() {}
export async function fetchSignInMethodsForEmail() { return []; }
export function getAdditionalUserInfo() { return null; }
export function isSignInWithEmailLink() { return false; }
export async function linkWithCredential(user, credential) { return { user, credential }; }
export async function linkWithPhoneNumber(user) { return { user }; }
export async function linkWithPopup(user) { return { user }; }
export async function linkWithRedirect() {}
export async function reload() {}
export async function revokeAccessToken() {}
export async function sendEmailVerification() {}
export async function sendSignInLinkToEmail() {}
export async function signInAnonymously() { return { user: TEST_USER }; }
export async function signInWithCustomToken() { return { user: TEST_USER }; }
export async function signInWithEmailLink() { return { user: TEST_USER }; }
export async function signInWithPhoneNumber() { return { user: TEST_USER }; }
export async function unlink(user) { return user; }
export async function verifyBeforeUpdateEmail() {}

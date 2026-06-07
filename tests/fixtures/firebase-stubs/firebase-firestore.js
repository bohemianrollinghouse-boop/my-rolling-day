// E2E stub — firebase-firestore.js
// Simule Firestore avec un profil sans famille, puis déclenche la transition
// vers la page d'accueil après writeBatch.commit() via window.__e2eStubs.

const USER_ID = "e2e-uid-profile-001";
const FAMILY_ID = "e2e-family-profile-001";

const DEFAULT_PROFILE = {
  uid: "e2e-uid-profile-001",
  email: "e2etest@myrollingday.app",
  displayName: "E2E Testeur",
  familyIds: [],
  currentFamilyId: "",
  pendingOnboardingFamilyId: "",
};

// ── Coordination test ─────────────────────────────────────────────────────────

if (!window.__e2eStubs) {
  window.__e2eStubs = {
    familyCreated: false,
    createdFamilyId: null,
    batchCommitCount: 0,
    profileListeners: [],
    peopleListeners: [],
    membersListeners: [],
    inviteListeners: [],
    plannerListeners: [],

    _onBatchCommit(ops) {
      this.familyCreated = true;
      this.batchCommitCount++;
      const fId = this.createdFamilyId || FAMILY_ID;
      const profileWithFamily = {
        ...DEFAULT_PROFILE,
        familyIds: [fId],
        currentFamilyId: fId,
        pendingOnboardingFamilyId: "",
      };

      // 1. Re-fire profil utilisateur avec famille (déclenche listFamilies)
      setTimeout(() => {
        const snap = makeSnap(true, profileWithFamily);
        for (const cb of this.profileListeners) {
          try { cb(snap); } catch (e) { console.warn("[e2e-stub] profile listener error", e); }
        }
      }, 120);

      // 2. Re-fire watchFamilyPeople — le créateur arrive comme personne liée
      setTimeout(() => {
        const person = {
          id: "e2e-person-001",
          displayName: DEFAULT_PROFILE.displayName,
          color: "#DC2626",
          type: "adult",
          profileMode: "app_user",
          active: true,
          linkedAccountId: USER_ID,
          canCompleteTasks: true,
          role: "admin",
          mood: "",
          message: "",
        };
        const snapList = makeSnapList([person], false);
        for (const cb of this.peopleListeners) {
          try { cb(snapList); } catch (e) { console.warn("[e2e-stub] people listener error", e); }
        }
      }, 320);

      // 3. Re-fire watchFamilyMembers
      setTimeout(() => {
        const member = { uid: USER_ID, role: "admin", displayName: DEFAULT_PROFILE.displayName, email: DEFAULT_PROFILE.email };
        const snapList = makeSnapList([member], false);
        for (const cb of this.membersListeners) {
          try { cb(snapList); } catch (e) { console.warn("[e2e-stub] members listener error", e); }
        }
      }, 440);
    },
  };
}

// ── Helpers snapshot ──────────────────────────────────────────────────────────

function makeSnap(exists, data) {
  const _data = data ? { ...data } : null;
  return {
    exists: () => exists,
    data: () => _data,
    id: _data ? (_data.id || _data.uid || "stub-id") : "stub-id",
    metadata: { fromCache: false, hasPendingWrites: false },
  };
}

function makeSnapList(items, fromCache) {
  const docs = items.map((item) => makeSnap(true, item));
  return {
    docs,
    forEach(fn) { docs.forEach(fn); },
    size: items.length,
    empty: items.length === 0,
    metadata: { fromCache: Boolean(fromCache), hasPendingWrites: false },
  };
}

// ── Références ────────────────────────────────────────────────────────────────

let _autoIdSeq = 0;
function nextAutoId() {
  _autoIdSeq++;
  if (_autoIdSeq === 1) {
    // Premier appel auto = le foyer lui-même
    window.__e2eStubs.createdFamilyId = FAMILY_ID;
    return FAMILY_ID;
  }
  return "e2e-auto-" + _autoIdSeq;
}

class DocRef {
  constructor(path) { this._path = path; this.id = path ? path.split("/").pop() : ""; }
}
class CollRef {
  constructor(path) { this._path = path; this.id = path ? path.split("/").pop() : ""; }
}

// ── API Firestore ─────────────────────────────────────────────────────────────

export function initializeFirestore(app, options) {
  return { _type: "firestore", app, _path: "" };
}
export function persistentLocalCache(options) {
  return { kind: "persistent", ...(options || {}) };
}
export function getFirestore(app) { return { _type: "firestore", app, _path: "" }; }
export function connectFirestoreEmulator() {}

export function collection(dbOrRef, ...parts) {
  const base = (dbOrRef && dbOrRef._path) ? dbOrRef._path : "";
  const path = base ? base + "/" + parts.join("/") : parts.join("/");
  return new CollRef(path);
}

export function doc(dbOrRef, ...parts) {
  if (parts.length === 0) {
    const base = (dbOrRef && dbOrRef._path) ? dbOrRef._path : "";
    return new DocRef(base + "/" + nextAutoId());
  }
  const base = (dbOrRef && dbOrRef._path) ? dbOrRef._path : "";
  const path = base ? base + "/" + parts.join("/") : parts.join("/");
  return new DocRef(path);
}

export async function getDoc(ref) {
  const path = (ref && ref._path) ? ref._path : "";
  const stubs = window.__e2eStubs;
  if (path.includes(USER_ID)) {
    const profile = stubs.familyCreated
      ? { ...DEFAULT_PROFILE, familyIds: [stubs.createdFamilyId || FAMILY_ID], currentFamilyId: stubs.createdFamilyId || FAMILY_ID }
      : DEFAULT_PROFILE;
    return makeSnap(true, profile);
  }
  if (path.startsWith("families/") && stubs.familyCreated) {
    const fId = path.split("/")[1] || FAMILY_ID;
    return makeSnap(true, { id: fId, name: "Mon Foyer E2E", memberCount: 1 });
  }
  return makeSnap(false, null);
}

export async function getDocs(ref) {
  const path = (ref && ref._path) ? ref._path : "";
  const stubs = window.__e2eStubs;
  if (path.startsWith("families/") && stubs.familyCreated) {
    const fId = path.split("/")[1] || FAMILY_ID;
    return makeSnapList([{ id: fId, name: "Mon Foyer E2E" }], false);
  }
  return makeSnapList([], false);
}

export async function setDoc(ref, data, opts) {}
export async function updateDoc(ref, data) {}
export async function deleteDoc(ref) {}
export async function addDoc(ref, data) { return new DocRef("e2e-added-doc"); }

export function writeBatch(db) {
  const ops = [];
  return {
    set(ref, data, opts) { ops.push({ op: "set", path: ref ? ref._path : "", data }); return this; },
    update(ref, data) { ops.push({ op: "update", path: ref ? ref._path : "", data }); return this; },
    delete(ref) { ops.push({ op: "delete", path: ref ? ref._path : "" }); return this; },
    async commit() {
      console.log("[e2e-stub] writeBatch.commit() — ops:", ops.length);
      window.__e2eStubs._onBatchCommit(ops);
    },
  };
}

export function onSnapshot(ref, callbackOrOptions, onError) {
  const callback = typeof callbackOrOptions === "function" ? callbackOrOptions : onError;
  if (typeof callback !== "function") return () => {};

  const path = (ref && ref._path) ? ref._path : "";
  const stubs = window.__e2eStubs;

  const isProfile = path.includes(USER_ID) && !path.includes("families/");
  const isPeople = path.includes("/people") || (path.includes("families/") && path.endsWith("/people"));
  const isMembers = path.includes("/member");
  const isPlanner = path.includes("planner");
  const isInvite = path.includes("invitation");

  if (isProfile && !stubs.profileListeners.includes(callback)) stubs.profileListeners.push(callback);
  else if (isPeople && !stubs.peopleListeners.includes(callback)) stubs.peopleListeners.push(callback);
  else if (isMembers && !stubs.membersListeners.includes(callback)) stubs.membersListeners.push(callback);
  else if (isInvite && !stubs.inviteListeners.includes(callback)) stubs.inviteListeners.push(callback);
  else if (isPlanner && !stubs.plannerListeners.includes(callback)) stubs.plannerListeners.push(callback);

  // Tir initial après un court délai
  setTimeout(() => {
    try {
      if (isProfile) callback(makeSnap(true, DEFAULT_PROFILE));
      else if (isPeople || isMembers || isInvite) callback(makeSnapList([], false));
      else if (isPlanner) callback(makeSnap(false, null));
      else callback(makeSnap(false, null));
    } catch (e) { console.warn("[e2e-stub] onSnapshot initial fire error", path, e); }
  }, 80);

  return () => {
    const remove = (arr) => { const i = arr.indexOf(callback); if (i !== -1) arr.splice(i, 1); };
    remove(stubs.profileListeners);
    remove(stubs.peopleListeners);
    remove(stubs.membersListeners);
    remove(stubs.inviteListeners);
    remove(stubs.plannerListeners);
  };
}

export function collectionGroup(db, collectionId) { return new CollRef(collectionId); }
export function query(ref, ...constraints) { return ref; }
export function where() { return { _type: "where" }; }
export function orderBy() { return { _type: "orderBy" }; }
export function limit() { return { _type: "limit" }; }
export function limitToLast() { return { _type: "limitToLast" }; }
export function startAfter() { return { _type: "startAfter" }; }
export function endBefore() { return { _type: "endBefore" }; }
export function serverTimestamp() { return new Date().toISOString(); }

export class Timestamp {
  constructor(s, ns) { this.seconds = s; this.nanoseconds = ns; }
  static fromDate(d) { return new Timestamp(Math.floor(d.getTime() / 1000), 0); }
  static now() { return Timestamp.fromDate(new Date()); }
  toDate() { return new Date(this.seconds * 1000); }
  toMillis() { return this.seconds * 1000; }
}

export function arrayUnion(...items) { return { _type: "arrayUnion", items }; }
export function arrayRemove(...items) { return { _type: "arrayRemove", items }; }
export function increment(n) { return { _type: "increment", n }; }
export function deleteField() { return { _type: "deleteField" }; }
export function documentId() { return "__name__"; }

export class FieldPath {
  constructor(...segments) { this._segments = segments; }
  static documentId() { return "__name__"; }
}

export async function runTransaction(db, fn) {
  return fn({ get: async () => makeSnap(false, null), set() {}, update() {}, delete() {} });
}

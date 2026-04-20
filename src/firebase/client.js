import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { FIREBASE_CONFIG, MEMBER_COLORS } from "../constants.js";
import { createDefaultState } from "../data/defaultState.js";

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

let persistenceReady = false;

function randomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function colorForUser(uid = "") {
  let total = 0;
  for (let index = 0; index < uid.length; index += 1) {
    total += uid.charCodeAt(index);
  }
  return MEMBER_COLORS[total % MEMBER_COLORS.length];
}

function colorForPerson(seed = "") {
  let total = 0;
  const text = String(seed || "person");
  for (let index = 0; index < text.length; index += 1) {
    total += text.charCodeAt(index);
  }
  return MEMBER_COLORS[total % MEMBER_COLORS.length];
}

function accountLabel(user, preferredName = "") {
  return preferredName || user?.displayName || user?.email?.split("@")[0] || "Moi";
}

export function formatAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
    return "Mot de passe incorrect.";
  }
  if (code === "auth/user-not-found") {
    return "Aucun compte n'existe avec cet email.";
  }
  if (code === "auth/invalid-email") {
    return "Adresse email invalide.";
  }
  if (code === "auth/email-already-in-use") {
    return "Cette adresse email est deja utilisee.";
  }
  if (code === "auth/network-request-failed") {
    return "Erreur reseau. Verifie ta connexion Internet.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "La fenetre Google a ete fermee avant la fin.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Cette methode de connexion n'est pas activee dans Firebase.";
  }
  if (code === "auth/too-many-requests") {
    return "Trop de tentatives. Reessaie un peu plus tard.";
  }
  if (code === "auth/weak-password") {
    return "Le nouveau mot de passe est trop faible.";
  }
  if (code === "auth/requires-recent-login") {
    return "Pour changer ce mot de passe, reconnecte-toi puis reessaie.";
  }
  if (code === "auth/no-password-provider") {
    return "Ce compte utilise Google. Le mot de passe ne se change pas ici.";
  }
  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return "Connexion reussie, mais Firestore refuse l'acces. Verifie les regles Firebase.";
  }
  return error?.message || "Erreur d'authentification inconnue.";
}

export function formatFirestoreError(error) {
  const code = error?.code || "";
  if (code === "permission-denied" || code === "firestore/permission-denied") {
    return "Connexion reussie, mais Firestore refuse l'acces. Verifie les regles Firebase.";
  }
  if (code === "unavailable" || code === "firestore/unavailable") {
    return "Firestore est temporairement indisponible.";
  }
  return error?.message || "Erreur Firestore inconnue.";
}

export async function ensureAuthPersistence() {
  if (persistenceReady) return;
  await setPersistence(auth, browserLocalPersistence);
  persistenceReady = true;
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, (user) => {
    console.log("[auth] onAuthStateChanged", {
      uid: user?.uid || null,
      email: user?.email || null,
    });
    callback(user);
  });
}

export async function signInWithGoogle() {
  await ensureAuthPersistence();
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    console.log("[auth] signInWithGoogle success", {
      uid: credential.user?.uid,
      email: credential.user?.email,
    });
    return credential;
  } catch (error) {
    console.error("[auth] signInWithGoogle error", error?.code, error);
    throw error;
  }
}

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
    if (displayName) {
      await updateProfile(credential.user, { displayName });
    }
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

export function getCurrentAuthMode() {
  const providers = auth.currentUser?.providerData?.map((item) => item.providerId).filter(Boolean) || [];
  if (providers.includes("password")) return "password";
  if (providers.includes("google.com")) return "google";
  return providers[0] || "unknown";
}

export function canChangePassword() {
  return getCurrentAuthMode() === "password";
}

export async function changePasswordForCurrentUser(newPassword) {
  if (!auth.currentUser) {
    throw new Error("Aucun compte connecte.");
  }
  if (!canChangePassword()) {
    const error = new Error("Ce compte utilise Google.");
    error.code = "auth/no-password-provider";
    throw error;
  }
  await updatePassword(auth.currentUser, newPassword);
}

export async function updateEmailForCurrentUser(newEmail) {
  if (!auth.currentUser) {
    throw new Error("Aucun compte connecte.");
  }
  await updateEmail(auth.currentUser, newEmail);
}

export async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  try {
    await setDoc(
      ref,
      {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || user.email?.split("@")[0] || "Utilisateur",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    return ref;
  } catch (error) {
    console.error("[firestore] ensureUserProfile error", error?.code, error);
    throw error;
  }
}

export function watchUserProfile(uid, callback, onError) {
  return onSnapshot(
    doc(db, "users", uid),
    (snapshot) => {
      callback(snapshot.exists() ? snapshot.data() : null);
    },
    (error) => {
      console.error("[firestore] watchUserProfile error", error?.code, error);
      if (onError) onError(error);
    },
  );
}

export async function listFamilies(familyIds) {
  try {
    const docs = await Promise.all(
      (familyIds || []).map(async (familyId) => {
        const snapshot = await getDoc(doc(db, "families", familyId));
        return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
      }),
    );
    return docs.filter(Boolean);
  } catch (error) {
    console.error("[firestore] listFamilies error", error?.code, error);
    throw error;
  }
}

export async function createFamily({ user, familyName, role = "admin" }) {
  const familyRef = doc(collection(db, "families"));
  const inviteCode = randomCode();
  const userRef = doc(db, "users", user.uid);
  const memberRef = doc(db, "families", familyRef.id, "members", user.uid);
  const personRef = doc(collection(db, "families", familyRef.id, "people"));
  const plannerRef = doc(db, "families", familyRef.id, "planner", "state");
  const batch = writeBatch(db);
  const accountName = accountLabel(user);

  batch.set(familyRef, {
    name: familyName.trim(),
    inviteCode,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(memberRef, {
    uid: user.uid,
    displayName: user.displayName || user.email?.split("@")[0] || "Utilisateur",
    email: user.email || "",
    role,
    color: colorForUser(user.uid),
    joinedAt: serverTimestamp(),
  });
  batch.set(plannerRef, {
    data: createDefaultState(),
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
  batch.set(
    userRef,
    {
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || user.email?.split("@")[0] || "Utilisateur",
      familyIds: arrayUnion(familyRef.id),
      currentFamilyId: familyRef.id,
      linkedMemberIdsByHousehold: {
        [familyRef.id]: personRef.id,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(personRef, {
    displayName: accountName,
    type: "adult",
    profileMode: "app_user",
    linkedAccountId: user.uid,
    canCompleteTasks: true,
    active: true,
    role,
    sortOrder: 0,
    color: colorForPerson(accountName || user.uid),
    mood: "",
    message: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { familyId: familyRef.id, memberId: personRef.id };
}

export async function ensureLinkedHouseholdProfile(familyId, user, preferredName = "") {
  if (!familyId || !user?.uid) return "";
  const peopleRef = collection(db, "families", familyId, "people");
  const existing = await getDocs(query(peopleRef, where("linkedAccountId", "==", user.uid)));
  if (!existing.empty) {
    return existing.docs[0].id;
  }

  const snapshot = await getDocs(peopleRef);
  const personRef = doc(peopleRef);
  const displayName = accountLabel(user, preferredName);
  await setDoc(personRef, {
    displayName,
    type: "adult",
    profileMode: "app_user",
    linkedAccountId: user.uid,
    canCompleteTasks: true,
    active: true,
    sortOrder: snapshot.size,
    color: colorForPerson(displayName || user.uid),
    mood: "",
    message: "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return personRef.id;
}

export function watchFamilyPeople(familyId, callback, onError) {
  return onSnapshot(
    collection(db, "families", familyId, "people"),
    (snapshot) => {
      callback(
        snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0)),
      );
    },
    (error) => {
      console.error("[firestore] watchFamilyPeople error", error?.code, error);
      if (onError) onError(error);
    },
  );
}

export async function createFamilyPerson(familyId, person) {
  const ref = doc(collection(db, "families", familyId, "people"));
  const name = String(person.displayName || "").trim();
  const normalizedType = person.type === "animal" ? "animal" : person.type === "child" ? "child" : "adult";
  const profileMode = person.profileMode || (normalizedType === "adult" ? "app_user" : "context");
  await setDoc(ref, {
    displayName: name,
    type: normalizedType,
    profileMode,
    linkedAccountId: person.linkedAccountId || "",
    canCompleteTasks: Boolean(person.canCompleteTasks),
    active: typeof person.active === "boolean" ? person.active : true,
    role: normalizedType === "adult" ? person.role || "member" : normalizedType,
    sortOrder: typeof person.sortOrder === "number" ? person.sortOrder : 0,
    color: person.color || colorForPerson(name || ref.id),
    mood: person.mood || "",
    message: person.message || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function updateFamilyPerson(familyId, personId, updates) {
  return updateDoc(doc(db, "families", familyId, "people", personId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export function deleteFamilyPerson(familyId, personId) {
  return deleteDoc(doc(db, "families", familyId, "people", personId));
}

export async function saveFamilyPeopleOrder(familyId, people) {
  const batch = writeBatch(db);
  people.forEach((person, index) => {
    batch.update(doc(db, "families", familyId, "people", person.id), {
      sortOrder: index,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function joinFamily({ user, inviteCode }) {
  return acceptHouseholdInvitation({ user, inviteCode });
}

export async function createHouseholdInvitation({ familyId, personId, createdBy, targetEmail = "" }) {
  const personRef = doc(db, "families", familyId, "people", personId);
  const personSnap = await getDoc(personRef);
  if (!personSnap.exists()) {
    throw new Error("Membre du foyer introuvable.");
  }
  const person = personSnap.data();
  if (person.linkedAccountId) {
    throw new Error("Ce membre a deja un compte lie.");
  }
  if (person.type === "child" || person.type === "animal" || person.profileMode === "context") {
    throw new Error("On n'invite pas ce profil du foyer.");
  }

  const code = randomCode(8);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitationRef = doc(collection(db, "families", familyId, "invitations"));
  await setDoc(invitationRef, {
    code,
    familyId,
    memberId: personId,
    memberName: person.displayName || "Membre",
    email: String(targetEmail || "").trim().toLowerCase(),
    role: person.role || "member",
    status: "pending",
    createdBy,
    expiresAt,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: invitationRef.id, code, memberName: person.displayName || "Membre" };
}

export function watchHouseholdInvitations(familyId, callback, onError) {
  return onSnapshot(
    collection(db, "families", familyId, "invitations"),
    (snapshot) => {
      callback(
        snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort((left, right) => String(right.createdAt?.seconds || 0).localeCompare(String(left.createdAt?.seconds || 0))),
      );
    },
    (error) => {
      console.error("[firestore] watchHouseholdInvitations error", error?.code, error);
      if (onError) onError(error);
    },
  );
}

export async function acceptHouseholdInvitation({ user, inviteCode }) {
  const normalized = String(inviteCode || "").trim().toUpperCase();
  if (!normalized) {
    throw new Error("Entre un code d invitation.");
  }

  const invitationQuery = query(collectionGroup(db, "invitations"), where("code", "==", normalized), limit(1));
  const invitationResults = await getDocs(invitationQuery);
  if (invitationResults.empty) {
    throw new Error("Invitation introuvable.");
  }

  const invitationDoc = invitationResults.docs[0];
  const invitation = invitationDoc.data();
  if (invitation.status !== "pending") {
    throw new Error("Cette invitation n est plus disponible.");
  }
  const expiresAt = invitation.expiresAt?.toDate ? invitation.expiresAt.toDate() : invitation.expiresAt ? new Date(invitation.expiresAt) : null;
  if (expiresAt && expiresAt < new Date()) {
    throw new Error("Ce code a expire. Demande un nouveau code a l administrateur du foyer.");
  }
  if (invitation.email && invitation.email !== String(user.email || "").trim().toLowerCase()) {
    throw new Error("Cette invitation est reservee a une autre adresse email.");
  }

  const familyId = invitation.familyId;
  const personId = invitation.memberId;
  const personRef = doc(db, "families", familyId, "people", personId);
  const personSnap = await getDoc(personRef);
  if (!personSnap.exists()) {
    throw new Error("Le membre vise par cette invitation n existe plus.");
  }
  const person = personSnap.data();
  if (person.linkedAccountId && person.linkedAccountId !== user.uid) {
    throw new Error("Ce membre du foyer est deja rattache a un autre compte.");
  }

  const batch = writeBatch(db);
  const userRef = doc(db, "users", user.uid);
  const memberRef = doc(db, "families", familyId, "members", user.uid);
  const accountName = user.displayName || user.email?.split("@")[0] || person.displayName || "Utilisateur";

  batch.set(
    memberRef,
    {
      uid: user.uid,
      displayName: accountName,
      email: user.email || "",
      role: invitation.role || person.role || "member",
      color: colorForUser(user.uid),
      joinedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.update(personRef, {
    linkedAccountId: user.uid,
    updatedAt: serverTimestamp(),
  });
  batch.set(
    userRef,
    {
      uid: user.uid,
      email: user.email || "",
      displayName: accountName,
      familyIds: arrayUnion(familyId),
      currentFamilyId: familyId,
      [`linkedMemberIdsByHousehold.${familyId}`]: personId,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.update(invitationDoc.ref, {
    status: "accepted",
    acceptedByUserId: user.uid,
    acceptedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "families", familyId), {
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
  return { familyId, personId };
}

export function setCurrentFamily(uid, familyId) {
  return updateDoc(doc(db, "users", uid), {
    currentFamilyId: familyId,
    updatedAt: serverTimestamp(),
  });
}

export function renameFamily(familyId, name) {
  return updateDoc(doc(db, "families", familyId), {
    name: name.trim(),
    updatedAt: serverTimestamp(),
  });
}

export function watchFamilyMembers(familyId, callback, onError) {
  return onSnapshot(
    collection(db, "families", familyId, "members"),
    (snapshot) => {
      callback(
        snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        })),
      );
    },
    (error) => {
      console.error("[firestore] watchFamilyMembers error", error?.code, error);
      if (onError) onError(error);
    },
  );
}

export function updateFamilyMemberRole(familyId, uid, role) {
  return updateDoc(doc(db, "families", familyId, "members", uid), {
    role,
  });
}

export async function removeFamilyMember(familyId, uid) {
  await deleteDoc(doc(db, "families", familyId, "members", uid));
  await updateDoc(doc(db, "users", uid), {
    familyIds: arrayRemove(familyId),
    currentFamilyId: "",
    updatedAt: serverTimestamp(),
  });
}

export async function saveDisplayName(uid, displayName, familyIds = []) {
  await updateDoc(doc(db, "users", uid), {
    displayName: displayName.trim(),
    updatedAt: serverTimestamp(),
  });
  await Promise.all(
    (familyIds || []).map((familyId) =>
      updateDoc(doc(db, "families", familyId, "members", uid), {
        displayName: displayName.trim(),
      }),
    ),
  );
}

export async function saveUserEmail(uid, email, familyIds = []) {
  await updateDoc(doc(db, "users", uid), {
    email: email.trim(),
    updatedAt: serverTimestamp(),
  });
  await Promise.all(
    (familyIds || []).map((familyId) =>
      updateDoc(doc(db, "families", familyId, "members", uid), {
        email: email.trim(),
      }),
    ),
  );
}

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

import {
  arrayRemove,
  arrayUnion,
  addDoc,
  collection,
  collectionGroup,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  deleteUser,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, db, randomCode, colorForUser, colorForPerson, accountLabel } from "./core.js";
import { reauthenticateCurrentUserForDeletion } from "./clientAuth.js";
import { createDefaultState } from "../data/defaultState.js";

// ── Profil utilisateur ────────────────────────────────────────────────────

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
      callback(snapshot.exists() ? snapshot.data() : null, snapshot.metadata.fromCache);
    },
    (error) => {
      console.error("[firestore] watchUserProfile error", error?.code, error);
      if (onError) onError(error);
    },
  );
}

// ── Familles ──────────────────────────────────────────────────────────────

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

export function watchFamilies(familyIds, callback, onError) {
  // Déduplique pour éviter que des IDs en double bloquent la garde cacheStates.size
  const ids = [...new Set((familyIds || []).filter(Boolean))];
  if (!ids.length) {
    callback([], false);
    return () => {};
  }

  const records = new Map();
  const cacheStates = new Map();

  function fireIfReady() {
    if (cacheStates.size < ids.length) return;
    callback(
      ids.map((id) => records.get(id)).filter(Boolean),
      Array.from(cacheStates.values()).some(Boolean),
    );
  }

  const unsubscribers = ids.map((familyId) =>
    onSnapshot(
      doc(db, "families", familyId),
      (snapshot) => {
        if (snapshot.exists()) {
          records.set(familyId, { id: snapshot.id, ...snapshot.data() });
        } else {
          records.delete(familyId);
        }
        cacheStates.set(familyId, snapshot.metadata.fromCache);
        fireIfReady();
      },
      (error) => {
        console.error("[firestore] watchFamilies error", error?.code, error);
        // Marquer ce foyer comme "résolu" même en cas d'erreur pour ne pas bloquer
        // le callback si un autre foyer est inaccessible (ex. règle de sécurité refusée).
        cacheStates.set(familyId, false);
        fireIfReady();
        if (onError) onError(error);
      },
    ),
  );

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}

export async function createFamily({ user, familyName, role = "admin", startOnboarding = false }) {
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
      ...(startOnboarding ? { pendingOnboardingFamilyId: familyRef.id } : {}),
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
  return { familyId: familyRef.id, memberId: personRef.id, inviteCode };
}

export async function previewHouseholdInvitation(inviteCode) {
  const normalized = String(inviteCode || "").trim().toUpperCase().replace(/-/g, "");
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

  const expiresAt = invitation.expiresAt?.toDate
    ? invitation.expiresAt.toDate()
    : invitation.expiresAt
      ? new Date(invitation.expiresAt)
      : null;
  if (expiresAt && expiresAt < new Date()) {
    throw new Error("Ce code a expire. Demande un nouveau code a l administrateur du foyer.");
  }

  const familySnap = await getDoc(doc(db, "families", invitation.familyId));
  if (!familySnap.exists()) {
    throw new Error("Le foyer lie a cette invitation est introuvable.");
  }

  return {
    code: normalized,
    familyId: invitation.familyId,
    householdName: familySnap.data()?.name || "Votre foyer",
    memberId: invitation.memberId || "",
    memberName: invitation.memberName || "",
    role: invitation.role || "member",
    email: invitation.email || "",
    status: invitation.status || "pending",
  };
}

export function completePendingFamilyOnboarding(uid, familyId) {
  if (!uid || !familyId) {
    throw new Error("Impossible de finaliser cet onboarding.");
  }
  return setDoc(
    doc(db, "users", uid),
    {
      onboardingCompletedFamilyIds: arrayUnion(familyId),
      pendingOnboardingFamilyId: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function ensureLinkedHouseholdProfile(familyId, user, preferredName = "") {
  if (!familyId || !user?.uid) return "";
  const peopleRef = collection(db, "families", familyId, "people");
  const userRef = doc(db, "users", user.uid);
  const existing = await getDocs(query(peopleRef, where("linkedAccountId", "==", user.uid)));
  if (!existing.empty) {
    const existingId = existing.docs[0].id;
    await setDoc(
      userRef,
      {
        linkedMemberIdsByHousehold: {
          [familyId]: existingId,
        },
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return existingId;
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
  await setDoc(
    userRef,
    {
      linkedMemberIdsByHousehold: {
        [familyId]: personRef.id,
      },
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return personRef.id;
}

// ── Personnes du foyer ────────────────────────────────────────────────────

export function watchFamilyPeople(familyId, callback, onError) {
  return onSnapshot(
    collection(db, "families", familyId, "people"),
    (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({
          id: item.id,
          ...item.data(),
        }))
        .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0));
      // Pass fromCache so callers can distinguish provisional cache data from authoritative server data.
      callback(items, snapshot.metadata.fromCache);
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

// ── Rejoindre un foyer ────────────────────────────────────────────────────

export async function joinFamily({ user, inviteCode, startOnboarding = false }) {
  return acceptHouseholdInvitation({ user, inviteCode, startOnboarding });
}

// ── Invitations ───────────────────────────────────────────────────────────

export async function createHouseholdInvitation({ familyId, personId, createdBy, targetEmail = "" }) {
  const personRef = doc(db, "families", familyId, "people", personId);
  const personSnap = await getDoc(personRef);
  if (!personSnap.exists()) {
    throw new Error("Membre du foyer introuvable.");
  }
  const person = personSnap.data();
  // Note : on autorise la re-génération d'un code même si linkedAccountId est déjà défini.
  // L'acceptation reste sécurisée : seul le même uid peut ré-accepter (voir acceptHouseholdInvitation).
  if (person.type === "animal") {
    throw new Error("On n'invite pas ce profil du foyer.");
  }

  const code = randomCode(6);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitationRef = doc(collection(db, "families", familyId, "invitations"));

  // Expire les anciens codes pending pour ce membre avant d'en créer un nouveau
  const oldQuery = query(
    collection(db, "families", familyId, "invitations"),
    where("memberId", "==", personId),
    where("status", "==", "pending"),
  );
  const oldSnap = await getDocs(oldQuery);
  const batch = writeBatch(db);
  oldSnap.docs.forEach((d) => batch.update(d.ref, { status: "superseded", updatedAt: serverTimestamp() }));
  batch.set(invitationRef, {
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
  await batch.commit();
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

export async function acceptHouseholdInvitation({ user, inviteCode, startOnboarding = false }) {
  const normalized = String(inviteCode || "").trim().toUpperCase().replace(/-/g, "");
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
    throw new Error("Ce membre du foyer est déjà rattaché à un autre compte.");
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
    profileMode: "app_user",
    canCompleteTasks: true,
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
      ...(startOnboarding ? { pendingOnboardingFamilyId: familyId } : {}),
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

  // Trigger join notification via Cloud Function
  try {
    await addDoc(collection(db, "families", familyId, "joinEvents"), {
      joinerUid: user.uid,
      joinerName: accountName,
      memberName: invitation.memberName || accountName,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn("[acceptInvitation] joinEvent write failed", e);
  }

  return { familyId, personId };
}

// ── Gestion du foyer ──────────────────────────────────────────────────────

/**
 * Supprime définitivement un foyer et toutes ses données.
 * Réservé à un admin. Retire le foyer de chaque profil utilisateur membre.
 *
 * Sous-collections supprimées : members · people · invitations · joinEvents · planner/state
 * Document racine : families/{familyId}
 */
export async function deleteFamily({ familyId, user, nextFamilyId = "" }) {
  if (!familyId || !user?.uid) throw new Error("Données manquantes.");

  // Vérification du rôle admin
  const selfMemberSnap = await getDoc(doc(db, "families", familyId, "members", user.uid));
  if (!selfMemberSnap.exists()) throw new Error("Tu n'es pas membre de ce foyer.");
  if (selfMemberSnap.data()?.role !== "admin") {
    throw new Error("Seul un admin peut supprimer le foyer.");
  }

  // Chargement de toutes les sous-collections
  const [membersSnap, peopleSnap, invitationsSnap, joinEventsSnap] = await Promise.all([
    getDocs(collection(db, "families", familyId, "members")),
    getDocs(collection(db, "families", familyId, "people")),
    getDocs(collection(db, "families", familyId, "invitations")),
    getDocs(collection(db, "families", familyId, "joinEvents")),
  ]);

  const batch = writeBatch(db);

  // Retirer le foyer du profil de chaque membre
  for (const memberDoc of membersSnap.docs) {
    const uid = memberDoc.data()?.uid || memberDoc.id;
    if (!uid) continue;
    batch.set(
      doc(db, "users", uid),
      {
        familyIds: arrayRemove(familyId),
        currentFamilyId: uid === user.uid ? (nextFamilyId || "") : "",
        [`linkedMemberIdsByHousehold.${familyId}`]: deleteField(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    batch.delete(memberDoc.ref);
  }

  // Supprimer toutes les personnes, invitations et joinEvents
  for (const d of peopleSnap.docs)    batch.delete(d.ref);
  for (const d of invitationsSnap.docs) batch.delete(d.ref);
  for (const d of joinEventsSnap.docs)  batch.delete(d.ref);

  // Supprimer le planner et le document du foyer lui-même
  batch.delete(doc(db, "families", familyId, "planner", "state"));
  batch.delete(doc(db, "families", familyId));

  await batch.commit();
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
    role: role === "admin" ? "admin" : "member",
    updatedAt: serverTimestamp(),
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

// ── Helpers privés ────────────────────────────────────────────────────────

async function resolveLinkedHouseholdProfileId(familyId, uid, fallbackPersonId = "") {
  if (fallbackPersonId) return fallbackPersonId;
  const peopleSnap = await getDocs(
    query(collection(db, "families", familyId, "people"), where("linkedAccountId", "==", uid), limit(1)),
  );
  return peopleSnap.empty ? "" : peopleSnap.docs[0].id;
}

async function assertUserIsNotLastAdmin(familyId, uid) {
  const memberSnap = await getDoc(doc(db, "families", familyId, "members", uid));
  if (!memberSnap.exists()) return;
  const role = memberSnap.data()?.role || "member";
  if (role !== "admin") return;

  const membersSnap = await getDocs(collection(db, "families", familyId, "members"));
  const adminCount = membersSnap.docs.filter((item) => (item.data()?.role || "member") === "admin").length;
  if (adminCount > 1) return;

  const familySnap = await getDoc(doc(db, "families", familyId));
  const familyName = familySnap.exists() ? familySnap.data()?.name || "ce foyer" : "ce foyer";
  throw new Error(`Tu es le dernier admin du foyer "${familyName}". Designe d'abord un autre admin.`);
}

// ── Quitter / supprimer un compte ─────────────────────────────────────────

export async function leaveFamilyAccount({ user, userProfile, familyId, linkedPersonId = "", nextFamilyId = "" }) {
  if (!user?.uid) {
    throw new Error("Aucun compte connecte.");
  }
  if (!familyId) {
    throw new Error("Aucun foyer actif.");
  }

  await assertUserIsNotLastAdmin(familyId, user.uid);

  const resolvedPersonId = await resolveLinkedHouseholdProfileId(
    familyId,
    user.uid,
    linkedPersonId || userProfile?.linkedMemberIdsByHousehold?.[familyId] || "",
  );

  const batch = writeBatch(db);
  const userRef = doc(db, "users", user.uid);
  const nextFamilyIds = (userProfile?.familyIds || []).filter((id) => id && id !== familyId);
  const safeNextFamilyId = nextFamilyId && nextFamilyIds.includes(nextFamilyId) ? nextFamilyId : nextFamilyIds[0] || "";

  if (resolvedPersonId) {
    batch.set(
      doc(db, "families", familyId, "people", resolvedPersonId),
      {
        linkedAccountId: "",
        profileMode: "context",
        canCompleteTasks: false,
        role: "member",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  batch.delete(doc(db, "families", familyId, "members", user.uid));
  batch.set(
    userRef,
    {
      familyIds: arrayRemove(familyId),
      currentFamilyId: safeNextFamilyId,
      [`linkedMemberIdsByHousehold.${familyId}`]: deleteField(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(
    doc(db, "families", familyId),
    {
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
  return { nextFamilyId: safeNextFamilyId };
}

export async function deleteCurrentUserAccount({ user, userProfile, currentPassword = "" }) {
  if (!user?.uid || !auth.currentUser) {
    throw new Error("Aucun compte connecte.");
  }

  await reauthenticateCurrentUserForDeletion(currentPassword);

  const familyIds = [...new Set((userProfile?.familyIds || []).filter(Boolean))];

  const batch = writeBatch(db);
  const userRef = doc(db, "users", user.uid);
  const userUpdate = {
    currentFamilyId: "",
    updatedAt: serverTimestamp(),
  };

  if (familyIds.length) {
    userUpdate.familyIds = arrayRemove(...familyIds);
  }

  for (const familyId of familyIds) {
    userUpdate[`linkedMemberIdsByHousehold.${familyId}`] = deleteField();
    const resolvedPersonId = await resolveLinkedHouseholdProfileId(
      familyId,
      user.uid,
      userProfile?.linkedMemberIdsByHousehold?.[familyId] || "",
    );

    if (resolvedPersonId) {
      batch.set(
        doc(db, "families", familyId, "people", resolvedPersonId),
        {
          linkedAccountId: "",
          profileMode: "context",
          canCompleteTasks: false,
          role: "member",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }

    batch.delete(doc(db, "families", familyId, "members", user.uid));
    batch.set(
      doc(db, "families", familyId),
      {
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  batch.set(userRef, userUpdate, { merge: true });
  await batch.commit();
  await deleteUser(auth.currentUser);
  await signOut(auth).catch(() => {});
}

export async function discardCurrentUserDraftAccount(uid) {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error("Aucun brouillon de compte actif.");
  }
  // Ne pas avaler l'erreur : si deleteDoc échoue, on arrête ici pour éviter
  // un document Firestore orphelin (données sans compte Auth correspondant).
  await deleteDoc(doc(db, "users", uid));
  await deleteUser(auth.currentUser);
  await signOut(auth).catch(() => {}); // OK : deleteUser a déjà invalidé la session
}

// ── Mise à jour du profil ─────────────────────────────────────────────────

export async function saveDisplayName(uid, displayName, familyIds = []) {
  if (auth.currentUser?.uid === uid) {
    await updateProfile(auth.currentUser, {
      displayName: displayName.trim(),
    });
  }
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

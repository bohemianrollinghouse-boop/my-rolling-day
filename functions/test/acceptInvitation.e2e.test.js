/**
 * Test e2e — Cloud Function `acceptInvitation` (rejoindre un foyer via code).
 *
 * Tourne contre les émulateurs Firebase (Firestore + Auth + Functions) —
 * exécute le vrai code de functions/index.js, jamais la prod.
 *
 * Lancer avec :
 *   firebase emulators:exec --only firestore,auth,functions \
 *     "node functions/test/acceptInvitation.e2e.test.js"
 */

const assert = require("assert");
const { initializeApp: initAdminApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");

const { initializeApp } = require("firebase/app");
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require("firebase/auth");
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require("firebase/functions");

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "my-rolling-day";

if (!getApps().length) initAdminApp({ projectId: PROJECT_ID });
const db = getFirestore();
const adminAuth = getAdminAuth();

const clientApp = initializeApp({ apiKey: "fake-api-key-for-emulator", projectId: PROJECT_ID }, "e2e-client");
const clientAuth = getAuth(clientApp);
connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true });
const clientFunctions = getFunctions(clientApp, "europe-west1");
connectFunctionsEmulator(clientFunctions, "127.0.0.1", 5001);

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  OK    ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${error.message}`);
    failed += 1;
  }
}

let seedCounter = 0;
async function seedFamily({
  code,
  email = "",
  role = "member",
  linkedAccountId = "",
  expiresInMs = 7 * 24 * 60 * 60 * 1000,
} = {}) {
  seedCounter += 1;
  const familyRef = db.collection("families").doc();
  const personRef = familyRef.collection("people").doc();
  const invitationRef = familyRef.collection("invitations").doc();

  await familyRef.set({ name: `Foyer Test ${seedCounter}`, createdAt: FieldValue.serverTimestamp() });
  await personRef.set({
    displayName: "Membre Test",
    type: "adult",
    role,
    linkedAccountId,
    canCompleteTasks: false,
    profileMode: linkedAccountId ? "app_user" : "context",
  });
  await invitationRef.set({
    code,
    familyId: familyRef.id,
    familyName: `Foyer Test ${seedCounter}`,
    memberId: personRef.id,
    memberName: "Membre Test",
    email,
    role,
    status: "pending",
    createdBy: "admin-uid-test",
    expiresAt: new Date(Date.now() + expiresInMs),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { familyId: familyRef.id, personId: personRef.id, invitationId: invitationRef.id };
}

async function createAndSignIn(email) {
  const password = "test-password-123";
  const userRecord = await adminAuth.createUser({ email, password, emailVerified: true });
  await signInWithEmailAndPassword(clientAuth, email, password);
  return userRecord.uid;
}

function callAccept(inviteCode, extra = {}) {
  const acceptInvitation = httpsCallable(clientFunctions, "acceptInvitation");
  return acceptInvitation({ inviteCode, ...extra });
}

async function run() {
  console.log(`\nTest e2e — acceptInvitation (projet ${PROJECT_ID}, émulateurs)\n`);

  await test("join réussi : crée le membre, lie le profil, marque l'invitation acceptée", async () => {
    const code = "OKCODE1";
    const { familyId, personId } = await seedFamily({ code });
    const uid = await createAndSignIn("join-ok@example.com");

    const result = await callAccept(code);
    assert.strictEqual(result.data.familyId, familyId);
    assert.strictEqual(result.data.personId, personId);

    const memberSnap = await db.collection("families").doc(familyId).collection("members").doc(uid).get();
    assert.ok(memberSnap.exists, "le doc membre doit exister");
    assert.strictEqual(memberSnap.data().uid, uid);

    const personSnap = await db.collection("families").doc(familyId).collection("people").doc(personId).get();
    assert.strictEqual(personSnap.data().linkedAccountId, uid);
    assert.strictEqual(personSnap.data().profileMode, "app_user");
    assert.strictEqual(personSnap.data().canCompleteTasks, true);

    const userSnap = await db.collection("users").doc(uid).get();
    assert.ok((userSnap.data().familyIds || []).includes(familyId), "familyIds doit contenir le foyer");
    assert.strictEqual(userSnap.data().currentFamilyId, familyId);

    const invitationSnap = await db.collection("families").doc(familyId).collection("invitations")
      .where("code", "==", code).limit(1).get();
    assert.strictEqual(invitationSnap.docs[0].data().status, "accepted");
    assert.strictEqual(invitationSnap.docs[0].data().acceptedByUserId, uid);

    const joinEventsSnap = await db.collection("families").doc(familyId).collection("joinEvents")
      .where("joinerUid", "==", uid).get();
    assert.strictEqual(joinEventsSnap.size, 1, "un joinEvent doit être créé pour la notification");

    await signOut(clientAuth);
  });

  await test("code inconnu → not-found", async () => {
    await createAndSignIn("join-badcode@example.com");
    await assert.rejects(callAccept("DOESNOTEXIST"), (err) => {
      assert.strictEqual(err.code, "functions/not-found");
      return true;
    });
    await signOut(clientAuth);
  });

  await test("non authentifié → unauthenticated", async () => {
    await seedFamily({ code: "NOAUTH01" });
    await assert.rejects(callAccept("NOAUTH01"), (err) => {
      assert.strictEqual(err.code, "functions/unauthenticated");
      return true;
    });
  });

  await test("invitation réservée à une autre adresse email → permission-denied", async () => {
    const code = "EMAILRES";
    await seedFamily({ code, email: "quelquun-dautre@example.com" });
    await createAndSignIn("pas-le-bon-email@example.com");
    await assert.rejects(callAccept(code), (err) => {
      assert.strictEqual(err.code, "functions/permission-denied");
      return true;
    });
    await signOut(clientAuth);
  });

  await test("invitation expirée → failed-precondition", async () => {
    const code = "EXPIRED1";
    await seedFamily({ code, expiresInMs: -1000 });
    await createAndSignIn("join-expired@example.com");
    await assert.rejects(callAccept(code), (err) => {
      assert.strictEqual(err.code, "functions/failed-precondition");
      return true;
    });
    await signOut(clientAuth);
  });

  await test("profil déjà lié à un autre compte → failed-precondition (pas de membre fantôme créé)", async () => {
    const code = "LINKED01";
    const { familyId } = await seedFamily({ code, linkedAccountId: "un-autre-uid-deja-present" });
    const uid = await createAndSignIn("join-linked@example.com");
    await assert.rejects(callAccept(code), (err) => {
      assert.strictEqual(err.code, "functions/failed-precondition");
      return true;
    });
    const memberSnap = await db.collection("families").doc(familyId).collection("members").doc(uid).get();
    assert.strictEqual(memberSnap.exists, false, "aucun membre ne doit être créé si le join échoue");
    await signOut(clientAuth);
  });

  await test("ré-utiliser un code déjà accepté → failed-precondition", async () => {
    const code = "REUSE001";
    await seedFamily({ code });
    await createAndSignIn("join-first@example.com");
    await callAccept(code);
    await signOut(clientAuth);

    await createAndSignIn("join-second@example.com");
    await assert.rejects(callAccept(code), (err) => {
      assert.strictEqual(err.code, "functions/failed-precondition");
      return true;
    });
    await signOut(clientAuth);
  });

  console.log(`\n${passed} passé(s), ${failed} échoué(s)\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

run().catch((error) => {
  console.error("Erreur inattendue pendant les tests :", error);
  process.exitCode = 1;
});

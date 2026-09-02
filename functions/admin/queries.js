/**
 * Lectures agregees pour la console d'administration.
 *
 * `db` est passe en argument plutot qu'importe : les helpers de calcul sont
 * ainsi testables sans emulateur, et c'est la ou vivent les regles qu'on peut
 * se tromper (fenetre des semaines, detection de plateforme).
 *
 * Toutes ces lectures passent par l'Admin SDK, donc hors des regles Firestore.
 * C'est voulu — la console doit voir ce qu'un utilisateur ne voit pas — mais
 * cela veut dire que l'authentification de la fonction est la SEULE barriere.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Plateforme deduite du userAgent enregistre avec le jeton FCM.
 *
 * L'ordre compte : un iPad annonce parfois "Macintosh" avec du tactile, et
 * Android apparait aussi dans des userAgents contenant "Linux". On teste donc
 * du plus specifique au plus general.
 */
function platformFromUserAgent(userAgent) {
  const ua = String(userAgent || "").toLowerCase();
  if (!ua) return "inconnu";
  if (/\bandroid\b/.test(ua)) return "android";
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  // iPadOS 13+ se fait passer pour un Mac ; le tactile le trahit.
  if (/macintosh/.test(ua) && /mobile|touch/.test(ua)) return "ios";
  if (/macintosh|windows|linux|x11/.test(ua)) return "web";
  return "inconnu";
}

/** Lundi 00:00 (UTC) de la semaine contenant `date`. */
function weekStart(date) {
  const d = new Date(date);
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

/**
 * Repartit des horodatages en N semaines, de la plus ancienne a la semaine
 * courante. Les semaines sans inscription sont presentes avec un compte a zero
 * — sans elles, un graphe donnerait l'illusion d'une croissance continue.
 */
function bucketByWeek(timestamps, { weeks = 8, now = Date.now() } = {}) {
  const current = weekStart(now);
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    buckets.push({ start: current - i * WEEK_MS, count: 0 });
  }
  const oldest = buckets[0].start;
  for (const ts of timestamps) {
    if (typeof ts !== "number" || !Number.isFinite(ts) || ts < oldest) continue;
    const start = weekStart(ts);
    const bucket = buckets.find((b) => b.start === start);
    if (bucket) bucket.count += 1;
  }
  return buckets;
}

/** Millisecondes depuis un champ Firestore Timestamp, une Date, ou un nombre. */
function toMillis(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value._seconds === "number") return value._seconds * 1000;
  return null;
}

/** Poids approximatif d'un document, pour la jauge « volume de donnees ». */
function approximateSize(data) {
  try {
    return Buffer.byteLength(JSON.stringify(data ?? {}), "utf8");
  } catch (_error) {
    return 0;
  }
}

// ── Lectures ──────────────────────────────────────────────────────────────

async function fetchDashboard(db, { now = Date.now(), weeks = 8 } = {}) {
  const [usersSnap, familiesSnap, devicesSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("families").get(),
    db.collectionGroup("devices").get(),
  ]);

  const signups = bucketByWeek(
    usersSnap.docs.map((d) => toMillis(d.data().createdAt)).filter((v) => v !== null),
    { weeks, now },
  );

  const platforms = { ios: 0, android: 0, web: 0, inconnu: 0 };
  devicesSnap.docs.forEach((d) => { platforms[platformFromUserAgent(d.data().userAgent)] += 1; });

  const families = familiesSnap.docs.map((d) => d.data());
  const premiumCount = families.filter((f) => f.premium === true).length;

  const reports = await fetchReports(db, { limit: 8 });

  return {
    users: { total: usersSnap.size, signups },
    devices: { total: devicesSnap.size, platforms },
    families: {
      total: familiesSnap.size,
      premium: premiumCount,
      premiumShare: familiesSnap.size ? premiumCount / familiesSnap.size : 0,
    },
    reports,
    generatedAt: now,
  };
}

/** Les trois collections de retour utilisateur, fusionnees et datees. */
async function fetchReports(db, { limit = 20 } = {}) {
  const sources = [
    ["bug_reports", "bug"],
    ["feature_requests", "feature"],
    ["tester_feedback", "feedback"],
  ];
  const groups = await Promise.all(sources.map(async ([name, kind]) => {
    const snap = await db.collection(name).get();
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id, kind,
        message: String(data.message || data.text || data.description || ""),
        email: String(data.email || ""),
        createdAt: toMillis(data.createdAt),
      };
    });
  }));
  return groups.flat()
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);
}

async function fetchUsers(db, { search = "", limit = 200 } = {}) {
  const snap = await db.collection("users").get();
  const needle = String(search || "").trim().toLowerCase();
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        email: String(data.email || ""),
        displayName: String(data.displayName || ""),
        createdAt: toMillis(data.createdAt),
      };
    })
    // Recherche cote serveur sur nom et e-mail : Firestore ne sait pas faire de
    // « contient », et le parc reste petit — un index texte serait premature.
    .filter((u) => !needle
      || u.email.toLowerCase().includes(needle)
      || u.displayName.toLowerCase().includes(needle))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, limit);
}

async function fetchUserDetail(db, uid) {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) return null;
  const user = { uid, ...userDoc.data(), createdAt: toMillis(userDoc.data().createdAt) };

  // Le lien utilisateur -> foyer passe par la sous-collection members.
  const memberships = await db.collectionGroup("members").get();
  const familyIds = memberships.docs
    .filter((d) => d.id === uid)
    .map((d) => d.ref.parent.parent && d.ref.parent.parent.id)
    .filter(Boolean);

  const families = await Promise.all(familyIds.map(async (familyId) => {
    const [famDoc, membersSnap, peopleSnap, plannerDoc, invitesSnap] = await Promise.all([
      db.collection("families").doc(familyId).get(),
      db.collection("families").doc(familyId).collection("members").get(),
      db.collection("families").doc(familyId).collection("people").get(),
      db.collection("families").doc(familyId).collection("planner").doc("state").get(),
      db.collection("invitations").where("familyId", "==", familyId).get(),
    ]);
    const state = plannerDoc.exists ? plannerDoc.data() : {};
    const inner = state && state.data ? state.data : state;
    const devices = [];
    await Promise.all(membersSnap.docs.map(async (m) => {
      const snap = await m.ref.collection("devices").get();
      snap.docs.forEach((d) => devices.push({
        id: d.id, memberUid: m.id,
        platform: platformFromUserAgent(d.data().userAgent),
        notificationsEnabled: d.data().notificationsEnabled === true,
        lastSeenAt: toMillis(d.data().lastSeenAt),
      }));
    }));
    const fam = famDoc.exists ? famDoc.data() : {};
    return {
      id: familyId,
      name: String(fam.name || ""),
      premium: fam.premium === true,
      premiumProductId: String(fam.premiumProductId || ""),
      createdAt: toMillis(fam.createdAt),
      members: membersSnap.docs.map((d) => ({ uid: d.id, role: String(d.data().role || "") })),
      people: peopleSnap.docs.map((d) => ({ id: d.id, name: String(d.data().displayName || d.data().name || "") })),
      invitations: invitesSnap.docs.map((d) => ({
        id: d.id, code: String(d.data().code || ""),
        memberName: String(d.data().memberName || ""),
        createdAt: toMillis(d.data().createdAt),
      })),
      devices,
      volume: {
        bytes: approximateSize(state),
        tasks: (inner.tasks || []).length,
        recipes: (inner.recipes || []).length,
        agenda: (inner.agenda || []).length,
        lists: (inner.lists || []).length,
        inventory: (inner.inventory || []).length,
      },
    };
  }));

  return { user, families };
}

module.exports = {
  WEEK_MS,
  platformFromUserAgent, weekStart, bucketByWeek, toMillis, approximateSize,
  fetchDashboard, fetchReports, fetchUsers, fetchUserDetail,
};
